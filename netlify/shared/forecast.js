// Shared by the daily alerts (functions/cron-alerts.js) and the Telegram bot (functions/telegram-webhook.js):
// spot list, the website's wave recipe, wind rule, forecast download and the "best window of a day" analysis.
// Lives outside netlify/functions so Netlify doesn't deploy it as a function of its own (it is bundled into both).

const SPOTS = {
    'misericordia': { lat: 36.697, lon: -4.444, facing: 121, name: 'Playa La Misericordia' },
    'fuengirola':   { lat: 36.540, lon: -4.620, facing: 116, name: 'Fuengirola — Los Boliches' },
    'malapesquera': { lat: 36.601, lon: -4.508, facing: 114, name: 'Playa Fuente de la Salud' }, // id kept for saved favourites
    'malagueta':    { lat: 36.714, lon: -4.411, facing: 137, name: 'Playa La Malagueta' },
    'bajondillo':   { lat: 36.620, lon: -4.496, facing: 119, name: 'Bajondillo — Torremolinos' },
    'nerja':        { lat: 36.743, lon: -3.878, facing: 157, name: 'Nerja — Playa de Burriana' },
    'alamos':       { lat: 36.646, lon: -4.476, facing: 149, name: 'Los Álamos — Torremolinos' },
    'cabopino':     { lat: 36.486, lon: -4.744, facing: 181, name: 'Cabopino — Marbella' },
    'benajarafe':   { lat: 36.743, lon: -4.121, facing: 169, name: 'Benajarafe — Vélez-Málaga' },
    'torredelmar':  { lat: 36.738, lon: -4.094, facing: 131, name: 'Torre del Mar — Vélez-Málaga' }
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
// mean over the last 6 shared hours); period = mean of MFWAM mean period and ECMWF peak period;
// energy_period = MFWAM mean period (the one the energy is computed with).
const MARINE_MODELS = 'meteofrance_wave,ewam,ecmwf_wam025';
function blendMarine(loc) {
    const h = loc.hourly;
    const col = (name, model) => h[`${name}_${model}`] || h[name] || [];
    const mf = col('wave_height', 'meteofrance_wave'), ew = col('wave_height', 'ewam');
    const mfT = col('wave_period', 'meteofrance_wave'), ewT = col('wave_period', 'ewam'), ecTp = col('wave_peak_period', 'ecmwf_wam025');
    const both = h.time.map((_, i) => mf[i] != null && ew[i] != null);
    const shared = h.time.map((_, i) => i).filter(i => both[i]).slice(-6);
    const offset = shared.length ? shared.reduce((s, i) => s + (ew[i] - mf[i]) / 2, 0) / shared.length : 0;
    const avg = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b ?? null);
    const wave_period = h.time.map((_, i) => avg(mfT[i], ecTp[i]));
    return {
        time: h.time,
        wave_height: h.time.map((_, i) => both[i] ? (mf[i] + ew[i]) / 2 : mf[i] != null ? Math.max(0, mf[i] + offset) : ew[i] ?? null),
        wave_period,
        energy_period: h.time.map((_, i) => mfT[i] ?? ewT[i] ?? wave_period[i])
    };
}

// Wave energy in kJ, same formula as the website (waveEnergy in common.js): E = ρ·g²·H²·T² / (16π) ≈ 1.96·H²·T²
function waveEnergy(height, period) {
    if (height == null || period == null) return null;
    return 1025 * 9.81 * 9.81 * height * height * period * period / (16 * Math.PI) / 1000;
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

// Forecasts are the same for everyone, so every spot is downloaded at once — one wave and one wind request with all the
// coordinates (Open-Meteo answers one result per point, in order; many parallel requests get "service overloaded") —
// and kept 30 min, so the daily alerts and the bot reuse it and a warm function never serves an old forecast.
const FORECAST_TTL_MS = 30 * 60 * 1000;
let forecastCache = null; // { at, promise } → promise of { spotId: hours[] }, or null if the download failed

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Open-Meteo sometimes sheds load with a 503: try up to 3 times
async function getJson(url) {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url).catch(err => ({ ok: false, status: err.message }));
        if (res.ok) return res.json();
        if (attempt >= 3) throw new Error(`Open-Meteo ${res.status}`);
        await sleep(1000 * attempt);
    }
}

// The hourly rows of one spot: { date, hour, wave, period, energy, windSpeed, status }
function spotHours(spot, marineRaw, wind) {
    const marine = blendMarine(marineRaw);
    const windByTime = {};
    wind.hourly.time.forEach((t, i) => {
        windByTime[t] = { speed: wind.hourly.wind_speed_10m[i], dir: wind.hourly.wind_direction_10m[i] };
    });
    return marine.time.map((t, i) => {
        const w = windByTime[t] || { speed: 0, dir: 0 };
        return {
            date: t.slice(0, 10),
            hour: parseInt(t.slice(11, 13), 10),
            wave: marine.wave_height[i],
            period: marine.wave_period[i],
            energy: waveEnergy(marine.wave_height[i], marine.energy_period[i]),
            windSpeed: w.speed ?? 0,
            status: getWindStatus(w.speed ?? 0, w.dir ?? 0, spot.facing)
        };
    });
}

function loadAllForecasts() {
    if (forecastCache && Date.now() - forecastCache.at < FORECAST_TTL_MS) return forecastCache.promise;
    const ids = Object.keys(SPOTS);
    const lats = ids.map(id => SPOTS[id].lat).join(','), lons = ids.map(id => SPOTS[id].lon).join(',');
    const promise = (async () => {
        try {
            const [marineData, windData] = await Promise.all([
                getJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}&hourly=wave_height,wave_period,wave_peak_period&models=${MARINE_MODELS}&timezone=auto&forecast_days=8`),
                getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=8`)
            ]);
            const marineList = Array.isArray(marineData) ? marineData : [marineData];
            const windList = Array.isArray(windData) ? windData : [windData];
            return Object.fromEntries(ids.map((id, i) => [id, spotHours(SPOTS[id], marineList[i], windList[i])]));
        } catch (err) {
            console.error('Error descargando la previsión:', err.message);
            forecastCache = null; // try again next time
            return null;
        }
    })();
    forecastCache = { at: Date.now(), promise };
    return promise;
}

// Hourly forecast of one spot, or null when it couldn't be downloaded
async function getForecast(spotId) {
    const all = await loadAllForecasts();
    return all ? all[spotId] || null : null;
}

// Alert filters from a user's metadata. Basic alerts only use the minimum size; advanced alerts
// (alerts_advanced) add period, energy, max size, wind and time-of-day limits. null / missing = no limit.
function alertFilters(meta) {
    const adv = meta.alerts_advanced === true;
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const filters = {
        minSize: meta.alert_size || 1.0,
        maxSize: Infinity, minPeriod: 0, minEnergy: 0, maxWind: Infinity, windTypes: null,
        fromHour: 7, toHour: 20 // daylight, toHour exclusive
    };
    if (!adv) return filters;
    filters.maxSize = num(meta.alert_max_size, Infinity);
    filters.minPeriod = num(meta.alert_min_period, 0);
    filters.minEnergy = num(meta.alert_min_energy, 0); // kJ
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
        && (h.energy ?? 0) >= f.minEnergy
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

module.exports = { SPOTS, DIAS_ES, MESES_ES, getWindStatus, MARINE_MODELS, blendMarine, waveEnergy, WIND, MAX_WINDOW_HOURS, sizeVibe, formatDate, dayTitle, pad, windowText, escapeHtml, getForecast, alertFilters, analyzeDay };
