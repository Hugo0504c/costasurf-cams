// Script of index.html. It is an external file (not inline) so the Content-Security-Policy can forbid inline scripts.
// Loaded without defer at the end of the page, so it runs at the same moment the inline script used to.

// ── Navigation ─────────────────────────────────────────────────
function switchTab(tabId) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    ['camaras','forecast'].forEach(id => {
        document.getElementById('view-' + id).classList.remove('active');
        document.getElementById('tab-' + id).classList.remove('active');
    });
    document.getElementById('view-' + tabId).classList.add('active');
    document.getElementById('tab-' + tabId).classList.add('active');
}

// ── Webcams: latest snapshot + link to the live cam ────────────
document.querySelectorAll('#view-camaras [data-cam]').forEach(box => attachCam(box, SPOTS[box.dataset.cam]));

// Logged in: the cams of the user's favourite spots first, tagged "Favorito" (the rest keep their order).
// Supabase loads with `defer`, so it is ready once the DOM is.
onReady(async () => {
    if (!window.supabaseClient) return;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) return;
    const { data, error } = await window.supabaseClient.from('favorites').select('spot_id').eq('user_id', session.user.id);
    if (error || !data || !data.length) return;
    const favs = new Set(data.map(f => f.spot_id));
    const view = document.getElementById('view-camaras');
    const sections = [...view.querySelectorAll(':scope > .camera-section')];
    const isFav = s => favs.has(s.id.replace('camera-', ''));
    [...sections.filter(isFav), ...sections.filter(s => !isFav(s))].forEach(s => view.appendChild(s));
    sections.filter(isFav).forEach(s => {
        const tag = document.createElement('span');
        tag.className = 'fav-tag';
        tag.innerHTML = `${monoIcon('star', 12, true)} Favorito`;
        s.querySelector('.video-title').appendChild(tag);
    });
});

// ── Forecast ───────────────────────────────────────────────────
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

function waveColor(h) {
    if (h == null) return '#888';
    if (h >= 1.2) return '#007aff';
    if (h >= 0.8) return '#ff9500';
    if (h >= 0.4) return '#ffcc00';
    return '#888';
}

