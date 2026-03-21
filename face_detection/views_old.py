from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json

# Create your views here.

def index(request):
    """Main page - shows live detection"""
    return render(request, 'live_detection.html')

def live_detection(request):
    """Live detection page"""
    return render(request, 'live_detection.html')

def register(request):
    """Register face page"""
    return render(request, 'register.html')

def attendance_record(request):
    """View attendance records page"""
    return render(request, 'attendance.html')

def admin_dashboard(request):
    """Admin dashboard page"""
    return render(request, 'admin_dashboard.html')

def login(request):
    """Login page"""
    return render(request, 'login.html')

def user_login(request):
    """User login page"""
    return render(request, 'user_login.html')

def admin_login(request):
    """Admin login page"""
    return render(request, 'Admin_login.html')

def user_dashboard(request):
    """User dashboard page"""
    return render(request, 'user_dashboard.html')

def user_profile(request):
    """User profile page"""
    return render(request, 'user_profile.html')

def mark_attendance(request):
    """Mark attendance page"""
    return render(request, 'mark_attendance.html')

def admin_view_users(request):
    """Admin view users page"""
    return render(request, 'admin_view_users.html')

def registration_success(request):
    """Registration success page"""
    return render(request, 'registration_success.html')

def database_status(request):
    """Database status page"""
    return render(request, 'database_status.html')

def forgot_password(request):
    """Forgot password page"""
    return render(request, 'forgot_password.html')


