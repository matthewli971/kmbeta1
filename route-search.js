// ===== Route Search =====
let routeSearchRoutes = null;
let routeSearchLoadPromise = null;
let routeSearchLastUpdated = null;
let routeSearchLoadedRefreshKey = null;

function getRouteSearchRefreshKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_CONFIG.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    const refreshDate = new Date(Date.UTC(values.year, values.month - 1, values.day));
    if ((values.hour * 60) + values.minute < 315) refreshDate.setUTCDate(refreshDate.getUTCDate() - 1);
    return refreshDate.toISOString().slice(0, 10);
}

function compareRouteNumbers(a, b) {
    return a.route.localeCompare(b.route, 'en', { numeric: true, sensitivity: 'base' });
}

function isRouteSearchCrossOperatorRoute(route) {
    return typeof isCrossOperatorRoute === 'function' && isCrossOperatorRoute(route);
}

function addRouteSearchRecord(routeMap, record) {
    const key = `${record.company}|${record.route}`;
    if (!routeMap.has(key)) routeMap.set(key, record);
}

function groupRouteSearchRecords(records) {
    const grouped = new Map();
    records.forEach(record => {
        const isCrossOperator = isRouteSearchCrossOperatorRoute(record.route);
        const key = isCrossOperator ? record.route : `${record.company}|${record.route}`;
        const existing = grouped.get(key);
        if (existing && isCrossOperator && existing.company !== record.company) {
            existing.companies = ['KMB', 'CTB'].filter(company =>
                existing.companies.split(',').includes(company) || record.company === company
            ).join(',');
            return;
        }
        grouped.set(key, record);
    });
    return [...grouped.values()].sort(compareRouteNumbers);
}

function getCachedRouteSearchRoutes() {
    try {
        const cached = JSON.parse(localStorage.getItem(APP_CONFIG.routeSearchCacheKey) || 'null');
        if (cached?.refreshKey !== getRouteSearchRefreshKey() || !Array.isArray(cached.routes)) return null;
        routeSearchLastUpdated = cached.updatedAt || null;
            routeSearchLoadedRefreshKey = cached.refreshKey;
        return cached.routes;
    } catch (error) {
        console.warn('Unable to read route-search cache:', error);
        return null;
    }
}

function cacheRouteSearchRoutes(routes) {
    try {
        routeSearchLastUpdated = new Date().toISOString();
        localStorage.setItem(APP_CONFIG.routeSearchCacheKey, JSON.stringify({
            refreshKey: getRouteSearchRefreshKey(),
            updatedAt: routeSearchLastUpdated,
            routes
        }));
    } catch (error) {
        console.warn('Unable to cache route-search routes:', error);
    }
}

function getRouteSearchLastUpdated() {
    return routeSearchLastUpdated;
}

function notifyRouteSearchUpdated() {
    window.dispatchEvent(new Event('route-search-updated'));
}

async function refreshRouteSearchRoutes() {
    routeSearchRoutes = null;
    routeSearchLoadedRefreshKey = null;
    routeSearchLoadPromise = null;
    const routes = await fetchRouteSearchRoutes();
    routeSearchRoutes = routes;
    routeSearchLoadedRefreshKey = getRouteSearchRefreshKey();
    cacheRouteSearchRoutes(routes);
    notifyRouteSearchUpdated();
    return routes;
}

async function fetchRouteSearchRoutes() {
    const [kmbResponse, ctbResponse] = await Promise.all([
        fetch(window.API_ENDPOINTS.kmb.route, { cache: 'no-store' }),
        fetch(window.API_ENDPOINTS.ctb.route, { cache: 'no-store' })
    ]);
    if (!kmbResponse.ok || !ctbResponse.ok) throw new Error('Unable to load route lists');

    const [kmbData, ctbData] = await Promise.all([kmbResponse.json(), ctbResponse.json()]);
    const routes = new Map();
    const kmbDirectionMeta = new Map();
    (kmbData.data || []).forEach(item => {
        const route = String(item.route || '').trim();
        if (route) {
            const meta = kmbDirectionMeta.get(route) || { outbound: false, inbound: false, circular: false };
            meta.outbound ||= item.bound === 'O';
            meta.inbound ||= item.bound === 'I';
            meta.circular ||= /循環線/.test(`${item.orig_tc || ''} ${item.dest_tc || ''}`);
            kmbDirectionMeta.set(route, meta);
        }
        if (route && item.bound === 'O' && String(item.service_type) === '1') {
            addRouteSearchRecord(routes, {
                route,
                company: 'KMB',
                companies: 'KMB',
                direction: 'O',
                serviceType: 1,
                origin: String(item.orig_tc || '').trim(),
                destination: String(item.dest_tc || '').trim(),
                directionType: 'single'
            });
        }
    });
    (ctbData.data || []).forEach(item => {
        const route = String(item.route || '').trim();
        if (route) {
            addRouteSearchRecord(routes, {
                route,
                company: 'CTB',
                companies: 'CTB',
                direction: 'O',
                serviceType: 1,
                origin: String(item.orig_tc || '').trim(),
                destination: String(item.dest_tc || '').trim()
            });
        }
    });
    routes.forEach(record => {
        if (record.company !== 'KMB') return;
        const meta = kmbDirectionMeta.get(record.route);
        if (!meta) return;
        record.directionType = meta.circular ? 'circular' : meta.outbound && meta.inbound ? 'dual' : 'single';
    });
    return groupRouteSearchRecords([...routes.values()]);
}

