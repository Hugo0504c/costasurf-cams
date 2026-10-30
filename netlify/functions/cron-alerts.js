const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');

// Gmail SMTP: no domain needed. GMAIL_APP_PASSWORD is a 16-char Google "App Password", not the account password.
const mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Netlify provides URL (the site's main address) to functions; SITE_URL can override it.
const SITE_URL = process.env.SITE_URL || process.env.URL || 'https://costasurfcams.netlify.app';

const {
    SPOTS, DIAS_ES, MESES_ES, getWindStatus, MARINE_MODELS, blendMarine, waveEnergy, WIND, MAX_WINDOW_HOURS, sizeVibe, formatDate, dayTitle, pad, windowText, escapeHtml, getForecast, alertFilters, analyzeDay
} = require('../shared/forecast');

function buildEmail(name, goodDays, tomorrowStr) {
    const dates = Object.keys(goodDays).sort();

    // Overall best session across every day and spot
    let top = null;
    for (const d of dates) for (const s of goodDays[d]) {
        if (!top || s.score > top.score) top = { ...s, date: d };
    }

    const topWind = WIND[top.status];
    const topLine = `${dayTitle(top.date, tomorrowStr)} en ${top.spotName}, de ${windowText(top)} con ${top.maxWave.toFixed(1)}m y ${topWind.label} ${topWind.emoji}`;

    const intro = dates.length === 1
        ? (dates[0] === tomorrowStr ? '¡Mañana se mueve el mar! 🌊' : `¡El ${formatDate(dates[0])} se mueve el mar! 🌊`)
        : `¡Se viene movimiento! Hay <strong>${dates.length} días con olas</strong> en tus spots favoritos 🌊`;

    let daysHtml = '';
    let daysText = '';
    for (const d of dates) {
        const spots = goodDays[d].sort((a, b) => b.score - a.score);
        const dayVibe = sizeVibe(Math.max(...spots.map(s => s.maxWave)));

        const spotsHtml = spots.map(s => {
            const w = WIND[s.status];
            return `
                <div style="padding:14px 16px; border-top:1px solid #eee;">
                    <div style="font-weight:700; font-size:16px; color:#111;">📍 ${escapeHtml(s.spotName)}</div>
                    <div style="margin-top:6px; font-size:14px; color:#444; line-height:1.7;">
                        🌊 <strong>${s.minWave.toFixed(1)}–${s.maxWave.toFixed(1)}m</strong> &nbsp;·&nbsp;
                        ⏱️ ${s.period ? s.period.toFixed(0) + 's' : '—'} de periodo &nbsp;·&nbsp;
                        ${w.emoji} ${w.label.charAt(0).toUpperCase() + w.label.slice(1)} (${Math.round(s.windSpeed)} km/h)
                    </div>
                    <div style="margin-top:8px; display:inline-block; background:#eef6ff; color:#0b5394; font-size:13px; font-weight:700; padding:6px 10px; border-radius:6px;">
                        🕗 Mejor ventana: ${windowText(s)} · ${w.tip}
                    </div>
                </div>`;
        }).join('');

        daysHtml += `
            <div style="margin:0 0 20px 0; border:1px solid #e5e5e5; border-radius:12px; overflow:hidden;">
                <div style="background:#111; color:#fff; padding:12px 16px;">
                    <div style="font-weight:800; font-size:16px;">🗓️ ${dayTitle(d, tomorrowStr)}</div>
                    <div style="font-size:13px; color:#ccc; margin-top:2px;">${dayVibe.emoji} ${dayVibe.text}</div>
                </div>
                ${spotsHtml}
            </div>`;

        daysText += `\n🗓️ ${dayTitle(d, tomorrowStr)} — ${dayVibe.emoji} ${dayVibe.text}\n` + spots.map(s =>
            `  📍 ${s.spotName}: ${s.minWave.toFixed(1)}–${s.maxWave.toFixed(1)}m, ${s.period ? s.period.toFixed(0) + 's' : '—'}, ${WIND[s.status].label}. Mejor ventana: ${windowText(s)}`
        ).join('\n') + '\n';
    }

    const safeName = escapeHtml(name);
    const html = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; max-width:600px; margin:auto; color:#111; padding:8px;">
            <h1 style="font-size:26px; margin:0 0 6px 0;">¡Ey, ${safeName}! 🏄</h1>
            <p style="font-size:16px; color:#444; margin:0 0 20px 0; line-height:1.5;">
                ${intro}<br>Hemos repasado la previsión de tus spots y esto es lo que se viene:
            </p>

            <div style="background:linear-gradient(135deg,#0b5394,#1c8adb); background-color:#0b5394; color:#fff; border-radius:12px; padding:16px 18px; margin-bottom:24px;">
                <div style="font-size:12px; font-weight:800; letter-spacing:1px; text-transform:uppercase; opacity:0.85;">⭐ La mejor sesión</div>
                <div style="font-size:17px; font-weight:700; margin-top:6px; line-height:1.4;">${escapeHtml(topLine)}</div>
            </div>

            ${daysHtml}

            <p style="font-size:15px; color:#444; line-height:1.5; margin:24px 0;">
                Encera la tabla 🏄‍♂️, avisa a la cuadrilla 📲 y nos vemos en el pico. ¡Buenas olas! 🤙
            </p>
            <p style="margin:0 0 28px 0;">
                <a href="${SITE_URL}" style="display:inline-block; background:#111; color:#fff; text-decoration:none; padding:13px 24px; border-radius:8px; font-weight:bold;">
                    📹 Ver cámaras y previsión
                </a>
            </p>
            <p style="color:#999; font-size:12px; line-height:1.5; border-top:1px solid #eee; padding-top:16px;">
                Te llega este correo porque tienes las alertas de olas activadas en CostaSurf Cams.
                Puedes cambiar el tamaño mínimo, los días de antelación o desactivarlas en <a href="${SITE_URL}/herramientas#alertas" style="color:#999;">Herramientas</a>.
                Cómo tratamos tus datos: <a href="${SITE_URL}/legal.html#privacidad" style="color:#999;">Política de privacidad</a>.
            </p>
        </div>`;

    const text = `¡Ey, ${name}! 🏄\n\n${intro.replace(/<[^>]+>/g, '')}\n\n⭐ La mejor sesión: ${topLine}\n${daysText}\nEncera la tabla, avisa a la cuadrilla y nos vemos en el pico. ¡Buenas olas! 🤙\n\nCámaras y previsión: ${SITE_URL}\nGestiona tus alertas: ${SITE_URL}/herramientas#alertas
Privacidad: ${SITE_URL}/legal.html#privacidad`;

    const subject = dates.length === 1
        ? (dates[0] === tomorrowStr ? `🌊 ¡Mañana hay olas en ${top.spotName}! 🤙` : `🌊 ¡Olas el ${formatDate(dates[0])} en ${top.spotName}! 🤙`)
        : `🌊 ¡Se vienen olas! ${dates.length} días con baño en tus spots 🤙`;

    return { subject, html, text };
}

// ── Telegram: same content as the email, shorter (Telegram HTML: only b/i/a tags, text escaped) ──
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function buildTelegram(name, goodDays, tomorrowStr) {
    const dates = Object.keys(goodDays).sort();
    let top = null;
    for (const d of dates) for (const s of goodDays[d]) {
        if (!top || s.score > top.score) top = { ...s, date: d };
    }
    const lines = [`🌊 <b>¡Hay olas, ${escapeHtml(name)}!</b>`, ''];
    lines.push(`⭐ <b>Mejor sesión:</b> ${escapeHtml(dayTitle(top.date, tomorrowStr))} en ${escapeHtml(top.spotName)}, ` +
        `de ${windowText(top)}, ${top.maxWave.toFixed(1)} m, ${WIND[top.status].label}`);
    for (const d of dates) {
        lines.push('', `🗓️ <b>${escapeHtml(dayTitle(d, tomorrowStr))}</b>`);
        goodDays[d].slice().sort((a, b) => b.score - a.score).forEach(s => {
            lines.push(`📍 ${escapeHtml(s.spotName)}: ${s.minWave.toFixed(1)}–${s.maxWave.toFixed(1)} m · ` +
                `${s.period ? s.period.toFixed(0) + ' s' : '—'} · ${WIND[s.status].label} · mejor ${windowText(s)}`);
        });
    }
    lines.push('', `<a href="${SITE_URL}">Ver previsión</a> · /stop para dejar de recibir alertas`);
    return lines.join('\n');
}

// { ok } on success; { blocked } when the user blocked the bot or deleted the chat (403), so the caller can unlink it
async function sendTelegram(chatId, text) {
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        if (res.ok) return { ok: true };
        const body = await res.json().catch(() => ({}));
        return res.status === 403 ? { blocked: true } : { error: `${res.status} ${body.description || ''}` };
    } catch (err) {
        return { error: err.message };
    }
}

