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
const SITE_URL = process.env.SITE_URL || process.env.URL || 'https://costacamsurf.netlify.app';

const SPOTS = {
    'misericordia': { lat: 36.697, lon: -4.444, facing: 121, name: 'Playa La Misericordia' },
    'fuengirola':   { lat: 36.540, lon: -4.620, facing: 116, name: 'Fuengirola — Los Boliches' },
    'malapesquera': { lat: 36.601, lon: -4.508, facing: 114, name: 'Playa Fuente de la Salud' }, // id kept for saved favourites
    'malagueta':    { lat: 36.714, lon: -4.411, facing: 137, name: 'Playa La Malagueta' },
    'bajondillo':   { lat: 36.620, lon: -4.496, facing: 119, name: 'Bajondillo — Torremolinos' },
    'nerja':        { lat: 36.743, lon: -3.878, facing: 157, name: 'Nerja — Playa de Burriana' },
    'alamos':       { lat: 36.646, lon: -4.476, facing: 149, name: 'Los Álamos — Torremolinos' },
    'cabopino':     { lat: 36.486, lon: -4.744, facing: 181, name: 'Cabopino — Marbella' },
    'benajarafe':   { lat: 36.743, lon: -4.121, facing: 169, name: 'Benajarafe — Vélez-Málaga' }
};

const DIAS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Same rule as the website (common.js). Speed in km/h, dir = where the wind blows FROM, facing = the way the beach
// looks out to sea. Wind from the land (within 45° of facing + 180) is off-shore; from the sea, on-shore.
function getWindStatus(speed, dir, facing = 180) {
    if (speed < 7) return 'Glassy';
    const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    if (diff(dir, (facing + 180) % 360) <= 45) return 'Off-shore';
    if (diff(dir, facing) <= 45) return 'On-shore';
    return 'Cross-shore';
}

// Same wave recipe as the website (see common.js, validated against the Puertos del Estado Málaga buoy):
// height = mean of Météo-France MFWAM + DWD EWAM (after EWAM's ~3-day range, MFWAM shifted by its difference to the
// mean over the last 6 shared hours); period = mean of MFWAM mean period and ECMWF peak period.
const MARINE_MODELS = 'meteofrance_wave,ewam,ecmwf_wam025';
function blendMarine(loc) {
    const h = loc.hourly;
    const col = (name, model) => h[`${name}_${model}`] || h[name] || [];
    const mf = col('wave_height', 'meteofrance_wave'), ew = col('wave_height', 'ewam');
    const mfT = col('wave_period', 'meteofrance_wave'), ecTp = col('wave_peak_period', 'ecmwf_wam025');
    const both = h.time.map((_, i) => mf[i] != null && ew[i] != null);
    const shared = h.time.map((_, i) => i).filter(i => both[i]).slice(-6);
    const offset = shared.length ? shared.reduce((s, i) => s + (ew[i] - mf[i]) / 2, 0) / shared.length : 0;
    const avg = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b ?? null);
    return {
        time: h.time,
        wave_height: h.time.map((_, i) => both[i] ? (mf[i] + ew[i]) / 2 : mf[i] != null ? Math.max(0, mf[i] + offset) : ew[i] ?? null),
        wave_period: h.time.map((_, i) => avg(mfT[i], ecTp[i]))
    };
}

// factor weights wave height when picking the best window: clean wind beats a bit more size.
const WIND = {
    'Glassy':      { emoji: '🪞', label: 'sin viento (glassy)',      tip: 'agua de espejo',           factor: 1.2 },
    'Off-shore':   { emoji: '✅', label: 'viento terral (off-shore)', tip: 'olas limpias y ordenadas', factor: 1.15 },
    'Cross-shore': { emoji: '↔️', label: 'viento cruzado',            tip: 'algo de textura',          factor: 0.95 },
    'On-shore':    { emoji: '💨', label: 'viento de mar (on-shore)',  tip: 'puede venir picado',       factor: 0.75 }
};

const MAX_WINDOW_HOURS = 4;

function sizeVibe(h) {
    if (h >= 2.0) return { emoji: '🔥', text: '¡Día grande! Solo para surfers con experiencia' };
    if (h >= 1.3) return { emoji: '🤩', text: 'Buen tamaño, día para disfrutar' };
    if (h >= 0.8) return { emoji: '🤙', text: 'Olas surfeables y divertidas' };
    return { emoji: '👌', text: 'Pequeñito, ideal para longboard' };
}

function formatDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    return `${DIAS_ES[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES_ES[d.getUTCMonth()]}`;
}

