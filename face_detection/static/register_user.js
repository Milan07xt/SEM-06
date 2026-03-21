// Register User JavaScript

let videoStream = null;
let capturedImage = null;

// Update current time
function updateTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString();
}

setInterval(updateTime, 1000);
updateTime();

// Load admin username
const adminUsername = localStorage.getItem('adminUsername') || 'Admin';
document.getElementById('adminUsername').textContent = adminUsername;

// Camera controls
const videoFeed = document.getElementById('videoFeed');
const videoContainer = document.getElementById('videoContainer');
const startCameraBtn = document.getElementById('startCameraBtn');
const captureBtn = document.getElementById('captureBtn');
const clearBtn = document.getElementById('clearBtn');
const capturedImages = document.getElementById('capturedImages');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');

startCameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', captureImage);
clearBtn.addEventListener('click', clearCapture);

async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        videoFeed.srcObject = videoStream;
        videoContainer.style.display = 'block';
        startCameraBtn.textContent = '⏹️ Stop Camera';
        startCameraBtn.onclick = stopCamera;
        captureBtn.disabled = false;

        showAlert('Camera started successfully', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        showAlert('Failed to access camera. Please check permissions.', 'error');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    videoContainer.style.display = 'none';
    startCameraBtn.textContent = '📹 Start Camera';
    startCameraBtn.onclick = startCamera;
    captureBtn.disabled = true;
}

function captureImage() {
    const canvas = document.getElementById('captureCanvas');
    canvas.width = videoFeed.videoWidth;
    canvas.height = videoFeed.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoFeed, 0, 0);

    capturedImage = canvas.toDataURL('image/jpeg');
    capturedImages.style.display = 'block';
    clearBtn.disabled = false;
    registerSubmitBtn.disabled = false;

    showAlert('Image captured! You can now register the user.', 'success');
}

function clearCapture() {
    capturedImage = null;
    capturedImages.style.display = 'none';
    clearBtn.disabled = true;
    registerSubmitBtn.disabled = true;
    showAlert('Captured image cleared', 'info');
}

// Form submission
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();

    if (!fullName) {
        showAlert('Please enter a full name', 'error');
        return;
    }

    if (!capturedImage) {
        showAlert('Please capture a face image', 'error');
        return;
    }

    registerSubmitBtn.disabled = true;
    registerSubmitBtn.innerHTML = '<span class="spinner"></span> Registering...';

    try {
        const response = await fetch('/api/register_face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: fullName,
                email: email,
                image: capturedImage
            })
        });

        const result = await response.json();

        if (result.success) {
            showAlert(`✓ User "${fullName}" registered successfully!`, 'success');
            
            // Reset form
            document.getElementById('registerForm').reset();
            clearCapture();
            stopCamera();
            
            // Redirect after 2 seconds
            setTimeout(() => {
                location.href = '/admin/users';
            }, 2000);
        } else {
            showAlert(`Error: ${result.message}`, 'error');
            registerSubmitBtn.disabled = false;
            registerSubmitBtn.textContent = '✓ Register User';
        }
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('Failed to register user. Please try again.', 'error');
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.textContent = '✓ Register User';
    }
});

function showAlert(message, type) {
    const alertBox = document.getElementById('alertBox');
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;

    setTimeout(() => {
        alertBox.classList.remove('show');
    }, 5000);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminUsername');
        location.href = '/admin_login';
    }
}
