// View Users JavaScript

let allUsers = [];
let userToDelete = null;
let userToView = null;

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(value) {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString();
}

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

// Load all users
async function loadUsers() {
    try {
        const response = await fetch('/api/registered_people');
        const result = await response.json();

        if (result.success) {
            allUsers = result.people;
            displayUsers(allUsers);
            updateStats();
        } else {
            document.getElementById('usersTable').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <p>No users found</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('Failed to load users', 'error');
    }
}

function displayUsers(users) {
    const usersTable = document.getElementById('usersTable');

    if (users.length === 0) {
        usersTable.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <p>No users found</p>
            </div>
        `;
        return;
    }

    let tableHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Faces</th>
                    <th>Encodings</th>
                    <th>Match Status</th>
                    <th>Registered Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    users.forEach(user => {
        const registeredDate = user.registered_date ? new Date(user.registered_date).toLocaleDateString() : 'N/A';
        const statusHtml = user.is_valid
            ? '<span style="color:#16a34a;font-weight:700;">✅ Valid</span>'
            : `<span style="color:#dc2626;font-weight:700;">❌ Invalid</span><br><small style="color:#ef4444;">${(user.validation_reasons || []).join(', ') || 'Data mismatch'}</small>`;
        const safeUsername = JSON.stringify(user.username || '').replace(/</g, '\\u003c');
        const safeName = JSON.stringify(user.name || '').replace(/</g, '\\u003c');
        tableHTML += `
            <tr>
                <td>${user.id}</td>
                <td><code>${user.username || 'N/A'}</code></td>
                <td><strong>${user.name}</strong></td>
                <td>${user.email || 'N/A'}</td>
                <td>${user.face_count ?? 0}</td>
                <td>${user.encoding_count ?? 0}</td>
                <td>${statusHtml}</td>
                <td>${registeredDate}</td>
                <td>
                    <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="viewUserDetails(${user.id})">👁️ View</button>
                    <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" onclick='deleteUser(${safeUsername}, ${safeName})'>🗑️ Delete</button>
                </td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    usersTable.innerHTML = tableHTML;
}

function updateStats() {
    document.getElementById('totalUsers').textContent = allUsers.length;
    
    // Last registered
    if (allUsers.length > 0) {
        const lastUser = [...allUsers].sort((a, b) => {
            const da = new Date(a.registered_date || 0).getTime();
            const db = new Date(b.registered_date || 0).getTime();
            return db - da;
        })[0];
        document.getElementById('lastRegistered').textContent = lastUser.name;
    }

    // Get active today count
    getActiveTodayCount();
}

async function getActiveTodayCount() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const response = await fetch(`/api/attendance_list?date=${today}`);
        const result = await response.json();

        if (result.success) {
            const uniqueUsers = [...new Set(result.data.map(record => record.name))];
            document.getElementById('activeToday').textContent = uniqueUsers.length;
        }
    } catch (error) {
        console.error('Error getting active count:', error);
    }
}

// Search functionality
document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredUsers = allUsers.filter(user => 
        (user.name || '').toLowerCase().includes(searchTerm) ||
        (user.username || '').toLowerCase().includes(searchTerm) ||
        (user.email && user.email.toLowerCase().includes(searchTerm))
    );
    displayUsers(filteredUsers);
});

