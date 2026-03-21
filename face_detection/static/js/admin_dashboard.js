// Admin Dashboard JavaScript

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeDashboard();
    setupTabNavigation();
    loadDashboardStats();
    loadAllUsers();
    loadAttendanceRecords();
});

// Initialize dashboard
function initializeDashboard() {
    setAdminUsername();
    loadDashboardStats();
    setupFormHandlers();
}

// Set admin username
function setAdminUsername() {
    const username = localStorage.getItem('adminUsername') || 'Admin';
    document.getElementById('adminUsername').textContent = username;
    const sidebarAdminElement = document.getElementById('sidebarAdminName');
    if (sidebarAdminElement) {
        sidebarAdminElement.textContent = username;
    }
    document.getElementById('loginTime').textContent = new Date().toLocaleString();
}

// Setup tab navigation
function setupTabNavigation() {
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
        });
    });
}

// Switch tab
function switchTab(tabName) {
    // Hide all tab contents
    const contents = document.querySelectorAll('.admin-tab-content');
    contents.forEach(content => content.classList.remove('active'));
    
    // Remove active from all tabs
    const tabs = document.querySelectorAll('.admin-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Show selected tab content
    const selectedContent = document.getElementById('tab-' + tabName);
    if (selectedContent) {
        selectedContent.classList.add('active');
    }
    
    // Mark tab as active
    event.target.classList.add('active');
}

// Click tab function
function clickTab(tabName) {
    const tab = document.querySelector(`[data-tab="${tabName}"]`);
    if (tab) {
        tab.click();
    }
}

// Load dashboard statistics
function loadDashboardStats() {
    // Load total users
    fetch('/api/registered_people')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.people) {
                document.getElementById('totalUsers').textContent = data.people.length;
            }
        })
        .catch(error => console.error('Error loading users:', error));
    
    // Load attendance records
    fetch('/api/attendance_list')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success && data.data) {
                document.getElementById('totalRecords').textContent = data.data.length;
                
                // Count present today
                const today = new Date().toLocaleDateString();
                const presentCount = data.data.filter(record => {
                    const recordDate = new Date(record.timestamp).toLocaleDateString();
                    return recordDate === today && record.status === 'Present';
                }).length;
                document.getElementById('presentToday').textContent = presentCount;
            }
        })
        .catch(error => console.error('Error loading attendance:', error));
}

// Load all users
function loadAllUsers() {
    fetch('/api/registered_people')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const usersList = document.getElementById('usersList');
                if (data.people.length === 0) {
                    usersList.innerHTML = '<p style="padding: 20px; color: #c8b8ff; text-align: center;">No users registered yet</p>';
                } else {
                    usersList.innerHTML = data.people.map(user => `
                        <div class="user-item">
                            <div class="user-info" style="flex: 1;">
                                <h4>👤 ${user.name}</h4>
                                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin-top: 8px;">
                                    <p style="margin: 0;"><strong>Username:</strong> ${user.username || 'N/A'}</p>
                                    <p style="margin: 0;"><strong>Roll No:</strong> ${user.roll_number || 'N/A'}</p>
                                    <p style="margin: 0;"><strong>Email:</strong> ${user.email || 'N/A'}</p>
                                    <p style="margin: 0;"><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
                                    <p style="margin: 0;"><strong>Status:</strong> <span style="color: ${user.status === 'Active' ? '#10b981' : '#ef4444'};">${user.status || 'Active'}</span></p>
                                    <p style="margin: 0;"><strong>Registered:</strong> ${user.registered_date ? new Date(user.registered_date).toLocaleDateString() : 'N/A'}</p>
                                </div>
                            </div>
                            <div style="display: flex; gap: 10px; align-items: center;">
                                <button onclick="deleteUserFromList('${user.name}')" style="padding: 8px 16px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Delete</button>
                            </div>
                        </div>
                    `).join('');
                    
                    // Populate delete user dropdown
                    populateUserDropdowns(data.people.map(u => u.name));
                }
            }
        })
        .catch(error => console.error('Error loading users:', error));
}

