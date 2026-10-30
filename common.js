// Shared by every page: spot list, wind rule, header search, webcam covers and the login popup.

// facing = compass direction the beach looks out to sea, from the OpenStreetMap coastline (used for off/on-shore wind)
// cam = meteo365 cam (<host>/<name>) whose latest snapshot /proxy serves; camPage = its page on meteo365.es
// (meteo365.es/es/livecams/<camPage>.php), where the live video plays. Or 'windy:<id>': a Windy.com webcam (photos
// every few minutes + timelapse), shown straight from Windy with their credit (see camInfo)
const SPOTS = {
    'misericordia': { lat: 36.697, lon: -4.444, facing: 121, name: 'Playa La Misericordia', loc: 'Málaga Capital', cam: 'webcam2/misericordia', camPage: 'malaga-misericordia' },
    'fuengirola':   { lat: 36.540, lon: -4.620, facing: 116, name: 'Fuengirola — Los Boliches', loc: 'Fuengirola', cam: 'webcam/fglpuerto', camPage: 'fuengirola-puerto' },
    // The "benclub" cam hangs at Puerto Marina and looks east over Playa Fuente de la Salud (meteo365). The id stays
    // 'malapesquera' because favourites and alerts are saved under it in Supabase; /fuente-de-la-salud also works.
    'malapesquera': { lat: 36.601, lon: -4.508, facing: 114, name: 'Playa Fuente de la Salud', loc: 'Benalmádena', cam: 'webcam2/benclub', camPage: 'benalmadena-club' },
    'malagueta':    { lat: 36.714, lon: -4.411, facing: 137, name: 'Playa La Malagueta', loc: 'Málaga Capital', cam: 'webcam/playa', camPage: 'malaga' },
    'bajondillo':   { lat: 36.620, lon: -4.496, facing: 119, name: 'Bajondillo — Torremolinos', loc: 'Torremolinos', cam: 'webcam/torreplaya', camPage: 'torremolinos-bajondillo' },
    'nerja':        { lat: 36.743, lon: -3.878, facing: 157, name: 'Nerja — Playa de Burriana', loc: 'Nerja', cam: 'webcam2/nerjaplaya', camPage: 'nerja-playa' },
    'alamos':       { lat: 36.646, lon: -4.476, facing: 149, name: 'Los Álamos — Torremolinos', loc: 'Torremolinos', extLink: 'https://laplayasurfhouse.com/spotfav/' },
    'cabopino':     { lat: 36.486, lon: -4.744, facing: 181, name: 'Cabopino — Marbella', loc: 'Marbella', extLink: 'https://laplayasurfhouse.com/spotfav/' },
    'benajarafe':   { lat: 36.743, lon: -4.121, facing: 169, name: 'Benajarafe — Vélez-Málaga', loc: 'Vélez-Málaga' },
    // Andalucía Live's cam; its photos reach us through Windy (camLink = the provider's own page, for the button)
    'torredelmar':  { lat: 36.738, lon: -4.094, facing: 131, name: 'Torre del Mar — Vélez-Málaga', loc: 'Vélez-Málaga', cam: 'windy:1689408949',
                      camLink: 'https://www.andalucialive.com/2023/01/12/webcam-velez-malaga-1-malaga-playa-torre-del-mar/', camBy: 'Andalucía Live' },

    // ── Popular spots near Málaga (near: true): their own section in Webcams/Forecast, and "Solo en Málaga" in the
    // spot filter leaves them out. cam 'external' = a cam whose live video plays on its owner's site (camLink); camSnap
    // = its latest snapshot through our /proxy (without it the card is just a button to camLink).
    'elpalmar':     { lat: 36.2253, lon: -6.0662, facing: 240, name: 'El Palmar — Vejer', loc: 'Vejer de la Frontera (Cádiz)', near: true,
                      cam: 'external', camSnap: '/proxy/9pies/snap/elpalmar.jpg',
                      camLink: 'https://www.escueladesurf9pies.com/es/webcam-el-palmar', camBy: '9 Pies Escuela de Surf' },
    'puntadelrio':  { lat: 36.7219, lon: -3.5710, facing: 206, name: 'Punta del Río — Salobreña', loc: 'Salobreña (Granada)', near: true }
};

