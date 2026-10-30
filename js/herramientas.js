// Script of herramientas.html. It is an external file (not inline) so the Content-Security-Policy can forbid inline scripts.
// Loaded without defer at the end of the page, so it runs at the same moment the inline script used to.

// One fixed colour per spot, so a spot always looks the same in the calendar
const SPOT_COLORS = {
    misericordia: '#2563eb', fuengirola: '#dc2626', malapesquera: '#16a34a',
    malagueta: '#9333ea', bajondillo: '#ea580c', nerja: '#0891b2',
    alamos: '#db2777', cabopino: '#ca8a04', benajarafe: '#475569',
    torredelmar: '#0f766e'
};
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']; // week starts on Monday
const FIRST_HOUR = 7, LAST_HOUR = 19; // daylight hours used for the daily wave range
// Energy sliders (spot filter and advanced alerts) step through these values (kJ) rather than evenly: most days stay
// under 100 kJ and only storms go far above. Their value in herramientas.html is an index into this list.
const ENERGY_STEPS = [0, 5, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300];

const calBody = document.getElementById('calendar-body');
const locale = 'es-ES';
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

// { allSpots: [{ id, name, color }], allDays: { 'YYYY-MM-DD': [{ id, min, max, period, energyMin, energyMax }] },
//   picked: Set|null, spots/days: what is shown right now, month: Date, selected, metric }
let calState = null;
const CAL_GUEST_DEFAULT = ['misericordia', 'malagueta', 'fuengirola']; // spots a visitor sees first

// What the calendar shows for each day: wave size or wave energy. The choice is remembered in this browser.
const CAL_METRICS = {
    wave:   { label: 'Tamaño',  unit: 'm',  min: f => f.min,       max: f => f.max,       fmt: v => v.toFixed(1),
              note: 'Altura máxima de ola entre las 07:00 y las 20:00.' },
    energy: { label: 'Energía', unit: 'kJ', min: f => f.energyMin, max: f => f.energyMax, fmt: v => String(Math.round(v)),
              note: 'Energía máxima de las olas entre las 07:00 y las 20:00 (sale de su altura y su periodo).' }
};
const CAL_METRIC_KEY = 'calMetric';
function savedCalMetric() {
    try { const m = localStorage.getItem(CAL_METRIC_KEY); if (CAL_METRICS[m]) return m; } catch (e) {}
    return 'wave';
}

function message(html) {
    calBody.innerHTML = `<div class="cal-message">${html}</div>`;
}

async function getJson(url) {
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(url);
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || data.error) throw new Error(`HTTP ${res.status}${data && data.reason ? ': ' + data.reason : ''}`);
            return data;
        } catch (err) {
            if (attempt >= 1) throw err;
            await new Promise(r => setTimeout(r, 1500));
        }
    }
}

async function loadCalendar() {
    if (!window.supabaseClient) {
        message('La base de datos (Supabase) no se ha inicializado correctamente.');
        return;
    }
    const { data: { session } } = await window.supabaseClient.auth.getSession();

    // Logged in: the user's favourites. Logged out: every spot, shown through the spot chips (picked)
    let ids = Object.keys(SPOTS);
    if (session) {
        const { data: favs, error } = await window.supabaseClient.from('favorites').select('spot_id').eq('user_id', session.user.id);
        if (error) {
            console.error('Favorites error:', error);
            message('Error cargando favoritos: ' + error.message);
            return;
        }
        ids = ids.filter(id => favs.some(f => f.spot_id === id));
        if (!ids.length) {
            message(`Añade spots a favoritos para verlos en el calendario.<br><br><a href="/">Explorar spots</a>`);
            return;
        }
    }
    const spots = ids.map(id => ({ id, name: SPOTS[id].name, color: SPOT_COLORS[id] || '#111' }));

    // One request for every spot (blended wave models from common.js, one result per spot, in order)
    let results;
    try {
        results = await fetchMarine(spots.map(s => SPOTS[s.id]), FORECAST_DAYS);
    } catch (err) {
        console.error('Forecast error:', err);
        message('Error al cargar forecast');
        return;
    }

    // Daily wave range and energy range (daylight hours) per spot
    const days = {};
    spots.forEach((spot, i) => {
        const h = results[i].hourly;
        const byDay = {};
        h.time.forEach((time, j) => {
            const hour = parseInt(time.slice(11, 13), 10);
            const wave = h.wave_height[j];
            if (wave == null || hour < FIRST_HOUR || hour > LAST_HOUR) return;
            const day = time.slice(0, 10);
            const b = byDay[day] || (byDay[day] = { min: wave, max: wave, period: 0, energyMin: null, energyMax: null });
            b.min = Math.min(b.min, wave);
            if (wave >= b.max) { b.max = wave; b.period = h.wave_period[j] || b.period; }
            const energy = waveEnergy(wave, h.energy_period[j]);
            if (energy != null) {
                b.energyMin = b.energyMin == null ? energy : Math.min(b.energyMin, energy);
                b.energyMax = b.energyMax == null ? energy : Math.max(b.energyMax, energy);
            }
        });
        Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(0, FORECAST_DAYS)
            .forEach(([day, b]) => (days[day] || (days[day] = [])).push({ id: spot.id, ...b }));
    });

    const today = new Date();
    calState = {
        allSpots: spots, allDays: days, picked: session ? null : new Set(CAL_GUEST_DEFAULT),
        month: new Date(today.getFullYear(), today.getMonth(), 1), selected: dateKey(today), metric: savedCalMetric()
    };
    renderCalendar();
}

// Spot chips for visitors without an account (who have no favourites)
function calPickerHtml() {
    if (!calState.picked) return '';
    const chips = calState.allSpots.map(s => `
        <label class="adv-chip"><input type="checkbox" value="${s.id}"${calState.picked.has(s.id) ? ' checked' : ''}><span><i class="cal-chip-dot" style="--c:${s.color}"></i>${s.name}</span></label>`).join('');
    return `
        <div class="cal-picker">
            <span class="alert-label">Spots a mostrar</span>
            <div class="adv-chips">${chips}</div>
            <p class="flt-hint"><a href="/login?next=${encodeURIComponent('/herramientas#calendario')}">Inicia sesión</a> para ver directamente tus spots favoritos.</p>
        </div>`;
}

function renderCalendar() {
    // Visible spots: favourites, or the chips picked by a visitor
    const spots = calState.picked ? calState.allSpots.filter(s => calState.picked.has(s.id)) : calState.allSpots;
    const shownIds = new Set(spots.map(s => s.id));
    const days = {};
    Object.entries(calState.allDays).forEach(([day, list]) => {
        const shown = list.filter(f => shownIds.has(f.id));
        if (shown.length) days[day] = shown;
    });
    calState.spots = spots;
    calState.days = days;
    const bindPicker = () => calBody.querySelectorAll('.cal-picker input').forEach(input => input.addEventListener('change', () => {
        if (input.checked) calState.picked.add(input.value); else calState.picked.delete(input.value);
        renderCalendar();
    }));
    if (!spots.length) {
        calBody.innerHTML = calPickerHtml() + `<div class="cal-message">Elige al menos un spot.</div>`;
        bindPicker();
        return;
    }
    const { month } = calState;
    const todayKey = dateKey(new Date());
    const year = month.getFullYear(), m = month.getMonth();
    const firstWeekday = (new Date(year, m, 1).getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const spotById = Object.fromEntries(spots.map(s => [s.id, s]));
    const monthName = capitalize(month.toLocaleDateString(locale, { month: 'long', year: 'numeric' }));
    const arrow = d => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="${d}"></polyline></svg>`;
    const metric = CAL_METRICS[calState.metric];
    const metricBtns = Object.entries(CAL_METRICS).map(([key, mt]) =>
        `<button type="button" data-metric="${key}"${key === calState.metric ? ' class="active"' : ''} aria-pressed="${key === calState.metric}">${mt.label}</button>`).join('');

    let cells = WEEKDAYS.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < firstWeekday; i++) cells += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${year}-${pad(m + 1)}-${pad(d)}`;
        const forecast = days[key] || [];
        const classes = ['cal-day'];
        if (key < todayKey) classes.push('past');
        if (key === todayKey) classes.push('today');
        if (forecast.length) classes.push('has-data');
        if (key === calState.selected && forecast.length) classes.push('selected');
        const pills = forecast.map(f => {
            const s = spotById[f.id];
            const top = metric.max(f);
            return `<span class="cal-pill" style="--c:${s.color}" title="${s.name}: ${calRange(f, metric)}">${top == null ? '—' : metric.fmt(top)}<span class="unit">${metric.unit}</span></span>`;
        }).join('');
        cells += forecast.length
            ? `<button type="button" class="${classes.join(' ')}" data-day="${key}"><span class="cal-num">${d}</span>${pills}</button>`
            : `<div class="${classes.join(' ')}"><span class="cal-num">${d}</span></div>`;
    }

    calBody.innerHTML = calPickerHtml() + `
        <div class="cal-head">
            <div class="cal-month">${monthName}</div>
            <div class="cal-nav">
                <button type="button" data-step="-1" aria-label="Anterior">${arrow('15 18 9 12 15 6')}</button>
                <button type="button" data-step="1" aria-label="Siguiente">${arrow('9 18 15 12 9 6')}</button>
            </div>
        </div>
        <div class="cal-metric" role="group" aria-label="Qué mostrar">${metricBtns}</div>
        <div class="cal-legend">${spots.map(s => `<span><i style="--c:${s.color}"></i>${s.name}</span>`).join('')}</div>
        <div class="cal-grid">${cells}</div>
        <div id="cal-detail"></div>
        <p class="cal-note">${metric.note} Pulsa un día para ver el detalle.</p>`;

    calBody.querySelectorAll('.cal-nav button').forEach(btn => btn.addEventListener('click', () => {
        calState.month = new Date(year, m + Number(btn.dataset.step), 1);
        renderCalendar();
    }));
    calBody.querySelectorAll('.cal-metric button').forEach(btn => btn.addEventListener('click', () => {
        calState.metric = btn.dataset.metric;
        try { localStorage.setItem(CAL_METRIC_KEY, calState.metric); } catch (e) {}
        renderCalendar();
    }));
    calBody.querySelectorAll('.cal-day.has-data').forEach(cell => cell.addEventListener('click', () => {
        calState.selected = cell.dataset.day;
        renderCalendar();
    }));
    bindPicker();
    renderDetail();
}