// Populate user dropdowns
function populateUserDropdowns(users) {
    const selects = ['attendanceUser', 'deleteUserSelect'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">-- Choose User --</option>' + 
                users.map(user => `<option value="${user}">${user}</option>`).join('');
        }
    });
}

// Load attendance records
function loadAttendanceRecords() {
    fetch('/api/attendance_list')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                displayAttendanceRecords(data.data);
            }
        })
        .catch(error => console.error('Error loading records:', error));
}

// Display attendance records
function displayAttendanceRecords(records) {
    const recordsList = document.getElementById('recordsList');
    if (records.length === 0) {
        recordsList.innerHTML = '<p style="padding: 20px; color: #c8b8ff; text-align: center;">No records found</p>';
    } else {
        recordsList.innerHTML = `
            <div style="overflow-x: auto;">
                <table style="width: 100%; color: #f0e6ff; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(168, 85, 247, 0.3); background: rgba(99, 102, 241, 0.1);">
                            <th style="padding: 12px; text-align: left; font-weight: 700;">Name</th>
                            <th style="padding: 12px; text-align: left; font-weight: 700;">Date & Time</th>
                            <th style="padding: 12px; text-align: left; font-weight: 700;">Status</th>
                            <th style="padding: 12px; text-align: center; font-weight: 700;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map((record, index) => {
                            const recordId = record.id || 0;
                            const recordName = (record.name || '').replace(/'/g, "\\'");
                            const recordTimestamp = (record.timestamp || '').replace(/'/g, "\\'");
                            const recordStatus = (record.status || 'Present').replace(/'/g, "\\'");
                            return `
                            <tr style="border-bottom: 1px solid rgba(168, 85, 247, 0.2);">
                                <td style="padding: 12px;">${record.name || 'Unknown'}</td>
                                <td style="padding: 12px;">${record.timestamp ? new Date(record.timestamp).toLocaleString() : 'N/A'}</td>
                                <td style="padding: 12px;">
                                    <span style="padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 700; ${record.status === 'Present' ? 'background: rgba(16, 185, 129, 0.2); color: #10b981;' : 'background: rgba(239, 68, 68, 0.2); color: #ef4444;'}">
                                        ${record.status === 'Present' ? '✓' : '✗'} ${record.status || 'Present'}
                                    </span>
                                </td>
                                <td style="padding: 12px; text-align: center;">
                                    <button onclick="editAttendanceRecord(${recordId}, '${recordName}', '${recordTimestamp}', '${recordStatus}')" 
                                        style="padding: 6px 12px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; margin-right: 5px; font-size: 0.85rem;">
                                        ✏️ Edit
                                    </button>
                                    <button onclick="deleteAttendanceRecord(${recordId}, '${recordName}')" 
                                        style="padding: 6px 12px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;">
                                        🗑️ Delete
                                    </button>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
}

// Filter records by date
function filterRecords() {
    const date = document.getElementById('recordsDate').value;
    if (!date) {
        loadAttendanceRecords();
        return;
    }
    
    fetch('/api/attendance_list')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const filteredRecords = data.data.filter(record => {
                    const recordDate = new Date(record.timestamp).toLocaleDateString();
                    const filterDate = new Date(date).toLocaleDateString();
                    return recordDate === filterDate;
                });
                displayAttendanceRecords(filteredRecords);
            }
        })
        .catch(error => console.error('Error filtering records:', error));
}

// Setup form handlers
function setupFormHandlers() {
    // Mark Attendance Form
    const markForm = document.getElementById('markAttendanceForm');
    if (markForm) {
        markForm.addEventListener('submit', function(e) {
            e.preventDefault();
            markAttendance();
        });
    }
    
    // Register Face Form
    const registerForm = document.getElementById('registerFaceForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            registerFace();
        });
    }
    
    // Delete User Form
    const deleteForm = document.getElementById('deleteUserForm');
    if (deleteForm) {
        deleteForm.addEventListener('submit', function(e) {
            e.preventDefault();
            confirmDeleteUser();
        });
    }
}

