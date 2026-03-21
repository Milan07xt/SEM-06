// Live Face Detection JavaScript - AUTO DETECTION MODE

let video = null;
let stream = null;
let detectionInterval = null;
let isProcessing = false;
let lastDetectionTime = 0;
const DETECTION_COOLDOWN = 10000; // 10 seconds between detections
let lastAICheckTime = 0;
const AI_CHECK_COOLDOWN = 30000; // 30 seconds between ChatGPT vision checks
let previousFrameForLiveness = null;
let detectionArmed = false;

// Auto-start camera on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎬 Page loaded, initializing auto-detection mode...');
    const subjectOkBtn = document.getElementById('subjectOkBtn');
    const subjectSelect = document.getElementById('subjectSelect');

    if (subjectOkBtn) {
        subjectOkBtn.addEventListener('click', armDetectionWithSubject);
    }

    if (subjectSelect) {
        subjectSelect.addEventListener('change', function() {
            detectionArmed = false;
            updateStatus('📘 Select subject and click OK to start attendance detection', 'normal');
        });
    }

    renderLatestAttendanceDetails();

    startCamera();
});

// Handle page unload
window.addEventListener('beforeunload', function() {
    stopCamera();
    if (detectionInterval) {
        clearInterval(detectionInterval);
    }
});

async function startCamera() {
    try {
        console.log('📹 Starting camera with auto-detection...');
        
        // Stop any existing stream first
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }

        video = document.getElementById('videoFeed');
        
        const constraints = {
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                facingMode: 'user'
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        console.log('✅ Camera started successfully');
        document.getElementById('cameraHelp').style.display = 'none';
        updateStatus('📘 Select subject and click OK to start attendance detection', 'normal');
        
        // Start auto-detection loop after camera is ready
        video.addEventListener('loadedmetadata', () => {
            startAutoDetection();
        });
        
    } catch (error) {
        console.error('❌ Camera error:', error);
        handleCameraError(error);
    }
}

function startAutoDetection() {
    if (detectionInterval) {
        return;
    }

    console.log('🔄 Starting auto-detection loop...');
    if (!detectionArmed) {
        updateStatus('📘 Select subject and click OK to start attendance detection', 'normal');
    } else {
        updateStatus('🔍 Auto-detection active - Position your face', 'normal');
    }
    
    // Check for faces every 3 seconds
    detectionInterval = setInterval(() => {
        if (!isProcessing) {
            const currentTime = Date.now();
            if (currentTime - lastDetectionTime > DETECTION_COOLDOWN) {
                autoDetectAndMarkAttendance();
            }
        }
    }, 3000);
}

function armDetectionWithSubject() {
    const subjectSelect = document.getElementById('subjectSelect');
    const selectedSubject = (subjectSelect?.value || '').trim();

    if (!selectedSubject) {
        detectionArmed = false;
        updateStatus('📘 Please select a subject first, then click OK', 'error');
        return;
    }

    detectionArmed = true;
    updateStatus(`✅ Subject locked: ${selectedSubject}. Detecting face...`, 'normal');
}

