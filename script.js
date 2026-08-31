// ===== Runtime State =====
const STOP_CACHE = {};

// Apply the configured title, including a locally imported index.html configuration.
const runtimeAppTitle = window.KMBETA_RUNTIME_APP_TITLE ?? APP_TITLE;
document.getElementById('app-title').textContent = runtimeAppTitle;
document.getElementById('app-version').textContent = APP_CONFIG.version;
document.title = runtimeAppTitle;

function applyDestReplacement(dest) {
    if (!dest) return dest;
    return DEST_REPLACEMENTS[dest] || dest;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Citybus stop IDs retain their leading zeroes for API requests, but omit
// them when shown to the user (for example, 001790 is displayed as 1790).
function formatStopCodeForDisplay(company, stopCode) {
    if (company !== 'CTB' || stopCode === null || stopCode === undefined) return String(stopCode ?? '');
    return String(stopCode).replace(/^0+(?=\d)/, '');
}

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: APP_CONFIG.timeZone,
        hour12: true
    }).toUpperCase();
    document.getElementById('clock').innerHTML = `${timeStr}`;
}

function updateDayCountdown() {
    const countdown = document.getElementById('day-countdown');
    if (!countdown) return;

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_CONFIG.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(
        parts
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value])
    );
    const todayUtc = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day)
    );
    const targetUtc = Date.parse(`${APP_CONFIG.countdownTargetDate}T00:00:00Z`);
    const daysUntil = Math.ceil((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));

    if (daysUntil <= 0) {
        countdown.textContent = '';
        return;
    }

    countdown.innerHTML = `${daysUntil}`;
}

async function refreshEtaWindowButton(button, reload, restoreText = 'F5') {
    if (!button || button.disabled) return;
    button.disabled = true;
    button.innerHTML = '<span class="stop-loader-spinner" aria-label="重新整理中"></span>';
    Promise.resolve()
        .then(reload)
        .catch(error => console.error('Unable to refresh ETA data:', error));
    await new Promise(resolve => setTimeout(resolve, 5000));
    if (document.contains(button)) {
        button.disabled = false;
        button.textContent = restoreText;
    }
}

async function refreshRouteWindow() {
    const button = document.querySelector('.route-eta-window-overlay .route-window-refresh');
    return refreshEtaWindowButton(button, () => loadRouteWindow(false, true));
}

async function refreshStopEtaWindow() {
    const button = document.querySelector('.stop-eta-window-overlay .route-window-refresh');
    if (!button || button.disabled || !stopEtaWindowState) return;
    const state = stopEtaWindowState;
    return refreshEtaWindowButton(button, () =>
        openStopEtaWindow(state.stopId, state.stopName, state.stopCode, state.company, true)
    );
}

async function refreshHomepage() {
    return refreshEtaWindowButton(document.getElementById('btn-refresh'), render);
}

function getActivePriorityConfig() {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: APP_CONFIG.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(new Date());
    const timeValues = Object.fromEntries(
        timeParts
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, Number(part.value)])
    );
    const currentMinutes = timeValues.hour * 60 + timeValues.minute;

    const parseTime = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };

    for (const config of PRIORITY_CONFIG) {
        const start = parseTime(config.start);
        const end = parseTime(config.end);
        
        // Check if current time is within range [start, end)
        if (currentMinutes >= start && currentMinutes < end) {
            return config;
        }
    }

    return null;
}

function getSortedStops(activeConfig = getActivePriorityConfig()) {
    if (!activeConfig) {
        return STOPS;
    }

    // Create a map for O(1) lookup of order index
    const orderMap = new Map();
    activeConfig.order.forEach((id, index) => {
        orderMap.set(id, index);
    });

    // Return a sorted shallow copy
    return [...STOPS].sort((a, b) => {
        const indexA = orderMap.has(a.id) ? orderMap.get(a.id) : 999;
        const indexB = orderMap.has(b.id) ? orderMap.get(b.id) : 999;
        return indexA - indexB;
    });
}

