// Password for the bot's admin panel. /admin (or the panel's admin button) always asks for it; a right answer opens a
// session for that user + chat that ends after SESSION_IDLE_MS without using the panel, or with "Salir". Every admin
// button checks the session on the server, so an old panel message is useless without the password.
//   env ADMIN_PANEL_PASSWORD_HASH = scrypt$<salt hex>$<hash hex>   (only the hash: the password is never stored)
//   Netlify Blobs store "site", key admin-session/<userId> = { chatId, until, fails, lockedUntil }
// MAX_FAILS wrong answers in a row lock the panel for LOCK_MS (against guessing).
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const SESSION_IDLE_MS = 15 * 60000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60000;
const store = () => getStore({ name: 'site', consistency: 'strong' });
const key = userId => `admin-session/${userId}`;

const read = async userId => (await store().get(key(userId), { type: 'json' })) || {};
const write = (userId, s) => store().setJSON(key(userId), s);

function passwordMatches(password) {
    const [scheme, salt, hash] = String(process.env.ADMIN_PANEL_PASSWORD_HASH || '').split('$');
    if (scheme !== 'scrypt' || !salt || !hash) return false; // not configured: nobody gets in
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
}

// Valid session for this user in this chat? Using the panel keeps it alive.
async function hasSession(userId, chatId) {
    const s = await read(userId);
    if (s.chatId !== chatId || !s.until || s.until < Date.now()) return false;
    await write(userId, { ...s, until: Date.now() + SESSION_IDLE_MS });
    return true;
}

// Asking for the password again (new /admin) closes the current session
async function endSession(userId) {
    const s = await read(userId);
    await write(userId, { ...s, chatId: null, until: 0 });
}

// → { ok: true } | { ok: false, left: tries left } | { ok: false, lockedFor: ms }
async function tryPassword(userId, chatId, password) {
    const s = await read(userId);
    if (s.lockedUntil && s.lockedUntil > Date.now()) return { ok: false, lockedFor: s.lockedUntil - Date.now() };
    if (passwordMatches(password)) {
        await write(userId, { chatId, until: Date.now() + SESSION_IDLE_MS, fails: 0, lockedUntil: 0 });
        return { ok: true };
    }
    const fails = (s.lockedUntil && s.lockedUntil <= Date.now() ? 0 : s.fails || 0) + 1;
    const locked = fails >= MAX_FAILS;
    await write(userId, { chatId: null, until: 0, fails: locked ? 0 : fails, lockedUntil: locked ? Date.now() + LOCK_MS : 0 });
    return locked ? { ok: false, lockedFor: LOCK_MS } : { ok: false, left: MAX_FAILS - fails };
}

const hashPassword = password => {
    const salt = crypto.randomBytes(16);
    return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 32).toString('hex')}`;
};

module.exports = { hasSession, endSession, tryPassword, hashPassword, SESSION_IDLE_MS };
