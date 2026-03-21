// Register Face Page JavaScript

let registerStream = null;
const registerVideo = document.getElementById('registerVideo');
const registerCanvas = document.getElementById('registerCanvas');
const nameInput = document.getElementById('nameInput');
const usernameInput = document.getElementById('usernameInput');
const passwordInput = document.getElementById('passwordInput');
const rollNumberInput = document.getElementById('rollNumberInput');
const emailInput = document.getElementById('emailInput');
const capturedImagesContainer = document.getElementById('capturedImagesContainer');
const captureRegisterBtn = document.getElementById('captureRegisterBtn');
const startRegisterCameraBtn = document.getElementById('startRegisterCameraBtn');
const stopRegisterCameraBtn = document.getElementById('stopRegisterCameraBtn');
const registerSubmitBtn = document.getElementById('registerSubmitBtn');
const registerStatus = document.getElementById('registerStatus');

let capturedImages = [];

// Initialize button states
function updateButtonStates() {
    const hasCapturedImages = capturedImages.length > 0;
    const hasName = nameInput.value.trim().length > 0;
    const hasUsername = usernameInput.value.trim().length > 0;
    const hasPassword = passwordInput.value.trim().length > 0;
    const hasRollNumber = rollNumberInput.value.trim().length > 0;
    const hasEmail = emailInput.value.trim().length > 0;
    const isCameraRunning = registerStream !== null;
    
    // Toggle camera-related controls based on running state
    startRegisterCameraBtn.disabled = isCameraRunning;
    stopRegisterCameraBtn.disabled = !isCameraRunning;
    captureRegisterBtn.disabled = !isCameraRunning;
    
    // Register button enabled only when have name, username, password, roll number, email and captured images
    registerSubmitBtn.disabled = !(hasName && hasUsername && hasPassword && hasRollNumber && hasEmail && hasCapturedImages);
    
    console.log('Button states updated:', {
        isCameraRunning,
        hasName,
        hasUsername,
        hasPassword,
        hasRollNumber,
        hasEmail,
        hasCapturedImages,
        captureEnabled: !captureRegisterBtn.disabled,
        startEnabled: !startRegisterCameraBtn.disabled,
        stopEnabled: !stopRegisterCameraBtn.disabled,
        registerEnabled: !registerSubmitBtn.disabled
    });
}

// Start Camera
startRegisterCameraBtn.addEventListener('click', async () => {
    console.log('[Camera] Starting camera...');
    try {
        // Stop any existing streams first
        if (registerStream) {
            registerStream.getTracks().forEach(track => track.stop());
            registerStream = null;
        }
        
        // Try different camera constraints
        let constraints = {
            video: { 
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        };
        
        try {
            registerStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
            // Fallback to simpler constraints
            console.log('[Camera] Retrying with simpler constraints...');
            registerStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });
        }
        
        // Play the video
        registerVideo.srcObject = registerStream;
        registerVideo.play().catch(err => {
            console.error('[Camera] Play error:', err);
        });
        
        registerVideo.style.display = 'block';
        startRegisterCameraBtn.disabled = true;
        showStatus('✓ Camera started - Position your face in the frame', 'success');
        console.log('[Camera] Camera started successfully');
        updateButtonStates();
    } catch (error) {
        console.error('[Camera] Error:', error);
        let errorMsg = error.message;
        
        // Provide specific error handling
        if (error.name === 'NotAllowedError') {
            errorMsg = 'Camera permission denied. Please allow camera access in your browser settings.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMsg = 'No camera found. Please connect a camera device.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMsg = 'Camera is in use by another application. Please close other apps using the camera.';
        }
        
        showStatus('❌ Error: ' + errorMsg, 'error');
        registerStream = null;
        updateButtonStates();
    }
});

// Stop Camera
stopRegisterCameraBtn.addEventListener('click', () => {
    console.log('[Camera] Stopping camera...');
    try {
        if (registerStream) {
            // Stop all tracks properly
            registerStream.getTracks().forEach(track => {
                track.stop();
                console.log('[Camera] Track stopped:', track.kind);
            });
            registerStream = null;
        }
        
        // Clear video source
        registerVideo.srcObject = null;
        registerVideo.style.display = 'none';
        startRegisterCameraBtn.disabled = false;
        showStatus('Camera stopped', 'info');
        console.log('[Camera] Camera stopped successfully');
        updateButtonStates();
    } catch (error) {
        console.error('[Camera] Error stopping camera:', error);
        registerStream = null;
        registerVideo.srcObject = null;
    }
});

