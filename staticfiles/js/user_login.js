// User Login Page JavaScript

const loginForm = document.getElementById('userLoginForm');
const loginUsername = document.getElementById('loginUsername');
const loginPassword = document.getElementById('loginPassword');
const loginBtn = document.getElementById('loginBtn');
const loginStatus = document.getElementById('loginStatus');
const togglePassword = document.getElementById('togglePassword');
const rememberMe = document.getElementById('rememberMe');

// Password visibility toggle
togglePassword.addEventListener('click', () => {
    const type = loginPassword.type === 'password' ? 'text' : 'password';
    loginPassword.type = type;
    togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
});

// Load saved username if "remember me" was checked
document.addEventListener('DOMContentLoaded', () => {
    const savedUsername = localStorage.getItem('rememberedUsername');
    if (savedUsername) {
        loginUsername.value = savedUsername;
        rememberMe.checked = true;
    }
});

// Password strength indicator (real-time)
loginPassword.addEventListener('input', () => {
    validatePasswordStrength(loginPassword.value);
});

function validatePasswordStrength(password) {
    // Basic password strength check
    if (password.length === 0) return;
    
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z\d]/.test(password)) strength++;
    
    // Visual feedback can be added here
    return strength;
}

// Form submission
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();
    
    console.log('[Login] Attempting login for:', username);
    
    // Validation
    if (!username || !password) {
        showStatus('Please enter both username and password', 'error');
        return;
    }
    
    // Disable button and show loader
    loginBtn.disabled = true;
    loginBtn.querySelector('.btn-text').style.display = 'none';
    loginBtn.querySelector('.btn-loader').style.display = 'inline';
    showStatus('Logging in...', 'info');
    
    try {
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
        console.log('[Login] Response:', data);
        
        if (data.success) {
            showStatus('✓ Login successful! Redirecting...', 'success');
            
            // Save username if "remember me" is checked
            if (rememberMe.checked) {
                localStorage.setItem('rememberedUsername', username);
            } else {
                localStorage.removeItem('rememberedUsername');
            }
            
            // Store user session info
            localStorage.setItem('userLoggedIn', 'true');
            localStorage.setItem('userName', data.user.name);
            localStorage.setItem('userUsername', username);
            localStorage.setItem('userId', data.user.id);
            
            // Redirect to user dashboard
            setTimeout(() => {
                window.location.href = '/user_dashboard';
            }, 1000);
        } else {
            showStatus('❌ ' + (data.message || 'Invalid credentials'), 'error');
            loginBtn.disabled = false;
            loginBtn.querySelector('.btn-text').style.display = 'inline';
            loginBtn.querySelector('.btn-loader').style.display = 'none';
        }
    } catch (error) {
        console.error('[Login] Error:', error);
        showStatus('❌ Connection error. Please try again.', 'error');
        loginBtn.disabled = false;
        loginBtn.querySelector('.btn-text').style.display = 'inline';
        loginBtn.querySelector('.btn-loader').style.display = 'none';
    }
});

function showStatus(message, type) {
    loginStatus.textContent = message;
    loginStatus.className = 'status-message show ' + type;
    
    // Auto-hide after 5 seconds for non-loading messages
    if (type !== 'info') {
        setTimeout(() => {
            loginStatus.classList.remove('show');
        }, 5000);
    }
}

// Enter key support
loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginForm.dispatchEvent(new Event('submit'));
    }
});
