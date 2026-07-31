// ===== Route ETA Floating Window =====
// Kept separate from the main stop monitor to make route-detail features easier to maintain.
const KMB_ROUTE_API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb/route";
const KMB_ROUTE_STOP_API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb/route-stop";
const KMB_ROUTE_ETA_API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb/route-eta";
const KMB_STOP_API_BASE = "https://data.etabus.gov.hk/v1/transport/kmb/stop";
const ROUTE_STOP_CACHE = {};
let kmbRouteListPromise = null;
let routeWindowState = null;

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
}

async function fetchKmbJson(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`KMB API request failed (${response.status})`);
    const data = await response.json();
    return data.data;
}

async function fetchKmbStop(stopId) {
    if (!ROUTE_STOP_CACHE[stopId]) {
        ROUTE_STOP_CACHE[stopId] = fetchKmbJson(`${KMB_STOP_API_BASE}/${encodeURIComponent(stopId)}`)
            .catch(error => {
                delete ROUTE_STOP_CACHE[stopId];
                throw error;
            });
    }
    return ROUTE_STOP_CACHE[stopId];
}

function getConfiguredStopCode(stopId) {
    if (typeof STOPS === 'undefined') return '';
    for (const stopGroup of STOPS) {
        const match = stopGroup.stops.find(stop => stop.id === stopId);
        if (match?.code) return match.code;
    }
    return '';
}

async function getRouteVariations(route, direction) {
    if (!kmbRouteListPromise) {
        kmbRouteListPromise = fetchKmbJson(`${KMB_ROUTE_API_BASE}/`)
            .catch(error => {
                kmbRouteListPromise = null;
                throw error;
            });
    }
    const routes = await kmbRouteListPromise;
    return routes
        .filter(item => item.route === route && item.bound === direction)
        .map(item => Number(item.service_type))
        .filter((serviceType, index, variations) => variations.indexOf(serviceType) === index)
        .sort((a, b) => a - b);
}

function renderDirectionIcon() {
    return `<svg class="route-direction-icon" viewBox="0 0 40 40" aria-hidden="true">
        <path class="direction-arrow direction-arrow-out" d="M6 10h29m-7-7 7 7-7 7" />
        <path class="direction-arrow direction-arrow-in" d="M34 29H6m7-7-7 7 7 7" />
    </svg>`;
}

function createRouteWindow() {
    const overlay = document.createElement('div');
    overlay.className = 'route-window-overlay';
    overlay.innerHTML = `
        <section class="route-window" role="dialog" aria-modal="true" aria-label="路線到站時間">
            <header class="route-window-header">
                <div class="route-window-title"></div>
                <div class="route-window-actions">
                    <button class="route-window-refresh" type="button" title="重新整理" aria-label="重新整理">F5</button>
                    <button class="route-direction-button" type="button" title="切換方向" aria-label="切換方向"></button>
                    <button class="route-variation-button" type="button" title="行車路線" aria-label="行車路線"></button>
                </div>
            </header>
            <button class="route-window-close" type="button" title="關閉" aria-label="關閉">×</button>
            <div class="route-window-content"><div class="route-window-loading">載入中...</div></div>
        </section>`;
    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeRouteWindow();
    });
    overlay.querySelector('.route-window-close').addEventListener('click', closeRouteWindow);
    overlay.querySelector('.route-window-refresh').addEventListener('click', () => loadRouteWindow(false));
    overlay.querySelector('.route-direction-button').addEventListener('click', () => {
        routeWindowState.direction = routeWindowState.direction === 'O' ? 'I' : 'O';
        routeWindowState.serviceType = 1;
        routeWindowState.variations = [];
        loadRouteWindow();
    });
    overlay.querySelector('.route-variation-button').addEventListener('click', () => {
        const variations = routeWindowState.variations || [1];
        const index = variations.indexOf(routeWindowState.serviceType);
        routeWindowState.serviceType = variations[(index + 1) % variations.length];
        loadRouteWindow(false);
    });
    document.body.appendChild(overlay);
}

