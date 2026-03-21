# Admin Side - Face Attendance System

## 📁 File Structure

All files are stored in: `static/admin_side/`

### Files Created:

1. **admin_style.css** - Main stylesheet for all admin pages
2. **register_user.html** - Register new user face page
3. **register_user.js** - JavaScript for user registration
4. **mark_attendance.html** - Mark attendance page (manual + face recognition)
5. **mark_attendance.js** - JavaScript for marking attendance
6. **view_users.html** - View all registered users page
7. **view_users.js** - JavaScript for user management
8. **attendance_records.html** - View and export attendance records
9. **attendance_records.js** - JavaScript for records management

## 🎨 Features

### 📸 Register New User
- Camera integration for face capture
- Form validation
- Real-time preview
- Success/error alerts

### ✓ Mark Attendance
- Manual attendance marking (select user + status)
- Face recognition option with camera
- Recent attendance display (today's records)
- Auto-refresh every 30 seconds

### 👥 View All Users
- Complete user list with search
- User statistics (total, active today, last registered)
- View user details
- Delete users with confirmation modal
- Auto-refresh every 30 seconds

### 📋 Attendance Records
- Advanced filtering (date, user, status)
- Statistics dashboard (total, present, absent, attendance rate)
- Export to CSV
- Export to Excel
- Print functionality
- Auto-refresh every 30 seconds

## 🎨 Design Features

- Dark theme with purple gradients
- Responsive design (mobile, tablet, desktop)
- Modern card-based layout
- Smooth animations and transitions
- Loading spinners
- Alert messages (success, error, info)
- Modal popups
- Beautiful tables with hover effects

## 🔗 Navigation

All pages include:
- Header with admin info and timestamp
- Navigation tabs for easy switching
- Footer with back, add user, and logout buttons

## 🚀 Usage

### To use these files in Flask:

```python
# Add routes in app.py

@app.route('/admin/register')
def admin_register():
    return send_from_directory('static/admin_side', 'register_user.html')

@app.route('/admin/mark_attendance')
def admin_mark_attendance():
    return send_from_directory('static/admin_side', 'mark_attendance.html')

@app.route('/admin/users')
def admin_users():
    return send_from_directory('static/admin_side', 'view_users.html')

@app.route('/admin/records')
def admin_records():
    return send_from_directory('static/admin_side', 'attendance_records.html')
```

### Required API Endpoints:

- `POST /api/register_face` - Register new user
- `POST /api/mark_manual_attendance` - Mark attendance manually
- `POST /api/mark_attendance_face` - Mark attendance via face recognition
- `GET /api/registered_people` - Get all users
- `GET /api/attendance_list` - Get attendance records
- `DELETE /api/delete_user/<id>` - Delete user

## 📝 Notes

- All pages share the same CSS file (admin_style.css)
- JavaScript files are standalone for each page
- Admin username stored in localStorage
- Auto-refresh enabled for real-time updates
- Export functionality works client-side (no server needed)

## 🎯 Next Steps

1. Add these routes to your Flask app.py
2. Implement the required API endpoints
3. Test each page functionality
4. Customize colors/styles in admin_style.css if needed

---
© 2026 Face Detection Attendance System
