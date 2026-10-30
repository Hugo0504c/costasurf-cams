// Admin pass for maintenance mode. While the site is in maintenance, the maintenance page (maintenance-admin.js) calls
// this with the visitor's own session token; if they are an admin (shared/roles.js) it sets a signed cookie that the
// edge function (edge-functions/maintenance.ts) accepts, so admins see the whole site at its normal address.
//   cookie cs_admin = <userId>.<expiry epoch s>.<HMAC-SHA256(userId.expiry, MAINT_COOKIE_SECRET), hex>
// The user comes from their session token only, never from the request. The cookie lasts 2 h (re-issued automatically
// while they stay logged in), so taking admin away from someone takes effect within 2 h at most. To cut every pass at
// once, change MAINT_COOKIE_SECRET in Netlify and redeploy.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { isAdmin } = require('../shared/roles');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SECRET = process.env.MAINT_COOKIE_SECRET;
const PASS_SECONDS = 2 * 3600; // the edge function rejects passes longer than 2.5 h
const COOKIE = 'cs_admin';

const json = (statusCode, body, cookie) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) },
    body: JSON.stringify(body)
});
const clear = `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    if (!SECRET) return json(503, { error: 'Not configured' });
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Not logged in' }, clear);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return json(401, { error: 'Not logged in' }, clear);
    if (!isAdmin(data.user)) return json(403, { error: 'Not an admin' }, clear);

    const exp = Math.floor(Date.now() / 1000) + PASS_SECONDS;
    const payload = `${data.user.id}.${exp}`;
    const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
    console.log('Pase de admin (mantenimiento) para', data.user.id);
    return json(200, { ok: true }, `${COOKIE}=${payload}.${sig}; Path=/; Max-Age=${PASS_SECONDS}; Secure; HttpOnly; SameSite=Lax`);
};
