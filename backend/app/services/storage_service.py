import logging
import os
from pathlib import Path
from typing import Optional

from PIL import Image

from ..config import settings

logger = logging.getLogger(__name__)

# Magic bytes used to verify that the uploaded content really is what the extension claims.
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
_PIL_FORMAT_FOR_EXT = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}


class FileTooLargeError(ValueError):
    pass


class InvalidFileContentError(ValueError):
    pass


class StorageService:
    @staticmethod
    def save_upload_file(file_obj, filename: str, doc_id: str) -> tuple[str, int, Optional[str]]:
        """
        Streams the upload to the uploads folder, enforcing the size limit while writing
        (so an oversized upload is cut off instead of being written to disk in full) and
        verifying the content matches the extension.
        Returns (relative_storage_path, file_size, thumbnail_path_or_None).
        """
        ext = Path(filename or "").suffix.lower()
        stored_filename = f"{doc_id}{ext}"
        target_path = settings.UPLOAD_DIR / stored_filename
        max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

        written = 0
        try:
            with open(target_path, "wb") as buffer:
                while True:
                    chunk = file_obj.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > max_bytes:
                        raise FileTooLargeError(
                            f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB"
                        )
                    buffer.write(chunk)

            if written == 0:
                raise InvalidFileContentError("Uploaded file is empty")

            StorageService.verify_content(target_path, ext)
        except Exception:
            StorageService._remove_quietly(target_path)
            raise

        # Generate thumbnail
        thumb_filename = f"{doc_id}_thumb.webp"
        thumb_path = settings.UPLOAD_DIR / thumb_filename
        thumbnail_saved = StorageService.generate_thumbnail(target_path, thumb_path, ext)

        return (
            str(target_path.relative_to(settings.BASE_DIR)) if StorageService._is_under_base(target_path) else str(target_path),
            written,
            (str(thumb_path.relative_to(settings.BASE_DIR)) if StorageService._is_under_base(thumb_path) else str(thumb_path)) if thumbnail_saved else None,
        )

    @staticmethod
    def _is_under_base(path: Path) -> bool:
        try:
            path.relative_to(settings.BASE_DIR)
            return True
        except ValueError:
            return False

    @staticmethod
    def verify_content(path: Path, ext: str) -> None:
        """Raises InvalidFileContentError when the bytes don't match the declared extension."""
        if ext == ".pdf":
            with open(path, "rb") as f:
                head = f.read(1024)
            if b"%PDF" not in head:
                raise InvalidFileContentError("File is not a valid PDF document")
            return
        if ext in _IMAGE_EXTS:
            try:
                with Image.open(path) as img:
                    img.verify()
                with Image.open(path) as img:
                    fmt = (img.format or "").upper()
            except Exception as exc:
                raise InvalidFileContentError("File is not a valid image") from exc
            expected = _PIL_FORMAT_FOR_EXT.get(ext)
            # Accept any raster format PIL recognises (phones sometimes mislabel JPEG/PNG/WebP)
            if fmt not in {"JPEG", "PNG", "WEBP", "MPO"}:
                raise InvalidFileContentError(f"Image format {fmt or 'unknown'} is not supported (expected {expected})")

    @staticmethod
    def generate_thumbnail(source_path: Path, thumb_path: Path, ext: str) -> bool:
        try:
            if ext in _IMAGE_EXTS:
                with Image.open(source_path) as img:
                    img = img.convert("RGB")
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
                    logger.warning("pypdfium2 thumbnail error: %s", pdf_err)
                    img = Image.new("RGB", (320, 420), color="#f8fafc")
                    img.save(thumb_path, "WEBP", quality=85)
                    return True
        except Exception as e:
            logger.warning("Thumbnail generation error: %s", e)
        return False

    @staticmethod
    def get_absolute_path(relative_path: str) -> Path:
        p = Path(relative_path)
        return p if p.is_absolute() else settings.BASE_DIR / relative_path

    @staticmethod
    def _remove_quietly(abs_path: Path) -> None:
        try:
            if abs_path.exists():
                os.remove(abs_path)
        except Exception as e:
            logger.warning("Error deleting file %s: %s", abs_path, e)

    @staticmethod
    def delete_file(relative_path: Optional[str]):
        if not relative_path:
            return
        StorageService._remove_quietly(StorageService.get_absolute_path(relative_path))
