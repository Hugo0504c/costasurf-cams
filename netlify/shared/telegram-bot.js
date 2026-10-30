// Telegram sends every message written to the CostaSurf Cams bot here (through functions/telegram-webhook.js, a
// modern Netlify function so maintenance mode can read its state with strong consistency). Telegram adds our secret
// in a header, so nobody else can call this. One-time setup:
//   1. @BotFather → /newbot → gives the bot token and username
//   2. Netlify env vars: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET (any long random string)
//   3. https://api.telegram.org/bot<TOKEN>/setWebhook?url=<SITE>/.netlify/functions/telegram-webhook&secret_token=<SECRET>
//      &allowed_updates=["message"]   (and setMyCommands with BOT_COMMANDS below, for the "/" menu)
//
// Commands:
//   /start <code>  links the chat to the account that asked for that code on the website (telegram-link.js)
//   /hoy           where to surf today: every spot ranked
//   /favoritos     the next days at the linked account's favourite spots
//   /prevision     list of spots; /prevision <spot> or the spot's own command (/nerja…) → its next 3 days
//   /spots, /ayuda, /stop (unlinks the chat, same as "Desconectar" on the website)
//   /borrar        deletes the conversation (Telegram only lets bots delete messages younger than 48 h)
//   /alertas       the linked account's alert settings, changed with buttons
//   /fav [spot]    favourite spots: buttons to add/remove, or toggle one directly
//   /cuenta        the account (name, photo, Telegram, delete), same rules as the profile page (perfil.js);
//                  /nombre <name> and /foto <https link> change them directly, or reply to the bot's question
//   /admin         admin panel (users, metrics, granting admin). Hidden: for anyone else it answers like an unknown
//                  command. See the "Admin" section below for the security rules.
// Buttons arrive as callback queries (setWebhook allowed_updates must include "callback_query"). Every change is saved
// in the same place the website uses (user_metadata alert_* fields, the favorites table), so the web shows it too.
const { createClient } = require('@supabase/supabase-js');
const { SPOTS, WIND, getForecast, analyzeDay, alertFilters, formatDate, windowText, escapeHtml } = require('../shared/forecast');
const { readMaintenance, writeMaintenance, isActive, newBypassToken, SECTIONS, cleanPages } = require('../shared/maintenance');
const adminSession = require('../shared/admin-session');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const SITE_URL = process.env.SITE_URL || process.env.URL || 'https://costasurfcams.netlify.app';
const CODE_MAX_AGE_MS = 30 * 60 * 1000;
const FORECAST_DAYS_SHOWN = 3;

// The "/" menu in Telegram (sent with setMyCommands)
// Everyone sees /panel; admins also /admin, set for their own chat only (setChatCommands). The old commands (/hoy,
// /nerja…) still work if typed, but everything is reachable from the panel's buttons.
const BOT_COMMANDS = [{ command: 'panel', description: 'Abrir el panel: previsión, favoritos, alertas y cuenta' }];
const ADMIN_COMMANDS = [...BOT_COMMANDS, { command: 'admin', description: 'Panel de administración' }];
const BACK_ROW = [{ text: '⬅ Panel', callback_data: 'p:home' }];
// One command per spot. Telegram commands only allow a-z, 0-9 and _; malapesquera is an old internal id.
const SPOT_COMMANDS = {
    misericordia: 'misericordia', fuengirola: 'fuengirola', malapesquera: 'fuentedelasalud', malagueta: 'malagueta',
    bajondillo: 'bajondillo', nerja: 'nerja', alamos: 'alamos', cabopino: 'cabopino', benajarafe: 'benajarafe',
    torredelmar: 'torredelmar', elpalmar: 'elpalmar', puntadelrio: 'puntadelrio'
};
const SPOT_BY_COMMAND = Object.fromEntries(Object.entries(SPOT_COMMANDS).map(([id, cmd]) => [cmd, id]));

const ok = { statusCode: 200, body: 'ok' }; // Telegram retries anything that isn't 200

const tg = (method, body) => fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}).then(r => r.json()).catch(err => { console.error('telegram', method, err); return { ok: false }; });

// text, or { text, keyboard } for a message with buttons
async function reply(chatId, content) {
    const { text, keyboard } = typeof content === 'string' ? { text: content } : content;
    await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
}

// Every user (listUsers is paginated); fine at this site's size, the daily alerts do the same
async function findUser(match) {
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const found = data.users.find(match);
        if (found || data.users.length < 1000) return found || null;
    }
}

