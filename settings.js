// ===== Settings panel =====
(function initializeSettings() {
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    const openButton = document.getElementById('btn-settings');
    const closeButton = document.getElementById('settings-close');
    if (!panel || !overlay || !openButton) return;

    function getShowCtbStopStreetName() {
        try {
            return localStorage.getItem(APP_CONFIG.showCtbStopStreetNameKey) === 'true';
        } catch {
            return false;
        }
    }

    window.getShowCtbStopStreetName = getShowCtbStopStreetName;

    const streetNameRow = document.createElement('div');
    streetNameRow.className = 'settings-item';
    streetNameRow.innerHTML = `
        <div class="settings-item-copy"><div class="settings-item-title">顯示巴士站所屬街道</div></div>
        <label class="settings-switch" title="顯示巴士站所屬街道">
            <input type="checkbox" aria-label="顯示巴士站所屬街道"${getShowCtbStopStreetName() ? ' checked' : ''}>
            <span class="settings-switch-track" aria-hidden="true"></span>
        </label>`;
    const streetNameToggle = streetNameRow.querySelector('input');
    streetNameToggle.addEventListener('change', () => {
        try {
            localStorage.setItem(APP_CONFIG.showCtbStopStreetNameKey, String(streetNameToggle.checked));
        } catch (error) {
            console.warn('Unable to save Citybus street-name preference:', error);
        }
        window.dispatchEvent(new Event('ctb-stop-street-name-setting-changed'));
    });
    panel.querySelector('.settings-body')?.appendChild(streetNameRow);

    const databaseUpdatedText = document.createElement('span');
    databaseUpdatedText.className = 'settings-item-subtext';

    const databaseRow = document.createElement('div');
    databaseRow.className = 'settings-item';
    databaseRow.innerHTML = '<div class="settings-item-copy"><div class="settings-item-title">資料庫更新</div></div>';
    databaseRow.querySelector('.settings-item-copy').appendChild(databaseUpdatedText);

    const updateButton = document.createElement('button');
    updateButton.className = 'settings-item-button';
    updateButton.type = 'button';
    updateButton.textContent = '更新';
    databaseRow.appendChild(updateButton);
    panel.querySelector('.settings-body')?.appendChild(databaseRow);

    function getLastUpdated() {
        if (typeof getRouteSearchLastUpdated === 'function') {
            const runtimeTimestamp = getRouteSearchLastUpdated();
            if (runtimeTimestamp) return runtimeTimestamp;
        }
        try {
            return JSON.parse(localStorage.getItem(APP_CONFIG.routeSearchCacheKey) || 'null')?.updatedAt || null;
        } catch {
            return null;
        }
    }

    function updateDatabaseTimestamp() {
        const updatedAt = getLastUpdated();
        if (!updatedAt) {
            databaseUpdatedText.textContent = '最後更新: --';
            return;
        }
        const date = new Date(updatedAt);
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: APP_CONFIG.timeZone,
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
        databaseUpdatedText.textContent = `最後更新: ${values.day}/${values.month}/${values.year} ${values.hour}:${values.minute}`;
    }

    updateButton.addEventListener('click', async () => {
        if (typeof refreshRouteSearchRoutes !== 'function') return;
        try {
            await refreshEtaWindowButton(updateButton, refreshRouteSearchRoutes, '更新');
            updateDatabaseTimestamp();
        } catch (error) {
            console.error('Unable to update route database:', error);
        }
    });
    window.addEventListener('route-search-updated', updateDatabaseTimestamp);
    updateDatabaseTimestamp();

    function openSettings() {
        panel.classList.remove('hidden');
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => {
            panel.classList.add('open');
            overlay.classList.add('open');
        });
        overlay.setAttribute('aria-hidden', 'false');
        openButton.setAttribute('aria-expanded', 'true');
    }

    function closeSettings() {
        panel.classList.remove('open');
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        openButton.setAttribute('aria-expanded', 'false');
        window.setTimeout(() => {
            if (!panel.classList.contains('open')) panel.classList.add('hidden');
            if (!overlay.classList.contains('open')) overlay.classList.add('hidden');
        }, 300);
    }

    openButton.addEventListener('click', openSettings);
    closeButton?.addEventListener('click', closeSettings);
    overlay.addEventListener('click', closeSettings);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel.classList.contains('open')) closeSettings();
    });
}());