async function loadRouteSearchRoutes() {
    const refreshKey = getRouteSearchRefreshKey();
    if (routeSearchRoutes && routeSearchLoadedRefreshKey === refreshKey) return routeSearchRoutes;
    routeSearchRoutes = null;
    routeSearchLoadedRefreshKey = null;
    const cachedRoutes = getCachedRouteSearchRoutes();
    if (cachedRoutes) {
        routeSearchRoutes = cachedRoutes;
        notifyRouteSearchUpdated();
        return routeSearchRoutes;
    }
    if (!routeSearchLoadPromise) {
        routeSearchLoadPromise = fetchRouteSearchRoutes()
            .then(routes => {
                routeSearchRoutes = routes;
                routeSearchLoadedRefreshKey = refreshKey;
                cacheRouteSearchRoutes(routes);
                notifyRouteSearchUpdated();
                return routes;
            })
            .finally(() => { routeSearchLoadPromise = null; });
    }
    return routeSearchLoadPromise;
}

function renderRouteSearchResults(list, query = '') {
    const prefix = query.trim().toUpperCase();
    const matches = (routeSearchRoutes || []).filter(item => item.route.toUpperCase().startsWith(prefix));
    list.innerHTML = matches.length
        ? matches.map(item => {
            const routeClass = typeof getRouteNumberClass === 'function' ? getRouteNumberClass(item.route, item.company) : '';
            const companyBadges = item.companies.split(',').map(company =>
                `<span class="route-company-badge route-company-badge-${company.toLowerCase()}" title="${company}" aria-label="${company}"></span>`
            ).join('');
            const directionSymbol = item.directionType === 'circular' ? '↺' : item.directionType === 'dual' ? '↔' : '→';
            const origin = item.origin.replace(/[（(]循環線[）)]/g, '').trim();
            const destination = item.destination.replace(/[（(]循環線[）)]/g, '').trim();
            const loopBadge = item.directionType === 'circular' ? '<span class="route-loop-badge">循環線</span>' : '';
            const journey = origin && destination
                ? `<span class="route-window-journey">${escapeHtml(origin)} ${directionSymbol} ${escapeHtml(destination)} ${loopBadge}</span>`
                : '';
            return `<button class="route-search-result" type="button" role="option" data-route="${escapeHtml(item.route)}" data-company="${escapeHtml(item.company)}" data-companies="${escapeHtml(item.companies)}" data-direction="${item.direction}" data-service-type="${item.serviceType}">${companyBadges}<span class="route-window-route ${routeClass}">${formatRouteNumber(item.route)}</span>${journey}</button>`;
        }).join('')
        : '<div class="route-search-status">找不到相符路線</div>';
}

function initializeStationSearch() {
    const selector = document.getElementById('station-selector');
    const search = document.getElementById('station-search');
    const dropdown = document.getElementById('station-dropdown');
    const list = document.getElementById('station-list');
    if (!selector || !search || !dropdown) return;

    const openDropdown = async () => {
        dropdown.classList.remove('hidden');
        search.setAttribute('aria-expanded', 'true');
        if (!routeSearchRoutes) list.innerHTML = '<div class="route-search-status">載入路線中...</div>';
        try {
            await loadRouteSearchRoutes();
            renderRouteSearchResults(list, search.value);
        } catch (error) {
            console.error('Unable to load route-search routes:', error);
            list.innerHTML = '<div class="route-search-status">未能載入路線，請稍後再試。</div>';
        }
    };
    const closeDropdown = () => {
        dropdown.classList.add('hidden');
        search.setAttribute('aria-expanded', 'false');
    };
    const clearSearchOnLeave = () => {
        search.value = '';
        list.innerHTML = '';
        closeDropdown();
    };

    search.addEventListener('focus', openDropdown);
    search.addEventListener('click', openDropdown);
    search.addEventListener('input', () => {
        if (routeSearchRoutes) renderRouteSearchResults(list, search.value);
    });
    search.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeDropdown();
            search.blur();
        }
    });
    document.addEventListener('click', event => {
        if (!selector.contains(event.target)) closeDropdown();
    });
    selector.addEventListener('mouseleave', clearSearchOnLeave);
    list.addEventListener('click', event => {
        const routeButton = event.target.closest('.route-search-result');
        if (!routeButton) return;
        openRouteWindow(routeButton.dataset.route, routeButton.dataset.company, routeButton.dataset.direction, routeButton.dataset.serviceType, routeButton.dataset.companies);
        closeDropdown();
    });

    // Load the route list on site entry so Settings can show the latest cache timestamp
    // without waiting for the search field to receive focus.
    loadRouteSearchRoutes().catch(error => {
        console.error('Unable to initialize route-search routes:', error);
    });
}