// "0.4–1.1 m" or "3–61 kJ": the day's range of the metric shown
function calRange(f, metric) {
    const lo = metric.min(f), hi = metric.max(f);
    return hi == null ? '—' : `${metric.fmt(lo)}–${metric.fmt(hi)} ${metric.unit}`;
}

// Full range (of the metric shown) and period for every favourite on the selected day
function renderDetail() {
    const box = document.getElementById('cal-detail');
    const forecast = calState.days[calState.selected];
    if (!forecast) { box.innerHTML = ''; return; }
    const metric = CAL_METRICS[calState.metric];
    const spotById = Object.fromEntries(calState.spots.map(s => [s.id, s]));
    const title = capitalize(new Date(calState.selected + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));
    box.innerHTML = `
        <div class="cal-detail">
            <h4>${title}</h4>
            ${forecast.slice().sort((a, b) => (metric.max(b) ?? -1) - (metric.max(a) ?? -1)).map(f => {
                const s = spotById[f.id];
                return `<div class="cal-detail-row"><i style="--c:${s.color}"></i><a href="/${s.id}">${s.name}</a><span>${calRange(f, metric)}${f.period ? ` · ${Math.round(f.period)} s` : ''}</span></div>`;
            }).join('')}
        </div>`;
}

// ── Wave alerts: settings live in the user's Supabase metadata, read by the daily email function ──
const alertMessage = document.getElementById('alerts-message');
const alertPanel = document.getElementById('alerts-panel');
const alertCheckbox = document.getElementById('alert-enabled');
const alertSettings = document.getElementById('alert-settings');
const alertDays = document.getElementById('alert-days');
const alertSize = document.getElementById('alert-size');
const alertSizeVal = document.getElementById('alert-size-val');
const saveAlertsBtn = document.getElementById('save-alerts-btn');
const alertSuccess = document.getElementById('alert-success');
const showAlertSettings = on => { alertSettings.style.display = on ? 'flex' : 'none'; };

// Advanced alerts: extra filters the daily email function applies hour by hour.
// The top of each "max" slider means "no limit" and is saved as null.
const advCheckbox = document.getElementById('alert-advanced');
const advSettings = document.getElementById('alert-advanced-settings');
const advError = document.getElementById('alert-adv-error');
const minPeriodInput = document.getElementById('alert-min-period');
const minEnergyInput = document.getElementById('alert-min-energy'); // index into ENERGY_STEPS; saved as kJ
const maxSizeInput = document.getElementById('alert-max-size');
const maxWindInput = document.getElementById('alert-max-wind');
const windTypeInputs = [...document.querySelectorAll('#alert-wind-types input')];
const fromHourSelect = document.getElementById('alert-from-hour');
const toHourSelect = document.getElementById('alert-to-hour');
const MAX_SIZE_NO_LIMIT = 4, MAX_WIND_NO_LIMIT = 50;
for (let h = 5; h <= 22; h++) {
    if (h < 22) fromHourSelect.add(new Option(`${pad(h)}:00`, h));
    if (h > 5) toHourSelect.add(new Option(`${pad(h)}:00`, h));
}
fromHourSelect.value = 7;
toHourSelect.value = 20;

function updateAdvLabels() {
    const p = +minPeriodInput.value, s = +maxSizeInput.value, w = +maxWindInput.value, e = ENERGY_STEPS[+minEnergyInput.value];
    document.getElementById('alert-min-period-val').innerText = p === 0 ? 'Cualquiera' : `${p} s+`;
    document.getElementById('alert-min-energy-val').innerText = e === 0 ? 'Cualquiera' : `${e} kJ+`;
    document.getElementById('alert-max-size-val').innerText = s >= MAX_SIZE_NO_LIMIT ? 'Sin límite' : `≤ ${s.toFixed(1)}m`;
    document.getElementById('alert-max-wind-val').innerText = w >= MAX_WIND_NO_LIMIT ? 'Sin límite' : `≤ ${w} km/h`;
}
// Returns an error message, or '' when the combination can match
function advValidationError() {
    if (!advCheckbox.checked) return '';
    if (+maxSizeInput.value < MAX_SIZE_NO_LIMIT && +maxSizeInput.value < +alertSize.value) return 'El tamaño máximo debe ser mayor que el mínimo.';
    if (!windTypeInputs.some(i => i.checked)) return 'Elige al menos un tipo de viento.';
    if (+fromHourSelect.value >= +toHourSelect.value) return 'La hora de inicio debe ser anterior a la de fin.';
    return '';
}
function showAdvError() {
    const msg = advValidationError();
    advError.textContent = msg;
    advError.style.display = msg ? 'block' : 'none';
}
const showAdvSettings = on => { advSettings.style.display = on ? 'flex' : 'none'; };

alertCheckbox.addEventListener('change', () => showAlertSettings(alertCheckbox.checked));
alertSize.addEventListener('input', () => {
    alertSizeVal.innerText = parseFloat(alertSize.value).toFixed(1) + 'm+';
    showAdvError();
});
advCheckbox.addEventListener('change', () => { showAdvSettings(advCheckbox.checked); showAdvError(); });
[minPeriodInput, minEnergyInput, maxSizeInput, maxWindInput].forEach(el => el.addEventListener('input', () => { updateAdvLabels(); showAdvError(); }));
[...windTypeInputs, fromHourSelect, toHourSelect].forEach(el => el.addEventListener('change', showAdvError));
updateAdvLabels();

// ── Where alerts arrive: email and/or Telegram ──
// Linking runs on the server (netlify/functions/telegram-link.js + telegram-webhook.js); the linked chat shows up in
// the session's app_metadata, which only the server can write.
const chEmail = document.getElementById('alert-ch-email');
const chTelegram = document.getElementById('alert-ch-telegram');
const channelError = document.getElementById('alert-channel-error');
const tgConnect = document.getElementById('tg-connect');
const tgUnlink = document.getElementById('tg-unlink');
const tgMsg = document.getElementById('tg-msg');
let tgLinked = null;      // { name } once the chat is linked
let tgPoll = null;