// Other URLs for a spot (path -> id), e.g. /fuente-de-la-salud for the spot saved as 'malapesquera'
const SPOT_ALIASES = { 'fuente-de-la-salud': 'malapesquera', 'torre-del-mar': 'torredelmar', 'el-palmar': 'elpalmar', 'punta-del-rio': 'puntadelrio' };

// Speed in km/h, dir = where the wind blows FROM. `facing` = compass direction the beach looks out to sea
// (SPOTS[id].facing). Wind from the land (within 45° of facing + 180) is off-shore; from the sea, on-shore.
function getWindStatus(speed, dir, facing = 180) {
    if (speed < 7) return 'Glassy';
    const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
    if (diff(dir, (facing + 180) % 360) <= 45) return 'Off-shore';
    if (diff(dir, facing) <= 45) return 'On-shore';
    return 'Cross-shore';
}

// ── Wave data recipe ─────────────────────────────────────────────────────────────────────────────
// Validated hour by hour against the Puertos del Estado Málaga buoy (station 1514, 30 days, Sep–Oct 2026):
//  · height = mean of Météo-France MFWAM and DWD EWAM (mean abs. error 0.10 m vs 0.12 m with MFWAM alone).
//    EWAM only runs ~3 days ahead; after that MFWAM is shifted by its difference to the mean over the last
//    6 shared hours, so the series continues without a step.
//  · period = mean of MFWAM mean period and ECMWF peak period (error vs the buoy's peak period 0.49 s vs 0.61 s).
//  · energy_period = MFWAM mean period: with the blended height it gives the lowest energy error.
const MARINE_MODELS = 'meteofrance_wave,ewam,ecmwf_wam025';

// Open-Meteo marine URL for one or more points (comma-separated lats/lons). `daily` adds daily variables.
function marineUrl(lats, lons, forecastDays, daily = '') {
    return `https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lons}` +
        `&hourly=wave_height,wave_period,wave_peak_period${daily ? '&daily=' + daily : ''}` +
        `&models=${MARINE_MODELS}&timezone=auto&forecast_days=${forecastDays}`;
}

// Turns one location of a multi-model response into the single-model shape the pages use:
// hourly.{time, wave_height, wave_period, energy_period} and daily.{time, wave_direction_dominant, wave_period_max}.
function blendMarine(loc) {
    const h = loc.hourly;
    const col = (name, model) => h[`${name}_${model}`] || h[name] || [];
    const mf = col('wave_height', 'meteofrance_wave'), ew = col('wave_height', 'ewam');
    const mfT = col('wave_period', 'meteofrance_wave'), ewT = col('wave_period', 'ewam');
    const ecTp = col('wave_peak_period', 'ecmwf_wam025');
    const both = h.time.map((_, i) => mf[i] != null && ew[i] != null);
    const shared = h.time.map((_, i) => i).filter(i => both[i]).slice(-6);
    const offset = shared.length ? shared.reduce((s, i) => s + (ew[i] - mf[i]) / 2, 0) / shared.length : 0;
    const avg = (a, b) => (a != null && b != null ? (a + b) / 2 : a ?? b ?? null);
    const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

    const wave_height = h.time.map((_, i) =>
        round(both[i] ? (mf[i] + ew[i]) / 2 : mf[i] != null ? Math.max(0, mf[i] + offset) : ew[i] ?? null, 2));
    const wave_period = h.time.map((_, i) => round(avg(mfT[i], ecTp[i]), 1));
    const energy_period = h.time.map((_, i) => mfT[i] ?? ewT[i] ?? wave_period[i]);

    const out = { ...loc, hourly: { time: h.time, wave_height, wave_period, energy_period } };
    if (loc.daily) {
        const d = loc.daily;
        const dir = d.wave_direction_dominant_meteofrance_wave || d.wave_direction_dominant_ewam || d.wave_direction_dominant_ecmwf_wam025 || d.wave_direction_dominant || [];
        const maxPeriod = {};
        h.time.forEach((tm, i) => {
            const day = tm.slice(0, 10), p = wave_period[i];
            if (p != null && (maxPeriod[day] == null || p > maxPeriod[day])) maxPeriod[day] = p;
        });
        out.daily = { time: d.time, wave_direction_dominant: dir, wave_period_max: d.time.map(day => maxPeriod[day] ?? null) };
    }
    return out;
}

