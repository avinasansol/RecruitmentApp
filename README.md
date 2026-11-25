# RecruitmentApp

A local recruitment management app with a React frontend and Flask API backed by SQLite.

## Run locally on Windows

Install Python and Node.js for development. Open two terminals from the project folder.

### Backend terminal

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

The backend runs with Waitress on `http://127.0.0.1:5001` and is only accessible from the local computer.

### Frontend terminal

```powershell
npm install
npm run dev
```

Open the Vite address printed in the terminal, usually `http://localhost:5173`.

## Run locally on macOS or Linux

### Backend terminal

```sh
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

### Frontend terminal

```sh
npm install
npm run dev
```

Open the Vite address printed in the terminal, usually `http://localhost:5173`.

## Data location

For local development, the SQLite database is `backend/recruitment.db`; uploaded CVs are stored in `backend/uploads/cvs/`. These files remain on the computer when the app is stopped.

## Build the frontend

```sh
npm run build
```

The generated static files are placed in `dist/`.

## Windows installer

The Windows installer is built by the GitHub Actions workflow when changes are
pushed to `main`, or when the workflow is started manually from GitHub. It
bundles the backend and frontend, so the person installing it does not need
Python or Node.js. The installer creates a desktop shortcut and starts the app
in the default browser.

The packaged app stores its SQLite database at
`C:\RecruitmentApp\Data\recruitment.db` and uploaded CVs under
`C:\RecruitmentApp\Data\CVs`. A new installation starts with a blank
database. These files are outside the installation folder, so uninstalling or
updating the app does not remove them.

After a successful workflow run, download `RecruitmentApp-Windows-Installer`
from that run's **Artifacts** section. The artifact contains
`RecruitmentApp-Setup.exe` and is retained for 90 days.
