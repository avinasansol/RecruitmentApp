from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from xml.etree import ElementTree
from zipfile import ZipFile

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from docx import Document
from pypdf import PdfReader

from database import initialize_database, get_db_connection

MAX_CV_FILE_SIZE_BYTES = 10 * 1024 * 1024
MULTIPART_OVERHEAD_LIMIT_BYTES = 1024 * 1024


def normalize_phone(phone):
    return "".join(char for char in phone if char.isdigit())

def normalize_email(email):
    return email.strip().lower()


def utc_timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = (
    MAX_CV_FILE_SIZE_BYTES + MULTIPART_OVERHEAD_LIMIT_BYTES
)
CORS(
    app,
    resources={r"/api/*": {"origins": [
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ]}},
    supports_credentials=False
)

initialize_database()

CV_UPLOAD_FOLDER = Path(__file__).parent / "uploads" / "cvs"
ALLOWED_CV_EXTENSIONS = {".pdf", ".docx"}
CANDIDATE_WITH_LATEST_APPLICATION_QUERY = """
    SELECT
        candidate.id,
        candidate.name,
        candidate.phone,
        candidate.email,
        latest_cv_application.id AS latest_cv_application_id,
        latest_cv_application.cv_filename,
        COALESCE(application.position, candidate.position) AS position,
        COALESCE(status_event.status, candidate.status) AS status,
        COALESCE(application.remarks, candidate.remarks) AS remarks,
        candidate.created_at
    FROM candidates AS candidate
    LEFT JOIN applications AS application
        ON application.id = (
            SELECT latest_application.id
            FROM applications AS latest_application
            WHERE latest_application.candidate_id = candidate.id
            ORDER BY latest_application.applied_at DESC
            LIMIT 1
        )
    LEFT JOIN application_status_events AS status_event
        ON status_event.id = (
            SELECT latest_event.id
            FROM application_status_events AS latest_event
            WHERE latest_event.application_id = application.id
            ORDER BY latest_event.changed_at DESC
            LIMIT 1
        )
    LEFT JOIN applications AS latest_cv_application
        ON latest_cv_application.id = (
            SELECT latest_cv.id
            FROM applications AS latest_cv
            WHERE latest_cv.candidate_id = candidate.id
                AND latest_cv.cv_filename IS NOT NULL
            ORDER BY latest_cv.applied_at DESC
            LIMIT 1
        )
"""


def get_candidate_with_latest_application(connection, candidate_id):
    return connection.execute(
        CANDIDATE_WITH_LATEST_APPLICATION_QUERY + " WHERE candidate.id = ?",
        (candidate_id,),
    ).fetchone()


def get_latest_application_state(connection, candidate_id):
    return connection.execute("""
        SELECT
            application.id,
            application.position,
            application.remarks,
            COALESCE(status_event.status, candidate.status) AS status
        FROM applications AS application
        JOIN candidates AS candidate ON candidate.id = application.candidate_id
        LEFT JOIN application_status_events AS status_event
            ON status_event.id = (
                SELECT latest_event.id
                FROM application_status_events AS latest_event
                WHERE latest_event.application_id = application.id
                ORDER BY latest_event.changed_at DESC
                LIMIT 1
            )
        WHERE application.candidate_id = ?
        ORDER BY application.applied_at DESC
        LIMIT 1
    """, (candidate_id,)).fetchone()


def safe_filename_part(value):
    cleaned = re.sub(r"[^A-Za-z0-9@._+-]", "_", value.strip())
    return re.sub(r"\.{2,}", ".", cleaned).strip("._")


def get_uploaded_file_size(uploaded_file):
    stream = uploaded_file.stream
    current_position = stream.tell()
    stream.seek(0, 2)
    file_size = stream.tell()
    stream.seek(current_position)
    return file_size


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "CV file must be 10 MB or smaller."}), 413


