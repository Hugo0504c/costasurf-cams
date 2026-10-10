// Script of spot.html. It is an external file (not inline) so the Content-Security-Policy can forbid inline scripts.
// Loaded without defer at the end of the page, so it runs at the same moment the inline script used to.

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Black stroke icons (24x24, same style as the rest of the site's SVGs)
const ICONS = {
    waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    umbrella: '<path d="M22 12a10 10 0 0 0-20 0Z"/><path d="M12 12v8a2 2 0 0 0 4 0"/><path d="M12 2v1"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    school: '<path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/><path d="M22 10v6"/>',
    thermometer: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;">${ICONS[name]}</svg>`;

function renderGuide(g, guides) {
    const L = guides.labels;
    const list = items => `<ul class="guide-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
    const section = (iconName, title, body) => `<div class="guide-section"><h4>${icon(iconName)}${title}</h4>${body}</div>`;
    const info = (label, value) => `<div class="spot-info-item"><div class="spot-info-label">${label}</div><div class="spot-info-value">${value}</div></div>`;
    const c = g.condiciones;

    const nearby = g.cercanos.filter(id => SPOTS[id]).map(id =>
        `<a href="/${id}" class="guide-chip">${SPOTS[id].name} &rarr;</a>`).join('');

    return `
    <div class="spot-info">
        <h3>${L.title}</h3>
        ${g.desc.map(p => `<p class="spot-description">${p}</p>`).join('')}

        <div class="spot-info-grid">
            ${info(L.tipo, g.tipo)}${info(L.fondo, g.fondo)}${info(L.nivel, g.nivel)}${info(L.afluencia, g.afluencia)}
            ${info(L.ola, g.ola)}${info(L.swell, g.swell)}${info(L.viento, g.viento)}${info(L.temporada, g.temporada)}
        </div>

        ${section('waves', L.condiciones, `
            <dl class="guide-conditions">
                <dt>${L.c_swell}</dt><dd>${c.swell}</dd>
                <dt>${L.c_viento}</dt><dd>${c.viento}</dd>
                <dt>${L.c_tamano}</dt><dd>${c.tamano}</dd>
                <dt>${L.c_momento}</dt><dd>${c.momento}</dd>
                <dt>${L.c_marea}</dt><dd>${c.marea}</dd>
            </dl>`)}

        <div class="guide-columns">
            ${section('alert', L.peligros, list(g.peligros))}
            ${section('bulb', L.consejos, list(g.consejos))}
            ${section('car', L.acceso, list(g.acceso))}
            ${section('umbrella', L.servicios, list(g.servicios))}
        </div>

        <div class="spot-services">
            <h4 style="display:flex; align-items:center; gap:8px;">${icon('school')}${L.escuelas}</h4>
            <p>${g.escuelas}</p>
        </div>

        ${section('thermometer', L.agua, `
            <div class="guide-water">
                ${guides.agua.map(([season, temp, suit]) => `
                    <div class="guide-water-row">
                        <div class="guide-water-season">${season}</div>
                        <div class="guide-water-temp">${temp}</div>
                        <div class="guide-water-suit">${suit}</div>
                    </div>`).join('')}
            </div>`)}

        ${section('users', L.normas, list(guides.normas))}

        ${nearby ? section('pin', L.cercanos, `<div class="guide-chips">${nearby}</div>`) : ''}

        <p class="guide-disclaimer">${L.aviso}</p>
    </div>`;
}

// The live webcam, or a "no cam" note (with the link to the cam hosted elsewhere, if the spot has one)
function renderMedia(spot) {
    const extLink = spot.extLink ? `
        <div class="ext-cam-link">
            <span style="color:#555;">Este spot tiene una cámara alojada en otra plataforma.</span>
            <a href="${spot.extLink}" target="_blank" rel="noopener">Ver Webcam Original</a>
        </div>` : '';
    if (!spot.video) {
        return `<div style="background:#f7f7f7;border-radius:12px;padding:3rem 1.5rem;text-align:center;margin-bottom:2rem;color:#888;">Sin cámara en directo para este spot</div>${extLink}`;
    }
    return `
        <div class="spot-cam">
            <div class="spot-cam-inner">
                <video id="spot-video" controls muted playsinline preload="none"></video>
                <span class="cam-live-badge">EN DIRECTO</span>
            </div>
        </div>
        ${extLink}`;
}

function getSpotId() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('id')) return urlParams.get('id');
    const path = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
    return SPOT_ALIASES[path] || path || null;
}

async function loadSpot() {
    const spotId = getSpotId();
    const spot = SPOTS[spotId];
    
    if (!spot) {
        document.getElementById('content').innerHTML = `<div class="loading">Spot no encontrado</div>`;
        return;
    }

    document.title = spot.name + ' - CostaCam';

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lon}&hourly=wind_speed_10m,wind_direction_10m&daily=wind_speed_10m_max,wind_direction_10m_dominant&wind_speed_unit=kn&timezone=auto&forecast_days=${FORECAST_DAYS}`;

    try {
        // Waves use the blended models from common.js
        const [[marineData], weatherRes] = await Promise.all([fetchMarine([spot], FORECAST_DAYS), fetch(weatherUrl)]);
        const weatherData = await weatherRes.json();

        // The spot guide and Supabase load with `defer`; they are ready once the DOM is.
        await domReady;

        const dailyWaves = {};
        for (let i = 0; i < marineData.hourly.time.length; i++) {
            const dateStr = marineData.hourly.time[i].split('T')[0];
            const h = marineData.hourly.wave_height[i];
            if (h === null) continue;
            if (!dailyWaves[dateStr]) dailyWaves[dateStr] = { min: h, max: h, dateObj: new Date(marineData.hourly.time[i]) };
            else {
                if (h < dailyWaves[dateStr].min) dailyWaves[dateStr].min = h;
                if (h > dailyWaves[dateStr].max) dailyWaves[dateStr].max = h;
            }
        }

        // Hourly forecast logic
        const now = new Date();
        const currentIndex = marineData.hourly.time.findIndex(t => new Date(t) >= now);
        const currentIdx = currentIndex !== -1 ? currentIndex : 0;
        
        let todayIndices = [];
        for(let i = 0; i < marineData.hourly.time.length; i++) {
            if (marineData.hourly.time[i].endsWith('T08:00')) {
                todayIndices = [i, i+4, i+10, i+13, i+16].filter(idx => idx < marineData.hourly.time.length);
                break;
            }
        }
        if (todayIndices.length === 0) todayIndices = [currentIdx, currentIdx+3, currentIdx+6, currentIdx+9]; // fallback
        
        let hourlyHtml = '<div style="display: flex; overflow-x: auto; gap: 15px; margin-bottom: 2rem; padding-bottom: 10px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;">';
        todayIndices.forEach(i => {
            const labelStr = new Date(marineData.hourly.time[i]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const waveH = marineData.hourly.wave_height[i];
            const wSpd = weatherData.hourly.wind_speed_10m[i] * 1.852; // kn to kmh
            const wDir = weatherData.hourly.wind_direction_10m[i];
            const wStatus = getWindStatus(wSpd, wDir, spot.facing);
            const period = marineData.hourly.wave_period[i];
            
            hourlyHtml += `
                <div style="background: #f7f7f7; padding: 15px; border-radius: 12px; text-align: center; min-width: 110px; flex: 0 0 auto; scroll-snap-align: start;">
                    <div style="font-weight: bold; margin-bottom: 8px; color: #555; text-transform: uppercase; font-size: 0.85rem;">${labelStr}</div>
                    <div style="font-size: 1.3rem; font-weight: 800; color: #111;">${waveH !== null ? waveH + 'm' : '-'}</div>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 4px;"><span style="color:#111; display:flex;">${icon('waves', 13)}</span>${period}s</div>
                    <div style="font-size: 0.75rem; color: #888; margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 2px;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${(wDir + 180) % 360}deg);"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                        ${wStatus}
                    </div>
                </div>
            `;
        });
        hourlyHtml += '</div>';

        const dates = Object.keys(dailyWaves).sort().slice(0, FORECAST_DAYS);
        let todaySizeHtml = `<span style="color:#888;">Sin datos</span>`;
        let forecastCardsHtml = '';

        dates.forEach((date, idx) => {
            const wave = dailyWaves[date];
            const windSpeed = weatherData.daily.wind_speed_10m_max[idx] || 0;
            const windDir = weatherData.daily.wind_direction_10m_dominant[idx] || 0;
            const windStatus = getWindStatus(windSpeed * 1.852, windDir, spot.facing);
            
            const minWave = wave.min.toFixed(1);
            const maxWave = wave.max.toFixed(1);
            let color = '#888';
            if (wave.max >= 1.2) color = '#007aff'; 
            else if (wave.max >= 0.8) color = '#ff9500';
            else if (wave.max >= 0.4) color = '#ffcc00';

            if (idx === 0) {
                todaySizeHtml = `<span style="color:${color};">${minWave} - ${maxWave}m</span>`;
            }

            forecastCardsHtml += `
                <div class="day-card" style="min-width: 120px; flex: 0 0 auto; scroll-snap-align: start; border-radius: 12px; border-top: 4px solid ${color};">
                    <div class="day-name">${idx === 0 ? 'Hoy' : DAYS[wave.dateObj.getDay()]}</div>
                    <div class="wave-size" style="color:${color};">${minWave}-${maxWave}m</div>
                    <div class="wind-info" style="display:flex; align-items:center; gap:2px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${(windDir + 180) % 360}deg);"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg> ${windStatus}</div>
                </div>
            `;
        });

        const todayPeriodVal = marineData.hourly.wave_period[currentIdx];
        const todayWSpdVal = weatherData.hourly.wind_speed_10m[currentIdx] * 1.852;
        const todayWDirVal = weatherData.hourly.wind_direction_10m[currentIdx];
        const todayWStatusVal = getWindStatus(todayWSpdVal, todayWDirVal, spot.facing);

        const mediaHtml = renderMedia(spot);

        const guides = window.SPOT_GUIDES;
        const spotDetails = guides && guides.spots[spotId];
        let guideHtml = '';
        if (spotDetails) {
            guideHtml = renderGuide(spotDetails, guides);

            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.name = "description";
                document.head.appendChild(metaDesc);
            }
            metaDesc.content = spotDetails.desc[0];
            
            const ldJson = document.createElement('script');
            ldJson.type = "application/ld+json";
            ldJson.text = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "SportsActivityLocation",
                "name": spot.name,
                "description": spotDetails.desc[0],
                "geo": {
                    "@type": "GeoCoordinates",
                    "latitude": spot.lat,
                    "longitude": spot.lon
                }
            });
            document.head.appendChild(ldJson);
        }

        document.getElementById('content').innerHTML = `
            <div class="spot-header">
                <h2>${spot.name}</h2>
                <div style="margin-bottom:1rem;" id="fav-container"></div>
                <div class="spot-stats" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:15px; margin-bottom:2rem;">
                    <div style="background:#f7f7f7; padding:15px; border-radius:12px; text-align:center;">
                        <div style="color:#888; font-size:0.8rem; font-weight:700; text-transform:uppercase; margin-bottom:8px;">Tamaño</div>
                        <div style="font-size:1.3rem; font-weight:900; color:var(--color-black);">${todaySizeHtml}</div>
                    </div>
                    <div style="background:#f7f7f7; padding:15px; border-radius:12px; text-align:center;">
                        <div style="color:#888; font-size:0.8rem; font-weight:700; text-transform:uppercase; margin-bottom:8px;">Periodo</div>
                        <div style="font-size:1.3rem; font-weight:900; color:var(--color-black);">${todayPeriodVal}s</div>
                    </div>
                    <div style="background:#f7f7f7; padding:15px; border-radius:12px; text-align:center;">
                        <div style="color:#888; font-size:0.8rem; font-weight:700; text-transform:uppercase; margin-bottom:8px;">Viento</div>
                        <div style="font-size:1.3rem; font-weight:900; color:var(--color-black); display:flex; align-items:center; justify-content:center; gap:5px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${(todayWDirVal + 180) % 360}deg);"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg> ${todayWStatusVal}
                        </div>
                    </div>
                </div>
            </div>

            ${mediaHtml}

            <h3 style="font-size:1.8rem;margin-bottom:1.5rem;margin-top:3rem;">Previsión Hoy</h3>
            ${hourlyHtml}

            <h3 style="font-size:1.8rem;margin-bottom:1.5rem;margin-top:3rem;">Previsión 9 días</h3>
            <div class="forecast-grid" style="display: flex; overflow-x: auto; gap: 15px; padding-bottom: 15px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;">
                ${forecastCardsHtml}
            </div>
            
            ${guideHtml}
        `;

        // Start the cam before the favourites lookup so it doesn't wait on Supabase
        if (spot.video) attachStream(document.getElementById('spot-video'), spot.video);

        if (window.supabaseClient) {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            const favContainer = document.getElementById('fav-container');
            
            if (session) {
                const userId = session.user.id;
                const { data: favData } = await window.supabaseClient.from('favorites').select('*').eq('user_id', userId).eq('spot_id', spotId).maybeSingle();
                let isFav = !!favData;
                
                const renderBtn = () => {
                    favContainer.innerHTML = `<button id="fav-btn" style="background:${isFav ? '#fff' : '#f7f7f7'};border:1px solid ${isFav ? '#ffd700' : '#eaeaea'};padding:8px 16px;border-radius:20px;cursor:pointer;font-weight:bold;transition:all 0.2s;">
                        ${isFav ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd700" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align:middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>En favoritos` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px; vertical-align:middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>Añadir a favoritos`}
                    </button>`;
                    
                    document.getElementById('fav-btn').onclick = async () => {
                        if (isFav) {
                            await window.supabaseClient.from('favorites').delete().eq('user_id', session.user.id).eq('spot_id', spotId);
                        } else {
                            await window.supabaseClient.from('favorites').insert([{ user_id: session.user.id, spot_id: spotId }]);
                        }
                        isFav = !isFav;
                        renderBtn();
                    };
                };
                renderBtn();
            } else {
                favContainer.innerHTML = `<a href="/login" style="font-size:0.85rem;color:#666;text-decoration:underline;">Inicia sesión para guardar en favoritos</a>`;
            }
        }

    } catch (err) {
        document.getElementById('content').innerHTML = `<div class="loading">Error al cargar datos</div>`;
        console.error(err);
    }
}

const domReady = new Promise(resolve => onReady(resolve));
loadSpot();
