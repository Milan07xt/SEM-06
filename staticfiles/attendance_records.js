// Attendance Records JavaScript

let allRecords = [];
let filteredRecords = [];
let refreshTimer = null;

function getEl(id) {
    return document.getElementById(id);
}

function parseRecordDate(record) {
    const iso = (record?.timestamp_iso || '').trim();
    const raw = (record?.timestamp || '').trim();

    if (iso) {
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) return d;
    }

    if (raw) {
        const d = new Date(raw.replace(' ', 'T'));
        if (!Number.isNaN(d.getTime())) return d;
    }

    return null;
}

// Update current time
function updateTime() {
    const now = new Date();
    const timeEl = getEl('currentTime');
    if (timeEl) {
        timeEl.textContent = now.toLocaleString();
    }
}

setInterval(updateTime, 1000);
updateTime();

// Load admin username
const adminUsername = localStorage.getItem('adminUsername') || 'Admin';
const adminUsernameEl = getEl('adminUsername');
if (adminUsernameEl) {
    adminUsernameEl.textContent = adminUsername;
}

// Default behavior: show all records (no date pre-selected)
const filterDateEl = getEl('filterDate');
if (filterDateEl) {
    filterDateEl.value = '';
}

// Load users for filter dropdown (record names are source-of-truth for filtering)
async function loadUsers() {
    const filterUser = getEl('filterUser');
    if (!filterUser) return;

    const currentSelection = (filterUser.value || '').trim();
    const recordNames = [...new Set(allRecords.map(r => (r.name || '').trim()).filter(Boolean))];

    // Keep dropdown aligned with actual record values so selected user always matches filters
    filterUser.innerHTML = '<option value="">All Users</option>';
    recordNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name.startsWith('@') ? name.slice(1) : name;
        filterUser.appendChild(option);
    });

    // Optional: include registered users only if they are not already present
    try {
        const response = await fetch('/api/registered_people');
        if (response.ok) {
            const result = await response.json();
            if (result.success && Array.isArray(result.people)) {
                const existing = new Set(recordNames.map(name => name.toLowerCase()));
                result.people.forEach(person => {
                    const personName = (person?.name || '').trim();
                    if (!personName) return;
                    if (existing.has(personName.toLowerCase())) return;
                    const option = document.createElement('option');
                    option.value = personName;
                    option.textContent = personName.startsWith('@') ? personName.slice(1) : personName;
                    filterUser.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.warn('Registered users sync skipped:', error);
    }

    if (currentSelection) {
        const hasOption = Array.from(filterUser.options).some(
            opt => (opt.value || '').trim().toLowerCase() === currentSelection.toLowerCase()
        );
        if (hasOption) {
            filterUser.value = Array.from(filterUser.options).find(
                opt => (opt.value || '').trim().toLowerCase() === currentSelection.toLowerCase()
            ).value;
        }
    }
}

// Load attendance records
async function loadRecords() {
    try {
        const response = await fetch('/api/attendance_list');
        if (!response.ok) {
            throw new Error(`Failed to fetch attendance records (${response.status})`);
        }
        const result = await response.json();

        if (result.success) {
            allRecords = Array.isArray(result.data) ? result.data : [];
            filteredRecords = allRecords;
            // Keep user filter in sync even if registered_people endpoint fails
            await loadUsers();
            applyFilters();
        } else {
            const recordsTable = getEl('recordsTable');
            if (!recordsTable) return;
            recordsTable.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>No attendance records found</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading records:', error);
        showAlert('Failed to load records', 'error');
    }
}

function applyFilters() {
    const dateFilter = getEl('filterDate')?.value || '';
    const userFilter = getEl('filterUser')?.value || '';
    const statusFilter = getEl('filterStatus')?.value || '';

    filteredRecords = allRecords.filter(record => {
        let match = true;

        // Date filter
        if (dateFilter) {
            const parsedDate = parseRecordDate(record);
            if (!parsedDate) return false;
            const recordDate = parsedDate.toISOString().split('T')[0];
            if (recordDate !== dateFilter) match = false;
        }

        // User filter
        if (userFilter) {
            const selectedUser = userFilter.trim().toLowerCase();
            const recordUser = String(record.name || '').trim().toLowerCase();
            if (recordUser !== selectedUser) {
                match = false;
            }
        }

        // Status filter
        if (statusFilter && record.status !== statusFilter) {
            match = false;
        }

        return match;
    });

    displayRecords(filteredRecords);
    updateStats(filteredRecords);
}

function showAllRecords() {
    if (getEl('filterDate')) getEl('filterDate').value = '';
    if (getEl('filterUser')) getEl('filterUser').value = '';
    if (getEl('filterStatus')) getEl('filterStatus').value = '';
    applyFilters();
}

function displayRecords(records) {
    const recordsTable = getEl('recordsTable');
    if (!recordsTable) return;

    if (records.length === 0) {
        recordsTable.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>No records match your filters</p>
            </div>
        `;
        return;
    }

    let tableHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Roll Number</th>
                    <th>Email</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Subject</th>
                    <th>Notes</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    records.forEach(record => {
        const date = parseRecordDate(record);
        const dateStr = date ? date.toLocaleDateString() : '-';
        const timeStr = date ? date.toLocaleTimeString() : '-';
        const statusClassMap = {
            Present: 'status-present',
            Absent: 'status-absent',
            Late: 'status-late',
            Excused: 'status-excused'
        };
        const statusClass = statusClassMap[record.status] || 'status-absent';

        tableHTML += `
            <tr>
                <td>${record.id}</td>
                <td><strong>${record.name && record.name.startsWith('@') ? record.name.slice(1) : record.name}</strong></td>
                <td>${record.roll_number || '-'}</td>
                <td>${record.email || '-'}</td>
                <td>${dateStr}</td>
                <td>${timeStr}</td>
                <td><span class="status-badge ${statusClass}">${record.status}</span></td>
                <td>${record.subject || '-'}</td>
                <td>${record.notes || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-edit" onclick="editRecord(${record.id})" title="Edit">✏️ Edit</button>
                        <button class="btn btn-sm btn-delete" onclick="deleteRecord(${record.id})" title="Delete">🗑️ Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    recordsTable.innerHTML = tableHTML;
}

function updateStats(records) {
    const totalEl = getEl('totalRecords');
    const presentEl = getEl('presentCount');
    const absentEl = getEl('absentCount');
    const rateEl = getEl('attendanceRate');

    const presentCount = records.filter(r => r.status === 'Present').length;
    const absentCount = records.filter(r => r.status === 'Absent').length;

    if (totalEl) totalEl.textContent = records.length;
    if (presentEl) presentEl.textContent = presentCount;
    if (absentEl) absentEl.textContent = absentCount;

    const totalWithStatus = records.length;
    const rate = totalWithStatus > 0 ? ((presentCount / totalWithStatus) * 100).toFixed(1) : 0;
    if (rateEl) rateEl.textContent = rate + '%';
}

// Export to CSV
function exportToCSV() {
    if (filteredRecords.length === 0) {
        showAlert('No records to export', 'error');
        return;
    }

    let csv = 'ID,Name,Roll Number,Email,Date,Time,Status,Subject,Notes\n';

    filteredRecords.forEach(record => {
        const date = parseRecordDate(record);
        const dateStr = date ? date.toLocaleDateString() : '-';
        const timeStr = date ? date.toLocaleTimeString() : '-';
        const rollNumber = (record.roll_number || '').replace(/,/g, ';');
        const email = (record.email || '').replace(/,/g, ';');
        const subject = (record.subject || '').replace(/,/g, ';');
        const notes = (record.notes || '').replace(/,/g, ';');

        csv += `${record.id},"${record.name}","${rollNumber}","${email}","${dateStr}","${timeStr}","${record.status}","${subject}","${notes}"\n`;
    });

    downloadFile('attendance_records.csv', csv, 'text/csv');
    showAlert('✓ Records exported to CSV', 'success');
}

// Export to Excel (basic HTML table)
function exportToExcel() {
    if (filteredRecords.length === 0) {
        showAlert('No records to export', 'error');
        return;
    }

    let html = `
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #4CAF50; color: white; }
            </style>
        </head>
        <body>
            <h2>Attendance Records</h2>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Roll Number</th>
                        <th>Email</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Subject</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
    `;

    filteredRecords.forEach(record => {
        const date = parseRecordDate(record);
        const dateStr = date ? date.toLocaleDateString() : '-';
        const timeStr = date ? date.toLocaleTimeString() : '-';

        html += `
            <tr>
                <td>${record.id}</td>
                <td>${record.name && record.name.startsWith('@') ? record.name.slice(1) : record.name}</td>
                <td>${record.roll_number || '-'}</td>
                <td>${record.email || '-'}</td>
                <td>${dateStr}</td>
                <td>${timeStr}</td>
                <td>${record.status}</td>
                <td>${record.subject || '-'}</td>
                <td>${record.notes || '-'}</td>
            </tr>
        `;
    });

    html += `</tbody></table></body></html>`;

    downloadFile('attendance_records.xls', html, 'application/vnd.ms-excel');
    showAlert('✓ Records exported to Excel', 'success');
}

// Print records
function printRecords() {
    if (filteredRecords.length === 0) {
        showAlert('No records to print', 'error');
        return;
    }

    window.print();
}

function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}

function showEditRecordDialog(record) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.65);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(3px);
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            width: min(92vw, 500px);
            border-radius: 14px;
            background: linear-gradient(135deg, #1e1b4b 0%, #2d1b69 100%);
            border: 1px solid rgba(168, 85, 247, 0.35);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
            color: #f0e6ff;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 20px;
        `;

        const title = document.createElement('h3');
        title.textContent = '✏️ Edit Attendance Record';
        title.style.cssText = 'margin: 0 0 8px 0; color: #f0abfc; font-size: 1.2rem;';

        const subtitle = document.createElement('p');
        subtitle.textContent = `User: ${record.name && record.name.startsWith('@') ? record.name.slice(1) : record.name}`;
        subtitle.style.cssText = 'margin: 0 0 14px 0; color: #c8b8ff; font-size: 0.95rem;';

        const statusLabel = document.createElement('label');
        statusLabel.textContent = 'Status';
        statusLabel.style.cssText = 'display:block; margin-bottom:6px; font-weight:600;';

        const statusSelect = document.createElement('select');
        statusSelect.style.cssText = `
            width: 100%;
            padding: 11px 12px;
            border-radius: 8px;
            border: 2px solid rgba(168, 85, 247, 0.35);
            background: rgba(255, 255, 255, 0.96);
            color: #1f2937;
            font-size: 0.95rem;
            margin-bottom: 14px;
        `;

        const statusOptions = ['Present', 'Absent', 'Late', 'Excused'];
        statusOptions.forEach((status) => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            statusSelect.appendChild(option);
        });

        statusSelect.value = statusOptions.includes(record.status) ? record.status : 'Present';

        const notesLabel = document.createElement('label');
        notesLabel.textContent = 'Notes';
        notesLabel.style.cssText = 'display:block; margin-bottom:6px; font-weight:600;';

        const notesInput = document.createElement('textarea');
        notesInput.rows = 3;
        notesInput.value = record.notes || '';
        notesInput.placeholder = 'Optional notes...';
        notesInput.style.cssText = `
            width: 100%;
            resize: vertical;
            padding: 10px 12px;
            border-radius: 8px;
            border: 2px solid rgba(168, 85, 247, 0.35);
            background: rgba(255, 255, 255, 0.96);
            color: #1f2937;
            font-size: 0.92rem;
            margin-bottom: 16px;
        `;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex; justify-content:flex-end; gap:10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            border: 0;
            border-radius: 8px;
            padding: 9px 16px;
            background: rgba(148, 163, 184, 0.25);
            color: #e2e8f0;
            cursor: pointer;
            font-weight: 600;
        `;

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = `
            border: 0;
            border-radius: 8px;
            padding: 9px 16px;
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            color: white;
            cursor: pointer;
            font-weight: 700;
        `;

        cancelBtn.onclick = () => {
            overlay.remove();
            resolve(null);
        };

        saveBtn.onclick = () => {
            const selectedStatus = statusSelect.value;
            const notes = notesInput.value || '';
            overlay.remove();
            resolve({ status: selectedStatus, notes });
        };

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                overlay.remove();
                resolve(null);
            }
        });

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);

        dialog.appendChild(title);
        dialog.appendChild(subtitle);
        dialog.appendChild(statusLabel);
        dialog.appendChild(statusSelect);
        dialog.appendChild(notesLabel);
        dialog.appendChild(notesInput);
        dialog.appendChild(actions);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        statusSelect.focus();
    });
}

