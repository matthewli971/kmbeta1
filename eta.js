// ===== ETA data and calculation helpers =====
const APP_API = window.API_ENDPOINTS;

const CORS_PROXIES = APP_API.gmb.proxyTemplates.map(template => url => template
    .replace('{url}', encodeURIComponent(url))
    .replace('{rawUrl}', url));
const MTR_ROUTE_CACHE = new Map();

function fillApiTemplate(template, values) {
    return Object.entries(values).reduce(
        (url, [key, value]) => url.replace(`{${key}}`, encodeURIComponent(value ?? '')),
        template
    );
}

async function fetchKmbStopETA(stopId) {
    try {
        const response = await fetch(`${APP_API.kmb.stopEta}/${stopId}?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error(`Error fetching ETA for stop ${stopId}:`, error);
        return [];
    }
}

async function fetchCtbStopETA(stopId) {
    try {
        const response = await fetch(`${APP_API.ctb.stopEta}/${stopId}?lang=zh-hant&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        return data.data || [];
    } catch (error) {
        console.error(`Error fetching Citybus ETA for ${stopId}:`, error);
        return [];
    }
}
/*
async function fetchNlbStopETA(routeId, stopId) {
    if (routeId === null || routeId === undefined || stopId === null || stopId === undefined) return [];
    try {
        const url = fillApiTemplate(APP_API.nlb.stopEta, {
            routeId,
            stopId,
            languageCode: APP_CONFIG.apiLanguage
        });
        const response = await fetch(`${url}&t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('NLB API request failed');
        const result = await response.json();
        return (result.estimatedArrivals || []).map((item, index) => ({
            co: 'NLB',
            route: String(item.route || routeId),
            dir: item.dir || 'O',
            seq: item.seq ?? stopId,
            eta_seq: index + 1,
            eta: item.estimatedArrivalTime || null,
            dest_tc: item.routeVariantName || '',
            dest_en: item.routeVariantName || '',
            rmk_tc: item.rmk || '',
            rmk_en: item.rmk || '',
            data_timestamp: item.generateTime || null,
            departed: item.departed,
            noGPS: item.noGPS,
            wheelChair: item.wheelChair
        }));
    } catch (error) {
        console.error(`Error fetching NLB ETA for route ${routeId}, stop ${stopId}:`, error);
        return [];
    }
}

async function fetchMtrRouteSchedule(routeName) {
    if (!routeName) return null;
    const cached = MTR_ROUTE_CACHE.get(routeName);
    if (cached && Date.now() - cached.fetchedAt < APP_CONFIG.mtrScheduleCacheTtlMs) {
        return cached.promise;
    }

    {
        const promise = fetch(APP_API.mtrb.schedule, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: APP_CONFIG.apiLanguage, routeName }),
            cache: 'no-store'
        }).then(response => {
            if (!response.ok) throw new Error(`MTR Bus API request failed (${response.status})`);
            return response.json();
        }).catch(error => {
            MTR_ROUTE_CACHE.delete(routeName);
            throw error;
        });
        MTR_ROUTE_CACHE.set(routeName, { promise, fetchedAt: Date.now() });
        return promise;
    }
}
*/
async function fetchMtrStopETA(routeName, stopId) {
    try {
        const result = await fetchMtrRouteSchedule(routeName);
        const stop = (result?.busStop || []).find(item => String(item.busStopId) === String(stopId));
        if (String(stop?.isSuspended) === '1') return [];
        return (stop?.bus || []).map((item, index) => {
            const seconds = Number(item.arrivalTimeInSecond);
            const hasEta = Number.isFinite(seconds) && seconds >= 0 && seconds < 108000;
            return {
                co: 'MTRB',
                route: routeName,
                dir: 'O',
                seq: stopId,
                eta_seq: index + 1,
                eta: hasEta ? new Date(Date.now() + seconds * 1000).toISOString() : null,
                dest_tc: routeName,
                dest_en: routeName,
                rmk_tc: item.busRemark || item.arrivalTimeText || '',
                rmk_en: item.busRemark || item.arrivalTimeText || '',
                data_timestamp: result?.routeStatusTime || null,
                isScheduled: item.isScheduled
            };
        }).filter(item => item.eta);
    } catch (error) {
        console.error(`Error fetching MTR Bus ETA for ${routeName}, stop ${stopId}:`, error);
        return [];
    }
}

async function fetchGMBStopETA(routeId, stopId) {
    const targetUrl = `${APP_API.gmb.routeStopEta}/${routeId}/${stopId}`;
    let lastError = null;

    for (const proxyFn of CORS_PROXIES) {
        try {
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 200));
            const proxyUrl = proxyFn(`${targetUrl}?t=${Date.now()}`);
            const response = await fetch(proxyUrl, { cache: 'no-store' });

            if (!response.ok) {
                if (response.status === 429 || response.status >= 500) {
                    console.warn(`Proxy ${proxyUrl} failed with ${response.status}, trying next...`);
                    continue;
                }
                throw new Error(`Network response was not ok: ${response.status}`);
            }

            const json = await response.json();
            const routeMeta = GMB_META[routeId.toString()];
            const routeNo = routeMeta ? routeMeta.route : '?';
            const mappedETAs = [];

            (json.data || []).forEach(dirGroup => {
                const seq = dirGroup.route_seq;
                const destName = routeMeta ? routeMeta[seq] : `Seq ${seq}`;
                (dirGroup.eta || []).forEach(item => {
                    if (!item.timestamp && !item.remarks_tc) return;
                    mappedETAs.push({
                        co: 'GMB',
                        route: routeNo,
                        dir: seq.toString(),
                        service_type: 1,
                        seq: item.eta_seq,
                        dest_tc: destName,
                        dest_en: destName,
                        eta: item.timestamp || null,
                        rmk_tc: item.remarks_tc || '',
                        rmk_en: item.remarks_en || '',
                        data_timestamp: new Date().toISOString()
                    });
                });
            });
            return mappedETAs;
        } catch (error) {
            console.warn(`Proxy attempt failed for GMB ${routeId}/${stopId}:`, error);
            lastError = error;
        }
    }

    console.error(`All proxies failed for GMB ETA ${routeId}/${stopId}`, lastError);
    return [];
}