// ── Forecast texts ──
const ANY_WAVE = alertFilters({ alert_size: 0.01 }); // analyzeDay with no real limit: every day has a best window
const madridDate = (plusDays = 0) => new Date(Date.now() + plusDays * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
function dayLabel(date) {
    if (date === madridDate(0)) return 'Hoy';
    if (date === madridDate(1)) return 'Mañana';
    return capitalize(formatDate(date).split(' de ')[0]); // "Lunes 20"
}
// Same size colours as the website (gray, yellow, orange, blue)
function quality(maxWave) {
    if (maxWave < 0.4) return '⚪ Plano';
    if (maxWave < 0.8) return '🟡 Pequeño';
    if (maxWave < 1.2) return '🟠 Surfeable';
    return '🔵 Bueno';
}
const peakEnergy = (hours, date) => Math.max(0, ...hours.filter(h => h.date === date && h.hour >= 7 && h.hour < 20).map(h => h.energy || 0));

// "<b>Hoy</b> 🟠 Surfeable · 0.6–0.9 m · 6 s · 48 kJ · viento terral (off-shore), 9 km/h · mejor 08:00 a 11:00"
function dayLine(hours, date) {
    const r = analyzeDay(hours, date, ANY_WAVE);
    if (!r) return `<b>${dayLabel(date)}</b>: sin datos`;
    return `<b>${dayLabel(date)}</b> ${quality(r.maxWave)} · ${r.minWave.toFixed(1)}–${r.maxWave.toFixed(1)} m · ` +
        `${r.period ? Math.round(r.period) + ' s' : '—'} · ${Math.round(peakEnergy(hours, date))} kJ · ` +
        `${WIND[r.status].label}, ${Math.round(r.windSpeed)} km/h · mejor ${windowText(r)}`;
}

async function spotForecast(spotId) {
    const hours = await getForecast(spotId);
    if (!hours) return 'No he podido descargar la previsión ahora mismo. Inténtalo en unos minutos.';
    const days = Array.from({ length: FORECAST_DAYS_SHOWN }, (_, i) => madridDate(i));
    return `📍 <b>${escapeHtml(SPOTS[spotId].name)}</b>\n\n${days.map(d => dayLine(hours, d)).join('\n\n')}\n\n` +
        `<a href="${SITE_URL}/${spotId}">Ver el spot en la web</a>`;
}

async function todayRanking() {
    const today = madridDate(0);
    const ids = Object.keys(SPOTS);
    const all = await Promise.all(ids.map(getForecast));
    const rows = ids.map((id, i) => ({ id, r: all[i] && analyzeDay(all[i], today, ANY_WAVE) })).filter(x => x.r)
        .sort((a, b) => b.r.score - a.r.score);
    if (!rows.length) return 'No he podido descargar la previsión ahora mismo. Inténtalo en unos minutos.';
    const lines = rows.map((x, i) => `${i + 1}. <b>${escapeHtml(SPOTS[x.id].name)}</b> — ${x.r.maxWave.toFixed(1)} m · ` +
        `${WIND[x.r.status].label} · mejor ${windowText(x.r)}`);
    const flat = rows.every(x => x.r.maxWave < 0.4);
    return `🌊 <b>Dónde surfear hoy</b> (${formatDate(today)})\n\n${lines.join('\n')}\n\n` +
        (flat ? 'Hoy está prácticamente plano en toda la costa. ' : '') + 'Toca «Previsión de un spot» para ver los próximos días de cada uno.';
}

async function favouritesForecast(chatId) {
    const user = await findUser(u => (u.app_metadata || {}).telegram_chat_id === chatId);
    if (!user) return `Para ver tus favoritos, conecta tu cuenta: entra en ${SITE_URL}/herramientas#telegram y pulsa <b>Conectar Telegram</b>.`;
    const { data, error } = await supabase.from('favorites').select('spot_id').eq('user_id', user.id);
    if (error) throw error;
    const ids = (data || []).map(f => f.spot_id).filter(id => SPOTS[id]);
    if (!ids.length) return `Todavía no tienes spots favoritos. Añádelos desde la web (${SITE_URL}) o desde /panel → ✏️ Editar favoritos.`;
    const all = await Promise.all(ids.map(getForecast));
    const days = [madridDate(0), madridDate(1)];
    const blocks = ids.map((id, i) => `📍 <b>${escapeHtml(SPOTS[id].name)}</b>\n` +
        (all[i] ? days.map(d => dayLine(all[i], d)).join('\n') : 'Sin datos ahora mismo'));
    return `⭐ <b>Tus favoritos: hoy y mañana</b>\n\n${blocks.join('\n\n')}`;
}

const spotList = () => Object.entries(SPOT_COMMANDS).map(([id, cmd]) => `/${cmd} — ${escapeHtml(SPOTS[id].name)}`).join('\n');
// Old command list (only shown for /ayuda). The panel's own help is panelHelp().
const helpText = () => `Todo está en el panel: escribe /panel. Si prefieres escribir, estos comandos también funcionan:\n\n` +
    `/hoy — dónde surfear hoy, todos los spots ordenados\n` +
    `/favoritos — hoy y mañana en tus spots favoritos (con la cuenta conectada)\n` +
    `/prevision — elige un spot y te mando sus próximos 3 días\n` +
    `/spots — los spots y su comando directo (por ejemplo /nerja)\n` +
    `/alertas — ver y cambiar tus alertas con botones (con la cuenta conectada)\n` +
    `/fav — añadir o quitar spots favoritos (también /fav nerja)\n` +
    `/cuenta — tu nombre, foto de perfil, Telegram y borrar la cuenta\n` +
    `/stop — dejar de recibir las alertas de olas\n` +
    `/borrar — borrar esta conversación (los mensajes de las últimas 48 h)\n` +
    `/ayuda — este mensaje\n\n` +
    `Las <b>alertas</b> (cada mañana a las 07:30, solo si hay olas) se activan desde la web: ${SITE_URL}/herramientas#alertas`;

// ── Settings from the bot: same fields and same limits as the website's alerts form (herramientas.html) ──
const ALERT_DAYS = [1, 2, 3, 5];
const SIZE_MIN = 0.2, SIZE_MAX = 3.0;
const NOT_LINKED = `Primero conecta tu cuenta: entra en ${SITE_URL}/herramientas#telegram y pulsa <b>Conectar Telegram</b>.`;
const linkedUser = chatId => findUser(u => (u.app_metadata || {}).telegram_chat_id === chatId);
const check = on => (on ? '✅ ' : '');

function alertsView(meta) {
    const on = meta.alerts_enabled === true;
    const days = ALERT_DAYS.includes(meta.alert_days) ? meta.alert_days : 1;
    const size = typeof meta.alert_size === 'number' ? meta.alert_size : 1.0;
    const email = meta.alert_email !== false, telegram = meta.alert_telegram === true;
    const where = [email && 'correo', telegram && 'Telegram'].filter(Boolean).join(' y ') || 'ningún sitio';
    const text = `🔔 <b>Tus alertas de olas</b>\n\n` +
        `Estado: <b>${on ? 'activadas' : 'desactivadas'}</b>\n` +
        `Antelación: <b>${days} ${days === 1 ? 'día' : 'días'}</b>\n` +
        `Tamaño mínimo: <b>${size.toFixed(1)} m</b>\n` +
        `Las recibes por: <b>${where}</b>\n` +
        (meta.alerts_advanced ? `Filtros avanzados: <b>activados</b> (se cambian en la web)\n` : '') +
        `\nToca los botones para cambiarlas. Se guardan en tu cuenta y también se ven en la web.`;
    const keyboard = [
        [{ text: on ? '🔕 Desactivar alertas' : '🔔 Activar alertas', callback_data: 'a:on' }],
        ALERT_DAYS.map(d => ({ text: `${d === days ? '✅ ' : ''}${d} ${d === 1 ? 'día' : 'días'}`, callback_data: `a:days:${d}` })),
        [{ text: '− 0.1 m', callback_data: 'a:size:-' }, { text: `Tamaño ${size.toFixed(1)} m`, callback_data: 'a:noop' }, { text: '+ 0.1 m', callback_data: 'a:size:+' }],
        [{ text: `${check(email)}Correo`, callback_data: 'a:email' }, { text: `${check(telegram)}Telegram`, callback_data: 'a:tg' }],
        [{ text: 'Abrir alertas en la web', url: `${SITE_URL}/herramientas#alertas` }],
        BACK_ROW
    ];
    return { text, keyboard };
}

// Applies a button press to the metadata. Returns { meta } or { error } (shown as a pop-up in Telegram).
function applyAlertChange(meta, action) {
    const m = { ...meta };
    const [, what, value] = action.split(':');
    if (what === 'on') m.alerts_enabled = m.alerts_enabled !== true;
    else if (what === 'days' && ALERT_DAYS.includes(+value)) m.alert_days = +value;
    else if (what === 'size') {
        const cur = typeof m.alert_size === 'number' ? m.alert_size : 1.0;
        m.alert_size = Math.round(Math.min(SIZE_MAX, Math.max(SIZE_MIN, cur + (value === '+' ? 0.1 : -0.1))) * 10) / 10;
    } else if (what === 'email' || what === 'tg') {
        const email = m.alert_email !== false, telegram = m.alert_telegram === true;
        const next = what === 'email' ? { email: !email, telegram } : { email, telegram: !telegram };
        if (!next.email && !next.telegram) return { error: 'Necesitas al menos un sitio donde recibirlas. Para no recibir nada, desactiva las alertas.' };
        m.alert_email = next.email;
        m.alert_telegram = next.telegram;
    } else return { meta }; // a:noop
    return { meta: m };
}

async function getFavs(userId) {
    const { data, error } = await supabase.from('favorites').select('spot_id').eq('user_id', userId);
    if (error) throw error;
    return (data || []).map(f => f.spot_id);
}
// Adds the spot if it isn't a favourite, removes it if it is (same table the website reads and writes)
async function toggleFav(userId, spotId) {
    const favs = await getFavs(userId);
    const { error } = favs.includes(spotId)
        ? await supabase.from('favorites').delete().eq('user_id', userId).eq('spot_id', spotId)
        : await supabase.from('favorites').insert([{ user_id: userId, spot_id: spotId }]);
    if (error) throw error;
    return !favs.includes(spotId);
}
function favView(favs) {
    const text = `⭐ <b>Tus spots favoritos</b> (${favs.length})\n\nToca un spot para añadirlo o quitarlo. ` +
        `Se guardan en tu cuenta: los verás en la web, en /favoritos y en tus alertas.`;
    const keyboard = Object.keys(SPOTS).map(id => [{ text: `${favs.includes(id) ? '⭐' : '☆'} ${SPOTS[id].name}`, callback_data: `f:${id}` }]);
    keyboard.push([{ text: 'Ver previsión de mis favoritos', callback_data: 'f:show' }], BACK_ROW);
    return { text, keyboard };
}

async function favCommand(chatId, arg) {
    const user = await linkedUser(chatId);
    if (!user) return NOT_LINKED;
    if (!arg) return favView(await getFavs(user.id));
    const spot = findSpot(arg);
    if (!spot) return `No conozco ese spot. Escribe /fav para ver la lista.`;
    const added = await toggleFav(user.id, spot);
    return `${added ? '⭐ Añadido a' : 'Quitado de'} tus favoritos: <b>${escapeHtml(SPOTS[spot].name)}</b>.\n\nEscribe /fav para ver todos.`;
}

// ── Account: same fields and rules as the profile page (perfil.js) and delete-account.js ──
const MAX_NAME = 40, MAX_URL = 500;
// The bot's questions; a reply to one of them (Telegram "force reply") is the answer. Matched by their first line.
const ASK_NAME = '✏️ Escribe tu nuevo nombre';
const ASK_PHOTO = '🖼️ Pega el enlace de tu foto de perfil';

// Only plain https image links (as on the website)
function safeImageUrl(value) {
    if (!value || value.length > MAX_URL) return '';
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch (e) { return ''; }
}
const cleanName = s => String(s).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);

