// User Profile Management JavaScript

let currentUsername = '';
let profileVideo = null;
let profileCanvas = null;
let profileStream = null;
let capturedProfileImage = null;

function resolveUsername() {
    // Prefer previously stored username
    if (currentUsername) return currentUsername;
    const fromInput = document.getElementById('username');
    const value = (fromInput && fromInput.value) ? fromInput.value.trim() : '';
    if (value) {
        currentUsername = value;
        return currentUsername;
    }
    const stored = localStorage.getItem('userUsername') || '';
    currentUsername = stored;
    return currentUsername;
}

// Initialize profile page
document.addEventListener('DOMContentLoaded', function() {
    // Prefer an active session, but don't hard-redirect; show placeholders if missing
    const storedUsername = localStorage.getItem('userUsername') || '';
    const storedName = localStorage.getItem('userName') || '';
    currentUsername = storedUsername;

    // Prefill display name while data loads
    const nameEl = document.getElementById('userDisplayName');
    if (nameEl) nameEl.textContent = storedName || 'User';

    loadUserProfile();
    setupEventListeners();
});

function loadUserProfile() {
    if (!currentUsername) {
        // No username stored, show placeholders
        console.log('[Profile] No username found, showing placeholders');
        return;
    }

    fetch(`/api/user_attendance/${currentUsername}`)
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                showStatus(data.message || 'Failed to load profile', 'error');
                return;
            }

            const user = data.user || {};
            
            // Display user info
            document.getElementById('userDisplayName').textContent = user.name || currentUsername;
            document.getElementById('profileName').textContent = user.name || 'User';
            document.getElementById('profileUsername').textContent = '@' + currentUsername;
            document.getElementById('fullName').value = user.name || '';
            document.getElementById('username').value = currentUsername;
            document.getElementById('email').value = user.email || '';
            document.getElementById('phone').value = user.phone || '';
            document.getElementById('rollNumber').value = user.roll_number || '';
            
            // Format registered date
            if (user.registered_date) {
                const dateObj = new Date(user.registered_date);
                document.getElementById('registeredDate').value = dateObj.toLocaleDateString();
            }
            
            // Set avatar initials
            const initials = (user.name || 'U').split(' ').map(n => n[0]).join('').toUpperCase();
            document.getElementById('avatarInitials').textContent = initials;
            
            // Calculate stats (works even if attendance is empty)
            calculateStats(data.attendance || []);
        })
        .catch(error => {
            console.error('Error loading profile:', error);
            showStatus('Failed to load profile', 'error');
        });
}

function calculateStats(attendanceData) {
    if (!attendanceData || attendanceData.length === 0) {
        document.getElementById('totalDays').textContent = '0';
        document.getElementById('attendancePercentage').textContent = '0%';
        document.getElementById('lastCheckin').textContent = 'Never';
        return;
    }

    // Calculate total days present
    const presentDays = attendanceData.filter(record => record.status === 'Present').length;
    document.getElementById('totalDays').textContent = presentDays;

    // Calculate attendance percentage
    const percentage = Math.round((presentDays / attendanceData.length) * 100);
    document.getElementById('attendancePercentage').textContent = percentage + '%';

    // Get last check-in
    if (attendanceData.length > 0) {
        const lastRecord = attendanceData[0];
        const lastDate = new Date(lastRecord.timestamp);
        document.getElementById('lastCheckin').textContent = lastDate.toLocaleDateString() + ' ' + lastDate.toLocaleTimeString();
    }
}

