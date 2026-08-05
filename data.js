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
        stopEta: 'https://rt.data.gov.hk/v1/transport/batch/stop-eta/CTB',
        route: 'https://rt.data.gov.hk/v2/transport/citybus/route/CTB',
        routeStop: 'https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB',
        stop: 'https://rt.data.gov.hk/v2/transport/citybus/stop',
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
