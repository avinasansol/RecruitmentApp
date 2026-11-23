from datetime import datetime, timezone
import re
import sqlite3
from pathlib import Path

DATABASE_PATH = Path(__file__).parent / "recruitment.db"


def normalize_utc_timestamp(value):
    if value is None:
        return None

    value = str(value)
    compact_timestamp = re.fullmatch(r"\d{8}T\d{12}Z", value)
    if compact_timestamp:
        parsed = datetime.strptime(value, "%Y%m%dT%H%M%S%fZ").replace(
            tzinfo=timezone.utc
        )
    else:
        iso_value = value.replace(" ", "T", 1)
        if iso_value.endswith("Z"):
            iso_value = iso_value[:-1] + "+00:00"
        parsed = datetime.fromisoformat(iso_value)
        if parsed.tzinfo is None:
            # SQLite CURRENT_TIMESTAMP values are UTC, even though they lack a zone.
            parsed = parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database():
    connection = get_db_connection()
    try:
        connection.execute("BEGIN IMMEDIATE")

        connection.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL,
                position TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'New',
                remarks TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        candidate_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(candidates)")
        }
        if "email_normalized" not in candidate_columns:
            connection.execute("ALTER TABLE candidates ADD COLUMN email_normalized TEXT")
        if "phone_normalized" not in candidate_columns:
            connection.execute("ALTER TABLE candidates ADD COLUMN phone_normalized TEXT")

        candidate_contacts = connection.execute("""
            SELECT id, email, phone, email_normalized, phone_normalized
            FROM candidates
        """).fetchall()
        for candidate in candidate_contacts:
            email_normalized = (candidate["email"] or "").strip().lower()
            phone_normalized = "".join(
                character for character in (candidate["phone"] or "")
                if character.isdigit()
            )
            if (
                candidate["email_normalized"] != email_normalized
                or candidate["phone_normalized"] != phone_normalized
            ):
                connection.execute("""
                    UPDATE candidates
                    SET email_normalized = ?, phone_normalized = ?
                    WHERE id = ?
                """, (email_normalized, phone_normalized, candidate["id"]))

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_candidates_email_normalized
            ON candidates(email_normalized)
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_candidates_phone_normalized
            ON candidates(phone_normalized)
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                candidate_id INTEGER NOT NULL,
                position TEXT NOT NULL,
                remarks TEXT DEFAULT '',
                cv_filename TEXT,
                applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id)
                    ON DELETE CASCADE
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS application_status_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                remarks TEXT DEFAULT '',
                FOREIGN KEY (application_id) REFERENCES applications(id)
                    ON DELETE CASCADE
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_applications_candidate_applied
            ON applications(candidate_id, applied_at)
        """)
        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_status_events_application_changed
            ON application_status_events(application_id, changed_at)
        """)

        # Backfill each legacy candidate once. The old table remains intact so
        # existing reads and writes keep working during the transition.
        legacy_candidates = connection.execute(
            "SELECT id, position, status, remarks, created_at FROM candidates"
        ).fetchall()

        for candidate in legacy_candidates:
            application = connection.execute(
                "SELECT id FROM applications WHERE candidate_id = ? ORDER BY id LIMIT 1",
                (candidate["id"],),
            ).fetchone()

            if application is None:
                cursor = connection.execute("""
                    INSERT INTO applications (candidate_id, position, remarks, applied_at)
                    VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
                """, (
                    candidate["id"],
                    candidate["position"],
                    candidate["remarks"] or "",
                    candidate["created_at"],
                ))
                application_id = cursor.lastrowid
            else:
                application_id = application["id"]

            has_status_event = connection.execute(
                "SELECT 1 FROM application_status_events WHERE application_id = ? LIMIT 1",
                (application_id,),
            ).fetchone()
            if has_status_event is None:
                connection.execute("""
                    INSERT INTO application_status_events (application_id, status, changed_at)
                    VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))
                """, (
                    application_id,
                    candidate["status"],
                    candidate["created_at"],
                ))

        for table, column in (
            ("applications", "applied_at"),
            ("application_status_events", "changed_at"),
        ):
            rows = connection.execute(f"SELECT id, {column} FROM {table}").fetchall()
            for row in rows:
                normalized = normalize_utc_timestamp(row[column])
                if normalized != row[column]:
                    connection.execute(
                        f"UPDATE {table} SET {column} = ? WHERE id = ?",
                        (normalized, row["id"]),
                    )

        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