function renderTelegram() {
    const status = document.getElementById('tg-status');
    status.textContent = tgLinked ? `Conectado${tgLinked.name ? ' (' + tgLinked.name + ')' : ''}` : 'No conectado';
    status.classList.toggle('on', !!tgLinked);
    document.getElementById('tg-howto').hidden = !!tgLinked;
    document.getElementById('tg-stop').hidden = !tgLinked;
    document.getElementById('tg-alert-hint').hidden = !!tgLinked;
    tgConnect.hidden = !!tgLinked;
    tgUnlink.hidden = !tgLinked;
    chTelegram.disabled = !tgLinked;
    if (!tgLinked) chTelegram.checked = false;
}
const tgFromUser = user => {
    const app = (user && user.app_metadata) || {};
    return app.telegram_chat_id ? { name: app.telegram_name || '' } : null;
};
async function tgCall(action) {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const res = await fetch('/.netlify/functions/telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ action })
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
}

tgConnect.addEventListener('click', async () => {
    // Open the tab right away (in the click) so the browser doesn't block it, then send it to the bot
    const tab = window.open('', '_blank');
    tgConnect.disabled = true;
    tgMsg.textContent = '';
    try {
        const { status, body } = await tgCall('link');
        if (status === 503) throw new Error('Las alertas por Telegram todavía no están disponibles. Vuelve a intentarlo más adelante.');
        if (!body.url) throw new Error('No se ha podido preparar la conexión. Inténtalo de nuevo.');
        if (tab) tab.location = body.url;
        tgMsg.innerHTML = `Se ha abierto Telegram: pulsa <strong>Iniciar</strong> en el chat del bot. ¿No se ha abierto? <a href="${body.url}" target="_blank" rel="noopener">Abrir el bot</a>`;
        // Wait for the bot to confirm (up to 10 min), refreshing the session to read the linked chat
        clearInterval(tgPoll);
        let tries = 0;
        tgPoll = setInterval(async () => {
            if (++tries > 200) { clearInterval(tgPoll); return; }
            const { data } = await window.supabaseClient.auth.refreshSession().catch(() => ({ data: {} }));
            const linked = tgFromUser(data && data.user);
            if (!linked) return;
            clearInterval(tgPoll);
            tgLinked = linked;
            renderTelegram();
            chTelegram.checked = true;
            tgMsg.textContent = '¡Telegram conectado! Ya puedes recibir las alertas por ahí.';
        }, 3000);
    } catch (err) {
        if (tab) tab.close();
        tgMsg.textContent = err.message;
    }
    tgConnect.disabled = false;
});

tgUnlink.addEventListener('click', async () => {
    if (!confirm('¿Desconectar Telegram? Dejarás de recibir alertas por ahí.')) return;
    const { status } = await tgCall('unlink');
    if (status !== 200) { tgMsg.textContent = 'No se ha podido desconectar. Inténtalo de nuevo.'; return; }
    await window.supabaseClient.auth.refreshSession().catch(() => {});
    tgLinked = null;
    renderTelegram();
    tgMsg.textContent = 'Telegram desconectado.';
});
[chEmail, chTelegram].forEach(el => el.addEventListener('change', () => { channelError.style.display = 'none'; }));

saveAlertsBtn.addEventListener('click', async () => {
    const invalid = advValidationError();
    if (invalid) { showAdvError(); return; }
    if (alertCheckbox.checked && !chEmail.checked && !chTelegram.checked) { channelError.style.display = 'block'; return; }
    saveAlertsBtn.innerText = 'Guardando...';
    saveAlertsBtn.disabled = true;
    const { error } = await window.supabaseClient.auth.updateUser({
        data: {
            alerts_enabled: alertCheckbox.checked,
            alert_email: chEmail.checked,
            alert_telegram: chTelegram.checked,
            alert_days: parseInt(alertDays.value, 10),
            alert_size: parseFloat(alertSize.value),
            alerts_advanced: advCheckbox.checked,
            alert_min_period: +minPeriodInput.value,
            alert_min_energy: ENERGY_STEPS[+minEnergyInput.value], // kJ, 0 = any
            alert_max_size: +maxSizeInput.value >= MAX_SIZE_NO_LIMIT ? null : +maxSizeInput.value,
            alert_max_wind: +maxWindInput.value >= MAX_WIND_NO_LIMIT ? null : +maxWindInput.value,
            alert_wind_types: windTypeInputs.filter(i => i.checked).map(i => i.value),
            alert_from_hour: +fromHourSelect.value,
            alert_to_hour: +toHourSelect.value
        }
    });
    saveAlertsBtn.innerText = 'Guardar Preferencias';
    saveAlertsBtn.disabled = false;
    if (error) {
        alert('Error al guardar alertas: ' + error.message);
        return;
    }
    alertSuccess.style.display = 'block';
    setTimeout(() => alertSuccess.style.display = 'none', 3000);
});

async function loadAlerts() {
    if (!window.supabaseClient) {
        alertMessage.innerHTML = 'La base de datos (Supabase) no se ha inicializado correctamente.';
        return;
    }
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (!session) {
        alertMessage.innerHTML = `Inicia sesión para activar las alertas de olas.<br><br><a href="/login">Iniciar Sesión</a>`;
        // Bot de Telegram tool: the explanation and the bot link stay; connecting needs an account
        document.getElementById('tg-login').hidden = false;
        document.getElementById('tg-account').hidden = true;
        document.getElementById('tg-status').hidden = true;
        return;
    }
    // The settings can also change from the Telegram bot (/alertas), which the browser's saved session doesn't know
    // about: read the account fresh from the server, falling back to the session if that fails
    const { data: fresh } = await window.supabaseClient.auth.getUser().catch(() => ({ data: null }));
    const user = (fresh && fresh.user) || session.user;
    const meta = user.user_metadata || {};
    alertCheckbox.checked = meta.alerts_enabled === true;
    showAlertSettings(alertCheckbox.checked);
    tgLinked = tgFromUser(user);
    renderTelegram();
    chEmail.checked = meta.alert_email !== false; // older accounts never chose: email
    chTelegram.checked = !!tgLinked && meta.alert_telegram === true;
    if (meta.alert_days) alertDays.value = meta.alert_days;
    if (meta.alert_size) {
        alertSize.value = meta.alert_size;
        alertSizeVal.innerText = parseFloat(meta.alert_size).toFixed(1) + 'm+';
    }
    advCheckbox.checked = meta.alerts_advanced === true;
    showAdvSettings(advCheckbox.checked);
    if (typeof meta.alert_min_period === 'number') minPeriodInput.value = meta.alert_min_period;
    if (typeof meta.alert_min_energy === 'number') minEnergyInput.value = Math.max(0, ENERGY_STEPS.indexOf(meta.alert_min_energy));
    maxSizeInput.value = typeof meta.alert_max_size === 'number' ? meta.alert_max_size : MAX_SIZE_NO_LIMIT;
    maxWindInput.value = typeof meta.alert_max_wind === 'number' ? meta.alert_max_wind : MAX_WIND_NO_LIMIT;
    if (Array.isArray(meta.alert_wind_types) && meta.alert_wind_types.length) {
        windTypeInputs.forEach(i => { i.checked = meta.alert_wind_types.includes(i.value); });
    }
    if (typeof meta.alert_from_hour === 'number') fromHourSelect.value = meta.alert_from_hour;
    if (typeof meta.alert_to_hour === 'number') toHourSelect.value = meta.alert_to_hour;
    updateAdvLabels();
    alertMessage.style.display = 'none';
    alertPanel.style.display = 'block';
}
onReady(() => loadAlerts().catch(err => console.error('Alerts error:', err)));

// /herramientas#alertas (from the profile switch, or back from logging in) opens that tool and scrolls to it
const TOOL_HASHES = { calendario: 'tool-calendar', filtrar: 'tool-filter', comparador: 'tool-compare', mapa: 'tool-map', alertas: 'tool-alerts', telegram: 'tool-telegram' };
function openHashTool() {
    const tool = document.getElementById(TOOL_HASHES[window.location.hash.slice(1)]);
    if (!tool) return;
    tool.open = true;
    tool.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
onReady(openHashTool);
// Links between tools on this page (e.g. Alertas → #telegram) open the other tool too
window.addEventListener('hashchange', openHashTool);

// ── Without an account: calendar and map work for everyone; these tools ask to log in ──
const LOCKED_TOOLS = {
    'tool-filter':  { hash: 'filtrar',    text: 'Busca en todos los spots los días y horas con las condiciones que quieres.' },
    'tool-compare': { hash: 'comparador', text: 'Compara dos spots hora a hora: olas, periodo, viento y energía.' },
    'tool-alerts':  { hash: 'alertas',    text: 'Recibe un correo cuando haya buenas olas en tus spots favoritos.' }
};
// Resolves to the session, or null when logged out
const sessionReady = new Promise(resolve => onReady(resolve)).then(async () => {
    if (!window.supabaseClient) return null;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    return session;
}).catch(() => null);

sessionReady.then(session => {
    if (session) return;
    // Available tools first, then a divider inviting to log in, then the locked ones (in their usual order).
    // Reordering is for accounts only, so a locked tool can't end up above the divider.
    const box = document.getElementById('tools');
    const divider = document.createElement('div');
    divider.className = 'tools-divider';
    divider.innerHTML = `
        <span class="tools-divider-line"></span>
        <div class="tools-divider-body">
            <strong>${monoIcon('lock', 16)} Inicia sesión para desbloquear todas las herramientas</strong>
            <span>Es gratis: solo necesitas una cuenta.</span>
            <a href="/login?next=${encodeURIComponent('/herramientas')}" class="tool-lock-btn">Iniciar Sesión</a>
        </div>
        <span class="tools-divider-line"></span>`;
    const tools = [...box.querySelectorAll(':scope > .tool')];
    tools.filter(el => !LOCKED_TOOLS[el.id]).forEach(el => box.appendChild(el));
    box.appendChild(divider);
    tools.filter(el => LOCKED_TOOLS[el.id]).forEach(el => box.appendChild(el));
    document.getElementById('order-btn').hidden = true;

    Object.entries(LOCKED_TOOLS).forEach(([id, lock]) => {
        const tool = document.getElementById(id);
        const tag = document.createElement('span');
        tag.className = 'tool-lock-tag';
        tag.innerHTML = `${monoIcon('lock', 11)} Requiere cuenta`;
        tool.querySelector('.tool-title').appendChild(tag);
        const login = `/login?next=${encodeURIComponent('/herramientas#' + lock.hash)}`;
        tool.querySelector('.tool-body').innerHTML = `
            <div class="tool-lock">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <h4>Inicia sesión para usar esta herramienta</h4>
                <p>${lock.text} Es gratis: solo necesitas una cuenta.</p>
                <div class="tool-lock-btns">
                    <a href="${login}" class="tool-lock-btn">Iniciar Sesión</a>
                    <a href="${login}" class="tool-lock-btn secondary">Crear Cuenta</a>
                </div>
            </div>`;
    });
});

// ── Spot comparator: two spots, one metric at a time (one y-axis), next 48 hours or one chosen day ──
const CMP_HOURS = 48;
const CMP_NEXT = 'next48'; // range value for "next 48 hours"; any other value is a day ('YYYY-MM-DD')
const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']; // indexed by Date.getDay()
const CMP_METRICS = {
    wave:   { label: 'Altura de ola', unit: 'm',    digits: 1, src: 'marine',  key: 'wave_height' },
    period: { label: 'Periodo',       unit: 's',    digits: 0, src: 'marine',  key: 'wave_period' },
    wind:   { label: 'Viento',        unit: 'km/h', digits: 0, src: 'weather', key: 'wind_speed_10m' },
    energy: { label: 'Energía',       unit: 'kJ',   digits: 0 } // computed from height + period (waveEnergy in common.js)
};
const cmpA = document.getElementById('cmp-a');
const cmpB = document.getElementById('cmp-b');
const cmpContent = document.getElementById('cmp-content');
const cmpMetricBtns = [...document.querySelectorAll('#cmp-metrics button')];
const cmpDays = document.getElementById('cmp-days');
const cmpCache = {};       // spotId -> { time, wave, period, energy, wind, windDir, offset } for every forecast day
let cmpMetric = 'wave';
let cmpRange = CMP_NEXT;
let cmpLoaded = false;
let cmpRequest = 0;        // ignores responses from an older selection

const svgEl = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
};
const fmt = (v, digits) => v == null ? '—' : v.toFixed(digits);

Object.entries(SPOTS).forEach(([id, s]) => {
    cmpA.add(new Option(s.name, id));
    cmpB.add(new Option(s.name, id));
});
cmpA.addEventListener('change', loadComparison);
cmpB.addEventListener('change', loadComparison);
cmpMetricBtns.forEach(btn => btn.addEventListener('click', () => {
    cmpMetric = btn.dataset.metric;
    cmpMetricBtns.forEach(b => b.classList.toggle('active', b === btn));
    renderComparison();
}));

// Every forecast day for the spots not cached yet, in one request per API (wind matched to waves by time)
async function fetchSpots(ids) {
    const missing = ids.filter(id => !cmpCache[id]);
    if (!missing.length) return;
    const lats = missing.map(id => SPOTS[id].lat).join(',');
    const lons = missing.map(id => SPOTS[id].lon).join(',');
    const [marineList, weather] = await Promise.all([
        fetchMarine(missing.map(id => SPOTS[id]), FORECAST_DAYS), // blended wave models (common.js)
        getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=${FORECAST_DAYS}`)
    ]);
    const weatherList = Array.isArray(weather) ? weather : [weather];
    missing.forEach((id, i) => {
        const m = marineList[i].hourly, w = weatherList[i].hourly;
        const windAt = {};
        w.time.forEach((tm, j) => { windAt[tm] = j; });
        const windCol = key => m.time.map(tm => (windAt[tm] == null ? null : w[key][windAt[tm]]));
        cmpCache[id] = {
            time: m.time,
            wave: m.wave_height,
            period: m.wave_period,
            energy: m.wave_height.map((h, j) => waveEnergy(h, m.energy_period[j])),
            wind: windCol('wind_speed_10m'),
            windDir: windCol('wind_direction_10m'),
            offset: marineList[i].utc_offset_seconds
        };
    });
}

// Times are local to the spot (timezone=auto), so "now" is the API's own clock: Date.now() + its UTC offset
const cmpNowKey = data => new Date(Date.now() + data.offset * 1000).toISOString().slice(0, 13) + ':00';

// Indexes of the hours to draw: the next 48 h from now, or the 24 h of the chosen day
function cmpIndexes(data) {
    const all = data.time.map((_, i) => i);
    if (cmpRange !== CMP_NEXT) return all.filter(i => data.time[i].startsWith(cmpRange));
    const start = Math.max(0, data.time.indexOf(cmpNowKey(data)));
    return all.slice(start, start + CMP_HOURS);
}

// Range chips ("Próximas 48 h", Hoy, Mañana, Mié 14...), built once the first data arrives
function buildCmpDays(data) {
    if (cmpDays.childElementCount) return;
    const days = [...new Set(data.time.map(tm => tm.slice(0, 10)))].slice(0, FORECAST_DAYS);
    const chip = (value, label) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.range = value;
        btn.textContent = label;
        btn.addEventListener('click', () => { cmpRange = value; renderComparison(); });
        cmpDays.appendChild(btn);
    };
    chip(CMP_NEXT, 'Próximas 48 h');
    days.forEach((day, i) => {
        const d = new Date(day + 'T12:00:00');
        chip(day, i < 2 ? MAP_DAY_LABELS[i] : `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`);
    });
}

async function loadComparison() {
    const a = cmpA.value, b = cmpB.value;
    if (a === b) {
        cmpContent.innerHTML = `<div class="cal-message">Elige dos spots distintos.</div>`;
        return;
    }
    const req = ++cmpRequest;
    const chart = cmpContent.querySelector('.cmp-chart');
    if (chart) chart.style.opacity = '0.5'; // keep the previous chart while the new data loads
    else cmpContent.innerHTML = `<div class="cal-message">Cargando...</div>`;
    try {
        await fetchSpots([a, b]);
    } catch (err) {
        console.error('Comparator error:', err);
        if (req === cmpRequest) cmpContent.innerHTML = `<div class="cal-message">Error al cargar forecast</div>`;
        return;
    }
    if (req === cmpRequest) renderComparison();
}

// "Nice" axis steps: 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10...
function niceScale(max) {
    const raw = Math.max(max, 0.1) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw);
    return { step, top: Math.ceil(Math.max(max, 0.1) / step) * step };
}

function renderComparison() {
    const a = cmpA.value, b = cmpB.value;
    if (a === b || !cmpCache[a] || !cmpCache[b]) return;
    const metric = CMP_METRICS[cmpMetric];
    buildCmpDays(cmpCache[a]);
    cmpDays.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.range === cmpRange));
    // Both spots share the same hourly grid, so the indexes of spot A work for spot B too
    const idx = cmpIndexes(cmpCache[a]);
    const pick = (data, key) => idx.map(i => data[key][i]);
    const series = [
        { id: a, name: SPOTS[a].name, color: 'var(--series-1)', data: cmpCache[a] },
        { id: b, name: SPOTS[b].name, color: 'var(--series-2)', data: cmpCache[b] }
    ].map(s => ({ ...s, data: { windDir: pick(s.data, 'windDir') }, values: pick(s.data, cmpMetric) }));
    const times = pick(cmpCache[a], 'time');
    const n = times.length;
    if (n < 2) {
        cmpContent.innerHTML = `<div class="cal-message">Sin datos</div>`;
        return;
    }
    const values = series.map(s => s.values);
    const dayMode = cmpRange !== CMP_NEXT;
    const maxVal = Math.max(...values.flat().filter(v => v != null));
    const { step, top } = niceScale(maxVal * 1.08);
    const digitsAxis = Number.isInteger(step) ? 0 : Number.isInteger(step * 10) ? 1 : 2;

    cmpContent.innerHTML = '';

    // Legend (always present for 2 series): line key + name + 48 h max
    const legend = document.createElement('div');
    legend.className = 'cmp-legend';
    series.forEach((s, i) => {
        const known = values[i].filter(v => v != null);
        const max = known.length ? Math.max(...known) : null;
        const item = document.createElement('span');
        const key = document.createElement('i');
        key.className = 'cmp-key';
        key.style.setProperty('--c', s.color);
        const name = document.createElement('span');
        name.textContent = s.name;
        const val = document.createElement('b');
        val.textContent = `Máx. ${fmt(max, metric.digits)} ${metric.unit}`;
        item.append(key, name, val);
        legend.appendChild(item);
    });
    cmpContent.appendChild(legend);

    // Chart geometry
    const wrap = document.createElement('div');
    wrap.className = 'cmp-chart';
    cmpContent.appendChild(wrap);
    const W = Math.max(320, wrap.clientWidth - 8), H = 280;
    const M = { left: 44, right: 16, top: 30, bottom: 40 };
    const x = i => M.left + (i / (n - 1)) * (W - M.left - M.right);
    const y = v => M.top + (1 - v / top) * (H - M.top - M.bottom);

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, tabindex: '0', role: 'img',
        'aria-label': `${metric.label}: ${series.map(s => s.name).join(' vs ')}` });

    // Gridlines + y ticks
    for (let v = 0; v <= top + 1e-9; v += step) {
        svg.appendChild(svgEl('line', { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v), stroke: v === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
        const label = svgEl('text', { x: M.left - 8, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--text-muted)' });
        label.textContent = v.toFixed(digitsAxis);
        svg.appendChild(label);
    }
    const unit = svgEl('text', { x: M.left - 8, y: M.top - 14, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--text-muted)' });
    unit.textContent = metric.unit;
    svg.appendChild(unit);

    // X ticks: every 6 h over 48 h (midnight shows the day name), every 3 h for a single day (6 h on narrow screens)
    const tickEvery = dayMode && W >= 500 ? 3 : 6;
    times.forEach((tm, i) => {
        const hour = parseInt(tm.slice(11, 13), 10);
        if (hour % tickEvery !== 0) return;
        const dayStart = hour === 0 && !dayMode;
        if (dayStart) svg.appendChild(svgEl('line', { x1: x(i), x2: x(i), y1: M.top, y2: H - M.bottom, stroke: 'var(--grid)', 'stroke-width': 1 }));
        const label = svgEl('text', { x: x(i), y: H - M.bottom + 16, 'text-anchor': i === 0 ? 'start' : 'middle', 'font-size': 11, fill: dayStart ? 'var(--text-secondary)' : 'var(--text-muted)', 'font-weight': dayStart ? 700 : 400 });
        label.textContent = dayStart
            ? `${DAYS_SHORT[new Date(tm.slice(0, 10) + 'T12:00:00').getDay()]} ${parseInt(tm.slice(8, 10), 10)}`
            : `${pad(hour)}h`;
        svg.appendChild(label);
    });
    // "Now" marker when the current hour is on the chart
    const nowIdx = times.indexOf(cmpNowKey(cmpCache[a]));
    if (nowIdx >= 0) {
        if (nowIdx > 0) svg.appendChild(svgEl('line', { x1: x(nowIdx), x2: x(nowIdx), y1: M.top, y2: H - M.bottom, stroke: 'var(--axis)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
        const nowLabel = svgEl('text', { x: x(nowIdx), y: H - M.bottom + 32, 'text-anchor': nowIdx === 0 ? 'start' : 'middle', 'font-size': 10, fill: 'var(--text-muted)' });
        nowLabel.textContent = 'Ahora';
        svg.appendChild(nowLabel);
    }

    // Lines (2px, round joins); null values break the line
    series.forEach((s, si) => {
        let d = '', pen = false;
        values[si].forEach((v, i) => {
            if (v == null) { pen = false; return; }
            d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
            pen = true;
        });
        svg.appendChild(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    });

    // Hover layer: crosshair snaps to the nearest hour, one tooltip lists both spots
    const cross = svgEl('line', { y1: M.top, y2: H - M.bottom, stroke: 'var(--text-muted)', 'stroke-width': 1, visibility: 'hidden' });
    const dots = series.map(s => svgEl('circle', { r: 4, fill: s.color, stroke: 'var(--surface-1)', 'stroke-width': 2, visibility: 'hidden' }));
    svg.append(cross, ...dots);
    wrap.appendChild(svg);

    const tip = document.createElement('div');
    tip.className = 'cmp-tip';
    wrap.appendChild(tip);

    let current = -1;
    function show(i) {
        current = Math.max(0, Math.min(n - 1, i));
        cross.setAttribute('x1', x(current));
        cross.setAttribute('x2', x(current));
        cross.setAttribute('visibility', 'visible');
        tip.textContent = '';
        const head = document.createElement('div');
        head.className = 'cmp-tip-time';
        const tm = times[current];
        head.textContent = `${DAYS_SHORT[new Date(tm.slice(0, 10) + 'T12:00:00').getDay()]} ${parseInt(tm.slice(8, 10), 10)} · ${tm.slice(11, 16)}`;
        tip.appendChild(head);
        series.forEach((s, si) => {
            const v = values[si][current];
            dots[si].setAttribute('visibility', v == null ? 'hidden' : 'visible');
            if (v != null) { dots[si].setAttribute('cx', x(current)); dots[si].setAttribute('cy', y(v)); }
            const row = document.createElement('div');
            row.className = 'cmp-tip-row';
            const key = document.createElement('i');
            key.className = 'cmp-key';
            key.style.setProperty('--c', s.color);
            const val = document.createElement('strong');
            val.textContent = `${fmt(v, metric.digits)} ${metric.unit}`;
            const name = document.createElement('span');
            name.textContent = s.name;
            row.append(key, val, name);
            if (cmpMetric === 'wind' && v != null) {
                const status = document.createElement('em');
                status.textContent = getWindStatus(v, s.data.windDir[current], SPOTS[s.id].facing);
                row.appendChild(status);
            }
            tip.appendChild(row);
        });
        tip.style.display = 'block';
        // Keep the tooltip inside the chart: flip to the left of the crosshair near the right edge
        const scale = wrap.clientWidth / W;
        const px = x(current) * scale;
        const left = px + 12 + tip.offsetWidth > wrap.clientWidth ? px - 12 - tip.offsetWidth : px + 12;
        tip.style.left = Math.max(4, Math.min(left, wrap.clientWidth - tip.offsetWidth - 4)) + 'px';
    }
    function hide() {
        current = -1;
        cross.setAttribute('visibility', 'hidden');
        dots.forEach(d => d.setAttribute('visibility', 'hidden'));
        tip.style.display = 'none';
    }
    const showAtPointer = e => {
        const rect = svg.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (W / rect.width);
        show(Math.round((px - M.left) / (W - M.left - M.right) * (n - 1)));
    };
    svg.addEventListener('pointermove', showAtPointer);
    svg.addEventListener('pointerdown', showAtPointer); // a tap on touch screens
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    svg.addEventListener('focus', () => show(0));
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    });

    // Table view: every 3 hours, so no value depends on hovering
    const table = document.createElement('details');
    table.className = 'cmp-table';
    const sum = document.createElement('summary');
    sum.textContent = 'Ver tabla de datos';
    const tbl = document.createElement('table');
    const headRow = tbl.createTHead().insertRow();
    ['Hora', ...series.map(s => s.name)].forEach(h => {
        const th = document.createElement('th');
        th.textContent = h;
        headRow.appendChild(th);
    });
    const body = tbl.createTBody();
    times.forEach((tm, i) => {
        if (i % 3 !== 0) return;
        const r = body.insertRow();
        r.insertCell().textContent = `${DAYS_SHORT[new Date(tm.slice(0, 10) + 'T12:00:00').getDay()]} ${tm.slice(11, 16)}`;
        values.forEach(vals => { r.insertCell().textContent = `${fmt(vals[i], metric.digits)} ${metric.unit}`; });
    });
    table.append(sum, tbl);
    cmpContent.appendChild(table);
}

// Re-draw on resize so the chart always fills its card
let cmpResizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(cmpResizeTimer);
    cmpResizeTimer = setTimeout(() => { if (cmpLoaded) renderComparison(); }, 150);
});

// Default pair: the user's first two favourites, otherwise two nearby Málaga spots
async function initComparison() {
    let pair = ['misericordia', 'fuengirola'];
    try {
        const { data: { session } } = window.supabaseClient ? await window.supabaseClient.auth.getSession() : { data: {} };
        if (session) {
            const { data: favs } = await window.supabaseClient.from('favorites').select('spot_id').eq('user_id', session.user.id);
            const favIds = Object.keys(SPOTS).filter(id => (favs || []).some(f => f.spot_id === id));
            if (favIds.length >= 2) pair = favIds.slice(0, 2);
            else if (favIds.length === 1) pair = [favIds[0], favIds[0] === 'misericordia' ? 'fuengirola' : 'misericordia'];
        }
    } catch (err) {
        console.error('Comparator favourites error:', err);
    }
    cmpA.value = pair[0];
    cmpB.value = pair[1];
    await loadComparison();
}

const compareTool = document.getElementById('tool-compare');
compareTool.addEventListener('toggle', () => {
    if (!compareTool.open || cmpLoaded) return;
    cmpLoaded = true;
    sessionReady.then(session => { if (session) initComparison(); }); // locked without an account
});

// ── Spot map: every spot coloured by the day's max wave height (daylight 07–20h) ──
const MAP_BINS = [ // same thresholds and colours as the Forecast tab; text colour picked for contrast on each
    { max: 0.4, color: 'var(--wave-1)', text: '#0b0b0b', label: '< 0.4 m', quality: 'Casi plano' },
    { max: 0.8, color: 'var(--wave-2)', text: '#0b0b0b', label: '0.4–0.8 m', quality: 'Pequeño' },
    { max: 1.2, color: 'var(--wave-3)', text: '#0b0b0b', label: '0.8–1.2 m', quality: 'Surfeable' },
    { max: Infinity, color: 'var(--wave-4)', text: '#ffffff', label: '≥ 1.2 m', quality: 'Bueno' }
];
const MAP_DAY_LABELS = ['Hoy', 'Mañana', 'Pasado mañana'];
const mapTool = document.getElementById('tool-map');
const mapCanvas = document.getElementById('map-canvas');
const mapDays = document.getElementById('map-days');
const mapExtra = document.getElementById('map-extra');
let mapState = null; // { map, markers: { id: marker }, data: { id: [dayInfo] }, dates, day, favs }

const binFor = v => v == null ? null : MAP_BINS.find(b => v < b.max);

let leafletPromise = null;
function loadLeaflet() {
    if (!leafletPromise) {
        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
            css.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';
            css.crossOrigin = 'anonymous';
            document.head.appendChild(css);
            const js = document.createElement('script');
            js.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
            js.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
            js.crossOrigin = 'anonymous';
            js.onload = () => resolve(window.L);
            js.onerror = () => reject(new Error('Leaflet failed to load'));
            document.head.appendChild(js);
        });
    }
    return leafletPromise;
}

// 3 days for all spots, one request per API
async function fetchMapData() {
    const ids = Object.keys(SPOTS);
    const lats = ids.map(id => SPOTS[id].lat).join(',');
    const lons = ids.map(id => SPOTS[id].lon).join(',');
    const [marine, weather] = await Promise.all([
        fetchMarine(ids.map(id => SPOTS[id]), 3), // blended wave models (common.js)
        getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=3`)
    ]);
    const data = {};
    let dates = [];
    ids.forEach((id, i) => {
        const m = marine[i].hourly, w = weather[i].hourly;
        const windAt = {};
        w.time.forEach((tm, j) => { windAt[tm] = { speed: w.wind_speed_10m[j], dir: w.wind_direction_10m[j] }; });
        const days = {};
        m.time.forEach((tm, j) => {
            const hour = parseInt(tm.slice(11, 13), 10);
            const wave = m.wave_height[j];
            if (wave == null || hour < FIRST_HOUR || hour > LAST_HOUR) return;
            const day = tm.slice(0, 10);
            const d = days[day] || (days[day] = { min: wave, max: -1 });
            d.min = Math.min(d.min, wave);
            if (wave > d.max) {
                const wind = windAt[tm] || {};
                Object.assign(d, { max: wave, period: m.wave_period[j], windSpeed: wind.speed, windDir: wind.dir });
            }
        });
        if (!dates.length) dates = Object.keys(days).sort().slice(0, 3);
        data[id] = dates.map(day => days[day] || null);
    });
    return { data, dates };
}