async function accountView(user) {
    const meta = user.user_metadata || {}, app = user.app_metadata || {};
    const favCount = (await getFavs(user.id)).length;
    const text = `👤 <b>Tu cuenta</b>\n\n` +
        `Nombre: <b>${escapeHtml(meta.full_name || 'sin nombre')}</b>\n` +
        `Email: <b>${escapeHtml(user.email || '—')}</b>\n` +
        `Foto de perfil: <b>${safeImageUrl(meta.avatar_url) ? 'sí' : 'no'}</b>\n` +
        `Telegram: <b>conectado${app.telegram_name ? ' (' + escapeHtml(app.telegram_name) + ')' : ''}</b>\n` +
        `Favoritos: <b>${favCount}</b> · Alertas: <b>${meta.alerts_enabled === true ? 'activadas' : 'desactivadas'}</b>\n\n` +
        `Los cambios se guardan en tu cuenta y se ven también en la web. El email no se puede cambiar.`;
    const keyboard = [
        [{ text: '✏️ Cambiar nombre', callback_data: 'c:name' }, { text: '🖼️ Cambiar foto', callback_data: 'c:photo' }],
        ...(safeImageUrl(meta.avatar_url) ? [[{ text: '🗑️ Quitar foto de perfil', callback_data: 'c:nophoto' }]] : []),
        [{ text: '🔔 Alertas', callback_data: 'c:alerts' }, { text: '⭐ Favoritos', callback_data: 'c:favs' }],
        [{ text: '🔌 Desconectar Telegram', callback_data: 'c:unlink' }],
        [{ text: '❌ Borrar mi cuenta', callback_data: 'c:delete' }],
        [{ text: 'Abrir mi perfil en la web', url: `${SITE_URL}/perfil` }],
        BACK_ROW
    ];
    return { text, keyboard };
}

async function saveProfile(user, changes) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { user_metadata: { ...user.user_metadata, ...changes } });
    if (error) throw error;
}
async function setName(user, raw) {
    const name = cleanName(raw);
    if (!name) return 'El nombre no puede estar vacío. Vuelve a intentarlo desde /panel → Cuenta.';
    await saveProfile(user, { full_name: name });
    const view = await accountView({ ...user, user_metadata: { ...user.user_metadata, full_name: name } });
    return { text: `✅ Nombre cambiado a <b>${escapeHtml(name)}</b>. Ya se ve en la web.\n\n${view.text}`, keyboard: view.keyboard };
}
async function setPhoto(user, raw) {
    const url = safeImageUrl(String(raw).trim());
    if (!url) return 'La foto tiene que ser un enlace que empiece por <b>https://</b> (por ejemplo, el de una imagen subida a internet). Vuelve a intentarlo desde /panel → Cuenta → Cambiar foto.';
    await saveProfile(user, { avatar_url: url });
    const view = await accountView({ ...user, user_metadata: { ...user.user_metadata, avatar_url: url } });
    return { text: `✅ Foto de perfil cambiada. Ya se ve en tu perfil de la web.\n\n${view.text}`, keyboard: view.keyboard };
}
async function deleteAccount(user) {
    const { error: favError } = await supabase.from('favorites').delete().eq('user_id', user.id);
    if (favError) throw favError;
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw error;
    console.log('Cuenta borrada desde Telegram:', user.id);
}

// ── Admin ──
// Security rules:
//  · Who is writing: Telegram signs every call with our webhook secret (checked in the handler), and a chat is only
//    linked to an account through a one-use code made from that account's own web session (telegram-link.js).
//  · The admin flag lives in app_metadata.role, which only the server (service role) can write. user_metadata is
//    editable by the user from the browser, so it is never trusted for this.
//  · The owner is ADMIN_OWNER_EMAIL (Netlify env var, not in the code), and only with a verified email.
//  · Only the owner can give or take admin, with a confirmation step; nobody can touch the owner. Every press is
//    re-checked here against the server's current data (a modified Telegram client can send any button data).
//  · Private chats only, and the sender must be the chat's own user.
// Owner / admin rule: shared/roles.js (same for the maintenance admin pass)
const USERS_PER_PAGE = 8;
const { isOwner, isAdmin } = require('../shared/roles');
const privateChat = (chat, from) => !!(chat && from && chat.type === 'private' && chat.id === from.id);

async function allUsers() {
    const users = [];
    for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        users.push(...data.users);
        if (data.users.length < 1000) return users;
    }
}
const shortDate = iso => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Europe/Madrid' }) : '—');
const userLabel = u => `${isOwner(u) ? '👑 ' : isAdmin(u) ? '🛡️ ' : ''}${u.email || u.id}`;

async function adminHome() {
    const [users, favRes, maint] = await Promise.all([allUsers(), supabase.from('favorites').select('spot_id, user_id'),
        readMaintenance().catch(() => ({ on: false }))]);
    if (favRes.error) throw favRes.error;
    const favs = favRes.data || [];
    const now = Date.now(), DAY = 86400000;
    const since = (iso, days) => iso && now - new Date(iso).getTime() < days * DAY;
    const meta = u => u.user_metadata || {};
    const alertsOn = users.filter(u => meta(u).alerts_enabled === true);
    const count = (list, fn) => list.filter(fn).length;
    const bySpot = {};
    favs.forEach(f => { bySpot[f.spot_id] = (bySpot[f.spot_id] || 0) + 1; });
    const top = Object.entries(bySpot).filter(([id]) => SPOTS[id]).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, n]) => `   ${escapeHtml(SPOTS[id].name)}: ${n}`).join('\n') || '   —';
    const text = `🛠️ <b>Panel de administración</b>\n\n` +
        (isActive(maint) ? `🚧 <b>La web está en MODO MANTENIMIENTO</b>${maint.until ? ' hasta el ' + madridText(maint.until) : ''}\n\n` : '') +
        `<b>Usuarios</b>\n` +
        `   Total: ${users.length} (email verificado: ${count(users, u => u.email_confirmed_at)})\n` +
        `   Nuevos: ${count(users, u => since(u.created_at, 7))} en 7 días · ${count(users, u => since(u.created_at, 30))} en 30 días\n` +
        `   Activos (entraron) en 7 días: ${count(users, u => since(u.last_sign_in_at, 7))}\n` +
        `   Admins: ${count(users, isAdmin)}\n\n` +
        `<b>Alertas</b>\n` +
        `   Activadas: ${alertsOn.length} de ${users.length}\n` +
        `   Por correo: ${count(alertsOn, u => meta(u).alert_email !== false)} · por Telegram: ${count(alertsOn, u => meta(u).alert_telegram === true && (u.app_metadata || {}).telegram_chat_id)}\n` +
        `   Con filtros avanzados: ${count(alertsOn, u => meta(u).alerts_advanced === true)}\n` +
        `   Telegram conectado: ${count(users, u => (u.app_metadata || {}).telegram_chat_id)}\n\n` +
        `<b>Favoritos</b>\n` +
        `   Total: ${favs.length} · usuarios con alguno: ${new Set(favs.map(f => f.user_id)).size}\n` +
        `   Spots más guardados:\n${top}\n\n` +
        `Actualizado: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}`;
    const keyboard = [
        [{ text: '👥 Usuarios', callback_data: 'adm:u:0' }, { text: '🛡️ Admins', callback_data: 'adm:a' }],
        [{ text: `🚧 Mantenimiento: ${isActive(maint) ? 'ACTIVO' : 'desactivado'}`, callback_data: 'adm:m:view' }],
        [{ text: '🔄 Actualizar', callback_data: 'adm:home' }, { text: '🔒 Salir', callback_data: 'adm:out' }],
        [{ text: '⬅ Panel principal', callback_data: 'p:home' }]
    ];
    return { text, keyboard };
}

async function adminUsers(page) {
    const users = (await allUsers()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const pages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE));
    const p = Math.min(Math.max(0, page), pages - 1);
    const slice = users.slice(p * USERS_PER_PAGE, (p + 1) * USERS_PER_PAGE);
    const keyboard = slice.map(u => [{ text: userLabel(u).slice(0, 60), callback_data: `adm:v:${u.id}` }]);
    const nav = [];
    if (p > 0) nav.push({ text: '◀ Anteriores', callback_data: `adm:u:${p - 1}` });
    if (p < pages - 1) nav.push({ text: 'Siguientes ▶', callback_data: `adm:u:${p + 1}` });
    if (nav.length) keyboard.push(nav);
    keyboard.push([{ text: '⬅ Panel', callback_data: 'adm:home' }]);
    return { text: `👥 <b>Usuarios</b> (${users.length}) · página ${p + 1} de ${pages}\n\nDel más nuevo al más antiguo. 👑 dueño · 🛡️ admin. Toca uno para ver su ficha.`, keyboard };
}

