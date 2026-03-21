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
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                document.getElementById('totalUsers').textContent = data.people.length;
            }
        })
        .catch(error => console.error('Error loading users:', error));
    
    // Load attendance records
    fetch('/api/attendance_list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
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
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const usersList = document.getElementById('usersList');
                if (data.people.length === 0) {
                    usersList.innerHTML = '<p style="padding: 20px; color: #c8b8ff; text-align: center;">No users registered yet</p>';
                } else {
                    usersList.innerHTML = data.people.map(user => `
                        <div class="user-item">
                            <div class="user-info">
                                <h4>👤 ${user}</h4>
                                <p>Registered user</p>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <button onclick="deleteUserFromList('${user}')" style="padding: 6px 12px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Delete</button>
                            </div>
                        </div>
                    `).join('');
                    
                    // Populate delete user dropdown
                    populateUserDropdowns(data.people);
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
        .then(response => response.json())
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
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(record => `
                            <tr style="border-bottom: 1px solid rgba(168, 85, 247, 0.2);">
                                <td style="padding: 12px;">${record.name}</td>
                                <td style="padding: 12px;">${new Date(record.timestamp).toLocaleString()}</td>
                                <td style="padding: 12px;">
                                    <span style="padding: 4px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 700; ${record.status === 'Present' ? 'background: rgba(16, 185, 129, 0.2); color: #10b981;' : 'background: rgba(239, 68, 68, 0.2); color: #ef4444;'}">
                                        ${record.status === 'Present' ? '✓' : '✗'} ${record.status}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
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
        .then(response => response.json())
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
    .then(response => response.json())
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
    
    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.style.display = 'block';
            video.srcObject = stream;
            document.getElementById('stopCameraBtn').style.display = 'inline-block';
            document.getElementById('captureFaceBtn').style.display = 'inline-block';
            document.querySelector('button[onclick="startRegisterCamera()"]').style.display = 'none';
        })
        .catch(error => {
            showMessage('registerMessage', 'Error accessing camera: ' + error.message, 'error');
        });
}

// Stop register camera
function stopRegisterCamera() {
    const video = document.getElementById('registerVideo');
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }
    video.style.display = 'none';
    document.getElementById('stopCameraBtn').style.display = 'none';
    document.getElementById('captureFaceBtn').style.display = 'none';
    document.querySelector('button[onclick="startRegisterCamera()"]').style.display = 'inline-block';
}

// Capture register face
function captureRegisterFace() {
    const video = document.getElementById('registerVideo');
    const canvas = document.getElementById('registerCanvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    registerFaceImageData = canvas.toDataURL('image/jpeg');
    document.getElementById('registerSubmitBtn').disabled = false;
    showMessage('registerMessage', '✓ Face captured successfully', 'success');
}

// Register face
function registerFace() {
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    
    if (!name) {
        showMessage('registerMessage', 'Please enter name', 'error');
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
            email: email,
            image: registerFaceImageData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('registerMessage', `✓ ${data.message}`, 'success');
            document.getElementById('registerFaceForm').reset();
            registerFaceImageData = null;
            document.getElementById('registerSubmitBtn').disabled = true;
            loadAllUsers();
            loadDashboardStats();
            setTimeout(() => {
                document.getElementById('registerMessage').innerHTML = '';
            }, 3000);
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
            .then(response => response.json())
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
        .then(response => response.json())
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
        .then(response => response.json())
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
