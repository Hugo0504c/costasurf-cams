// Shared by every page: spot list, wind rule, header search, live-cam player and the login popup.

// facing = compass direction the beach looks out to sea, from the OpenStreetMap coastline (used for off/on-shore wind)
const SPOTS = {
    'misericordia': { lat: 36.697, lon: -4.444, facing: 121, name: 'Playa La Misericordia', loc: 'Málaga Capital', video: 'webcam2/misericordia.m3u8' },
    'fuengirola':   { lat: 36.540, lon: -4.620, facing: 116, name: 'Fuengirola — Los Boliches', loc: 'Fuengirola', video: 'webcam/fglpuerto.m3u8' },
    // The "benclub" cam hangs at Puerto Marina and looks east over Playa Fuente de la Salud (meteo365). The id stays
    // 'malapesquera' because favourites and alerts are saved under it in Supabase; /fuente-de-la-salud also works.
    'malapesquera': { lat: 36.601, lon: -4.508, facing: 114, name: 'Playa Fuente de la Salud', loc: 'Benalmádena', video: 'webcam2/benclub.m3u8' },
    'malagueta':    { lat: 36.714, lon: -4.411, facing: 137, name: 'Playa La Malagueta', loc: 'Málaga Capital', video: 'webcam/playa.m3u8' },
    'bajondillo':   { lat: 36.620, lon: -4.496, facing: 119, name: 'Bajondillo — Torremolinos', loc: 'Torremolinos', video: 'webcam/torreplaya.m3u8' },
    'nerja':        { lat: 36.743, lon: -3.878, facing: 157, name: 'Nerja — Playa de Burriana', loc: 'Nerja', video: 'webcam2/nerjaplaya.m3u8' },
    'alamos':       { lat: 36.646, lon: -4.476, facing: 149, name: 'Los Álamos — Torremolinos', loc: 'Torremolinos', extLink: 'https://laplayasurfhouse.com/spotfav/' },
    'cabopino':     { lat: 36.486, lon: -4.744, facing: 181, name: 'Cabopino — Marbella', loc: 'Marbella', extLink: 'https://laplayasurfhouse.com/spotfav/' },
    'benajarafe':   { lat: 36.743, lon: -4.121, facing: 169, name: 'Benajarafe — Vélez-Málaga', loc: 'Vélez-Málaga' }
};

// Other URLs for a spot (path -> id), e.g. /fuente-de-la-salud for the spot saved as 'malapesquera'
const SPOT_ALIASES = { 'fuente-de-la-salud': 'malapesquera' };

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

// hls.js (~600 KB) is only downloaded when a cam is about to play, and never on browsers that play HLS natively without MSE (iPhone).
let hlsPromise = null;
function loadHls() {
    if (!hlsPromise) {
        hlsPromise = new Promise(resolve => {
            const s = document.createElement('script');
            // Exact version + integrity hash: if the CDN copy were ever tampered with, the browser refuses to run it
            s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.7.3/dist/hls.min.js';
            s.integrity = 'sha384-cciJ0zi8d1uMKC2zJd7jvPY4HQt7W4ByUI/FlMkltvBi31aW61rcpVBhpmW8/NwX';
            s.crossOrigin = 'anonymous';
            s.onload = () => resolve(window.Hls);
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        });
    }
    return hlsPromise;
}

// ── Expanded cam with zoom ───────────────────────────────────────────────────────────────────────
// The expand button opens a cam full screen (Fullscreen API, or a fixed overlay where elements can't go full screen,
// e.g. iPhone). There it can be zoomed (wheel, pinch, double click/tap, +/− buttons or keys) and panned by dragging,
// to check whether there are surfers in the water and how big the sets are.
const CAM_ZOOM_MAX = 6;
let camZoomStyled = false;

