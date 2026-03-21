// Register Face Page JavaScript

let registerStream = null;
const registerVideo = document.getElementById('registerVideo');
const registerCanvas = document.getElementById('registerCanvas');
const nameInput = document.getElementById('nameInput');
const capturedImagesContainer = document.getElementById('capturedImagesContainer');
const captureRegisterBtn = document.getElementById('captureRegisterBtn');
const startRegisterCameraBtn = document.getElementById('startRegisterCameraBtn');
const stopRegisterCameraBtn = document.getElementById('stopRegisterCameraBtn');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');
const registerStatus = document.getElementById('registerStatus');

if (!registerVideo || !registerCanvas || !nameInput || !capturedImagesContainer || !startRegisterCameraBtn || !stopRegisterCameraBtn || !registerSubmitBtn || !registerStatus) {
    console.warn('[Init] Legacy register.js skipped because required DOM elements were not found.');
} else {

let capturedImages = [];

// Start Camera
startRegisterCameraBtn.addEventListener('click', async () => {
    try {
        registerStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
        });
        registerVideo.srcObject = registerStream;
        registerVideo.style.display = 'block';
        startRegisterCameraBtn.disabled = true;
        stopRegisterCameraBtn.disabled = false;
        showStatus('Camera started', 'info');
    } catch (error) {
        showStatus('Error: Could not access camera. ' + error.message, 'error');
    }
});

// Stop Camera
stopRegisterCameraBtn.addEventListener('click', () => {
    if (registerStream) {
        registerStream.getTracks().forEach(track => track.stop());
        registerVideo.style.display = 'none';
        startRegisterCameraBtn.disabled = false;
        stopRegisterCameraBtn.disabled = true;
        showStatus('Camera stopped', 'info');
    }
});

// Capture Image for Registration
captureRegisterBtn.addEventListener('click', async () => {
    if (!registerStream) {
        showStatus('Please start the camera first', 'error');
        return;
    }

    if (!nameInput.value.trim()) {
        showStatus('Please enter your name first', 'error');
        return;
    }

    try {
        const context = registerCanvas.getContext('2d');
        registerCanvas.width = registerVideo.videoWidth;
        registerCanvas.height = registerVideo.videoHeight;
        context.drawImage(registerVideo, 0, 0);

        const imageData = registerCanvas.toDataURL('image/jpeg');
        capturedImages.push(imageData);

        // Display captured image
        const imgElement = document.createElement('img');
        imgElement.src = imageData;
        imgElement.className = 'captured-image';
        capturedImagesContainer.appendChild(imgElement);

        showStatus(`Image captured (${capturedImages.length})`, 'success');
    } catch (error) {
        showStatus('Error capturing image: ' + error.message, 'error');
    }
});

// Register Face
registerSubmitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();

    if (!name) {
        showStatus('Please enter your name', 'error');
        return;
    }

    if (capturedImages.length === 0) {
        showStatus('Please capture at least one image', 'error');
        return;
    }

    try {
        registerSubmitBtn.disabled = true;
        showStatus('Registering face...', 'info');

        // Register first image (or you can register all images)
        const response = await fetch('/api/register_face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                image: capturedImages[0]
            })
        });

        const data = await response.json();

        if (data.success) {
            showStatus(data.message, 'success');
            // Reset form
            setTimeout(() => {
                nameInput.value = '';
                capturedImages = [];
                capturedImagesContainer.innerHTML = '';
                registerSubmitBtn.disabled = false;
            }, 2000);
        } else {
            showStatus(data.message, 'error');
            registerSubmitBtn.disabled = false;
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        registerSubmitBtn.disabled = false;
    }
});

function showStatus(message, type) {
    registerStatus.textContent = message;
    registerStatus.className = 'status-message show ' + type;
    setTimeout(() => {
        registerStatus.classList.remove('show');
    }, 4000);
}

// Initialize
stopRegisterCameraBtn.disabled = true;
registerSubmitBtn.disabled = capturedImages.length === 0;
}
