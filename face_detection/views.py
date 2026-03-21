from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.core.mail import send_mail
from django.core import signing
from django.conf import settings
import csv
import json
import base64
import numpy as np
from PIL import Image
from io import BytesIO
from pathlib import Path
from datetime import datetime, timezone as dt_timezone
import cv2
import os
import json as json_module
import sqlite3
from urllib.parse import quote
import smtplib

from .models import AttendanceRecord


def _get_openai_key():
    """Read OpenAI API key from environment."""
    return (os.getenv('OPENAI_API_KEY') or '').strip()


def _get_openai_model():
    """Read configured OpenAI model name."""
    return (os.getenv('OPENAI_MODEL') or 'gpt-4o-mini').strip()


def _ai_live_face_feedback(image_data_url):
    """Use OpenAI vision to check if a face is visible and return short guidance.

    Returns dict like:
    {
        'face_visible': bool,
        'confidence': 'low|medium|high',
        'guidance': 'short hint'
    }
    or None when unavailable.
    """
    api_key = _get_openai_key()
    if not api_key or not image_data_url:
        return None

    try:
        from openai import OpenAI
    except Exception:
        return None


def _decode_data_url_to_bgr(image_data_url):
    """Decode a data URL image into OpenCV BGR array."""
    if not image_data_url or ',' not in image_data_url:
        raise ValueError('Invalid image data URL')

    image_bytes = base64.b64decode(image_data_url.split(',')[1])
    image = Image.open(BytesIO(image_bytes))
    image_array = np.array(image)

    if len(image_array.shape) == 3 and image_array.shape[2] == 4:
        return cv2.cvtColor(image_array, cv2.COLOR_RGBA2BGR)
    if len(image_array.shape) == 3 and image_array.shape[2] == 3:
        return cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR)
    if len(image_array.shape) == 2:
        return cv2.cvtColor(image_array, cv2.COLOR_GRAY2BGR)
    return image_array


def _detect_primary_face(gray_image):
    """Return (x, y, w, h) for the primary detected face, or None."""
    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    )

    # Primary pass
    faces = face_cascade.detectMultiScale(
        gray_image,
        scaleFactor=1.2,
        minNeighbors=4,
        minSize=(50, 50)
    )

    # Fallback pass
    if len(faces) == 0:
        faces = face_cascade.detectMultiScale(
            gray_image,
            scaleFactor=1.1,
            minNeighbors=3,
            minSize=(40, 40)
        )

    if len(faces) == 0:
        return None

    # Pick largest face as primary
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return int(x), int(y), int(w), int(h)


def _clamp01(value):
    return float(max(0.0, min(1.0, value)))


def _compute_liveness_result(current_bgr, previous_bgr=None):
    """Passive liveness estimation from current frame (and optional previous frame).

    Returns a dict containing:
      - passed: bool
      - score: float [0,1]
      - instruction: str
      - reason: str
      - details: dict
    """
    current_gray = cv2.cvtColor(current_bgr, cv2.COLOR_BGR2GRAY)
    current_gray = cv2.equalizeHist(current_gray)

    face_box = _detect_primary_face(current_gray)
    if face_box is None:
        return {
            'passed': False,
            'score': 0.0,
            'reason': 'No face detected',
            'instruction': 'Center your face in the frame with good lighting.',
            'details': {}
        }

    x, y, w, h = face_box
    current_face = current_gray[y:y+h, x:x+w]
    if current_face.size == 0:
        return {
            'passed': False,
            'score': 0.0,
            'reason': 'Invalid face region',
            'instruction': 'Move slightly closer and keep your face fully visible.',
            'details': {}
        }

    # Quality checks (single-frame passive signals)
    blur_var = float(cv2.Laplacian(current_face, cv2.CV_64F).var())
    mean_intensity = float(np.mean(current_face))
    p5 = float(np.percentile(current_face, 5))
    p95 = float(np.percentile(current_face, 95))
    dynamic_range = max(0.0, p95 - p5)

    blur_score = _clamp01((blur_var - 35.0) / 120.0)
    light_score = _clamp01(1.0 - (abs(mean_intensity - 128.0) / 128.0))
    texture_score = _clamp01((dynamic_range - 25.0) / 75.0)

    quality_score = (0.45 * blur_score) + (0.30 * light_score) + (0.25 * texture_score)

    temporal_score = 0.0
    motion_norm = 0.0
    frame_diff = 0.0
    temporal_available = False

    if previous_bgr is not None:
        prev_gray = cv2.cvtColor(previous_bgr, cv2.COLOR_BGR2GRAY)
        prev_gray = cv2.equalizeHist(prev_gray)
        prev_box = _detect_primary_face(prev_gray)

        if prev_box is not None:
            px, py, pw, ph = prev_box
            prev_face = prev_gray[py:py+ph, px:px+pw]
            if prev_face.size > 0:
                # Normalize face crops to same shape for temporal analysis
                target_size = (128, 128)
                curr_resized = cv2.resize(current_face, target_size)
                prev_resized = cv2.resize(prev_face, target_size)

                diff = cv2.absdiff(curr_resized, prev_resized)
                frame_diff = float(np.mean(diff) / 255.0)

                curr_center_x = x + (w / 2.0)
                curr_center_y = y + (h / 2.0)
                prev_center_x = px + (pw / 2.0)
                prev_center_y = py + (ph / 2.0)
                center_shift = float(np.sqrt((curr_center_x - prev_center_x) ** 2 + (curr_center_y - prev_center_y) ** 2))
                base_size = max((w + h + pw + ph) / 4.0, 1.0)
                motion_norm = center_shift / base_size

                temporal_diff_score = _clamp01((frame_diff - 0.006) / 0.05)
                temporal_motion_score = _clamp01((motion_norm - 0.003) / 0.05)
                temporal_score = (0.6 * temporal_diff_score) + (0.4 * temporal_motion_score)
                temporal_available = True

    has_temporal = temporal_available
    combined_score = (0.65 * quality_score + 0.35 * temporal_score) if has_temporal else quality_score

    # Decision thresholds tuned to be practical for webcam variability.
    # If previous frame missing, request one more frame for reliable liveness.
    if not has_temporal:
        single_frame_pass = bool(
            (quality_score >= 0.46) and
            (blur_var >= 30.0) and
            (dynamic_range >= 20.0)
        )

        if single_frame_pass:
            return {
                'passed': True,
                'score': float(combined_score),
                'reason': 'Liveness verified from high-quality live frame',
                'instruction': 'Single-frame quality is sufficient for registration.',
                'details': {
                    'quality_score': float(quality_score),
                    'temporal_score': float(temporal_score),
                    'blur_var': blur_var,
                    'lighting': mean_intensity,
                    'dynamic_range': dynamic_range,
                    'motion_norm': float(motion_norm),
                    'frame_diff': float(frame_diff),
                }
            }

        return {
            'passed': False,
            'score': float(combined_score),
            'reason': 'Need one more clear frame for liveness verification',
            'instruction': 'Capture one more image, then blink or move slightly before retrying.',
            'details': {
                'quality_score': float(quality_score),
                'temporal_score': float(temporal_score),
                'blur_var': blur_var,
                'lighting': mean_intensity,
                'dynamic_range': dynamic_range,
                'motion_norm': float(motion_norm),
                'frame_diff': float(frame_diff),
            }
        }

    passed = bool(
        (combined_score >= 0.34) and
        (quality_score >= 0.20) and
        ((temporal_score >= 0.06) or (quality_score >= 0.50))
    )

    if passed:
        return {
            'passed': True,
            'score': float(combined_score),
            'reason': 'Liveness verified',
            'instruction': 'Liveness check passed.',
            'details': {
                'quality_score': float(quality_score),
                'temporal_score': float(temporal_score),
                'blur_var': blur_var,
                'lighting': mean_intensity,
                'dynamic_range': dynamic_range,
                'motion_norm': float(motion_norm),
                'frame_diff': float(frame_diff),
            }
        }

    instruction_parts = []
    if blur_var < 35:
        instruction_parts.append('keep camera steady')
    if mean_intensity < 50 or mean_intensity > 220:
        instruction_parts.append('improve lighting')
    if temporal_score < 0.06:
        instruction_parts.append('move slightly or blink')
    if not instruction_parts:
        instruction_parts.append('look directly at camera and try again')

    return {
        'passed': False,
        'score': float(combined_score),
        'reason': 'Liveness verification failed',
        'instruction': 'Please ' + ', '.join(instruction_parts) + '.',
        'details': {
            'quality_score': float(quality_score),
            'temporal_score': float(temporal_score),
            'blur_var': blur_var,
            'lighting': mean_intensity,
            'dynamic_range': dynamic_range,
            'motion_norm': float(motion_norm),
            'frame_diff': float(frame_diff),
        }
    }

    try:
        client = OpenAI(api_key=api_key)
        model_name = _get_openai_model()

        ai_response = client.responses.create(
            model=model_name,
            max_output_tokens=160,
            input=[
                {
                    'role': 'user',
                    'content': [
                        {
                            'type': 'input_text',
                            'text': (
                                'Analyze this webcam frame for attendance check. '
                                'Return ONLY valid JSON with keys: '
                                'face_visible (boolean), confidence (low/medium/high), guidance (short string). '
                                'Guidance should be a one-line tip like improve light, move closer, center face.'
                            )
                        },
                        {
                            'type': 'input_image',
                            'image_url': image_data_url,
                        }
                    ]
                }
            ]
        )

        text = (getattr(ai_response, 'output_text', '') or '').strip()
        if not text:
            return None

        # Tolerant JSON extraction in case model wraps content
        start_idx = text.find('{')
        end_idx = text.rfind('}')
        if start_idx == -1 or end_idx == -1 or end_idx < start_idx:
            return None

        parsed = json.loads(text[start_idx:end_idx + 1])
        if not isinstance(parsed, dict):
            return None

        return {
            'face_visible': bool(parsed.get('face_visible', False)),
            'confidence': str(parsed.get('confidence', 'low')).lower(),
            'guidance': str(parsed.get('guidance', '')).strip(),
            'model': model_name,
        }
    except Exception:
        return None