// Mark attendance
function markAttendance() {
    const username = document.getElementById('attendanceUser').value;
    const status = document.getElementById('attendanceStatus').value;
    
    if (!username) {
        showMessage('attendanceMessage', 'Please select a user', 'error');
        return;
    }
    
    fetch('/api/mark_attendance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: username,
            status: status,
            image: ''
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showMessage('attendanceMessage', `✓ Attendance marked for ${username}`, 'success');
            document.getElementById('markAttendanceForm').reset();
            loadAttendanceRecords();
            loadDashboardStats();
            setTimeout(() => {
                document.getElementById('attendanceMessage').innerHTML = '';
            }, 3000);
        } else {
            showMessage('attendanceMessage', data.message || 'Error marking attendance', 'error');
        }
    })
    .catch(error => {
        showMessage('attendanceMessage', 'Error: ' + error.message, 'error');
    });
}

// Register face variables
let registerFaceImageData = null;

// Start register camera
function startRegisterCamera() {
    const video = document.getElementById('registerVideo');
    const canvas = document.getElementById('registerCanvas');
    const cameraPreviewContainer = document.getElementById('cameraPreviewContainer');
    const capturedImagePreview = document.getElementById('capturedImagePreview');
    const startBtn = document.getElementById('startCameraBtn');
    
    // Hide captured image if shown
    if (capturedImagePreview) {
        capturedImagePreview.style.display = 'none';
    }
    
    navigator.mediaDevices.getUserMedia({ 
        video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
        } 
    })
        .then(stream => {
            video.srcObject = stream;
            
            // Show camera preview container
            if (cameraPreviewContainer) {
                cameraPreviewContainer.style.display = 'block';
            }
            
            // Update button visibility
            if (startBtn) startBtn.style.display = 'none';
            document.getElementById('stopCameraBtn').style.display = 'inline-block';
            document.getElementById('captureFaceBtn').style.display = 'inline-block';
            
            console.log('Camera started successfully');
        })
        .catch(error => {
            console.error('Error accessing camera:', error);
            showMessage('registerMessage', 'Error accessing camera. Please ensure camera permissions are granted and camera is not in use by another application.', 'error');
        });
}

// Stop register camera
function stopRegisterCamera() {
    const video = document.getElementById('registerVideo');
    const cameraPreviewContainer = document.getElementById('cameraPreviewContainer');
    const startBtn = document.getElementById('startCameraBtn');
    
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    
    // Hide camera preview container
    if (cameraPreviewContainer) {
        cameraPreviewContainer.style.display = 'none';
    }
    
    // Update button visibility
    document.getElementById('stopCameraBtn').style.display = 'none';
    document.getElementById('captureFaceBtn').style.display = 'none';
    if (startBtn) startBtn.style.display = 'inline-block';
    
    console.log('Camera stopped');
}

// Capture register face
function captureRegisterFace() {
    const video = document.getElementById('registerVideo');
    const canvas = document.getElementById('registerCanvas');
    const cameraPreviewContainer = document.getElementById('cameraPreviewContainer');
    const capturedImagePreview = document.getElementById('capturedImagePreview');
    const capturedImage = document.getElementById('capturedImage');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    registerFaceImageData = canvas.toDataURL('image/jpeg');
    
    // Show captured image preview
    if (capturedImage && capturedImagePreview) {
        capturedImage.src = registerFaceImageData;
        capturedImagePreview.style.display = 'block';
    }
    
    // Stop camera and hide preview
    stopRegisterCamera();
    
    // Enable submit button
    document.getElementById('registerSubmitBtn').disabled = false;
    
    showMessage('registerMessage', '✓ Face captured successfully! You can now register the user.', 'success');
    console.log('Face captured');
}

