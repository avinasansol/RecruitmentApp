import os
import sys
from pathlib import Path


IS_PACKAGED = bool(getattr(sys, "frozen", False))
_source_backend_dir = Path(__file__).resolve().parent
_configured_data_dir = os.environ.get("RECRUITMENTAPP_DATA_DIR")

if _configured_data_dir:
    APP_DATA_DIR = Path(_configured_data_dir).expanduser()
elif IS_PACKAGED and os.name == "nt":
    APP_DATA_DIR = Path(r"C:\RecruitmentApp\Data")
else:
    APP_DATA_DIR = _source_backend_dir

APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_PATH = APP_DATA_DIR / "recruitment.db"

if IS_PACKAGED or _configured_data_dir:
    CV_UPLOAD_FOLDER = APP_DATA_DIR / "CVs"
else:
    CV_UPLOAD_FOLDER = _source_backend_dir / "uploads" / "cvs"
