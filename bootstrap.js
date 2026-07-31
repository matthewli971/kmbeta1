// ===== Location Bootstrap =====
// Renders the shared monitor shell directly in each location document, then loads its configuration.
(function bootstrapLocationPage() {
    const bootstrapScript = document.currentScript;
    const locationId = bootstrapScript.dataset.location || 'stp';
    const locations = {
        stp: { config: 'config/stp.js' },
        mjh: { config: 'config/mjh.js' }
    };
    const location = locations[locationId] || locations.stp;

    function renderSharedShell() {
        if (document.getElementById('page-title')) return;
        document.getElementById('app-root').innerHTML = `
            <div class="container">
                <header>
                    <h1 id="page-title"></h1>
                    <div class="header-right">
                        <div class="header-controls">
                            <div id="clock"></div>
                            <button id="refresh-btn" type="button">F5</button>
                        </div>
                    </div>
                </header>
                <div id="monitor-error" class="error" role="alert" hidden></div>
                <div id="stops-container"></div>
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
            await loadScript(location.config);
            await loadScript('script.js');
            await loadScript('route-win.js');
            clearMonitorError();
            document.getElementById('refresh-btn').addEventListener('click', render);
        } catch (error) {
            console.error('Unable to start monitor:', error);
            showMonitorError('Unable to load monitor files. Please refresh the page.');
        }
    }

    start();
}());