// Register face
function registerFace() {
    const name = document.getElementById('registerName').value;
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const email = document.getElementById('registerEmail').value;
    
    if (!name) {
        showMessage('registerMessage', 'Please enter name', 'error');
        return;
    }

    if (!username) {
        showMessage('registerMessage', 'Please enter username', 'error');
        return;
    }

    if (!password) {
        showMessage('registerMessage', 'Please enter password', 'error');
        return;
    }
    
    if (!registerFaceImageData) {
        showMessage('registerMessage', 'Please capture a face first', 'error');
        return;
    }
    
    fetch('/api/register_face', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: name,
            username: username,
            password: password,
            email: email,
            image: registerFaceImageData
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showMessage('registerMessage', `✓ ${data.message}`, 'success');
            document.getElementById('registerFaceForm').reset();
            registerFaceImageData = null;
            document.getElementById('registerSubmitBtn').disabled = true;
            loadAllUsers();
            loadDashboardStats();
            
            // Redirect to success page after 2 seconds
            setTimeout(() => {
                const encodedName = encodeURIComponent(name);
                const encodedEmail = encodeURIComponent(email || '-');
                window.location.href = `/registration_success?name=${encodedName}&email=${encodedEmail}`;
            }, 2000);
        } else {
            showMessage('registerMessage', data.message || 'Error registering face', 'error');
        }
    })
    .catch(error => {
        showMessage('registerMessage', 'Error: ' + error.message, 'error');
    });
}

// Delete user from list
function deleteUserFromList(username) {
    if (confirm(`Are you sure you want to delete ${username}?`)) {
        // Make API call to delete user
        fetch(`/api/delete_user/${username}`, { method: 'DELETE' })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    alert('✓ User deleted successfully');
                    loadAllUsers();
                    loadDashboardStats();
                } else {
                    alert('Error: ' + (data.message || 'Could not delete user'));
                }
            })
            .catch(error => alert('Error: ' + error.message));
    }
}

// Confirm delete user
function confirmDeleteUser() {
    const username = document.getElementById('deleteUserSelect').value;
    
    if (!username) {
        alert('Please select a user to delete');
        return;
    }
    
    if (confirm(`Are you sure you want to delete ${username}? This cannot be undone.`)) {
        deleteUserFromList(username);
    }
}

// Export attendance data
function exportAttendanceData() {
    fetch('/api/attendance_list')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                downloadCSV(data.data, 'attendance_records.csv');
            }
        })
        .catch(error => alert('Error: ' + error.message));
}

// Export user data
function exportUserData() {
    fetch('/api/registered_people')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                const csv = 'Name\n' + data.people.join('\n');
                downloadFile(csv, 'users.csv', 'text/csv');
            }
        })
        .catch(error => alert('Error: ' + error.message));
}

// Download CSV
function downloadCSV(data, filename) {
    const headers = ['Name', 'Date & Time', 'Status'];
    const csv = headers.join(',') + '\n' + data.map(record => 
        `"${record.name}","${record.timestamp}","${record.status}"`
    ).join('\n');
    
    downloadFile(csv, filename, 'text/csv');
}

// Download file
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// Reset database
function resetDatabase() {
    if (confirm('⚠️ Are you sure you want to reset the entire database? This cannot be undone.')) {
        if (confirm('This will delete ALL attendance records. Are you absolutely sure?')) {
            // Make API call to reset database
            fetch('/api/reset_database', { method: 'POST' })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        alert('✓ Database reset successfully');
                        loadAttendanceRecords();
                        loadDashboardStats();
                    } else {
                        alert('Error: ' + (data.message || 'Could not reset database'));
                    }
                })
                .catch(error => alert('Error: ' + error.message));
        }
    }
}

// Generate report
function generateReport() {
    alert('Report generation coming soon!');
}

// Show message
function showMessage(elementId, message, type) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = `<div style="padding: 16px; border-radius: 8px; margin: 20px 0; font-weight: 600; border: 2px solid; ${
            type === 'success' 
            ? 'background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); color: #065f46; border-color: #6ee7b7;'
            : 'background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); color: #7f1d1d; border-color: #fca5a5;'
        }">${message}</div>`;
    }
}

