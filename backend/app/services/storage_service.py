import os
import shutil
from pathlib import Path
from PIL import Image
from ..config import settings

class StorageService:
    @staticmethod
    def save_upload_file(file_obj, filename: str, doc_id: str) -> tuple[str, int, str]:
        """
        Saves uploaded file securely to uploads folder.
        Returns (relative_storage_path, file_size, thumbnail_path)
        """
        safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ")
        ext = Path(safe_name).suffix.lower()
        stored_filename = f"{doc_id}{ext}"
        target_path = settings.UPLOAD_DIR / stored_filename

        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file_obj, buffer)

        file_size = os.path.getsize(target_path)
        
        # Generate thumbnail
        thumb_filename = f"{doc_id}_thumb.webp"
        thumb_path = settings.UPLOAD_DIR / thumb_filename
        thumbnail_saved = StorageService.generate_thumbnail(target_path, thumb_path, ext)

        return (
            str(target_path.relative_to(settings.BASE_DIR)),
            file_size,
            str(thumb_path.relative_to(settings.BASE_DIR)) if thumbnail_saved else None
        )

    @staticmethod
    def generate_thumbnail(source_path: Path, thumb_path: Path, ext: str) -> bool:
        try:
            if ext in [".jpg", ".jpeg", ".png", ".webp"]:
                with Image.open(source_path) as img:
                    img.thumbnail((320, 320))
                    img.save(thumb_path, "WEBP", quality=85)
                return True
            elif ext == ".pdf":
                try:
                    import pypdfium2 as pdfium
                    pdf = pdfium.PdfDocument(str(source_path))
                    page = pdf[0]
                    img = page.render(scale=1.5).to_pil()
                    img.thumbnail((320, 420))
                    img.save(thumb_path, "WEBP", quality=85)
                    return True
                except Exception as pdf_err:
                    print(f"pypdfium2 thumbnail error: {pdf_err}")
                    img = Image.new("RGB", (320, 420), color="#f8fafc")
                    img.save(thumb_path, "WEBP", quality=85)
                    return True
        except Exception as e:
            print(f"Thumbnail generation error: {e}")
        return False

    @staticmethod
    def get_absolute_path(relative_path: str) -> Path:
        return settings.BASE_DIR / relative_path

    @staticmethod
    def delete_file(relative_path: str):
        if not relative_path:
            return
        abs_path = settings.BASE_DIR / relative_path
        if abs_path.exists():
            try:
                os.remove(abs_path)
            except Exception as e:
                print(f"Error deleting file {abs_path}: {e}")
