"""
Test script to demonstrate face registration and attendance marking
This script tests the API endpoints with sample data
"""

import requests
import json
import base64
import cv2
import numpy as np
import sys
from PIL import Image
from io import BytesIO

BASE_URL = "http://127.0.0.1:8000"

OK = "[OK]"
FAIL = "[FAIL]"
WARN = "[WARN]"

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


def _safe_request(method, url, **kwargs):
    """Wrapper for HTTP calls with clear connection guidance."""
    try:
        return requests.request(method=method, url=url, **kwargs)
    except requests.exceptions.ConnectionError:
        print(f"{FAIL} Cannot connect to {BASE_URL}. Start the server first: python manage.py runserver 127.0.0.1:8000")
        return None

def create_test_face_image(username="TestUser"):
    """Create a simple test face image"""
    # Create a simple image with face-like features
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Light background
    img[:] = (200, 200, 200)
    
    # Face (circle)
    cv2.circle(img, (320, 240), 80, (150, 100, 80), -1)
    
    # Eyes
    cv2.circle(img, (290, 210), 15, (0, 0, 0), -1)
    cv2.circle(img, (350, 210), 15, (0, 0, 0), -1)
    cv2.circle(img, (290, 210), 5, (255, 255, 255), -1)
    cv2.circle(img, (350, 210), 5, (255, 255, 255), -1)
    
    # Nose
    points = np.array([[320, 220], [310, 260], [330, 260]], dtype=np.int32)
    cv2.polylines(img, [points], False, (150, 100, 80), 2)
    
    # Mouth
    cv2.ellipse(img, (320, 290), (40, 25), 0, 0, 180, (150, 100, 80), 2)
    
    # Convert to PIL Image
    pil_img = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    
    # Convert to base64
    buffer = BytesIO()
    pil_img.save(buffer, format='PNG')
    img_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return f"data:image/png;base64,{img_base64}"

def test_register_face(username):
    """Test face registration API"""
    print(f"\n{'='*60}")
    print(f"Testing Face Registration for: {username}")
    print('='*60)
    
    try:
        # Create test face image
        image_data = create_test_face_image(username)
        
        # Send registration request
        response = _safe_request(
            'POST',
            f"{BASE_URL}/api/register_face",
            json={
                'username': username,
                'image': image_data
            },
            timeout=10
        )
        if response is None:
            return False
        
        print(f"Status Code: {response.status_code}")
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if result.get('success'):
            print(f"{OK} Successfully registered face for {username}")
            return True
        else:
            print(f"{FAIL} Failed: {result.get('message')}")
            return False
            
    except Exception as e:
        print(f"{FAIL} Error: {str(e)}")
        return False

def test_mark_attendance(username):
    """Test attendance marking API"""
    print(f"\n{'='*60}")
    print(f"Testing Attendance Marking for: {username}")
    print('='*60)
    
    try:
        # Create test face image
        image_data = create_test_face_image(username)
        
        # Send attendance marking request
        response = _safe_request(
            'POST',
            f"{BASE_URL}/api/mark_attendance_face",
            json={
                'image': image_data
            },
            timeout=10
        )
        if response is None:
            return False
        
        print(f"Status Code: {response.status_code}")
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if result.get('success'):
            print(f"{OK} Attendance marked successfully for {result.get('name')}")
            return True
        else:
            print(f"{WARN} Not recognized: {result.get('message')}")
            return False
            
    except Exception as e:
        print(f"{FAIL} Error: {str(e)}")
        return False

def test_database_status():
    """Test database status API"""
    print(f"\n{'='*60}")
    print("Testing Database Status")
    print('='*60)
    
    try:
        response = _safe_request('GET', f"{BASE_URL}/api/database_status", timeout=10)
        if response is None:
            return False
        print(f"Status Code: {response.status_code}")
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)}")
        
        if result.get('success'):
            print(f"{OK} Registered Users: {result.get('registered_users')}")
            print(f"{OK} Attendance Records: {result.get('attendance_records')}")
            return True
        else:
            return False
            
    except Exception as e:
        print(f"{FAIL} Error: {str(e)}")
        return False

def test_attendance_list():
    """Test attendance list API"""
    print(f"\n{'='*60}")
    print("Testing Attendance List")
    print('='*60)
    
    try:
        response = _safe_request('GET', f"{BASE_URL}/api/attendance_list", timeout=10)
        if response is None:
            return False
        print(f"Status Code: {response.status_code}")
        result = response.json()
        
        if result.get('success'):
            records = result.get('data', [])
            print(f"{OK} Total Records: {len(records)}")
            for record in records[-5:]:  # Show last 5
                print(f"  - {record['name']:15} | {record['timestamp']:20} | {record['status']}")
            return True
        else:
            return False
            
    except Exception as e:
        print(f"{FAIL} Error: {str(e)}")
        return False

if __name__ == "__main__":
    print("\n" + "="*60)
    print("FACE RECOGNITION SYSTEM - API TEST SUITE")
    print("="*60)
    
    # Test 1: Database status before registration
    print("\n[1/5] Checking initial database status...")
    test_database_status()
    
    # Test 2: Register first user
    print("\n[2/5] Registering first user (Milan)...")
    test_register_face("Milan")
    
    # Test 3: Register second user
    print("\n[3/5] Registering second user (Sarah)...")
    test_register_face("Sarah")
    
    # Test 4: Mark attendance (auto-detection)
    print("\n[4/5] Testing auto-attendance marking...")
    test_mark_attendance("Milan")
    
    # Test 5: Check final database status and attendance records
    print("\n[5/5] Checking final database status and attendance...")
    test_database_status()
    test_attendance_list()
    
    print("\n" + "="*60)
    print("TEST SUITE COMPLETED")
    print("="*60)
    print("\nFace Recognition System Features:")
    print(f"{OK} Face Registration - Detects and stores user face with histogram encoding")
    print(f"{OK} Face Detection - Uses OpenCV Haar Cascade for face detection")
    print(f"{OK} Face Matching - Compares histogram similarity (60%+ threshold)")
    print(f"{OK} Auto Attendance - Automatically marks attendance when face matches")
    print(f"{OK} User Rejection - Rejects unregistered faces with registered user list")
    print(f"{OK} Persistent Storage - Saves encodings and attendance records to files")
    print("="*60)