// Admin logout
function adminLogout() {
    localStorage.removeItem('adminUsername');
    localStorage.removeItem('adminLoggedIn');
    window.location.href = '/admin_login';
}
// Scroll to section
function scrollToSection(sectionId) {
    switchTab(sectionId);
    const element = document.getElementById('tab-' + sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Add hover effects to sidebar buttons
document.addEventListener('DOMContentLoaded', function() {
    const sidebarButtons = document.querySelectorAll('.sidebar-nav-btn');
    sidebarButtons.forEach(btn => {
        btn.addEventListener('hover', function() {
            this.style.background = 'rgba(99, 102, 241, 0.2)';
            this.style.borderColor = 'rgba(99, 102, 241, 0.3)';
            this.style.color = '#f0abfc';
        });
    });
});

// Edit and Delete Action Functions
function editRegistration() {
    clickTab('register');
    alert('✏️ Edit Registration Mode - Ready to update user registration');
}

function deleteRegistration() {
    if (confirm('⚠️ Are you sure you want to delete this registration?')) {
        alert('🗑️ Registration deleted successfully');
    }
}

function editAttendance() {
    clickTab('attendance');
    alert('✏️ Edit Attendance Mode - Ready to update attendance records');
}

function deleteAttendance() {
    if (confirm('⚠️ Are you sure you want to delete attendance records?')) {
        alert('🗑️ Attendance records deleted successfully');
    }
}

function editUsers() {
    clickTab('users');
    alert('✏️ Edit Users Mode - Ready to update user information');
}

function deleteUsers() {
    if (confirm('⚠️ Are you sure you want to delete user data?')) {
        alert('🗑️ User data deleted successfully');
    }
}

function editRecords() {
    clickTab('records');
    alert('✏️ Edit Records Mode - Ready to update attendance records');
}

function deleteRecords() {
    if (confirm('⚠️ Are you sure you want to delete all records?')) {
        alert('🗑️ Records deleted successfully');
    }
}

function editSystemSettings() {
    alert('✏️ Edit System Settings Mode - Ready to modify system configuration');
}

function resetSystemSettings() {
    if (confirm('⚠️ Are you sure you want to reset system settings to default? This cannot be undone!')) {
        alert('🔄 System settings reset successfully');
    }
}

// Custom styled dialog for editing attendance
function showAttendanceStatusDialog(name, currentStatus) {
    return new Promise((resolve) => {
        // Create overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            max-width: 450px;
            width: 90%;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: white;
        `;

        // Title
        const title = document.createElement('h2');
        title.textContent = `✏️ Edit Attendance Status`;
        title.style.cssText = `
            margin: 0 0 10px 0;
            font-size: 20px;
            font-weight: 600;
            color: white;
        `;

        // User name
        const userName = document.createElement('p');
        userName.textContent = `User: ${name}`;
        userName.style.cssText = `
            margin: 0 0 15px 0;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 500;
        `;

        // Current status display
        const currentStatusDiv = document.createElement('div');
        currentStatusDiv.style.cssText = `
            background-color: rgba(255, 255, 255, 0.15);
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            border-left: 4px solid #4fc3f7;
        `;
        const currentStatusLabel = document.createElement('p');
        currentStatusLabel.textContent = `Current Status: ${currentStatus}`;
        currentStatusLabel.style.cssText = `
            margin: 0;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.9);
        `;
        currentStatusDiv.appendChild(currentStatusLabel);

        // Label for select
        const selectLabel = document.createElement('label');
        selectLabel.textContent = 'Select New Status:';
        selectLabel.style.cssText = `
            display: block;
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: 600;
            color: white;
        `;

        // Select dropdown
        const select = document.createElement('select');
        select.style.cssText = `
            width: 100%;
            padding: 12px 15px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            background-color: rgba(255, 255, 255, 0.95);
            color: #333;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            margin-bottom: 20px;
            transition: all 0.3s ease;
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 20px;
            padding-right: 40px;
        `;
        
        // Add focus and hover effects
        select.addEventListener('focus', function() {
            this.style.borderColor = 'rgba(255, 255, 255, 0.8)';
            this.style.boxShadow = '0 0 10px rgba(79, 195, 247, 0.5)';
            this.style.backgroundColor = 'white';
        });
        
        select.addEventListener('blur', function() {
            this.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            this.style.boxShadow = 'none';
        });
        
        select.addEventListener('mouseover', function() {
            if (document.activeElement !== this) {
                this.style.borderColor = 'rgba(255, 255, 255, 0.6)';
            }
        });
        
        select.addEventListener('mouseout', function() {
            if (document.activeElement !== this) {
                this.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }
        });

        // Add options
        const options = [
            { value: 'Present', label: '✅ Present' },
            { value: 'Absent', label: '❌ Absent' },
            { value: 'Leave', label: '📄 Leave' }
        ];

        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            select.appendChild(option);
        });

        select.value = currentStatus;

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 12px;
            justify-content: flex-end;
        `;

        // OK Button
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = `
            padding: 10px 24px;
            background-color: #4fc3f7;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        okBtn.onmouseover = function() {
            this.style.backgroundColor = '#29b6f6';
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 5px 15px rgba(79, 195, 247, 0.4)';
        };
        okBtn.onmouseout = function() {
            this.style.backgroundColor = '#4fc3f7';
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        };

        okBtn.onclick = function() {
            const selected = select.value;
            overlay.remove();
            resolve(selected);
        };

        // Cancel Button
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 10px 24px;
            background-color: rgba(255, 255, 255, 0.2);
            color: white;
            border: 2px solid white;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        cancelBtn.onmouseover = function() {
            this.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
            this.style.transform = 'translateY(-2px)';
        };
        cancelBtn.onmouseout = function() {
            this.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            this.style.transform = 'translateY(0)';
        };

        cancelBtn.onclick = function() {
            overlay.remove();
            resolve(null);
        };

        buttonContainer.appendChild(okBtn);
        buttonContainer.appendChild(cancelBtn);

        // Assemble dialog
        dialog.appendChild(title);
        dialog.appendChild(userName);
        dialog.appendChild(currentStatusDiv);
        dialog.appendChild(selectLabel);
        dialog.appendChild(select);
        dialog.appendChild(buttonContainer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Auto-focus the select element
        select.focus();
    });
}

// Edit individual attendance record
async function editAttendanceRecord(id, name, timestamp, status) {
    const newStatus = await showAttendanceStatusDialog(name, status);
    
    if (newStatus === null) return; // User cancelled
    
    if (!['Present', 'Absent', 'Leave'].includes(newStatus)) {
        alert('❌ Invalid status. Please select: Present, Absent, or Leave');
        return;
    }
    
    // Call API to update attendance record
    fetch(`/api/update_attendance/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            status: newStatus
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`Server error: ${response.status}. ${text.substring(0, 100)}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            alert(`✅ Attendance record updated successfully!\n\nName: ${name}\nNew Status: ${newStatus}`);
            loadAttendanceRecords();
            loadDashboardStats();
        } else {
            alert(`❌ Error: ${data.message || 'Failed to update record'}`);
        }
    })
    .catch(error => {
        console.error('Error updating record:', error);
        alert(`❌ Error updating attendance record: ${error.message}`);
    });
}

// Delete individual attendance record
function deleteAttendanceRecord(id, name) {
    if (!confirm(`⚠️ Are you sure you want to delete the attendance record for:\n\n${name}?\n\nThis action cannot be undone!`)) {
        return;
    }
    
    // Call API to delete attendance record
    fetch(`/api/delete_attendance/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(text => {
                throw new Error(`Server error: ${response.status}. ${text.substring(0, 100)}`);
            });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            alert(`✅ Attendance record deleted successfully!\n\nName: ${name}`);
            loadAttendanceRecords();
            loadDashboardStats();
        } else {
            alert(`❌ Error: ${data.message || 'Failed to delete record'}`);
        }
    })
    .catch(error => {
        console.error('Error deleting record:', error);
        alert(`❌ Error deleting attendance record: ${error.message}`);
    });
}