async function adminAdmins() {
    const admins = (await allUsers()).filter(isAdmin);
    return {
        text: `🛡️ <b>Admins</b> (${admins.length})\n\n${admins.map(u => `${userLabel(u)}`).map(escapeHtml).join('\n')}\n\n` +
            `Para dar o quitar admin, abre la ficha del usuario en 👥 Usuarios. Solo el dueño puede hacerlo.`,
        keyboard: [...admins.map(u => [{ text: userLabel(u).slice(0, 60), callback_data: `adm:v:${u.id}` }]), [{ text: '⬅ Panel', callback_data: 'adm:home' }]]
    };
}

async function adminUserView(viewer, targetId) {
    const users = await allUsers();
    const u = users.find(x => x.id === targetId);
    if (!u) return { text: 'Ese usuario ya no existe.', keyboard: [[{ text: '⬅ Usuarios', callback_data: 'adm:u:0' }]] };
    const meta = u.user_metadata || {}, app = u.app_metadata || {};
    const { data: favRows } = await supabase.from('favorites').select('spot_id').eq('user_id', u.id);
    const favNames = (favRows || []).map(f => SPOTS[f.spot_id] && SPOTS[f.spot_id].name).filter(Boolean);
    const text = `👤 <b>${escapeHtml(u.email || u.id)}</b>\n\n` +
        `Rol: <b>${isOwner(u) ? 'dueño' : isAdmin(u) ? 'admin' : 'usuario'}</b>\n` +
        `Nombre: ${escapeHtml(meta.full_name || '—')}\n` +
        `Alta: ${shortDate(u.created_at)} · último acceso: ${shortDate(u.last_sign_in_at)}\n` +
        `Email verificado: ${u.email_confirmed_at ? 'sí' : 'no'}\n` +
        `Alertas: ${meta.alerts_enabled === true ? 'activadas' : 'no'}${meta.alerts_enabled === true ? ` (${[meta.alert_email !== false && 'correo', meta.alert_telegram === true && 'Telegram'].filter(Boolean).join(' y ')}, ${meta.alert_size || 1} m+, ${meta.alert_days || 1} d)` : ''}\n` +
        `Telegram: ${app.telegram_chat_id ? 'conectado' + (app.telegram_name ? ' (' + escapeHtml(app.telegram_name) + ')' : '') : 'no'}\n` +
        `Favoritos (${favNames.length}): ${favNames.map(escapeHtml).join(', ') || '—'}`;
    const keyboard = [];
    if (isOwner(viewer) && !isOwner(u)) {
        if (app.role === 'admin') keyboard.push([{ text: '➖ Quitar admin', callback_data: `adm:r:${u.id}` }]);
        else if (u.email_confirmed_at) keyboard.push([{ text: '➕ Dar admin', callback_data: `adm:g:${u.id}` }]);
        keyboard.push([{ text: '🗑️ Borrar usuario', callback_data: `adm:d:${u.id}` }]);
    }
    keyboard.push([{ text: '⬅ Usuarios', callback_data: 'adm:u:0' }, { text: 'Panel', callback_data: 'adm:home' }]);
    return { text, keyboard };
}

// Gives (grant) or takes (revoke) admin. Re-checked here, whatever the button said.
async function setAdminRole(viewer, targetId, grant) {
    if (!isOwner(viewer)) return { error: 'Solo el dueño puede dar o quitar admin.' };
    const target = (await allUsers()).find(x => x.id === targetId);
    if (!target) return { error: 'Ese usuario ya no existe.' };
    if (isOwner(target)) return { error: 'El dueño no se puede modificar.' };
    if (grant && !target.email_confirmed_at) return { error: 'Solo se puede dar admin a cuentas con el email verificado.' };
    const app = { ...target.app_metadata };
    if (grant) app.role = 'admin'; else delete app.role;
    const { error } = await supabase.auth.admin.updateUserById(target.id, { app_metadata: app });
    if (error) throw error;
    console.log(`ADMIN: ${viewer.id} ${grant ? 'dio' : 'quitó'} admin a ${target.id}`);
    if (app.telegram_chat_id) {
        await setChatCommands(app.telegram_chat_id, grant); // /admin appears or disappears in their "/" menu
        await reply(app.telegram_chat_id, grant
            ? '🛡️ Ahora eres <b>admin</b> de CostaSurf Cams. Escribe /admin para abrir el panel.'
            : 'Ya no eres admin de CostaSurf Cams.');
    }
    return { target };
}

// Deletes another user's account (same as their own "Borrar mi cuenta": favourites + auth user). Owner only, never the
// owner, never yourself; re-checked here whatever the button said. The user is told on Telegram if they had it linked.
async function deleteUserByAdmin(viewer, targetId) {
    if (!isOwner(viewer)) return { error: 'Solo el dueño puede borrar usuarios.' };
    const target = (await allUsers()).find(x => x.id === targetId);
    if (!target) return { error: 'Ese usuario ya no existe.' };
    if (isOwner(target) || target.id === viewer.id) return { error: 'Esta cuenta no se puede borrar desde el panel.' };
    const chat = (target.app_metadata || {}).telegram_chat_id;
    if (chat) {
        await reply(chat, 'Un administrador ha borrado tu cuenta de CostaSurf Cams. Si crees que es un error, escribe a axionlabscreate@gmail.com. Para volver a usar el bot necesitas una cuenta conectada.');
        await setChatCommands(chat, false);
    }
    await deleteAccount(target);
    console.log(`ADMIN: ${viewer.id} borró la cuenta ${target.id}`);
    return { target };
}

// ── Admin panel password (shared/admin-session.js) ──
const ASK_PASS = '🔐 Escribe la contraseña del panel de admin';
const askPassword = chatId => tg('sendMessage', { chat_id: chatId, text: `${ASK_PASS}.\nTu mensaje se borrará del chat al momento.`,
    reply_markup: { force_reply: true, input_field_placeholder: 'Contraseña' } });
const lockedView = () => ({
    text: '🔒 <b>Panel de admin cerrado</b>\n\nPara entrar otra vez escribe /admin y la contraseña.',
    keyboard: [[{ text: '🔐 Entrar', callback_data: 'adm:login' }], [{ text: '⬅ Panel principal', callback_data: 'p:home' }]]
});
const minutes = ms => Math.max(1, Math.ceil(ms / 60000));

// ── Maintenance mode (owner only) ──
// The state lives in Netlify Blobs (shared/maintenance.js); edge-functions/maintenance.ts shows the maintenance page
// to everyone while it is on. It switches itself off at `until`. The owner gets a private link to see the real site.
const ASK_MAINT = '📅 Escribe hasta cuándo estará la web en mantenimiento';
let requestOrigin = SITE_URL; // the site this bot call came to (production or a preview), for the owner's private link
const madridText = iso => new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// "18/10/2026 20:00", "18/10 20:00" or "18/10/2026" (09:00), in Spain's time → ISO, or null if not valid / not future
function parseMadridDate(text) {
    const m = String(text).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?(?:\s+(\d{1,2})[:.h](\d{2}))?$/);
    if (!m) return null;
    const now = new Date();
    let year = m[3] ? +m[3] : now.getUTCFullYear();
    if (year < 100) year += 2000;
    const [day, month, hour, minute] = [+m[1], +m[2], m[4] != null ? +m[4] : 9, m[5] != null ? +m[5] : 0];
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
    // Spain's offset at that moment (+1 or +2), found by reading the same instant back in Madrid time
    const guess = Date.UTC(year, month - 1, day, hour, minute);
    const asMadrid = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
    const utc = new Date(guess - (asMadrid - asUtc));
    if (utc.getUTCDate() !== new Date(Date.UTC(year, month - 1, day)).getUTCDate() && day > 28) return null; // 31/02…
    if (utc <= now || utc - now > 90 * 86400000) return null; // future, at most 90 days
    return utc.toISOString();
}

// Preset end dates for the buttons
function presetUntil(preset) {
    const now = Date.now(), H = 3600000;
    if (preset === 'none') return null;
    if (preset === '1h') return new Date(now + H).toISOString();
    if (preset === '3h') return new Date(now + 3 * H).toISOString();
    if (preset === '1d') return new Date(now + 24 * H).toISOString();
    if (preset === '3d') return new Date(now + 72 * H).toISOString();
    if (preset === 'tom') { // tomorrow 09:00 in Spain
        const t = new Date(now + 24 * H).toLocaleDateString('en-GB', { timeZone: 'Europe/Madrid' }); // dd/mm/yyyy
        return parseMadridDate(`${t} 09:00`);
    }
    return undefined;
}
const PRESET_LABEL = { none: 'sin fecha de fin', '1h': '1 hora', '3h': '3 horas', tom: 'mañana a las 09:00', '1d': '1 día', '3d': '3 días' };