function pinIcon(L, id) {
    const info = mapState.data[id][mapState.day];
    const bin = binFor(info && info.max);
    const fav = mapState.favs.includes(id) ? ' fav' : '';
    const label = info ? info.max.toFixed(1) : '—';
    return L.divIcon({
        className: '',
        html: `<div class="map-pin${fav}" style="--bg:${bin ? bin.color : 'var(--wave-none)'};--fg:${bin ? bin.text : '#0b0b0b'}">${label}</div>`,
        iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -20], tooltipAnchor: [0, -22]
    });
}

function popupContent(id) {
    const info = mapState.data[id][mapState.day];
    const box = document.createElement('div');
    box.className = 'map-popup';
    const title = document.createElement('strong');
    title.textContent = SPOTS[id].name;
    box.appendChild(title);
    // Text set with textContent (safe); the icon is our own fixed SVG
    const line = (text, iconName) => {
        const p = document.createElement('div');
        p.className = 'map-popup-line';
        p.textContent = text;
        if (iconName) p.insertAdjacentHTML('afterbegin', monoIcon(iconName, 13) + ' ');
        box.appendChild(p);
    };
    if (info) {
        line(`${info.min.toFixed(1)}–${info.max.toFixed(1)} m${info.period ? ` · ${Math.round(info.period)} s` : ''}`, 'wave');
        if (info.windSpeed != null) line(`${Math.round(info.windSpeed)} km/h · ${getWindStatus(info.windSpeed, info.windDir, SPOTS[id].facing)}`, 'wind');
    } else {
        line('Sin datos');
    }
    if (SPOTS[id].cam) line('Webcam en directo', 'video');
    const link = document.createElement('a');
    link.href = '/' + id;
    link.textContent = 'Ver página del spot' + ' →';
    box.appendChild(link);
    return box;
}