// Fetches and blends marine data for several points; always returns an array (one entry per point).
async function fetchMarine(points, forecastDays, daily = '') {
    const lats = points.map(p => p.lat).join(','), lons = points.map(p => p.lon).join(',');
    const res = await fetch(marineUrl(lats, lons, forecastDays, daily));
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(`Marine HTTP ${res.status}${data && data.reason ? ': ' + data.reason : ''}`);
    return (Array.isArray(data) ? data : [data]).map(blendMarine);
}

// Wave energy in kJ per metre of wave crest over one wavelength (deep water): E = ρ·g²·H²·T² / (16π) ≈ 1.96·H²·T².
// H = wave height (m), T = period (s). Same order of magnitude as the "energy" figure on surf forecast sites.
function waveEnergy(height, period) {
    if (height == null || period == null) return null;
    return 1025 * 9.81 * 9.81 * height * height * period * period / (16 * Math.PI) / 1000;
}

function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
}

// Monochrome line icons that take the text colour (black or white). The site uses these, never emojis.
const ICON_PATHS = {
    wave: '<path d="M2 10c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>',
    wind: '<path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/><path d="M17.7 7.7A2.5 2.5 0 1 1 19.5 12H2"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'
};
function monoIcon(name, size = 14, filled = false) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:inline-block;vertical-align:-0.15em;flex-shrink:0;">${ICON_PATHS[name]}</svg>`;
}

// Days shown in the forecast, the wave calendar and the tools. Météo-France MFWAM (the wave model every day relies
// on) covers about 10 days, so 9 keeps every day complete.
const FORECAST_DAYS = 9;

// ── Webcams ──────────────────────────────────────────────────────────────────────────────────────
// meteo365 only plays its live cams on its own site (since Oct 2026 the video needs a pass that meteo365.es gives its
// visitors), so here each cam shows its latest snapshot and the play button opens the live cam on meteo365.es in a
// new tab.
let camStyled = false;

function addCamStyles() {
    if (camStyled) return;
    camStyled = true;
    const style = document.createElement('style');
    style.textContent = `
        .cam-play { position: absolute; inset: 0; z-index: 11; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: linear-gradient(160deg, rgba(11,83,148,0.85), rgba(0,0,0,0.85)); color: #fff; text-decoration: none; cursor: pointer; font: 700 15px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
        .cam-play:focus-visible { outline: 3px solid #fff; outline-offset: -6px; }
        .cam-play-icon { width: 64px; height: 64px; border-radius: 50%; background: rgba(255,255,255,0.95); color: #111; display: flex; align-items: center; justify-content: center; padding-left: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); transition: transform 0.15s; text-shadow: none; }
        .cam-play:hover .cam-play-icon { transform: scale(1.08); }
        .cam-play-text { max-width: 80%; display: flex; align-items: center; gap: 6px; }
        .cam-poster { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; display: block; z-index: 1; }
        .cam-play.has-poster { background: linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.45)); }
        .cam-play-note { display: none; font-size: 12px; font-weight: 600; opacity: 0.9; }
        .cam-play.has-poster .cam-play-note, .cam-play.no-poster .cam-play-note { display: block; }
        .cam-credit { position: absolute; right: 8px; bottom: 8px; z-index: 12; background: rgba(0,0,0,0.6); color: #fff; font: 600 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 4px 8px; border-radius: 10px; text-decoration: none; }
        .cam-credit:hover { background: rgba(0,0,0,0.85); }`;
    document.head.appendChild(style);
}

