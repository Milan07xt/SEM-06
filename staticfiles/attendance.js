// Attendance Record Page JavaScript

const refreshBtn = document.getElementById('refreshBtn');
const exportBtn = document.getElementById('exportBtn');
const tableBody = document.getElementById('tableBody');
const recordStatus = document.getElementById('recordStatus');

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

// Load attendance records
async function loadAttendanceRecords() {
    try {
        showStatus('Loading records...', 'info');
        const response = await fetch('/api/attendance_list');
        const data = await response.json();

        if (data.success) {
            displayRecords(data.data);
            showStatus('Records loaded successfully', 'success');
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
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No attendance records found</td></tr>';
        return;
    }

    records.forEach(record => {
        const row = document.createElement('tr');
        const timestamp = formatRecordTimestamp(record);
        row.innerHTML = `
            <td>${record.name}</td>
            <td>${timestamp}</td>
            <td><span class="status-badge ${record.status.toLowerCase()}">${record.status}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

// Export to CSV
exportBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/attendance_list');
        const data = await response.json();

        if (data.success) {
            let csvContent = 'Name,Timestamp,Status\n';
            data.data.forEach(record => {
                const localTimestamp = formatRecordTimestamp(record);
                csvContent += `${record.name},"${localTimestamp}",${record.status}\n`;
            });

            // Create download link
            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
            element.setAttribute('download', `attendance_${new Date().toISOString().split('T')[0]}.csv`);
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

// Load records on page load
document.addEventListener('DOMContentLoaded', loadAttendanceRecords);