# API Endpoints
@csrf_exempt
def api_admin_login(request):
    """API endpoint for admin login"""
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username', '')
            password = data.get('password', '')
            remember_me = data.get('rememberMe', False)
            
            # Simple authentication (replace with real authentication)
            if username == 'admin' and password == 'admin123':
                return JsonResponse({
                    'success': True,
                    'message': 'Login successful',
                    'redirectUrl': '/admin_dashboard'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'message': 'Invalid username or password'
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
            username = data.get('username', '')
            password = data.get('password', '')
            
            # Simple authentication (replace with real authentication)
            if username and password:
                return JsonResponse({
                    'success': True,
                    'message': 'Login successful',
                    'redirectUrl': '/user_dashboard'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'message': 'Invalid credentials'
                })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_register_face(request):
    """API endpoint for registering user face with face detection"""
    if request.method == 'POST':
        try:
            import base64
            import numpy as np
            from PIL import Image
            from io import BytesIO
            from pathlib import Path
            from datetime import datetime
            import cv2
            import os
            import json as json_module
            
            data = json.loads(request.body)
            username = data.get('username', '').strip()
            image_data = data.get('image', '')
            
            # Validate inputs
            if not username:
                return JsonResponse({
                    'success': False,
                    'message': 'Username is required'
                })
            
            if not image_data:
                return JsonResponse({
                    'success': False,
                    'message': 'No image provided'
                })
            
            # Decode base64 image
            try:
                image_bytes = base64.b64decode(image_data.split(',')[1])
                image = Image.open(BytesIO(image_bytes))
                image_array = np.array(image)
                # Convert to BGR for OpenCV
                if len(image_array.shape) == 3 and image_array.shape[2] == 4:
                    image_cv = cv2.cvtColor(image_array, cv2.COLOR_RGBA2BGR)
                elif len(image_array.shape) == 3 and image_array.shape[2] == 3:
                    image_cv = cv2.cvtColor(image_array, cv2.COLOR_RGB2BGR)
                else:
                    image_cv = image_array
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Invalid image format: {str(e)}'
                })
            
            # Detect face using Haar Cascade
            try:
                face_cascade = cv2.CascadeClassifier(
                    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
                )
                gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY)
                faces = face_cascade.detectMultiScale(gray, 1.3, 5)
                
                if len(faces) == 0:
                    return JsonResponse({
                        'success': False,
                        'message': 'No face detected in image. Please provide a clear face image.'
                    })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Error processing image: {str(e)}'
                })
            
            BASE_DIR = Path(__file__).resolve().parent.parent
            
            # Create user folder in known_faces
            user_folder = BASE_DIR / 'face_detection' / 'known_faces' / username
            user_folder.mkdir(parents=True, exist_ok=True)
            
            # Save the registration image
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            image_path = user_folder / f'face_{timestamp}.jpg'
            image.save(image_path)
            
            # Store simple face encoding (histogram-based) for comparison
            encodings_file = BASE_DIR / 'face_detection' / 'data' / 'face_encodings.json'
            encodings_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Create a simple encoding using histogram
            hist = cv2.calcHist([gray], [0], None, [256], [0, 256])
            hist_normalized = cv2.normalize(hist, hist).flatten().tolist()
            
            # Load existing encodings or create new
            try:
                with open(encodings_file, 'r') as f:
                    encodings_data = json_module.load(f)
            except:
                encodings_data = {}
            
            # Store encodings
            if username not in encodings_data:
                encodings_data[username] = []
            encodings_data[username].append(hist_normalized)
            
            # Save updated encodings
            with open(encodings_file, 'w') as f:
                json_module.dump(encodings_data, f)
            
            # Create attendance record for registration
            attendance_file = BASE_DIR / 'face_detection' / 'data' / 'attendance.csv'
            try:
                with open(attendance_file, 'a') as f:
                    f.write(f'{username},{datetime.now().strftime("%Y-%m-%d %H:%M:%S")},Registered\n')
            except:
                pass
            
            return JsonResponse({
                'success': True,
                'message': f'Face registered successfully for {username}',
                'username': username,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'redirect': '/registration_success'
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error during registration: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_mark_attendance_face(request):
    """API endpoint for marking attendance via face - with real face recognition"""
    if request.method == 'POST':
        try:
            import base64
            import numpy as np
            from PIL import Image
            from io import BytesIO
            from pathlib import Path
            from datetime import datetime
            import face_recognition
            import os
            
            data = json.loads(request.body)
            image_data = data.get('image', '')
            
            if not image_data:
                return JsonResponse({
                    'success': False,
                    'message': 'No image provided',
                    'action': 'register'
                })
            
            # Decode base64 image
            try:
                image_bytes = base64.b64decode(image_data.split(',')[1])
                image = Image.open(BytesIO(image_bytes))
                image_array = np.array(image)
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Invalid image format: {str(e)}'
                })
            
            # Get face encodings from the captured image
            try:
                captured_encodings = face_recognition.face_encodings(image_array)
                if not captured_encodings:
                    return JsonResponse({
                        'success': False,
                        'message': 'No face detected in image',
                        'action': 'register'
                    })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'message': f'Error processing image: {str(e)}'
                })
            
            # Get registered users
            BASE_DIR = Path(__file__).resolve().parent.parent
            known_faces_dir = BASE_DIR / 'face_detection' / 'known_faces'
            
            registered_users = []
            known_face_encodings = {}
            
            if known_faces_dir.exists():
                for user_folder in known_faces_dir.iterdir():
                    if user_folder.is_dir() and not user_folder.name.startswith('.'):
                        registered_users.append(user_folder.name)
                        user_encodings = []
                        
                        # Get all face images from user folder
                        for img_file in user_folder.glob('*.jpg'):
                            try:
                                user_image = face_recognition.load_image_file(str(img_file))
                                user_face_encodings = face_recognition.face_encodings(user_image)
                                user_encodings.extend(user_face_encodings)
                            except:
                                pass
                        
                        if user_encodings:
                            known_face_encodings[user_folder.name] = user_encodings
            
            # If no registered users, reject
            if not registered_users:
                return JsonResponse({
                    'success': False,
                    'message': 'No registered users in the system',
                    'action': 'register',
                    'instruction': 'Please register your face first. No users are registered yet.',
                    'registered_users': []
                })
            
            # Compare captured face with registered users
            recognized_user = None
            best_match_distance = 0.6  # Tolerance threshold (lower is stricter)
            
            for captured_encoding in captured_encodings:
                for user_name, user_encodings in known_face_encodings.items():
                    # Compare with all encodings of this user
                    matches = face_recognition.compare_faces(user_encodings, captured_encoding, tolerance=0.6)
                    distances = face_recognition.face_distance(user_encodings, captured_encoding)
                    
                    if len(distances) > 0:
                        best_match_index = np.argmin(distances)
                        if matches[best_match_index]:
                            recognized_user = user_name
                            break
                
                if recognized_user:
                    break
            
            # If no match found
            if not recognized_user:
                return JsonResponse({
                    'success': False,
                    'message': 'Face not recognized. You are not registered in the system.',
                    'action': 'register',
                    'instruction': 'Your face does not match any registered user. Please register first.',
                    'registered_users': registered_users
                })
            
            # User recognized - AUTO-MARK ATTENDANCE
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            # Log attendance to CSV
            attendance_file = BASE_DIR / 'face_detection' / 'data' / 'attendance.csv'
            attendance_file.parent.mkdir(parents=True, exist_ok=True)
            
            try:
                with open(attendance_file, 'a') as f:
                    f.write(f'{recognized_user},{current_time},Present\n')
            except:
                pass
            
            return JsonResponse({
                'success': True,
                'name': recognized_user,
                'timestamp': current_time,
                'message': f'Attendance marked successfully for {recognized_user}'
            })
            
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_attendance_list(request):
    """API endpoint to get attendance records"""
    if request.method == 'GET':
        try:
            # Sample attendance data (replace with real database queries)
            attendance_records = [
                {
                    'id': 1,
                    'name': 'Milan',
                    'timestamp': '2026-01-07 09:15:23',
                    'status': 'Present'
                },
                {
                    'id': 2,
                    'name': 'Wild',
                    'timestamp': '2026-01-07 09:20:45',
                    'status': 'Present'
                }
            ]
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
    """API endpoint to get registered users"""
    if request.method == 'GET':
        try:
            # Sample user data (replace with real database queries)
            users = [
                {
                    'id': 1,
                    'name': 'Milan',
                    'email': 'milan@example.com',
                    'registered_date': '2026-01-07'
                },
                {
                    'id': 2,
                    'name': 'Wild',
                    'email': 'wild@example.com',
                    'registered_date': '2026-01-07'
                }
            ]
            return JsonResponse({
                'success': True,
                'data': users
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})


