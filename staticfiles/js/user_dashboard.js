// User Dashboard JavaScript

const userDisplayName = document.getElementById('userDisplayName');
const userRollNumber = document.getElementById('userRollNumber');
const userEmail = document.getElementById('userEmail');
const totalPresent = document.getElementById('totalPresent');
const attendanceRate = document.getElementById('attendanceRate');
const monthlyPresent = document.getElementById('monthlyPresent');
const lastAttendance = document.getElementById('lastAttendance');
const attendanceTableBody = document.getElementById('attendanceTableBody');
const dashboardStatus = document.getElementById('dashboardStatus');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const downloadReportBtn = document.getElementById('downloadReportBtn');
const filterMonth = document.getElementById('filterMonth');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const changePasswordModal = document.getElementById('changePasswordModal');
const closeModal = document.querySelector('.close-modal');
const changePasswordForm = document.getElementById('changePasswordForm');

let attendanceData = [];
let userId = null;
let userName = null;

// Check if user is logged in
document.addEventListener('DOMContentLoaded', () => {
    const userLoggedIn = localStorage.getItem('userLoggedIn');
    if (!userLoggedIn || userLoggedIn !== 'true') {
        window.location.href = '/user_login';
        return;
    }

    // Ensure My Profile nav always navigates to profile page
    const profileNav = document.getElementById('myProfileNav');
    if (profileNav) {
        profileNav.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/user_profile';
        });
    }

    // Load user info
    userName = localStorage.getItem('userName') || 'User';
    userId = localStorage.getItem('userId');
    const username = localStorage.getItem('userUsername');

    userDisplayName.textContent = userName;

    // Load dashboard data
    loadUserDashboard();
});

// Logout functionality
logoutBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('userLoggedIn');
        localStorage.removeItem('userName');
        localStorage.removeItem('userUsername');
        localStorage.removeItem('userId');
        showStatus('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = '/user_login';
        }, 1000);
    }
});

// Load user dashboard data
async function loadUserDashboard() {
    try {
        showStatus('Loading dashboard data...', 'info');

        const username = localStorage.getItem('userUsername');
        const response = await fetch(`/api/user_attendance/${username}`);
        const data = await response.json();

        if (data.success) {
            attendanceData = data.attendance || [];
            const userInfo = data.user || {};

            // Update user info
            userRollNumber.textContent = `Roll: ${userInfo.roll_number || 'N/A'}`;
            userEmail.textContent = userInfo.email || 'No email';

            // Calculate stats
            calculateStats();
            displayAttendanceHistory();
            renderAttendanceChart();
            showStatus('Dashboard loaded successfully', 'success');
        } else {
            showStatus('Error loading dashboard: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        console.error('[Dashboard] Error:', error);
    }
}

// Calculate statistics
function calculateStats() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Total present days
    const presentRecords = attendanceData.filter(r => r.status === 'Present');
    totalPresent.textContent = presentRecords.length;

    // This month's present days
    const monthlyRecords = presentRecords.filter(r => {
        const recordDate = new Date(r.timestamp);
        return recordDate.getMonth() === currentMonth && recordDate.getFullYear() === currentYear;
    });
    monthlyPresent.textContent = monthlyRecords.length;

    // Attendance rate (assuming 30 working days per month)
    const workingDays = 30;
    let rate = presentRecords.length > 0 ? ((monthlyRecords.length / workingDays) * 100) : 0;
    rate = Math.max(0, Math.min(rate, 100));
    attendanceRate.textContent = rate.toFixed(1) + '%';

    // Last attendance
    if (presentRecords.length > 0) {
        const lastRecord = presentRecords[0];
        const lastDate = new Date(lastRecord.timestamp);
        lastAttendance.textContent = lastDate.toLocaleDateString();
    } else {
        lastAttendance.textContent = 'No records';
    }

    // Update summary
    document.getElementById('summaryPresent').textContent = monthlyRecords.length;
    document.getElementById('summaryAbsent').textContent = Math.max(0, workingDays - monthlyRecords.length);
    document.getElementById('summaryTotal').textContent = workingDays;
    document.getElementById('summaryPercentage').textContent = rate + '%';
}

// Display attendance history table
function displayAttendanceHistory() {
    attendanceTableBody.innerHTML = '';

    if (attendanceData.length === 0) {
        attendanceTableBody.innerHTML = '<tr><td colspan="4" class="text-center">No attendance records found</td></tr>';
        return;
    }

    // Filter by selected month
    let filteredData = [...attendanceData];
    const filterValue = filterMonth.value;
    const now = new Date();

    if (filterValue === 'current') {
        filteredData = filteredData.filter(r => {
            const recordDate = new Date(r.timestamp);
            return recordDate.getMonth() === now.getMonth() && recordDate.getFullYear() === now.getFullYear();
        });
    } else if (filterValue === 'last') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        filteredData = filteredData.filter(r => {
            const recordDate = new Date(r.timestamp);
            return recordDate.getMonth() === lastMonth.getMonth() && recordDate.getFullYear() === lastMonth.getFullYear();
        });
    }

    // Display records
    filteredData.forEach(record => {
        const row = document.createElement('tr');
        const recordDate = new Date(record.timestamp);
        const date = recordDate.toLocaleDateString();
        const time = recordDate.toLocaleTimeString();
        const statusClass = record.status === 'Present' ? 'present' : 'absent';

        row.innerHTML = `
            <td>${date}</td>
            <td>${time}</td>
            <td><span class="status-badge ${statusClass}">${record.status}</span></td>
            <td>${record.notes || '-'}</td>
        `;
        attendanceTableBody.appendChild(row);
    });
}