function closeRouteWindow() {
    document.querySelector('.route-window-overlay')?.remove();
    routeWindowState = null;
}

async function openRouteWindow(route, company, direction, serviceType) {
    closeRouteWindow();
    routeWindowState = { route, company, direction: direction === 'I' ? 'I' : 'O', serviceType: Number(serviceType) || 1, variations: [] };
    createRouteWindow();
    await loadRouteWindow();
}

function renderRouteTitle(route, routeInfo) {
    if (!routeInfo?.orig_tc || !routeInfo?.dest_tc) return `<span class="route-window-route">${formatRouteNumber(route)}</span>`;
    const origin = routeInfo.orig_tc.trim();
    const destination = routeInfo.dest_tc.trim();
    const arrow = destination.includes('(循環線)') ? '↺' : '→';
    return `<span class="route-window-route">${formatRouteNumber(route)}</span><span class="route-window-journey">${escapeHtml(origin)} ${arrow} ${escapeHtml(destination)}</span>`;
}

function renderRouteStopEta(eta) {
    const etaDate = eta.eta ? new Date(eta.eta) : null;
    const hasEta = Boolean(eta.eta) && !Number.isNaN(etaDate?.getTime());
    const diffMs = hasEta ? etaDate - new Date() : null;
    const diffMins = hasEta ? Math.floor(diffMs / 60000) : null;
    const isArriving = hasEta && diffMins < 1;
    const isScheduled = eta.rmk_tc === '原定班次' || eta.rmk_tc === '未開出';
    let minClass = hasEta ? 'text-yellow' : 'text-grey';

    if (isArriving) {
        minClass = 'text-green';
    } else if (hasEta && isScheduled) {
        minClass = 'text-grey';
    } else if (hasEta && diffMins < 5) {
        minClass = 'text-light-green';
    }

    const remarkTag = isScheduled ? '[預定]' : eta.rmk_tc === '最後班次' ? '[尾班]' : '';
    const tagClass = isArriving ? 'text-black' : !hasEta || isScheduled || diffMins >= 30 ? 'text-grey' : 'text-white bold';
    return `<div class="eta-item${isArriving ? ' arriving' : ''}">
        <div class="eta-large ${minClass}"><span class="time-text-b" data-timestamp="${escapeHtml(eta.eta)}" data-remark="${escapeHtml(eta.rmk_tc || '')}">${formatDuration(eta.eta, eta.rmk_tc)}</span></div>
        <div class="eta-small">
            <span class="eta-remark-tag ${tagClass}">${formatTimeHtmlMinMode(eta.eta)}</span>
            <span class="eta-remark-tag-small ${tagClass}">${remarkTag}</span>
        </div>
    </div>`;
}