function maintView(s) {
    const on = isActive(s);
    const presetRows = prefix => [
        [{ text: '1 hora', callback_data: `adm:m:${prefix}:1h` }, { text: '3 horas', callback_data: `adm:m:${prefix}:3h` }, { text: 'Mañana 09:00', callback_data: `adm:m:${prefix}:tom` }],
        [{ text: '1 día', callback_data: `adm:m:${prefix}:1d` }, { text: '3 días', callback_data: `adm:m:${prefix}:3d` }, { text: 'Sin fecha', callback_data: `adm:m:${prefix}:none` }],
        [{ text: '📅 Elegir fecha y hora', callback_data: 'adm:m:ask' }]
    ];
    const pages = cleanPages(s.pages);
    const scope = pages ? pages.map(p => SECTIONS[p]).join(', ') : 'toda la web';
    const text = `🚧 <b>Modo mantenimiento</b>\n\n` +
        (on ? `Estado: <b>ACTIVO</b> desde el ${madridText(s.since)}\n` +
              `Fin: <b>${s.until ? madridText(s.until) + ' (se quita solo)' : 'sin fecha: hasta que lo desactives'}</b>\n` +
              `Afecta a: <b>${scope}</b>\n\n` +
              `Los visitantes ven el aviso de mantenimiento; los admins con sesión iniciada ven la web normal. El bot, las alertas y este panel siguen funcionando.\n\n` +
              `Puedes quitarlo cuando quieras con «Desactivar ahora», aunque tenga fecha de fin. Para cambiar la fecha, elige otra abajo.`
            : `Estado: <b>desactivado</b>. La web funciona con normalidad.\n` +
              `Afectará a: <b>${scope}</b> (cámbialo en «Elegir páginas»)\n\n` +
              `Al activarlo, los visitantes verán un aviso de mantenimiento (con la fecha de vuelta, si la pones); los admins con sesión iniciada seguirán viendo la web normal. ` +
              `El bot, las alertas y este panel seguirán funcionando, y podrás desactivarlo en cualquier momento.\n\n` +
              `¿Hasta cuándo?`);
    const scopeRow = [{ text: `🗂️ Elegir páginas (ahora: ${pages ? pages.length + ' secciones' : 'toda la web'})`, callback_data: 'adm:m:pages' }];
    const keyboard = on
        ? [[{ text: '✅ Desactivar ahora', callback_data: 'adm:m:off' }],
           [{ text: '👀 Ver la web (enlace privado)', url: `${requestOrigin}/?acceso=${s.bypass}` }],
           scopeRow, ...presetRows('set'), [{ text: '⬅ Panel admin', callback_data: 'adm:home' }]]
        : [scopeRow, ...presetRows('conf'), [{ text: '⬅ Panel admin', callback_data: 'adm:home' }]];
    return { text, keyboard };
}

// Which sections it affects: "Toda la web" or any mix of SECTIONS. /login and /legal are never blocked.
function pagesView(s) {
    const pages = cleanPages(s.pages);
    const mark = on => (on ? '✅ ' : '☐ ');
    return {
        text: `🗂️ <b>Páginas en mantenimiento</b>\n\nElige si afecta a toda la web o solo a algunas secciones. ` +
            `El inicio de sesión y los textos legales siempre quedan abiertos.\n\nAhora: <b>${pages ? pages.map(p => SECTIONS[p]).join(', ') : 'toda la web'}</b>` +
            (isActive(s) ? '\n\nLos cambios se aplican al momento (puede tardar hasta un minuto).' : ''),
        keyboard: [
            [{ text: mark(!pages) + 'Toda la web', callback_data: 'adm:m:all' }],
            ...Object.entries(SECTIONS).map(([key, label]) => [{ text: mark(!!pages && pages.includes(key)) + label, callback_data: `adm:m:pg:${key}` }]),
            [{ text: '⬅ Volver', callback_data: 'adm:m:view' }]
        ]
    };
}

async function setMaintenance(viewer, until) {
    const current = await readMaintenance();
    const state = isActive(current)
        ? { ...current, until }
        : { on: true, since: new Date().toISOString(), until, by: viewer.id, bypass: newBypassToken(), pages: cleanPages(current.pages) };
    await writeMaintenance(state);
    console.log(`ADMIN: ${viewer.id} activó/cambió el mantenimiento hasta ${until || 'sin fecha'}`);
    return state;
}

async function handleMaintenanceButton(viewer, action, arg, chatId, answer, redraw) {
    if (!isOwner(viewer)) { await answer('Solo el dueño puede activar o quitar el mantenimiento.', true); return; }
    if (action === 'view') { await redraw(maintView(await readMaintenance())); await answer(''); return; }
    if (action === 'ask') {
        await answer('');
        await tg('sendMessage', { chat_id: chatId, text: `${ASK_MAINT} (hora de España), por ejemplo 25/10/2026 20:00.\nSi no pones hora, será a las 09:00. Máximo 90 días.`,
            reply_markup: { force_reply: true, input_field_placeholder: 'DD/MM/AAAA HH:MM' } });
        return;
    }
    if (action === 'pages') { await redraw(pagesView(await readMaintenance())); await answer(''); return; }
    if (action === 'all' || action === 'pg') {
        const current = await readMaintenance();
        let pages = cleanPages(current.pages);
        if (action === 'all') pages = null;
        else if (SECTIONS[arg]) {
            const set = new Set(pages || []);
            if (set.has(arg)) set.delete(arg); else set.add(arg);
            if (!set.size) { await answer('Elige al menos una sección, o «Toda la web».', true); return; }
            pages = Object.keys(SECTIONS).filter(k => set.has(k)); // same order as the list
        }
        const state = { ...current, pages };
        await writeMaintenance(state);
        console.log(`ADMIN: ${viewer.id} cambió las páginas del mantenimiento a ${pages ? pages.join(',') : 'toda la web'}`);
        await redraw(pagesView(state));
        await answer('Guardado');
        return;
    }
    if (action === 'off') {
        const current = await readMaintenance();
        await writeMaintenance({ on: false, until: null, pages: cleanPages(current.pages) });
        console.log(`ADMIN: ${viewer.id} desactivó el mantenimiento`);
        await redraw(maintView({ on: false, pages: current.pages }));
        await answer('Mantenimiento desactivado: la web vuelve a estar abierta');
        return;
    }
    if (action === 'at') { // confirmed custom date (from the typed answer), as epoch ms
        const ms = Number(arg);
        if (!Number.isFinite(ms) || ms <= Date.now()) { await answer('Esa fecha ya ha pasado. Elige otra.', true); return; }
        await redraw(maintView(await setMaintenance(viewer, new Date(ms).toISOString())));
        await answer('Mantenimiento activado');
        return;
    }
    const until = presetUntil(arg);
    if (until === undefined) { await answer(''); return; }
    if (action === 'conf') { // switching it on asks once
        await redraw({ text: `🚧 ¿Activar el modo mantenimiento (${PRESET_LABEL[arg]})?\n\nTodos los visitantes dejarán de ver la web hasta ${until ? 'el ' + madridText(until) : 'que lo desactives'}.`,
            keyboard: [[{ text: '🚧 Sí, activar', callback_data: `adm:m:set:${arg}` }], [{ text: 'Cancelar', callback_data: 'adm:m:view' }]] });
        await answer('');
        return;
    }
    if (action === 'set') {
        await redraw(maintView(await setMaintenance(viewer, until)));
        await answer('Mantenimiento activado');
    }
}