// Where a spot's cam picture comes from and where its button goes.
//  · meteo365: latest snapshot through our /proxy; the button opens the live video on meteo365.es
//  · Windy: latest photo straight from Windy (they take a photo every few minutes); the button opens the cam on
//    Windy.com (photos + timelapse). Windy's terms ask for a visible credit and a link to the cam, hence `credit`.
function camInfo(spot) {
    //  · external: latest snapshot through our /proxy if we have one (camSnap); the button opens the live cam on the
    //    owner's site
    if (spot.cam === 'external') {
        return { snap: spot.camSnap || null, page: spot.camLink, label: 'Ver en directo', badge: 'EN DIRECTO',
            title: `Ver la webcam en directo en la web de ${spot.camBy} (se abre en una pestaña nueva)`,
            note: spot.camSnap ? null : `En la web de ${spot.camBy}`, credit: `Webcam: ${spot.camBy}`, creditLink: spot.camLink };
    }
    if (spot.cam.startsWith('windy:')) {
        const id = spot.cam.slice(6);
        const windyPage = `https://www.windy.com/webcams/${id}`;
        // The button goes to the cam's provider when we know it (camLink); the credit always links to Windy
        return { snap: `https://images-webcams.windy.com/${id.slice(-2)}/${id}/current/full/${id}.jpg`,
            page: spot.camLink || windyPage, label: 'Ver webcam', badge: 'ÚLTIMA IMAGEN',
            title: `Ver la webcam en ${spot.camBy || 'Windy.com'} (se abre en una pestaña nueva)`,
            credit: spot.camBy ? `Webcam: ${spot.camBy} · Windy.com` : 'Webcam: Windy.com', creditLink: windyPage };
    }
    const [host, name] = spot.cam.split('/');
    return { snap: `/proxy/${host}/snap/${name}.webp`, page: `https://meteo365.es/es/livecams/${spot.camPage}.php`,
        label: 'Ver en directo', badge: 'EN DIRECTO', title: 'Ver la webcam en directo en meteo365.es (se abre en una pestaña nueva)', credit: null };
}

// "Webcam: <owner>" link in the corner of a cam box, when the cam belongs to someone else
function addCredit(wrapper, info) {
    if (!info.credit) return;
    const credit = document.createElement('a');
    credit.className = 'cam-credit';
    credit.href = info.creditLink || info.page;
    credit.target = '_blank';
    credit.rel = 'noopener';
    credit.textContent = info.credit;
    wrapper.appendChild(credit);
}

// Fills a 16:9 cam box with the cam's latest picture and a button to the cam's own page (see camInfo)
function attachCam(wrapper, spot) {
    addCamStyles();
    wrapper.style.position = 'relative';
    const info = camInfo(spot);
    const snapUrl = info.snap;

    const play = document.createElement('a');
    play.className = 'cam-play';
    play.href = info.page;
    play.target = '_blank';
    play.rel = 'noopener';
    play.title = info.title;
    play.innerHTML = `<span class="cam-play-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span>`
        + `<span class="cam-play-text">${info.label}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></span>`
        + `<span class="cam-play-note"></span>`;
    play.querySelector('.cam-play-note').textContent = info.note || 'Imagen de hace unos minutos';
    wrapper.appendChild(play);
    if (!snapUrl) {
        // No picture to show (external cam): just the button, with its note always visible, and the credit
        play.classList.add('no-poster');
        addCredit(wrapper, info);
        return;
    }

    // Recent snapshot behind the play button (meteo365 refreshes it every minute; our proxy and the CDN keep it up to
    // 15 min), so visitors see what the beach looks like. Lazy: only loaded near the screen.
    const poster = document.createElement('img');
    poster.className = 'cam-poster';
    poster.alt = '';
    poster.loading = 'lazy';
    poster.decoding = 'async';
    poster.addEventListener('load', () => play.classList.add('has-poster'));
    poster.addEventListener('error', () => { poster.remove(); play.classList.remove('has-poster'); });
    poster.src = snapUrl;
    wrapper.insertBefore(poster, play);
    addCredit(wrapper, info);

    // Coming back to the page after a while (e.g. from the live cam's tab) shows a fresh snapshot. ?t= changes every
    // 10 min and is the same for every visitor, so the CDN still answers most of them from its cache.
    let shownAt = Date.now();
    document.addEventListener('visibilitychange', () => {
        if (document.hidden || !poster.isConnected || Date.now() - shownAt < 10 * 60 * 1000) return;
        shownAt = Date.now();
        poster.src = snapUrl + '?t=' + Math.floor(shownAt / 600000);
    });
}