# --- Helpers for attendance storage ---
ATTENDANCE_CSV_HEADER = ['Name', 'Timestamp', 'Status', 'Subject', 'Actions']


def _first_writable_dir(candidates):
    """Return the first directory that can be created/written, else last candidate."""
    fallback = None
    for candidate in candidates:
        if not candidate:
            continue

        path = Path(candidate).expanduser()
        fallback = path
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe_file = path / '.perm_check'
            with probe_file.open('a', encoding='utf-8'):
                pass
            try:
                probe_file.unlink(missing_ok=True)
            except Exception:
                pass
            return path
        except Exception:
            continue

    if fallback is None:
        fallback = Path(__file__).resolve().parent.parent / 'runtime_data'
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback


def _get_attendance_data_dir():
    """Return base directory for attendance artifacts."""
    base_dir = Path(__file__).resolve().parent.parent
    configured_dir = (os.getenv('ATTENDANCE_DATA_DIR') or '').strip()

    return _first_writable_dir([
        configured_dir,
        base_dir / 'face_detection' / 'data',
        base_dir / 'runtime_data',
    ])


def _get_known_faces_dir():
    """Return directory used to store known face images."""
    base_dir = Path(__file__).resolve().parent.parent
    configured_dir = (os.getenv('KNOWN_FACES_DIR') or '').strip()

    return _first_writable_dir([
        configured_dir,
        base_dir / 'face_detection' / 'known_faces',
        _get_attendance_data_dir() / 'known_faces',
    ])


def _is_attendance_header_row(parts):
    normalized = [str(part or '').strip().lower() for part in parts]
    return normalized[:len(ATTENDANCE_CSV_HEADER)] == [h.lower() for h in ATTENDANCE_CSV_HEADER]


def _extract_subject_from_notes(notes):
    text = str(notes or '')
    if 'Subject:' not in text:
        return ''

    subject_fragment = text.split('Subject:', 1)[1]
    return subject_fragment.split('|', 1)[0].strip()