async function autoDetectAndMarkAttendance() {
    const canvas = document.getElementById('captureCanvas');
    const video = document.getElementById('videoFeed');
    const subjectSelect = document.getElementById('subjectSelect');
    const selectedSubject = (subjectSelect?.value || '').trim();
    
    if (!video || !video.srcObject || isProcessing) {
        return;
    }

    if (!detectionArmed) {
        return;
    }

    if (!selectedSubject) {
        detectionArmed = false;
        updateStatus('📘 Please select a subject first', 'error');
        return;
    }

    try {
        isProcessing = true;
        console.log('🔍 Auto-detecting face...');
        updateStatus('⏳ Detecting face...', 'normal');
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg');
        console.log('📤 Sending to server for recognition...');
        const shouldUseAI = (Date.now() - lastAICheckTime) > AI_CHECK_COOLDOWN;
        
        const response = await fetch('/api/mark_attendance_face', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image: imageData,
                previous_image: previousFrameForLiveness,
                use_ai_detection: shouldUseAI,
                subject: selectedSubject
            })
        });

        // Always keep last frame for temporal liveness analysis
        previousFrameForLiveness = imageData;

        const result = await response.json();
        console.log('📥 Server response:', result);

        if (result.success) {
            // Success - attendance marked for REGISTERED user only
            lastDetectionTime = Date.now();
            updateStatus(`✅ Attendance marked for ${result.name}!`, 'success');
            const attendanceDetails = buildAttendanceDetails(result, selectedSubject);
            showPopup({
                type: 'success',
                title: '✅ Attendance Marked Successfully!',
                message: `Welcome ${result.name}! Your attendance has been recorded.`,
                details: attendanceDetails
            });
            renderLatestAttendanceDetails(attendanceDetails);
            
            // Keep camera running - auto-close popup after 5 seconds instead of refreshing page
            setTimeout(() => {
                console.log('🔄 Closing success popup, camera continues...');
                closePopup();
                updateStatus('✨ Camera active - Ready for next detection', 'normal');
            }, 5000);
            
        } else {
            if (result.ai_checked) {
                lastAICheckTime = Date.now();
            }

            // Failed - user not registered or no face detected
            if (result.message && result.message.includes('No face detected')) {
                // Silent - no face in frame, keep scanning
                updateStatus('🔍 No face detected - Position your face in frame', 'normal');
                if (result.instruction) {
                    console.log('🤖 AI tip:', result.instruction);
                }
            } else if (result.action === 'liveness') {
                // Liveness failed or needs one more frame
                const livenessMsg = result.instruction || 'Please move slightly or blink and try again.';
                updateStatus(`🛡️ Liveness check: ${livenessMsg}`, 'normal');
            } else if (result.action === 'register') {
                // Face detected but NOT registered - show warning
                lastDetectionTime = Date.now(); // Prevent spam
                updateStatus('⚠️ Unregistered Face Detected!', 'error');
                showPopup({
                    type: 'register',
                    title: '🚫 Unregistered User',
                    message: result.message || 'Your face is not registered in the system.',
                    instruction: result.instruction || 'Please register your face first by clicking the button below.',
                    registeredUsers: result.registered_users || []
                });
            } else {
                // Other error
                updateStatus('⚠️ Face not recognized', 'error');
            }
        }
        
        isProcessing = false;
    } catch (error) {
        console.error('Error in auto-detection:', error);
        isProcessing = false;
        updateStatus('🔍 Auto-detection active - Ready to scan', 'normal');
    }
}

function handleCameraError(error) {
    const helpDiv = document.getElementById('cameraHelp');
    
    let errorMsg = '❌ Camera error';
    
    if (error.name === 'NotAllowedError') {
        errorMsg = '❌ Camera permission denied. Please allow camera access in browser settings.';
    } else if (error.name === 'NotFoundError') {
        errorMsg = '❌ No camera found. Please connect a camera device.';
    } else if (error.name === 'NotReadableError') {
        errorMsg = '❌ Camera is in use by another application. Please close other apps.';
        helpDiv.style.display = 'block';
    }
    
    updateStatus(errorMsg, 'error');
    console.log('Error details:', error.message);
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    if (detectionInterval) {
        clearInterval(detectionInterval);
    }
    previousFrameForLiveness = null;
    console.log('🛑 Camera stopped');
}

function retryCamera() {
    console.log('🔄 Retrying camera...');
    stopCamera();
    setTimeout(() => startCamera(), 500);
}

function updateStatus(message, type = 'normal') {
    const statusBox = document.getElementById('statusBox');
    const statusText = document.getElementById('statusText');
    const statusIcon = statusBox.querySelector('.status-icon');
    
    if (!statusBox || !statusText || !statusIcon) return;
    
    statusText.textContent = message;
    
    // Remove previous classes
    statusBox.classList.remove('success', 'error');
    
    if (type === 'success') {
        statusBox.classList.add('success');
        statusIcon.textContent = '✅';
    } else if (type === 'error') {
        statusBox.classList.add('error');
        statusIcon.textContent = '❌';
    } else {
        statusIcon.textContent = '🔍';
    }
}

