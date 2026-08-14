// ===== Settings panel =====
(function initializeSettings() {
    const panel = document.getElementById('settings-panel');
    const overlay = document.getElementById('settings-overlay');
    const openButton = document.getElementById('btn-settings');
    const closeButton = document.getElementById('settings-close');
    if (!panel || !overlay || !openButton) return;

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
