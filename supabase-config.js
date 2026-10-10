// Loaded with `defer` right after the Supabase library, so it runs before DOMContentLoaded.
const SUPABASE_URL = 'https://dcndjvilqdzezlcbsnrh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tUJNb2ZW7Al07IwoUSDk2A_Ii0n-73z';

window.supabaseClient = null;

function updateHeaderAuth(session) {
    const profileBtn = document.getElementById('profile-btn-nav');
    if (!profileBtn) return;

    if (session) {
        profileBtn.href = '/perfil';
        profileBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>Mi Perfil`;
    } else {
        profileBtn.href = '/login';
        profileBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>Iniciar sesión`;
        profileBtn.style.background = '#111';
        profileBtn.style.color = '#fff';
    }
}

try {
    if (window.supabase) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        // Fires once on load (INITIAL_SESSION) and again on every login/logout
        window.supabaseClient.auth.onAuthStateChange((event, session) => updateHeaderAuth(session));
    }
} catch (e) {
    console.error("Supabase init error:", e);
}