function dayTitle(dateStr, tomorrowStr) {
    const text = formatDate(dateStr);
    return dateStr === tomorrowStr ? `Mañana, ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}

const pad = n => String(n).padStart(2, '0');
const windowText = w => `${pad(w.from)}:00 a ${pad(w.to)}:00`;

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Forecasts are the same for every user, so each spot is fetched once per run.
const forecastCache = {};

async function getForecast(spotId) {
    if (spotId in forecastCache) return forecastCache[spotId];
    const spot = SPOTS[spotId];
    forecastCache[spotId] = (async () => {
        try {
            const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wave_height,wave_period,wave_peak_period&models=${MARINE_MODELS}&timezone=auto&forecast_days=8`;
            const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=8`;
            const [marineRaw, wind] = await Promise.all([fetch(marineUrl).then(r => r.json()), fetch(windUrl).then(r => r.json())]);
            const marine = { hourly: blendMarine(marineRaw) };

            const windByTime = {};
            wind.hourly.time.forEach((t, i) => {
                windByTime[t] = { speed: wind.hourly.wind_speed_10m[i], dir: wind.hourly.wind_direction_10m[i] };
            });

            return marine.hourly.time.map((t, i) => {
                const w = windByTime[t] || { speed: 0, dir: 0 };
                return {
                    date: t.slice(0, 10),
                    hour: parseInt(t.slice(11, 13), 10),
                    wave: marine.hourly.wave_height[i],
                    period: marine.hourly.wave_period[i],
                    windSpeed: w.speed ?? 0,
                    status: getWindStatus(w.speed ?? 0, w.dir ?? 0, spot.facing)
                };
            });
        } catch (err) {
            console.error(`Error pronostico spot ${spotId}:`, err);
            return null;
        }
    })();
    return forecastCache[spotId];
}

// Alert filters from a user's metadata. Basic alerts only use the minimum size; advanced alerts
// (alerts_advanced) add period, max size, wind and time-of-day limits. null / missing = no limit.
function alertFilters(meta) {
    const adv = meta.alerts_advanced === true;
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const filters = {
        minSize: meta.alert_size || 1.0,
        maxSize: Infinity, minPeriod: 0, maxWind: Infinity, windTypes: null,
        fromHour: 7, toHour: 20 // daylight, toHour exclusive
    };
    if (!adv) return filters;
    filters.maxSize = num(meta.alert_max_size, Infinity);
    filters.minPeriod = num(meta.alert_min_period, 0);
    filters.maxWind = num(meta.alert_max_wind, Infinity);
    if (Array.isArray(meta.alert_wind_types) && meta.alert_wind_types.length) filters.windTypes = meta.alert_wind_types;
    const from = num(meta.alert_from_hour, 7), to = num(meta.alert_to_hour, 20);
    if (from < to) { filters.fromHour = from; filters.toHour = to; }
    return filters;
}

// Finds the best window of a day for one spot, or null if no hour matches the user's filters.
// `filters` comes from alertFilters(); a plain number is treated as the minimum size (basic alert).
function analyzeDay(hours, dateStr, filters) {
    const f = typeof filters === 'number' ? alertFilters({ alert_size: filters }) : filters;
    const daylight = hours.filter(h => h.date === dateStr && h.hour >= f.fromHour && h.hour < f.toHour && h.wave != null);
    if (!daylight.length) return null;

    // An hour counts only if it passes every filter
    const matches = h => h.wave >= f.minSize && h.wave <= f.maxSize
        && (h.period ?? 0) >= f.minPeriod
        && h.windSpeed <= f.maxWind
        && (!f.windTypes || f.windTypes.includes(h.status));
    if (!daylight.some(matches)) return null;

    const maxWave = Math.max(...daylight.map(h => h.wave));
    const score = h => h.wave * WIND[h.status].factor * (h.windSpeed > 25 ? 0.8 : 1);
    let best = -1;
    daylight.forEach((h, i) => {
        if (matches(h) && (best === -1 || score(h) > score(daylight[best]))) best = i;
    });

    // Grow the window around the peak, one hour at a time towards the better neighbour,
    // while conditions stay close to the peak and the window is short enough to be useful.
    const bestScore = score(daylight[best]);
    const ok = i => i >= 0 && i < daylight.length && matches(daylight[i]) && score(daylight[i]) >= bestScore * 0.9;
    let from = best, to = best;
    while (to - from + 1 < MAX_WINDOW_HOURS) {
        const left = ok(from - 1) ? score(daylight[from - 1]) : -1;
        const right = ok(to + 1) ? score(daylight[to + 1]) : -1;
        if (left < 0 && right < 0) break;
        if (right >= left) to++; else from--;
    }

    const peak = daylight[best];
    return {
        minWave: Math.min(...daylight.map(h => h.wave)),
        maxWave,
        period: peak.period,
        status: peak.status,
        windSpeed: peak.windSpeed,
        from: daylight[from].hour,
        to: daylight[to].hour + 1,
        score: bestScore
    };
}

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
                Puedes cambiar el tamaño mínimo, los días de antelación o desactivarlas desde <a href="${SITE_URL}/perfil" style="color:#999;">tu perfil</a>.
            </p>
        </div>`;

    const text = `¡Ey, ${name}! 🏄\n\n${intro.replace(/<[^>]+>/g, '')}\n\n⭐ La mejor sesión: ${topLine}\n${daysText}\nEncera la tabla, avisa a la cuadrilla y nos vemos en el pico. ¡Buenas olas! 🤙\n\nCámaras y previsión: ${SITE_URL}\nGestiona tus alertas: ${SITE_URL}/perfil`;

    const subject = dates.length === 1
        ? (dates[0] === tomorrowStr ? `🌊 ¡Mañana hay olas en ${top.spotName}! 🤙` : `🌊 ¡Olas el ${formatDate(dates[0])} en ${top.spotName}! 🤙`)
        : `🌊 ¡Se vienen olas! ${dates.length} días con baño en tus spots 🤙`;

    return { subject, html, text };
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

        let alertsSent = 0;

        for (const user of users) {
            const meta = user.user_metadata || {};
            if (meta.alerts_enabled !== true) continue;

            const favs = userFavorites[user.id] || [];
            if (favs.length === 0) continue;

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

            // Only send email if at least one day has good waves
            if (Object.keys(goodDays).length === 0) continue;

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

        return { statusCode: 200, body: JSON.stringify({ success: true, alertsSent }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
});

// Exposed for local previews/tests
exports._buildEmail = buildEmail;
exports._analyzeDay = analyzeDay;
exports._alertFilters = alertFilters;
exports._getForecast = getForecast;
exports._isWrongSeasonRun = isWrongSeasonRun;