def extract_resume_text(uploaded_file, extension):
    stream = uploaded_file.stream
    stream.seek(0)
    header = stream.read(1024)
    stream.seek(0)

    if extension == ".pdf":
        if b"%PDF-" not in header:
            raise ValueError("The file does not have a PDF signature.")
        reader = PdfReader(stream)
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
        stream.seek(0)
        return text

    if extension != ".docx":
        raise ValueError("Unsupported document type.")

    try:
        with ZipFile(stream) as archive:
            names = set(archive.namelist())
            if "[Content_Types].xml" not in names or "word/document.xml" not in names:
                raise ValueError("The file is not a Word document.")
            content_types = ElementTree.fromstring(archive.read("[Content_Types].xml"))
            is_word_document = any(
                item.attrib.get("ContentType")
                == "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
                for item in content_types
            )
            if not is_word_document:
                raise ValueError("The file is not a DOCX document.")
    finally:
        stream.seek(0)

    document = Document(stream)
    text_parts = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            text_parts.extend(cell.text for cell in row.cells)
    stream.seek(0)
    return "\n".join(text_parts)


def extract_resume_details(text):
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.IGNORECASE)
    phone = ""
    for match in re.finditer(r"(?<!\w)\+?\d[\d\s().-]{5,}\d(?!\w)", text):
        candidate_phone = match.group().strip()
        digit_count = sum(character.isdigit() for character in candidate_phone)
        if 7 <= digit_count <= 15:
            phone = candidate_phone
            break

    ignored_name_lines = {"resume", "curriculum vitae", "cv", "contact", "profile"}
    name = ""
    for line in text.splitlines()[:20]:
        candidate = re.sub(r"\s+", " ", line).strip(" \t|,;:-")
        words = candidate.split()
        if (
            2 <= len(words) <= 4
            and candidate.lower() not in ignored_name_lines
            and not re.search(r"[@\d]", candidate)
            and all(re.fullmatch(r"[A-Za-z][A-Za-z.'-]*", word) for word in words)
        ):
            name = candidate
            break

    return {
        "name": name,
        "email": email_match.group(0) if email_match else "",
        "phone": phone,
    }

@app.route("/")
def home():
    return jsonify({
        "message": "Recruitment Backend is running!"
    })


@app.route("/api/health")
def health_check():
    return jsonify({
        "status": "success",
        "message": "Backend is healthy"
    })


