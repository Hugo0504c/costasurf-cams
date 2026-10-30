// Script of perfil.html. It is an external file (not inline) so the Content-Security-Policy can forbid inline scripts.
// Loaded without defer at the end of the page, so it runs at the same moment the inline script used to.

    let currentUser = null;
    const MAX_NAME = 40, MAX_URL = 500;

    // Only plain https image links are accepted as avatar
    function safeImageUrl(value) {
        if (!value || value.length > MAX_URL) return '';
        try {
            const url = new URL(value);
            return url.protocol === 'https:' ? url.href : '';
        } catch (e) {
            return '';
        }
    }

    function updateProfileUI(user) {
        const meta = user.user_metadata || {};
        const name = meta.full_name || '';
        const avatar = meta.avatar_url || '';
        
        document.getElementById('user-email').innerText = user.email;
        
        if (name) {
            document.getElementById('user-name').innerText = 'Hola,' + ' ' + name;
        } else {
            document.getElementById('user-name').innerText = 'Hola,';
        }
        
        // Built with DOM calls (never innerHTML) so a crafted avatar URL or name can't inject HTML/script
        const avatarContainer = document.getElementById('avatar-container');
        const avatarUrl = safeImageUrl(avatar);
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.onerror = () => { avatarContainer.textContent = (name || user.email).charAt(0).toUpperCase(); };
            avatarContainer.replaceChildren(img);
        } else {
            avatarContainer.textContent = (name || user.email).charAt(0).toUpperCase();
        }

    }

    document.getElementById('edit-profile-btn').onclick = () => {
        const meta = currentUser.user_metadata || {};
        document.getElementById('edit-name').value = meta.full_name || '';
        document.getElementById('edit-avatar').value = meta.avatar_url || '';
        document.getElementById('edit-modal').style.display = 'flex';
    };

    document.getElementById('cancel-profile-btn').onclick = () => {
        document.getElementById('edit-modal').style.display = 'none';
    };

    document.getElementById('save-profile-btn').onclick = async () => {
        const btn = document.getElementById('save-profile-btn');
        btn.innerText = 'Guardando...';
        const newName = document.getElementById('edit-name').value.trim().slice(0, MAX_NAME);
        const rawAvatar = document.getElementById('edit-avatar').value.trim();
        const newAvatar = safeImageUrl(rawAvatar);
        if (rawAvatar && !newAvatar) {
            alert('La foto de perfil tiene que ser un enlace que empiece por https://');
            btn.innerText = 'Guardar';
            return;
        }

        const { data, error } = await window.supabaseClient.auth.updateUser({
            data: { full_name: newName, avatar_url: newAvatar }
        });
        
        if (!error) {
            currentUser = data.user;
            updateProfileUI(currentUser);
            document.getElementById('edit-modal').style.display = 'none';
        } else {
            alert('Error al guardar: ' + error.message);
        }
        btn.innerText = 'Guardar';
    };

    async function removeFav(spotId) {
        if (!currentUser) return;
        if (confirm('¿Quieres eliminar este spot de tus favoritos?')) {
            await window.supabaseClient.from('favorites').delete().eq('user_id', currentUser.id).eq('spot_id', spotId);
            loadFavorites();
        }
    }

    // GET json, retrying once; a failed response throws with its status/reason instead of breaking later
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

    // One request per API for all favourites (Open-Meteo takes comma-separated coordinates and returns one result per spot, in order).
    // Only today's hours are shown, so 2 days of data is enough.
    async function fetchForecasts(items) {
        if (!items.length) return;
        const lats = items.map(it => it.lat).join(',');
        const lons = items.map(it => it.lon).join(',');
        try {
            const [marine, weather] = await Promise.all([
                fetchMarine(items, 2), // blended wave models (common.js)
                getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=wind_speed_10m,wind_direction_10m&timezone=auto&forecast_days=2`)
            ]);
            // A single location comes back as an object instead of an array
            const weatherList = Array.isArray(weather) ? weather : [weather];
            items.forEach((it, i) => renderForecast(marine[i], weatherList[i], it.containerId, it.facing));
        } catch (err) {
            console.error('Forecast error:', err);
            items.forEach(it => {
                document.getElementById(it.containerId).innerHTML = `<div style="color:red;font-size:0.8rem;">Error al cargar forecast</div>`;
            });
        }
    }

    function renderForecast(d, w, containerId, facing) {
        try {
            const now = new Date();
            const currentIndex = d.hourly.time.findIndex(t => new Date(t) >= now);
            const idx = currentIndex !== -1 ? currentIndex : 0;

            let todayIndices = [];
            for(let i = 0; i < d.hourly.time.length; i++) {
                if (d.hourly.time[i].endsWith('T08:00')) {
                    todayIndices = [i, i+7, i+12].filter(idx => idx < d.hourly.time.length);
                    break;
                }
            }
            if (todayIndices.length === 0) {
                todayIndices = [idx, idx+3, idx+6];
            }
            
            let html = '<div class="forecast-grid" style="display: flex; gap:10px; margin-top:15px;">';
            todayIndices.forEach(i => {
                const labelStr = new Date(d.hourly.time[i]).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const waveH = d.hourly.wave_height[i];
                const energy = waveEnergy(waveH, d.hourly.energy_period[i]);
                const windSpeedKmh = w.hourly.wind_speed_10m[i] || 0; // Open-Meteo default unit is already km/h
                const windDir = w.hourly.wind_direction_10m[i];
                const windStatus = getWindStatus(windSpeedKmh, windDir, facing);
                
                html += `
                    <div class="forecast-hour" style="flex: 1; min-width:0; background: #f7f7f7; padding: 12px 5px; border-radius: 8px; text-align: center;">
                        <div class="time" style="font-weight: 700; color: #555; margin-bottom: 6px; font-size: 0.8rem; text-transform: uppercase;">${labelStr}</div>
                        <div class="wave" style="font-size: 1.1rem; font-weight: 800; color: var(--color-black);">${waveH !== null ? waveH.toFixed(1) + 'm' : '-'}</div>
                        <div style="font-size: 0.75rem; font-weight: 700; color: #555; margin-top: 3px;" title="Energía de las olas">${monoIcon('bolt', 11)} ${energy != null ? Math.round(energy) + ' kJ' : '—'}</div>
                        <div class="wind" style="font-size: 0.75rem; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 2px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(${(windDir + 180) % 360}deg);"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg> 
                            ${windStatus}
                        </div>
                    </div>
                `;
            });
            html += '</div>';

            document.getElementById(containerId).innerHTML = html;
        } catch (err) {
            console.error('Forecast render error for', containerId, err);
            document.getElementById(containerId).innerHTML = `<div style="color:red;font-size:0.8rem;">Error al cargar forecast</div>`;
        }
    }

    async function loadFavorites() {
        const container = document.getElementById('fav-container');
        const { data: favs, error } = await window.supabaseClient.from('favorites').select('spot_id').eq('user_id', currentUser.id);
        
        if (error) {
            const box = document.createElement('div');
            box.className = 'empty-state';
            box.textContent = 'Error cargando favoritos: ' + error.message;
            container.replaceChildren(box);
            return;
        }

        // spot_id comes from the database: only ids the site knows (fixed keys of SPOTS) are ever put into HTML,
        // so a crafted value can't inject markup or script
        const known = (favs || []).filter(f => Object.prototype.hasOwnProperty.call(SPOTS, f.spot_id));

        if (known.length === 0) {
            container.innerHTML = `<div class="empty-state">No tienes ningún spot guardado en favoritos todavía.<br><br><a href="index.html" style="color:#111;font-weight:bold;text-decoration:underline;">Explorar spots</a></div>`;
        } else {
            container.innerHTML = known.map((f, i) => {
                const info = SPOTS[f.spot_id];
                let mediaHtml = '';
                if (info.cam) {
                    mediaHtml = `<div class="video-wrapper" id="cam-${i}"></div>`;
                } else if (info.extLink) {
                    mediaHtml = `
                        <div class="video-wrapper" style="background:#f7f7f7;">
                            <a href="${info.extLink}" target="_blank" style="background:#111;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:0.9rem;">Ver webcam externa -></a>
                        </div>
                    `;
                } else {
                    mediaHtml = `<div class="video-wrapper" style="background:#f7f7f7;color:#888;">Sin cámara</div>`;
                }

                return `
                    <div class="fav-card">
                        <div class="fav-card-header">
<div>
    <h3 style="margin:0; font-size:1.3rem;">${info.name}</h3>
    <span style="font-size:0.9rem; color:#888; display:block; margin-top:4px;">${info.loc}</span>
</div>
<div style="display:flex; align-items:center; gap:10px;">
    <button type="button" class="remove-btn" title="Quitar de favoritos" data-spot="${f.spot_id}">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                            </div>
                        </div>
                        <div class="fav-card-body">
                            <div>
                                ${mediaHtml}
                                <a href="spot.html?id=${f.spot_id}" style="display:block; text-align:center; background:#111; color:#fff; padding:12px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.95rem; margin-top:15px; transition:background 0.2s;">Abrir página del spot &rarr;</a>
                            </div>
                            <div class="forecast-wrapper">
                                <h4>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M2 6c.6 0 1.2-.2 1.8-.6L4 5c1.4-1.1 3.4-1.1 4.8 0l.2.2c.6.4 1.2.6 1.8.6s1.2-.2 1.8-.6l.2-.2c1.4-1.1 3.4-1.1 4.8 0l.2.2c.6.4 1.2.6 1.8.6"></path><path d="M2 12c.6 0 1.2-.2 1.8-.6L4 11c1.4-1.1 3.4-1.1 4.8 0l.2.2c.6.4 1.2.6 1.8.6s1.2-.2 1.8-.6l.2-.2c1.4-1.1 3.4-1.1 4.8 0l.2.2c.6.4 1.2.6 1.8.6"></path><path d="M2 18c.6 0 1.2-.2 1.8-.6L4 17c1.4-1.1 3.4-1.1 4.8 0l.2.2c.6.4 1.2.6 1.8.6s1.2-.2 1.8-.6l.2-.2c1.4-1.1 3.4-1.1 4.8 0l.2.2c.6.4 1.2.6 1.8.6"></path></svg>
                                    Previsión
                                </h4>
                                <div id="forecast-container-${i}">Cargando...</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.remove-btn').forEach(btn => btn.addEventListener('click', () => removeFav(btn.dataset.spot)));

            // Fill in the cams (latest snapshot + link to the live cam) and the forecasts
            const forecastItems = [];
            known.forEach((f, i) => {
                const info = SPOTS[f.spot_id];
                const containerId = `forecast-container-${i}`;
                if (info.cam) attachCam(document.getElementById(`cam-${i}`), info);
                if (info.lat && info.lon) {
                    forecastItems.push({ lat: info.lat, lon: info.lon, facing: info.facing, containerId });
                } else {
                    document.getElementById(containerId).innerHTML = 'No disponible';
                }
            });
            fetchForecasts(forecastItems);
        }
    }

    async function initProfile() {
        if (!window.supabaseClient) {
            window.location.href = 'login.html';
            return;
        }
        
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (!session) {
                window.location.href = 'login.html';
                return;
            }

            // Name, photo and alerts can also change from the Telegram bot (/cuenta, /alertas), which the browser's saved
            // session doesn't know about: read the account fresh from the server. If it no longer exists (deleted from
            // the bot), the saved session is useless: drop it and go to login.
            const { data: fresh, error: userError } = await window.supabaseClient.auth.getUser().catch(err => ({ data: null, error: err }));
            if (userError && userError.status && userError.status < 500) {
                await window.supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {});
                window.location.href = 'login.html';
                return;
            }
            currentUser = (fresh && fresh.user) || session.user;
            updateProfileUI(currentUser);
            alertsSwitch.checked = (currentUser.user_metadata || {}).alerts_enabled === true;

            loadFavorites();
        } catch (err) {
            window.location.href = 'login.html';
        }
    }

    // Turning alerts on saves it right away and opens the alerts tool to fine-tune them; turning off just saves
    const alertsSwitch = document.getElementById('profile-alerts');
    alertsSwitch.addEventListener('change', async () => {
        const on = alertsSwitch.checked;
        alertsSwitch.disabled = true;
        const { error } = await window.supabaseClient.auth.updateUser({ data: { alerts_enabled: on } });
        alertsSwitch.disabled = false;
        if (error) {
            alertsSwitch.checked = !on;
            alert('Error al guardar alertas: ' + error.message);
            return;
        }
        if (on) window.location.href = '/herramientas#alertas';
    });

    document.getElementById('logout-btn').onclick = async () => {
        if (window.supabaseClient) await window.supabaseClient.auth.signOut();
        window.location.href = 'index.html';
    };

    // Delete account: the user has to type the confirmation word; the server function does the deleting
    const DELETE_WORD = 'BORRAR';
    const deleteStart = document.getElementById('delete-start-btn');
    const deleteBox = document.getElementById('delete-confirm');
    const deleteWord = document.getElementById('delete-word');
    const deleteBtn = document.getElementById('delete-confirm-btn');
    const deleteMsg = document.getElementById('delete-msg');
    document.getElementById('delete-label').textContent = 'Escribe {word} para confirmar'.replace('{word}', DELETE_WORD);
    deleteStart.addEventListener('click', () => {
        deleteStart.style.display = 'none';
        deleteBox.style.display = 'flex';
        deleteWord.focus();
    });
    document.getElementById('delete-cancel-btn').addEventListener('click', () => {
        deleteBox.style.display = 'none';
        deleteStart.style.display = '';
        deleteWord.value = '';
        deleteBtn.disabled = true;
        deleteMsg.textContent = '';
    });
    deleteWord.addEventListener('input', () => {
        deleteBtn.disabled = deleteWord.value.trim().toUpperCase() !== DELETE_WORD;
    });
    deleteBtn.addEventListener('click', async () => {
        deleteBtn.disabled = true;
        deleteMsg.textContent = '';
        deleteBtn.textContent = 'Borrando...';
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (!session) { window.location.href = 'login.html'; return; }
            const res = await fetch('/.netlify/functions/delete-account', {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            // The account no longer exists: drop the local session and leave
            await window.supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {});
            alert('Tu cuenta se ha borrado. ¡Gracias por haber usado CostaSurf Cams!');
            window.location.href = '/';
        } catch (err) {
            console.error('Delete account error:', err);
            deleteMsg.textContent = 'No se ha podido borrar la cuenta. Inténtalo de nuevo más tarde.';
            deleteBtn.textContent = 'Borrar definitivamente';
            deleteBtn.disabled = false;
        }
    });

    onReady(initProfile);
