// Attendance Record Page JavaScript

const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const tableBody = document.getElementById('tableBody');
const recordStatus = document.getElementById('recordStatus');
const filterNotice = document.getElementById('filterNotice');
const urlParams = new URLSearchParams(window.location.search);
const filterMode = urlParams.get('filter');
const ADMIN_ONLY_MESSAGE = 'Only admin can update and delete a record. Please contact administrator or click Admin Login.';
const FORCE_READ_ONLY_MODE = true;
let currentRecords = [];

function getRecordDate(record) {
    const isoValue = (record?.timestamp_iso || '').toString().trim();
    if (isoValue) {
        const isoDate = new Date(isoValue);
        if (!Number.isNaN(isoDate.getTime())) {
            return isoDate;
        }
    }

    const rawTimestamp = (record?.timestamp || '').toString().trim();
    if (!rawTimestamp) {
        return null;
    }

    // Legacy format "YYYY-MM-DD HH:MM:SS" (server UTC) -> make explicit UTC
    const normalizedUtc = rawTimestamp.includes('T') ? `${rawTimestamp}Z` : `${rawTimestamp.replace(' ', 'T')}Z`;
    const normalizedDate = new Date(normalizedUtc);
    if (!Number.isNaN(normalizedDate.getTime())) {
        return normalizedDate;
    }

    const fallbackDate = new Date(rawTimestamp);
    if (!Number.isNaN(fallbackDate.getTime())) {
        return fallbackDate;
    }

    return null;
}

function formatRecordTimestamp(record) {
    const date = getRecordDate(record);
    if (!date) {
        return (record?.timestamp || 'N/A').toString();
    }
    return date.toLocaleString();
}

// Simple client-side check; backend must still enforce authorization
function isAdminLoggedIn() {
    if (FORCE_READ_ONLY_MODE) {
        return false;
    }
    return Boolean(localStorage.getItem('adminUsername'));
}

