// ===== ETA data and calculation helpers =====
const APP_API = window.API_ENDPOINTS;

const CORS_PROXIES = APP_API.gmb.proxyTemplates.map(template => url => template
    .replace('{url}', encodeURIComponent(url))
    .replace('{rawUrl}', url));

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