function showPopup(config) {
    const overlay = document.getElementById('popupOverlay');
    const modal = document.getElementById('popupModal');
    
    let content = '';
    
    if (config.type === 'success') {
        content = `
            <div class="popup-header popup-success-header">
                <h2>${config.title}</h2>
            </div>
            <div class="popup-body">
                <p class="popup-message">${config.message}</p>
                <div class="popup-details">
                    ${config.details.map(detail => `
                        <div class="detail-row">
                            <span class="detail-label">${detail.label}:</span>
                            <span class="detail-value">${detail.value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="popup-footer">
                <button class="btn btn-primary" onclick="closePopup()">✅ OK</button>
            </div>
        `;
    } else if (config.type === 'register') {
        const usersList = config.registeredUsers.length > 0 
            ? `<div class="registered-users">
                <strong>Registered Users:</strong>
                <ul>
                    ${config.registeredUsers.map(user => `<li>✅ ${user}</li>`).join('')}
                </ul>
               </div>`
            : '<p class="no-users">⚠️ No users registered yet.</p>';
        
        content = `
            <div class="popup-header popup-register-header">
                <h2>${config.title}</h2>
            </div>
            <div class="popup-body">
                <p class="popup-message">${config.message}</p>
                <p class="popup-instruction"><strong>📝 Instruction:</strong> ${config.instruction}</p>
                ${usersList}
            </div>
            <div class="popup-footer">
                <button class="btn btn-register" onclick="goToRegister()">📝 Register Face</button>
                <button class="btn btn-secondary" onclick="closePopup()">✕ Close</button>
            </div>
        `;
    } else if (config.type === 'error') {
        content = `
            <div class="popup-header popup-error-header">
                <h2>${config.title}</h2>
            </div>
            <div class="popup-body">
                <p class="popup-message">${config.message}</p>
            </div>
            <div class="popup-footer">
                <button class="btn btn-secondary" onclick="closePopup()">✕ Close</button>
            </div>
        `;
    }
    
    modal.innerHTML = content;
    overlay.style.display = 'block';
    modal.style.display = 'block';
    modal.classList.add('show');
}

function closePopup() {
    const overlay = document.getElementById('popupOverlay');
    const modal = document.getElementById('popupModal');
    modal.classList.remove('show');
    setTimeout(() => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    }, 300);
    
    // Ensure camera and detection continue
    if (stream && video) {
        console.log('📹 Camera continuing - detection resumed');
        if (!detectionInterval) {
            startAutoDetection();
        }
    }
}

function goToRegister() {
    window.location.href = '/register';
}

function buildAttendanceDetails(result, selectedSubject) {
    return [
        { label: 'Name', value: result.name || 'Unknown' },
        { label: 'Time', value: result.timestamp || 'Not available' },
        { label: 'Status', value: 'Present' },
        { label: 'Subject', value: result.subject || selectedSubject || 'Not selected' },
        { label: 'Stored in', value: result.stored_in || 'CSV File' },
        { label: 'CSV Path', value: result.storage_path || 'face_detection/data/attendance.csv' }
    ];
}

function renderLatestAttendanceDetails(details = []) {
    const detailsContainer = document.getElementById('latestAttendanceDetails');

    if (!detailsContainer) {
        return;
    }

    detailsContainer.innerHTML = '';

    if (!details.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'latest-attendance-empty';
        emptyState.textContent = 'No attendance marked yet.';
        detailsContainer.appendChild(emptyState);
        return;
    }

    const fragment = document.createDocumentFragment();
    details.forEach(detail => {
        const row = document.createElement('div');
        row.className = 'detail-row';

        const label = document.createElement('span');
        label.className = 'detail-label';
        label.textContent = `${detail.label}:`;

        const value = document.createElement('span');
        value.className = 'detail-value';
        value.textContent = detail.value;

        row.appendChild(label);
        row.appendChild(value);
        fragment.appendChild(row);
    });

    detailsContainer.appendChild(fragment);
}
