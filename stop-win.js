// ===== KMB Stop ETA Floating Window =====
const STOP_API = window.API_ENDPOINTS;
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
    return `<div class="eta-item route-window-eta-item${isArriving ? ' arriving' : ''}">
        <div class="eta-large ${minClass}"><span class="time-text-b${isArriving ? ' bold' : ''}" data-timestamp="${escapeHtml(eta.eta)}" data-remark="${escapeHtml(eta.rmk_tc || '')}">${formatDuration(eta.eta, eta.rmk_tc)}</span></div>
        <div class="eta-small"><span class="eta-remark-tag ${tagClass}">${formatTimeHtmlMinMode(eta.eta)}</span> <span class="eta-remark-tag-small ${tagClass}">${remark}</span></div>
    </div>`;
}

async function openStopEtaWindow(stopId, stopName, stopCode, company = 'KMB', silentRefresh = false) {
    if (!silentRefresh) {
        closeStopEtaWindow();
    }
    const state = silentRefresh ? stopEtaWindowState : { stopId, stopName, stopCode, company };
    if (!state) return;
    stopEtaWindowState = state;
    let overlay = document.querySelector('.stop-eta-window-overlay');
    if (!silentRefresh) {
        overlay = document.createElement('div');
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
            <header class="route-window-header">
                <div class="stop-eta-window-title" style="flex-direction:row;align-items:baseline;gap:8px"><span>${escapeHtml(displayName)}</span> ${interchangeBadgeHtml} ${stopCode ? `<span class="stop-eta-code">${escapeHtml(formatStopCodeForDisplay(company, stopCode))}</span>` : ''}</div>
                <div class="route-window-actions">
                    <button class="route-window-refresh" type="button" title="重新整理" aria-label="重新整理">F5</button>
                </div>
            </header>
            <button class="route-window-close" type="button" title="關閉" aria-label="關閉">×</button>
            <div class="route-window-content"><div class="route-window-loading">載入中...</div></div>
        </section>`;
        overlay.addEventListener('click', event => { if (event.target === overlay) closeStopEtaWindow(); });
        overlay.querySelector('.route-window-close').addEventListener('click', closeStopEtaWindow);
        overlay.querySelector('.route-window-refresh').addEventListener('click', () => {
            refreshStopEtaWindow();
        });
        document.body.appendChild(overlay);
    }

    try {
        const isCtb = company === 'CTB';
        const endpoint = isCtb ? STOP_API.ctb.stopEta : STOP_API.kmb.stopEta;
        const query = isCtb ? `?lang=zh-hant&t=${Date.now()}` : `?t=${Date.now()}`;
        const response = await fetch(`${endpoint}/${encodeURIComponent(stopId)}${query}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`${company} stop ETA request failed (${response.status})`);
        const { data } = await response.json();
        if (stopEtaWindowState !== state) return;
        const routes = new Map();
        (data || []).filter(eta => eta.eta).forEach(eta => {
            eta._co = company;
            const key = isCtb ? `${eta.route}|${eta.dir}` : `${eta.route}|${eta.dir}|${eta.service_type}`;
            if (!routes.has(key)) routes.set(key, { route: eta.route, destination: eta.dest_tc || eta.dest_en || eta.dest || '', etas: [] });
            routes.get(key).etas.push(eta);
        });
        const routeItems = [...routes.values()];
        routeItems.forEach(item => {
            sortEtaRecords(item.etas);
        });

        // KMB variations can return duplicate arrivals. Consolidate them when
        // every available display ETA (up to three) is identical, retaining
        // the API's first record as the destination and route-link target.
        const displayItems = isCtb ? routeItems : (() => {
            const groupedItems = new Map();
            routeItems.forEach(item => {
                const displayEtas = item.etas.slice(0, 3);
                const etaCount = displayEtas.length;
                const signature = displayEtas.map(eta => eta.eta).join('|');
                const direction = displayEtas[0]?.dir || 'O';
                const key = etaCount ? `${item.route}|${direction}|${etaCount}|${signature}` : null;
                const existing = key && groupedItems.get(key);

                if (existing && Number(existing.etas[0]?.service_type) !== Number(displayEtas[0]?.service_type)) {
                    existing.variationServiceTypes.push(displayEtas[0]?.service_type || 1);
                    return;
                }

                item.variationServiceTypes = [displayEtas[0]?.service_type || 1];
                if (key) groupedItems.set(key, item);
                else groupedItems.set(`unique-${groupedItems.size}`, item);
            });
            return [...groupedItems.values()];
        })();
        const sortedDisplayItems = sortEtaGroupsByFirstArrival(displayItems);

        const rows = sortedDisplayItems.map(item => {
            const firstEta = item.etas
                .filter(eta => eta.eta)
                .sort((a, b) => new Date(a.eta) - new Date(b.eta))[0];
            const routeCompany = firstEta?._co || company;
            const routeClass = getRouteNumberClass(item.route, routeCompany);
            const direction = firstEta?.dir || 'O';
            const serviceType = firstEta?.service_type || 1;
            let routeTextClass = 'route-text stop-eta-route-code';
            if (item.route.length >= 4) {
                routeTextClass += ' long-route-text';
            }
            const routeEtaSupported = routeCompany === 'KMB' || routeCompany === 'CTB';
            const routeButtonState = routeEtaSupported ? '' : ' disabled';
            const routeButtonTitle = routeEtaSupported ? ' title="查看路線到站時間"' : '';
            const routeCell = `<td class="route-no${routeClass} stop-eta-route"><button class="route-link ${routeTextClass}" type="button"${routeButtonState}${routeButtonTitle} data-route="${escapeHtml(item.route)}" data-company="${escapeHtml(routeCompany)}" data-companies="${escapeHtml(company)}" data-direction="${escapeHtml(direction)}" data-service-type="${escapeHtml(serviceType)}" aria-label="查看${escapeHtml(item.route)}路線到站時間">${formatRouteNumber(item.route)}</button></td>`;
            const variationCircles = item.variationServiceTypes?.length > 1
                ? item.variationServiceTypes.map(variation => `<button class="route-link stop-eta-variation ${Number(variation) === 1 ? 'normal' : 'variation'}" type="button" title="查看${escapeHtml(item.route)}路線變體 ${escapeHtml(variation)}" data-route="${escapeHtml(item.route)}" data-company="${escapeHtml(routeCompany)}" data-companies="${escapeHtml(company)}" data-direction="${escapeHtml(direction)}" data-service-type="${escapeHtml(variation)}" aria-label="查看${escapeHtml(item.route)}路線變體 ${escapeHtml(variation)}">${escapeHtml(variation)}</button>`).join('')
                : '';
            const destinationCell = `<td class="stop-eta-destination"><span class="stop-eta-destination-content"><span class="stop-eta-destination-name">${escapeHtml(item.destination)}</span>${variationCircles}</span></td>`;
            const timesCell = `<td class="stop-eta-times">${item.etas.slice(0, 3).map(renderStopEtaItem).join('')}</td>`;
            return `<tr>${routeCell}${destinationCell}${timesCell}</tr>`;
        }).join('');
        const etaColumnCount = Math.min(3, Math.max(1, ...sortedDisplayItems.map(item => item.etas.length)));
        overlay.querySelector('.route-window-content').innerHTML = `<table class="stop-eta-table stop-eta-columns-${etaColumnCount}"><tbody>${rows || '<tr><td class="route-window-message" colspan="3">暫無班次</td></tr>'}</tbody></table>`;
    } catch (error) {
        console.error(`Unable to load ${company} stop ETA window:`, error);
        if (stopEtaWindowState === state) overlay.querySelector('.route-window-content').innerHTML = '<div class="route-window-message">未能取得到站時間，請稍後再試。</div>';
    }
}

document.addEventListener('click', event => {
    const button = event.target.closest('.route-stop-info-button');
    if (!button) return;
    event.stopPropagation();
    openStopEtaWindow(button.dataset.stopId, button.dataset.stopName, button.dataset.stopCode, button.dataset.company || 'KMB');
});
