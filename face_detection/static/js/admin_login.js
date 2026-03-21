// Admin Login Page JavaScript

const adminLoginForm = document.getElementById('adminLoginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberMeCheckbox = document.getElementById('rememberMe');
const togglePasswordBtn = document.getElementById('togglePassword');
const toggleIcon = document.getElementById('toggleIcon');
const loginStatus = document.getElementById('loginStatus');

// Toggle Password Visibility
togglePasswordBtn.addEventListener('click', (e) => {
    e.preventDefault();
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.textContent = '🙈';
    } else {
        passwordInput.type = 'password';
        toggleIcon.textContent = '👁️';
    }
});

// Handle Login Form Submission
adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberMeCheckbox.checked;

    // Validation
    if (!username) {
        showLoginStatus('Please enter username or email', 'error');
        return;
    }

    if (!password) {
        showLoginStatus('Please enter password', 'error');
        return;
    }

    if (password.length < 6) {
        showLoginStatus('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        // Disable submit button
        const submitBtn = adminLoginForm.querySelector('.btn-login');
        submitBtn.disabled = true;
        submitBtn.textContent = 'LOGGING IN...';

        showLoginStatus('Verifying credentials...', 'info');

        // Send login request to backend
        const response = await fetch('/api/admin_login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password,
                rememberMe: rememberMe
            })
        });

        const data = await response.json();

        if (data.success) {
            showLoginStatus('Login successful! Redirecting...', 'success');
            
            // Save username if remember me is checked
            if (rememberMe) {
                localStorage.setItem('adminUsername', username);
            } else {
                localStorage.removeItem('adminUsername');
            }

            // Redirect to admin dashboard after 1.5 seconds
            setTimeout(() => {
                window.location.href = data.redirectUrl || '/admin-dashboard/';
            }, 1500);
        } else {
            showLoginStatus(data.message || 'Login failed. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'LOGIN';
        }
    } catch (error) {
        showLoginStatus('Error: ' + error.message, 'error');
        const submitBtn = adminLoginForm.querySelector('.btn-login');
        submitBtn.disabled = false;
        submitBtn.textContent = 'LOGIN';
    }
});

// Load remembered username
function loadRememberedUsername() {
    const savedUsername = localStorage.getItem('adminUsername');
    if (savedUsername) {
        usernameInput.value = savedUsername;
        rememberMeCheckbox.checked = true;
        passwordInput.focus();
    }
}

// Show login status message
function showLoginStatus(message, type) {
    loginStatus.textContent = message;
    loginStatus.className = 'status-message show ' + type;
    
    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
        setTimeout(() => {
            loginStatus.classList.remove('show');
        }, 5000);
    }
}

// Clear status on input
usernameInput.addEventListener('input', () => {
    if (loginStatus.classList.contains('show')) {
        loginStatus.classList.remove('show');
    }
});

passwordInput.addEventListener('input', () => {
    if (loginStatus.classList.contains('show')) {
        loginStatus.classList.remove('show');
    }
});

// Load remembered username on page load
document.addEventListener('DOMContentLoaded', loadRememberedUsername);

// Prevent right-click on login form (optional security measure)
adminLoginForm.addEventListener('contextmenu', (e) => {
    // Uncomment if you want to prevent right-click
    // e.preventDefault();
});

// Add Enter key support for login button
adminLoginForm.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target !== usernameInput && e.target !== passwordInput) {
        adminLoginForm.dispatchEvent(new Event('submit'));
    }
});
