// Maintenance mode state, kept in Netlify Blobs (store "site", key "maintenance"). Written by the Telegram bot's admin
// panel (shared/telegram-bot.js), read by shared/maintenance-state.js, which the edge function
// edge-functions/maintenance.ts asks before serving each page.
//   { on: true, since: ISO, until: ISO | null, by: userId, bypass: random token, pages: null | [section…] }
//   until null = until switched off; pages null = the whole site, else only those SECTIONS (kept while off too, so the
//   owner can choose them before switching it on). /login and /legal are never blocked.
// The store is site-wide: production and deploy previews share it.
// Only used from modern (v2: `export default`) functions: they get the Blobs context automatically, including strong reads.
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const KEY = 'maintenance';
// Strong consistency: a read right after a write sees it (eventual reads could return the old state for up to a
// minute, so the bot showed "desactivado" right after switching it on, and a later change could switch it back off).
const store = () => getStore({ name: 'site', consistency: 'strong' });

async function readMaintenance() {
    return (await store().get(KEY, { type: 'json' })) || { on: false, until: null };
}
async function writeMaintenance(state) {
    await store().setJSON(KEY, state);
}
// On, and its end date (if any) hasn't passed yet: it switches itself off at `until`
const isActive = s => !!(s && s.on && (!s.until || Date.parse(s.until) > Date.now()));
// The owner's "see the site anyway" link carries `bypass`; only its hash is ever made public (maintenance-state.js)
const newBypassToken = () => crypto.randomBytes(24).toString('hex');
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

// Parts of the site that can be put in maintenance on their own (the edge function maps each URL to one of these)
const SECTIONS = {
    home: 'Portada (webcams y forecast)',
    spots: 'Fichas de los spots',
    herramientas: 'Herramientas',
    perfil: 'Perfil',
    info: 'Info'
};
const cleanPages = pages => (Array.isArray(pages) ? pages.filter(p => SECTIONS[p]) : null);

module.exports = { readMaintenance, writeMaintenance, isActive, newBypassToken, sha256, SECTIONS, cleanPages };
