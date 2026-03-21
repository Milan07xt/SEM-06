// Mark Attendance JavaScript

let videoStream = null;
let recentAttendanceRecords = [];
let selectedAttendanceIds = new Set();
let editingAttendanceIds = new Set();

// Update current time
function updateTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString();
}

setInterval(updateTime, 1000);
updateTime();

// Load admin username
const adminUsername = localStorage.getItem('adminUsername') || 'Admin';
document.getElementById('adminUsername').textContent = adminUsername;

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/registered_people');
        const result = await response.json();

        if (result.success) {
            const selectUser = document.getElementById('selectUser');
            selectUser.innerHTML = '<option value="">-- Select a user --</option>';
            
            result.people.forEach(person => {
                const option = document.createElement('option');
                option.value = person.name;
                option.textContent = person.name;
                selectUser.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

// Load recent attendance
async function loadRecentAttendance() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(`/api/attendance_list?date=${today}`);
        const result = await response.json();

        const recentDiv = document.getElementById('recentAttendance');

        if (result.success && result.data.length > 0) {
            recentAttendanceRecords = result.data;
            const availableIds = new Set(recentAttendanceRecords.map(record => Number(record.id)));
            selectedAttendanceIds = new Set(
                [...selectedAttendanceIds].filter(id => availableIds.has(Number(id)))
            );
            editingAttendanceIds = new Set(
                [...editingAttendanceIds].filter(id => availableIds.has(Number(id)))
            );

            let tableHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="col-select"><input type="checkbox" id="selectAllAttendanceCheckbox" title="Select all rows"></th>
                            <th>Name</th>
                            <th>Time</th>
                            <th>Status</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            result.data.forEach(record => {
                const statusClass = record.status === 'Present' ? 'status-present' : 'status-absent';
                const recordId = Number(record.id);
                const isChecked = selectedAttendanceIds.has(recordId);
                const isEditing = editingAttendanceIds.has(recordId);

                const statusOptions = ['Present', 'Absent', 'Late', 'Excused', 'Leave', 'Registered']
                    .map(status => `<option value="${status}" ${status === record.status ? 'selected' : ''}>${status}</option>`)
                    .join('');

                const safeNotes = String(record.notes || '')
                    .replace(/&/g, '&amp;')
                    .replace(/"/g, '&quot;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                tableHTML += `
                    <tr class="${isEditing ? 'editing-row' : ''}">
                        <td class="col-select"><input type="checkbox" class="attendance-row-checkbox" data-record-id="${recordId}" ${isChecked ? 'checked' : ''}></td>
                        <td>${record.name}</td>
                        <td>${new Date(record.timestamp).toLocaleTimeString()}</td>
                        <td>
                            <select class="attendance-status-input" data-record-id="${recordId}">
                                ${statusOptions}
                            </select>
                        </td>
                        <td>
                            <input type="text" class="attendance-notes-input" data-record-id="${recordId}" value="${safeNotes}" placeholder="-">
                        </td>
                    </tr>
                `;
            });

            tableHTML += `</tbody></table>`;
            recentDiv.innerHTML = tableHTML;
            bindAttendanceSelectionEvents();
            updateAttendanceSelectionUI();
        } else {
            recentAttendanceRecords = [];
            selectedAttendanceIds.clear();
            editingAttendanceIds.clear();
            recentDiv.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <p>No attendance records for today</p>
                </div>
            `;
            updateAttendanceSelectionUI();
        }
    } catch (error) {
        console.error('Error loading attendance:', error);
    }
}

function bindAttendanceSelectionEvents() {
    const selectAllCheckbox = document.getElementById('selectAllAttendanceCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (event) => {
            toggleSelectAllAttendance(event.target.checked);
        });
    }

    const rowCheckboxes = document.querySelectorAll('.attendance-row-checkbox');
    rowCheckboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', (event) => {
            const recordId = Number(event.target.dataset.recordId);
            if (event.target.checked) {
                selectedAttendanceIds.add(recordId);
            } else {
                selectedAttendanceIds.delete(recordId);
            }
            updateAttendanceSelectionUI();
        });
    });
}

