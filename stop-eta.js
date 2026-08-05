// ===== Shared Stop ETA Filtering =====
window.isStopEtaRouteAllowed = function isStopEtaRouteAllowed(route, dir, stopGroup, stop) {
    const routeList = stop?.routes;
    if (routeList && routeList.length > 0 && !routeList.includes(route)) {
        return false;
    }

    const filterList = stopGroup?.filter;
    const excludeList = stopGroup?.exclude;

    const matchesEntry = entry => {
        const [entryRoute, entryDirection] = entry.split('|');
        return entryRoute === route && (!entryDirection || entryDirection === dir);
    };

    if (filterList && filterList.length > 0) {
        return filterList.some(matchesEntry);
    }

    if (excludeList && excludeList.length > 0) {
        return !excludeList.some(matchesEntry);
    }

    return true;
};

window.formatTimeHtmlMinMode = function formatTimeHtmlMinMode(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${mins}:${secs}`;
};

window.formatDuration = function formatDuration(timestamp, remark) {
    if (!timestamp) return '-';
    const eta = new Date(timestamp);
    if (isNaN(eta.getTime())) return '-';
    const now = new Date();
    let diffMs = eta - now;

    if (diffMs <= 0) {
        return '<span class="arriving-text">進站中</span>';
    }

    const diffMins = Math.floor(diffMs / 60000);
    if (isNaN(diffMins)) return '-';
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    const paddedSecs = diffSecs.toString().padStart(2, '0');
    const isScheduled = remark === '原定班次';

    if (!isScheduled && diffMins < 5) {
        if (diffMins < 1) {
            if (diffSecs === 0) return '<span class="arriving-text">進站中</span>';
            return `${diffSecs}s`;
        }
        return `${diffMins}:${paddedSecs}`;
    }

    if (diffMins < 1) return '<span class="arriving-text">進站中</span>';
    return `${diffMins} m`;
};