// Edit record
async function editRecord(recordId) {
    const record = allRecords.find(r => r.id === recordId);
    if (!record) {
        showAlert('Record not found', 'error');
        return;
    }

    const dialogResult = await showEditRecordDialog(record);
    if (!dialogResult) return;

    const { status: newStatus, notes: newNotes } = dialogResult;

    // Send update to backend
    fetch('/api/update_attendance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            record_id: recordId,
            status: newStatus,
            notes: newNotes
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('✓ Record updated successfully', 'success');
            loadRecords();
        } else {
            showAlert('Failed to update record', 'error');
        }
    })
    .catch(error => {
        console.error('Error updating record:', error);
        showAlert('Error updating record', 'error');
    });
}

// Delete record
function deleteRecord(recordId) {
    if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
        return;
    }

    fetch('/api/delete_attendance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            record_id: recordId
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            showAlert('✓ Record deleted successfully', 'success');
            loadRecords();
        } else {
            showAlert('Failed to delete record', 'error');
        }
    })
    .catch(error => {
        console.error('Error deleting record:', error);
        showAlert('Error deleting record', 'error');
    });
}

function showAlert(message, type) {
    const alertBox = getEl('alertBox');
    if (!alertBox) return;
    alertBox.className = `alert alert-${type} show`;
    alertBox.textContent = message;

    setTimeout(() => {
        alertBox.classList.remove('show');
    }, 5000);
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('adminUsername');
        location.href = '/admin_login';
    }
}

function bindFilterEvents() {
    ['filterDate', 'filterUser', 'filterStatus'].forEach((id) => {
        const el = getEl(id);
        if (!el) return;
        el.addEventListener('change', applyFilters);
    });
}

function initializeAttendanceRecordsPage() {
    bindFilterEvents();
    loadRecords();
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(loadRecords, 30000); // Refresh every 30 seconds
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAttendanceRecordsPage);
} else {
    initializeAttendanceRecordsPage();
}

// Add print styles
const style = document.createElement('style');
style.textContent = `
    @media print {
        .admin-header, .admin-nav, .dashboard-top-nav, .footer-actions, .btn-group, .form-group { display: none !important; }
        body { background: white !important; }
        .admin-card { background: white !important; box-shadow: none !important; }
        .data-table { color: black !important; }
        .data-table th { background: #4CAF50 !important; color: white !important; }
        .data-table td { color: black !important; }
    }
`;
document.head.appendChild(style);