async function loadRouteWindow(loadVariations = true) {
    const overlay = document.querySelector('.route-window-overlay');
    if (!overlay || !routeWindowState) return;
    const state = routeWindowState;
    const requestId = (state.requestId || 0) + 1;
    state.requestId = requestId;
    const route = state.route;
    const direction = state.direction;
    const serviceType = state.serviceType;
    const title = overlay.querySelector('.route-window-title');
    const content = overlay.querySelector('.route-window-content');
    const directionButton = overlay.querySelector('.route-direction-button');
    const variationButton = overlay.querySelector('.route-variation-button');
    title.innerHTML = `<span class="route-window-route">${formatRouteNumber(route)}</span>`;
    directionButton.innerHTML = renderDirectionIcon();
    directionButton.className = `route-direction-button ${direction === 'I' ? 'inbound' : 'outbound'}`;
    variationButton.textContent = serviceType;
    variationButton.className = `route-variation-button ${serviceType === 1 ? 'normal' : 'variation'}`;
    content.innerHTML = '<div class="route-window-loading">載入中...</div>';

    if (state.company === 'KMB') {
        try {
            const directionParam = direction === 'I' ? 'inbound' : 'outbound';
            const [routeInfo, routeStops, routeEtas, variations] = await Promise.all([
                fetchKmbJson(`${KMB_ROUTE_API_BASE}/${encodeURIComponent(route)}/${directionParam}/${serviceType}`),
                fetchKmbJson(`${KMB_ROUTE_STOP_API_BASE}/${encodeURIComponent(route)}/${directionParam}/${serviceType}`),
                fetchKmbJson(`${KMB_ROUTE_ETA_API_BASE}/${encodeURIComponent(route)}/${serviceType}`),
                loadVariations ? getRouteVariations(route, direction) : Promise.resolve(state.variations)
            ]);
            if (!routeWindowState || routeWindowState !== state || state.requestId !== requestId) return;
            state.variations = variations.length ? variations : [state.serviceType];
            if (!state.variations.includes(state.serviceType)) state.serviceType = state.variations[0];
            title.innerHTML = renderRouteTitle(route, routeInfo);
            variationButton.textContent = state.serviceType;
            variationButton.className = `route-variation-button ${state.serviceType === 1 ? 'normal' : 'variation'}`;

            const etaBySequence = new Map();
            (routeEtas || []).filter(eta => eta.dir === direction && Number(eta.service_type) === serviceType)
                .forEach(eta => {
                    const sequence = String(eta.seq);
                    if (!etaBySequence.has(sequence)) etaBySequence.set(sequence, []);
                    etaBySequence.get(sequence).push(eta);
                });
            etaBySequence.forEach(etas => etas.sort((a, b) => new Date(a.eta) - new Date(b.eta)));
            const stopDetails = await Promise.all((routeStops || []).map(stop => fetchKmbStop(stop.stop).catch(() => null)));
            if (!routeWindowState || routeWindowState !== state || state.requestId !== requestId) return;
            const rows = (routeStops || []).map((stop, index) => {
                const detail = stopDetails[index];
                const name = detail?.name_tc || detail?.name_en || stop.stop;
                const configuredStopCode = getConfiguredStopCode(stop.stop);
                const codeMatch = name.match(/\s*\(([A-Z]{1,4}\d{1,4}[A-Z]?)\)$/);
                let displayName = codeMatch ? name.slice(0, codeMatch.index).trim() : name;
                const stopCode = codeMatch?.[1] || configuredStopCode || '';
                const interchangeMatch = displayName.match(/^(.+?轉車站)\s*[-－–—]\s*(.+)$/);
                const interchangeName = interchangeMatch?.[1] || '';
                if (interchangeMatch) displayName = interchangeMatch[2].trim();
                const stopCodeHtml = stopCode || interchangeName
                    ? `<span class="route-stop-code">${stopCode ? escapeHtml(stopCode) : ''}${interchangeName ? `<span class="route-stop-interchange">${stopCode ? ' ' : ''}${escapeHtml(interchangeName)}</span>` : ''}</span>`
                    : '';
                const etas = (etaBySequence.get(String(stop.seq)) || []).slice(0, 3);
                const etaHtml = etas.length
                    ? etas.map(renderRouteStopEta).join('')
                    : '<span class="route-stop-no-eta">暫無班次</span>';
                return `<tr><td class="route-stop-seq">${escapeHtml(stop.seq)}</td><td class="route-stop-name"><span class="route-stop-name-text">${escapeHtml(displayName)}</span>${stopCodeHtml}</td><td class="route-stop-times">${etaHtml}</td></tr>`;
            }).join('');
            content.innerHTML = `<table class="route-stop-table"><tbody>${rows || '<tr><td class="route-window-message" colspan="3">未能取得站點資料。</td></tr>'}</tbody></table>`;
        } catch (error) {
            console.error('Unable to load route ETA window:', error);
            if (routeWindowState === state && state.requestId === requestId) content.innerHTML = '<div class="route-window-message">未能取得路線資料，請稍後再試。</div>';
        }
    } else {
        content.innerHTML = '<div class="route-window-message">此功能目前只支援九巴路線。</div>';
        return;
    }
}