@app.route("/api/cvs", methods=["POST"])
def upload_cv():
    uploaded_file = request.files.get("file")
    name = request.form.get("name", "").strip()
    email = normalize_email(request.form.get("email", ""))
    phone = request.form.get("phone", "").strip()
    position = request.form.get("position", "").strip()
    candidate_id_value = request.form.get("candidate_id", "").strip()

    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Choose a CV file to upload."}), 400
    if get_uploaded_file_size(uploaded_file) > MAX_CV_FILE_SIZE_BYTES:
        return jsonify({"error": "CV file must be 10 MB or smaller."}), 413
    if not name or not email or not phone or not position:
        return jsonify({"error": "Name, email, phone, and position are required to upload the CV."}), 400
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        return jsonify({"error": "Enter a valid email address."}), 400
    if not re.fullmatch(r"\+?[0-9\s\-().]{7,20}", phone) or not 7 <= len(normalize_phone(phone)) <= 15:
        return jsonify({"error": "Enter a valid phone number."}), 400

    extension = Path(uploaded_file.filename).suffix.lower()
    if extension not in ALLOWED_CV_EXTENSIONS:
        return jsonify({"error": "Only PDF and DOCX files are supported."}), 400
    try:
        extract_resume_text(uploaded_file, extension)
    except Exception:
        return jsonify({
            "error": "The file contents do not match a readable PDF or DOCX file."
        }), 422

    safe_email = safe_filename_part(email)
    safe_name = safe_filename_part(name.replace(" ", "_"))
    if not safe_email or not safe_name:
        return jsonify({"error": "Name or email cannot be used in a filename."}), 400

    CV_UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    connection = get_db_connection()
    destination = None
    try:
        connection.execute("BEGIN IMMEDIATE")

        if candidate_id_value:
            try:
                candidate_id = int(candidate_id_value)
            except ValueError:
                return jsonify({"error": "Invalid candidate reference."}), 400

            candidate = connection.execute(
                "SELECT id, email_normalized, phone_normalized FROM candidates WHERE id = ?",
                (candidate_id,),
            ).fetchone()
            if candidate is None:
                return jsonify({"error": "The selected candidate no longer exists."}), 404
            if (
                candidate["email_normalized"] != email
                and candidate["phone_normalized"] != normalize_phone(phone)
            ):
                return jsonify({"error": "The uploaded details do not match the selected candidate."}), 409
            connection.execute(
                "UPDATE candidates SET name = ? WHERE id = ?",
                (name, candidate_id),
            )
        else:
            email_matches = {
                candidate["id"] for candidate in connection.execute(
                    "SELECT id FROM candidates WHERE email_normalized = ?", (email,)
                ).fetchall()
            }
            phone_matches = {
                candidate["id"] for candidate in connection.execute(
                    "SELECT id FROM candidates WHERE phone_normalized = ?",
                    (normalize_phone(phone),),
                ).fetchall()
            }
            matching_ids = email_matches | phone_matches
            if matching_ids:
                if email_matches and phone_matches and email_matches != phone_matches:
                    message = "Email and phone match different candidates. Review the conflict and try again."
                else:
                    message = "An existing candidate matched during upload. Check the candidate before continuing."
                return jsonify({"error": message}), 409

            cursor = connection.execute("""
                INSERT INTO candidates (
                    name, phone, email, position, status, remarks,
                    email_normalized, phone_normalized
                ) VALUES (?, ?, ?, ?, 'New', '', ?, ?)
            """, (name, phone, email, position, email, normalize_phone(phone)))
            candidate_id = cursor.lastrowid

        timestamp_value = datetime.now(timezone.utc)
        while True:
            timestamp = timestamp_value.strftime("%Y%m%dT%H%M%S%fZ")
            database_timestamp = timestamp_value.isoformat(
                timespec="microseconds"
            ).replace("+00:00", "Z")
            filename = f"{safe_email}_{timestamp}_{safe_name}{extension}"
            destination = CV_UPLOAD_FOLDER / filename
            try:
                with destination.open("xb") as target:
                    uploaded_file.save(target)
                break
            except FileExistsError:
                timestamp_value += timedelta(microseconds=1)

        application_cursor = connection.execute("""
            INSERT INTO applications (candidate_id, position, remarks, cv_filename, applied_at)
            VALUES (?, ?, '', ?, ?)
        """, (candidate_id, position, filename, database_timestamp))
        connection.execute("""
            INSERT INTO application_status_events (application_id, status, changed_at)
            VALUES (?, 'New', ?)
        """, (application_cursor.lastrowid, database_timestamp))
        connection.execute("""
            UPDATE candidates SET position = ?, status = 'New', remarks = ''
            WHERE id = ?
        """, (position, candidate_id))
        connection.commit()

        return jsonify({
            "message": "CV uploaded and linked to an application.",
            "candidate_id": candidate_id,
            "application_id": application_cursor.lastrowid,
            "filename": filename,
            "uploaded_at": database_timestamp,
            "position": position,
        }), 201
    except Exception:
        connection.rollback()
        if destination is not None:
            destination.unlink(missing_ok=True)
        return jsonify({"error": "The CV could not be saved. Please retry the upload."}), 500
    finally:
        connection.close()


@app.route("/api/cvs/extract", methods=["POST"])
def extract_cv_details():
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return jsonify({"error": "Choose a CV file to extract."}), 400
    if get_uploaded_file_size(uploaded_file) > MAX_CV_FILE_SIZE_BYTES:
        return jsonify({"error": "CV file must be 10 MB or smaller."}), 413

    extension = Path(uploaded_file.filename).suffix.lower()
    if extension not in ALLOWED_CV_EXTENSIONS:
        return jsonify({"error": "Only PDF and DOCX files are supported."}), 400

    try:
        text = extract_resume_text(uploaded_file, extension)
    except Exception:
        return jsonify({
            "error": "The file contents do not match a readable PDF or DOCX file."
        }), 422

    details = extract_resume_details(text)
    details["warning"] = "" if any(details.values()) else "No details could be extracted from this file."
    return jsonify(details), 200