async function handleAdminButton(cb, data, chatId, answer, redraw) {
    // Fresh from the server on every press: the viewer must still be linked to this chat and still be admin
    const viewer = privateChat(cb.message.chat, cb.from) ? await linkedUser(chatId) : null;
    if (!isAdmin(viewer)) { await answer('No tienes permiso.', true); return; }
    const [, what, id, arg] = data.split(':');
    // Password first: "Entrar" always asks again; "Salir" closes the session; anything else needs an open session
    if (what === 'login') { await adminSession.endSession(viewer.id); await askPassword(chatId); await answer(''); return; }
    if (what === 'out') { await adminSession.endSession(viewer.id); await redraw(lockedView()); await answer('Sesión cerrada'); return; }
    if (!(await adminSession.hasSession(viewer.id, chatId))) {
        await redraw(lockedView());
        await answer('La sesión de admin ha caducado. Vuelve a entrar con la contraseña.', true);
        return;
    }
    const confirmView = (text, yes, yesData, backId) => ({ text, keyboard: [[{ text: yes, callback_data: yesData }], [{ text: 'Cancelar', callback_data: `adm:v:${backId}` }]] });
    if (what === 'm') { await handleMaintenanceButton(viewer, id, arg, chatId, answer, redraw); return; }
    if (what === 'home') await redraw(await adminHome());
    else if (what === 'u') await redraw(await adminUsers(parseInt(id, 10) || 0));
    else if (what === 'a') await redraw(await adminAdmins());
    else if (what === 'v') await redraw(await adminUserView(viewer, id));
    else if (what === 'g' || what === 'r') {
        if (!isOwner(viewer)) { await answer('Solo el dueño puede dar o quitar admin.', true); return; }
        const target = (await allUsers()).find(x => x.id === id);
        if (!target) { await answer('Ese usuario ya no existe.', true); return; }
        await redraw(what === 'g'
            ? confirmView(`¿Dar <b>admin</b> a ${escapeHtml(target.email)}?\n\nPodrá ver el panel, los usuarios y las métricas.`, 'Sí, dar admin', `adm:g!:${id}`, id)
            : confirmView(`¿Quitar admin a ${escapeHtml(target.email)}?`, 'Sí, quitar admin', `adm:r!:${id}`, id));
    } else if (what === 'g!' || what === 'r!') {
        const { error } = await setAdminRole(viewer, id, what === 'g!');
        if (error) { await answer(error, true); return; }
        await redraw(await adminUserView(viewer, id));
        await answer(what === 'g!' ? 'Admin concedido' : 'Admin retirado');
        return;
    } else if (what === 'd' || what === 'd1') {
        // Two confirmations before deleting (it can't be undone)
        if (!isOwner(viewer)) { await answer('Solo el dueño puede borrar usuarios.', true); return; }
        const target = (await allUsers()).find(x => x.id === id);
        if (!target) { await answer('Ese usuario ya no existe.', true); return; }
        if (isOwner(target) || target.id === viewer.id) { await answer('Esta cuenta no se puede borrar desde el panel.', true); return; }
        await redraw(what === 'd'
            ? confirmView(`🗑️ ¿Borrar la cuenta de <b>${escapeHtml(target.email)}</b>?\n\nSe borrarán su cuenta, sus favoritos, sus alertas y su conexión con Telegram, también en la web. <b>No se puede deshacer.</b>`, 'Sí, quiero borrarla', `adm:d1:${id}`, id)
            : confirmView(`⚠️ <b>Última confirmación</b>\n\nVas a borrar para siempre la cuenta de <b>${escapeHtml(target.email)}</b>.`, 'Borrar definitivamente', `adm:d!:${id}`, id));
    } else if (what === 'd!') {
        const { error, target } = await deleteUserByAdmin(viewer, id);
        if (error) { await answer(error, true); return; }
        const list = await adminUsers(0);
        await redraw({ text: `✅ Cuenta de ${escapeHtml(target.email)} borrada.\n\n${list.text}`, keyboard: list.keyboard });
        await answer('Usuario borrado');
        return;
    }
    await answer('');
}

// /cuenta buttons. Disconnecting and deleting ask first (their "!" version is the confirmed one).
async function handleAccountButton(what, user, chatId, answer, redraw) {
    const meta = user.user_metadata || {};
    const confirmView = (text, yes, yesData) => ({ text, keyboard: [[{ text: yes, callback_data: yesData }], [{ text: 'No, volver', callback_data: 'c:back' }]] });
    if (what === 'name' || what === 'photo') {
        await answer('');
        await tg('sendMessage', {
            chat_id: chatId,
            text: what === 'name' ? `${ASK_NAME}\n(máximo ${MAX_NAME} caracteres)` : `${ASK_PHOTO}\n(tiene que empezar por https://)`,
            reply_markup: { force_reply: true, input_field_placeholder: what === 'name' ? 'Tu nombre' : 'https://…' }
        });
    } else if (what === 'nophoto') {
        await saveProfile(user, { avatar_url: '' });
        await redraw(await accountView({ ...user, user_metadata: { ...meta, avatar_url: '' } }));
        await answer('Foto de perfil quitada');
    } else if (what === 'alerts') {
        await answer('');
        await redraw(alertsView(meta));
    } else if (what === 'favs') {
        await answer('');
        await redraw(favView(await getFavs(user.id)));
    } else if (what === 'unlink') {
        await redraw(confirmView('🔌 ¿Desconectar Telegram de tu cuenta?\n\nDejarás de recibir alertas por aquí y no podrás usar /alertas, /fav ni /cuenta hasta volver a conectarlo desde la web.', 'Sí, desconectar', 'c:unlink!'));
        await answer('');
    } else if (what === 'unlink!') {
        await redraw({ text: await unlinkChat(chatId) });
        await answer('Telegram desconectado');
    } else if (what === 'delete') {
        await redraw(confirmView('⚠️ <b>¿Borrar tu cuenta?</b>\n\nSe borrarán tu nombre, tu email, tus favoritos y tus alertas, también en la web. <b>No se puede deshacer.</b>', 'Sí, borrar mi cuenta para siempre', 'c:delete!'));
        await answer('');
    } else if (what === 'delete!') {
        await deleteAccount(user);
        await setChatCommands(chatId, false);
        await redraw({ text: 'Tu cuenta se ha borrado. ¡Gracias por haber usado CostaSurf Cams!' });
        await answer('Cuenta borrada');
    } else { // back
        await redraw(await accountView(user));
        await answer('');
    }
}

// ── Main panel (/panel): everything the bot does, as buttons in one message that changes in place ──
// The "/" menu for one chat: admins get /panel + /admin, everyone else the default (/panel only)
async function setChatCommands(chatId, admin) {
    const scope = { type: 'chat', chat_id: chatId };
    await (admin ? tg('setMyCommands', { commands: ADMIN_COMMANDS, scope }) : tg('deleteMyCommands', { scope }));
}

// The bot only works with a CostaSurf Cams account linked to the chat: anything else gets this (the one exception is
// the /start <code> link that connects the account)
function connectView() {
    return {
        text: `🔒 <b>Para usar el bot necesitas una cuenta de CostaSurf Cams</b>\n\n` +
            `Es gratis. Para conectarla:\n` +
            `1. Crea tu cuenta o inicia sesión en la web.\n` +
            `2. Entra en <b>Herramientas → Bot de Telegram</b> y pulsa <b>Conectar Telegram</b>.\n` +
            `3. Vuelve aquí y pulsa <b>Iniciar</b>.\n\n` +
            `Con la cuenta conectada tendrás la previsión de todos los spots, tus favoritos y tus alertas de olas.`,
        keyboard: [
            [{ text: '🔗 Conectar mi cuenta', url: `${SITE_URL}/herramientas#telegram` }],
            [{ text: '✏️ Crear una cuenta', url: `${SITE_URL}/login?next=%2Fherramientas%23telegram` }]
        ]
    };
}