function renderForecast(spotId, waveData, windData) {
    const container = document.getElementById('forecast-' + spotId + '-days');
    if (!container) return;

    // Group hourly heights by day to show the real daily min–max range, plus the day's peak wave energy
    const dailyDates = waveData.daily.time.slice(0, FORECAST_DAYS);
    const dayBuckets = {};
    const dayEnergy = {};
    dailyDates.forEach(d => { dayBuckets[d] = []; dayEnergy[d] = null; });
    waveData.hourly.time.forEach((t, i) => {
        const h = waveData.hourly.wave_height[i];
        const day = t.slice(0, 10);
        if (dayBuckets[day] === undefined || h == null) return;
        dayBuckets[day].push(h);
        const e = waveEnergy(h, waveData.hourly.energy_period[i]);
        if (e != null && (dayEnergy[day] == null || e > dayEnergy[day])) dayEnergy[day] = e;
    });

    container.innerHTML = dailyDates.map((dateStr, i) => {
        const dayName  = i === 0 ? 'Hoy' : DAYS[new Date(dateStr).getDay()];
        const bucket   = dayBuckets[dateStr];
        const waveMin  = bucket.length ? Math.min(...bucket) : null;
        const waveMax  = bucket.length ? Math.max(...bucket) : null;
        const period   = waveData.daily.wave_period_max[i];
        const waveDir  = waveData.daily.wave_direction_dominant[i];
        const arrowRot = waveDir != null ? (waveDir + 180) % 360 : 0;
        const windSpd  = windData.daily.wind_speed_10m_max[i];
        const windDir  = windData.daily.wind_direction_10m_dominant[i];
        const windRot  = windDir != null ? (windDir + 180) % 360 : 0;
        const color    = waveColor(waveMax);
        const rangeStr = waveMax != null ? `${waveMin.toFixed(1)} – ${waveMax.toFixed(1)}m` : '—';

        return `
        <div style="background:white;padding:14px 10px;border-radius:12px;text-align:center;border:1px solid var(--color-border);box-shadow:0 4px 6px rgba(0,0,0,0.02); min-width: 100px; flex: 0 0 auto; scroll-snap-align: start;">
            <div style="font-weight:800;text-transform:uppercase;margin-bottom:10px;font-size:0.9rem;border-bottom:1px solid var(--color-border);padding-bottom:5px;">${dayName}</div>
            <div style="color:${color};font-size:1.1rem;font-weight:900;margin-bottom:1px;">${rangeStr}</div>
            <div style="font-size:0.7rem;color:#aaa;margin-bottom:8px;">horquilla olas</div>
            <div style="font-size:0.85rem;color:#555;font-weight:600;margin:2px 0;">${period ? period.toFixed(1)+'s' : '—'}</div>
            <div style="font-size:0.8rem;color:#555;font-weight:700;margin:2px 0 6px 0;" title="Energía de las olas">${monoIcon('bolt', 12)} ${dayEnergy[dateStr] != null ? Math.round(dayEnergy[dateStr]) + ' kJ' : '—'}</div>
            <div style="display:flex;justify-content:center;align-items:center;gap:4px;font-size:0.8rem;font-weight:700;color:#444;margin-bottom:10px;">
                ${waveDir != null ? waveDir+'°' : '—'}
                <svg style="width:13px;height:13px;transform:rotate(${arrowRot}deg);" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L16 10H13V22H11V10H8L12 2Z"/></svg>
            </div>
            <div style="border-top:1px dashed var(--color-border);padding-top:8px;display:flex;flex-direction:column;align-items:center;gap:2px;">
                <div style="font-size:0.65rem;color:#888;text-transform:uppercase;font-weight:800;letter-spacing:0.5px;">Viento</div>
                <div style="font-size:1rem;font-weight:900;color:#333;">${windSpd ? windSpd.toFixed(0) : '—'}<span style="font-size:0.65rem;"> kn</span></div>
                <div style="display:flex;justify-content:center;align-items:center;gap:3px;font-size:0.75rem;font-weight:600;color:#666;">
                    ${windDir != null ? windDir+'°' : '—'}
                    <svg style="width:11px;height:11px;transform:rotate(${windRot}deg);" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L16 10H13V22H11V10H8L12 2Z"/></svg>
                </div>
            </div>
        </div>`;
    }).join('');
}

// Open-Meteo takes comma-separated coordinates and returns one result per spot, in order,
// so the whole forecast tab needs just 2 requests. Waves use the blended models from common.js.
async function fetchForecast() {
    const ids = Object.keys(SPOTS);
    const lats = ids.map(id => SPOTS[id].lat).join(',');
    const lons = ids.map(id => SPOTS[id].lon).join(',');
    const windUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&daily=wind_speed_10m_max,wind_direction_10m_dominant&wind_speed_unit=kn&timezone=auto&forecast_days=${FORECAST_DAYS}`;

    try {
        const [waves, winds] = await Promise.all([
            fetchMarine(ids.map(id => SPOTS[id]), FORECAST_DAYS, 'wave_direction_dominant'),
            fetch(windUrl).then(r => r.json())
        ]);
        ids.forEach((spotId, i) => {
            try {
                renderForecast(spotId, waves[i], winds[i]);
            } catch (err) {
                console.error('Forecast error for', spotId, err);
            }
        });
    } catch (err) {
        console.error('Forecast error', err);
    }
}

fetchForecast();

// Runs right away (before the first paint) so opening /forecast never loads the cam snapshots.
function loadTabFromUrl() {
    const path = window.location.pathname;
    switchTab(path.includes('forecast') ? 'forecast' : 'camaras');
}
window.addEventListener('popstate', loadTabFromUrl);
loadTabFromUrl();


// Logo and tabs (formerly inline onclick, which the Content-Security-Policy forbids)
document.getElementById('home-logo').addEventListener('click', () => switchTab('camaras', true));
[['tab-camaras', '/webcams', 'camaras'], ['tab-forecast', '/forecast', 'forecast']].forEach(([id, url, tab]) => {
    document.getElementById(id).addEventListener('click', e => {
        e.preventDefault();
        history.pushState(null, '', url);
        switchTab(tab, true);
    });
});