function renderMapDay(L) {
    Object.entries(mapState.markers).forEach(([id, marker]) => {
        const info = mapState.data[id][mapState.day];
        marker.setIcon(pinIcon(L, id));
        marker.setPopupContent(popupContent(id));
        marker.setTooltipContent(`${SPOTS[id].name}: ${info ? info.max.toFixed(1) + ' m' : '—'}`);
    });
    mapDays.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === mapState.day));

    // List view (sorted by size) so nothing depends on clicking the map
    const rows = Object.keys(SPOTS)
        .map(id => ({ id, info: mapState.data[id][mapState.day] }))
        .sort((a, b) => ((b.info && b.info.max) || 0) - ((a.info && a.info.max) || 0));
    const open = mapExtra.querySelector('details') && mapExtra.querySelector('details').open;
    const details = document.createElement('details');
    details.className = 'map-list';
    details.open = !!open;
    const sum = document.createElement('summary');
    sum.textContent = 'Ver lista de spots';
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    ['Spot', 'Olas', 'Periodo', 'Viento'].forEach(h => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
    const body = table.createTBody();
    rows.forEach(({ id, info }) => {
        const r = body.insertRow();
        const nameCell = r.insertCell();
        const dot = document.createElement('i');
        const bin = binFor(info && info.max);
        dot.style.setProperty('--c', bin ? bin.color : 'var(--wave-none)');
        const a = document.createElement('a');
        a.href = '/' + id;
        a.textContent = SPOTS[id].name;
        if (mapState.favs.includes(id)) a.insertAdjacentHTML('beforeend', ' ' + monoIcon('star', 12, true));
        nameCell.append(dot, a);
        const cells = info
            ? [`${info.min.toFixed(1)}–${info.max.toFixed(1)} m`, info.period ? `${Math.round(info.period)} s` : '—',
               info.windSpeed != null ? `${Math.round(info.windSpeed)} km/h · ${getWindStatus(info.windSpeed, info.windDir, SPOTS[id].facing)}` : '—']
            : ['—', '—', '—'];
        cells.forEach(text => { const c = r.insertCell(); c.className = 'num'; c.textContent = text; });
    });
    details.append(sum, table);
    mapExtra.replaceChildren(details);
}