function mainPanel(user, admin) {
    if (!user) return connectView();
    const text = `🌊 <b>CostaSurf Cams</b>\n\nCuenta conectada: <b>${escapeHtml(user.email || '')}</b>\n\n¿Qué quieres ver?`;
    const keyboard = [
        [{ text: '🌊 Dónde surfear hoy', callback_data: 'p:hoy' }],
        [{ text: '📍 Previsión de un spot', callback_data: 'p:spots' }],
        [{ text: '⭐ Mis favoritos', callback_data: 'f:show' }, { text: '✏️ Editar favoritos', callback_data: 'f:list' }],
        [{ text: '🔔 Alertas', callback_data: 'a:view' }, { text: '👤 Cuenta', callback_data: 'c:view' }],
        [{ text: '🧹 Borrar conversación', callback_data: 'p:clear' }, { text: '❓ Ayuda', callback_data: 'p:help' }],
        ...(admin ? [[{ text: '🛠️ Panel de admin', callback_data: 'adm:login' }]] : [])
    ];
    return { text, keyboard };
}
async function panelFor(chat, from) {
    const user = await linkedUser(chat.id);
    const admin = privateChat(chat, from) && isAdmin(user);
    return mainPanel(user, admin);
}
const spotsView = () => ({
    text: '📍 <b>Previsión de un spot</b>\n\nElige un spot para ver sus próximos 3 días:',
    keyboard: [...Object.keys(SPOTS).map(id => [{ text: SPOTS[id].name, callback_data: `p:spot:${id}` }]), BACK_ROW]
});
const panelHelp = () => ({
    text: `❓ <b>Cómo funciona</b>\n\n` +
        `Todo está en este panel: toca un botón y el mensaje cambia; con «⬅ Panel» vuelves al inicio. Para abrirlo otra vez escribe /panel.\n\n` +
        `🌊 <b>Dónde surfear hoy</b>: todos los spots ordenados de mejor a peor.\n` +
        `📍 <b>Previsión de un spot</b>: tamaño, periodo, energía, viento y mejor franja de los próximos 3 días.\n` +
        `⭐ <b>Mis favoritos</b>: hoy y mañana en tus spots favoritos; en ✏️ los añades o quitas.\n` +
        `🔔 <b>Alertas</b>: un aviso cada mañana a las 07:30 si hay olas que encajan con lo que eliges.\n` +
        `👤 <b>Cuenta</b>: tu nombre, foto, Telegram y borrar la cuenta.\n` +
        `🧹 <b>Borrar conversación</b>: borra los mensajes de las últimas 48 h.\n\n` +
        `Todo lo que cambies aquí se ve también en la web, y al revés.

Cómo tratamos tus datos: ${SITE_URL}/legal.html#privacidad`,
    keyboard: [BACK_ROW]
});

async function handlePanelButton(cb, data, chatId, answer, redraw) {
    const [, what, id] = data.split(':');
    if (what === 'home') await redraw(await panelFor(cb.message.chat, cb.from));
    else if (what === 'hoy') await redraw({ text: await todayRanking(), keyboard: [[{ text: '📍 Previsión de un spot', callback_data: 'p:spots' }], BACK_ROW] });
    else if (what === 'spots') await redraw(spotsView());
    else if (what === 'spot' && SPOTS[id]) {
        await redraw({ text: await spotForecast(id), keyboard: [[{ text: '⬅ Spots', callback_data: 'p:spots' }], BACK_ROW] });
    } else if (what === 'help') await redraw(panelHelp());
    else if (what === 'clear') {
        await answer('Borrando…');
        // The panel may be an old message: a fresh one gives the newest message id to delete back from
        const marker = await tg('sendMessage', { chat_id: chatId, text: '🧹 Borrando…' });
        await deleteConversation(chatId, (marker.result && marker.result.message_id) || cb.message.message_id);
        const panel = await panelFor(cb.message.chat, cb.from);
        await reply(chatId, { text: '🧹 Conversación borrada. Telegram solo deja borrar los mensajes de las últimas 48 h; ' +
            'los anteriores se borran desde el menú del chat → Borrar historial.\n\n' + panel.text, keyboard: panel.keyboard });
        return;
    }
    await answer('');
}

// A button was pressed (callback query): change the setting and redraw the same message
async function handleButton(cb) {
    const chatId = cb.message && cb.message.chat.id;
    const answer = (text, alert = false) => tg('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: alert });
    const redraw = view => tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text: view.text,
        parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: view.keyboard || [] } });
    const data = String(cb.data || '');
    if (data.startsWith('adm:')) { await handleAdminButton(cb, data, chatId, answer, redraw); return; }
    // Every button needs a linked account (old messages may still have buttons from before it was unlinked)
    const user = chatId && await linkedUser(chatId);
    if (!user) { await redraw(connectView()); await answer('Conecta tu cuenta para usar el bot.', true); return; }
    if (data.startsWith('p:')) { await handlePanelButton(cb, data, chatId, answer, redraw); return; }

    if (data.startsWith('a:')) {
        const { meta, error } = applyAlertChange(user.user_metadata || {}, data);
        if (error) { await answer(error, true); return; }
        if (data !== 'a:noop' && data !== 'a:view') {
            const { error: saveError } = await supabase.auth.admin.updateUserById(user.id, { user_metadata: meta });
            if (saveError) throw saveError;
        }
        await redraw(alertsView(meta));
        await answer(data === 'a:noop' ? 'Usa − y + para cambiar el tamaño' : data === 'a:view' ? '' : 'Guardado');
    } else if (data === 'f:show') {
        await answer('');
        await redraw({ text: await favouritesForecast(chatId), keyboard: [[{ text: '✏️ Editar favoritos', callback_data: 'f:list' }], BACK_ROW] });
    } else if (data === 'f:list') {
        await answer('');
        await redraw(favView(await getFavs(user.id)));
    } else if (data.startsWith('f:') && SPOTS[data.slice(2)]) {
        const added = await toggleFav(user.id, data.slice(2));
        await redraw(favView(await getFavs(user.id)));
        await answer(added ? 'Añadido a favoritos' : 'Quitado de favoritos');
    } else if (data.startsWith('c:')) {
        await handleAccountButton(data.slice(2), user, chatId, answer, redraw);
    } else {
        await answer('');
    }
}

// Deletes the chat's messages, both ways, going back from the /borrar message. In a private chat message ids are
// consecutive, so no history needs storing; Telegram skips ids that don't exist and refuses anything older than 48 h,
// so we stop at the first batch it rejects.
const DELETE_BATCH = 100, DELETE_MAX_BATCHES = 20;
async function deleteConversation(chatId, lastId) {
    for (let top = lastId, batch = 0; top > 0 && batch < DELETE_MAX_BATCHES; top -= DELETE_BATCH, batch++) {
        const ids = [];
        for (let id = top; id > Math.max(0, top - DELETE_BATCH); id--) ids.push(id);
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessages`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, message_ids: ids })
        }).then(r => r.json()).catch(() => ({ ok: false }));
        if (!res.ok) break; // nothing left that Telegram lets us delete
    }
}

// "/prevision la malagueta", "/prevision fuente de la salud"… → spot id
const normalize = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
function findSpot(query) {
    const q = normalize(query);
    if (!q) return null;
    if (SPOT_BY_COMMAND[q]) return SPOT_BY_COMMAND[q];
    return Object.keys(SPOTS).find(id => normalize(SPOTS[id].name).includes(q)) || null;
}

async function linkChat(chatId, code, from) {
    const user = await findUser(u => (u.user_metadata || {}).telegram_link_code === code);
    const fresh = user && Date.now() - ((user.user_metadata || {}).telegram_link_at || 0) < CODE_MAX_AGE_MS;
    if (!fresh) return `Este enlace ha caducado o ya se ha usado. Vuelve a pulsar <b>Conectar Telegram</b> en ${SITE_URL}/herramientas#telegram`;
    const name = from && (from.username ? '@' + from.username : from.first_name) || '';
    // One chat ↔ one account: if this chat was linked to another account (e.g. someone tricked the user into opening
    // their own link), unlink it there first, so the bot never confuses whose account it is acting on
    const others = (await allUsers()).filter(u => u.id !== user.id && (u.app_metadata || {}).telegram_chat_id === chatId);
    for (const other of others) {
        const { error: otherError } = await supabase.auth.admin.updateUserById(other.id, {
            app_metadata: { ...other.app_metadata, telegram_chat_id: null, telegram_name: null },
            user_metadata: { ...other.user_metadata, alert_telegram: false }
        });
        if (otherError) throw otherError;
    }
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
        app_metadata: { ...user.app_metadata, telegram_chat_id: chatId, telegram_name: String(name).slice(0, 64) },
        user_metadata: { ...user.user_metadata, telegram_link_code: null, telegram_link_at: null, alert_telegram: true }
    });
    if (error) throw error;
    console.log('Telegram conectado para el usuario', user.id);
    return `¡Listo! Este chat está conectado a la cuenta de CostaSurf Cams <b>${escapeHtml(user.email || '')}</b>. Si no es la tuya, desconéctalo en /panel → Cuenta.\n\n` +
        'Cuando haya olas en tus spots favoritos que cumplan tus alertas, ' +
        'te escribiré aquí cada mañana a las 07:30.\n\nTodo lo demás está en el panel de abajo (y siempre con /panel).';
}

