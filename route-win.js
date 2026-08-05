// ===== Route ETA Floating Window =====
// Kept separate from the main stop monitor to make route-detail features easier to maintain.
const ROUTE_API = window.API_ENDPOINTS;
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

async function fetchCtbJson(url) {
    const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Citybus API request failed (${response.status})`);
    const data = await response.json();
    return data.data;
}

async function fetchKmbStop(stopId) {
    if (!ROUTE_STOP_CACHE[stopId]) {
        ROUTE_STOP_CACHE[stopId] = fetchKmbJson(`${ROUTE_API.kmb.stop}/${encodeURIComponent(stopId)}`)
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

function isCrossOperatorRoute(route) {
    const routeValue = String(route || '').trim().toUpperCase();
    const config = window.CROSS_OPERATOR_ROUTE_CONFIG || {};
    const listedRoutes = config.routes || [];
    if (listedRoutes.some(value => String(value).toUpperCase() === routeValue)) return true;
    return (config.patterns || []).some(pattern => {
        try {
            return new RegExp(pattern, 'i').test(routeValue);
        } catch (error) {
            console.warn('Invalid cross-operator route pattern:', pattern, error);
            return false;
        }
    });
}

function getOtherOperator(company) {
    return company === 'KMB' ? 'CTB' : company === 'CTB' ? 'KMB' : null;
}

function hasRouteInfo(routeInfo) {
    if (!routeInfo) return false;
    if (Array.isArray(routeInfo)) return routeInfo.length > 0;
    return typeof routeInfo === 'object' && Object.keys(routeInfo).length > 0;
}

async function checkOtherOperatorRoute(route, company) {
    const otherCompany = getOtherOperator(company);
    if (!otherCompany || !isCrossOperatorRoute(route)) return null;
    try {
        if (otherCompany === 'KMB') {
            for (const directionParam of ['outbound', 'inbound']) {
                try {
                    const routeInfo = await fetchKmbJson(`${ROUTE_API.kmb.route}/${encodeURIComponent(route)}/${directionParam}/1`);
                    if (hasRouteInfo(routeInfo)) return otherCompany;
                } catch (error) {
                    // Try the other direction before treating the route as absent.
                }
            }
            return null;
        }
        const routeInfo = await fetchCtbJson(`${ROUTE_API.ctb.route}/${encodeURIComponent(route)}`);
        return hasRouteInfo(routeInfo) ? otherCompany : null;
    } catch (error) {
        return null;
    }
}

async function fetchOtherOperatorEtas(route, company, direction, serviceType) {
    const otherCompany = getOtherOperator(company);
    if (!otherCompany || !isCrossOperatorRoute(route)) return new Map();

    try {
        const directionParam = direction === 'I' ? 'inbound' : 'outbound';
        const routeStops = otherCompany === 'KMB'
            ? await fetchKmbJson(`${ROUTE_API.kmb.routeStop}/${encodeURIComponent(route)}/${directionParam}/${serviceType}`)
            : await fetchCtbJson(`${ROUTE_API.ctb.routeStop}/${encodeURIComponent(route)}/${directionParam}`);
        const etaBySequence = new Map();

        if (otherCompany === 'KMB') {
            const routeEtas = await fetchKmbJson(`${ROUTE_API.kmb.routeEta}/${encodeURIComponent(route)}/${serviceType}`);
            (routeEtas || [])
                .filter(eta => eta.dir === direction && Number(eta.service_type) === Number(serviceType) && eta.eta)
                .forEach(eta => {
                    const sequence = String(eta.seq);
                    if (!etaBySequence.has(sequence)) etaBySequence.set(sequence, []);
                    eta._co = otherCompany;
                    etaBySequence.get(sequence).push(eta);
                });
        } else {
            await Promise.all((routeStops || []).map(async stop => {
                const etas = await fetchCtbJson(`${ROUTE_API.ctb.eta}/${encodeURIComponent(stop.stop)}/${encodeURIComponent(route)}`)
                    .catch(() => []);
                const sequence = String(stop.seq);
                const matchingEtas = (etas || []).filter(eta => eta.dir === direction && eta.eta);
                if (matchingEtas.length) {
                    if (!etaBySequence.has(sequence)) etaBySequence.set(sequence, []);
                    matchingEtas.forEach(eta => {
                        eta._co = otherCompany;
                        etaBySequence.get(sequence).push(eta);
                    });
                }
            }));
        }

        return etaBySequence;
    } catch (error) {
        console.warn(`Unable to load ${otherCompany} ETA for route ${route}:`, error);
        return new Map();
    }
}

async function getRouteVariations(route, direction) {
    if (!kmbRouteListPromise) {
        kmbRouteListPromise = fetchKmbJson(`${ROUTE_API.kmb.route}/`)
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
                    <button class="route-direction-button" type="button" title="切換方向" aria-label="切換方向"></button>
                    <button class="route-variation-button" type="button" title="行車路線" aria-label="行車路線"></button>
                    <button class="route-window-refresh" type="button" title="重新整理" aria-label="重新整理">F5</button>
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

async function openRouteWindow(route, company, direction, serviceType, companies = company) {
    closeRouteWindow();
    routeWindowState = { route, company, companies, crossOperator: false, direction: direction === 'I' ? 'I' : 'O', serviceType: Number(serviceType) || 1, variations: [] };
    createRouteWindow();
    await loadRouteWindow();
}

function getRouteTitleClass(route, company, companies) {
    if (/^[136]\d{2}$/.test(route)) return 'route-cross-harbour';
    if (/^9\d{2}[A-Za-z]?$/.test(route)) return 'route-9xx';
    if (company === 'CTB' && /^A/i.test(route)) return 'route-ctb-airport';
    if (company === 'LWB' && /^A/i.test(route)) return 'route-lwb-airport';
    return 'route-ordinary';
}

function renderCompanyBadges(company, companies) {
    const operators = new Set((companies || company || '').split(',').map(value => value.trim()));
    return ['KMB', 'CTB'].filter(operator => operators.has(operator))
        .map(operator => `<span class="route-company-badge route-company-badge-${operator.toLowerCase()}" title="${operator}" aria-label="${operator}"></span>`)
        .join('');
}

function renderRouteTitle(route, routeInfo, company, companies, reverseJourney = false) {
    const routeClass = getRouteTitleClass(route, company, companies);
    const routeLabel = `${renderCompanyBadges(company, companies)}<span class="route-window-route ${routeClass}">${formatRouteNumber(route)}</span>`;
    if (!routeInfo?.orig_tc || !routeInfo?.dest_tc) return routeLabel;
    const origin = (reverseJourney ? routeInfo.dest_tc : routeInfo.orig_tc).trim();
    let destination = (reverseJourney ? routeInfo.orig_tc : routeInfo.dest_tc).trim();
    let loopBadge = '';
    if (destination.includes('(循環線)')) {
        destination = destination.replace('(循環線)', '').trim();
        loopBadge = `<span class="route-loop-badge">循環線</span>`;
    }
    const arrow = '→';
    return `${routeLabel}<span class="route-window-journey">${escapeHtml(origin)} ${arrow} ${escapeHtml(destination)} ${loopBadge}</span>`;
}

async function hasBothDirections(route) {
    // Ensure the KMB route list is loaded and check for multiple bounds
    if (!kmbRouteListPromise) {
        try {
            kmbRouteListPromise = fetchKmbJson(`${ROUTE_API.kmb.route}/`);
        } catch (e) {
            return true; // fallback: assume both directions available
        }
    }
    try {
        const routes = await kmbRouteListPromise;
        const bounds = new Set(routes.filter(item => item.route === route).map(item => item.bound));
        return bounds.size > 1;
    } catch (e) {
        return true;
    }
}

function renderRouteStopEta(eta, showOperatorBorder = false) {
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
    const borderClass = showOperatorBorder && eta._co === 'KMB'
        ? ' eta-border-kmb'
        : showOperatorBorder && eta._co === 'CTB'
            ? ' eta-border-ctb'
            : '';
    return `<div class="eta-item${isArriving ? ' arriving' : ''}${borderClass}">
        <div class="eta-large ${minClass}"><span class="time-text-b${isArriving ? ' bold' : ''}" data-timestamp="${escapeHtml(eta.eta)}" data-remark="${escapeHtml(eta.rmk_tc || '')}">${formatDuration(eta.eta, eta.rmk_tc)}</span></div>
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
    title.innerHTML = `${renderCompanyBadges(state.company, state.companies)}<span class="route-window-route ${getRouteTitleClass(route, state.company, state.companies)}">${formatRouteNumber(route)}</span>`;
    directionButton.innerHTML = renderDirectionIcon();
    directionButton.className = `route-direction-button ${direction === 'I' ? 'inbound' : 'outbound'}`;
    variationButton.textContent = serviceType;
    variationButton.className = `route-variation-button ${serviceType === 1 ? 'normal' : 'variation'}`;
    content.innerHTML = '<div class="route-window-loading">載入中...</div>';

    if (isCrossOperatorRoute(route)) {
        const otherCompany = await checkOtherOperatorRoute(route, state.company);
        if (!routeWindowState || routeWindowState !== state || state.requestId !== requestId) return;
        if (otherCompany) {
            state.crossOperator = true;
            const operators = new Set((state.companies || state.company).split(',').map(value => value.trim()).filter(Boolean));
            operators.add(state.company);
            operators.add(otherCompany);
            state.companies = [...operators].join(',');
        }
    }

    if (state.company === 'KMB') {
        try {
            const directionParam = direction === 'I' ? 'inbound' : 'outbound';
            const [routeInfo, routeStops, routeEtas, variations] = await Promise.all([
                fetchKmbJson(`${ROUTE_API.kmb.route}/${encodeURIComponent(route)}/${directionParam}/${serviceType}`),
                fetchKmbJson(`${ROUTE_API.kmb.routeStop}/${encodeURIComponent(route)}/${directionParam}/${serviceType}`),
                fetchKmbJson(`${ROUTE_API.kmb.routeEta}/${encodeURIComponent(route)}/${serviceType}`),
                loadVariations ? getRouteVariations(route, direction) : Promise.resolve(state.variations)
            ]);
            if (!routeWindowState || routeWindowState !== state || state.requestId !== requestId) return;
            state.variations = variations.length ? variations : [state.serviceType];
            if (!state.variations.includes(state.serviceType)) state.serviceType = state.variations[0];
            title.innerHTML = renderRouteTitle(route, routeInfo, state.company, state.companies);
            variationButton.textContent = state.serviceType;
            variationButton.className = `route-variation-button ${state.serviceType === 1 ? 'normal' : 'variation'}`;
            // Hide variation button if only one variation
            variationButton.hidden = !(state.variations && state.variations.length > 1);
            // Disable direction button if only one direction exists
            const bothDirs = await hasBothDirections(route);
            if (!bothDirs) {
                directionButton.style.opacity = '0.45';
                directionButton.disabled = true;
            } else {
                directionButton.style.opacity = '';
                directionButton.disabled = false;
            }
            const etaBySequence = new Map();
            (routeEtas || []).filter(eta => eta.dir === direction && Number(eta.service_type) === serviceType && eta.eta)
                .forEach(eta => {
                    eta._co = 'KMB';
                    const sequence = String(eta.seq);
                    if (!etaBySequence.has(sequence)) etaBySequence.set(sequence, []);
                    etaBySequence.get(sequence).push(eta);
                });
            const otherEtaBySequence = state.crossOperator
                ? await fetchOtherOperatorEtas(route, state.company, direction, serviceType)
                : new Map();
            otherEtaBySequence.forEach((etas, sequence) => {
                if (!etaBySequence.has(sequence)) etaBySequence.set(sequence, []);
                etaBySequence.get(sequence).push(...etas);
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
                    ? `<span class="route-stop-code">${stopCode ? escapeHtml(stopCode) : ''}<button class="route-stop-info-button" type="button" data-company="KMB" data-stop-id="${escapeHtml(stop.stop)}" data-stop-name="${escapeHtml(displayName)}" data-stop-code="${escapeHtml(stopCode)}" title="查看本站到站時間" aria-label="查看${escapeHtml(displayName)}到站時間">i</button>${interchangeName ? `<span class="route-stop-interchange">${stopCode ? ' ' : ''}${escapeHtml(interchangeName)}</span>` : ''}</span>`
                    : '';
                const etas = (etaBySequence.get(String(stop.seq)) || []).slice(0, 3);
                const etaHtml = etas.length
                    ? etas.map(eta => renderRouteStopEta(eta, state.crossOperator)).join('')
                    : '<span class="route-stop-no-eta">暫無班次</span>';
                return `<tr><td class="route-stop-seq">${escapeHtml(stop.seq)}</td><td class="route-stop-name"><span class="route-stop-name-text">${escapeHtml(displayName)}</span>${stopCodeHtml}</td><td class="route-stop-times">${etaHtml}</td></tr>`;
            }).join('');
            content.innerHTML = `<table class="route-stop-table"><tbody>${rows || '<tr><td class="route-window-message" colspan="3">未能取得站點資料。</td></tr>'}</tbody></table>`;
        } catch (error) {
            console.error('Unable to load route ETA window:', error);
            if (routeWindowState === state && state.requestId === requestId) content.innerHTML = '<div class="route-window-message">未能取得路線資料，請稍後再試。</div>';
        }
    } else if (state.company === 'CTB') {
        try {
            const directionParam = direction === 'I' ? 'inbound' : 'outbound';
            const [routeInfo, routeStops] = await Promise.all([
                fetchCtbJson(`${ROUTE_API.ctb.route}/${encodeURIComponent(route)}`),
                fetchCtbJson(`${ROUTE_API.ctb.routeStop}/${encodeURIComponent(route)}/${directionParam}`)
            ]);
            if (!routeWindowState || routeWindowState !== state || state.requestId !== requestId) return;
            state.variations = [1];
            variationButton.hidden = true;
            title.innerHTML = renderRouteTitle(route, routeInfo, state.company, state.companies, direction === 'I');
            // For CTB assume direction toggle may be disabled if only single bound returned
            try {
                const ctbstops = routeStops || [];
                // If routeStops include only one bound, disable the direction button
                // CTB API here provides stops for the requested direction; we cannot easily detect the other direction reliably, so leave enabled.
            } catch (e) {}

            const [stopDetails, stopEtas] = await Promise.all([
                Promise.all((routeStops || []).map(stop => fetchCtbJson(`${ROUTE_API.ctb.stop}/${encodeURIComponent(stop.stop)}`).catch(() => null))),
                Promise.all((routeStops || []).map(stop => fetchCtbJson(`${ROUTE_API.ctb.eta}/${encodeURIComponent(stop.stop)}/${encodeURIComponent(route)}`).catch(() => [])))
            ]);
            const otherEtaBySequence = state.crossOperator
                ? await fetchOtherOperatorEtas(route, state.company, direction, 1)
                : new Map();
            if (!routeWindowState || routeWindowState !== state || state.requestId !== requestId) return;
            const rows = (routeStops || []).map((stop, index) => {
                const detail = stopDetails[index];
                const name = detail?.name_tc || detail?.name_en || stop.stop;
                const ctbEtas = (stopEtas[index] || [])
                    .filter(eta => eta.dir === direction && eta.eta)
                    .sort((a, b) => new Date(a.eta) - new Date(b.eta))
                    .map(eta => ({ ...eta, _co: 'CTB' }));
                const etas = ctbEtas.concat(otherEtaBySequence.get(String(stop.seq)) || [])
                    .sort((a, b) => new Date(a.eta) - new Date(b.eta))
                    .slice(0, 3);
                const etaHtml = etas.length ? etas.map(eta => renderRouteStopEta(eta, state.crossOperator)).join('') : '<span class="route-stop-no-eta">暫無班次</span>';
                const stopCodeHtml = `<span class="route-stop-code">${escapeHtml(stop.stop)}<button class="route-stop-info-button" type="button" data-company="CTB" data-stop-id="${escapeHtml(stop.stop)}" data-stop-name="${escapeHtml(name)}" data-stop-code="${escapeHtml(stop.stop)}" title="查看本站到站時間" aria-label="查看${escapeHtml(name)}到站時間">i</button></span>`;
                return `<tr><td class="route-stop-seq">${escapeHtml(stop.seq)}</td><td class="route-stop-name"><span class="route-stop-name-text">${escapeHtml(name)}</span>${stopCodeHtml}</td><td class="route-stop-times">${etaHtml}</td></tr>`;
            }).join('');
            content.innerHTML = `<table class="route-stop-table"><tbody>${rows || '<tr><td class="route-window-message" colspan="3">未能取得站點資料。</td></tr>'}</tbody></table>`;
        } catch (error) {
            console.error('Unable to load Citybus route ETA window:', error);
            if (routeWindowState === state && state.requestId === requestId) content.innerHTML = '<div class="route-window-message">未能取得路線資料，請稍後再試。</div>';
        }
    } else {
        content.innerHTML = '<div class="route-window-message">此功能目前只支援九巴及城巴路線。</div>';
    }
}