function formatTimeHtml(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${mins}<span class="time-seconds">:${secs}</span>`;
}

function formatMinutes(timestamp) {
    // Deprecated
    return formatDuration(timestamp);
}

function formatRemark(remark) {
    if (!remark) return '';
    if (remark === '原定班次') return '預定';
    if (remark === '未開出') return '預定';
    if (remark === '最後班次') return '尾班車';
    
    const isChinese = /[\u4e00-\u9fa5]/.test(remark);
    const limit = isChinese ? 8 : 16;
    
    if (remark.length > limit) {
        return remark.substring(0, limit) + '...';
    }
    return remark;
}

function cleanRemark(remark) {
    if (!remark) return '';
    // Remove stop codes in brackets e.g. (MA403)
    return remark.replace(/\([A-Z0-9]+\)/g, '');
}

function formatRouteNumber(route) {
    const match = route.match(/^(\w*?\d+)([a-zA-Z]+)$/);
    if (match) {
        return `${match[1]}<span class="route-suffix">${match[2]}</span>`;
    }
    return route;
}

function getRouteNumberClass(route, company) {
    const routeValue = String(route || '');
    let routeClass = '';

    if (company === 'CTB') {
        routeClass += /^(A|NA)/i.test(routeValue) ? ' route-ctb-airport' : ' ctb';
    }

    if (/^[A-Z]?[136]\d{2}[A-Z]?$/.test(routeValue))  {
        routeClass += ' route-cross-harbour';
    } else if (/^[A-Z]?[9]\d{2}[A-Z]?$/.test(routeValue) && routeValue.startsWith('9')) {
        routeClass += ' route-cross-wht';
    } else if (company === 'GMB') {
        routeClass += ' gmb';
    } else if (company === 'KMB' && /^([AES]|NA)/i.test(routeValue)) {
        routeClass += ' route-lwb-airport';
    }

    return routeClass;
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// ===== Shared co-operated route helpers =====
const COOPERATED_ROUTE_ENDPOINT_CACHE = new Map();
const COOPERATED_STOP_CACHE = new Map();

function isCrossOperatorRoute(route) {
    const routeValue = String(route || '').trim().toUpperCase();
    const config = window.CROSS_OPERATOR_ROUTE_CONFIG || {};
    if ((config.routes || []).some(value => String(value).toUpperCase() === routeValue)) return true;
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

async function fetchCooperatedStop(company, stopId) {
    const key = `${company}:${stopId}`;
    if (!COOPERATED_STOP_CACHE.has(key)) {
        const promise = company === 'KMB'
            ? fetchKmbStop(stopId)
            : fetchCtbJson(`${ROUTE_API.ctb.stop}/${encodeURIComponent(stopId)}`);
        COOPERATED_STOP_CACHE.set(key, promise.catch(error => {
            COOPERATED_STOP_CACHE.delete(key);
            throw error;
        }));
    }
    return COOPERATED_STOP_CACHE.get(key);
}

async function getCooperatedRouteEndpoints(route, company, direction) {
    const serviceType = 1;
    const key = `${company}:${route}:${direction}:${serviceType}`;
    if (!COOPERATED_ROUTE_ENDPOINT_CACHE.has(key)) {
        const directionParam = direction === 'I' ? 'inbound' : 'outbound';
        const promise = (async () => {
            const stops = company === 'KMB'
                ? await fetchKmbJson(`${ROUTE_API.kmb.routeStop}/${encodeURIComponent(route)}/${directionParam}/${serviceType}`)
                : await fetchCtbJson(`${ROUTE_API.ctb.routeStop}/${encodeURIComponent(route)}/${directionParam}`);
            if (!stops || stops.length < 2) return null;
            const [first, last] = await Promise.all([
                fetchCooperatedStop(company, stops[0].stop),
                fetchCooperatedStop(company, stops[stops.length - 1].stop)
            ]);
            const points = [first, last].map(stop => ({ lat: Number(stop?.lat), long: Number(stop?.long) }));
            return points.every(point => Number.isFinite(point.lat) && Number.isFinite(point.long)) ? points : null;
        })();
        COOPERATED_ROUTE_ENDPOINT_CACHE.set(key, promise.catch(error => {
            COOPERATED_ROUTE_ENDPOINT_CACHE.delete(key);
            throw error;
        }));
    }
    return COOPERATED_ROUTE_ENDPOINT_CACHE.get(key);
}

async function getCooperatedDirection(route, company, direction) {
    const otherCompany = getOtherOperator(company);
    if (!otherCompany || !isCrossOperatorRoute(route)) return direction;
    try {
        const [source, sameDirection] = await Promise.all([
            getCooperatedRouteEndpoints(route, company, direction),
            getCooperatedRouteEndpoints(route, otherCompany, direction)
        ]);
        if (!source || !sameDirection) return direction;
        const sameStart = getDistanceFromLatLonInMeters(source[0].lat, source[0].long, sameDirection[0].lat, sameDirection[0].long);
        const sameEnd = getDistanceFromLatLonInMeters(source[1].lat, source[1].long, sameDirection[1].lat, sameDirection[1].long);
        if (sameStart < 200 && sameEnd < 200) return direction;

        const oppositeDirection = direction === 'O' ? 'I' : 'O';
        const opposite = await getCooperatedRouteEndpoints(route, otherCompany, oppositeDirection);
        if (!opposite) return direction;
        const oppositeStart = getDistanceFromLatLonInMeters(source[0].lat, source[0].long, opposite[0].lat, opposite[0].long);
        const oppositeEnd = getDistanceFromLatLonInMeters(source[1].lat, source[1].long, opposite[1].lat, opposite[1].long);
        if (oppositeStart < 200 && oppositeEnd < 200) {
            console.log(`Route ${route} direction flipped (${direction} → ${oppositeDirection}) for ${otherCompany}`);
            return oppositeDirection;
        }
        return direction;
    } catch (error) {
        console.warn(`Unable to compare co-operated route direction for ${route}:`, error);
        return direction;
    }
}

function stopRefreshIndicatorHtml() {
    return `<div class="stop-refresh-indicator" aria-label="Refreshing stop data">
        <span class="stop-loader-spinner" aria-hidden="true"></span>
        <svg class="stop-refresh-tick hidden" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5 9.5 17 19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
    </div>`;
}

function setStopRefreshState(section, state) {
    const indicator = section?.querySelector('.stop-refresh-indicator');
    if (!indicator) return;

    const spinner = indicator.querySelector('.stop-loader-spinner');
    const tick = indicator.querySelector('.stop-refresh-tick');
    if (section._refreshHideTimer) {
        clearTimeout(section._refreshHideTimer);
        section._refreshHideTimer = null;
    }

    if (state === 'loading') {
        spinner.classList.remove('hidden');
        tick.classList.add('hidden');
        return;
    }

    if (state === 'complete') {
        spinner.classList.add('hidden');
        tick.classList.remove('hidden');
        section._refreshHideTimer = setTimeout(() => {
            spinner.classList.add('hidden');
            tick.classList.add('hidden');
            section._refreshHideTimer = null;
        }, 2000);
        return;
    }

    if (state === 'hidden') {
        spinner.classList.add('hidden');
        tick.classList.add('hidden');
    }
}

function createMarqueeHtml(content, marqueeClass) {
    return `<span class="text-marquee ${marqueeClass}"><span class="marquee-inner">${content}</span></span>`;
}

function updateMarqueeOverflow(container, marqueeSelector = '.text-marquee') {
    if (!container) return;
    requestAnimationFrame(() => {
        container.querySelectorAll(marqueeSelector).forEach(marquee => {
            marquee.classList.toggle('is-overflowing', marquee.scrollWidth > marquee.clientWidth);
        });
    });
}

// ===== Title Bus Stop Search =====
let sharedKmbStopCatalogPromise = null;
let titleStopSearchTimer = null;

function normalizeBusStopSearchText(value) {
    return String(value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, '');
}

function normalizeBusStopSearchCode(value) {
    const code = normalizeBusStopSearchText(value);
    return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, '') : code;
}

function getBusStopCodeMatchRank(code, query) {
    const stopCode = normalizeBusStopSearchCode(code);
    const searchCode = normalizeBusStopSearchCode(query);
    if (!stopCode || !searchCode) return 3;
    if (stopCode === searchCode) return 0;
    if (stopCode.startsWith(searchCode)) return 1;
    if (stopCode.includes(searchCode)) return 2;
    return 3;
}

function compareBusStopSearchResults(a, b, query) {
    const rankDifference = getBusStopCodeMatchRank(a.code, query) - getBusStopCodeMatchRank(b.code, query);
    if (rankDifference) return rankDifference;

    const nameDifference = String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant');
    if (nameDifference) return nameDifference;

    return normalizeBusStopSearchCode(a.code).localeCompare(
        normalizeBusStopSearchCode(b.code),
        'en',
        { numeric: true, sensitivity: 'base' }
    );
}

window.compareBusStopSearchResults = compareBusStopSearchResults;

function getKmbBusStopCode(name) {
    return String(name ?? '').match(/\s*\(([A-Z]{1,4}\d{1,4}[A-Z]?)\)\s*$/i)?.[1] || '';
}

function getKmbBusStopSearchName(stop) {
    return String(stop?.name_tc || stop?.name_en || '')
        .replace(/\s*\([A-Z]{1,4}\d{1,4}[A-Z]?\)\s*$/i, '')
        .trim();
}

function getCtbBusStopSearchName(stop) {
    const name = String(stop?.name_tc || stop?.name_en || '').trim();
    if (window.getShowCtbStopStreetName?.()) return name;
    const separatorIndex = name.lastIndexOf(', ');
    return separatorIndex >= 0 && name.slice(separatorIndex + 2).trim()
        ? name.slice(0, separatorIndex).trimEnd()
        : name;
}

window.loadKmbStopCatalog = async function loadKmbStopCatalog() {
    if (!sharedKmbStopCatalogPromise) {
        sharedKmbStopCatalogPromise = fetch(`${window.API_ENDPOINTS.kmb.stop}?t=${Date.now()}`, { cache: 'no-store' })
            .then(response => {
                if (!response.ok) throw new Error(`KMB stop request failed (${response.status})`);
                return response.json();
            })
            .then(payload => Array.isArray(payload.data) ? payload.data : [])
            .catch(error => {
                sharedKmbStopCatalogPromise = null;
                throw error;
            });
    }
    return sharedKmbStopCatalogPromise;
};

async function findTitleBusStopResults(query) {
    const queryText = normalizeBusStopSearchText(query);
    if (!queryText) return [];
    const [catalog, ctbStop] = await Promise.all([
        window.loadKmbStopCatalog(),
        findTitleCtbStopByCode(query)
    ]);
    const kmbMatches = catalog
        .map(stop => {
            const code = getKmbBusStopCode(stop.name_tc) || getKmbBusStopCode(stop.name_en) || stop.stop;
            const name = getKmbBusStopSearchName(stop) || String(stop.stop);
            const codeMatches = getBusStopCodeMatchRank(code, query) < 3;
            const nameMatches = normalizeBusStopSearchText(`${name} ${stop.name_tc} ${stop.name_en}`).includes(queryText);
            return codeMatches || nameMatches ? { company: 'KMB', id: String(stop.stop), code, name } : null;
        })
        .filter(Boolean);
    return [...kmbMatches, ...ctbStop].sort((a, b) => compareBusStopSearchResults(a, b, query));
}

async function findTitleCtbStopByCode(query) {
    const enteredStopId = String(query || '').trim().replace(/\s+/g, '');
    if (!/^\d{4,8}$/.test(enteredStopId)) return [];
    const stopId = enteredStopId.length < 6 ? enteredStopId.padStart(6, '0') : enteredStopId;
    try {
        const response = await fetch(`${window.API_ENDPOINTS.ctb.stop}/${encodeURIComponent(stopId)}?lang=zh-hant&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return [];
        const payload = await response.json();
        const stop = payload.data;
        if (!stop?.stop) return [];
        const name = getCtbBusStopSearchName(stop);
        return name ? [{ company: 'CTB', id: String(stop.stop), code: String(stop.stop), name }] : [];
    } catch {
        return [];
    }
}