@csrf_exempt
def api_database_status(request):
    """API endpoint to get database status"""
    if request.method == 'GET':
        try:
            from pathlib import Path
            import os
            
            BASE_DIR = Path(__file__).resolve().parent.parent
            db_path = BASE_DIR / 'db.sqlite3'
            
            # Check if database exists
            db_exists = db_path.exists()
            db_size = db_path.stat().st_size if db_exists else 0
            
            # Get registered users count
            known_faces_dir = BASE_DIR / 'face_detection' / 'known_faces'
            user_count = 0
            if known_faces_dir.exists():
                user_count = len([d for d in known_faces_dir.iterdir() if d.is_dir() and not d.name.startswith('.')])
            
            # Get total records count (from attendance data)
            attendance_file = BASE_DIR / 'face_detection' / 'data' / 'attendance.csv'
            record_count = 0
            if attendance_file.exists():
                with open(attendance_file, 'r') as f:
                    record_count = len(f.readlines()) - 1  # Subtract header
            
            return JsonResponse({
                'success': True,
                'database_path': str(db_path),
                'database_exists': db_exists,
                'database_size': f'{db_size / 1024:.2f} KB' if db_size > 0 else '0 KB',
                'total_users': user_count,
                'total_records': record_count,
                'status': 'Online' if db_exists else 'Offline'
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'message': f'Error: {str(e)}'
            })
    
    return JsonResponse({'success': False, 'message': 'Invalid request method'})
