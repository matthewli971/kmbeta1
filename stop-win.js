// ===== KMB Stop ETA Floating Window =====
const KMB_STOP_ETA_API_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta';
let stopEtaWindowState = null;

function closeStopEtaWindow() {
    document.querySelector('.stop-eta-window-overlay')?.remove();
    stopEtaWindowState = null;
}

function renderStopEtaItem(eta) {
    const etaDate = eta.eta ? new Date(eta.eta) : null;
    const hasEta = Boolean(eta.eta) && !Number.isNaN(etaDate?.getTime());
    const diffMins = hasEta ? Math.floor((etaDate - new Date()) / 60000) : null;
    const isArriving = hasEta && diffMins < 1;
    const isScheduled = eta.rmk_tc === '原定班次' || eta.rmk_tc === '未開出';
    const minClass = isArriving ? 'text-green' : isScheduled ? 'text-grey' : hasEta && diffMins < 5 ? 'text-light-green' : hasEta ? 'text-yellow' : 'text-grey';
    const tagClass = isArriving ? 'text-black bold' : !hasEta || isScheduled || diffMins >= 30 ? 'text-grey' : 'text-white bold';
    const remark = isScheduled ? '[預定]' : eta.rmk_tc === '最後班次' ? '[尾班]' : '';
    return `<div class="eta-item${isArriving ? ' arriving' : ''}">
        <div class="eta-large ${minClass}"><span class="time-text-b${isArriving ? ' bold' : ''}" data-timestamp="${escapeHtml(eta.eta)}" data-remark="${escapeHtml(eta.rmk_tc || '')}">${formatDuration(eta.eta, eta.rmk_tc)}</span></div>
        <div class="eta-small"><span class="eta-remark-tag ${tagClass}">${formatTimeHtmlMinMode(eta.eta)}</span> <span class="eta-remark-tag-small ${tagClass}">${remark}</span></div>
    </div>`;
}

async function openStopEtaWindow(stopId, stopName, stopCode) {
    closeStopEtaWindow();
    const state = { stopId, stopName, stopCode };
    stopEtaWindowState = state;
    const overlay = document.createElement('div');
    overlay.className = 'route-window-overlay stop-eta-window-overlay';
    // Extract interchange badge like "XXX轉車站 - Name" and display badge inline
    let displayName = stopName || '';
    let interchangeBadgeHtml = '';
    const interchangeMatch = (displayName || '').match(/^(.+?轉車站)\s*[-－–—]\s*(.+)$/);
    if (interchangeMatch) {
        const interchangeName = interchangeMatch[1].trim();
        displayName = interchangeMatch[2].trim();
        interchangeBadgeHtml = `<span class="stop-interchange-badge">${escapeHtml(interchangeName)}</span>`;
    }

    overlay.innerHTML = `
        <section class="route-window stop-eta-window" role="dialog" aria-modal="true" aria-label="巴士站到站時間">
            <header class="route-window-header"><div class="stop-eta-window-title" style="flex-direction:row;align-items:baseline;gap:8px"><span>${escapeHtml(displayName)}</span> ${interchangeBadgeHtml} ${stopCode ? `<span class="stop-eta-code">${escapeHtml(stopCode)}</span>` : ''}</div></header>
            <button class="route-window-close" type="button" title="關閉" aria-label="關閉">×</button>
            <div class="route-window-content"><div class="route-window-loading">載入中...</div></div>
        </section>`;
    overlay.addEventListener('click', event => { if (event.target === overlay) closeStopEtaWindow(); });
    overlay.querySelector('.route-window-close').addEventListener('click', closeStopEtaWindow);
    document.body.appendChild(overlay);

    try {
        const response = await fetch(`${KMB_STOP_ETA_API_BASE}/${encodeURIComponent(stopId)}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`KMB stop ETA request failed (${response.status})`);
        const { data } = await response.json();
        if (stopEtaWindowState !== state) return;
        const routes = new Map();
        (data || []).filter(eta => eta.eta).forEach(eta => {
            const key = `${eta.route}|${eta.dir}|${eta.service_type}`;
            if (!routes.has(key)) routes.set(key, { route: eta.route, destination: eta.dest_tc || eta.dest_en || '', etas: [] });
            routes.get(key).etas.push(eta);
        });
        const rows = [...routes.values()].map(item => {
            item.etas.sort((a, b) => new Date(a.eta) - new Date(b.eta));
            return `<tr><td class="stop-eta-route">${formatRouteNumber(item.route)}</td><td class="stop-eta-destination">${escapeHtml(item.destination)}</td><td class="stop-eta-times">${item.etas.slice(0, 3).map(renderStopEtaItem).join('')}</td></tr>`;
        }).join('');
        overlay.querySelector('.route-window-content').innerHTML = `<table class="stop-eta-table"><tbody>${rows || '<tr><td class="route-window-message" colspan="3">暫無班次</td></tr>'}</tbody></table>`;
    } catch (error) {
        console.error('Unable to load KMB stop ETA window:', error);
        if (stopEtaWindowState === state) overlay.querySelector('.route-window-content').innerHTML = '<div class="route-window-message">未能取得到站時間，請稍後再試。</div>';
    }
}

document.addEventListener('click', event => {
    const button = event.target.closest('.route-stop-info-button');
    if (!button) return;
    event.stopPropagation();
    openStopEtaWindow(button.dataset.stopId, button.dataset.stopName, button.dataset.stopCode);
});