// Load attendance records
async function loadAttendanceRecords() {
    try {
        showStatus('Loading records...', 'info');
        const response = await fetch('/api/attendance_list');
        const data = await response.json();

        if (data.success) {
            const filteredRecords = applyFilters(data.data || []);
            currentRecords = filteredRecords;
            displayRecords(currentRecords);

            const successMessage = filterMode === 'today'
                ? `Showing today's attendance (${filteredRecords.length})`
                : 'Records loaded successfully';
            showStatus(successMessage, 'success');
        } else {
            showStatus('Error loading records: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

// Display records in table
function displayRecords(records) {
    tableBody.innerHTML = '';

    if (records.length === 0) {
        const emptyText = filterMode === 'today'
            ? 'No attendance records found for today'
            : 'No attendance records found';
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center">${emptyText}</td></tr>`;
        return;
    }

    const adminLoggedIn = isAdminLoggedIn();
    const adminLockClass = adminLoggedIn ? '' : 'admin-locked';

    // Show action buttons for everyone; only admins can act
    records.forEach((record, index) => {
        const row = document.createElement('tr');
        const timestamp = formatRecordTimestamp(record);

        const actionsHTML = `
            <button class="action-btn edit-btn ${adminLockClass}" onclick="editRecord(${index})" title="Edit Record">✏️ Edit</button>
            <button class="action-btn delete-btn ${adminLockClass}" onclick="deleteRecord(${index})" title="Delete Record">🗑️ Delete</button>
            ${adminLoggedIn ? '' : '<div class="action-hint">Admin only</div>'}
        `;
        
        row.innerHTML = `
            <td>${record.name}</td>
            <td>${timestamp}</td>
            <td><span class="status-badge ${record.status.toLowerCase()}">${record.status}</span></td>
            <td>${record.subject || '-'}</td>
            <td class="actions-cell">
                ${actionsHTML}
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Edit record
let currentEditRecord = null;

function editRecord(index) {
    if (!isAdminLoggedIn()) {
        showErrorDialog(ADMIN_ONLY_MESSAGE, true);
        return;
    }

    const record = currentRecords[index];

    if (!record) {
        showStatus('Unable to locate record for editing', 'error');
        return;
    }

    currentEditRecord = record;
    
    // Show modal with dropdown
    const modal = document.getElementById('editModal');
    const personName = document.getElementById('editPersonName');
    const currentStatus = document.getElementById('editCurrentStatus');
    const statusSelect = document.getElementById('statusSelect');
    
    personName.textContent = record.name;
    currentStatus.textContent = record.status;
    statusSelect.value = record.status;
    
    modal.classList.add('show');
}

// Modal button handlers
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('editModal');
    const okBtn = document.getElementById('modalOkBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const errorDialog = document.getElementById('errorDialog');
    const errorDialogBtn = document.getElementById('errorDialogBtn');
    const errorDialogLoginBtn = document.getElementById('errorDialogLoginBtn');
    const adminLockHandler = (event) => {
        const targetBtn = event.target.closest('.admin-locked');
        if (targetBtn && !isAdminLoggedIn()) {
            event.preventDefault();
            event.stopPropagation();
            showErrorDialog(ADMIN_ONLY_MESSAGE, true);
        }
    };
    tableBody.addEventListener('click', adminLockHandler);
    
    okBtn.addEventListener('click', () => {
        const statusSelect = document.getElementById('statusSelect');
        const newStatus = statusSelect.value;
        
        if (currentEditRecord && newStatus) {
            updateRecord(currentEditRecord, newStatus);
            modal.classList.remove('show');
            currentEditRecord = null;
        }
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
        currentEditRecord = null;
    });
    
    // Close modal on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
            currentEditRecord = null;
        }
    });

    // Error dialog button handler
    errorDialogBtn.addEventListener('click', () => {
        errorDialog.classList.remove('show');
    });

    if (errorDialogLoginBtn) {
        errorDialogLoginBtn.addEventListener('click', () => {
            window.location.href = '/admin_login';
        });
    }

    // Close error dialog on outside click
    errorDialog.addEventListener('click', (e) => {
        if (e.target === errorDialog) {
            errorDialog.classList.remove('show');
        }
    });
});

// Update record status
async function updateRecord(record, newStatus) {
    if (!record) {
        return;
    }

    if (!isAdminLoggedIn()) {
        showErrorDialog(ADMIN_ONLY_MESSAGE, true);
        return;
    }

    try {
        showStatus('Updating record...', 'info');
        const recordId = record.id;
        
        if (!recordId) {
            showStatus('Error: Record ID is missing', 'error');
            return;
        }
        
        const updateResponse = await fetch(`/api/update_attendance/${recordId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                status: newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase(),
                notes: record.notes || ''
            })
        });
        
        if (!updateResponse.ok) {
            const errorText = await updateResponse.text();
            throw new Error(`Server error: ${updateResponse.status}. ${errorText.substring(0, 100)}`);
        }
        
        const updateData = await updateResponse.json();
        if (updateData.success) {
            showStatus('Record updated successfully', 'success');
            loadAttendanceRecords();
        } else {
            const errorMessage = updateData.message || 'Error updating record';
            showStatus('Error updating record: ' + errorMessage, 'error');
        }
    } catch (error) {
        showStatus('Error updating record: ' + error.message, 'error');
    }
}

// Delete record
function deleteRecord(index) {
    if (!isAdminLoggedIn()) {
        showErrorDialog(ADMIN_ONLY_MESSAGE, true);
        return;
    }

    const record = currentRecords[index];

    if (!record) {
        showStatus('Unable to locate record for deletion', 'error');
        return;
    }

    if (confirm(`Are you sure you want to delete the attendance record for ${record.name}?`)) {
        removeRecord(record);
    }
}

// Remove record from database
async function removeRecord(record) {
    if (!record) {
        return;
    }

    if (!isAdminLoggedIn()) {
        showErrorDialog(ADMIN_ONLY_MESSAGE, true);
        return;
    }

    try {
        showStatus('Deleting record...', 'info');
        const recordId = record.id;
        
        if (!recordId) {
            showStatus('Error: Record ID is missing', 'error');
            return;
        }
        
        const deleteResponse = await fetch(`/api/delete_attendance/${recordId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        if (!deleteResponse.ok) {
            const errorText = await deleteResponse.text();
            throw new Error(`Server error: ${deleteResponse.status}. ${errorText.substring(0, 100)}`);
        }
        
        const deleteData = await deleteResponse.json();
        if (deleteData.success) {
            showStatus('Record deleted successfully', 'success');
            loadAttendanceRecords();
        } else {
            const errorMessage = deleteData.message || 'Error deleting record';
            showStatus('Error deleting record: ' + errorMessage, 'error');
        }
    } catch (error) {
        showStatus('Error deleting record: ' + error.message, 'error');
    }
}

// Export to CSV
exportBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/attendance_list');
        const data = await response.json();

        if (data.success) {
            const recordsToExport = applyFilters(data.data || []);
            let csvContent = 'Name,Timestamp,Status,Subject,Actions\n';
            recordsToExport.forEach(record => {
                const localTimestamp = formatRecordTimestamp(record);
                const subject = (record.subject || '').toString().replace(/,/g, ';');
                const actions = (record.actions || 'Admin only').toString().replace(/,/g, ';');
                csvContent += `${record.name},"${localTimestamp}",${record.status},"${subject}","${actions}"\n`;
            });

            // Create download link
            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));

            const exportDate = new Date().toISOString().split('T')[0];
            const exportLabel = filterMode === 'today' ? 'today' : 'all';
            element.setAttribute('download', `attendance_${exportDate}_${exportLabel}.csv`);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            showStatus('Records exported successfully', 'success');
        }
    } catch (error) {
        showStatus('Error exporting records: ' + error.message, 'error');
    }
});

// Refresh button
refreshBtn.addEventListener('click', loadAttendanceRecords);

function showStatus(message, type) {
    recordStatus.textContent = message;
    recordStatus.className = 'status-message show ' + type;
    setTimeout(() => {
        recordStatus.classList.remove('show');
    }, 4000);
}

// Show error dialog popup
function showErrorDialog(message, allowAdminRedirect = false) {
    const errorDialog = document.getElementById('errorDialog');
    const errorDialogMessage = document.getElementById('errorDialogMessage');
    const errorDialogTitle = document.getElementById('errorDialogTitle');
    const errorDialogLoginBtn = document.getElementById('errorDialogLoginBtn');
    
    errorDialogTitle.textContent = 'Access Denied';
    errorDialogMessage.textContent = message;

    if (errorDialogLoginBtn) {
        errorDialogLoginBtn.style.display = allowAdminRedirect ? 'inline-flex' : 'none';
    }

    errorDialog.classList.add('show');
}

// Load records on page load
document.addEventListener('DOMContentLoaded', loadAttendanceRecords);

function applyFilters(records) {
    if (filterMode === 'today') {
        const now = new Date();
        const todayRecords = records.filter(record => {
            const recordDate = getRecordDate(record);
            if (!recordDate) {
                return false;
            }
            return (
                recordDate.getFullYear() === now.getFullYear() &&
                recordDate.getMonth() === now.getMonth() &&
                recordDate.getDate() === now.getDate()
            );
        });
        updateFilterNotice(`Today's Attendance • ${todayRecords.length} entr${todayRecords.length === 1 ? 'y' : 'ies'}`);
        return todayRecords;
    }

    updateFilterNotice('');
    return records;
}

function updateFilterNotice(message) {
    if (!filterNotice) {
        return;
    }

    if (message) {
        filterNotice.textContent = message;
        filterNotice.classList.add('show');
    } else {
        filterNotice.textContent = '';
        filterNotice.classList.remove('show');
    }
}
