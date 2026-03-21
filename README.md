# Face Recognition Attendance System

This **Face Recognition Attendance System** is built with Django + OpenCV for real-time face registration and automatic attendance marking.

## Why this project

This project helps colleges, classes, and teams automate attendance using webcam-based face recognition.

### Core features

- Face registration with webcam image input
- Auto attendance via face match
- Reject unregistered faces
- Attendance records via API and UI
- Admin + user dashboards

## Tech stack

- Python
- Django
- OpenCV (headless for cloud)
- NumPy
- Pillow
- SQLite (default)

## Project structure

- `Face_Detection_Project/` — Django project settings and root URLs
- `face_detection/` — Main app (views, routes, templates, static files)
- `face_detection/data/` — Attendance and encoding files
- `face_detection/known_faces/` — Stored face images

## Main routes

- `/` — Home / live detection
- `/register/` — Face registration page
- `/attendance_record/` — Attendance records page
- `/admin/` — Admin dashboard
- `/user-login/` — User login

## API endpoints

- `POST /api/register_face`
- `POST /api/mark_attendance_face`
- `GET /api/attendance_list`
- `GET /api/registered_people`
- `GET /api/database_status`
- `POST /api/admin_login`
- `POST /api/user_login`

## Run locally

1. Install dependencies
2. Apply migrations
3. Start Django server
4. Open `http://127.0.0.1:8000/`





## Notes

- Use `opencv-python-headless` for better cloud compatibility.
- For production persistence, prefer PostgreSQL over SQLite.
- If any API key was exposed publicly, rotate it immediately.