function toggleSelectAllAttendance(shouldSelect) {
    const rowCheckboxes = document.querySelectorAll('.attendance-row-checkbox');
    rowCheckboxes.forEach((checkbox) => {
        const recordId = Number(checkbox.dataset.recordId);
        checkbox.checked = shouldSelect;
        if (shouldSelect) {
            selectedAttendanceIds.add(recordId);
        } else {
            selectedAttendanceIds.delete(recordId);
        }
    });

    updateAttendanceSelectionUI();
}

function selectAllAttendanceFromButton() {
    if (recentAttendanceRecords.length === 0) {
        showAlert('No attendance records available to select.', 'error');
        return;
    }

    const totalRecords = recentAttendanceRecords.length;
    const allSelected = totalRecords > 0 && selectedAttendanceIds.size === totalRecords;
    toggleSelectAllAttendance(!allSelected);
}

function updateAttendanceSelectionUI() {
    const totalRecords = recentAttendanceRecords.length;
    const selectedCount = selectedAttendanceIds.size;

    const selectedCountLabel = document.getElementById('selectedAttendanceCount');
    const deleteBtn = document.getElementById('deleteSelectedAttendanceBtn');
    const selectAllBtn = document.getElementById('selectAllAttendanceBtn');
    const selectAllCheckbox = document.getElementById('selectAllAttendanceCheckbox');
    const editSelectedBtn = document.getElementById('editSelectedAttendanceBtn');
    const updateSelectedBtn = document.getElementById('updateSelectedAttendanceBtn');
    const deleteAllBtn = document.getElementById('deleteAllAttendanceBtn');

    if (selectedCountLabel) {
        selectedCountLabel.textContent = `${selectedCount} selected`;
    }

    if (deleteBtn) {
        deleteBtn.disabled = totalRecords === 0 || selectedCount === 0;
    }

    if (selectAllBtn) {
        selectAllBtn.disabled = totalRecords === 0;
        const allSelected = totalRecords > 0 && selectedCount === totalRecords;
        selectAllBtn.textContent = allSelected ? '☑️ Unselect All' : '☑️ Select All';
    }

    if (editSelectedBtn) {
        editSelectedBtn.disabled = totalRecords === 0 || selectedCount === 0;
    }

    if (updateSelectedBtn) {
        updateSelectedBtn.disabled = totalRecords === 0 || selectedCount === 0;
    }

    if (deleteAllBtn) {
        deleteAllBtn.disabled = totalRecords === 0;
    }

    if (selectAllCheckbox) {
        const allSelected = totalRecords > 0 && selectedCount === totalRecords;
        const partiallySelected = selectedCount > 0 && selectedCount < totalRecords;
        selectAllCheckbox.checked = allSelected;
        selectAllCheckbox.indeterminate = partiallySelected;
    }
}

function editSelectedAttendanceRecords() {
    if (selectedAttendanceIds.size === 0) {
        showAlert('Please select at least one record to edit.', 'error');
        return;
    }

    editingAttendanceIds = new Set(selectedAttendanceIds);
    loadRecentAttendance();
    showAlert(`✏️ Editing enabled for ${editingAttendanceIds.size} record(s).`, 'success');
}