function sortEtaRecords(etas) {
    return etas.sort((a, b) => {
        if (!a.eta) return 1;
        if (!b.eta) return -1;
        return new Date(a.eta) - new Date(b.eta);
    });
}

function sortEtaGroupsByFirstArrival(groups) {
    return groups.sort((a, b) => {
        sortEtaRecords(a.etas);
        sortEtaRecords(b.etas);

        const timeA = a.etas[0]?.eta ? new Date(a.etas[0].eta) : new Date(8640000000000000);
        const timeB = b.etas[0]?.eta ? new Date(b.etas[0].eta) : new Date(8640000000000000);
        return timeA - timeB;
    });
}

function setPopupEtaColumnCount(popup, maximumEtaCount) {
    if (!popup) return;
    const columnCount = Math.max(0, Math.min(3, Number(maximumEtaCount) || 0));
    popup.classList.toggle('popup-eta-columns-1', columnCount <= 1);
    popup.classList.toggle('popup-eta-columns-2', columnCount === 2);
}

function deduplicateEtaRecords(etas) {
    const uniqueEtas = [];
    const seenTimes = new Set();
    sortEtaRecords(etas).forEach(item => {
        if (!item.eta) {
            uniqueEtas.push(item);
            return;
        }
        const timeStr = new Date(item.eta).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        if (!seenTimes.has(timeStr)) {
            seenTimes.add(timeStr);
            uniqueEtas.push(item);
        }
    });
    return uniqueEtas;
}
