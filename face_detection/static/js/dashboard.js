// Dashboard Page JavaScript

const dashboardStatus = document.getElementById('dashboardStatus');
const totalUsersEl = document.getElementById('totalUsers');
const todayAttendanceEl = document.getElementById('todayAttendance');
const totalRecordsEl = document.getElementById('totalRecords');
const presentCountEl = document.getElementById('presentCount');
const absentCountEl = document.getElementById('absentCount');
const activityListEl = document.getElementById('activityList');
const usersTableEl = document.getElementById('usersTable');
const refreshBtn = document.getElementById('refreshBtn');

// Load dashboard data
async function loadDashboardData() {
    try {
        showStatus('Loading dashboard data...', 'info');

        const [attendanceResponse, usersResponse] = await Promise.all([
            fetch('/api/attendance_list'),
            fetch('/api/users_list')
        ]);

        const attendanceData = await attendanceResponse.json();
        const usersData = await usersResponse.json();

        if (!attendanceData.success) {
            throw new Error(attendanceData.message || 'Failed to load attendance data');
        }
        if (!usersData.success) {
            throw new Error(usersData.message || 'Failed to load user data');
        }

        updateDashboardStats(attendanceData.data, usersData.users, usersData.total);
        displayRegisteredUsers(usersData.users);
        displayRecentActivity(attendanceData.data);
        showStatus('Dashboard loaded successfully', 'success');
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        usersTableEl.innerHTML = '<p class="text-center">Unable to load registered users.</p>';
        activityListEl.innerHTML = '<p class="text-center">Unable to load recent activity.</p>';
    }
}

// Update dashboard statistics
function updateDashboardStats(records, users, userCount) {
    // Total records
    totalRecordsEl.textContent = records.length;

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Count today's attendance records
    const todayRecords = records.filter(record => {
        const recordDate = (record.timestamp || '').split(' ')[0];
        return recordDate === today;
    });
    todayAttendanceEl.textContent = todayRecords.length;

    // Count present and absent
    const presentCount = records.filter(r => String(r.status).toLowerCase() === 'present').length;
    const absentCount = records.filter(r => String(r.status).toLowerCase() === 'absent').length;
    presentCountEl.textContent = presentCount;
    absentCountEl.textContent = absentCount;

    // Registered users count comes from the users API
    totalUsersEl.textContent = userCount || users.length || 0;

    // Generate chart
    generateAttendanceChart(records);
}

function displayRegisteredUsers(users) {
    if (!users || users.length === 0) {
        usersTableEl.innerHTML = '<p class="text-center">No registered users found.</p>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th>#</th>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Roll Number</th>
                <th>Registered</th>
            </tr>
        </thead>
        <tbody>
            ${users.map(user => `
                <tr>
                    <td>${user.id || ''}</td>
                    <td>${user.name || ''}</td>
                    <td>${user.username || ''}</td>
                    <td>${user.email || '-'}</td>
                    <td>${user.phone || '-'}</td>
                    <td>${user.roll_number || '-'}</td>
                    <td>${user.registered_date || '-'}</td>
                </tr>
            `).join('')}
        </tbody>
    `;

    usersTableEl.innerHTML = '';
    usersTableEl.appendChild(table);
}

// Display recent activity
function displayRecentActivity(records) {
    activityListEl.innerHTML = '';

    // Get last 10 records
    const recentRecords = records.slice(0, 10);

    if (recentRecords.length === 0) {
        activityListEl.innerHTML = '<p class="text-center">No activity yet</p>';
        return;
    }

    recentRecords.forEach(record => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';

        const timestamp = new Date(record.timestamp).toLocaleString();
        const statusClass = record.status === 'Present' ? 'present' : 'absent';

        activityItem.innerHTML = `
            <div>
                <div class="activity-name">${record.name}</div>
                <div class="activity-time">${timestamp}</div>
            </div>
            <span class="activity-status ${statusClass}">${record.status}</span>
        `;

        activityListEl.appendChild(activityItem);
    });
}

// Generate attendance chart (simple bar chart)
function generateAttendanceChart(records) {
    const canvas = document.getElementById('attendanceChart');
    
    // If canvas doesn't exist or chart library not available, skip
    if (!canvas || typeof Chart === 'undefined') {
        // Fallback: show simple text stats
        console.log('Chart.js not loaded. Skipping chart generation.');
        return;
    }

    // Get last 7 days of data
    const last7Days = getLast7Days();
    const attendanceCounts = last7Days.map(date => {
        return records.filter(r => r.timestamp.startsWith(date)).length;
    });

    const ctx = canvas.getContext('2d');

    // Destroy existing chart if it exists
    if (window.attendanceChartInstance) {
        window.attendanceChartInstance.destroy();
    }

    // Calculate max value for chart (with minimum of 10 for better visibility)
    const maxValue = Math.max(...attendanceCounts, 0);
    const chartMaxValue = Math.max(maxValue + 2, 10);

    // Create new chart
    window.attendanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last7Days.map(date => {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Daily Attendance',
                data: attendanceCounts,
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2,
                borderRadius: 5,
                hoverBackgroundColor: 'rgba(102, 126, 234, 0.8)',
                hoverBorderColor: 'rgba(102, 126, 234, 1)',
                hoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: undefined,
            scales: {
                y: {
                    beginAtZero: true,
                    max: chartMaxValue,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#333',
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        padding: 15
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 10,
                    titleFont: {
                        size: 12,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 11
                    },
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + context.parsed.y + ' records';
                        }
                    }
                }
            }
        }
    });
}

// Get last 7 days in YYYY-MM-DD format
function getLast7Days() {
    const days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        days.push(dateString);
    }

    return days;
}

// Refresh button
refreshBtn.addEventListener('click', () => {
    loadDashboardData();
});

// Status message
function showStatus(message, type) {
    dashboardStatus.textContent = message;
    dashboardStatus.className = 'status-message show ' + type;
    setTimeout(() => {
        dashboardStatus.classList.remove('show');
    }, 4000);
}

// Load dashboard on page load
document.addEventListener('DOMContentLoaded', loadDashboardData);

// Auto-refresh dashboard every 30 seconds
setInterval(loadDashboardData, 30000);
