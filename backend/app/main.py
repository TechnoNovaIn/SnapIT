import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from .config import settings
from .database import engine, Base
from .routers import documents, export, settings as settings_router, sync

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("snapit")

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="SnapIT - AI-Powered Smart Document & Receipt Clipper API"
)

# CORS: configurable through CORS_ORIGINS (comma separated). Defaults to "*" for local/dev use.
# Credentials are never allowed, so a wildcard origin cannot leak cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Include API routers
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(sync.router, prefix=settings.API_V1_STR)
app.include_router(export.router, prefix=settings.API_V1_STR)
app.include_router(settings_router.router, prefix=settings.API_V1_STR)


@app.get("/health")
@app.get(f"{settings.API_V1_STR}/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }


# Mount static frontend build if dist folder exists (Single-Server Web App support)
dist_dir = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@app.exception_handler(404)
async def custom_404_handler(request, exc):
    # API routes answer with JSON; everything else falls back to the SPA entry point so
    # client-side routes (e.g. /?shared=token) work on a hard refresh.
    if request.url.path.startswith(settings.API_V1_STR):
        return JSONResponse(status_code=404, content={"detail": "Not Found"})
    index_file = dist_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return JSONResponse(status_code=404, content={"detail": "Not Found"})


if dist_dir.exists() and (dist_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="static_frontend")
else:
    logger.info("frontend/dist not found; API-only mode (run the Vite dev server for the UI)")
