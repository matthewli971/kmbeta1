// ===== App Version =====
const APP_VERSION = "v0.49";
const HONG_KONG_TIME_ZONE = 'Asia/Hong_Kong';
const COUNTDOWN_TARGET_DATE = '2026-09-16';

// ===== Runtime State =====
const STOP_CACHE = {};

// Apply page title from config
document.getElementById('app-title').textContent = APP_TITLE;
document.getElementById('app-version').textContent = APP_VERSION;
document.title = APP_TITLE;

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

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', {
        timeZone: HONG_KONG_TIME_ZONE,
        hour12: true
    }).toUpperCase();
    document.getElementById('clock').innerHTML = `${timeStr}`;
}

function updateDayCountdown() {
    const countdown = document.getElementById('day-countdown');
    if (!countdown) return;

    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: HONG_KONG_TIME_ZONE,
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
    const targetUtc = Date.parse(`${COUNTDOWN_TARGET_DATE}T00:00:00Z`);
    const daysUntil = Math.ceil((targetUtc - todayUtc) / (24 * 60 * 60 * 1000));

    if (daysUntil <= 0) {
        countdown.textContent = '';
        return;
    }

    countdown.innerHTML = `${daysUntil}`;
}

function getActivePriorityConfig() {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
        timeZone: HONG_KONG_TIME_ZONE,
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
    let routeClass = 'route-no';

    if (/^\d{3}[A-Za-z]?$/.test(routeValue) && routeValue.startsWith('9')) {
        routeClass += ' route-9xx';
    } else if (company === 'CTB') {
        routeClass += /^(A|NA)/i.test(routeValue) ? ' ctb-airport' : ' ctb';
    } else if (company === 'GMB') {
        routeClass += ' gmb';
    } else if (company === 'KMB' && /^([AES]|NA)/i.test(routeValue)) {
        routeClass += ' text-orange';
    }

    return routeClass;
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

    // Merge same routes from different stops/companies (KMB+CTB co-operated)
    const mergedGroups = {};
    flatResults.forEach(group => {
        const isBusOperator = group.company === 'KMB' || group.company === 'CTB';
        const coKey = isBusOperator ? 'BUS' : group.company;
        const defaultKey = `${coKey}-${group.route}-${group.dir}`;
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
                    && hasMatchingDestination;
            })
            : null;
        const key = matchingOperatorKey || defaultKey;
        if (!mergedGroups[key]) {
            mergedGroups[key] = {
                ...group,
                companies: new Set([group.company]),
                stopCodes: { [group.company]: { code: group.stopCode, label: group.stopLabel } },
                stopIds: { [group.company]: group.stopId },
                dests: { [group.company]: group.dest }
            };
        } else {
            mergedGroups[key].etas = mergedGroups[key].etas.concat(group.etas);
            mergedGroups[key].companies.add(group.company);
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
                    remarkTag = '[預定]';
                    minClass = 'text-grey';
                } else if (item.rmk_tc === '最後班次') {
                    remarkTag = '[尾班]';
                } else if (item.rmk_tc) {
                    const cleanedRmk = cleanRemark(item.rmk_tc);
                    if (index === 0) {
                        const isChi = /[\u4e00-\u9fa5]/.test(cleanedRmk);
                        const marqueeThreshold = isChi ? 12 : 24;
                        if (cleanedRmk.length > marqueeThreshold) {
                            destRemarkHtml = `<span class="dest-remark dest-remark-marquee"><span class="marquee-inner">[!]${cleanedRmk}</span></span>`;
                        } else {
                            destRemarkHtml = `<span class="dest-remark">[!]${cleanedRmk}</span>`;
                        }
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
            const effectiveDir = isFlipped ? (group.dir === 'O' ? 'I' : 'O') : group.dir;

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
                    const stopId = group.stopIds && group.stopIds[company];
                    const infoButtonHtml = stopId
                        ? `<button class="route-stop-info-button" type="button" data-company="${company}" data-stop-id="${escapeHtml(stopId)}" data-stop-name="${escapeHtml(stopName)}" data-stop-code="${escapeHtml(stopCode)}" title="查看本站到站時間" aria-label="查看${escapeHtml(stopName)}到站時間">i</button>`
                        : '';
                    return `${escapeHtml(stopCode)}${infoButtonHtml}`;
                });
                stopCodeHtml += `<span class="stop-code">${dirCircleHtml} ${stopCodeItems.join(' / ')}</span>`;
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
                    ? `<button class="route-stop-info-button" type="button" data-company="${infoCompany}" data-stop-id="${escapeHtml(infoStopId)}" data-stop-name="${escapeHtml(stopName)}" data-stop-code="${escapeHtml(group.stopCode)}" title="查看本站到站時間" aria-label="查看${escapeHtml(stopName)}到站時間">i</button>`
                    : '';
                stopCodeHtml += `<span class="stop-code">${dirCircleHtml} ${group.stopCode}${infoButtonHtml}</span>`;
            }

            // For co-operated routes, use company of earliest ETA for route color
            const displayCompany = (group.companies && group.companies.size > 1 && uniqueEtas[0] && uniqueEtas[0]._co)
                ? uniqueEtas[0]._co : group.company;

            const routeClass = getRouteNumberClass(group.route, displayCompany);
            let routeTextClass = 'route-text';
            if (group.route.length >= 4) {
                routeTextClass += ' long-route-text';
            }

            let destClass = 'dest';
            let destTextClass = 'dest-text';

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
                    <span class="${destTextClass}">${group.dest} ${groupStopCodeHtml}</span> 
                    <div class="dest-sub-info">
                        <span class="stop-info">${stopCodeHtml}</span>
                        ${destRemarkHtml}
                    </div>
                `;
            }

            const routeEtaSupported = displayCompany === 'KMB' || displayCompany === 'CTB';
            const routeLinkState = routeEtaSupported ? '' : ' disabled';
            const routeLinkTitle = routeEtaSupported ? ' title="查看路線到站時間"' : '';
            const routeLinkHtml = `<button class="route-link ${routeTextClass}" type="button"${routeLinkState}${routeLinkTitle} data-route="${escapeHtml(group.route)}" data-company="${displayCompany}" data-companies="${group.companies ? [...group.companies].join(',') : group.company}" data-direction="${group.dir}" data-service-type="${uniqueEtas[0]?.service_type || 1}" aria-label="查看${escapeHtml(group.route)}路線到站時間">${formatRouteNumber(group.route)}</button>`;

            row.innerHTML = `
                <td class="${routeClass}">${routeLinkHtml}</td>
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