function addCamZoomStyles() {
    if (camZoomStyled) return;
    camZoomStyled = true;
    const style = document.createElement('style');
    style.textContent = `
        .cam-expand, .cam-close { position: absolute; top: 42px; right: 10px; z-index: 12; width: 38px; height: 38px; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
        .cam-expand:hover, .cam-close:hover { background: rgba(0,0,0,0.85); }
        .cam-close, .cam-zoom-bar, .cam-zoom-hint { display: none; }
        .cam-zoom-bar { position: absolute; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 12; gap: 2px; align-items: center; background: rgba(0,0,0,0.7); border-radius: 30px; padding: 5px; }
        .cam-zoom-bar button { min-width: 42px; height: 42px; border-radius: 21px; border: none; background: transparent; color: #fff; font: 700 22px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; cursor: pointer; padding: 0 10px; }
        .cam-zoom-bar button:hover:not(:disabled) { background: rgba(255,255,255,0.15); }
        .cam-zoom-bar button:disabled { opacity: 0.35; cursor: default; }
        .cam-zoom-bar .cam-zoom-reset { font-size: 13px; padding: 0 14px; }
        .cam-zoom-level { color: #fff; font: 700 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; min-width: 46px; text-align: center; font-variant-numeric: tabular-nums; }
        .cam-zoom-hint { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); z-index: 12; max-width: calc(100% - 32px); background: rgba(0,0,0,0.7); color: #fff; padding: 8px 14px; border-radius: 20px; font: 600 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; text-align: center; pointer-events: none; transition: opacity 0.5s; }
        .cam-expanded { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; height: 100dvh !important; max-width: none !important; margin: 0 !important; padding: 0 !important; aspect-ratio: auto !important; border-radius: 0 !important; z-index: 20000 !important; background: #000 !important; overflow: hidden !important; display: block !important; touch-action: none; user-select: none; -webkit-user-select: none; }
        .cam-expanded video { width: 100% !important; height: 100% !important; max-width: none !important; object-fit: contain !important; transform-origin: 0 0; }
        .cam-expanded .cam-expand { display: none; }
        .cam-expanded .cam-close, .cam-expanded .cam-zoom-bar { display: flex; }
        .cam-expanded .cam-zoom-hint { display: block; }
        html.cam-zoom-open, html.cam-zoom-open body { overflow: hidden; }
        .cam-play { position: absolute; inset: 0; z-index: 11; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border: none; padding: 0; margin: 0; width: 100%; height: 100%; background: linear-gradient(160deg, rgba(11,83,148,0.85), rgba(0,0,0,0.85)); color: #fff; cursor: pointer; font: 700 15px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; text-shadow: 0 1px 3px rgba(0,0,0,0.5); }
        .cam-play[hidden] { display: none; }
        .cam-play-icon { width: 64px; height: 64px; border-radius: 50%; background: rgba(255,255,255,0.95); color: #111; display: flex; align-items: center; justify-content: center; padding-left: 4px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); transition: transform 0.15s; text-shadow: none; }
        .cam-play:hover .cam-play-icon { transform: scale(1.08); }
        .cam-play-text { max-width: 80%; text-align: center; }
        .cam-poster { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; display: block; z-index: 1; }
        .cam-poster[hidden] { display: none; }
        .cam-expanded .cam-poster { object-fit: contain; }
        .cam-play.has-poster { background: linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.45)); }
        .cam-play-note { display: none; font-size: 12px; font-weight: 600; opacity: 0.9; }
        .cam-play.has-poster .cam-play-note { display: block; }`;
    document.head.appendChild(style);
}

