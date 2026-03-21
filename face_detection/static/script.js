// Mark Attendance Page JavaScript

let stream = null;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const status = document.getElementById('status');
const result = document.getElementById('result');
const resultText = document.getElementById('resultText');

// Start Camera
startCameraBtn.addEventListener('click', async () => {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
        });
        video.srcObject = stream;
        video.style.display = 'block';
        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        showStatus('Camera started', 'info');
    } catch (error) {
        showStatus('Error: Could not access camera. ' + error.message, 'error');
    }
});

// Stop Camera
stopCameraBtn.addEventListener('click', () => {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.style.display = 'none';
        startCameraBtn.disabled = false;
        stopCameraBtn.disabled = true;
        showStatus('Camera stopped', 'info');
    }
});

// Capture Face and Mark Attendance
captureBtn.addEventListener('click', async () => {
    if (!stream) {
        showStatus('Please start the camera first', 'error');
        return;
    }

    try {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg');

        captureBtn.disabled = true;
        showStatus('Processing face...', 'info');

        const response = await fetch('/api/mark_attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: imageData })
        });

        const data = await response.json();

        if (data.success) {
            showStatus(data.message, 'success');
            resultText.textContent = data.message;
            result.classList.add('show');
            setTimeout(() => {
                result.classList.remove('show');
            }, 5000);
        } else {
            showStatus(data.message, 'error');
        }

        captureBtn.disabled = false;
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        captureBtn.disabled = false;
    }
});

function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status-message show ' + type;
    setTimeout(() => {
        status.classList.remove('show');
    }, 4000);
}

// Initialize
stopCameraBtn.disabled = true;