async function updateSelectedAttendanceRecords() {
    const idsToUpdate = selectedAttendanceIds.size > 0
        ? [...selectedAttendanceIds]
        : [...editingAttendanceIds];
    if (idsToUpdate.length === 0) {
        showAlert('Please select at least one record to update.', 'error');
        return;
    }

    const updateBtn = document.getElementById('updateSelectedAttendanceBtn');
    const originalText = updateBtn ? updateBtn.textContent : '';
    if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.textContent = 'Updating...';
    }

    let updatedCount = 0;
    let failedCount = 0;

    for (const recordId of idsToUpdate) {
        try {
            const statusInput = document.querySelector(`.attendance-status-input[data-record-id="${recordId}"]`);
            const notesInput = document.querySelector(`.attendance-notes-input[data-record-id="${recordId}"]`);
            const existingRecord = recentAttendanceRecords.find(rec => Number(rec.id) === Number(recordId));

            if (!statusInput || !notesInput || !existingRecord) {
                failedCount += 1;
                continue;
            }

            const response = await fetch(`/api/update_attendance/${recordId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    status: statusInput.value,
                    notes: notesInput.value.trim(),
                    timestamp: existingRecord.timestamp
                })
            });

            const result = await response.json();
            if (result.success) {
                updatedCount += 1;
            } else {
                failedCount += 1;
            }
        } catch (error) {
            console.error(`Failed updating attendance record ${recordId}:`, error);
            failedCount += 1;
        }
    }

    editingAttendanceIds.clear();
    await loadRecentAttendance();

    if (updateBtn) {
        updateBtn.textContent = originalText || '✅ Update Selected';
    }

    if (updatedCount > 0 && failedCount === 0) {
        showAlert(`✅ Updated ${updatedCount} attendance record(s).`, 'success');
    } else if (updatedCount > 0 && failedCount > 0) {
        showAlert(`Updated ${updatedCount}, but ${failedCount} failed.`, 'error');
    } else {
        showAlert('Failed to update selected attendance records.', 'error');
    }
}

async function deleteAllAttendanceRecords() {
    if (recentAttendanceRecords.length === 0) {
        showAlert('No attendance records available to delete.', 'error');
        return;
    }

    const confirmed = confirm('Delete ALL attendance records? This action cannot be undone.');
    if (!confirmed) return;

    const deleteAllBtn = document.getElementById('deleteAllAttendanceBtn');
    const originalText = deleteAllBtn ? deleteAllBtn.textContent : '';
    if (deleteAllBtn) {
        deleteAllBtn.disabled = true;
        deleteAllBtn.textContent = 'Deleting All...';
    }

    try {
        const response = await fetch('/api/reset_database', {
            method: 'POST'
        });
        const result = await response.json();

        if (result.success) {
            selectedAttendanceIds.clear();
            editingAttendanceIds.clear();
            await loadRecentAttendance();
            showAlert('🔥 All attendance records deleted.', 'success');
        } else {
            showAlert(`Error: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error deleting all attendance records:', error);
        showAlert('Failed to delete all attendance records.', 'error');
    }

    if (deleteAllBtn) {
        deleteAllBtn.textContent = originalText || '🔥 Delete All Attendance';
        deleteAllBtn.disabled = recentAttendanceRecords.length === 0;
    }
}

async function deleteSelectedAttendanceRecords() {
    const idsToDelete = [...selectedAttendanceIds].sort((a, b) => b - a);
    if (idsToDelete.length === 0) {
        showAlert('Please select at least one record to delete.', 'error');
        return;
    }

    const confirmed = confirm(`Delete ${idsToDelete.length} selected attendance record(s)? This cannot be undone.`);
    if (!confirmed) return;

    const deleteBtn = document.getElementById('deleteSelectedAttendanceBtn');
    const originalText = deleteBtn ? deleteBtn.textContent : '';
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
    }

    let deletedCount = 0;
    let failedCount = 0;

    for (const recordId of idsToDelete) {
        try {
            const response = await fetch(`/api/delete_attendance/${recordId}`, {
                method: 'DELETE'
            });
            const result = await response.json();
            if (result.success) {
                deletedCount += 1;
            } else {
                failedCount += 1;
            }
        } catch (error) {
            console.error(`Failed deleting attendance record ${recordId}:`, error);
            failedCount += 1;
        }
    }

    selectedAttendanceIds.clear();
    await loadRecentAttendance();

    if (deleteBtn) {
        deleteBtn.disabled = selectedAttendanceIds.size === 0;
        deleteBtn.textContent = originalText || '🗑️ Delete Selected';
    }

    if (deletedCount > 0 && failedCount === 0) {
        showAlert(`✓ Deleted ${deletedCount} attendance record(s).`, 'success');
    } else if (deletedCount > 0 && failedCount > 0) {
        showAlert(`Deleted ${deletedCount}, but ${failedCount} failed.`, 'error');
    } else {
        showAlert('Failed to delete selected attendance records.', 'error');
    }
}