function enableCamZoom(video, wrapper) {
    addCamZoomStyles();
    // The expand button replaces the browser's own full screen, which has no zoom
    video.setAttribute('controlslist', 'nofullscreen');

    const icon = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'cam-expand';
    expandBtn.title = 'Ampliar y hacer zoom';
    expandBtn.setAttribute('aria-label', expandBtn.title);
    expandBtn.innerHTML = icon('<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cam-close';
    closeBtn.title = 'Cerrar';
    closeBtn.setAttribute('aria-label', closeBtn.title);
    closeBtn.innerHTML = icon('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>');
    const bar = document.createElement('div');
    bar.className = 'cam-zoom-bar';
    bar.innerHTML = `
        <button type="button" class="cam-zoom-out" aria-label="Alejar">−</button>
        <span class="cam-zoom-level" aria-live="polite">1×</span>
        <button type="button" class="cam-zoom-in" aria-label="Acercar">+</button>
        <button type="button" class="cam-zoom-reset">Restablecer</button>`;
    const hint = document.createElement('div');
    hint.className = 'cam-zoom-hint';
    hint.textContent = window.matchMedia('(pointer: coarse)').matches
        ? 'Pellizca o toca dos veces para hacer zoom · arrastra para moverte'
        : 'Rueda del ratón o doble clic para hacer zoom · arrastra para moverte';
    wrapper.append(expandBtn, closeBtn, bar, hint);
    const level = bar.querySelector('.cam-zoom-level');
    const outBtn = bar.querySelector('.cam-zoom-out');
    const inBtn = bar.querySelector('.cam-zoom-in');

    let expanded = false, scale = 1, x = 0, y = 0, hintTimer = null;

    // Where the picture really is inside the element (object-fit: contain leaves black bars)
    function contentBox(W, H) {
        const ar = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        const cw = Math.min(W, H * ar), ch = cw / ar;
        return { ox: (W - cw) / 2, oy: (H - ch) / 2, cw, ch };
    }
    // Keeps the picture filling the screen while zoomed (centred when it is smaller than the screen)
    function clampAxis(pos, size, offset, length) {
        const len = length * scale;
        if (len <= size) return (size - len) / 2 - offset * scale;
        return Math.min(-offset * scale, Math.max(size - (offset + length) * scale, pos));
    }
    function apply() {
        const { width: W, height: H } = wrapper.getBoundingClientRect();
        const c = contentBox(W, H);
        x = clampAxis(x, W, c.ox, c.cw);
        y = clampAxis(y, H, c.oy, c.ch);
        video.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        video.style.cursor = scale > 1 ? 'grab' : '';
        level.textContent = `${scale < 1.95 ? scale.toFixed(1) : Math.round(scale)}×`;
        outBtn.disabled = scale <= 1;
        inBtn.disabled = scale >= CAM_ZOOM_MAX;
    }
    // Zooms keeping the point (px, py) of the screen still
    function zoomAt(newScale, px, py) {
        const s = Math.min(CAM_ZOOM_MAX, Math.max(1, newScale));
        x = px - (px - x) * (s / scale);
        y = py - (py - y) * (s / scale);
        scale = s;
        apply();
    }
    const center = () => { const r = wrapper.getBoundingClientRect(); return [r.width / 2, r.height / 2]; };
    const local = e => { const r = wrapper.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    function open() {
        if (expanded) return;
        expanded = true;
        scale = 1; x = 0; y = 0;
        wrapper.classList.add('cam-expanded');
        document.documentElement.classList.add('cam-zoom-open');
        video.controls = false; // the native controls would take the drag and pinch gestures
        const fs = wrapper.requestFullscreen || wrapper.webkitRequestFullscreen;
        if (fs) Promise.resolve(fs.call(wrapper)).catch(() => {});
        if (video._camPlay) video._camPlay(); // expanding a cam means watching it
        requestAnimationFrame(apply);
        hint.style.opacity = '1';
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => { hint.style.opacity = '0'; }, 3500);
        closeBtn.focus();
    }
    function close() {
        if (!expanded) return;
        expanded = false;
        const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (fsEl === wrapper) Promise.resolve((document.exitFullscreen || document.webkitExitFullscreen).call(document)).catch(() => {});
        wrapper.classList.remove('cam-expanded');
        document.documentElement.classList.remove('cam-zoom-open');
        video.style.transform = '';
        video.style.cursor = '';
        video.controls = video.dataset.live === '1'; // controls only while the stream runs
        expandBtn.focus();
    }

    expandBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    bar.querySelector('.cam-zoom-in').addEventListener('click', () => zoomAt(scale * 1.5, ...center()));
    outBtn.addEventListener('click', () => zoomAt(scale / 1.5, ...center()));
    bar.querySelector('.cam-zoom-reset').addEventListener('click', () => { scale = 1; apply(); });
    // Leaving full screen with Esc or the system gesture closes the viewer too
    const onFsChange = () => { if (expanded && !(document.fullscreenElement || document.webkitFullscreenElement)) close(); };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('resize', () => { if (expanded) apply(); });

    document.addEventListener('keydown', e => {
        if (!expanded) return;
        const step = 60;
        const keys = {
            Escape: close,
            '+': () => zoomAt(scale * 1.5, ...center()), '=': () => zoomAt(scale * 1.5, ...center()),
            '-': () => zoomAt(scale / 1.5, ...center()), '0': () => { scale = 1; apply(); },
            ArrowLeft: () => { x += step; apply(); }, ArrowRight: () => { x -= step; apply(); },
            ArrowUp: () => { y += step; apply(); }, ArrowDown: () => { y -= step; apply(); }
        };
        if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
    });

    wrapper.addEventListener('wheel', e => {
        if (!expanded) return;
        e.preventDefault();
        zoomAt(scale * Math.exp(-e.deltaY * 0.002), ...local(e));
    }, { passive: false });

    // Double click (mouse) zooms in on that point, or back out; outside the viewer it opens it
    let lastPointerType = 'mouse';
    video.addEventListener('dblclick', e => {
        if (lastPointerType === 'touch') return;
        e.preventDefault();
        if (!expanded) { open(); return; }
        if (scale > 1.5) { scale = 1; apply(); } else zoomAt(2.5, ...local(e));
    });

    // Drag to pan, two fingers to pinch, double tap to zoom
    const pointers = new Map();
    let pinch = null, lastTap = null, moved = false;
    wrapper.addEventListener('pointerdown', e => {
        lastPointerType = e.pointerType;
        if (!expanded || e.target.closest('button')) return;
        wrapper.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, local(e));
        moved = false;
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinch = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        }
        if (scale > 1) video.style.cursor = 'grabbing';
    });
    wrapper.addEventListener('pointermove', e => {
        if (!expanded || !pointers.has(e.pointerId)) return;
        const prev = pointers.get(e.pointerId);
        const cur = local(e);
        pointers.set(e.pointerId, cur);
        if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > 2) moved = true;
        if (pointers.size === 1 && scale > 1) {
            x += cur[0] - prev[0];
            y += cur[1] - prev[1];
            apply();
        } else if (pointers.size === 2 && pinch) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
            const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            x += mid[0] - pinch.mid[0];
            y += mid[1] - pinch.mid[1];
            zoomAt(scale * dist / pinch.dist, ...mid);
            pinch = { dist, mid };
        }
    });
    const endPointer = e => {
        if (!pointers.has(e.pointerId)) return;
        const pos = pointers.get(e.pointerId);
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (scale > 1) video.style.cursor = 'grab';
        if (e.type !== 'pointerup' || e.pointerType !== 'touch' || moved || pointers.size) return;
        const now = Date.now();
        if (lastTap && now - lastTap.time < 300 && Math.hypot(pos[0] - lastTap.pos[0], pos[1] - lastTap.pos[1]) < 30) {
            if (scale > 1.5) { scale = 1; apply(); } else zoomAt(2.5, ...pos);
            lastTap = null;
        } else {
            lastTap = { time: now, pos };
        }
    };
    wrapper.addEventListener('pointerup', endPointer);
    wrapper.addEventListener('pointercancel', endPointer);
}

