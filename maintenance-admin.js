// Runs on the maintenance page (edge-functions/maintenance.ts). If the visitor is logged in on this browser, it asks
// the server for an admin pass (netlify/functions/maintenance-pass.js): admins get a cookie and the page reloads into
// the real site; anyone else just keeps seeing the maintenance page. At most one try a minute, so it can never loop.
(async () => {
    try {
        if (!window.supabaseClient) return;
        const last = +sessionStorage.getItem('maintPassAt') || 0;
        if (Date.now() - last < 60000) return;
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (!session) return;
        sessionStorage.setItem('maintPassAt', String(Date.now()));
        const res = await fetch('/.netlify/functions/maintenance-pass', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + session.access_token }
        });
        if (res.ok) location.reload();
    } catch (e) { /* the maintenance page stays as it is */ }
})();