// Spots a km apart overlap at coast-wide zoom: pins that would touch are lined up out at sea, in a row
// parallel to the coast and in the same order as the spots along it (north to south here), so the thin
// leader lines to each spot's real position (a dot) run side by side instead of crossing.
function spreadPins(L) {
    const { map, markers, leaders } = mapState;
    const minGap = window.innerWidth < 600 ? 40 : 46;
    leaders.clearLayers();
    const items = Object.keys(markers).map(id => ({
        id, real: L.latLng(SPOTS[id].lat, SPOTS[id].lon),
        pt: map.latLngToLayerPoint([SPOTS[id].lat, SPOTS[id].lon])
    }));
    // A pin joins every group it is closer than minGap to, merging them, so a chain of spots along
    // the coast becomes one row instead of two rows that could overlap each other
    let groups = [];
    items.forEach(item => {
        const near = groups.filter(gr => gr.some(o => o.pt.distanceTo(item.pt) < minGap));
        groups = groups.filter(gr => !near.includes(gr));
        groups.push([item, ...near.flat()]);
    });
    // Rows of neighbouring groups can still land on each other: merge any groups whose pins touch and
    // lay them out again until no two pins overlap
    let layouts = groups.map(layoutRow);
    for (let merged = true; merged;) {
        merged = false;
        outer: for (let i = 0; i < layouts.length; i++) for (let j = i + 1; j < layouts.length; j++) {
            if (layouts[i].some(p => layouts[j].some(q => p.pos.distanceTo(q.pos) < minGap))) {
                const group = [...layouts[i], ...layouts[j]].map(p => p.item);
                layouts = layouts.filter((_, k) => k !== i && k !== j).concat([layoutRow(group)]);
                merged = true;
                break outer;
            }
        }
    }

    layouts.forEach(row => row.forEach(({ item, pos }) => {
        if (row.length === 1) { markers[item.id].setLatLng(item.real); return; }
        const latLng = map.layerPointToLatLng(pos);
        markers[item.id].setLatLng(latLng);
        L.polyline([item.real, latLng], { color: '#52514e', weight: 1, opacity: 0.8, interactive: false }).addTo(leaders);
        L.circleMarker(item.real, { radius: 3, color: '#fff', weight: 1.5, fillColor: '#52514e', fillOpacity: 1, interactive: false }).addTo(leaders);
    }));

    // Pin positions (layer points) for one group; a lone spot stays where it is
    function layoutRow(group) {
        if (group.length === 1) return [{ item: group[0], pos: group[0].pt }];
        // Out-to-sea direction = mean of the beaches' facing bearings (screen y grows downwards);
        // the coast runs along its perpendicular.
        const rad = deg => deg * Math.PI / 180;
        const sx = group.reduce((s, i) => s + Math.sin(rad(SPOTS[i.id].facing)), 0);
        const sy = group.reduce((s, i) => s - Math.cos(rad(SPOTS[i.id].facing)), 0);
        const len = Math.hypot(sx, sy) || 1;
        const sea = { x: sx / len, y: sy / len };
        const along = { x: -sea.y, y: sea.x };
        const dot = (p, v) => p.x * v.x + p.y * v.y;

        // Each pin keeps its spot's position along the coast, pushed apart just enough not to touch,
        // then the row is re-centred on the spots
        const sorted = [...group].sort((a, b) => dot(a.pt, along) - dot(b.pt, along));
        const slots = sorted.map(i => dot(i.pt, along));
        for (let k = 1; k < slots.length; k++) slots[k] = Math.max(slots[k], slots[k - 1] + minGap);
        const shift = sorted.reduce((s, i, k) => s + dot(i.pt, along) - slots[k], 0) / sorted.length;

        // The row sits a pin's width beyond the most seaward spot, so no pin covers another spot's dot or line
        const rowOut = Math.max(...sorted.map(i => dot(i.pt, sea))) + minGap + 4;
        return sorted.map((item, k) => {
            const a = slots[k] + shift;
            return { item, pos: L.point(along.x * a + sea.x * rowOut, along.y * a + sea.y * rowOut) };
        });
    }
}

