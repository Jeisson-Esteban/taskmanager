document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginErrorMessage = document.getElementById('loginErrorMessage');
    const registerForm = document.getElementById('registerForm');
    const registerErrorMessage = document.getElementById('registerErrorMessage');

    // --- Lógica para mostrar/ocultar contraseña (funciona en ambas páginas) ---
    const togglePasswordIcons = document.querySelectorAll('.toggle-password');
    togglePasswordIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            const passwordInput = icon.previousElementSibling;
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            } else {
                passwordInput.type = 'password';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            }
        });
    });

    // --- Lógica para el formulario de Login ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (loginErrorMessage) loginErrorMessage.style.display = 'none';
            
            const formData = new FormData(loginForm);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (response.ok) {
                    window.location.href = '/dashboard';
                } else {
                    const errorData = await response.json();
                    if (loginErrorMessage) {
                        loginErrorMessage.textContent = errorData.error || 'Error desconocido.';
                        loginErrorMessage.style.display = 'block';
                    }
                }
            } catch (error) {
                if (loginErrorMessage) {
                    loginErrorMessage.textContent = 'Error de conexión. Inténtalo de nuevo.';
                    loginErrorMessage.style.display = 'block';
                }
            }
        });
    }

    // --- Lógica para el formulario de Registro ---
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (registerErrorMessage) registerErrorMessage.style.display = 'none';

            const formData = new FormData(registerForm);
            const data = Object.fromEntries(formData.entries());

            if (data.password.length < 8) {
                if (registerErrorMessage) {
                    registerErrorMessage.textContent = 'La contraseña debe tener al menos 8 caracteres.';
                    registerErrorMessage.style.display = 'block';
                }
                return;
            }

            try {
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok) {
                    alert(result.message); // Muestra mensaje de éxito
                    window.location.href = '/login'; // Redirige al login
                } else {
                    if (registerErrorMessage) {
                        registerErrorMessage.textContent = result.error || 'Error desconocido.';
                        registerErrorMessage.style.display = 'block';
                    }
                }
            } catch (error) {
                if (registerErrorMessage) {
                    registerErrorMessage.textContent = 'Error de conexión. Inténtalo de nuevo.';
                    registerErrorMessage.style.display = 'block';
                }
            }
        });
    }
});