function renderTitleStopSearchResults(list, results) {
    list.innerHTML = results.length
        ? results.map(stop => `<button class="station-search-result title-stop-search-result" type="button" role="option" data-stop-id="${escapeHtml(stop.id)}" data-stop-name="${escapeHtml(stop.name)}" data-stop-code="${escapeHtml(stop.code)}" data-company="${escapeHtml(stop.company)}"><span class="route-company-badge route-company-badge-${stop.company.toLowerCase()}" title="${stop.company}" aria-label="${stop.company}"></span><span class="station-search-result-copy"><span class="station-stop-name-with-code"><span class="station-stop-name-text">${escapeHtml(stop.name)}</span><span class="stop-eta-code">${escapeHtml(formatStopCodeForDisplay(stop.company, stop.code))}</span></span></span></button>`).join('')
        : '<div class="station-search-message">找不到相符的巴士站。</div>';
}

function initializeTitleStopSearch() {
    const selector = document.getElementById('station-selector');
    const search = document.getElementById('title-stop-search');
    const dropdown = document.getElementById('title-stop-dropdown');
    const list = document.getElementById('title-stop-list');
    if (!selector || !search || !dropdown || !list) return;

    const closeDropdown = () => {
        dropdown.classList.add('hidden');
        search.setAttribute('aria-expanded', 'false');
    };
    const searchStops = async () => {
        dropdown.classList.remove('hidden');
        search.setAttribute('aria-expanded', 'true');
        const query = search.value.trim();
        if (!query) {
            list.innerHTML = '<div class="station-search-message">請輸入站名或車站編號。</div>';
            return;
        }
        list.innerHTML = '<div class="station-search-message">搜尋中...</div>';
        try {
            renderTitleStopSearchResults(list, await findTitleBusStopResults(query));
        } catch (error) {
            console.error('Unable to search bus stops:', error);
            list.innerHTML = '<div class="station-search-message is-error">未能載入巴士站，請稍後再試。</div>';
        }
    };
    const openDropdown = () => {
        document.getElementById('station-dropdown')?.classList.add('hidden');
        document.getElementById('station-search')?.setAttribute('aria-expanded', 'false');
        window.loadKmbStopCatalog().catch(error => console.error('Unable to load bus stop catalog:', error));
        void searchStops();
    };

    search.addEventListener('focus', openDropdown);
    search.addEventListener('click', openDropdown);
    search.addEventListener('input', () => {
        clearTimeout(titleStopSearchTimer);
        titleStopSearchTimer = window.setTimeout(searchStops, 220);
    });
    search.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeDropdown();
            search.blur();
        }
    });
    document.addEventListener('click', event => {
        if (!document.getElementById('stop-search-wrapper')?.contains(event.target)) closeDropdown();
    });
    list.addEventListener('click', event => {
        const stop = event.target.closest('.title-stop-search-result');
        if (!stop) return;
        openStopEtaWindow(stop.dataset.stopId, stop.dataset.stopName, stop.dataset.stopCode, stop.dataset.company);
        closeDropdown();
    });
}

