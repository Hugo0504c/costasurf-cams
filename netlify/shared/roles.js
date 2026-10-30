// Who is the owner / an admin. One rule for the Telegram bot (telegram-webhook.js) and the maintenance admin pass
// (maintenance-pass.js):
//  · owner = ADMIN_OWNER_EMAIL (Netlify env var), only with a verified email
//  · admin = the owner, or app_metadata.role "admin" (only the server can write app_metadata), with a verified email
// user_metadata is editable by the user from the browser, so it is never trusted for this.
const OWNER_EMAIL = (process.env.ADMIN_OWNER_EMAIL || '').trim().toLowerCase();
const isOwner = u => !!(u && OWNER_EMAIL && u.email_confirmed_at && String(u.email || '').toLowerCase() === OWNER_EMAIL);
const isAdmin = u => !!(u && u.email_confirmed_at && (isOwner(u) || (u.app_metadata || {}).role === 'admin'));

module.exports = { isOwner, isAdmin };
