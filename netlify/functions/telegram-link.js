// Connects or disconnects the logged-in user's Telegram chat for wave alerts.
//   POST { action: 'link' }   → a one-use code (valid 30 min) and the t.me link that opens the bot with it. The bot's
//                               webhook (telegram-webhook.js) matches the code and saves the chat.
//   POST { action: 'unlink' } → forgets the chat and turns Telegram alerts off.
// The user comes from their own session token, never from the request body. The chat id lives in app_metadata, which
// only the server can write, so nobody can point their alerts at someone else's chat.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');

const json = (statusCode, body) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
});

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
    if (!BOT_TOKEN || !BOT_USERNAME) return json(503, { error: 'Telegram not configured' });

    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: 'Not logged in' });
    const { data, error: authError } = await supabase.auth.getUser(token);
    if (authError || !data.user) return json(401, { error: 'Not logged in' });
    const user = data.user;

    let action;
    try { action = JSON.parse(event.body || '{}').action; } catch (e) { return json(400, { error: 'Bad request' }); }

    try {
        if (action === 'link') {
            const code = crypto.randomBytes(16).toString('hex'); // Telegram allows up to 64 chars [A-Za-z0-9_-]
            const { error } = await supabase.auth.admin.updateUserById(user.id, {
                user_metadata: { ...user.user_metadata, telegram_link_code: code, telegram_link_at: Date.now() }
            });
            if (error) throw error;
            return json(200, { url: `https://t.me/${BOT_USERNAME}?start=${code}` });
        }
        if (action === 'unlink') {
            const chatId = (user.app_metadata || {}).telegram_chat_id;
            const { error } = await supabase.auth.admin.updateUserById(user.id, {
                app_metadata: { ...user.app_metadata, telegram_chat_id: null, telegram_name: null },
                user_metadata: { ...user.user_metadata, alert_telegram: false, telegram_link_code: null }
            });
            if (error) throw error;
            if (chatId) {
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: 'Has desconectado Telegram de CostaSurf Cams. Ya no te llegarán alertas por aquí.' })
                }).catch(() => {});
            }
            return json(200, { ok: true });
        }
        return json(400, { error: 'Unknown action' });
    } catch (err) {
        console.error('telegram-link', user.id, err);
        return json(500, { error: 'Could not update Telegram' });
    }
};
