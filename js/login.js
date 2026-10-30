// Script of login.html. It is an external file (not inline) so the Content-Security-Policy can forbid inline scripts.
// Loaded without defer at the end of the page, so it runs at the same moment the inline script used to.

// Where to go after logging in: ?next=/herramientas#filtrar brings the user back to that tool.
// Only paths on this site are accepted ("/x", never "//other.site" or "https://..."), so the link can't send people elsewhere.
const NEXT_PAGE = (() => {
    const next = new URLSearchParams(window.location.search).get('next') || '';
    return /^\/(?![\/\\])[A-Za-z0-9\-._~\/#]*$/.test(next) ? next : '/perfil';
})();

// Arriving from the "reset your password" email: Supabase opens a temporary session from the link, and this page
// asks for the new password instead of sending the (already logged in) user on to their profile.
const IS_RESET = new URLSearchParams(window.location.search).has('reset')
    || /type=recovery|error_code=/.test(window.location.hash);

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.supabaseClient) return;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (IS_RESET) { showResetForm(session); return; }
    if (session) window.location.href = NEXT_PAGE;
});

// Supabase error codes -> friendly messages. Anything unknown falls back to Supabase's own text.
const AUTH_ERRORS = {
    over_email_send_rate_limit: "Ahora mismo hay muchos registros a la vez. Espera unos minutos y vuelve a intentarlo.",
    over_request_rate_limit: "Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.",
    email_not_confirmed: "Aún no has confirmado tu correo. Revisa tu bandeja de entrada (y la carpeta de spam).",
    weak_password: "La contraseña es demasiado débil. Usa al menos 8 caracteres.",
    email_address_invalid: "Ese correo no es válido.",
    captcha_failed: "No hemos podido comprobar que no eres un robot. Recarga la página e inténtalo de nuevo.",
    same_password: "La nueva contraseña tiene que ser distinta de la anterior."
};
const MIN_PASSWORD = 8;
// Sign-up answers the same whether or not the email already has an account, so the form can't be used to
// find out who is registered
const SIGNUP_DONE = "Si el correo no tenía cuenta, te hemos enviado un enlace para confirmarla: revisa tu bandeja de entrada (y la carpeta de spam). Si ya tienes cuenta, pulsa Iniciar Sesión.";

// ── Anti-bot (Cloudflare Turnstile) ──
// Off while the key is empty. To turn it on: paste the Turnstile *site key* here, publish, and THEN enable
// CAPTCHA in Supabase (Authentication → Attack Protection) with the matching *secret key*. Once Supabase
// requires it, every sign-up and login must send a token, so do it in that order.
// Public key of the "CostaSurf Cams" widget (Cloudflare Turnstile). The widget only accepts the hostnames listed
// in Cloudflare, so it is used on those only: on Netlify deploy previews (other hostnames) it would fail and block
// every login. Add your own domain here too if you connect one (and in the widget's hostname list).
const TURNSTILE_HOSTS = ['costasurfcams.netlify.app', 'localhost'];
const TURNSTILE_SITE_KEY = TURNSTILE_HOSTS.includes(window.location.hostname) ? '0x4AAAAAAFTOv9jfOp9MepC2' : '';
let captchaToken = null, captchaWidget = null;
if (TURNSTILE_SITE_KEY) {
    window.onTurnstileLoad = () => {
        captchaWidget = window.turnstile.render('#captcha', {
            sitekey: TURNSTILE_SITE_KEY,
            language: 'es',
            callback: token => { captchaToken = token; },
            'expired-callback': () => { captchaToken = null; }
        });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    s.async = true;
    document.head.appendChild(s);
}
// A token works once: get a fresh one after every attempt
const resetCaptcha = () => {
    if (captchaWidget !== null && window.turnstile) { window.turnstile.reset(captchaWidget); captchaToken = null; }
};
const authErrorText = (error) => AUTH_ERRORS[error.code] ? AUTH_ERRORS[error.code]
    : error.status === 429 ? AUTH_ERRORS.over_request_rate_limit
    : error.message;

// Date of the current legal.html texts; saved with each new account
const LEGAL_VERSION = '2026-10-17';

const handleAuthAction = async (action) => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const msgEl = document.getElementById('msg');
    
    if (!email || !password) {
        msgEl.innerText = "Por favor, introduce correo y contraseña.";
        msgEl.style.color = '#ff3b30';
        return;
    }

    // Creating an account needs the age + legal checkbox (logging in doesn't)
    if (action === 'register' && !document.getElementById('accept-legal').checked) {
        msgEl.innerText = 'Para crear la cuenta, marca la casilla: debes tener al menos 14 años y aceptar el Aviso legal y la Política de privacidad.';
        msgEl.style.color = '#ff3b30';
        return;
    }
    if (action === 'register' && password.length < MIN_PASSWORD) {
        msgEl.innerText = AUTH_ERRORS.weak_password;
        msgEl.style.color = '#ff3b30';
        return;
    }
    if (TURNSTILE_SITE_KEY && !captchaToken) {
        msgEl.innerText = "Espera un segundo a que se complete la comprobación anti-robots.";
        msgEl.style.color = '#ff3b30';
        return;
    }

    msgEl.innerText = "Cargando...";
    msgEl.style.color = '#333';
    const captchaOption = captchaToken ? { captchaToken } : {};

    try {
        if (!window.supabaseClient) throw new Error("La base de datos (Supabase) no se ha inicializado correctamente.");
        
        if (action === 'login') {
            const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password, options: captchaOption });
            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    // Supabase doesn't say whether the email exists (and we mustn't either), so the reset option is
                    // offered on every failed login
                    msgEl.innerText = "Correo o contraseña incorrectos. Si no tienes cuenta, pulsa Crear Cuenta.";
                    const forgot = document.createElement('button');
                    forgot.type = 'button';
                    forgot.className = 'link-btn';
                    forgot.textContent = '¿Has olvidado tu contraseña? Te enviamos un enlace para cambiarla';
                    forgot.addEventListener('click', sendResetEmail);
                    msgEl.appendChild(forgot);
                } else {
                    msgEl.innerText = authErrorText(error);
                }
                msgEl.style.color = '#ff3b30';
            } else {
                window.location.href = NEXT_PAGE;
            }
        } else if (action === 'register') {
            const { data, error: signUpError } = await window.supabaseClient.auth.signUp({
                email, password,
                // When and which version of the legal texts were accepted (the GDPR asks us to be able to show it)
                options: { emailRedirectTo: `${window.location.origin}/perfil`, data: { legal_accepted_at: new Date().toISOString(), legal_version: LEGAL_VERSION }, ...captchaOption }
            });
            if (signUpError && signUpError.code !== 'user_already_exists') {
                msgEl.innerText = authErrorText(signUpError);
                msgEl.style.color = '#ff3b30';
            } else if (data && data.session) {
                // Email confirmation is off: the account is ready and already logged in
                window.location.href = NEXT_PAGE;
            } else {
                // New account, or an email that was already registered (Supabase then returns a user with no
                // identities, or user_already_exists): same answer either way
                msgEl.innerText = SIGNUP_DONE;
                msgEl.style.color = 'green';
            }
        }
    } catch (err) {
        msgEl.innerText = "Error inesperado: " + err.message;
        msgEl.style.color = '#ff3b30';
        console.error(err);
    }
    resetCaptcha();
};

