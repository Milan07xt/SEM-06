// Mark Attendance Manually - JavaScript

document.addEventListener('DOMContentLoaded', function() {
    loadUsersList();
    loadRecentRecords();
    loadStatistics();
    setCurrentDate();
});

// Set current date in date input
function setCurrentDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('attendanceDate').value = today;
    document.getElementById('filterDate').value = today;
}

// Load users list for dropdown
function loadUsersList() {
    fetch('/api/users/')
        .then(response => response.json())
        .then(data => {
            const userSelect = document.getElementById('attendanceUser');
            userSelect.innerHTML = '<option value="">-- Choose User --</option>';
            
            if (data.users && Array.isArray(data.users)) {
                data.users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.id || user.username;
                    option.textContent = user.full_name || user.username;
                    userSelect.appendChild(option);
                });
            }
        })
        .catch(error => {
            console.error('Error loading users:', error);
            showMessage('Error loading users list', 'error');
        });
}

// Handle form submission
document.getElementById('attendanceForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const userId = document.getElementById('attendanceUser').value;
    const date = document.getElementById('attendanceDate').value;
    const timeIn = document.getElementById('attendanceTime').value;
    const status = document.getElementById('attendanceStatus').value;
    const notes = document.getElementById('attendanceNotes').value;

    if (!userId || !date || !timeIn || !status) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }

    const attendanceData = {
        user_id: userId,
        date: date,
        time_in: timeIn,
        status: status,
        notes: notes
    };

    fetch('/api/mark_attendance_manual/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify(attendanceData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('✓ Attendance marked successfully!', 'success');
            document.getElementById('attendanceForm').reset();
            setCurrentDate();
            loadRecentRecords();
            loadStatistics();
        } else {
            showMessage(data.message || 'Error marking attendance', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showMessage('Error marking attendance', 'error');
    });
});

// Load recent attendance records
function loadRecentRecords() {
    const date = document.getElementById('filterDate').value;
    
    fetch(`/api/attendance_records/?date=${date}`)
        .then(response => response.json())
        .then(data => {
            const recordsList = document.getElementById('recordsList');
            recordsList.innerHTML = '';
            
            if (data.records && data.records.length > 0) {
                data.records.forEach(record => {
                    const recordItem = document.createElement('div');
                    recordItem.className = 'record-item';
                    recordItem.innerHTML = `
                        <div class="record-field">
                            <span class="record-label">User</span>
                            <span class="record-value">${record.user_name || record.username}</span>
                        </div>
                        <div class="record-field">
                            <span class="record-label">Date</span>
                            <span class="record-value">${formatDate(record.date)}</span>
                        </div>
                        <div class="record-field">
                            <span class="record-label">Time</span>
                            <span class="record-value">${record.time_in || '-'}</span>
                        </div>
                        <div class="record-field">
                            <span class="record-label">Status</span>
                            <span class="record-value">${getStatusBadge(record.status)}</span>
                        </div>
                        <div class="record-field">
                            <span class="record-label">Notes</span>
                            <span class="record-value">${record.notes || '-'}</span>
                        </div>
                    `;
                    recordsList.appendChild(recordItem);
                });
            } else {
                recordsList.innerHTML = '<p class="loading-text">No records found for this date</p>';
            }
        })
        .catch(error => {
            console.error('Error loading records:', error);
            document.getElementById('recordsList').innerHTML = '<p class="loading-text">Error loading records</p>';
        });
}

// Filter records by date
function filterRecords() {
    loadRecentRecords();
}

// Load attendance statistics
function loadStatistics() {
    const today = new Date().toISOString().split('T')[0];
    
    fetch(`/api/attendance_stats/?date=${today}`)
        .then(response => response.json())
        .then(data => {
            document.getElementById('totalUsers').textContent = data.total_users || 0;
            document.getElementById('presentToday').textContent = data.present || 0;
            document.getElementById('absentToday').textContent = data.absent || 0;
            document.getElementById('lateToday').textContent = data.late || 0;
        })
        .catch(error => {
            console.error('Error loading statistics:', error);
        });
}

// Display message
function showMessage(message, type) {
    const messageContainer = document.getElementById('attendanceMessage');
    messageContainer.innerHTML = `<div class="message message-${type}">${message}</div>`;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            messageContainer.innerHTML = '';
        }, 5000);
    }
}

// Format date
function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
}

// Get status badge
function getStatusBadge(status) {
    const statusMap = {
        'Present': '✓ Present',
        'Absent': '✗ Absent',
        'Late': '⏰ Late',
        'Leave': '🏥 Leave'
    };
    return statusMap[status] || status;
}

// Get CSRF token
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