// ── Cookie notice (every page that loads common.js) ──
// The site only stores strictly necessary data (the login session) and preferences the user chooses, which the AEPD
// cookie guide exempts from consent, so this is an information notice with a single "Entendido" button, not a consent
// banner. If analytics or advertising cookies are ever added, they need real consent (accept/reject) BEFORE loading.
function showCookieNotice() {
    try { if (localStorage.getItem('cookiesAccepted')) return; } catch (e) { return; }
    const box = document.createElement('div');
    box.className = 'cookie-notice';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Aviso de cookies');
    box.innerHTML = `
        <p>Solo guardamos en tu navegador lo imprescindible para que la web funcione (tu sesión) y las preferencias que eliges.
        <strong>No usamos cookies de publicidad ni de analítica.</strong> <a href="/legal.html#cookies">Más información</a></p>
        <button type="button">Entendido</button>`;
    const style = document.createElement('style');
    style.textContent = `
        .cookie-notice { position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 10001; max-width: 760px; margin: 0 auto; display: flex; align-items: center; gap: 14px; background: #111; color: #fff; padding: 14px 16px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
        .cookie-notice p { margin: 0; flex: 1; }
        .cookie-notice a { color: #fff; text-decoration: underline; }
        .cookie-notice button { background: #fff; color: #111; border: none; border-radius: 20px; padding: 8px 18px; font: inherit; font-weight: 700; cursor: pointer; flex-shrink: 0; }
        @media (max-width: 560px) { .cookie-notice { flex-direction: column; align-items: stretch; text-align: center; } }`;
    document.head.appendChild(style);
    box.querySelector('button').addEventListener('click', () => {
        try { localStorage.setItem('cookiesAccepted', 'true'); } catch (e) {}
        box.remove();
    });
    document.body.appendChild(box);
}

onReady(() => {
    showCookieNotice();

    // Clicks that used to be inline onclick="" attributes (the Content-Security-Policy forbids inline code):
    // elements with data-href (the header logo) navigate, and the login popup's × closes it
    document.querySelectorAll('[data-href]').forEach(el => el.addEventListener('click', () => { window.location.href = el.dataset.href; }));
    document.querySelectorAll('.auth-popup-close').forEach(btn => btn.addEventListener('click', () => {
        document.getElementById('auth-popup').style.display = 'none';
    }));

    // Header search
    const searchInput = document.getElementById('spot-search');
    const searchResults = document.getElementById('search-results');
    if (searchInput && searchResults) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                searchResults.style.display = 'none';
                return;
            }
            const matches = Object.entries(SPOTS).filter(([, s]) => s.name.toLowerCase().includes(query));
            searchResults.innerHTML = matches.length
                ? matches.map(([id, s]) =>
                    `<a href="/${id}" style="display:block;padding:10px 15px;color:var(--color-black);text-decoration:none;border-bottom:1px solid var(--color-border);font-size:0.9rem;">${s.name}</a>`
                ).join('')
                : '<div style="padding:10px 15px;color:#888;font-size:0.9rem;">' + 'No hay resultados' + '</div>';
            searchResults.style.display = 'block';
        });
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });
    }

    // Login popup after 3 s for logged-out visitors, once per session
    const authPopup = document.getElementById('auth-popup');
    if (authPopup && window.supabaseClient && !sessionStorage.getItem('authPopupShown')) {
        window.supabaseClient.auth.getSession().then(({ data }) => {
            if (data.session) return;
            setTimeout(() => {
                authPopup.style.display = 'flex';
                sessionStorage.setItem('authPopupShown', 'true');
            }, 3000);
        });
    }
});