async function unlinkChat(chatId) {
    const user = await findUser(u => (u.app_metadata || {}).telegram_chat_id === chatId);
    if (user) {
        const { error } = await supabase.auth.admin.updateUserById(user.id, {
            app_metadata: { ...user.app_metadata, telegram_chat_id: null, telegram_name: null },
            user_metadata: { ...user.user_metadata, alert_telegram: false }
        });
        if (error) throw error;
    }
    await setChatCommands(chatId, false);
    return 'Hecho: este chat ya no está conectado a tu cuenta y no te enviaré alertas. Para volver a usar el bot, conéctalo de nuevo desde la web (Herramientas → Bot de Telegram).';
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
    if (!BOT_TOKEN || !SECRET) return { statusCode: 503, body: 'Telegram not configured' };
    const headerSecret = event.headers['x-telegram-bot-api-secret-token'] || event.headers['X-Telegram-Bot-Api-Secret-Token'];
    if (headerSecret !== SECRET) return { statusCode: 403, body: 'Forbidden' };

    const host = event.headers.host || event.headers.Host;
    if (host) requestOrigin = `https://${host}`;

    let update;
    try { update = JSON.parse(event.body || '{}'); } catch (e) { return ok; }
    if (update.callback_query) {
        try { await handleButton(update.callback_query); } catch (err) {
            console.error('telegram-webhook button', err);
            await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: 'Algo ha fallado. Inténtalo de nuevo.', show_alert: true });
        }
        return ok;
    }
    const msg = update.message;
    if (!msg || !msg.chat || typeof msg.text !== 'string') return ok;
    const chatId = msg.chat.id;
    const [first, ...rest] = msg.text.trim().split(/\s+/);
    const command = first.toLowerCase().replace(/@.*$/, ''); // "/hoy@costasurfcams_bot" in groups
    const arg = rest.join(' ');

    // An answer to the bot's "new name" / "photo link" question (any text that isn't a command)
    const asked = msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot ? String(msg.reply_to_message.text || '') : '';
    const answering = !first.startsWith('/') && (asked.startsWith(ASK_NAME) || asked.startsWith(ASK_PHOTO));

    try {
        // Without a linked account the bot only explains how to connect one. The /start <code> link (the way to
        // connect) is the one thing that works before it.
        if (!(command === '/start' && arg) && !(await linkedUser(chatId))) {
            await reply(chatId, connectView());
            return ok;
        }
        let text;
        if (asked.startsWith(ASK_PASS) && !first.startsWith('/')) {
            // The admin panel password: wipe it from the chat straight away (with the question), then check it
            await tg('deleteMessages', { chat_id: chatId, message_ids: [msg.message_id, msg.reply_to_message.message_id] });
            const viewer = privateChat(msg.chat, msg.from) ? await linkedUser(chatId) : null;
            if (!isAdmin(viewer)) text = await panelFor(msg.chat, msg.from);
            else {
                const result = await adminSession.tryPassword(viewer.id, chatId, msg.text);
                if (result.ok) {
                    console.log(`ADMIN: ${viewer.id} entró al panel`);
                    text = await adminHome();
                } else if (result.lockedFor) {
                    console.log(`ADMIN: panel bloqueado para ${viewer.id} por contraseñas incorrectas`);
                    text = `🔒 Demasiados intentos. El panel de admin queda bloqueado ${minutes(result.lockedFor)} min.`;
                } else {
                    console.log(`ADMIN: contraseña incorrecta de ${viewer.id}`);
                    await tg('sendMessage', { chat_id: chatId, text: `${ASK_PASS}.\n❌ La anterior no era correcta: te quedan ${result.left} intentos.`,
                        reply_markup: { force_reply: true, input_field_placeholder: 'Contraseña' } });
                    return ok;
                }
            }
        } else if (!first.startsWith('/') && asked.startsWith(ASK_MAINT)) {
            // The owner's answer with the maintenance end date. Same checks as the buttons, session included.
            const viewer = privateChat(msg.chat, msg.from) ? await linkedUser(chatId) : null;
            if (!isOwner(viewer)) text = await panelFor(msg.chat, msg.from);
            else if (!(await adminSession.hasSession(viewer.id, chatId))) text = lockedView();
            else {
                const until = parseMadridDate(msg.text);
                if (!until) {
                    await tg('sendMessage', { chat_id: chatId, text: `No entiendo esa fecha o ya ha pasado.\n${ASK_MAINT} (hora de España), por ejemplo 25/10/2026 20:00.`,
                        reply_markup: { force_reply: true, input_field_placeholder: 'DD/MM/AAAA HH:MM' } });
                    return ok;
                }
                const current = await readMaintenance();
                if (isActive(current)) text = maintView(await setMaintenance(viewer, until));
                else text = { text: `🚧 ¿Activar el modo mantenimiento hasta el <b>${madridText(until)}</b>?\n\nTodos los visitantes dejarán de ver la web hasta entonces.`,
                    keyboard: [[{ text: '🚧 Sí, activar', callback_data: `adm:m:at:${Date.parse(until)}` }], [{ text: 'Cancelar', callback_data: 'adm:m:view' }]] };
            }
        } else if (answering || command === '/nombre' || command === '/foto') {
            const user = await linkedUser(chatId);
            const isName = answering ? asked.startsWith(ASK_NAME) : command === '/nombre';
            const value = answering ? msg.text : arg;
            if (!user) text = NOT_LINKED;
            else if (!value) {
                await tg('sendMessage', { chat_id: chatId, text: isName ? `${ASK_NAME}\n(máximo ${MAX_NAME} caracteres)` : `${ASK_PHOTO}\n(tiene que empezar por https://)`,
                    reply_markup: { force_reply: true } });
                return ok;
            } else text = isName ? await setName(user, value) : await setPhoto(user, value);
        } else if (command === '/admin') {
            // Not admin (or not a private chat): the same answer as any unknown text (the main panel), so it doesn't
            // reveal that an admin panel exists
            const user = privateChat(msg.chat, msg.from) ? await linkedUser(chatId) : null;
            if (isAdmin(user)) {
                // Always asks for the password, even with a session open (that session ends here)
                await setChatCommands(chatId, true);
                await adminSession.endSession(user.id);
                await askPassword(chatId);
                return ok;
            }
            text = await panelFor(msg.chat, msg.from);
        } else if (command === '/cuenta') {
            const user = await linkedUser(chatId);
            text = user ? await accountView(user) : NOT_LINKED;
        } else if (command === '/borrar') {
            await deleteConversation(chatId, msg.message_id);
            text = '🧹 Conversación borrada.\n\nTelegram solo deja a los bots borrar los mensajes de las últimas 48 horas. ' +
                'Para borrar también los anteriores: abre el menú del chat (⋮) → <b>Borrar historial</b>.\n\nEscribe /panel para volver al panel.';
        } else if (command === '/start' && arg) {
            await reply(chatId, await linkChat(chatId, arg.slice(0, 64), msg.from));
            const linked = await linkedUser(chatId);
            await setChatCommands(chatId, privateChat(msg.chat, msg.from) && isAdmin(linked));
            text = await panelFor(msg.chat, msg.from);
        }
        else if (command === '/stop') text = await unlinkChat(chatId);
        else if (command === '/hoy') text = await todayRanking();
        else if (command === '/favoritos') text = await favouritesForecast(chatId);
        else if (command === '/alertas') {
            const user = await linkedUser(chatId);
            text = user ? alertsView(user.user_metadata || {}) : NOT_LINKED;
        } else if (command === '/fav') text = await favCommand(chatId, arg);
        else if (command === '/prevision' || command === '/previsión') {
            const spot = arg && findSpot(arg);
            text = spot ? await spotForecast(spot)
                : `${arg ? 'No conozco ese spot. ' : ''}Elige un spot:\n\n${spotList()}`;
        } else if (command === '/spots') text = `Toca un spot para ver sus próximos 3 días:\n\n${spotList()}`;
        else if (command.startsWith('/') && SPOT_BY_COMMAND[command.slice(1)]) text = await spotForecast(SPOT_BY_COMMAND[command.slice(1)]);
        else if (command === '/ayuda' || command === '/help') text = helpText();
        else text = await panelFor(msg.chat, msg.from); // /panel, /start without code or anything else
        await reply(chatId, text);
    } catch (err) {
        console.error('telegram-webhook', err);
        await reply(chatId, 'Algo ha fallado. Inténtalo de nuevo en unos minutos.');
    }
    return ok;
};

exports.BOT_COMMANDS = BOT_COMMANDS;