// Capture Image for Registration
captureRegisterBtn.addEventListener('click', async () => {
    console.log('[Capture] Starting capture...');
    
    if (!registerStream) {
        showStatus('❌ Please start the camera first', 'error');
        return;
    }

    if (!nameInput.value.trim()) {
        showStatus('❌ Please enter your name first', 'error');
        return;
    }

    if (!usernameInput.value.trim()) {
        showStatus('❌ Please enter a username first', 'error');
        return;
    }

    if (!passwordInput.value.trim()) {
        showStatus('❌ Please enter a password first', 'error');
        return;
    }

    try {
        console.log('[Capture] Canvas dimensions:', {
            videoWidth: registerVideo.videoWidth,
            videoHeight: registerVideo.videoHeight
        });
        
        const context = registerCanvas.getContext('2d');
        registerCanvas.width = registerVideo.videoWidth;
        registerCanvas.height = registerVideo.videoHeight;
        context.drawImage(registerVideo, 0, 0);

        const imageData = registerCanvas.toDataURL('image/jpeg', 0.95);
        capturedImages.push(imageData);

        console.log('[Capture] Image captured, total images:', capturedImages.length);

        // Display captured image
        const imgElement = document.createElement('img');
        imgElement.src = imageData;
        imgElement.className = 'captured-image';
        imgElement.style.maxWidth = '120px';
        imgElement.style.margin = '5px';
        imgElement.style.borderRadius = '8px';
        imgElement.style.border = '2px solid green';
        capturedImagesContainer.appendChild(imgElement);

        showStatus(`✓ Image captured (${capturedImages.length}/${3})`, 'success');
        updateButtonStates();
    } catch (error) {
        console.error('[Capture] Error:', error);
        showStatus('❌ Error capturing image: ' + error.message, 'error');
    }
});

// Register Face
registerSubmitBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    const rollNumber = rollNumberInput.value.trim();

    console.log('[Register] Starting registration for:', name);

    if (!name) {
        showStatus('❌ Please enter your name', 'error');
        return;
    }

    if (!username) {
        showStatus('❌ Please enter a username', 'error');
        return;
    }

    if (!password) {
        showStatus('❌ Please enter a password', 'error');
        return;
    }

    if (!rollNumber) {
        showStatus('❌ Please enter your roll number', 'error');
        return;
    }

    if (!emailInput.value.trim()) {
        showStatus('❌ Please enter your email address', 'error');
        return;
    }

    if (capturedImages.length === 0) {
        showStatus('❌ Please capture at least one image', 'error');
        return;
    }

    try {
        registerSubmitBtn.disabled = true;
        showStatus('⏳ Registering face... This may take a moment', 'info');
        
        console.log('[Register] Sending registration request for:', name);
        console.log('[Register] Captured images count:', capturedImages.length);

        // Register all captured images
        const response = await fetch('/api/register_face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                username: username,
                password: password,
                roll_number: rollNumber,
                email: emailInput.value,
                phone: '',
                image: capturedImages[0],
                images: capturedImages
            })
        });

        console.log('[Register] Response status:', response.status);
        const data = await response.json();
        console.log('[Register] Response data:', data);

        if (data.success) {
            const savedCount = Number(data.saved_images_count || 0);
            const countSuffix = savedCount > 0 ? ` (${savedCount} image${savedCount === 1 ? '' : 's'} saved)` : '';
            showStatus('✓ ' + data.message + countSuffix, 'success');
            console.log('[Register] Registration successful!');

            // Stop camera immediately after successful registration
            if (registerStream) {
                registerStream.getTracks().forEach(track => track.stop());
                registerStream = null;
            }
            registerVideo.srcObject = null;
            registerVideo.style.display = 'none';
            startRegisterCameraBtn.disabled = false;

            // Reset form after 2 seconds
            setTimeout(() => {
                nameInput.value = '';
                usernameInput.value = '';
                passwordInput.value = '';
                rollNumberInput.value = '';
                capturedImages = [];
                capturedImagesContainer.innerHTML = '';
                registerSubmitBtn.disabled = false;
                updateButtonStates();
                showStatus('Ready for next registration', 'info');
            }, 2000);
        } else {
            showStatus('❌ ' + (data.message || 'Registration failed'), 'error');
            console.error('[Register] Registration failed:', data.message);
            registerSubmitBtn.disabled = false;
            updateButtonStates();
        }
    } catch (error) {
        console.error('[Register] Exception:', error);
        showStatus('❌ Error: ' + error.message, 'error');
        registerSubmitBtn.disabled = false;
        updateButtonStates();
    }
});

function showStatus(message, type) {
    registerStatus.textContent = message;
    registerStatus.className = 'status-message show ' + type;
    console.log('[Status]', type.toUpperCase() + ':', message);
    setTimeout(() => {
        registerStatus.classList.remove('show');
    }, 5000);
}

// Update button states when name changes
nameInput.addEventListener('input', () => {
    updateButtonStates();
});

usernameInput.addEventListener('input', () => {
    updateButtonStates();
});

passwordInput.addEventListener('input', () => {
    updateButtonStates();
});

rollNumberInput.addEventListener('input', () => {
    updateButtonStates();
});

emailInput.addEventListener('input', () => {
    updateButtonStates();
});

// Initialize - set proper button states on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('[Init] Initializing register page...');
    
    // Disable buttons initially
    captureRegisterBtn.disabled = true;
    stopRegisterCameraBtn.disabled = true;
    registerSubmitBtn.disabled = true;
    
    updateButtonStates();
    showStatus('Welcome! Enter your details and click "Start Camera"', 'info');
    
    console.log('[Init] Button elements loaded:', {
        startBtn: startRegisterCameraBtn ? '✓' : '✗',
        stopBtn: stopRegisterCameraBtn ? '✓' : '✗',
        captureBtn: captureRegisterBtn ? '✓' : '✗',
        submitBtn: registerSubmitBtn ? '✓' : '✗'
    });
});