// Mark attendance manually
document.getElementById('markAttendanceBtn').addEventListener('click', async () => {
    const userName = document.getElementById('selectUser').value;
    const status = document.getElementById('attendanceStatus').value;
    const notes = document.getElementById('notes').value.trim();

    if (!userName) {
        showAlert('Please select a user', 'error');
        return;
    }

    const btn = document.getElementById('markAttendanceBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Marking...';

    try {
        const response = await fetch('/api/mark_manual_attendance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: userName,
                status: status,
                notes: notes
            })
        });

        const result = await response.json();

        if (result.success) {
            showAlert(`✓ Attendance marked for ${userName}`, 'success');
            resetForm();
            loadRecentAttendance();
        } else {
            showAlert(`Error: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('Failed to mark attendance', 'error');
    }

    btn.disabled = false;
    btn.textContent = '✓ Mark Attendance';
});

// Camera controls
const videoFeed = document.getElementById('videoFeed');
const videoContainer = document.getElementById('videoContainer');
const startCameraBtn = document.getElementById('startCameraBtn');
const captureBtn = document.getElementById('captureBtn');

startCameraBtn.addEventListener('click', startCamera);
captureBtn.addEventListener('click', captureAndMark);

async function startCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        videoFeed.srcObject = videoStream;
        videoContainer.style.display = 'block';
        startCameraBtn.textContent = '⏹️ Stop Camera';
        startCameraBtn.onclick = stopCamera;
        captureBtn.disabled = false;

        showAlert('Camera started successfully', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        showAlert('Failed to access camera', 'error');
    }
}

function stopCamera() {
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    videoContainer.style.display = 'none';
    startCameraBtn.textContent = '📹 Start Camera';
    startCameraBtn.onclick = startCamera;
    captureBtn.disabled = true;
}

async function captureAndMark() {
    const canvas = document.getElementById('captureCanvas');
    canvas.width = videoFeed.videoWidth;
    canvas.height = videoFeed.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoFeed, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg');

    captureBtn.disabled = true;
    captureBtn.innerHTML = '<span class="spinner"></span> Processing...';

    try {
        const response = await fetch('/api/mark_attendance_face', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: imageData })
        });

        const result = await response.json();

        if (result.success) {
            showAlert(`✓ Attendance marked for ${result.name}`, 'success');
            loadRecentAttendance();
            stopCamera();
        } else {
            showAlert(`Error: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showAlert('Failed to process face recognition', 'error');
    }

    captureBtn.disabled = false;
    captureBtn.textContent = '📸 Capture & Mark';
}

function resetForm() {
    document.getElementById('selectUser').value = '';
    document.getElementById('attendanceStatus').value = 'Present';
    document.getElementById('notes').value = '';
}

function showAlert(message, type) {
    const alertBox = document.getElementById('alertBox');
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

const selectAllAttendanceBtn = document.getElementById('selectAllAttendanceBtn');
if (selectAllAttendanceBtn) {
    selectAllAttendanceBtn.addEventListener('click', selectAllAttendanceFromButton);
}

const deleteSelectedAttendanceBtn = document.getElementById('deleteSelectedAttendanceBtn');
if (deleteSelectedAttendanceBtn) {
    deleteSelectedAttendanceBtn.addEventListener('click', deleteSelectedAttendanceRecords);
}

const editSelectedAttendanceBtn = document.getElementById('editSelectedAttendanceBtn');
if (editSelectedAttendanceBtn) {
    editSelectedAttendanceBtn.addEventListener('click', editSelectedAttendanceRecords);
}

const updateSelectedAttendanceBtn = document.getElementById('updateSelectedAttendanceBtn');
if (updateSelectedAttendanceBtn) {
    updateSelectedAttendanceBtn.addEventListener('click', updateSelectedAttendanceRecords);
}

const deleteAllAttendanceBtn = document.getElementById('deleteAllAttendanceBtn');
if (deleteAllAttendanceBtn) {
    deleteAllAttendanceBtn.addEventListener('click', deleteAllAttendanceRecords);
}

// Initialize
loadUsers();
loadRecentAttendance();
setInterval(loadRecentAttendance, 30000); // Refresh every 30 seconds
