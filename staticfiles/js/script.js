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
    console.log('[Camera] Starting camera...');
    try {
        // Stop any existing streams first
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        // Try with detailed constraints first, then fallback
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });
        } catch (e) {
            console.log('[Camera] Retrying with basic constraints...');
            stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
        }
        
        video.srcObject = stream;
        video.style.display = 'block';
        startCameraBtn.disabled = true;
        stopCameraBtn.disabled = false;
        showStatus('✓ Camera started - Position your face in frame', 'success');
        console.log('[Camera] Camera started successfully');
    } catch (error) {
        console.error('[Camera] Error:', error);
        let errorMsg = error.message;
        if (error.name === 'NotAllowedError') {
            errorMsg = 'Camera permission denied. Please allow camera access.';
        } else if (error.name === 'NotFoundError') {
            errorMsg = 'No camera found. Please connect a camera device.';
        } else if (error.name === 'NotReadableError') {
            errorMsg = 'Camera is in use by another application.';
        }
        showStatus('❌ Error: ' + errorMsg, 'error');
        stream = null;
    }
});

// Stop Camera
stopCameraBtn.addEventListener('click', () => {
    console.log('[Camera] Stopping camera...');
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop();
            console.log('[Camera] Track stopped:', track.kind);
        });
        video.srcObject = null;
        video.style.display = 'none';
        startCameraBtn.disabled = false;
        stopCameraBtn.disabled = true;
        showStatus('Camera stopped', 'info');
    }
});

// Capture Face and Mark Attendance
captureBtn.addEventListener('click', async () => {
    if (!stream) {
        showStatus('❌ Please start the camera first', 'error');
        return;
    }

    try {
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.95);

        captureBtn.disabled = true;
        showStatus('⏳ Processing face... Please wait', 'info');
        console.log('[Attendance] Sending face detection request...');

        const response = await fetch('/api/mark_attendance_face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: imageData })
        });

        console.log('[Attendance] Response status:', response.status);
        const data = await response.json();
        console.log('[Attendance] Response:', data);

        if (data.success) {
            showStatus('✓ ' + data.message, 'success');
            resultText.innerHTML = `
                <strong>✓ Attendance Marked Successfully!</strong><br>
                Name: ${data.name}<br>
                Time: ${data.timestamp}<br>
                Status: ${data.status}<br>
                Mode: ${data.mode || 'Face Recognition'}
            `;
            result.classList.add('show');
            setTimeout(() => {
                result.classList.remove('show');
            }, 5000);
            console.log('[Attendance] Success:', data.name);
        } else {
            showStatus('❌ ' + (data.message || 'Face recognition failed'), 'error');
            console.error('[Attendance] Error:', data.message);
            
            // Show user list if available
            if (data.registered_users) {
                resultText.innerHTML = `
                    <strong>Registered Users:</strong><br>
                    ${data.registered_users.join('<br>')}
                `;
                result.classList.add('show');
            }
        }

        captureBtn.disabled = false;
    } catch (error) {
        console.error('[Attendance] Exception:', error);
        showStatus('❌ Error: ' + error.message, 'error');
        captureBtn.disabled = false;
    }
});

function showStatus(message, type) {
    console.log('[Status]', type.toUpperCase(), message);
    status.textContent = message;
    status.className = 'status-message show ' + type;
    setTimeout(() => {
        status.classList.remove('show');
    }, 5000);
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Init] Initializing attendance page...');
    stopCameraBtn.disabled = true;
    showStatus('Ready! Click "Start Camera" to begin', 'info');
});
