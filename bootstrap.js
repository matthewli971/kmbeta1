// ===== Location Bootstrap =====
// Renders the shared monitor shell directly in each location document, then loads its configuration.
(function bootstrapLocationPage() {
    const bootstrapScript = document.currentScript;
    const locationId = bootstrapScript.dataset.location || 'stp';
    const isCustomizable = bootstrapScript.dataset.customizable === 'true';
    let location = null;

    function renderSharedShell() {
        if (document.getElementById('app-title')) return;
        document.getElementById('app-root').innerHTML = `
            <div class="container">
                <div id="sticky-header-group">
                    <header id="header" class="app-header">
                        <div id="header-left">
                            <h1 id="app-title"></h1>
                            <span id="app-version"></span>
                        </div>
                        <div id="header-right">
                            <div id="day-countdown" aria-live="polite"></div>
                            <div id="clock"></div>
                            <div id="action-group">
                                ${isCustomizable ? `<button id="btn-stop-modify" class="stop-modify-button" type="button" title="修改顯示及匯入匯出" aria-label="修改顯示及匯入匯出">
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><g transform="translate(0 -1.5)"><path d="M4 20v-4L16.5 3.5a2.25 2.25 0 0 1 3.2 0L21 4.8a2.25 2.25 0 0 1 0 3.2L8 20H4Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><path d="m15.2 4.8 4 4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/></g><path d="M2.5 23h19" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg>
                                </button>` : ''}
                                <button id="btn-settings" type="button" title="設定" aria-label="設定">
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.38 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.61 3.61 0 0 1 8.4 12 3.61 3.61 0 0 1 12 8.4a3.61 3.61 0 0 1 3.6 3.6 3.61 3.61 0 0 1-3.6 3.6z" fill="currentColor"/></svg>
                                </button>
                                <button id="btn-pwa-install" class="hidden" type="button" title="安裝應用程式" aria-label="安裝應用程式">
                                    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/></svg>
                                </button>
                                <button id="btn-refresh" type="button">F5</button>
                            </div>
                        </div>
                    </header>
                    <div id="station-selector">
                        <div id="search-wrapper">
                            <input type="search" id="station-search" placeholder="搜尋巴士路線" autocomplete="off" aria-label="搜尋巴士路線" aria-controls="station-dropdown" aria-expanded="false">
                            <div id="station-dropdown" class="hidden" role="listbox" aria-label="巴士路線搜尋結果">
                                <div id="station-list"></div>
                            </div>
                        </div>
                        <div id="stop-search-wrapper">
                            <input type="search" id="title-stop-search" placeholder="搜尋巴士站" autocomplete="off" aria-label="搜尋巴士站" aria-controls="title-stop-dropdown" aria-expanded="false">
                            <div id="title-stop-dropdown" class="hidden" role="listbox" aria-label="巴士站搜尋結果">
                                <div id="title-stop-list"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <main id="monitor-content">
                    <div id="monitor-error" class="error" role="alert" hidden></div>
                    <div id="stops-container"></div>
                </main>
                <div id="settings-overlay" class="hidden" aria-hidden="true"></div>
                <aside id="settings-panel" class="hidden" role="dialog" aria-modal="true" aria-labelledby="settings-title">
                    <div class="settings-header">
                        <span class="settings-title">設定</span>
                        <button id="settings-close" type="button" title="關閉" aria-label="關閉">&times;</button>
                    </div>
                    <div class="settings-body"></div>
                </aside>
            </div>`;
    }

    function showMonitorError(message) {
        const errorMessage = document.getElementById('monitor-error');
        errorMessage.textContent = message;
        errorMessage.hidden = false;
    }

    function clearMonitorError() {
        const errorMessage = document.getElementById('monitor-error');
        errorMessage.textContent = '';
        errorMessage.hidden = true;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Unable to load ${src}`));
            document.body.appendChild(script);
        });
    }

    async function start() {
        try {
            renderSharedShell();
            await loadScript('pwa.js');
            await loadScript('data.js');
            location = window.LOCATION_CONFIG[locationId] || window.LOCATION_CONFIG.stp;
            await loadScript(location.config);
            await loadScript('settings.js');
            await loadScript('stop-eta.js');
            await loadScript('eta.js');
            await loadScript('route-search.js');
            if (isCustomizable) {
                window.KMBETA_CUSTOMIZATION_CONTEXT = Object.freeze({
                    enabled: true,
                    storageKey: APP_CONFIG.customStationConfigKey
                });
                await loadScript('stop-modify.js');
            }
            await loadScript('script.js');
            await loadScript('route-win.js');
            await loadScript('stop-win.js');
            clearMonitorError();
            document.getElementById('btn-refresh').addEventListener('click', refreshHomepage);
        } catch (error) {
            console.error('Unable to start monitor:', error);
            showMonitorError('Unable to load monitor files. Please refresh the page.');
        }
    }

    start();
}());