// Render attendance chart
function renderAttendanceChart() {
    const canvas = document.getElementById('attendanceChart');
    const ctx = canvas.getContext('2d');

    // Fix blurry rendering on high-DPI displays
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set display size (CSS pixels)
    canvas.style.width = rect.width ? rect.width + 'px' : '100%';
    canvas.style.height = '280px';
    
    // Set actual canvas size (accounting for device pixel ratio)
    canvas.width = (rect.width || canvas.offsetWidth) * dpr;
    canvas.height = 280 * dpr;
    
    // Scale context to match
    ctx.scale(dpr, dpr);

    // Get last 30 days data
    const last30Days = getLast30Days();
    const attendanceCounts = last30Days.map(date => {
        return attendanceData.filter(r => {
            const recordDate = new Date(r.timestamp).toISOString().split('T')[0];
            return recordDate === date && r.status === 'Present';
        }).length;
    });

    // Build premium gradient - cyan to blue to purple
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(6, 182, 212, 0.3)');        // Cyan top
    gradient.addColorStop(0.3, 'rgba(59, 130, 246, 0.35)');    // Blue
    gradient.addColorStop(0.6, 'rgba(99, 102, 241, 0.4)');     // Indigo
    gradient.addColorStop(0.85, 'rgba(139, 92, 246, 0.45)');   // Purple
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.5)');       // Deep purple bottom

    // Dynamic Y-axis max (at least 2)
    const maxCount = Math.max(...attendanceCounts, 0);
    const yMax = Math.max(2, Math.ceil(maxCount * 1.2));

    // Destroy existing chart if exists
    if (window.userAttendanceChart) {
        window.userAttendanceChart.destroy();
    }

    // Create new chart with enhanced quality
    window.userAttendanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: last30Days.map(date => {
                const d = new Date(date);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Attendance',
                data: attendanceCounts,
                backgroundColor: gradient,
                borderColor: 'rgba(6, 182, 212, 0.9)',  // Cyan line
                borderWidth: 3,
                tension: 0.4,
                cubicInterpolationMode: 'monotone',
                fill: true,
                pointBackgroundColor: '#ffffff',  // White center
                pointBorderColor: 'rgba(6, 182, 212, 1)',  // Cyan border
                pointBorderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 9,
                pointHoverBackgroundColor: '#ffffff',
                pointHoverBorderColor: 'rgba(6, 182, 212, 1)',
                pointHoverBorderWidth: 4,
                pointHitRadius: 20,
                shadowOffsetX: 0,
                shadowOffsetY: 3,
                shadowBlur: 8,
                shadowColor: 'rgba(6, 182, 212, 0.5)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            layout: {
                padding: { top: 20, right: 20, bottom: 10, left: 10 }
            },
            interaction: { 
                intersect: false, 
                mode: 'index',
                axis: 'x'
            },
            scales: {
                x: {
                    grid: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.15)',  // Lighter grid lines
                        lineWidth: 1,
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.95)',  // White labels
                        font: {
                            size: 11,
                            family: "'Segoe UI', 'Helvetica Neue', sans-serif",
                            weight: '500'
                        },
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 8
                    }
                },
                y: {
                    beginAtZero: true,
                    max: yMax,
                    grid: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.15)',  // Lighter grid lines
                        lineWidth: 1,
                        drawBorder: false
                    },
                    ticks: {
                        stepSize: 1,
                        color: 'rgba(255, 255, 255, 0.95)',  // White labels
                        font: {
                            size: 12,
                            family: "'Segoe UI', 'Helvetica Neue', sans-serif",
                            weight: '600'
                        },
                        padding: 10,
                        callback: function(value) {
                            return value.toFixed(0);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: { 
                        usePointStyle: true,
                        pointStyle: 'circle',
                        padding: 15,
                        font: {
                            size: 13,
                            family: "'Segoe UI', 'Helvetica Neue', sans-serif",
                            weight: '600'
                        },
                        color: 'rgba(255, 255, 255, 0.98)'  // White legend
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(20, 20, 50, 0.95)',
                    titleColor: '#fff',
                    titleFont: {
                        size: 14,
                        weight: 'bold',
                        family: "'Segoe UI', sans-serif"
                    },
                    bodyColor: 'rgba(6, 182, 212, 0.95)',  // Cyan text
                    bodyFont: {
                        size: 13,
                        family: "'Segoe UI', sans-serif"
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    borderColor: 'rgba(99, 102, 241, 0.5)',
                    borderWidth: 2,
                    callbacks: {
                        label: (ctx) => ` Present: ${ctx.parsed.y} day${ctx.parsed.y !== 1 ? 's' : ''}`
                    }
                }
            },
            animation: {
                duration: 1200,
                easing: 'easeInOutQuart'
            },
            elements: {
                line: { 
                    borderJoinStyle: 'round',
                    borderCapStyle: 'round'
                },
                point: { 
                    hoverBorderWidth: 3
                }
            }
        }
    });
}

