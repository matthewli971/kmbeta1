// ===== Progressive Web App installation =====
let deferredPwaInstallPrompt = null;

function setPwaInstallButtonVisible(visible) {
    const button = document.getElementById('btn-pwa-install');
    if (button) button.classList.toggle('hidden', !visible);
}

window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPwaInstallPrompt = event;
    setPwaInstallButtonVisible(true);
});

window.addEventListener('appinstalled', () => {
    deferredPwaInstallPrompt = null;
    setPwaInstallButtonVisible(false);
});

async function installPwa() {
    if (!deferredPwaInstallPrompt) return;
    deferredPwaInstallPrompt.prompt();
    await deferredPwaInstallPrompt.userChoice;
    deferredPwaInstallPrompt = null;
    setPwaInstallButtonVisible(false);
}

function initializePwa() {
    const button = document.getElementById('btn-pwa-install');
    button?.addEventListener('click', installPwa);

    if ('serviceWorker' in navigator && window.isSecureContext) {
        navigator.serviceWorker.register('./service-worker.js').catch(error => {
            console.warn('Unable to register the PWA service worker:', error);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePwa, { once: true });
} else {
    initializePwa();
}