def _ensure_attendance_csv_header(attendance_file):
    """Ensure CSV file starts with Name,Timestamp,Status,Subject,Actions header."""
    attendance_file.parent.mkdir(parents=True, exist_ok=True)

    if not attendance_file.exists() or attendance_file.stat().st_size == 0:
        with attendance_file.open('w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(ATTENDANCE_CSV_HEADER)
        return

    with attendance_file.open('r', newline='', encoding='utf-8') as f:
        existing_rows = list(csv.reader(f))

    first_non_empty = None
    for row in existing_rows:
        cleaned = [str(col or '').strip() for col in row]
        if any(cleaned):
            first_non_empty = cleaned
            break

    if first_non_empty and _is_attendance_header_row(first_non_empty):
        return

    with attendance_file.open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(ATTENDANCE_CSV_HEADER)
        for row in existing_rows:
            if any(str(col or '').strip() for col in row):
                writer.writerow(row)


def _get_attendance_file():
    """Return writable attendance CSV path and ensure parent exists.

    Priority:
    1) ATTENDANCE_CSV_PATH env var (if provided)
    2) ATTENDANCE_DATA_DIR/attendance.csv
    3) face_detection/data/attendance.csv (local default)
    4) runtime_data/attendance.csv fallback when preferred paths are not writable
    """
    base_dir = Path(__file__).resolve().parent.parent
    configured_path = (os.getenv('ATTENDANCE_CSV_PATH') or '').strip()

    if configured_path:
        candidate_paths = [Path(configured_path).expanduser()]
    else:
        candidate_paths = [
            _get_attendance_data_dir() / 'attendance.csv',
            base_dir / 'face_detection' / 'data' / 'attendance.csv',
        ]

    for attendance_file in candidate_paths:
        try:
            attendance_file.parent.mkdir(parents=True, exist_ok=True)
            if not attendance_file.exists():
                attendance_file.touch(exist_ok=True)
            # Check writability with a harmless append-open
            with attendance_file.open('a', encoding='utf-8'):
                pass
            return attendance_file
        except Exception:
            continue

    fallback_dir = base_dir / 'runtime_data'
    fallback_dir.mkdir(parents=True, exist_ok=True)
    fallback_file = fallback_dir / 'attendance.csv'
    if not fallback_file.exists():
        fallback_file.touch(exist_ok=True)
    return fallback_file


def _load_attendance_records():
    """Load attendance records from CSV and attach 1-based ids.

    Also backfills CSV from DB when older deployments have DB-only rows,
    so records visible in the app stay persisted in attendance.csv.
    """
    attendance_file = _get_attendance_file()
    records = []
    if attendance_file.exists():
        with attendance_file.open('r', newline='', encoding='utf-8') as f:
            reader = csv.reader(f)
            for row in reader:
                cleaned = [str(col or '').strip() for col in row]
                if not any(cleaned):
                    continue
                if _is_attendance_header_row(cleaned):
                    continue

                name = cleaned[0] if len(cleaned) > 0 else ''
                timestamp = cleaned[1] if len(cleaned) > 1 else ''
                status = cleaned[2] if len(cleaned) > 2 else 'Present'

                subject = ''
                actions = 'Admin only'
                notes = ''

                if len(cleaned) >= 5:
                    subject = cleaned[3]
                    actions = cleaned[4] or 'Admin only'
                    # Preserve optional notes column if present
                    notes = ','.join(cleaned[5:]).strip() if len(cleaned) > 5 else ''
                elif len(cleaned) == 4:
                    # Legacy format: 4th column used as notes
                    notes = cleaned[3]
                    subject = _extract_subject_from_notes(notes)

                records.append({
                    'name': name,
                    'timestamp': timestamp,
                    'status': status,
                    'subject': subject,
                    'actions': actions,
                    'notes': notes,
                })

    # Self-heal CSV by merging any DB rows missing from CSV.
    # This helps when older environments wrote to DB but CSV missed entries.
    try:
        existing_keys = set()
        for rec in records:
            existing_keys.add((
                (rec.get('name') or '').strip(),
                (rec.get('timestamp') or '').strip(),
                (rec.get('status') or 'Present').strip(),
                (rec.get('notes') or '').strip(),
            ))

        db_rows = AttendanceRecord.objects.all().order_by('timestamp')
        missing_rows = []
        for row in db_rows:
            db_timestamp = row.timestamp
            if timezone.is_aware(db_timestamp):
                db_timestamp = db_timestamp.astimezone(dt_timezone.utc)
            timestamp_str = db_timestamp.strftime('%Y-%m-%d %H:%M:%S')

            db_key = (
                (row.name or '').strip(),
                timestamp_str,
                (row.status or 'Present').strip(),
                (row.notes or '').strip(),
            )

            if db_key in existing_keys:
                continue

            missing_rows.append({
                'name': db_key[0],
                'timestamp': db_key[1],
                'status': db_key[2] or 'Present',
                'notes': db_key[3],
            })
            existing_keys.add(db_key)

        if missing_rows:
            _ensure_attendance_csv_header(attendance_file)
            with attendance_file.open('a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                for rec in missing_rows:
                    subject = _extract_subject_from_notes(rec.get('notes', ''))
                    row = [
                        rec['name'],
                        rec['timestamp'],
                        rec['status'],
                        subject,
                        'Admin only',
                    ]
                    if rec.get('notes'):
                        row.append(rec['notes'].replace('\n', ' ').replace('\r', ' '))
                    writer.writerow(row)
            records.extend(missing_rows)
    except Exception:
        # Never fail record listing because of DB sync issues.
        pass

    # Keep ids sequential after any merge/backfill.
    for idx, rec in enumerate(records, start=1):
        rec['id'] = idx

    return records


def _save_attendance_records(records):
    """Persist attendance records back to CSV."""
    attendance_file = _get_attendance_file()
    with attendance_file.open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(ATTENDANCE_CSV_HEADER)
        for record in records:
            name = record.get('name', '')
            timestamp = record.get('timestamp', '')
            status = record.get('status', 'Present')
            subject = record.get('subject', '')
            actions = record.get('actions', 'Admin only') or 'Admin only'
            notes = (record.get('notes') or '').replace('\n', ' ').replace('\r', ' ')

            if not subject:
                subject = _extract_subject_from_notes(notes)

            row = [name, timestamp, status, subject, actions]
            if notes:
                row.append(notes)
            writer.writerow(row)


def _record_attendance(name, status='Present', notes='', subject='', actions='Admin only'):
    """Write attendance to CSV and DB.

    CSV write is required (raises on failure).
    DB write remains best-effort.
    """
    timestamp_dt = timezone.now()
    timestamp_str = timestamp_dt.strftime('%Y-%m-%d %H:%M:%S')

    # Append to CSV
    attendance_file = _get_attendance_file()
    attendance_file.parent.mkdir(parents=True, exist_ok=True)
    subject_value = str(subject or '').strip()
    if not subject_value:
        subject_value = _extract_subject_from_notes(notes)
    actions_value = str(actions or '').strip() or 'Admin only'
    csv_error = None
    try:
        _ensure_attendance_csv_header(attendance_file)
        with attendance_file.open('a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            row = [name, timestamp_str, status, subject_value, actions_value]
            if notes:
                row.append(notes.replace('\n', ' ').replace('\r', ' '))
            writer.writerow(row)
    except Exception as e:
        csv_error = str(e)

    # Store in DB (non-blocking)
    try:
        AttendanceRecord.objects.create(
            name=name,
            timestamp=timestamp_dt,
            status=status,
            notes=notes or ''
        )
    except Exception:
        pass

    if csv_error:
        raise RuntimeError(f'Failed to write attendance CSV at {attendance_file}: {csv_error}')

    return timestamp_str


def _parse_attendance_timestamp(timestamp_value):
    """Parse attendance timestamp string into aware datetime when possible.

    Legacy CSV values are often saved as "YYYY-MM-DD HH:MM:SS" without timezone.
    Those values are treated as UTC to keep client-side timezone conversion consistent.
    """
    raw = str(timestamp_value or '').strip()
    if not raw:
        return None

    # Normalize common UTC suffix for fromisoformat support
    iso_candidate = raw.replace('Z', '+00:00') if raw.endswith('Z') else raw

    # 1) Try ISO parser first
    try:
        parsed = datetime.fromisoformat(iso_candidate)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=dt_timezone.utc)
        return parsed
    except Exception:
        pass

    # 2) Try legacy patterns
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S'):
        try:
            parsed = datetime.strptime(raw, fmt)
            return parsed.replace(tzinfo=dt_timezone.utc)
        except Exception:
            continue

    return None


def _to_timestamp_iso_utc(timestamp_value):
    """Convert timestamp value to ISO-8601 UTC string suitable for browsers."""
    parsed = _parse_attendance_timestamp(timestamp_value)
    if not parsed:
        return ''
    return parsed.astimezone(dt_timezone.utc).isoformat().replace('+00:00', 'Z')


def _ensure_json_data_tables():
    """Ensure SQLite tables that mirror legacy JSON datasets exist."""
    db_path = _get_known_faces_db_path()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_profiles_json (
                username TEXT PRIMARY KEY,
                name TEXT,
                email TEXT,
                phone TEXT,
                roll_number TEXT,
                registered_date TEXT,
                raw_json TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_passwords_json (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS face_encodings_json (
                username TEXT PRIMARY KEY,
                encodings_json TEXT NOT NULL,
                encoding_count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.commit()


def _ensure_feedback_table():
    """Ensure feedback storage table exists in attendance.db."""
    db_path = _get_known_faces_db_path()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS feedback_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.commit()


def _save_feedback_entry(name, email, message):
    """Save one feedback entry into attendance.db."""
    _ensure_feedback_table()
    db_path = _get_known_faces_db_path()
    created_at = timezone.now().astimezone(dt_timezone.utc).isoformat().replace('+00:00', 'Z')

    with sqlite3.connect(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO feedback_entries (name, email, message, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (str(name), str(email), str(message), created_at),
        )
        conn.commit()
        feedback_id = int(cursor.lastrowid or 0)

    return {
        'id': feedback_id,
        'created_at': created_at,
        'db_path': str(db_path),
    }


def _list_feedback_entries(limit=200):
    """Return latest feedback entries from attendance.db."""
    _ensure_feedback_table()
    db_path = _get_known_faces_db_path()
    safe_limit = max(1, min(int(limit or 200), 1000))

    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, name, email, message, created_at
            FROM feedback_entries
            ORDER BY id DESC
            LIMIT ?
            """,
            (safe_limit,),
        ).fetchall()

    results = []
    for row in rows:
        feedback_id, name, email, message, created_at = row
        results.append({
            'id': int(feedback_id),
            'name': str(name or ''),
            'email': str(email or ''),
            'message': str(message or ''),
            'created_at': str(created_at or ''),
        })

    return {
        'items': results,
        'db_path': str(db_path),
    }


def _update_feedback_entry(feedback_id, name, email, message):
    """Update feedback row by id. Returns True when row exists and is updated."""
    _ensure_feedback_table()
    db_path = _get_known_faces_db_path()
    with sqlite3.connect(db_path) as conn:
        cursor = conn.execute(
            """
            UPDATE feedback_entries
            SET name = ?, email = ?, message = ?
            WHERE id = ?
            """,
            (str(name), str(email), str(message), int(feedback_id)),
        )
        conn.commit()
        return int(cursor.rowcount or 0) > 0


def _delete_feedback_entry(feedback_id):
    """Delete feedback row by id. Returns True when a row is deleted."""
    _ensure_feedback_table()
    db_path = _get_known_faces_db_path()
    with sqlite3.connect(db_path) as conn:
        cursor = conn.execute(
            "DELETE FROM feedback_entries WHERE id = ?",
            (int(feedback_id),),
        )
        conn.commit()
        return int(cursor.rowcount or 0) > 0


def _load_user_profiles():
    """Load user profile metadata from attendance.db table."""
    _ensure_json_data_tables()
    profiles = {}
    db_path = _get_known_faces_db_path()

    try:
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute(
                "SELECT username, raw_json, name, email, phone, roll_number, registered_date FROM user_profiles_json"
            ).fetchall()

        for username, raw_json, name, email, phone, roll_number, registered_date in rows:
            key = str(username or '').strip()
            if not key:
                continue

            profile = None
            if raw_json:
                try:
                    parsed = json_module.loads(raw_json)
                    if isinstance(parsed, dict):
                        profile = parsed
                except Exception:
                    profile = None

            if not isinstance(profile, dict):
                profile = {
                    'username': key,
                    'name': name or key,
                    'email': email or '',
                    'phone': phone or '',
                    'roll_number': roll_number or '',
                    'registered_date': registered_date or '',
                }

            profiles[key] = profile
    except Exception:
        return {}

    return profiles


def _save_user_profiles(profiles_data):
    """Persist full user profiles mapping into attendance.db table."""
    _ensure_json_data_tables()
    safe_profiles = profiles_data if isinstance(profiles_data, dict) else {}
    db_path = _get_known_faces_db_path()

    with sqlite3.connect(db_path) as conn:
        conn.execute('DELETE FROM user_profiles_json')
        for username, profile in safe_profiles.items():
            key = str(username or '').strip()
            if not key:
                continue

            value = profile if isinstance(profile, dict) else {}
            row = {
                'username': key,
                'name': value.get('name', key),
                'email': value.get('email', ''),
                'phone': value.get('phone', ''),
                'roll_number': value.get('roll_number', ''),
                'registered_date': value.get('registered_date', ''),
            }
            row_json = json_module.dumps(row, ensure_ascii=False)

            conn.execute(
                """
                INSERT INTO user_profiles_json
                (username, name, email, phone, roll_number, registered_date, raw_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    key,
                    str(row.get('name') or key),
                    str(row.get('email') or ''),
                    str(row.get('phone') or ''),
                    str(row.get('roll_number') or ''),
                    str(row.get('registered_date') or ''),
                    row_json,
                ),
            )
        conn.commit()


def _load_face_encodings():
    """Load stored face encodings from attendance.db table."""
    _ensure_json_data_tables()
    db_path = _get_known_faces_db_path()
    encodings = {}

    try:
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute(
                'SELECT username, encodings_json FROM face_encodings_json'
            ).fetchall()

        for username, encodings_json in rows:
            key = str(username or '').strip()
            if not key:
                continue
            try:
                parsed = json_module.loads(encodings_json or '[]')
            except Exception:
                parsed = []
            encodings[key] = parsed if isinstance(parsed, list) else []
    except Exception:
        return {}

    return encodings


def _save_face_encodings(encodings_data):
    """Persist full face encodings mapping into attendance.db table."""
    _ensure_json_data_tables()
    safe_encodings = encodings_data if isinstance(encodings_data, dict) else {}
    db_path = _get_known_faces_db_path()

    with sqlite3.connect(db_path) as conn:
        conn.execute('DELETE FROM face_encodings_json')
        for username, value in safe_encodings.items():
            key = str(username or '').strip()
            if not key:
                continue
            normalized = value if isinstance(value, list) else []
            payload = json_module.dumps(normalized)
            conn.execute(
                """
                INSERT INTO face_encodings_json (username, encodings_json, encoding_count)
                VALUES (?, ?, ?)
                """,
                (key, payload, len(normalized)),
            )
        conn.commit()


def _get_known_faces_db_path():
    """Return path to known-faces SQLite database (attendance.db)."""
    configured_path = (os.getenv('ATTENDANCE_DB_PATH') or '').strip()
    requested_windows_path = Path(r'C:\Users\ABC\Downloads\SEM-06\face_detection\data\attendane.db')

    candidate_paths = []
    if configured_path:
        candidate_paths.append(Path(configured_path).expanduser())
    candidate_paths.append(requested_windows_path)
    candidate_paths.append(_get_attendance_data_dir() / 'attendance.db')

    for db_path in candidate_paths:
        try:
            db_path.parent.mkdir(parents=True, exist_ok=True)
            with db_path.open('a', encoding='utf-8'):
                pass
            return db_path
        except Exception:
            continue

    fallback_db = _first_writable_dir([Path(__file__).resolve().parent.parent / 'runtime_data']) / 'attendance.db'
    if not fallback_db.exists():
        fallback_db.touch(exist_ok=True)
    return fallback_db


def _ensure_known_faces_db():
    """Create known_faces table in attendance.db if needed."""
    db_path = _get_known_faces_db_path()
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS known_faces (
                username TEXT PRIMARY KEY,
                folder_path TEXT NOT NULL,
                image_count INTEGER NOT NULL DEFAULT 0,
                latest_image TEXT,
                encoding_count INTEGER NOT NULL DEFAULT 0,
                name TEXT,
                email TEXT,
                phone TEXT,
                roll_number TEXT,
                last_synced TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_known_faces_last_synced ON known_faces(last_synced)"
        )
        conn.commit()
    return db_path


def _sync_known_faces_to_db():
    """Sync filesystem known_faces and profile metadata to attendance.db."""
    known_faces_dir = _get_known_faces_dir()
    sync_time = timezone.now().astimezone(dt_timezone.utc).isoformat().replace('+00:00', 'Z')

    users = _build_registered_user_payload()
    db_path = _ensure_known_faces_db()

    with sqlite3.connect(db_path) as conn:
        existing_usernames = {
            row[0]
            for row in conn.execute('SELECT username FROM known_faces').fetchall()
        }

        synced_usernames = set()
        for user in users:
            username = str(user.get('username') or '').strip()
            if not username:
                continue

            synced_usernames.add(username)
            face_images = user.get('face_images') or []
            latest_image = face_images[-1] if face_images else ''

            conn.execute(
                """
                INSERT INTO known_faces (
                    username,
                    folder_path,
                    image_count,
                    latest_image,
                    encoding_count,
                    name,
                    email,
                    phone,
                    roll_number,
                    last_synced
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    folder_path=excluded.folder_path,
                    image_count=excluded.image_count,
                    latest_image=excluded.latest_image,
                    encoding_count=excluded.encoding_count,
                    name=excluded.name,
                    email=excluded.email,
                    phone=excluded.phone,
                    roll_number=excluded.roll_number,
                    last_synced=excluded.last_synced
                """,
                (
                    username,
                    str(known_faces_dir / username),
                    int(user.get('face_count') or 0),
                    latest_image,
                    int(user.get('encoding_count') or 0),
                    str(user.get('name') or username),
                    str(user.get('email') or ''),
                    str(user.get('phone') or ''),
                    str(user.get('roll_number') or ''),
                    sync_time,
                ),
            )

        stale_usernames = existing_usernames - synced_usernames
        if stale_usernames:
            conn.executemany(
                'DELETE FROM known_faces WHERE username = ?',
                [(username,) for username in stale_usernames],
            )

        total_rows = conn.execute('SELECT COUNT(*) FROM known_faces').fetchone()[0]
        conn.commit()

    return {
        'db_path': str(db_path),
        'synced_users': len(synced_usernames),
        'removed_users': len(stale_usernames),
        'total_rows': int(total_rows),
        'synced_at': sync_time,
    }


def _get_known_faces_db_stats():
    """Return lightweight known_faces database stats."""
    db_path = _ensure_known_faces_db()
    with sqlite3.connect(db_path) as conn:
        total_rows = conn.execute('SELECT COUNT(*) FROM known_faces').fetchone()[0]

    return {
        'db_path': str(db_path),
        'total_rows': int(total_rows),
    }


def _get_registered_usernames_from_known_faces_db():
    """Return registered usernames from attendance.db known_faces table."""
    db_path = _ensure_known_faces_db()
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT username
            FROM known_faces
            WHERE COALESCE(image_count, 0) > 0
            ORDER BY username
            """
        ).fetchall()

    usernames = []
    for (username,) in rows:
        key = str(username or '').strip()
        if key:
            usernames.append(key)
    return usernames


def _load_user_passwords():
    """Load username->password mapping from attendance.db table."""
    _ensure_json_data_tables()
    db_path = _get_known_faces_db_path()
    try:
        with sqlite3.connect(db_path) as conn:
            rows = conn.execute('SELECT username, password FROM user_passwords_json').fetchall()
        return {str(username): str(password) for username, password in rows if str(username or '').strip()}
    except Exception:
        return {}


def _save_user_passwords(passwords_data):
    """Persist full username->password mapping to attendance.db table."""
    _ensure_json_data_tables()
    safe_passwords = passwords_data if isinstance(passwords_data, dict) else {}
    db_path = _get_known_faces_db_path()

    with sqlite3.connect(db_path) as conn:
        conn.execute('DELETE FROM user_passwords_json')
        for username, password in safe_passwords.items():
            key = str(username or '').strip()
            if not key:
                continue
            conn.execute(
                'INSERT INTO user_passwords_json (username, password) VALUES (?, ?)',
                (key, str(password or '')),
            )
        conn.commit()


def _generate_password_reset_token(username, email):
    """Generate signed password reset token."""
    signer = signing.TimestampSigner(salt='face-attendance-reset')
    payload = f"{username}|{email.lower()}"
    return signer.sign(payload)


def _verify_password_reset_token(token, max_age_seconds=3600):
    """Verify signed token and return (username, email) tuple or raise."""
    signer = signing.TimestampSigner(salt='face-attendance-reset')
    unsigned = signer.unsign(token, max_age=max_age_seconds)
    if '|' not in unsigned:
        raise signing.BadSignature('Malformed reset token')
    username, email = unsigned.split('|', 1)
    return username.strip(), email.strip().lower()


def _is_email_configured():
    """Check whether SMTP credentials look configured for real email delivery."""
    host_user = str(getattr(settings, 'EMAIL_HOST_USER', '') or '').strip()
    host_password = str(getattr(settings, 'EMAIL_HOST_PASSWORD', '') or '').strip()

    placeholder_users = {'', 'your-email@gmail.com'}
    placeholder_passwords = {'', 'your-app-password'}

    return host_user not in placeholder_users and host_password not in placeholder_passwords


def _build_registered_user_payload():
    """Build users list by matching profiles and known_faces/<username> folders."""
    known_faces_dir = _get_known_faces_dir()

    profiles = _load_user_profiles()
    encodings = _load_face_encodings()

    discovered_usernames = set(profiles.keys())
    if known_faces_dir.exists():
        discovered_usernames.update(
            folder.name
            for folder in known_faces_dir.iterdir()
            if folder.is_dir() and not folder.name.startswith('.')
        )

    users = []
    for idx, username in enumerate(sorted(discovered_usernames), start=1):
        profile = profiles.get(username, {}) if isinstance(profiles.get(username, {}), dict) else {}
        user_folder = known_faces_dir / username

        face_images = []
        if user_folder.exists() and user_folder.is_dir():
            for ext in ('*.jpg', '*.jpeg', '*.png', '*.webp'):
                face_images.extend(user_folder.glob(ext))

        face_images = sorted(face_images)
        has_profile = bool(profile)
        has_folder = user_folder.exists() and user_folder.is_dir()
        has_images = len(face_images) > 0
        encoding_list = encodings.get(username, []) if isinstance(encodings, dict) else []
        has_encoding = isinstance(encoding_list, list) and len(encoding_list) > 0

        validation_reasons = []
        if not has_profile:
            validation_reasons.append('Profile missing in user_profiles_json table')
        if not has_folder:
            validation_reasons.append('User folder missing in known_faces')
        if has_folder and not has_images:
            validation_reasons.append('No face image found in known_faces folder')
        if not has_encoding:
            validation_reasons.append('Face encoding missing in face_encodings_json table')

        is_valid = has_profile and has_folder and has_images and has_encoding

        users.append({
            'id': idx,
            'username': username,
            'name': profile.get('name', username),
            'email': profile.get('email', ''),
            'phone': profile.get('phone', ''),
            'roll_number': profile.get('roll_number', ''),
            'registered_date': profile.get('registered_date', ''),
            'face_count': len(face_images),
            'face_images': [img.name for img in face_images],
            'encoding_count': len(encoding_list) if isinstance(encoding_list, list) else 0,
            'is_valid': is_valid,
            'validation_reasons': validation_reasons,
        })

    return users

# Create your views here.

def index(request):
    """Main entry - redirect to home page"""
    return redirect('face_detection:home')

def home(request):
    """Home page"""
    return render(request, 'home.html')

def live_detection(request):
    """Live detection page"""
    return render(request, 'live_detection.html')

def register(request):
    """Register face page"""
    return render(request, 'register.html')

def attendance_record(request):
    """View attendance records page"""
    return render(request, 'attendance.html')

def dashboard(request):
    """User and overview dashboard page"""
    return render(request, 'dashboard.html')

def admin_dashboard(request):
    """Admin dashboard page"""
    return render(request, 'admin_side/admin_dashboard.html')

def login(request):
    """Login page"""
    return render(request, 'login.html')

def user_login(request):
    """User login page"""
    return render(request, 'user_login.html')

def login_with_face_recognition(request):
    """Login with face recognition page"""
    return render(request, 'login_with_face_recognition.html')

def admin_login(request):
    """Admin login page"""
    return render(request, 'Admin_login.html')

def user_dashboard(request):
    """User dashboard page"""
    return render(request, 'USER/user_dashboard.html')

def user_profile(request):
    """User profile page"""
    return render(request, 'USER/user_profile.html')

def user_edit_profile(request):
    """User edit profile page"""
    return render(request, 'user_edit_profile.html')

def features_showcase(request):
    """Features showcase page"""
    return render(request, 'features_showcase.html')

def mark_attendance(request):
    """Mark attendance page"""
    return render(request, 'admin_side/mark_attendance.html')

def register_user(request):
    """Register user page"""
    return render(request, 'admin_side/register_user.html')

def attendance_records(request):
    """Admin attendance records page"""
    return render(request, 'admin_side/attendance_records.html')

def admin_settings(request):
    """Admin settings page"""
    return render(request, 'admin_side/settings.html')

def admin_view_users(request):
    """Admin view users page"""
    return render(request, 'admin_side/admin_view_users.html')

def registration_success(request):
    """Registration success page"""
    return render(request, 'registration_success.html')

def database_status(request):
    """Database status page"""
    return render(request, 'database_status.html')

def database_details(request):
    """Database details page"""
    return render(request, 'admin_side/database.html')

def security_details(request):
    """Security details page"""
    return render(request, 'admin_side/security.html')

def backup_details(request):
    """Backup details page"""
    return render(request, 'admin_side/backup.html')

def forgot_password(request):
    """Forgot password page"""
    return render(request, 'forgot_password.html')


def reset_password(request):
    """Reset password page."""
    return render(request, 'reset_password.html')

def contact_us(request):
    """Contact us page"""
    return render(request, 'contact_us.html')

def about_us(request):
    """About us page"""
    return render(request, 'about-us.html')

def our_team(request):
    """Our team page"""
    # Production-safe rendering: avoid hard 500 if template name or nested includes break.
    for template_name in ('our-team.html', 'our_team.html'):
        try:
            return render(request, template_name)
        except Exception:
            continue

    # Last-resort fallback to keep route available.
    return render(request, 'about-us.html')

def help_center(request):
    """Help center page"""
    return render(request, 'Help_center.html')

def faq(request):
    """FAQ page"""
    return render(request, 'FAQ.html')


def feedback(request):
    """Feedback page"""
    return render(request, 'feedback.html')


def attendance_csv_view(request):
    """Show active attendance CSV file content as plain text in browser."""
    if request.method != 'GET':
        return HttpResponse('Invalid request method', status=405, content_type='text/plain; charset=utf-8')

    attendance_file = _get_attendance_file()
    try:
        if not attendance_file.exists():
            attendance_file.parent.mkdir(parents=True, exist_ok=True)
            attendance_file.touch(exist_ok=True)

        file_content = attendance_file.read_text(encoding='utf-8')
    except Exception as e:
        return HttpResponse(
            f'Unable to read attendance CSV at: {attendance_file}\nError: {str(e)}',
            status=500,
            content_type='text/plain; charset=utf-8'
        )

    header = f'# Active attendance CSV path: {attendance_file}\n\n'
    return HttpResponse(header + file_content, content_type='text/plain; charset=utf-8')


# API Endpoints
@csrf_exempt
def api_submit_feedback(request):
    """API endpoint for storing user feedback in attendance.db."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
        name = str(payload.get('name') or '').strip()
        email = str(payload.get('email') or '').strip()
        message = str(payload.get('message') or '').strip()

        if not name or not email or not message:
            return JsonResponse({'success': False, 'message': 'Name, email, and message are required.'}, status=400)

        if '@' not in email or '.' not in email:
            return JsonResponse({'success': False, 'message': 'Please enter a valid email address.'}, status=400)

        if len(message) < 5:
            return JsonResponse({'success': False, 'message': 'Feedback message is too short.'}, status=400)

        if len(message) > 3000:
            return JsonResponse({'success': False, 'message': 'Feedback message is too long.'}, status=400)

        saved = _save_feedback_entry(name=name, email=email, message=message)
        return JsonResponse({
            'success': True,
            'message': 'Feedback submitted successfully.',
            'feedback_id': saved['id'],
            'created_at': saved['created_at'],
            'stored_in': 'attendance.db',
            'db_path': saved['db_path'],
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_feedback_list(request):
    """API endpoint to fetch stored feedback entries."""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=405)

    try:
        limit = request.GET.get('limit', '200')
        payload = _list_feedback_entries(limit=limit)
        return JsonResponse({
            'success': True,
            'items': payload['items'],
            'count': len(payload['items']),
            'stored_in': 'attendance.db',
            'db_path': payload['db_path'],
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_feedback_update(request):
    """API endpoint to edit a feedback entry."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
        feedback_id = int(payload.get('id', 0) or 0)
        name = str(payload.get('name') or '').strip()
        email = str(payload.get('email') or '').strip()
        message = str(payload.get('message') or '').strip()

        if feedback_id <= 0:
            return JsonResponse({'success': False, 'message': 'Valid feedback id is required.'}, status=400)
        if not name or not email or not message:
            return JsonResponse({'success': False, 'message': 'Name, email, and message are required.'}, status=400)
        if '@' not in email or '.' not in email:
            return JsonResponse({'success': False, 'message': 'Please enter a valid email address.'}, status=400)

        updated = _update_feedback_entry(
            feedback_id=feedback_id,
            name=name,
            email=email,
            message=message,
        )
        if not updated:
            return JsonResponse({'success': False, 'message': 'Feedback entry not found.'}, status=404)

        return JsonResponse({'success': True, 'message': 'Feedback updated successfully.'})
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Invalid id format.'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_feedback_delete(request):
    """API endpoint to delete a feedback entry."""
    if request.method not in ('POST', 'DELETE'):
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=405)

    try:
        payload = json.loads(request.body or '{}') if request.body else {}
        feedback_id = int(payload.get('id', 0) or 0)
        if feedback_id <= 0:
            return JsonResponse({'success': False, 'message': 'Valid feedback id is required.'}, status=400)

        deleted = _delete_feedback_entry(feedback_id=feedback_id)
        if not deleted:
            return JsonResponse({'success': False, 'message': 'Feedback entry not found.'}, status=404)

        return JsonResponse({'success': True, 'message': 'Feedback deleted successfully.'})
    except ValueError:
        return JsonResponse({'success': False, 'message': 'Invalid id format.'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_admin_login(request):
    """API endpoint for admin login"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username', '').strip()
            password = data.get('password', '').strip()
            
            # Simple hardcoded admin credentials
            if username == 'admin' and password == 'admin123':
                return JsonResponse({
                    'success': True,
                    'message': 'Admin login successful',
                    'redirectUrl': '/admin-dashboard/'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'message': 'Invalid admin credentials'
                })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_user_login(request):
    """API endpoint for user login"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username', '').strip()
            password = data.get('password', '').strip()
            
            # Check if user exists in known_faces folder
            known_faces_dir = _get_known_faces_dir()
            passwords_data = _load_user_passwords()
            
            if known_faces_dir.exists() and (known_faces_dir / username).exists():
                stored_password = passwords_data.get(username)
                if not stored_password:
                    return JsonResponse({
                        'success': False,
                        'message': 'Password not set for this account. Please use Forgot Password.'
                    })

                if stored_password != password:
                    return JsonResponse({
                        'success': False,
                        'message': 'Invalid username or password.'
                    })

                # Build a minimal user payload so the frontend can stash session info
                user_payload = {
                    'id': username,  # use username as stable identifier since no DB model
                    'username': username,
                    'name': username
                }

                return JsonResponse({
                    'success': True,
                    'message': 'User login successful',
                    'username': username,
                    'user': user_payload,
                    'redirectUrl': '/user_dashboard'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'message': 'User not registered. Please register first.'
                })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_forgot_password(request):
    """Request password reset link by username + email."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        payload = json.loads(request.body or '{}')
        username = (payload.get('username') or '').strip()
        email = (payload.get('email') or '').strip().lower()

        if not username or not email:
            return JsonResponse({'success': False, 'message': 'Username and email are required.'}, status=400)

        profiles = _load_user_profiles()
        profile = profiles.get(username)
        if not profile:
            return JsonResponse({'success': False, 'message': 'User not found.'}, status=404)

        profile_email = str(profile.get('email') or '').strip().lower()
        if not profile_email or profile_email != email:
            return JsonResponse({'success': False, 'message': 'Email does not match this username.'}, status=400)

        token = _generate_password_reset_token(username, email)
        reset_url = request.build_absolute_uri(f"/reset-password/?token={quote(token)}")

        subject = 'Face Attendance Password Reset Link'
        message = (
            f"Hi {username},\n\n"
            "We received a request to reset your password.\n"
            "Click the link below to reset your password (valid for 60 minutes):\n\n"
            f"{reset_url}\n\n"
            "If you did not request this, you can ignore this email.\n"
        )

        # If SMTP is not configured, provide reset link directly in DEBUG mode.
        if not _is_email_configured():
            if settings.DEBUG:
                return JsonResponse({
                    'success': True,
                    'message': 'Email is not configured. Use the reset link below (development mode).',
                    'reset_link': reset_url,
                })
            return JsonResponse({
                'success': False,
                'message': 'Email service is not configured. Please contact admin.'
            }, status=500)

        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None) or getattr(settings, 'EMAIL_HOST_USER', '')
        try:
            send_mail(subject, message, from_email, [email], fail_silently=False)
        except smtplib.SMTPAuthenticationError:
            return JsonResponse({
                'success': False,
                'message': 'Email authentication failed. Please set a valid EMAIL_HOST_USER and Gmail App Password in .env.'
            }, status=500)

        return JsonResponse({
            'success': True,
            'message': 'Password reset link sent to your email.',
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_reset_password(request):
    """Reset user password using signed token."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        payload = json.loads(request.body or '{}')
        token = (payload.get('token') or '').strip()
        new_password = (payload.get('new_password') or '').strip()
        confirm_password = (payload.get('confirm_password') or '').strip()

        if not token or not new_password or not confirm_password:
            return JsonResponse({'success': False, 'message': 'All fields are required.'}, status=400)

        if new_password != confirm_password:
            return JsonResponse({'success': False, 'message': 'Passwords do not match.'}, status=400)

        if len(new_password) < 8:
            return JsonResponse({'success': False, 'message': 'Password must be at least 8 characters long.'}, status=400)

        has_upper = any(c.isupper() for c in new_password)
        has_lower = any(c.islower() for c in new_password)
        has_digit = any(c.isdigit() for c in new_password)
        if not (has_upper and has_lower and has_digit):
            return JsonResponse({'success': False, 'message': 'Password must include uppercase, lowercase, and numbers.'}, status=400)

        username, email = _verify_password_reset_token(token, max_age_seconds=3600)

        profiles = _load_user_profiles()
        profile = profiles.get(username)
        if not profile:
            return JsonResponse({'success': False, 'message': 'User not found.'}, status=404)

        profile_email = str(profile.get('email') or '').strip().lower()
        if profile_email != email:
            return JsonResponse({'success': False, 'message': 'Invalid token for this account.'}, status=400)

        passwords_data = _load_user_passwords()
        passwords_data[username] = new_password
        _save_user_passwords(passwords_data)

        return JsonResponse({'success': True, 'message': 'Password reset successful. Please login.'})

    except signing.SignatureExpired:
        return JsonResponse({'success': False, 'message': 'Reset link has expired. Please request a new one.'}, status=400)
    except signing.BadSignature:
        return JsonResponse({'success': False, 'message': 'Invalid reset link.'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_register_face(request):
    """API endpoint for registering user face with face detection"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username', '').strip()
            image_data = data.get('image', '')
            images_data = data.get('images', [])
            previous_image_data = data.get('previous_image', '')

            if not isinstance(images_data, list):
                images_data = []

            # Backward compatibility: allow legacy single-image payloads
            if not images_data and image_data:
                images_data = [image_data]
            
            # Validate inputs
            if not username:
                return JsonResponse({
                    'success': False,
                    'message': 'Username is required'
                })
            
            if not images_data:
                return JsonResponse({
                    'success': False,
                    'message': 'No image provided'
                })
            
            # Decode base64 image
            primary_image_data = images_data[0]

            try:
                image_cv = _decode_data_url_to_bgr(primary_image_data)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Invalid image format: {str(e)}'
                })

            # Optional previous frame for stronger liveness
            previous_bgr = None
            if previous_image_data:
                try:
                    previous_bgr = _decode_data_url_to_bgr(previous_image_data)
                except Exception:
                    previous_bgr = None

            liveness_result = _compute_liveness_result(image_cv, previous_bgr)
            if not liveness_result.get('passed'):
                return JsonResponse({
                    'success': False,
                    'message': 'Liveness check failed. Registration requires a live face.',
                    'action': 'liveness',
                    'instruction': liveness_result.get('instruction', 'Please try again.'),
                    'liveness': {
                        'passed': False,
                        'score': float(liveness_result.get('score', 0.0)),
                        'reason': liveness_result.get('reason', 'Liveness verification failed'),
                        'details': liveness_result.get('details', {}),
                    }
                })
            
            # Detect face using Haar Cascade
            try:
                gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY)
                face_box = _detect_primary_face(gray)
                
                if face_box is None:
                    return JsonResponse({
                        'success': False,
                        'message': 'No face detected in image. Please provide a clear face image.'
                    })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Error processing image: {str(e)}'
                })
            
            # Create user folder in known_faces
            known_faces_dir = _get_known_faces_dir()
            user_folder = known_faces_dir / username
            user_folder.mkdir(parents=True, exist_ok=True)
            
            # Save all captured registration images
            saved_images_count = 0
            timestamp_prefix = datetime.now().strftime('%Y%m%d_%H%M%S')
            for idx, raw_image_data in enumerate(images_data, start=1):
                try:
                    image_bytes = base64.b64decode(raw_image_data.split(',')[1])
                    image = Image.open(BytesIO(image_bytes)).convert('RGB')
                    image_path = user_folder / f'face_{timestamp_prefix}_{idx:02d}.jpg'
                    image.save(image_path, format='JPEG', quality=95)
                    saved_images_count += 1
                except Exception:
                    continue

            if saved_images_count == 0:
                return JsonResponse({
                    'success': False,
                    'message': 'Failed to save captured images. Please try again.'
                })
            
            # Store simple face encoding (histogram-based) for comparison
            
            # Create enhanced face encoding using multiple histograms
            # Extract face region for better encoding
            x, y, w, h = face_box
            face_roi = gray[y:y+h, x:x+w]
            
            # Create multi-bin histogram for better representation
            hist_256 = cv2.calcHist([face_roi], [0], None, [256], [0, 256])
            hist_64 = cv2.calcHist([face_roi], [0], None, [64], [0, 256])
            hist_128 = cv2.calcHist([face_roi], [0], None, [128], [0, 256])
            
            # Normalize histograms
            hist_256 = cv2.normalize(hist_256, hist_256).flatten().tolist()
            hist_64 = cv2.normalize(hist_64, hist_64).flatten().tolist()
            hist_128 = cv2.normalize(hist_128, hist_128).flatten().tolist()
            
            # Combine all histograms into one encoding
            combined_hist = hist_256 + hist_64 + hist_128
            
            # Load existing encodings from DB or create new
            encodings_data = _load_face_encodings()
            
            # Store encodings
            if username not in encodings_data:
                encodings_data[username] = []
            encodings_data[username].append(combined_hist)
            
            # Save updated encodings to DB
            _save_face_encodings(encodings_data)
            
            # Save user profile data to DB
            profiles = _load_user_profiles()

            registered_date = datetime.now().isoformat()
            profiles[username] = {
                'username': username,
                'name': data.get('name', username),
                'email': data.get('email', ''),
                'phone': data.get('phone', ''),
                'roll_number': data.get('roll_number', ''),
                'registered_date': registered_date,
            }
            _save_user_profiles(profiles)

            # Save password (if provided during registration)
            raw_password = (data.get('password') or '').strip()
            if raw_password:
                passwords_data = _load_user_passwords()
                passwords_data[username] = raw_password
                _save_user_passwords(passwords_data)

            # Create attendance record for registration
            _record_attendance(username, status='Registered')

            # Keep attendance.db known_faces table in sync (best-effort)
            try:
                _sync_known_faces_to_db()
            except Exception:
                pass

            return JsonResponse({
                'success': True,
                'message': f'Face registered successfully for {username}',
                'username': username,
                'saved_images_count': saved_images_count,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'liveness': {
                    'passed': True,
                    'score': float(liveness_result.get('score', 0.0)),
                    'reason': liveness_result.get('reason', 'Liveness verified')
                }
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error during registration: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_mark_attendance_face(request):
    """API endpoint for marking attendance via face with face detection"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            image_data = data.get('image', '')
            previous_image_data = data.get('previous_image', '')
            subject = str(data.get('subject', '') or '').strip()
            
            if not image_data:
                return JsonResponse({
                    'success': False,
                    'message': 'No image provided',
                    'action': 'register'
                })
            
            # Decode base64 image
            try:
                image_cv = _decode_data_url_to_bgr(image_data)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Invalid image format: {str(e)}'
                })

            # Optional previous frame for temporal liveness
            previous_bgr = None
            if previous_image_data:
                try:
                    previous_bgr = _decode_data_url_to_bgr(previous_image_data)
                except Exception:
                    previous_bgr = None

            liveness_result = _compute_liveness_result(image_cv, previous_bgr)
            if not liveness_result.get('passed'):
                return JsonResponse({
                    'success': False,
                    'message': 'Liveness verification required. Please use a live face.',
                    'action': 'liveness',
                    'instruction': liveness_result.get('instruction', 'Please try again.'),
                    'liveness': {
                        'passed': False,
                        'score': float(liveness_result.get('score', 0.0)),
                        'reason': liveness_result.get('reason', 'Liveness verification failed'),
                        'details': liveness_result.get('details', {}),
                    }
                })
            
            # Detect face using Haar Cascade (with more tolerant fallback)
            try:
                gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY)
                gray = cv2.equalizeHist(gray)  # Normalize lighting to help detection
                face_box = _detect_primary_face(gray)
                
                if face_box is None:
                    use_ai_detection = bool(data.get('use_ai_detection', False))
                    ai_feedback = _ai_live_face_feedback(image_data) if use_ai_detection else None

                    message = 'No face detected in image'
                    instruction = 'Please center your face in frame with better lighting.'

                    if ai_feedback:
                        ai_hint = ai_feedback.get('guidance', '').strip()
                        if ai_feedback.get('face_visible'):
                            message = 'Face is visible but not clear enough for reliable detection.'
                        if ai_hint:
                            instruction = ai_hint

                    return JsonResponse({
                        'success': False,
                        'message': message,
                        'action': 'register',
                        'instruction': instruction,
                        'ai_checked': bool(ai_feedback),
                        'ai_feedback': ai_feedback or {}
                    })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Error processing image: {str(e)}'
                })
            
            # Create enhanced histogram encoding for the captured face
            x, y, w, h = face_box
            face_roi = gray[y:y+h, x:x+w]
            
            # Create multi-bin histogram for better representation
            hist_256 = cv2.calcHist([face_roi], [0], None, [256], [0, 256])
            hist_64 = cv2.calcHist([face_roi], [0], None, [64], [0, 256])
            hist_128 = cv2.calcHist([face_roi], [0], None, [128], [0, 256])
            
            # Normalize and combine
            hist_256 = cv2.normalize(hist_256, hist_256).flatten().astype('float32')
            hist_64 = cv2.normalize(hist_64, hist_64).flatten().astype('float32')
            hist_128 = cv2.normalize(hist_128, hist_128).flatten().astype('float32')
            
            # Combine all histograms
            hist_normalized = np.concatenate([hist_256, hist_64, hist_128]).astype('float32')
            
            # Get registered users and their encodings
            known_faces_dir = _get_known_faces_dir()
            
            registered_users = []
            known_face_encodings = {}
            
            # Load stored encodings from DB
            known_face_encodings = _load_face_encodings()

            # Keep known_faces DB table fresh (best-effort), then read registered users from DB
            try:
                _sync_known_faces_to_db()
            except Exception:
                pass

            try:
                registered_users = _get_registered_usernames_from_known_faces_db()
            except Exception:
                registered_users = []
            
            # Fallback to filesystem if DB list is empty
            if known_faces_dir.exists():
                fs_users = [
                    user_folder.name
                    for user_folder in known_faces_dir.iterdir()
                    if user_folder.is_dir() and not user_folder.name.startswith('.')
                ]
                if not registered_users:
                    registered_users = fs_users
                else:
                    # ensure any existing folders not yet synced are still considered
                    registered_users = sorted(set(registered_users).union(fs_users))
            
            # If no registered users, reject
            if not registered_users:
                return JsonResponse({
                    'success': False,
                    'message': 'No registered users in the system',
                    'action': 'register',
                    'instruction': 'Please register your face first. No users are registered yet.',
                    'registered_users': []
                })
            
            # Compare captured face with registered users using histogram matching
            recognized_user = None
            best_similarity = 0
            # Tolerant thresholds to improve recognition in low-light or webcam noise
            similarity_threshold = 0.40  # Primary threshold for match (40% similar)
            fallback_threshold = 0.32    # Secondary threshold to avoid false negatives (32%)
            
            for user_name in registered_users:
                if user_name in known_face_encodings and len(known_face_encodings[user_name]) > 0:
                    # Get average similarity for this user
                    similarities = []
                    for stored_hist in known_face_encodings[user_name]:
                        stored_hist_array = np.array(stored_hist, dtype='float32')
                        if stored_hist_array.size != hist_normalized.size:
                            # Skip malformed encodings
                            continue
                        # Re-normalize stored hist
                        stored_hist_array = cv2.normalize(stored_hist_array, stored_hist_array)

                        # Use multiple comparison metrics for robustness
                        # Correlation (1 is perfect match)
                        corr = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_CORREL))
                        corr = max(min(corr, 1.0), 0.0)

                        # Intersection (higher is better)
                        intersect = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_INTERSECT))
                        intersect = max(min(intersect, 1.0), 0.0)

                        # Bhattacharyya distance (lower is better, convert to similarity)
                        bhat = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_BHATTACHARYYA))
                        bhat_sim = max(1.0 - bhat, 0.0)

                        # Chi-square distance (lower is better)
                        chi = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_CHISQR))
                        chi_sim = 1.0 / (1.0 + chi)  # Convert distance to similarity

                        # Weighted combination - prioritize correlation and intersection
                        similarity = (0.35 * corr) + (0.35 * intersect) + (0.20 * bhat_sim) + (0.10 * chi_sim)
                        similarities.append(similarity)
                    
                    if similarities:
                        avg_similarity = np.mean(similarities)
                        if avg_similarity > best_similarity:
                            best_similarity = avg_similarity
                            if avg_similarity > similarity_threshold:
                                recognized_user = user_name

            # If still below main threshold, allow best candidate above fallback
            if not recognized_user and best_similarity >= fallback_threshold:
                # Use the user with highest similarity that meets fallback threshold
                best_user = None
                best_score = 0
                for user_name in registered_users:
                    if user_name in known_face_encodings and known_face_encodings[user_name]:
                        user_scores = []
                        for stored_hist in known_face_encodings[user_name]:
                            stored_hist_array = np.array(stored_hist, dtype='float32')
                            if stored_hist_array.size != hist_normalized.size:
                                continue
                            stored_hist_array = cv2.normalize(stored_hist_array, stored_hist_array)
                            # Use same weighted metrics as above
                            corr = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_CORREL))
                            corr = max(min(corr, 1.0), 0.0)
                            intersect = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_INTERSECT))
                            intersect = max(min(intersect, 1.0), 0.0)
                            bhat = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_BHATTACHARYYA))
                            bhat_sim = max(1.0 - bhat, 0.0)
                            chi = float(cv2.compareHist(hist_normalized, stored_hist_array, cv2.HISTCMP_CHISQR))
                            chi_sim = 1.0 / (1.0 + chi)
                            score = (0.35 * corr) + (0.35 * intersect) + (0.20 * bhat_sim) + (0.10 * chi_sim)
                            user_scores.append(score)
                        if user_scores:
                            user_best = float(np.mean(user_scores))
                            if user_best > best_score:
                                best_score = user_best
                                best_user = user_name
                if best_user and best_score >= fallback_threshold:
                    recognized_user = best_user
                    best_similarity = best_score
            
            # If no match found
            if not recognized_user:
                return JsonResponse({
                    'success': False,
                    'message': f'Face not recognized (similarity: {best_similarity:.2%}). Please register your face.',
                    'action': 'register',
                    'instruction': f'Your face does not match any registered user. Please register first.',
                    'registered_users': registered_users,
                    'similarity': float(best_similarity)
                })
            
            # User recognized - AUTO-MARK ATTENDANCE (advanced mode)
            profiles = _load_user_profiles()
            profile = profiles.get(recognized_user, {}) if isinstance(profiles, dict) else {}
            display_name = str(profile.get('name') or recognized_user)

            subject_note = f' | Subject: {subject}' if subject else ''
            current_time = _record_attendance(
                recognized_user,
                status='Present',
                notes=f'Face detected (advanced mode){subject_note}',
                subject=subject,
                actions='Admin only'
            )
            attendance_file = _get_attendance_file()
            
            return JsonResponse({
                'success': True,
                'name': display_name,
                'username': recognized_user,
                'timestamp': current_time,
                'message': f'Attendance marked successfully for {display_name}',
                'subject': subject,
                'stored_in': 'CSV File',
                'storage_path': str(attendance_file),
                'similarity': float(best_similarity),
                'liveness': {
                    'passed': True,
                    'score': float(liveness_result.get('score', 0.0)),
                    'reason': liveness_result.get('reason', 'Liveness verified')
                }
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_mark_manual_attendance(request):
    """API endpoint for manually marking attendance from admin panel."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        payload = json.loads(request.body or '{}')
        name = (payload.get('name') or '').strip()
        status = (payload.get('status') or 'Present').strip()
        notes = (payload.get('notes') or '').strip()

        if not name:
            return JsonResponse({'success': False, 'message': 'Name is required'}, status=400)

        allowed_statuses = {'Present', 'Absent', 'Late', 'Excused', 'Leave', 'Registered'}
        if status not in allowed_statuses:
            status = 'Present'

        timestamp = _record_attendance(name, status=status, notes=notes)
        attendance_file = _get_attendance_file()
        return JsonResponse({
            'success': True,
            'message': f'Attendance marked for {name}',
            'name': name,
            'status': status,
            'timestamp': timestamp,
            'stored_in': 'CSV File',
            'storage_path': str(attendance_file),
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_attendance_list(request):
    """API endpoint to get attendance list"""
    if request.method == 'GET':
        try:
            attendance_records = _load_attendance_records()
            profiles = _load_user_profiles()

            def _find_profile_for_record(record_name):
                key = str(record_name or '').strip()
                if not key:
                    return {}

                # Primary match: attendance name is username key
                direct = profiles.get(key)
                if isinstance(direct, dict):
                    return direct

                # Fallback match: attendance name equals profile display name
                lowered = key.lower()
                for profile in profiles.values():
                    if not isinstance(profile, dict):
                        continue
                    profile_name = str(profile.get('name') or '').strip().lower()
                    if profile_name and profile_name == lowered:
                        return profile
                return {}

            # Backward compatibility: migrate legacy note labels in API response
            for rec in attendance_records:
                profile = _find_profile_for_record(rec.get('name', ''))
                rec['roll_number'] = str(profile.get('roll_number') or '').strip()
                rec['email'] = str(profile.get('email') or '').strip()
                notes = str(rec.get('notes') or '')
                if 'basic mode' in notes.lower():
                    rec['notes'] = notes.replace('basic mode', 'advanced mode').replace('Basic mode', 'Advanced mode')
                latest_notes = str(rec.get('notes') or '')
                subject = str(rec.get('subject') or '').strip()
                if not subject and 'Subject:' in latest_notes:
                    subject_fragment = latest_notes.split('Subject:', 1)[1]
                    subject = subject_fragment.split('|', 1)[0].strip()
                rec['subject'] = subject
                rec['actions'] = str(rec.get('actions') or 'Admin only').strip() or 'Admin only'
                rec['timestamp_iso'] = _to_timestamp_iso_utc(rec.get('timestamp', ''))

            return JsonResponse({
                'success': True,
                'data': attendance_records
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_users_list(request):
    """API endpoint to get list of registered users"""
    if request.method == 'GET':
        try:
            users = _build_registered_user_payload()
            
            return JsonResponse({
                'success': True,
                'users': users,
                'total': len(users),
                'valid_total': len([u for u in users if u.get('is_valid')]),
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_user_attendance(request, username=None):
    """Return attendance records for a specific `username`.

    The user dashboard calls `/api/user_attendance/<username>` and expects
    a JSON payload with `attendance` (list) and a minimal `user` object.
    This endpoint filters the CSV-backed attendance records by name and
    returns them in reverse chronological order when possible.
    """
    if request.method != 'GET':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    if not username:
        return JsonResponse({'success': False, 'message': 'Username is required'}, status=400)

    try:
        records = _load_attendance_records()
        # Filter by username
        user_records = [r for r in records if (r.get('name') or '').strip() == username.strip()]

        # Sort by timestamp descending if timestamps are present
        try:
            user_records.sort(key=lambda r: r.get('timestamp', ''), reverse=True)
        except Exception:
            pass

        for rec in user_records:
            rec['timestamp_iso'] = _to_timestamp_iso_utc(rec.get('timestamp', ''))

        # Load stored profile details from DB
        profiles = _load_user_profiles()

        profile = profiles.get(username, {})

        user_info = {
            'username': username,
            'name': profile.get('name', username),
            'email': profile.get('email', ''),
            'phone': profile.get('phone', ''),
            'roll_number': profile.get('roll_number', ''),
            'registered_date': profile.get('registered_date', ''),
        }

        return JsonResponse({
            'success': True,
            'attendance': user_records,
            'user': user_info,
            'count': len(user_records)
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'})


@csrf_exempt
def api_database_status(request):
    """API endpoint to get database status"""
    if request.method == 'GET':
        try:
            known_faces_dir = _get_known_faces_dir()
            attendance_file = _get_attendance_file()
            db_file = _get_known_faces_db_path()
            requested_db_display_path = r'C:\Users\ABC\Downloads\SEM-06\face_detection\data\attendane.db'
            db_file_abs = db_file.expanduser().resolve()
            
            # Count registered users
            registered_count = 0
            if known_faces_dir.exists():
                registered_count = len([d for d in known_faces_dir.iterdir() if d.is_dir() and not d.name.startswith('.')])
            
            # Count attendance records
            attendance_count = 0
            if attendance_file.exists():
                with attendance_file.open('r', encoding='utf-8') as f:
                    attendance_count = sum(1 for line in f if line.strip())
            # Compute lightweight database size (attendance CSV size)
            db_size_bytes = attendance_file.stat().st_size if attendance_file.exists() else 0
            if db_size_bytes < 1024:
                db_size_human = f"{db_size_bytes} B"
            elif db_size_bytes < 1024 * 1024:
                db_size_human = f"{db_size_bytes / 1024:.2f} KB"
            else:
                db_size_human = f"{db_size_bytes / (1024 * 1024):.2f} MB"
            
            # Known-faces SQLite DB stats (attendance.db)
            known_faces_db = {'db_path': '', 'total_rows': 0}
            known_faces_db = _get_known_faces_db_stats()

            return JsonResponse({
                'success': True,
                # New keys used by current template
                'registered_users': registered_count,
                'attendance_records': attendance_count,
                'database_location': requested_db_display_path,
                'faces_location': str(known_faces_dir),
                'known_faces_db_path': known_faces_db.get('db_path', ''),
                'known_faces_db_records': known_faces_db.get('total_rows', 0),
                # Legacy keys kept for backward compatibility with older templates/JS
                'status': 'Connected',
                'database_size': db_size_human,
                'total_users': registered_count,
                'total_records': attendance_count,
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_registered_people(request):
    """API endpoint to get registered people list for admin dashboard"""
    if request.method == 'GET':
        try:
            people = _build_registered_user_payload()
            
            return JsonResponse({
                'success': True,
                'people': people,
                'total': len(people),
                'valid_total': len([p for p in people if p.get('is_valid')]),
                'invalid_total': len([p for p in people if not p.get('is_valid')]),
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_update_attendance(request, record_id=None):
    """Update a single attendance record by id (supports POST and PUT)."""
    if request.method not in ['POST', 'PUT']:
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        payload = json.loads(request.body or '{}')
        target_id = record_id or payload.get('record_id') or payload.get('id')
        if not target_id:
            return JsonResponse({'success': False, 'message': 'record_id is required'}, status=400)

        try:
            target_id = int(target_id)
        except ValueError:
            return JsonResponse({'success': False, 'message': 'record_id must be an integer'}, status=400)

        records = _load_attendance_records()
        record_index = next((idx for idx, rec in enumerate(records) if rec['id'] == target_id), None)

        if record_index is None:
            return JsonResponse({'success': False, 'message': 'Record not found'}, status=404)

        record = records[record_index]
        record['status'] = payload.get('status', record.get('status', 'Present'))
        record['notes'] = payload.get('notes', record.get('notes', ''))
        record['timestamp'] = payload.get('timestamp', record.get('timestamp', ''))

        records[record_index] = record
        _save_attendance_records(records)

        return JsonResponse({'success': True, 'record': record})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_delete_attendance(request, record_id=None):
    """Delete a single attendance record by id (supports POST and DELETE)."""
    if request.method not in ['POST', 'DELETE']:
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        if record_id is None:
            payload = json.loads(request.body or '{}')
            target_id = payload.get('record_id') or payload.get('id')
        else:
            target_id = record_id

        if not target_id:
            return JsonResponse({'success': False, 'message': 'record_id is required'}, status=400)

        try:
            target_id = int(target_id)
        except ValueError:
            return JsonResponse({'success': False, 'message': 'record_id must be an integer'}, status=400)

        records = _load_attendance_records()
        new_records = [rec for rec in records if rec['id'] != target_id]

        if len(new_records) == len(records):
            return JsonResponse({'success': False, 'message': 'Record not found'}, status=404)

        # Re-number records before saving to keep ids consistent with line order
        for idx, rec in enumerate(new_records, start=1):
            rec['id'] = idx

        _save_attendance_records(new_records)
        return JsonResponse({'success': True, 'deleted_id': target_id, 'remaining': len(new_records)})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_reset_database(request):
    """Clear all attendance records (used by admin dashboard reset action)."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        attendance_file = _get_attendance_file()
        attendance_file.write_text('', encoding='utf-8')
        return JsonResponse({'success': True, 'message': 'Attendance database reset successfully'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_delete_user(request, username=None):
    """Delete a user and their face data"""
    if request.method not in ['DELETE', 'POST']:
        return JsonResponse({'success': False, 'message': 'Invalid request method'})
    
    if not username:
        return JsonResponse({'success': False, 'message': 'Username is required'})
    
    try:
        known_faces_dir = _get_known_faces_dir()
        user_folder = known_faces_dir / username
        deletion_report = {
            'folder_removed': False,
            'encodings_removed': False,
            'profile_removed': False,
            'password_removed': False,
            'attendance_removed': 0,
        }
        
        # Delete user folder if it exists
        if user_folder.exists():
            import shutil
            shutil.rmtree(user_folder)
            deletion_report['folder_removed'] = True
        
        # Remove from DB-backed metadata tables
        encodings_data = _load_face_encodings()
        if username in encodings_data:
            del encodings_data[username]
            _save_face_encodings(encodings_data)
            deletion_report['encodings_removed'] = True

        profiles_data = _load_user_profiles()
        if username in profiles_data:
            del profiles_data[username]
            _save_user_profiles(profiles_data)
            deletion_report['profile_removed'] = True

        passwords_data = _load_user_passwords()
        if username in passwords_data:
            del passwords_data[username]
            _save_user_passwords(passwords_data)
            deletion_report['password_removed'] = True

        # Remove user's attendance records from CSV
        records = _load_attendance_records()
        original_count = len(records)
        filtered_records = [
            rec for rec in records
            if (rec.get('name') or '').strip() != username.strip()
        ]
        if len(filtered_records) != original_count:
            for idx, rec in enumerate(filtered_records, start=1):
                rec['id'] = idx
            _save_attendance_records(filtered_records)
            deletion_report['attendance_removed'] = original_count - len(filtered_records)

        # Keep attendance.db known_faces table in sync (best-effort)
        try:
            sync_result = _sync_known_faces_to_db()
            deletion_report['known_faces_db_synced'] = True
            deletion_report['known_faces_db_total'] = sync_result.get('total_rows', 0)
        except Exception:
            deletion_report['known_faces_db_synced'] = False
        
        return JsonResponse({
            'success': True,
            'message': f'User {username} deleted successfully',
            'deletion_report': deletion_report
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_change_password(request):
    """API endpoint for changing user password"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username', '').strip()
            current_password = data.get('current_password', '').strip()
            new_password = data.get('new_password', '').strip()
            
            if not all([username, current_password, new_password]):
                return JsonResponse({
                    'success': False,
                    'message': 'All fields are required'
                })
            
            # Validate new password strength
            if len(new_password) < 8:
                return JsonResponse({
                    'success': False,
                    'message': 'Password must be at least 8 characters long'
                })
            
            # Check if password contains uppercase, lowercase, and numbers
            has_upper = any(c.isupper() for c in new_password)
            has_lower = any(c.islower() for c in new_password)
            has_digit = any(c.isdigit() for c in new_password)
            
            if not (has_upper and has_lower and has_digit):
                return JsonResponse({
                    'success': False,
                    'message': 'Password must include uppercase, lowercase, and numbers'
                })
            
            # Load existing passwords from DB
            passwords_data = _load_user_passwords()
            
            # Verify current password
            if username in passwords_data:
                if passwords_data[username] != current_password:
                    return JsonResponse({
                        'success': False,
                        'message': 'Current password is incorrect'
                    })
            else:
                # First time setting password
                pass
            
            # Update password
            passwords_data[username] = new_password
            
            # Save passwords to DB
            _save_user_passwords(passwords_data)
            
            return JsonResponse({
                'success': True,
                'message': 'Password changed successfully'
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error changing password: {str(e)}'
            }, status=500)
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_update_profile(request):
    """API endpoint to update user profile details (email, phone, roll number, name)."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        username = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip()
        phone = (data.get('phone') or '').strip()
        roll_number = (data.get('roll_number') or '').strip()
        name = (data.get('name') or username).strip()

        if not username:
            return JsonResponse({'success': False, 'message': 'Username is required'}, status=400)

        profiles = _load_user_profiles()

        # Keep existing registered_date if present
        registered_date = profiles.get(username, {}).get('registered_date')
        if not registered_date:
            registered_date = datetime.now().isoformat()

        profiles[username] = {
            'username': username,
            'name': name or username,
            'email': email,
            'phone': phone,
            'roll_number': roll_number,
            'registered_date': registered_date,
        }

        _save_user_profiles(profiles)

        return JsonResponse({'success': True, 'message': 'Profile updated successfully', 'user': profiles[username]})
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error updating profile: {str(e)}'}, status=500)


@csrf_exempt
def api_update_face_photo(request):
    """API endpoint to update user's face photo and regenerate face encodings."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        data = json.loads(request.body)
        username = (data.get('username') or '').strip()
        image_data = data.get('image', '')

        if not username:
            return JsonResponse({'success': False, 'message': 'Username is required'}, status=400)
        
        if not image_data or not image_data.startswith('data:image'):
            return JsonResponse({'success': False, 'message': 'Valid image data is required'}, status=400)

        # Decode base64 image
        try:
            image_data = image_data.split(',')[1]
            image_bytes = base64.b64decode(image_data)
            image = Image.open(BytesIO(image_bytes))
            image_np = np.array(image)
        except Exception as e:
            return JsonResponse({'success': False, 'message': f'Invalid image format: {str(e)}'}, status=400)

        known_faces_dir = _get_known_faces_dir() / username
        known_faces_dir.mkdir(parents=True, exist_ok=True)

        # Save new photo
        photo_path = known_faces_dir / f'{username}_profile.jpg'
        image.save(photo_path)

        # Generate face encodings using face_recognition
        try:
            import face_recognition
            image_np = np.array(image)
            face_locations = face_recognition.face_locations(image_np)
            if not face_locations:
                return JsonResponse({'success': False, 'message': 'No face detected in image.'})
            face_encodings = face_recognition.face_encodings(image_np, face_locations)
            if not face_encodings:
                return JsonResponse({'success': False, 'message': 'Could not generate face encoding.'})
            # Load encodings from DB
            encodings_data = _load_face_encodings()
            recognized_user = None
            for user, encoding in encodings_data.items():
                known_encoding = np.array(encoding)
                matches = face_recognition.compare_faces([known_encoding], face_encodings[0])
                if matches[0]:
                    recognized_user = user
                    break
            if not recognized_user:
                return JsonResponse({'success': False, 'message': 'Face not recognized.'})
            # ... mark attendance ...
        except ImportError:
            # fallback to histogram method
            pass
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error updating face photo: {str(e)}'}, status=500)


@csrf_exempt
def api_chat(request):
    """API endpoint to chat with OpenAI using project-style JSON responses."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Invalid request method'})

    try:
        payload = json.loads(request.body or '{}')
        user_message = (payload.get('message') or '').strip()

        if not user_message:
            return JsonResponse({'success': False, 'message': 'message is required'}, status=400)

        api_key = _get_openai_key()
        if not api_key:
            return JsonResponse({
                'success': False,
                'message': 'OPENAI_API_KEY is not configured in environment (.env).'
            }, status=500)

        try:
            from openai import OpenAI
        except Exception:
            return JsonResponse({
                'success': False,
                'message': 'openai package not installed. Please install dependencies.'
            }, status=500)

        client = OpenAI(api_key=api_key)
        model_name = _get_openai_model()

        response = client.responses.create(
            model=model_name,
            input=[
                {
                    'role': 'system',
                    'content': 'You are a helpful assistant for a face-recognition attendance system.'
                },
                {
                    'role': 'user',
                    'content': user_message
                }
            ]
        )

        reply = getattr(response, 'output_text', '') or ''
        if not reply:
            reply = 'No response generated.'

        return JsonResponse({
            'success': True,
            'reply': reply,
            'model': model_name
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)


@csrf_exempt
def api_sync_known_faces_db(request):
    """Sync known_faces folders to attendance.db known_faces table."""
    if request.method not in ['POST', 'GET']:
        return JsonResponse({'success': False, 'message': 'Invalid request method'}, status=405)

    try:
        result = _sync_known_faces_to_db()
        return JsonResponse({
            'success': True,
            'message': 'known_faces synced to attendance.db successfully',
            'result': result,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': f'Error: {str(e)}'}, status=500)