// ── Forgotten password ──
// Sends Supabase's reset email; its link comes back to /login?reset=1. The answer never says whether the email has an
// account (same text either way), so nobody can use it to find out who is registered.
const RESET_SENT = 'Si existe una cuenta con ese correo, te hemos enviado un enlace para cambiar la contraseña. Revisa tu bandeja de entrada (y la carpeta de spam). El enlace caduca en una hora.';
async function sendResetEmail() {
    const msgEl = document.getElementById('msg');
    const email = document.getElementById('email').value.trim();
    msgEl.style.color = '#ff3b30';
    if (!email) { msgEl.innerText = 'Escribe tu correo arriba y vuelve a pulsar «¿Has olvidado tu contraseña?».'; return; }
    if (TURNSTILE_SITE_KEY && !captchaToken) { msgEl.innerText = 'Espera un segundo a que se complete la comprobación anti-robots.'; return; }
    msgEl.style.color = '#333';
    msgEl.innerText = 'Enviando…';
    const { error } = await window.supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login?reset=1`,
        ...(captchaToken ? { captchaToken } : {})
    });
    resetCaptcha();
    // Only problems that don't depend on the account (too many requests, invalid address, captcha) are shown
    if (error && (error.status === 429 || AUTH_ERRORS[error.code])) {
        msgEl.style.color = '#ff3b30';
        msgEl.innerText = authErrorText(error);
        return;
    }
    msgEl.style.color = 'green';
    msgEl.innerText = RESET_SENT;
}

function showResetForm(session) {
    document.getElementById('login-form').hidden = true;
    document.querySelector('.auth-container h2').textContent = 'Cambiar contraseña';
    const msgEl = document.getElementById('msg');
    // Clean the tokens out of the address bar (they'd stay in the history otherwise)
    history.replaceState(null, '', '/login?reset=1');
    if (!session) {
        msgEl.style.color = '#ff3b30';
        msgEl.innerHTML = '';
        msgEl.append('Este enlace ha caducado o ya se ha usado. ');
        const again = document.createElement('a');
        again.href = '/login';
        again.textContent = 'Pide uno nuevo';
        msgEl.append(again, ' desde «¿Has olvidado tu contraseña?».');
        return;
    }
    document.getElementById('reset-form').hidden = false;
    document.getElementById('new-password').focus();
}

document.getElementById('btn-save-password').onclick = async () => {
    const msgEl = document.getElementById('msg');
    const pass = document.getElementById('new-password').value, pass2 = document.getElementById('new-password-2').value;
    msgEl.style.color = '#ff3b30';
    if (pass.length < MIN_PASSWORD) { msgEl.innerText = AUTH_ERRORS.weak_password; return; }
    if (pass !== pass2) { msgEl.innerText = 'Las dos contraseñas no coinciden.'; return; }
    msgEl.style.color = '#333';
    msgEl.innerText = 'Guardando…';
    const { error } = await window.supabaseClient.auth.updateUser({ password: pass });
    if (error) { msgEl.style.color = '#ff3b30'; msgEl.innerText = authErrorText(error); return; }
    document.getElementById('reset-form').hidden = true;
    msgEl.style.color = 'green';
    msgEl.innerText = '¡Contraseña cambiada! Ya has iniciado sesión. Te llevamos a tu perfil…';
    setTimeout(() => { window.location.href = '/perfil'; }, 1500);
};

document.getElementById('btn-login').onclick = () => handleAuthAction('login');
document.getElementById('btn-register').onclick = () => handleAuthAction('register');
document.getElementById('btn-forgot').onclick = sendResetEmail;