async function initMap() {
    mapCanvas.innerHTML = `<div class="cal-message">Cargando...</div>`;
    let L, result, favs = [];
    try {
        [L, result] = await Promise.all([loadLeaflet(), fetchMapData()]);
    } catch (err) {
        console.error('Map error:', err);
        mapCanvas.innerHTML = `<div class="cal-message">Error al cargar forecast</div>`;
        return;
    }
    // Favourites get a dark ring (optional; the map works logged out)
    try {
        const { data: { session } } = window.supabaseClient ? await window.supabaseClient.auth.getSession() : { data: {} };
        if (session) {
            const { data } = await window.supabaseClient.from('favorites').select('spot_id').eq('user_id', session.user.id);
            favs = (data || []).map(f => f.spot_id);
        }
    } catch (err) {
        console.error('Map favourites error:', err);
    }

    mapCanvas.innerHTML = '';
    const map = L.map(mapCanvas, { scrollWheelZoom: false, zoomSnap: 0.5 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    mapState = { map, markers: {}, data: result.data, dates: result.dates, day: 0, favs, leaders: L.layerGroup().addTo(map) };

    Object.entries(SPOTS).forEach(([id, s]) => {
        const marker = L.marker([s.lat, s.lon], { icon: pinIcon(L, id), keyboard: true, title: s.name, riseOnHover: true })
            .bindPopup(popupContent(id))
            .bindTooltip('', { direction: 'top' })
            .addTo(map);
        mapState.markers[id] = marker;
    });
    map.fitBounds(L.latLngBounds(Object.values(SPOTS).map(s => [s.lat, s.lon])), { padding: [36, 36] });
    spreadPins(L);
    map.on('zoomend', () => spreadPins(L));

    // Day chips with the real weekday, e.g. "Hoy", "Mañana", "Mié 7"
    mapDays.innerHTML = '';
    result.dates.forEach((day, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const d = new Date(day + 'T12:00:00');
        btn.textContent = i < 2 ? MAP_DAY_LABELS[i] : `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;
        btn.addEventListener('click', () => { mapState.day = i; renderMapDay(L); });
        mapDays.appendChild(btn);
    });

    document.getElementById('map-legend').innerHTML = MAP_BINS.map(b => `<span><i style="--c:${b.color}"></i><b>${b.quality}</b>&nbsp;${b.label}</span>`).join('')
        + `<span>Altura máxima entre las 07:00 y las 20:00</span>`;
    renderMapDay(L);
}

let mapLoaded = false;
mapTool.addEventListener('toggle', () => {
    if (!mapTool.open) return;
    if (mapLoaded) {
        // The map was hidden while closed: let Leaflet re-measure its container
        if (mapState) setTimeout(() => mapState.map.invalidateSize(), 50);
        return;
    }
    mapLoaded = true;
    initMap();
});
window.addEventListener('resize', () => { if (mapState && mapTool.open) mapState.map.invalidateSize(); });

// ── Spot filter: pick a day, set conditions, see which spots match hour by hour ──
// An hour matches when it passes every condition at once (same rule as the advanced email alerts);
// a spot matches when at least one hour of the chosen time band does.
// [first hour, last hour] of each time band; each hour covers hh:00–hh+1:00
const FLT_BANDS = { early: [FIRST_HOUR, 9], midmorning: [10, 12], afternoon: [13, 16], evening: [17, LAST_HOUR] };
const FLT_MAX_SIZE_NO_LIMIT = 4, FLT_MAX_WIND_NO_LIMIT = 50;
// Energy sliders step through ENERGY_STEPS. Min slider (0–13 in herramientas.html): index 0 = any. Max slider (1–14):
// the index past the last step = no limit.
// Clean wind beats a bit more size when ranking (same weights as the email alerts)
const FLT_WIND_FACTOR = { 'Glassy': 1.2, 'Off-shore': 1.15, 'Cross-shore': 0.95, 'On-shore': 0.75 };
const FLT_CHECKS = [ // in the order a failing spot's reason is reported
    { key: 'size',   reason: 'Olas fuera del rango',      test: (h, f) => h.wave >= f.minSize && (f.maxSize >= FLT_MAX_SIZE_NO_LIMIT || h.wave <= f.maxSize) },
    { key: 'energy', reason: 'Energía fuera del rango',   test: (h, f) => (h.energy || 0) >= f.minEnergy && (h.energy || 0) <= f.maxEnergy },
    { key: 'period', reason: 'Periodo demasiado corto',   test: (h, f) => (h.period || 0) >= f.minPeriod },
    { key: 'wind',   reason: 'Demasiado viento',          test: (h, f) => f.maxWind >= FLT_MAX_WIND_NO_LIMIT || h.windSpeed <= f.maxWind },
    { key: 'type',   reason: 'Tipo de viento no elegido', test: (h, f) => f.windTypes.includes(h.status) }
];

const fltTool = document.getElementById('tool-filter');
const fltDays = document.getElementById('flt-days');
const fltResults = document.getElementById('flt-results');
const fltCount = document.getElementById('flt-count');
const fltInputs = {
    minSize: document.getElementById('flt-min-size'),
    maxSize: document.getElementById('flt-max-size'),
    minEnergy: document.getElementById('flt-min-energy'),
    maxEnergy: document.getElementById('flt-max-energy'),
    minPeriod: document.getElementById('flt-min-period'),
    maxWind: document.getElementById('flt-max-wind'),
    favs: document.getElementById('flt-favs'),
    cams: document.getElementById('flt-cams'),
    sort: document.getElementById('flt-sort')
};
const fltWindTypes = [...document.querySelectorAll('#flt-wind-types input')];
const fltBands = [...document.querySelectorAll('#flt-band input')];
let fltState = null; // { data: { id: { 'YYYY-MM-DD': [hour] } }, dates, day, favs, loggedIn }

// Hourly waves + wind for every spot and every forecast day, daylight hours only
async function fetchFilterData() {
    const ids = Object.keys(SPOTS);
    const lats = ids.map(id => SPOTS[id].lat).join(',');
    const lons = ids.map(id => SPOTS[id].lon).join(',');
    const [marine, weather] = await Promise.all([
        fetchMarine(ids.map(id => SPOTS[id]), FORECAST_DAYS), // blended wave models (common.js)
        getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=${FORECAST_DAYS}`)
    ]);
    const data = {};
    const dateSet = new Set();
    ids.forEach((id, i) => {
        const m = marine[i].hourly, w = weather[i].hourly;
        const windAt = {};
        w.time.forEach((tm, j) => { windAt[tm] = { speed: w.wind_speed_10m[j], dir: w.wind_direction_10m[j] }; });
        const days = {};
        m.time.forEach((tm, j) => {
            const hour = parseInt(tm.slice(11, 13), 10);
            const wave = m.wave_height[j];
            const wind = windAt[tm];
            if (wave == null || !wind || wind.speed == null || hour < FIRST_HOUR || hour > LAST_HOUR) return;
            const day = tm.slice(0, 10);
            dateSet.add(day);
            (days[day] || (days[day] = [])).push({
                date: day, hour, wave, period: m.wave_period[j], energy: waveEnergy(wave, m.energy_period[j]),
                windSpeed: wind.speed, status: getWindStatus(wind.speed, wind.dir, SPOTS[id].facing)
            });
        });
        data[id] = days;
    });
    return { data, dates: [...dateSet].sort().slice(0, FORECAST_DAYS) };
}

function fltFilters() {
    return {
        minSize: +fltInputs.minSize.value,
        maxSize: +fltInputs.maxSize.value,
        minEnergy: ENERGY_STEPS[+fltInputs.minEnergy.value],
        maxEnergy: ENERGY_STEPS[+fltInputs.maxEnergy.value] ?? Infinity, // past the last step = no limit
        minPeriod: +fltInputs.minPeriod.value,
        maxWind: +fltInputs.maxWind.value,
        windTypes: fltWindTypes.filter(i => i.checked).map(i => i.value),
        // Chosen bands; empty = any hour
        bands: fltBands.filter(i => i.checked && i.value !== 'any').map(i => i.value),
        favsOnly: fltInputs.favs.checked,
        camsOnly: fltInputs.cams.checked
    };
}

function updateFltLabels() {
    const f = fltFilters();
    document.getElementById('flt-min-size-val').textContent = f.minSize === 0 ? 'Cualquiera' : `${f.minSize.toFixed(1)}m+`;
    document.getElementById('flt-max-size-val').textContent = f.maxSize >= FLT_MAX_SIZE_NO_LIMIT ? 'Sin límite' : `≤ ${f.maxSize.toFixed(1)}m`;
    document.getElementById('flt-min-energy-val').textContent = f.minEnergy === 0 ? 'Cualquiera' : `${f.minEnergy} kJ+`;
    document.getElementById('flt-max-energy-val').textContent = f.maxEnergy === Infinity ? 'Sin límite' : `≤ ${f.maxEnergy} kJ`;
    document.getElementById('flt-min-period-val').textContent = f.minPeriod === 0 ? 'Cualquiera' : `${f.minPeriod} s+`;
    document.getElementById('flt-max-wind-val').textContent = f.maxWind >= FLT_MAX_WIND_NO_LIMIT ? 'Sin límite' : `≤ ${f.maxWind} km/h`;
}

// "08–11 h, 15–17 h" from the matching hours (each hour covers hh:00 to hh+1:00)
function hourRanges(hours) {
    const ranges = [];
    hours.forEach(h => {
        const last = ranges[ranges.length - 1];
        if (last && h === last[1]) last[1] = h + 1; else ranges.push([h, h + 1]);
    });
    return ranges.map(([a, b]) => `${pad(a)}–${pad(b)} h`).join(', ');
}

// "Hoy", "Mañana", "Mié 14"
function fltDayLabel(date) {
    const i = fltState.dates.indexOf(date);
    const d = new Date(date + 'T12:00:00');
    return i >= 0 && i < 2 ? MAP_DAY_LABELS[i] : `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`;
}

// Selected days (indexes into fltState.dates); an empty set means any day
const fltSelectedDates = () => (fltState.days.size ? fltState.dates.filter((_, i) => fltState.days.has(i)) : fltState.dates);
const inBands = (hour, bands) => !bands.length || bands.some(b => hour >= FLT_BANDS[b][0] && hour <= FLT_BANDS[b][1]);

// One spot over the chosen days and bands: { match, best, byDay: [[date, hours]], score, reason }
function evaluateSpot(id, f) {
    if (f.favsOnly && !fltState.favs.includes(id)) return { match: false, reason: 'No es favorito' };
    if (f.camsOnly && !SPOTS[id].cam) return { match: false, reason: 'Sin webcam' };
    const hours = fltSelectedDates().flatMap(date => (fltState.data[id][date] || []).filter(h => inBands(h.hour, f.bands)));
    if (!hours.length) return { match: false, reason: 'Sin datos' };
    const matches = hours.filter(h => FLT_CHECKS.every(c => c.test(h, f)));
    if (!matches.length) {
        const blocker = FLT_CHECKS.find(c => !hours.some(h => c.test(h, f)));
        return { match: false, reason: blocker ? blocker.reason : 'Las condiciones no coinciden a la vez' };
    }
    const score = h => h.wave * FLT_WIND_FACTOR[h.status] * (h.windSpeed > 25 ? 0.8 : 1);
    const best = matches.reduce((a, b) => (score(b) > score(a) ? b : a));
    const byDay = [];
    matches.forEach(h => {
        const last = byDay[byDay.length - 1];
        if (last && last[0] === h.date) last[1].push(h.hour); else byDay.push([h.date, [h.hour]]);
    });
    return { match: true, best, score: score(best), byDay };
}

// "Cumple: Hoy 08–11 h · Mié 14 07–09 h" (one day selected: just the hours); long lists are cut short
function matchText(byDay) {
    const MAX_DAYS = 3;
    if (fltState.days.size === 1) return `Cumple de ${hourRanges(byDay[0][1])}`;
    const shown = byDay.slice(0, MAX_DAYS).map(([date, hours]) => `${fltDayLabel(date)} ${hourRanges(hours)}`).join(' · ');
    const more = byDay.length - MAX_DAYS;
    return `Cumple: ${shown}${more > 0 ? ` · ${'+{n} días más'.replace('{n}', more)}` : ''}`;
}

function renderFilter() {
    if (!fltState) return;
    updateFltLabels();
    renderFltSummary();
    const f = fltFilters();
    fltDays.querySelectorAll('button').forEach(b => {
        const on = b.dataset.day === 'any' ? !fltState.days.size : fltState.days.has(+b.dataset.day);
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on);
    });

    const all = Object.keys(SPOTS).map(id => ({ id, ...evaluateSpot(id, f) }));
    const sorters = {
        score: (a, b) => b.score - a.score,
        wave: (a, b) => b.best.wave - a.best.wave,
        energy: (a, b) => (b.best.energy || 0) - (a.best.energy || 0),
        wind: (a, b) => a.best.windSpeed - b.best.windSpeed,
        name: (a, b) => SPOTS[a.id].name.localeCompare(SPOTS[b.id].name)
    };
    const hits = all.filter(s => s.match).sort(sorters[fltInputs.sort.value] || sorters.score);
    const misses = all.filter(s => !s.match);
    fltCount.textContent = '{n} de {total} spots'.replace('{n}', hits.length).replace('{total}', all.length);

    const cards = hits.map(({ id, best, byDay }) => {
        const s = SPOTS[id];
        const bin = binFor(best.wave);
        const tags = (fltState.favs.includes(id) ? `<span class="flt-tag">${monoIcon('star', 10, true)} Favorito</span>` : '')
            + (s.cam ? `<span class="flt-tag">${monoIcon('video', 11)} Webcam</span>` : '');
        return `
            <a class="flt-card" href="/${id}" style="--c:${bin ? bin.color : 'var(--wave-none)'}">
                <div class="flt-size">${best.wave.toFixed(1)}m<small>${fltState.days.size === 1 ? '' : fltDayLabel(best.date) + ' '}${pad(best.hour)}:00</small></div>
                <div class="flt-main">
                    <div class="flt-name">${s.name}${tags}</div>
                    <div class="flt-line">${monoIcon('timer', 13)} ${best.period ? Math.round(best.period) + ' s' : '—'} · ${monoIcon('wind', 13)} ${Math.round(best.windSpeed)} km/h ${best.status}${best.energy != null ? ` · ${monoIcon('bolt', 13)} ${Math.round(best.energy)} kJ` : ''}</div>
                    <div class="flt-hours">${monoIcon('clock', 12)} ${matchText(byDay)}</div>
                </div>
                <svg class="flt-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </a>`;
    }).join('');

    const openOut = fltResults.querySelector('.flt-out') && fltResults.querySelector('.flt-out').open;
    const out = misses.length ? `
        <details class="flt-out"${openOut ? ' open' : ''}>
            <summary>${'{n} spots no cumplen los filtros'.replace('{n}', misses.length)}</summary>
            <ul>${misses.map(m => `<li><a href="/${m.id}">${SPOTS[m.id].name}</a><span>${m.reason}</span></li>`).join('')}</ul>
        </details>` : '';

    fltResults.innerHTML = (hits.length
        ? `<div class="flt-list">${cards}</div>`
        : `<div class="cal-message">Ningún spot cumple estos filtros en los días y horas elegidos. Prueba a relajar alguno.</div>`)
        + out
        + `<p class="cal-note">Se comprueba hora a hora entre las 07:00 y las 20:00 de los días y franjas elegidos: un spot aparece si al menos una hora cumple todos los filtros a la vez. La cifra grande es la mejor de esas horas.</p>`;
}

function resetFilter() {
    fltInputs.minSize.value = 0;
    fltInputs.maxSize.value = FLT_MAX_SIZE_NO_LIMIT;
    fltInputs.minEnergy.value = 0;
    fltInputs.maxEnergy.value = ENERGY_STEPS.length; // no limit
    fltInputs.minPeriod.value = 0;
    fltInputs.maxWind.value = FLT_MAX_WIND_NO_LIMIT;
    fltWindTypes.forEach(i => { i.checked = true; });
    fltBands.forEach(i => { i.checked = i.value === 'any'; });
    fltInputs.favs.checked = false;
    fltInputs.cams.checked = false;
    fltInputs.sort.value = 'score';
    if (fltState) fltState.days = new Set([0]);
    renderFilter();
}

// ── Light filter UI: presets on top, the fine controls folded away, active filters as removable chips ──
// Wave and wind conditions, as raw input values (slider positions); presets only touch these
const FLT_CONDITIONS = ['minSize', 'maxSize', 'minEnergy', 'maxEnergy', 'minPeriod', 'maxWind', 'windTypes'];
const fltNoFilter = () => ({ minSize: 0, maxSize: FLT_MAX_SIZE_NO_LIMIT, minEnergy: 0, maxEnergy: ENERGY_STEPS.length,
    minPeriod: 0, maxWind: FLT_MAX_WIND_NO_LIMIT, windTypes: fltWindTypes.map(i => i.value) });
// Each preset lists what it changes; every other condition goes back to "no filter" (minEnergy is an ENERGY_STEPS index)
const FLT_PRESETS = {
    any:      {},
    beginner: { minSize: 0.3, maxSize: 1, maxWind: 20 },
    surf:     { minSize: 0.6, maxWind: 25 },
    good:     { minSize: 1, minPeriod: 5, minEnergy: ENERGY_STEPS.indexOf(40), windTypes: ['Glassy', 'Off-shore', 'Cross-shore'] }
};
const FLT_WIND_NAMES = { 'Glassy': 'sin viento', 'Off-shore': 'terral', 'Cross-shore': 'cruzado', 'On-shore': 'de mar' };
const FLT_BAND_NAMES = { early: 'Primera hora', midmorning: 'Media mañana', afternoon: 'Tarde', evening: 'Última hora' };