// ── Live cams ────────────────────────────────────────────────────────────────────────────────────
// Every second of video goes through our /proxy (Netlify bandwidth, i.e. credits: ~0.3 GB per cam-hour), so a cam
// only streams after the visitor presses play, one cam at a time, and only while it is on screen, the tab is visible
// and someone is still around: after CAM_IDLE_MS without any activity it stops and asks before going on.
const CAM_IDLE_MS = 4 * 60 * 1000;
let activeCam = null;            // the cam that is playing: { release(message) }
let lastActivity = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(type =>
    window.addEventListener(type, () => { lastActivity = Date.now(); }, { passive: true, capture: true }));

function attachStream(video, path) {
    const src = '/proxy/' + path;
    const wrapper = video.parentElement;
    wrapper.style.position = 'relative';
    const loader = document.createElement('div');
    loader.className = 'cam-loader';
    loader.innerHTML = '<div class="spinner"></div>';
    loader.style.display = 'none';
    wrapper.appendChild(loader);
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'cam-play';
    playBtn.innerHTML = `<span class="cam-play-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span><span class="cam-play-text"></span>`;
    const playText = playBtn.querySelector('.cam-play-text');
    playText.textContent = 'Ver en directo';
    const playNote = document.createElement('span');
    playNote.className = 'cam-play-note';
    playNote.textContent = 'Imagen de hace unos minutos';
    playBtn.appendChild(playNote);
    wrapper.appendChild(playBtn);

    // Recent snapshot behind the play button (meteo365 refreshes it every minute; our proxy and the CDN keep it up to
    // 15 min), so visitors see what the beach looks like without streaming anything. Lazy: only near the screen.
    const poster = document.createElement('img');
    poster.className = 'cam-poster';
    poster.alt = '';
    poster.loading = 'lazy';
    poster.decoding = 'async';
    poster.addEventListener('load', () => playBtn.classList.add('has-poster'));
    poster.addEventListener('error', () => poster.remove());
    poster.src = '/proxy/' + path.replace(/([^/]+)\.m3u8$/, 'snap/$1.webp');
    wrapper.insertBefore(poster, loader);
    video.addEventListener('playing', () => { poster.hidden = true; }); // the live picture takes over
    video.controls = false; // nothing to control until it plays
    enableCamZoom(video, wrapper);
    const showLoader = on => { loader.style.display = on ? 'flex' : 'none'; };
    video.addEventListener('playing', () => showLoader(false));
    video.addEventListener('canplay', () => showLoader(false));
    video.addEventListener('waiting', () => showLoader(true));

    const useMse = !!(window.MediaSource || window.ManagedMediaSource);
    let hls = null, running = false, wanted = false, visible = false, idleTimer = null;

    async function start() {
        running = true;
        video.dataset.live = '1';
        video.controls = !wrapper.classList.contains('cam-expanded'); // the zoom viewer uses its own controls
        showLoader(true);
        const Hls = useMse ? await loadHls() : null;
        if (!running) return;
        if (Hls && Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
        }
        video.play().catch(() => {});
    }

    function stop() {
        running = false;
        delete video.dataset.live;
        video.pause();
        if (hls) { hls.destroy(); hls = null; }
        if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
        video.controls = false;
        poster.hidden = false;
        showLoader(false);
    }

    // Streams exactly when wanted + on screen + tab visible
    function update() {
        // Leaving the cam (scrolled away, Webcams tab switched to Forecast, another browser tab) pauses it for good:
        // it shows the snapshot and "Ver en directo" again instead of restarting on its own when it comes back
        if (wanted && (!visible || document.hidden)) {
            cam.release('Ver en directo');
            return;
        }
        const shouldRun = wanted && visible && !document.hidden;
        if (shouldRun && !running) start();
        else if (!shouldRun && running) stop();
        playBtn.hidden = wanted;
    }

    // A fresh snapshot each time the cam goes back to its preview (the proxy keeps each one up to 15 min)
    const refreshPoster = () => {
        if (!poster.isConnected) return;
        poster.src = '/proxy/' + path.replace(/([^/]+)\.m3u8$/, 'snap/$1.webp') + '?t=' + Math.floor(Date.now() / 600000);
    };

    const cam = {
        play() {
            if (activeCam && activeCam !== cam) activeCam.release('Ver en directo');
            activeCam = cam;
            wanted = true;
            lastActivity = Date.now();
            clearInterval(idleTimer);
            idleTimer = setInterval(() => {
                if (Date.now() - lastActivity > CAM_IDLE_MS) cam.release('¿Sigues ahí? Pulsa para seguir viendo');
            }, 15000);
            update();
        },
        release(message) {
            wanted = false;
            clearInterval(idleTimer);
            if (activeCam === cam) activeCam = null;
            playText.textContent = message;
            if (running) refreshPoster();
            update();
        }
    };
    video._camPlay = cam.play; // the zoom viewer starts the cam when it opens
    playBtn.addEventListener('click', cam.play);

    const observer = new IntersectionObserver(entries => {
        visible = entries[entries.length - 1].isIntersecting;
        update();
    }, { threshold: 0.2 });
    // The wrapper, not the video: a zoomed-in video is mostly outside the screen and would count as hidden
    observer.observe(wrapper);
    document.addEventListener('visibilitychange', update);
}

onReady(() => {
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