// View user details
function viewUserDetails(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) {
        showAlert('User not found.', 'error');
        return;
    }

    userToView = user;

    const viewModal = document.getElementById('viewModal');
    const viewTitle = document.getElementById('viewModalTitle');
    const viewContent = document.getElementById('viewUserDetailsContent');
    const viewDeleteBtn = document.getElementById('viewDeleteBtn');

    if (!viewModal || !viewTitle || !viewContent || !viewDeleteBtn) {
        showAlert('Unable to open user details modal.', 'error');
        return;
    }

    const isValid = !!user.is_valid;
    const reasons = (user.validation_reasons || []).map(escapeHtml);

    viewTitle.textContent = `👤 ${user.name || user.username || 'User'} Details`;
    viewContent.innerHTML = `
        <div class="view-details-grid">
            <div class="view-detail-item"><span class="label">ID</span><span class="value">${escapeHtml(user.id)}</span></div>
            <div class="view-detail-item"><span class="label">Username</span><span class="value">${escapeHtml(user.username || 'N/A')}</span></div>
            <div class="view-detail-item"><span class="label">Name</span><span class="value">${escapeHtml(user.name || 'N/A')}</span></div>
            <div class="view-detail-item"><span class="label">Email</span><span class="value">${escapeHtml(user.email || 'N/A')}</span></div>
            <div class="view-detail-item"><span class="label">Roll Number</span><span class="value">${escapeHtml(user.roll_number || 'N/A')}</span></div>
            <div class="view-detail-item"><span class="label">Registered</span><span class="value">${escapeHtml(formatDate(user.registered_date))}</span></div>
            <div class="view-detail-item"><span class="label">Face Images</span><span class="value">${escapeHtml(user.face_count ?? 0)}</span></div>
            <div class="view-detail-item"><span class="label">Encodings</span><span class="value">${escapeHtml(user.encoding_count ?? 0)}</span></div>
            <div class="view-detail-item"><span class="label">Status</span><span class="value ${isValid ? 'ok' : 'bad'}">${isValid ? '✅ Valid' : '❌ Invalid'}</span></div>
        </div>
        ${!isValid ? `
            <div class="view-detail-warning">
                <strong>Cleanup recommended:</strong>
                <ul>
                    ${reasons.length ? reasons.map(reason => `<li>${reason}</li>`).join('') : '<li>Data mismatch detected.</li>'}
                </ul>
            </div>
        ` : ''}
    `;

    viewDeleteBtn.style.display = isValid ? 'none' : 'inline-flex';
    viewModal.classList.add('show');
}

function closeViewModal() {
    const viewModal = document.getElementById('viewModal');
    if (viewModal) {
        viewModal.classList.remove('show');
    }
    userToView = null;
}

// Delete user
function deleteUser(userId, userName) {
    const username = (userId || '').toString().trim();
    const displayName = (userName || username || 'this user').toString();
    userToDelete = { username, name: displayName };
    document.getElementById('deleteUserName').textContent = displayName;
    document.getElementById('deleteModal').classList.add('show');
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('show');
    userToDelete = null;
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    if (!userToDelete) return;

    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Deleting...';

    try {
        await requestDeleteUser(userToDelete.username, userToDelete.name, { silentModalClose: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('Failed to delete user', 'error');
    }

    btn.disabled = false;
    btn.textContent = 'Delete';
});

async function requestDeleteUser(username, displayName, options = {}) {
    const { silentModalClose = false, closeViewOnSuccess = true } = options;

    const response = await fetch(`/api/delete_user/${encodeURIComponent(username)}`, {
        method: 'DELETE'
    });

    const result = await response.json();

    if (result.success) {
        showAlert(`✓ User "${displayName}" deleted successfully`, 'success');
        if (silentModalClose) {
            closeDeleteModal();
        }
        if (closeViewOnSuccess) {
            closeViewModal();
        }
        await loadUsers();
        return true;
    }

    showAlert(`Error: ${result.message}`, 'error');
    return false;
}

const viewDeleteBtnElement = document.getElementById('viewDeleteBtn');
if (viewDeleteBtnElement) {
    viewDeleteBtnElement.addEventListener('click', async () => {
        if (!userToView || !userToView.username) {
            showAlert('No user selected for deletion.', 'error');
            return;
        }

        const confirmed = confirm(`Delete all data for "${userToView.name || userToView.username}"? This cannot be undone.`);
        if (!confirmed) return;

        const originalText = viewDeleteBtnElement.textContent;
        viewDeleteBtnElement.disabled = true;
        viewDeleteBtnElement.textContent = 'Deleting...';

        try {
            await requestDeleteUser(userToView.username, userToView.name || userToView.username, {
                silentModalClose: true,
                closeViewOnSuccess: true
            });
        } catch (error) {
            console.error('Error deleting from view modal:', error);
            showAlert('Failed to delete user', 'error');
        } finally {
            viewDeleteBtnElement.disabled = false;
            viewDeleteBtnElement.textContent = originalText;
        }
    });
}

const viewModalElement = document.getElementById('viewModal');
if (viewModalElement) {
    viewModalElement.addEventListener('click', (event) => {
        if (event.target === viewModalElement) {
            closeViewModal();
        }
    });
}

const deleteModalElement = document.getElementById('deleteModal');
if (deleteModalElement) {
    deleteModalElement.addEventListener('click', (event) => {
        if (event.target === deleteModalElement) {
            closeDeleteModal();
        }
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeViewModal();
        closeDeleteModal();
    }
});

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

// Initialize
loadUsers();
setInterval(loadUsers, 30000); // Refresh every 30 seconds
