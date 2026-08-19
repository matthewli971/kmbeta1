// ===== Shared API Endpoints =====
window.API_ENDPOINTS = Object.freeze({
    kmb: Object.freeze({
        stop: 'https://data.etabus.gov.hk/v1/transport/kmb/stop',
        stopEta: 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta',
        route: 'https://data.etabus.gov.hk/v1/transport/kmb/route',
        routeStop: 'https://data.etabus.gov.hk/v1/transport/kmb/route-stop',
        routeEta: 'https://data.etabus.gov.hk/v1/transport/kmb/route-eta'
    }),
    ctb: Object.freeze({
        stop: 'https://rt.data.gov.hk/v2/transport/citybus/stop',
        stopEta: 'https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB',
        route: 'https://rt.data.gov.hk/v1/transport/citybus-nwfb/route/ctb',
        routeStop: 'https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB',
        eta: 'https://rt.data.gov.hk/v2/transport/citybus/eta/CTB'
    }),
    gmb: Object.freeze({
        routeStopEta: 'https://data.etagmb.gov.hk/eta/route-stop',
        proxyTemplates: Object.freeze([
            'https://api.allorigins.win/raw?url={url}',
            'https://corsproxy.io/?{url}',
            'https://thingproxy.freeboard.io/fetch/{rawUrl}'
        ])
    })
});

// Routes that may be operated by both KMB and CTB.
// Keep route values and regular expressions here so the list can be edited
// without changing the route ETA window implementation.
window.CROSS_OPERATOR_ROUTE_CONFIG = Object.freeze({
    routes: Object.freeze(['S1', 'R8', 'SP10', 'SP12']),
    patterns: Object.freeze(['^[1369]\\d{2}[A-Za-z]?$', '^(?:S1|R8|SP10|SP12)$'])
});
