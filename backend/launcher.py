"""Start the packaged local server and open the RecruitmentApp UI."""

from __future__ import annotations

import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path


APP_URL = "http://127.0.0.1:5001/"
HEALTH_URL = "http://127.0.0.1:5001/api/health"
STARTUP_TIMEOUT_SECONDS = 30


def is_server_ready() -> bool:
    try:
        with urllib.request.urlopen(HEALTH_URL, timeout=1) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def show_error(message: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(0, message, "RecruitmentApp", 0x10)
    else:
        print(message, file=sys.stderr)


def main() -> int:
    if not getattr(sys, "frozen", False):
        show_error("Run RecruitmentApp from its installed Windows shortcut.")
        return 1

    app_dir = Path(sys.executable).resolve().parent
    server_exe = app_dir / "server" / "RecruitmentAppServer.exe"

    if not server_exe.is_file():
        show_error(
            "RecruitmentApp could not find its server files. "
            "Please run the installer again or contact support."
        )
        return 1

    if not is_server_ready():
        try:
            subprocess.Popen(
                [str(server_exe)],
                cwd=str(server_exe.parent),
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
                close_fds=True,
            )
        except OSError as error:
            show_error(f"RecruitmentApp could not start: {error}")
            return 1

    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if is_server_ready():
            webbrowser.open(APP_URL)
            return 0
        time.sleep(0.25)

    show_error(
        "RecruitmentApp did not finish starting. Restart the app and try again."
    )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