function setupEventListeners() {
    const profileForm = document.getElementById('profileForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const updatePhotoBtn = document.getElementById('updatePhotoBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const modal = document.getElementById('updatePhotoModal');
    const closeModal = document.querySelector('.close-modal');
    const startCameraBtn = document.getElementById('startCameraBtn');
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');

    profileForm.addEventListener('submit', saveProfileChanges);
    logoutBtn.addEventListener('click', logout);
    cancelBtn.addEventListener('click', resetForm);
    updatePhotoBtn.addEventListener('click', () => modal.style.display = 'block');
    closeModal.addEventListener('click', () => modal.style.display = 'none');
    startCameraBtn.addEventListener('click', startCamera);
    capturePhotoBtn.addEventListener('click', capturePhoto);
    uploadPhotoBtn.addEventListener('click', uploadPhoto);

    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

async function saveProfileChanges(event) {
    event.preventDefault();

    const username = resolveUsername();
    if (!username) {
        showStatus('No username available. Please log in again.', 'error');
        return;
    }

    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const rollNumber = document.getElementById('rollNumber').value;
    const name = document.getElementById('fullName').value || currentUsername;

    try {
        const response = await fetch('/api/update_profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                username: username,
                email: email,
                phone: phone,
                roll_number: rollNumber,
                name: name
            })
        });

        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            showStatus(data.message || `Failed to update profile (status ${response.status})`, 'error');
            return;
        }

        showStatus('Profile updated successfully!', 'success');
        loadUserProfile();
    } catch (error) {
        console.error('Error saving profile:', error);
        showStatus('Error saving profile: ' + error.message, 'error');
    }
}

function resetForm() {
    loadUserProfile();
}

async function startCamera() {
    const startBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('capturePhotoBtn');
    
    try {
        profileVideo = document.getElementById('profileVideo');
        profileCanvas = document.getElementById('profileCanvas');
        
        profileStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
        });
        
        profileVideo.srcObject = profileStream;
        startBtn.textContent = 'Stop Camera';
        startBtn.onclick = stopCamera;
        captureBtn.disabled = false;
    } catch (error) {
        console.error('Error accessing camera:', error);
        showStatus('Camera access denied: ' + error.message, 'error');
    }
}

function stopCamera() {
    if (profileStream) {
        profileStream.getTracks().forEach(track => track.stop());
        profileStream = null;
    }
    
    const startBtn = document.getElementById('startCameraBtn');
    const captureBtn = document.getElementById('capturePhotoBtn');
    startBtn.textContent = 'Start Camera';
    startBtn.onclick = startCamera;
    captureBtn.disabled = true;
    
    // Clear preview
    document.getElementById('capturedPreview').innerHTML = '';
    capturedProfileImage = null;
}

function capturePhoto() {
    if (!profileVideo || !profileCanvas) return;

    const ctx = profileCanvas.getContext('2d');
    profileCanvas.width = profileVideo.videoWidth;
    profileCanvas.height = profileVideo.videoHeight;
    ctx.drawImage(profileVideo, 0, 0);
    
    capturedProfileImage = profileCanvas.toDataURL('image/jpeg');
    
    // Show preview
    const preview = document.getElementById('capturedPreview');
    preview.innerHTML = '<img src="' + capturedProfileImage + '" alt="Captured photo" style="max-width: 100%; border-radius: 8px; margin: 10px 0;">';
    
    // Enable upload button
    document.getElementById('uploadPhotoBtn').disabled = false;
}

async function uploadPhoto() {
    if (!capturedProfileImage) {
        showStatus('Please capture a photo first', 'warning');
        return;
    }

    const username = resolveUsername();
    if (!username) {
        showStatus('No username available. Please log in again.', 'error');
        return;
    }

    try {
        const response = await fetch('/api/update_face_photo', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({
                username: username,
                image: capturedProfileImage
            })
        });

        const data = await parseJsonResponse(response);
        if (!response.ok || !data.success) {
            showStatus(data.message || `Failed to update face photo (status ${response.status})`, 'error');
            return;
        }

        showStatus('Face photo updated successfully!', 'success');
        stopCamera();
        document.getElementById('updatePhotoModal').style.display = 'none';
    } catch (error) {
        console.error('Error uploading photo:', error);
        showStatus('Error uploading photo: ' + error.message, 'error');
    }
}

function getCSRFToken() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
}

async function parseJsonResponse(response) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }
    // Fall back to text to avoid "Unexpected token <" errors when HTML is returned
    const text = await response.text();
    return { success: false, message: text.slice(0, 200) };
}

function logout() {
    localStorage.removeItem('loggedInUser');
    localStorage.removeItem('userSession');
    localStorage.removeItem('userUsername');
    localStorage.removeItem('userName');
    window.location.href = '/user_login';
}

function showStatus(message, type) {
    const statusEl = document.getElementById('profileStatus');
    statusEl.textContent = message;
    statusEl.className = 'status-message show ' + type;
    setTimeout(() => statusEl.classList.remove('show'), 4000);
}