function readFltConditions() {
    const v = {};
    FLT_CONDITIONS.forEach(k => { if (k !== 'windTypes') v[k] = +fltInputs[k].value; });
    v.windTypes = fltWindTypes.filter(i => i.checked).map(i => i.value);
    return v;
}
function writeFltConditions(v) {
    FLT_CONDITIONS.forEach(k => { if (k !== 'windTypes') fltInputs[k].value = v[k]; });
    fltWindTypes.forEach(i => { i.checked = v.windTypes.includes(i.value); });
}
const sameCondition = (a, b) => (Array.isArray(a) ? [...a].sort().join() === [...b].sort().join() : a === b);

// The active filters, each with a label and how to undo it
function fltActiveFilters() {
    const v = readFltConditions(), none = fltNoFilter(), list = [];
    const undo = keys => () => { const cur = readFltConditions(); keys.forEach(k => { cur[k] = none[k]; }); writeFltConditions(cur); };
    if (v.minSize > none.minSize) list.push({ text: `Olas ≥ ${v.minSize.toFixed(1)} m`, undo: undo(['minSize']) });
    if (v.maxSize < none.maxSize) list.push({ text: `Olas ≤ ${v.maxSize.toFixed(1)} m`, undo: undo(['maxSize']) });
    if (v.minEnergy > 0) list.push({ text: `Energía ≥ ${ENERGY_STEPS[v.minEnergy]} kJ`, undo: undo(['minEnergy']) });
    if (v.maxEnergy < none.maxEnergy) list.push({ text: `Energía ≤ ${ENERGY_STEPS[v.maxEnergy]} kJ`, undo: undo(['maxEnergy']) });
    if (v.minPeriod > 0) list.push({ text: `Periodo ≥ ${v.minPeriod} s`, undo: undo(['minPeriod']) });
    if (v.maxWind < none.maxWind) list.push({ text: `Viento ≤ ${v.maxWind} km/h`, undo: undo(['maxWind']) });
    if (!sameCondition(v.windTypes, none.windTypes)) {
        list.push({ text: `Viento: ${v.windTypes.map(t => FLT_WIND_NAMES[t]).join(', ') || 'ninguno'}`, undo: undo(['windTypes']) });
    }
    const bands = fltBands.filter(i => i.checked && i.value !== 'any').map(i => i.value);
    if (bands.length) list.push({ text: bands.map(b => FLT_BAND_NAMES[b]).join(', '), undo: () => fltBands.forEach(i => { i.checked = i.value === 'any'; }) });
    if (fltInputs.favs.checked) list.push({ text: 'Solo favoritos', undo: () => { fltInputs.favs.checked = false; } });
    if (fltInputs.cams.checked) list.push({ text: 'Solo con webcam', undo: () => { fltInputs.cams.checked = false; } });
    return list;
}

function renderFltSummary() {
    const v = readFltConditions();
    const preset = Object.keys(FLT_PRESETS).find(p => {
        const target = { ...fltNoFilter(), ...FLT_PRESETS[p] };
        return FLT_CONDITIONS.every(k => sameCondition(v[k], target[k]));
    });
    document.querySelectorAll('#flt-presets button').forEach(b => {
        b.classList.toggle('active', b.dataset.preset === preset);
        b.setAttribute('aria-pressed', b.dataset.preset === preset);
    });
    const active = fltActiveFilters();
    const badge = document.getElementById('flt-badge');
    badge.hidden = !active.length;
    badge.textContent = active.length;
    const box = document.getElementById('flt-active');
    box.replaceChildren(...active.map(a => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = 'Quitar este filtro';
        btn.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        btn.prepend(a.text);
        btn.addEventListener('click', () => { a.undo(); renderFilter(); });
        return btn;
    }));
}

document.querySelectorAll('#flt-presets button').forEach(btn => btn.addEventListener('click', () => {
    writeFltConditions({ ...fltNoFilter(), ...FLT_PRESETS[btn.dataset.preset] });
    renderFilter();
}));

// "Cualquier hora" and the bands exclude each other; unticking every band goes back to any hour
fltBands.forEach(input => input.addEventListener('change', () => {
    const any = fltBands.find(i => i.value === 'any');
    if (input === any && any.checked) fltBands.forEach(i => { i.checked = i === any; });
    else if (input !== any && input.checked) any.checked = false;
    if (!fltBands.some(i => i.checked)) any.checked = true;
}));

async function initFilter() {
    let result;
    try {
        result = await fetchFilterData();
    } catch (err) {
        console.error('Filter error:', err);
        fltResults.innerHTML = `<div class="cal-message">Error al cargar forecast</div>`;
        return;
    }
    // Favourites filter needs an account (optional; everything else works logged out)
    let favs = [], loggedIn = false;
    try {
        const { data: { session } } = window.supabaseClient ? await window.supabaseClient.auth.getSession() : { data: {} };
        if (session) {
            loggedIn = true;
            const { data } = await window.supabaseClient.from('favorites').select('spot_id').eq('user_id', session.user.id);
            favs = (data || []).map(f => f.spot_id);
        }
    } catch (err) {
        console.error('Filter favourites error:', err);
    }
    if (!loggedIn || !favs.length) {
        fltInputs.favs.disabled = true;
        const hint = document.getElementById('flt-favs-hint');
        hint.innerHTML = loggedIn ? 'Añade spots a favoritos para usar este filtro.' : `<a href="/login">Inicia sesión</a> para filtrar por tus favoritos.`;
        hint.style.display = 'block';
    }

    // days: indexes of the chosen days (starts on today); empty = any day
    fltState = { data: result.data, dates: result.dates, days: new Set([0]), favs };
    fltDays.innerHTML = '';
    const dayChip = (value, label) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.day = value;
        btn.textContent = label;
        btn.addEventListener('click', () => {
            if (value === 'any') fltState.days.clear();
            else if (fltState.days.has(value)) fltState.days.delete(value); // unticking the last day = any day
            else fltState.days.add(value);
            renderFilter();
        });
        fltDays.appendChild(btn);
    };
    dayChip('any', 'Cualquier día');
    result.dates.forEach((day, i) => dayChip(i, fltDayLabel(day)));
    renderFilter();
}

[fltInputs.minSize, fltInputs.maxSize, fltInputs.minEnergy, fltInputs.maxEnergy, fltInputs.minPeriod, fltInputs.maxWind].forEach(el => el.addEventListener('input', renderFilter));
[...fltWindTypes, ...fltBands, fltInputs.favs, fltInputs.cams, fltInputs.sort].forEach(el => el.addEventListener('change', renderFilter));
document.getElementById('flt-reset').addEventListener('click', resetFilter);
updateFltLabels();

let fltLoaded = false;
fltTool.addEventListener('toggle', () => {
    if (!fltTool.open || fltLoaded) return;
    fltLoaded = true;
    sessionReady.then(session => { if (session) initFilter(); }); // locked without an account
});

// ── Tool order: saved per user (Supabase metadata when logged in, this browser otherwise) ──
const toolsBox = document.getElementById('tools');
const orderBtn = document.getElementById('order-btn');
const orderBtnText = document.getElementById('order-btn-text');
const ORDER_KEY = 'toolsOrder';
const getOrder = () => [...toolsBox.querySelectorAll(':scope > .tool')].map(el => el.id);

function applyOrder(order) {
    if (!Array.isArray(order)) return;
    // Saved ids first (skipping unknown ones), then any tool added after the order was saved
    const ids = [...order.filter(id => document.getElementById(id)), ...getOrder().filter(id => !order.includes(id))];
    ids.forEach(id => toolsBox.appendChild(document.getElementById(id)));
    updateMoveButtons();
}

function updateMoveButtons() {
    const tools = [...toolsBox.querySelectorAll(':scope > .tool')];
    tools.forEach((tool, i) => {
        tool.querySelector('.move-up').disabled = i === 0;
        tool.querySelector('.move-down').disabled = i === tools.length - 1;
    });
}

// Up/down buttons inside each tool header (only visible while editing)
toolsBox.querySelectorAll(':scope > .tool').forEach(tool => {
    const box = document.createElement('div');
    box.className = 'tool-move';
    box.innerHTML = `
        <button type="button" class="move-up" aria-label="Subir"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
        <button type="button" class="move-down" aria-label="Bajar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>`;
    tool.querySelector('summary').appendChild(box);
    box.querySelector('.move-up').addEventListener('click', e => {
        e.preventDefault();
        const prev = tool.previousElementSibling;
        if (prev) toolsBox.insertBefore(tool, prev);
        updateMoveButtons();
        e.currentTarget.focus();
    });
    box.querySelector('.move-down').addEventListener('click', e => {
        e.preventDefault();
        const next = tool.nextElementSibling;
        if (next) toolsBox.insertBefore(next, tool);
        updateMoveButtons();
        e.currentTarget.focus();
    });
    // While editing, clicking the header must not open/close the tool
    tool.querySelector('summary').addEventListener('click', e => {
        if (toolsBox.classList.contains('editing')) e.preventDefault();
    });
});

orderBtnText.textContent = 'Editar orden';
orderBtn.addEventListener('click', async () => {
    const editing = toolsBox.classList.toggle('editing');
    orderBtn.classList.toggle('done', editing);
    orderBtnText.textContent = editing ? 'Hecho' : 'Editar orden';
    if (editing) {
        toolsBox.querySelectorAll(':scope > .tool').forEach(tool => { tool.open = false; });
        return;
    }
    // Save
    const order = getOrder();
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (e) {}
    if (window.supabaseClient) {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            const { error } = await window.supabaseClient.auth.updateUser({ data: { tools_order: order } });
            if (error) console.error('Saving tool order failed:', error);
        }
    }
});

// This browser's order right away (no jump), then the account's order once Supabase is ready
try { applyOrder(JSON.parse(localStorage.getItem(ORDER_KEY))); } catch (e) {}
updateMoveButtons();
onReady(async () => {
    if (!window.supabaseClient) return;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    const saved = session && session.user.user_metadata && session.user.user_metadata.tools_order;
    if (saved) {
        applyOrder(saved);
        try { localStorage.setItem(ORDER_KEY, JSON.stringify(saved)); } catch (e) {}
    }
});

// The forecast is only downloaded the first time the calendar is opened
const calendarTool = document.getElementById('tool-calendar');
let calendarLoaded = false;
calendarTool.addEventListener('toggle', () => {
    if (!calendarTool.open || calendarLoaded) return;
    calendarLoaded = true;
    onReady(() => loadCalendar().catch(err => {
        console.error('Calendar error:', err);
        message('Error al cargar forecast');
    }));
});