async function processStopGroup(stopGroup) {
    const isGMBGroup = stopGroup.stops.every(s => s.type === 'GMB');
    const section = document.createElement('div');
    section.className = 'stop-section';
    const titleClass = isGMBGroup ? 'stop-title gmb-title' : 'stop-title';
    section.innerHTML = `${stopRefreshIndicatorHtml()}<div class="${titleClass}">${stopGroup.name}</div>`;

    // We create a new table structure. 
    // Note: The render function will copy this innerHTML to the DOM element later.
    const table = document.createElement('table');
    table.className = 'eta-table';
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    section.appendChild(table);

    const promises = stopGroup.stops.map(async stop => {
        if (stop.type === 'CTB') {
            const etas = (await fetchCtbStopETA(stop.id)).filter(eta => eta.eta);
            // Group by route and dir
            const routeGroups = {};
            etas.forEach(eta => {
                const route = eta.route;
                if (!isStopEtaRouteAllowed(route, eta.dir, stopGroup, stop)) return;
                const key = `${route}_${eta.dir}`;
                if (!routeGroups[key]) routeGroups[key] = [];
                routeGroups[key].push(eta);
            });

            return Object.keys(routeGroups).map(key => {
                const groupEtas = routeGroups[key];
                const route = groupEtas[0].route;
                return {
                    company: 'CTB',
                    route: route,
                    dir: groupEtas[0].dir,
                    stopId: stop.id,
                    stopCode: stop.code,
                    stopLabel: stop.label,
                    dest: applyDestReplacement(groupEtas[0].dest),
                    etas: groupEtas
                };
            });
            /*
        } else if (stop.type === 'NLB') {
            const routeId = stop.routeId ?? stop.route;
            const etas = (await fetchNlbStopETA(routeId, stop.id)).filter(eta => eta.eta);
            const route = stop.routeNo || stop.route || String(routeId);
            etas.forEach(eta => {
                eta.route = route;
                eta._co = 'NLB';
            });
            return [{
                company: 'NLB',
                route,
                dir: etas[0]?.dir || 'O',
                stopId: stop.id,
                stopCode: stop.code,
                stopLabel: stop.label,
                dest: applyDestReplacement(etas[0]?.dest_tc || ''),
                etas
            }];
        } else if (stop.type === 'MTRB') {
            const routeName = stop.routeName || stop.route || stop.routeId;
            const etas = await fetchMtrStopETA(routeName, stop.id);
            etas.forEach(eta => { eta._co = 'MTRB'; });
            return [{
                company: 'MTRB',
                route: routeName,
                dir: 'O',
                stopId: stop.id,
                stopCode: stop.code,
                stopLabel: stop.label,
                dest: routeName,
                etas
            }];*/
        } else if (stop.type === 'GMB') {
            const etas = await fetchGMBStopETA(stop.routeId, stop.id);
            const cacheKey = `GMB_${stop.routeId}_${stop.id}`;
            
            if (!etas || etas.length === 0) {
                if (STOP_CACHE[cacheKey]) {
                    // Use cached groups but mark as stale
                    return STOP_CACHE[cacheKey].map(g => ({ ...g, isStale: true }));
                } else {
                    // No cache, construct a dummy group just to show the route
                    const routeMeta = GMB_META[stop.routeId.toString()];
                    const routeNo = routeMeta ? routeMeta.route : stop.code;
                    
                    if (routeMeta) {
                        const dummyGroups = [];
                        if (routeMeta['1']) dummyGroups.push({ company: 'GMB', route: routeNo, dir: '1', stopId: stop.id, stopCode: stop.code, stopLabel: null, dest: routeMeta['1'], etas: [], isStale: true });
                        if (routeMeta['2']) dummyGroups.push({ company: 'GMB', route: routeNo, dir: '2', stopId: stop.id, stopCode: stop.code, stopLabel: null, dest: routeMeta['2'], etas: [], isStale: true });
                        return dummyGroups.length > 0 ? dummyGroups : [{ company: 'GMB', route: routeNo, dir: '1', stopId: stop.id, stopCode: stop.code, stopLabel: null, dest: '', etas: [], isStale: true }];
                    }
                    
                    return {
                        company: 'GMB',
                        route: routeNo,
                        dir: '1',
                        stopId: stop.id,
                        stopCode: stop.code,
                        stopLabel: null,
                        dest: '',
                        etas: [],
                        isStale: true
                    };
                }
            }

            // Sort by time
            etas.sort((a, b) => new Date(a.eta) - new Date(b.eta));
            
            // Group if multiple dests...
            const routeGroups = {};
            etas.forEach(eta => {
                const key = `${eta.route}_${eta.dir}`;
                if (!routeGroups[key]) routeGroups[key] = [];
                routeGroups[key].push(eta);
            });

            const groups = Object.keys(routeGroups).map(key => {
                const groupEtas = routeGroups[key];
                return {
                    company: 'GMB',
                    route: groupEtas[0].route,
                    dir: groupEtas[0].dir,
                    stopId: stop.id,
                    stopCode: stop.code,
                    stopLabel: null,
                    dest: groupEtas[0].dest_tc, // From GMB_META
                    etas: groupEtas
                };
            });
            STOP_CACHE[cacheKey] = groups;
            return groups;
        } else {
            const etas = (await fetchKmbStopETA(stop.id)).filter(eta => eta.eta);
            const routes = stop.routes || [];
            
            // Group by route and dir
            const routeGroups = {};
            etas.forEach(eta => {
                const route = eta.route;
                if (!isStopEtaRouteAllowed(route, eta.dir, stopGroup, stop)) return;
                
                const key = `${route}_${eta.dir}`;
                if (!routeGroups[key]) routeGroups[key] = [];
                routeGroups[key].push(eta);
            });

            return Object.keys(routeGroups).map(key => {
                const groupEtas = routeGroups[key];
                const route = groupEtas[0].route;
                return {
                    company: 'KMB',
                    route: route,
                    dir: groupEtas[0].dir,
                    stopId: stop.id,
                    stopCode: stop.code,
                    stopLabel: stop.label,
                    dest: applyDestReplacement(groupEtas[0].dest_tc),
                    etas: groupEtas
                };
            });
        }
    });

    const results = await Promise.all(promises);
    const flatResults = results.flat();

    // Tag each ETA with its source company before merging
    flatResults.forEach(group => {
        group.etas.forEach(eta => {
            if (!eta._co) eta._co = group.company;
        });
        // Filter out invalid ETAs:
        // - CTB records with null/empty ETA (e.g. "KMB Cycle" placeholder)
        // - Records indicating service has ended ("最後班次已過")
        group.etas = group.etas.filter(eta => {
            if (!eta.eta && (eta.rmk_tc === '最後班次已過' || eta.rmk_en === 'The final bus has departed from this stop')) return false;
            if (!eta.eta && eta.rmk === 'KMB Cycle') return false;
            if (!eta.eta && eta._co === 'CTB' && !eta.rmk_tc) return false;
            return true;
        });
    });

    // Normalize co-operated directions before merging KMB and CTB groups.
    // This is required when the two operators use opposite O/I codes and
    // their destination text is not identical (for example, 680).
    const coOperatedGroupsByRoute = new Map();
    flatResults.forEach(group => {
        if ((group.company !== 'KMB' && group.company !== 'CTB') || !isCrossOperatorRoute(group.route)) return;
        if (!coOperatedGroupsByRoute.has(group.route)) coOperatedGroupsByRoute.set(group.route, []);
        coOperatedGroupsByRoute.get(group.route).push(group);
    });
    await Promise.all([...coOperatedGroupsByRoute.entries()]
        .filter(([, groups]) => new Set(groups.map(group => group.company)).size > 1)
        .flatMap(([route, groups]) => groups.map(async group => {
            group.coOperatedDirection = group.company === 'KMB'
                ? group.dir
                : await getCooperatedDirection(route, 'CTB', group.dir);
        })));

    // Merge same routes from different stops/companies (KMB+CTB co-operated)
    const mergedGroups = {};
    flatResults.forEach(group => {
        const isBusOperator = group.company === 'KMB' || group.company === 'CTB';
        const coKey = isBusOperator ? 'BUS' : group.company;
        const directionKey = isBusOperator ? (group.coOperatedDirection || group.dir) : group.dir;
        const defaultKey = `${coKey}-${group.route}-${directionKey}`;
        // KMB and CTB can report opposite direction codes for the same co-operated journey.
        // Match that case by destination only when adding the other operator, preserving
        // separate same-operator journeys that happen to share a destination.
        const matchingOperatorKey = isBusOperator
            ? Object.keys(mergedGroups).find(existingKey => {
                const existingGroup = mergedGroups[existingKey];
                const hasMatchingDestination = Object.values(existingGroup.dests || {})
                    .some(dest => String(dest || '').trim() === String(group.dest || '').trim());
                return existingGroup.route === group.route
                    && !existingGroup.companies.has(group.company)
                    && (hasMatchingDestination
                        || (isCrossOperatorRoute(group.route)
                            && existingGroup.coOperatedDirection === group.coOperatedDirection));
            })
            : null;
        const key = matchingOperatorKey || defaultKey;
        if (!mergedGroups[key]) {
            mergedGroups[key] = {
                ...group,
                companies: new Set([group.company]),
                operatorDirections: { [group.company]: group.dir },
                stopCodes: { [group.company]: { code: group.stopCode, label: group.stopLabel } },
                stopIds: { [group.company]: group.stopId },
                dests: { [group.company]: group.dest }
            };
        } else {
            mergedGroups[key].etas = mergedGroups[key].etas.concat(group.etas);
            mergedGroups[key].companies.add(group.company);
            mergedGroups[key].operatorDirections[group.company] = group.dir;
            if (!mergedGroups[key].stopCodes[group.company]) {
                mergedGroups[key].stopCodes[group.company] = { code: group.stopCode, label: group.stopLabel };
            }
            if (!mergedGroups[key].stopIds) mergedGroups[key].stopIds = {};
            if (!mergedGroups[key].stopIds[group.company]) mergedGroups[key].stopIds[group.company] = group.stopId;
            if (!mergedGroups[key].dests[group.company]) {
                mergedGroups[key].dests[group.company] = group.dest;
            }
            if (group.isStale) mergedGroups[key].isStale = true;
        }
    });

    // Filter out groups with no ETAs
    const validGroups = Object.values(mergedGroups).filter(group => {
        if (!group.etas || group.etas.length === 0) return false;
        // KMB/CTB buses must have at least one valid ETA. Minibus can show dummy "載入中..." without an ETA.
        if (group.company !== 'GMB') {
            return group.etas.some(item => item.eta);
        }
        return true;
    });

    // Co-operated operators can use opposite O/I codes for the same journey.
    // Compare endpoint coordinates only for confirmed co-operated routes.
    await Promise.all(validGroups.filter(group => group.companies?.size > 1).map(async group => {
        const sourceCompany = group.companies.has('KMB') ? 'KMB' : [...group.companies][0];
        const sourceDirection = group.operatorDirections[sourceCompany] || group.dir;
        const otherCompany = sourceCompany === 'KMB' ? 'CTB' : 'KMB';
        group.operatorDirections[otherCompany] = await getCooperatedDirection(group.route, sourceCompany, sourceDirection);
    }));

    const sortedGroups = sortEtaGroupsByFirstArrival(validGroups);

    if (sortedGroups.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="loading">沒有班次</td></tr>`;
    } else {
        // Split into pinned and unpinned groups
        const pinList = stopGroup.pin && stopGroup.pin.length > 0 ? stopGroup.pin : null;
        function isPinned(group) {
            if (!pinList) return false;
            return pinList.some(entry => {
                const parts = entry.split('|');
                const r = parts[0];
                const d = parts[1] || null;
                if (r !== group.route) return false;
                if (d && d !== group.dir) return false;
                return true;
            });
        }
        const pinnedGroups = pinList ? sortedGroups.filter(g => isPinned(g)) : [];
        const otherGroups = pinList ? sortedGroups.filter(g => !isPinned(g)) : sortedGroups;

        function renderRow(group) {
            const row = document.createElement('tr');
            if (group.isNoEta) {
                row.className = 'no-eta-row';
                row.innerHTML = `
                    <td class="route-no text-dark-grey"></td>
                    <td class="dest text-dark-grey"><span class="dest-text">${group.dest}</span></td>
                    <td class="time-container"></td>
                `;
                tbody.appendChild(row);
                return;
            }
            
            const uniqueEtas = deduplicateEtaRecords(group.etas);

            let destRemarkHtml = '';

            // For co-operated routes, use destination from the first upcoming bus's company
            if (group.companies && group.companies.size > 1 && uniqueEtas[0] && uniqueEtas[0]._co && group.dests) {
                const firstCo = uniqueEtas[0]._co;
                if (group.dests[firstCo]) {
                    group.dest = group.dests[firstCo];
                }
            }

            // Departures HTML
            const departures = uniqueEtas.slice(0, 3);
            const departuresHtml = departures.map((item, index) => {
                let isArriving = false;
                let minClass = 'text-yellow';
                let minText = '-';
                let diffMins = 999;
                
                if (item.eta) {
                    const diffMs = new Date(item.eta) - new Date();
                    diffMins = Math.floor(diffMs / 60000);
                    isArriving = diffMins < 1;
                    minText = formatDuration(item.eta, item.rmk_tc);
                } else {
                    // No ETA (dummy)
                    minText = item.rmk_tc || '-';
                    if (item.rmk_tc === '未開出') minText = '-'; // We show the tag via remarkTag
                    minClass = 'text-grey';
                }
                
                let remarkText = '';
                let remarkTag = '';

                // Handle remarks
                if (item.rmk_tc === '原定班次' || item.rmk_tc === '未開出') {
                    remarkTag = '預定';
                    minClass = 'text-grey';
                } else if (item.rmk_tc === '最後班次') {
                    remarkTag = '尾班';
                } else if (item.rmk_tc) {
                    const cleanedRmk = cleanRemark(item.rmk_tc);
                    if (index === 0) {
                        destRemarkHtml = createMarqueeHtml(`⚠${cleanedRmk}`, 'dest-remark dest-remark-marquee');
                    } else {
                        remarkText = formatRemark(cleanedRmk);
                    }
                }

                if (item.eta) {
                    if (isArriving) {
                        minClass = 'text-green';
                    } else if (diffMins < 5) {
                        minClass = 'text-light-green';
                    } else if (item.rmk_tc === '原定班次' || item.rmk_tc === '未開出') {
                        minClass = 'text-grey';
                    } else if (diffMins > 30) {
                        minClass = 'text-yellow';
                    }
                }

                // If the entire group is stale (e.g. cached but update failed), force font grey
                // Skip overriding if it's arriving so the Arriving box styling isn't messed up
                if (group.isStale && !isArriving) {
                    minClass = 'text-dark-grey';
                }

                let itemClass = isArriving ? 'eta-item arriving' : 'eta-item';
                if (departures.length > 2 && index === departures.length - 1) {
                    itemClass += ' eta-item-last';
                }
                // Co-operated route: add company border if multiple companies in group
                if (group.companies && group.companies.size > 1 && item._co) {
                    itemClass += item._co === 'KMB' ? ' eta-border-kmb' : ' eta-border-ctb';
                }

                const displayRemark = remarkText || '&nbsp;';
                
                let etaTagClass = '';
                if (item.rmk_tc === '原定班次' || item.rmk_tc === '未開出' || (group.isStale && !isArriving)) {
                    etaTagClass = isArriving ? ' text-black' : ' text-grey';
                }
                else {
                    etaTagClass = isArriving ? ' text-black' : diffMins < 30 ? ' text-white' : ' text-grey';
                    etaTagClass += ' bold';
                }

                let innerHtml = `
                    <div class="eta-large ${minClass}">
                        <span class="time-text-b${isArriving ? ' bold' : ''}" data-timestamp="${item.eta}" data-remark="${item.rmk_tc || ''}">${minText}</span>
                    </div>
                    <div class="eta-small">
                        <span class="eta-remark-tag${etaTagClass}">${formatTimeHtmlMinMode(item.eta)}</span>
                        <span class="eta-remark-tag-small${etaTagClass}">${remarkTag}</span>
                    </div>
                `;

                return `<div class="${itemClass}">
                    ${innerHtml}
                </div>`
            }).join('');

            // Stop code styling
            let groupStopCodeHtml = '';
            let stopCodeHtml = '';

            // Determine effective direction for display (apply INBOUND_FLIP)
            const flipList = (typeof INBOUND_FLIP !== 'undefined') ? INBOUND_FLIP : [];
            const isFlipped = flipList.includes(group.route);
            const displayCompany = (group.companies && group.companies.size > 1 && uniqueEtas[0] && uniqueEtas[0]._co)
                ? uniqueEtas[0]._co : group.company;
            const displayDirection = group.operatorDirections?.[displayCompany] || group.dir;
            const effectiveDir = isFlipped ? (displayDirection === 'O' ? 'I' : 'O') : displayDirection;

            if (group.companies && group.companies.size > 1 && group.stopCodes) {
                // Co-operated route: show both company codes separated by /
                const label = (group.stopCodes.KMB && group.stopCodes.KMB.label)
                    || (group.stopCodes.CTB && group.stopCodes.CTB.label);
                if (label) {
                    groupStopCodeHtml += `<span class="stop-label">${escapeHtml(label)}</span>`;
                }
                let dirClass = effectiveDir === 'O' ? 'outbound' : 'inbound';
                let dirCircleHtml = `<span class="dir-circle ${dirClass}"></span>`;
                const stopName = stopGroup.name || '';
                const stopCodeItems = ['KMB', 'CTB'].flatMap(company => {
                    const stopCode = group.stopCodes[company]?.code;
                    if (!stopCode) return [];
                    const displayStopCode = formatStopCodeForDisplay(company, stopCode);
                    const stopId = group.stopIds && group.stopIds[company];
                    const infoButtonHtml = stopId
                        ? `<button class="route-stop-info-button" type="button" data-company="${company}" data-stop-id="${escapeHtml(stopId)}" data-stop-name="${escapeHtml(stopName)}" data-stop-code="${escapeHtml(stopCode)}" title="查看本站到站時間" aria-label="查看${escapeHtml(stopName)}到站時間">${escapeHtml(displayStopCode)}</button>`
                        : '';
                    return infoButtonHtml;
                });
                stopCodeHtml += `<span class="stop-code">${dirCircleHtml} ${stopCodeItems.join(' ')}</span>`;
            } else if (group.company !== 'GMB') {
                if (group.stopLabel) {
                    groupStopCodeHtml += `<span class="stop-label">${escapeHtml(group.stopLabel)}</span>`;
                }
                let dirClass = effectiveDir === 'O' ? 'outbound' : 'inbound';
                let dirCircleHtml = `<span class="dir-circle ${dirClass}"></span>`;
                const kmbStopId = group.company === 'KMB'
                    ? group.stopId
                    : (group.stopIds && group.stopIds.KMB);
                const ctbStopId = group.company === 'CTB'
                    ? group.stopId
                    : (group.stopIds && group.stopIds.CTB);
                const infoStopId = kmbStopId || ctbStopId;
                const infoCompany = kmbStopId ? 'KMB' : 'CTB';
                const stopName = stopGroup.name || '';
                const infoButtonHtml = infoStopId
                    ? `<button class="route-stop-info-button" type="button" data-company="${infoCompany}" data-stop-id="${escapeHtml(infoStopId)}" data-stop-name="${escapeHtml(stopName)}" data-stop-code="${escapeHtml(group.stopCode)}" title="查看本站到站時間" aria-label="查看${escapeHtml(stopName)}到站時間">${escapeHtml(formatStopCodeForDisplay(infoCompany, group.stopCode))}</button>`
                    : '';
                stopCodeHtml += `<span class="stop-code">${dirCircleHtml} ${infoButtonHtml}</span>`;
            }

            // For co-operated routes, use company of earliest ETA for route color
            const routeClass = getRouteNumberClass(group.route, displayCompany);
            const routeCompany = displayCompany;
            const routeDirection = group.operatorDirections?.[routeCompany] || group.dir;
            let routeTextClass = 'route-text';
            if (group.route.length >= 4) {
                routeTextClass += ' long-route-text';
            }

            let destClass = 'dest';
            let destTextClass = group.company === 'GMB' ? 'dest-text' : 'dest-text dest-text-marquee';

            let destContent = '';
            if (group.company === 'GMB') {
                // Show last update time for GMB
                const gmbTimestamp = group.etas[0] && group.etas[0].data_timestamp;
                let gmbUpdateHtml = '';
                if (gmbTimestamp) {
                    const updateDate = new Date(gmbTimestamp);
                    const updateStr = updateDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    gmbUpdateHtml = `<div class="dest-sub-info"><span class="stop-code">Last update: ${updateStr}</span></div>`;
                }
                destContent = `<span class="${destTextClass}">${group.dest} ${destRemarkHtml}</span>${gmbUpdateHtml}`;
            } else {
                destContent = `
                    <span class="${destTextClass}"><span class="dest-main-line">${createMarqueeHtml(group.dest, 'dest-name-marquee')} ${groupStopCodeHtml}</span></span>
                    <div class="dest-sub-info">
                        <span class="stop-info">${stopCodeHtml}</span>
                        ${destRemarkHtml}
                    </div>
                `;
            }

            const routeEtaSupported = displayCompany === 'KMB' || displayCompany === 'CTB';
            const routeLinkState = routeEtaSupported ? '' : ' disabled';
            const routeLinkTitle = routeEtaSupported ? ' title="查看路線到站時間"' : '';
            const routeLinkHtml = `<button class="route-link ${routeTextClass}" type="button"${routeLinkState}${routeLinkTitle} data-route="${escapeHtml(group.route)}" data-company="${routeCompany}" data-companies="${group.companies ? [...group.companies].join(',') : group.company}" data-direction="${routeDirection}" data-service-type="${uniqueEtas[0]?.service_type || 1}" aria-label="查看${escapeHtml(group.route)}路線到站時間">${formatRouteNumber(group.route)}</button>`;

            row.innerHTML = `
                <td class="route-no${routeClass}">${routeLinkHtml}</td>
                <td class="${destClass}">${destContent}</td>
                <td class="time-container">${departuresHtml}</td>
            `;
            tbody.appendChild(row);
        }

        pinnedGroups.forEach(renderRow);
        if (pinnedGroups.length > 0 && otherGroups.length > 0) {
            const dividerRow = document.createElement('tr');
            dividerRow.innerHTML = `<td colspan="3" class="pin-divider"></td>`;
            tbody.appendChild(dividerRow);
        }
        otherGroups.forEach(renderRow);
    }
    return section;
}

async function render() {
    const container = document.getElementById('stops-container');

    // Get stops sorted by current time configuration
    const activePriorityConfig = getActivePriorityConfig();
    const sortedStops = getSortedStops(activePriorityConfig);

    // Identify active sections
    const activeIds = new Set(sortedStops.map(s => `section-${s.id}`));

    // 1. Structure Sync Phase - Two-column layout
    // Ensure column containers exist
    let leftCol = container.querySelector('.grid-column-left');
    let rightCol = container.querySelector('.grid-column-right');
    if (!leftCol) {
        leftCol = document.createElement('div');
        leftCol.className = 'grid-column grid-column-left';
        container.appendChild(leftCol);
    }
    if (!rightCol) {
        rightCol = document.createElement('div');
        rightCol.className = 'grid-column grid-column-right';
        container.appendChild(rightCol);
    }

    // Helper: get or create a section element
    function ensureSection(stopGroup) {
        let el = document.getElementById(`section-${stopGroup.id}`);
        if (!el) {
            const isGMBGroup = stopGroup.stops.every(s => s.type === 'GMB');
            const titleClass = isGMBGroup ? 'stop-title gmb-title' : 'stop-title';
            el = document.createElement('div');
            el.id = `section-${stopGroup.id}`;
            el.className = 'stop-section';
            el.innerHTML = `${stopRefreshIndicatorHtml()}<div class="${titleClass}">${stopGroup.name}</div><div class="loading-text" style="padding:10px; color:#888;">載入中...</div>`;
        }
        return el;
    }

    // Time-based priority takes precedence over fixed grid positions.
    const pinnedIds = new Set(
        !activePriorityConfig && typeof GRID_LAYOUT !== 'undefined' ? GRID_LAYOUT : []
    );

    // Place pinned items into designated columns (even index → left, odd → right)
    if (!activePriorityConfig && typeof GRID_LAYOUT !== 'undefined') {
        GRID_LAYOUT.forEach((id, idx) => {
            const sg = sortedStops.find(s => s.id === id);
            if (!sg) return;
            const col = (idx % 2 === 0) ? leftCol : rightCol;
            col.appendChild(ensureSection(sg));
        });
    }

    // Place remaining items alternating left/right
    let remainingIdx = 0;
    sortedStops.forEach(sg => {
        if (pinnedIds.has(sg.id)) return;
        const col = (remainingIdx % 2 === 0) ? leftCol : rightCol;
        col.appendChild(ensureSection(sg));
        remainingIdx++;
    });

    // Set CSS order for narrow-screen fallback (columns use display:contents)
    sortedStops.forEach((sg, idx) => {
        const el = document.getElementById(`section-${sg.id}`);
        if (el) el.style.order = idx;
    });

    // 2. Cleanup Phase - Remove stale sections from columns
    [leftCol, rightCol].forEach(col => {
        Array.from(col.children).forEach(child => {
            if (child.id && child.id.startsWith('section-') && !activeIds.has(child.id)) {
                col.removeChild(child);
            }
        });
    });

    // 3. Data Fetch & Update Phase (Asynchronous)
    // Fetch and update each section independent of others
    sortedStops.forEach(stopGroup => {
        const section = document.getElementById(`section-${stopGroup.id}`);
        setStopRefreshState(section, 'loading');

        processStopGroup(stopGroup).then(newContent => {
            const sectionId = `section-${stopGroup.id}`;
            const currentEl = document.getElementById(sectionId);
            
            if (currentEl && newContent) {
                // Check if content actually changed to avoid unnecessary DOM thrashing?
                // For now, just replace innerHTML.
                // Note: newContent is a DIV wrapper. We want its innerHTML.
                
                // Safety: only update if the new content is valid
                if (newContent.innerHTML.trim() !== "") {
                    currentEl.innerHTML = newContent.innerHTML;
                    if (newContent.className !== currentEl.className) {
                        currentEl.className = newContent.className;
                    }
                    updateMarqueeOverflow(currentEl);
                    setStopRefreshState(currentEl, 'complete');
                }
            }
        }).catch(err => {
            console.error(`Error rendering group ${stopGroup.id}:`, err);
            setStopRefreshState(document.getElementById(`section-${stopGroup.id}`), 'hidden');
            // Optionally indicator error in UI, but usually best to leave stale data vs error message
        });
    });
}

// Initial render;
render();
// Update every 30 seconds
setInterval(render, 30000); 
setInterval(() => {
    void refreshRouteWindow();
    void refreshStopEtaWindow();
}, 30000);
setInterval(updateClock, 1000); // Update clock every second
setInterval(updateDayCountdown, 1000);
setInterval(() => {
    // Update countdowns every second without full re-render
    const timeTexts = document.querySelectorAll('.time-text, .time-text-b');
    timeTexts.forEach(el => {
        const timestamp = el.getAttribute('data-timestamp');
        const remark = el.getAttribute('data-remark');
        if (timestamp) {
            const newText = formatDuration(timestamp, remark);
            el.innerHTML = newText;
        }
    });
}, 1000);
updateClock();
updateDayCountdown();
initializeStationSearch();
initializeTitleStopSearch();

document.addEventListener('click', event => {
    const routeLink = event.target.closest('.route-link');
    if (!routeLink || routeLink.disabled) return;
    openRouteWindow(
        routeLink.dataset.route,
        routeLink.dataset.company,
        routeLink.dataset.direction,
        routeLink.dataset.serviceType,
        routeLink.dataset.companies
    );
});
