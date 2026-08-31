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

window.extractViaPoints = function extractViaPoints(placeName) {
    const viaPoints = [];
    const name = String(placeName || '').replace(/[（(]\s*經\s*[:：]?\s*([^()（）]*?)[）)]/g, (match, viaPoint) => {
        const point = viaPoint.trim().replace(/\s+/g, ' ');
        if (point) viaPoints.push(point);
        return '';
    }).replace(/\s{2,}/g, ' ').trim();
    return { name, viaPoints };
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

window.renderPopupEtaItem = function renderPopupEtaItem(eta, { showOperatorBorder = false } = {}) {
    const etaDate = eta.eta ? new Date(eta.eta) : null;
    const hasEta = Boolean(eta.eta) && !Number.isNaN(etaDate?.getTime());
    const diffMins = hasEta ? Math.floor((etaDate - new Date()) / 60000) : null;
    const isArriving = hasEta && diffMins < 1;
    const isScheduled = eta.rmk_tc === '原定班次' || eta.rmk_tc === '未開出';
    const minClass = isArriving ? 'text-green' : isScheduled ? 'text-grey' : hasEta && diffMins < 5 ? 'text-light-green' : hasEta ? 'text-yellow' : 'text-grey';
    const tagClass = isArriving ? 'text-black bold' : !hasEta || isScheduled || diffMins >= 30 ? 'text-grey' : 'text-white bold';
    const remark = isScheduled ? '預定' : eta.rmk_tc === '最後班次' ? '尾班' : '';
    const borderClass = showOperatorBorder && eta._co === 'KMB'
        ? ' eta-border-kmb'
        : showOperatorBorder && eta._co === 'CTB'
            ? ' eta-border-ctb'
            : '';
    return `<div class="eta-item route-window-eta-item${isArriving ? ' arriving' : ''}${borderClass}">
        <div class="eta-large ${minClass}"><span class="time-text-b${isArriving ? ' bold' : ''}" data-timestamp="${escapeHtml(eta.eta)}" data-remark="${escapeHtml(eta.rmk_tc || '')}">${formatDuration(eta.eta, eta.rmk_tc)}</span></div>
        <div class="eta-small"><span class="eta-remark-tag ${tagClass}">${formatTimeHtmlMinMode(eta.eta)}</span> <span class="eta-remark-tag-small ${tagClass}">${remark}</span></div>
    </div>`;
};