// Netlify cron is UTC-only. Spain is UTC+2 in summer and UTC+1 in winter, so the function is scheduled
// at both 05:30 and 06:30 UTC and only the run that falls at 07:30 in Madrid sends emails.
function madridHour(date) {
    return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(date), 10);
}

// True only for the scheduled run that is NOT 07:30 in Madrid. Manual runs ("Run now") at any other time always go through.
function isWrongSeasonRun(now) {
    const utcH = now.getUTCHours(), utcM = now.getUTCMinutes();
    const inScheduledSlot = (utcH === 5 || utcH === 6) && utcM >= 30 && utcM < 45;
    return inScheduledSlot && madridHour(now) !== 7;
}

exports.handler = schedule('30 5,6 * * *', async (event) => {
    if (isWrongSeasonRun(new Date())) {
        console.log('Ejecucion omitida: no son las 07:30 en España (la otra ejecucion programada es la buena).');
        return { statusCode: 200, body: JSON.stringify({ skipped: true }) };
    }
    console.log('Iniciando comprobacion de alertas (Cron Netlify)...');

    try {
        // listUsers is paginated (50 per page by default): read every page
        const users = [];
        for (let page = 1; ; page++) {
            const { data, error: usersError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
            if (usersError) throw usersError;
            users.push(...data.users);
            if (data.users.length < 1000) break;
        }

        const { data: favorites, error: favsError } = await supabase.from('favorites').select('*');
        if (favsError) throw favsError;

        const userFavorites = {};
        favorites.forEach(f => {
            if (!userFavorites[f.user_id]) userFavorites[f.user_id] = [];
            userFavorites[f.user_id].push(f.spot_id);
        });

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        let alertsSent = 0, telegramSent = 0;

        for (const user of users) {
            const meta = user.user_metadata || {};
            if (meta.alerts_enabled !== true) continue;

            const favs = userFavorites[user.id] || [];
            if (favs.length === 0) continue;

            // Channels: email unless switched off (older accounts never chose); Telegram once the chat is linked.
            // The chat id is in app_metadata, which only the server writes (telegram-webhook.js).
            const chatId = (user.app_metadata || {}).telegram_chat_id;
            const byEmail = meta.alert_email !== false;
            const byTelegram = meta.alert_telegram === true && !!chatId && !!TELEGRAM_BOT_TOKEN;
            if (!byEmail && !byTelegram) continue;

            const daysWindow = Math.min(meta.alert_days || 1, 5);
            const filters = alertFilters(meta);
            // Users can write any length into their metadata: keep the greeting short
            const name = String(meta.full_name || '').trim().slice(0, 40) || 'surfer';

            // Next N days, starting from tomorrow
            const datesToCheck = [];
            for (let d = 1; d <= daysWindow; d++) {
                const date = new Date();
                date.setDate(date.getDate() + d);
                datesToCheck.push(date.toISOString().split('T')[0]);
            }

            // goodDays = { 'YYYY-MM-DD': [ { spotName, minWave, maxWave, period, status, windSpeed, from, to, score }, ... ] }
            const goodDays = {};
            for (const spotId of favs) {
                if (!SPOTS[spotId]) continue;
                const hours = await getForecast(spotId);
                if (!hours) continue;

                for (const dateStr of datesToCheck) {
                    const result = analyzeDay(hours, dateStr, filters);
                    if (!result) continue;
                    if (!goodDays[dateStr]) goodDays[dateStr] = [];
                    goodDays[dateStr].push({ spotName: SPOTS[spotId].name, ...result });
                }
            }

            // Only send if at least one day has good waves
            if (Object.keys(goodDays).length === 0) continue;

            if (byEmail) {
                const { subject, html, text } = buildEmail(name, goodDays, tomorrowStr);
                try {
                    const info = await mailer.sendMail({
                        from: `CostaSurf Cams <${process.env.GMAIL_USER}>`,
                        to: user.email,
                        subject,
                        html,
                        text
                    });
                    alertsSent++;
                    // Logs keep the user id, never the email address (personal data)
                    console.log(`Alerta enviada al usuario ${user.id} (${info.response})`);
                } catch (emailErr) {
                    console.error('Error enviando email al usuario', user.id, emailErr && emailErr.message);
                }
            }

            if (byTelegram) {
                const result = await sendTelegram(chatId, buildTelegram(name, goodDays, tomorrowStr));
                if (result.ok) {
                    telegramSent++;
                    console.log(`Alerta de Telegram enviada al usuario ${user.id}`);
                } else if (result.blocked) {
                    // The user blocked or deleted the bot: forget the chat so we stop trying
                    await supabase.auth.admin.updateUserById(user.id, {
                        app_metadata: { ...user.app_metadata, telegram_chat_id: null, telegram_name: null },
                        user_metadata: { ...meta, alert_telegram: false }
                    }).catch(() => {});
                    console.log(`Telegram bloqueado por el usuario ${user.id}: desconectado`);
                } else {
                    console.error('Error enviando Telegram al usuario', user.id, result.error);
                }
            }
        }

        return { statusCode: 200, body: JSON.stringify({ success: true, alertsSent, telegramSent }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
});

// Exposed for local previews/tests
exports._buildEmail = buildEmail;
exports._buildTelegram = buildTelegram;
exports._analyzeDay = analyzeDay;
exports._alertFilters = alertFilters;
exports._getForecast = getForecast;
exports._isWrongSeasonRun = isWrongSeasonRun;