// Get last 30 days in YYYY-MM-DD format
function getLast30Days() {
    const days = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        days.push(date.toISOString().split('T')[0]);
    }

    return days;
}

// Filter change event
filterMonth.addEventListener('change', () => {
    displayAttendanceHistory();
});

// Refresh button
refreshBtn.addEventListener('click', () => {
    loadUserDashboard();
});

// Export PDF
exportBtn.addEventListener('click', () => {
    showStatus('Generating PDF report...', 'info');
    // PDF generation would go here (using jsPDF or similar)
    setTimeout(() => {
        showStatus('PDF export feature coming soon!', 'info');
    }, 1000);
});

// Download report
downloadReportBtn.addEventListener('click', () => {
    exportToExcel();
});

// Export to Excel (CSV format)
function exportToExcel() {
    let csvContent = 'Date,Time,Status,Notes\n';
    attendanceData.forEach(record => {
        const recordDate = new Date(record.timestamp);
        const date = recordDate.toLocaleDateString();
        const time = recordDate.toLocaleTimeString();
        csvContent += `${date},${time},${record.status},"${record.notes || ''}"\n`;
    });

    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
    element.setAttribute('download', `attendance_report_${userName}_${new Date().toISOString().split('T')[0]}.csv`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    showStatus('Report downloaded successfully', 'success');
}

// Change password modal
changePasswordBtn.addEventListener('click', () => {
    changePasswordModal.classList.add('show');
});

closeModal.addEventListener('click', () => {
    changePasswordModal.classList.remove('show');
});

window.addEventListener('click', (e) => {
    if (e.target === changePasswordModal) {
        changePasswordModal.classList.remove('show');
    }
});

// Change password form submission
changePasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate passwords
    if (newPassword !== confirmPassword) {
        showStatus('New passwords do not match', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showStatus('Password must be at least 8 characters', 'error');
        return;
    }

    try {
        const username = localStorage.getItem('userUsername');
        const response = await fetch('/api/change_password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                current_password: currentPassword,
                new_password: newPassword
            })
        });

        const data = await response.json();

        if (data.success) {
            showStatus('Password changed successfully', 'success');
            changePasswordModal.classList.remove('show');
            changePasswordForm.reset();
        } else {
            showStatus('Error: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('Error changing password: ' + error.message, 'error');
    }
});

// Status message
function showStatus(message, type) {
    dashboardStatus.textContent = message;
    dashboardStatus.className = 'status-message show ' + type;
    setTimeout(() => {
        dashboardStatus.classList.remove('show');
    }, 4000);
}
