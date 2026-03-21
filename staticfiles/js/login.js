// Login Page JavaScript

// Show/Hide login forms
function showLoginType() {
    document.getElementById('loginTypeSelection').style.display = 'block';
    document.getElementById('userLoginForm').style.display = 'none';
}

function showLoginForm(type) {
    if (type === 'admin') {
        // Redirect to Admin Login page
        window.location.href = '/admin_login';
    } else if (type === 'user') {
        // Redirect directly to dedicated user login page
        window.location.href = '/user_login';
    }
}

// User Login Form Elements
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const togglePassword = document.getElementById('togglePassword');
const rememberMeCheckbox = document.getElementById('rememberMe');
const loginStatus = document.getElementById('loginStatus');

// Toggle password visibility for user login
if (togglePassword) {
    togglePassword.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
        togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
    });
}

// Load remembered username if exists
document.addEventListener('DOMContentLoaded', () => {
    const rememberedUsername = localStorage.getItem('rememberedUsername');
    if (rememberedUsername && usernameInput) {
        usernameInput.value = rememberedUsername;
        rememberMeCheckbox.checked = true;
    }
});

// Handle user login form submission
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const rememberMe = rememberMeCheckbox.checked;

        if (!username || !password) {
            showStatus(loginStatus, 'Please enter both username and password', 'error');
            return;
        }

        try {
            showStatus(loginStatus, 'Logging in...', 'info');

            const response = await fetch('/api/user_login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (data.success) {
                // Save user session
                localStorage.setItem('username', username);
                localStorage.setItem('userId', data.user_id);
                localStorage.setItem('userName', data.name);

                // Handle remember me
                if (rememberMe) {
                    localStorage.setItem('rememberedUsername', username);
                } else {
                    localStorage.removeItem('rememberedUsername');
                }

                showStatus(loginStatus, 'Login successful! Redirecting...', 'success');

                // Redirect to user dashboard
                setTimeout(() => {
                    window.location.href = '/user_dashboard';
                }, 1000);
            } else {
                showStatus(loginStatus, data.message || 'Invalid username or password', 'error');
            }
        } catch (error) {
            showStatus(loginStatus, 'An error occurred. Please try again.', 'error');
            console.error('Login error:', error);
        }
    });
}

// Show status message
function showStatus(statusElement, message, type) {
    if (!statusElement) return;
    
    statusElement.textContent = message;
    statusElement.className = `status-message show ${type}`;
    
    setTimeout(() => {
        statusElement.classList.remove('show');
    }, 4000);
}

// Add enter key support for password fields
if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            loginForm.dispatchEvent(new Event('submit'));
        }
    });
}