@app.route("/api/candidates", methods=["GET"])
def get_candidates():
    connection = get_db_connection()

    candidates = connection.execute(
        CANDIDATE_WITH_LATEST_APPLICATION_QUERY
        + " ORDER BY julianday(candidate.created_at) DESC, candidate.id DESC"
    ).fetchall()

    connection.close()

    candidates_list = [dict(candidate) for candidate in candidates]

    return jsonify(candidates_list)


@app.route("/api/candidates/paginated", methods=["GET"])
def get_candidates_paginated():
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "25"))
    except ValueError:
        return jsonify({"error": "Page and page_size must be whole numbers."}), 400

    if page < 1:
        return jsonify({"error": "Page must be greater than zero."}), 400
    if page_size < 1 or page_size > 100:
        return jsonify({"error": "page_size must be between 1 and 100."}), 400

    search = request.args.get("search", "").strip()
    status_filter = request.args.get("status", "").strip()
    position_filter = request.args.get("position", "").strip()
    filters = []
    filter_parameters = []
    if search:
        escaped_search = (
            search.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        search_pattern = f"%{escaped_search}%"
        filters.append("""
            (
                LOWER(candidate.name) LIKE LOWER(?) ESCAPE '\\'
                OR LOWER(candidate.email) LIKE LOWER(?) ESCAPE '\\'
                OR LOWER(candidate.phone) LIKE LOWER(?) ESCAPE '\\'
            )
        """)
        filter_parameters.extend([search_pattern] * 3)
    if status_filter and status_filter != "All":
        filters.append("candidate.status = ?")
        filter_parameters.append(status_filter)
    if position_filter and position_filter != "All":
        filters.append("candidate.position = ?")
        filter_parameters.append(position_filter)

    candidate_query = f"({CANDIDATE_WITH_LATEST_APPLICATION_QUERY}) AS candidate"
    where_clause = f" WHERE {' AND '.join(filters)}" if filters else ""

    connection = get_db_connection()
    try:
        total = connection.execute(
            f"SELECT COUNT(*) AS total FROM {candidate_query}{where_clause}",
            filter_parameters,
        ).fetchone()["total"]
        positions = connection.execute(
            f"SELECT DISTINCT position FROM {candidate_query} "
            "ORDER BY position COLLATE NOCASE"
        ).fetchall()
        total_pages = (total + page_size - 1) // page_size
        if page > total_pages:
            candidates = []
        else:
            offset = (page - 1) * page_size
            candidates = connection.execute(
                f"SELECT * FROM {candidate_query}{where_clause} "
                "ORDER BY julianday(candidate.created_at) DESC, candidate.id DESC "
                "LIMIT ? OFFSET ?",
                (*filter_parameters, page_size, offset),
            ).fetchall()
    finally:
        connection.close()

    return jsonify({
        "candidates": [dict(candidate) for candidate in candidates],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": total_pages,
        "positions": [row["position"] for row in positions],
    }), 200


@app.route("/api/dashboard/summary", methods=["GET"])
def get_dashboard_summary():
    connection = get_db_connection()
    total_candidates = connection.execute(
        "SELECT COUNT(*) AS total FROM candidates"
    ).fetchone()["total"]
    status_rows = connection.execute(f"""
        SELECT status, COUNT(*) AS count
        FROM ({CANDIDATE_WITH_LATEST_APPLICATION_QUERY}) AS latest_candidates
        GROUP BY status
    """).fetchall()
    recent_rows = connection.execute(
        CANDIDATE_WITH_LATEST_APPLICATION_QUERY +
        " ORDER BY candidate.id DESC LIMIT 5"
    ).fetchall()
    connection.close()

    return jsonify({
        "total_candidates": total_candidates,
        "status_counts": {row["status"]: row["count"] for row in status_rows},
        "recent_candidates": [
            {
                "id": row["id"],
                "name": row["name"],
                "position": row["position"],
                "status": row["status"],
            }
            for row in recent_rows
        ],
    }), 200


@app.route("/api/candidates/<int:candidate_id>/applications", methods=["GET"])
def get_candidate_applications(candidate_id):
    connection = get_db_connection()
    candidate = connection.execute(
        "SELECT id FROM candidates WHERE id = ?",
        (candidate_id,),
    ).fetchone()
    if candidate is None:
        connection.close()
        return jsonify({"error": "Candidate not found."}), 404

    applications = connection.execute("""
        SELECT id, candidate_id, position, remarks, cv_filename, applied_at
        FROM applications
        WHERE candidate_id = ?
        ORDER BY applied_at DESC
    """, (candidate_id,)).fetchall()

    result = []
    for application in applications:
        item = dict(application)
        item["status_events"] = [dict(event) for event in connection.execute("""
            SELECT id, status, changed_at, remarks
            FROM application_status_events
            WHERE application_id = ?
            ORDER BY changed_at ASC
        """, (application["id"],)).fetchall()]
        item["status"] = (
            item["status_events"][-1]["status"] if item["status_events"] else "Unknown"
        )
        result.append(item)

    connection.close()
    return jsonify({"applications": result}), 200


@app.route("/api/applications/<int:application_id>/cv", methods=["GET"])
def download_application_cv(application_id):
    connection = get_db_connection()
    application = connection.execute(
        "SELECT cv_filename FROM applications WHERE id = ?",
        (application_id,),
    ).fetchone()
    connection.close()

    if application is None or not application["cv_filename"]:
        return jsonify({"error": "No CV is linked to this application."}), 404
    return send_from_directory(
        CV_UPLOAD_FOLDER,
        application["cv_filename"],
        as_attachment=True,
        download_name=application["cv_filename"],
    )


@app.route("/api/candidates/match", methods=["POST"])
def match_candidates():
    data = request.get_json(silent=True) or {}
    email = normalize_email(data.get("email", ""))
    phone = normalize_phone(data.get("phone", ""))
    if not email and not phone:
        return jsonify({"error": "Provide an email or phone number to check."}), 400

    connection = get_db_connection()
    email_candidates = connection.execute(
        CANDIDATE_WITH_LATEST_APPLICATION_QUERY
        + " WHERE candidate.email_normalized = ?",
        (email,),
    ).fetchall() if email else []
    phone_candidates = connection.execute(
        CANDIDATE_WITH_LATEST_APPLICATION_QUERY
        + " WHERE candidate.phone_normalized = ?",
        (phone,),
    ).fetchall() if phone else []
    connection.close()

    email_matches = [
        {"id": candidate["id"], "name": candidate["name"], "status": candidate["status"]}
        for candidate in email_candidates
    ]
    phone_matches = [
        {"id": candidate["id"], "name": candidate["name"], "status": candidate["status"]}
        for candidate in phone_candidates
    ]

    return jsonify({"email_matches": email_matches, "phone_matches": phone_matches}), 200

@app.route("/api/candidates", methods=["POST"])
def add_candidate():
    data = request.get_json()

    if not data:
        return jsonify({
            "error": "Invalid request data"
        }), 400

    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip()
    position = data.get("position", "").strip()
    status = data.get("status", "New")
    remarks = data.get("remarks", "")

    if not name or not phone or not email or not position:
        return jsonify({
            "error": "Name, phone, email and position are required"
        }), 400

    connection = get_db_connection()

    normalized_email = normalize_email(email)
    normalized_phone = normalize_phone(phone)

    if connection.execute(
        "SELECT 1 FROM candidates WHERE email_normalized = ? LIMIT 1",
        (normalized_email,),
    ).fetchone():
        connection.close()
        return jsonify({"error": "A candidate with this email already exists"}), 409

    if connection.execute(
        "SELECT 1 FROM candidates WHERE phone_normalized = ? LIMIT 1",
        (normalized_phone,),
    ).fetchone():
        connection.close()
        return jsonify({"error": "A candidate with this phone number already exists"}), 409

    cursor = connection.execute("""
        INSERT INTO candidates
        (name, phone, email, position, status, remarks, email_normalized, phone_normalized)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        name, phone, email, position, status, remarks,
        normalized_email, normalized_phone,
    ))
    candidate_id = cursor.lastrowid
    now = utc_timestamp()
    application_cursor = connection.execute("""
        INSERT INTO applications (candidate_id, position, remarks, applied_at)
        VALUES (?, ?, ?, ?)
    """, (candidate_id, position, remarks, now))
    connection.execute("""
        INSERT INTO application_status_events (application_id, status, changed_at)
        VALUES (?, ?, ?)
    """, (application_cursor.lastrowid, status, now))
    connection.commit()

    candidate = get_candidate_with_latest_application(connection, candidate_id)

    connection.close()

    return jsonify(dict(candidate)), 201

@app.route("/api/candidates/<int:candidate_id>", methods=["PUT"])
def update_candidate(candidate_id):
    data = request.get_json()

    if not data:
        return jsonify({
            "error": "Invalid request data"
        }), 400

    name = data.get("name", "").strip()
    phone = data.get("phone", "").strip()
    email = data.get("email", "").strip()
    position = data.get("position", "").strip()
    status = data.get("status", "New")
    remarks = data.get("remarks", "")

    if not name or not phone or not email or not position:
        return jsonify({
            "error": "Name, phone, email and position are required"
        }), 400

    connection = get_db_connection()

    existing_candidate = connection.execute(
        "SELECT * FROM candidates WHERE id = ?",
        (candidate_id,)
    ).fetchone()

    if existing_candidate is None:
        connection.close()

        return jsonify({
            "error": "Candidate not found"
        }), 404

    normalized_email = normalize_email(email)
    normalized_phone = normalize_phone(phone)

    if connection.execute(
        "SELECT 1 FROM candidates WHERE email_normalized = ? AND id != ? LIMIT 1",
        (normalized_email, candidate_id),
    ).fetchone():
        connection.close()
        return jsonify({"error": "A candidate with this email already exists"}), 409

    if connection.execute(
        "SELECT 1 FROM candidates WHERE phone_normalized = ? AND id != ? LIMIT 1",
        (normalized_phone, candidate_id),
    ).fetchone():
        connection.close()
        return jsonify({"error": "A candidate with this phone number already exists"}), 409
            
    latest_application = get_latest_application_state(connection, candidate_id)
    if latest_application is None:
        application_cursor = connection.execute("""
            INSERT INTO applications (candidate_id, position, remarks, applied_at)
            VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        """, (
            candidate_id,
            existing_candidate["position"],
            existing_candidate["remarks"] or "",
            existing_candidate["created_at"],
        ))
        application_id = application_cursor.lastrowid
        connection.execute("""
            INSERT INTO application_status_events (application_id, status, changed_at)
            VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
        """, (
            application_id,
            existing_candidate["status"],
            existing_candidate["created_at"],
        ))
        current_status = existing_candidate["status"]
    else:
        application_id = latest_application["id"]
        current_status = latest_application["status"]

    connection.execute("""
        UPDATE applications
        SET position = ?, remarks = ?
        WHERE id = ?
    """, (position, remarks, application_id))

    if status != current_status:
        connection.execute("""
            INSERT INTO application_status_events (application_id, status, changed_at)
            VALUES (?, ?, ?)
        """, (application_id, status, utc_timestamp()))

    connection.execute("""
        UPDATE candidates
        SET name = ?, phone = ?, email = ?, position = ?, status = ?, remarks = ?,
            email_normalized = ?, phone_normalized = ?
        WHERE id = ?
    """, (
        name, phone, email, position, status, remarks,
        normalized_email, normalized_phone, candidate_id,
    ))

    connection.commit()

    updated_candidate = get_candidate_with_latest_application(connection, candidate_id)

    connection.close()

    return jsonify(dict(updated_candidate)), 200

@app.route("/api/candidates/<int:candidate_id>", methods=["DELETE"])
def delete_candidate(candidate_id):
    connection = get_db_connection()

    candidate = connection.execute(
        "SELECT * FROM candidates WHERE id = ?",
        (candidate_id,)
    ).fetchone()

    if candidate is None:
        connection.close()
        return jsonify({"error": "Candidate not found"}), 404

    connection.execute(
        "DELETE FROM candidates WHERE id = ?",
        (candidate_id,)
    )

    connection.commit()
    connection.close()

    return jsonify({"message": "Candidate deleted successfully"}), 200

if __name__ == "__main__":
    app.run(debug=True, port=5001)
