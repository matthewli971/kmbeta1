// ===== Index station modification =====
// This module is loaded only by index.html. It keeps the bundled location
// configuration intact while persisting an optional replacement in localStorage.
(function initializeStopModify() {
    const context = window.KMBETA_CUSTOMIZATION_CONTEXT;
    if (!context?.enabled) return;

    const storageKey = context.storageKey || APP_CONFIG.customStationConfigKey || 'kmbeta-index-station-config-v2';
    const configurationVersion = 1;
    const api = window.API_ENDPOINTS;
    const searchResultStore = new Map();
    const routeStopSearchCache = new Map();
    const searchTimers = new Map();
    let draftConfig = null;
    let pendingImportConfig = null;
    const REQUIRED_FIELDS_ERROR = '請填寫標示紅色的必填資料。';
    const APP_TITLE_MAX_CHARACTERS = 20;
    const APP_TITLE_MAX_WIDTH = 140;
    const FULL_WIDTH_CHARACTER_WIDTH = 10;
    const HALF_WIDTH_CHARACTER_WIDTH = 7;
    let invalidFields = [];
    let invalidFieldIndex = -1;

    function cloneJson(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function escapeMarkup(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function isFullWidthCharacter(character) {
        return /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u.test(character)
            || character.codePointAt(0) > 0xFFFF;
    }

    function getAppTitleWidth(title) {
        return [...String(title ?? '')].reduce((width, character) =>
            width + (isFullWidthCharacter(character) ? FULL_WIDTH_CHARACTER_WIDTH : HALF_WIDTH_CHARACTER_WIDTH), 0);
    }

    function truncateAppTitle(title) {
        const characters = [...String(title ?? '')].slice(0, APP_TITLE_MAX_CHARACTERS);
        let width = 0;
        let result = '';
        for (const character of characters) {
            const characterWidth = isFullWidthCharacter(character) ? FULL_WIDTH_CHARACTER_WIDTH : HALF_WIDTH_CHARACTER_WIDTH;
            if (width + characterWidth > APP_TITLE_MAX_WIDTH) break;
            width += characterWidth;
            result += character;
        }
        return result;
    }

    function normalizePinnedRoutes(value) {
        const routes = Array.isArray(value) ? value : String(value ?? '').split(/[,，]/);
        const normalizedRoutes = [...new Set(routes
            .map(route => String(route || '').trim().toUpperCase())
            .filter(Boolean))];
        return normalizedRoutes.length ? normalizedRoutes : null;
    }

    function makeDraftId(prefix) {
        const randomPart = window.crypto?.randomUUID?.()
            || Math.random().toString(36).slice(2, 10);
        return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
    }

    function makeGroupId() {
        return `custom-stop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function captureCurrentConfiguration() {
        const configuredTitle = typeof APP_TITLE === 'string' ? APP_TITLE : '';
        return {
            APP_TITLE: String(window.KMBETA_RUNTIME_APP_TITLE ?? configuredTitle),
            STOPS: cloneJson(typeof STOPS === 'undefined' ? [] : STOPS),
            INBOUND_FLIP: cloneJson(typeof INBOUND_FLIP === 'undefined' ? [] : INBOUND_FLIP),
            PRIORITY_CONFIG: cloneJson(typeof PRIORITY_CONFIG === 'undefined' ? [] : PRIORITY_CONFIG),
            GMB_META: cloneJson(typeof GMB_META === 'undefined' ? {} : GMB_META),
            DEST_REPLACEMENTS: cloneJson(typeof DEST_REPLACEMENTS === 'undefined' ? {} : DEST_REPLACEMENTS),
            GRID_LAYOUT: cloneJson(typeof GRID_LAYOUT === 'undefined' ? [] : GRID_LAYOUT)
        };
    }

    function normalizeConfiguration(candidate) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
            throw new Error('設定檔格式不正確。');
        }

        const appTitle = truncateAppTitle(String(candidate.APP_TITLE ?? '').trim());
        if (!appTitle) throw new Error('請填寫顯示標題。');
        if (!Array.isArray(candidate.STOPS)) throw new Error('設定檔缺少 STOPS 車站資料。');

        const groupIds = new Set();
        const stops = candidate.STOPS.map((group, groupIndex) => {
            if (!group || typeof group !== 'object' || Array.isArray(group)) {
                throw new Error(`第 ${groupIndex + 1} 個車站群組格式不正確。`);
            }
            const id = String(group.id ?? '').trim();
            const name = String(group.name ?? '').trim();
            if (!id) throw new Error(`第 ${groupIndex + 1} 個車站群組缺少 id。`);
            if (groupIds.has(id)) throw new Error(`車站群組 id 重複：${id}`);
            if (!name) throw new Error(`請填寫第 ${groupIndex + 1} 個車站群組的自訂名稱。`);
            if (!Array.isArray(group.stops) || group.stops.length === 0) {
                throw new Error(`第 ${groupIndex + 1} 個車站群組至少要有一個巴士站。`);
            }
            groupIds.add(id);

            const normalizedStops = group.stops.map((stop, stopIndex) => {
                if (!stop || typeof stop !== 'object' || Array.isArray(stop)) {
                    throw new Error(`第 ${groupIndex + 1} 個群組的第 ${stopIndex + 1} 個巴士站格式不正確。`);
                }
                const stopId = String(stop.id ?? '').trim();
                const type = String(stop.type ?? '').trim().toUpperCase();
                if (!stopId || !type) {
                    throw new Error(`請選擇第 ${groupIndex + 1} 個群組的第 ${stopIndex + 1} 個巴士站。`);
                }
                const normalizedStop = { ...cloneJson(stop), id: stopId, type };
                if (normalizedStop.code !== null && normalizedStop.code !== undefined) {
                    normalizedStop.code = String(normalizedStop.code);
                }
                normalizedStop.label = normalizedStop.label ? String(normalizedStop.label).trim() : null;
                return normalizedStop;
            });

            return {
                ...cloneJson(group),
                id,
                name,
                stops: normalizedStops,
                filter: Array.isArray(group.filter) ? cloneJson(group.filter) : null,
                exclude: Array.isArray(group.exclude) ? cloneJson(group.exclude) : null,
                pin: normalizePinnedRoutes(group.pin)
            };
        });

        return {
            APP_TITLE: appTitle,
            STOPS: stops,
            INBOUND_FLIP: Array.isArray(candidate.INBOUND_FLIP) ? cloneJson(candidate.INBOUND_FLIP) : [],
            PRIORITY_CONFIG: Array.isArray(candidate.PRIORITY_CONFIG) ? cloneJson(candidate.PRIORITY_CONFIG) : [],
            GMB_META: candidate.GMB_META && typeof candidate.GMB_META === 'object' && !Array.isArray(candidate.GMB_META)
                ? cloneJson(candidate.GMB_META) : {},
            DEST_REPLACEMENTS: candidate.DEST_REPLACEMENTS && typeof candidate.DEST_REPLACEMENTS === 'object' && !Array.isArray(candidate.DEST_REPLACEMENTS)
                ? cloneJson(candidate.DEST_REPLACEMENTS) : {},
            GRID_LAYOUT: Array.isArray(candidate.GRID_LAYOUT) ? cloneJson(candidate.GRID_LAYOUT) : []
        };
    }

    function replaceArray(target, values) {
        target.splice(0, target.length, ...cloneJson(values));
    }

    function replaceObject(target, values) {
        Object.keys(target).forEach(key => delete target[key]);
        Object.assign(target, cloneJson(values));
    }

    function updatePageTitle(title) {
        const appTitle = document.getElementById('app-title');
        if (appTitle) appTitle.textContent = title;
        document.title = title;
    }

    function saveConfiguration(configuration) {
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                version: configurationVersion,
                configuration
            }));
        } catch (error) {
            throw new Error('無法儲存設定到這個裝置。請檢查瀏覽器儲存空間後再試。');
        }
    }

    function applyRuntimeConfiguration(candidate, { persist = true, refresh = true } = {}) {
        const configuration = normalizeConfiguration(candidate);
        if (persist) saveConfiguration(configuration);

        replaceArray(STOPS, configuration.STOPS);
        replaceArray(INBOUND_FLIP, configuration.INBOUND_FLIP);
        replaceArray(PRIORITY_CONFIG, configuration.PRIORITY_CONFIG);
        replaceObject(GMB_META, configuration.GMB_META);
        replaceObject(DEST_REPLACEMENTS, configuration.DEST_REPLACEMENTS);
        replaceArray(GRID_LAYOUT, configuration.GRID_LAYOUT);
        window.KMBETA_RUNTIME_APP_TITLE = configuration.APP_TITLE;
        updatePageTitle(configuration.APP_TITLE);

        if (refresh && typeof render === 'function') render();
        return configuration;
    }

    function restoreSavedConfiguration() {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (saved?.configuration) {
                applyRuntimeConfiguration(saved.configuration, { persist: false, refresh: false });
                return;
            }
        } catch (error) {
            console.warn('Unable to restore custom station configuration:', error);
        }

        // index.html is intentionally a blank canvas. The bundled STP data is
        // still used by stp.html, but must not appear on the customizable page.
        replaceArray(STOPS, []);
        replaceArray(INBOUND_FLIP, []);
        replaceArray(PRIORITY_CONFIG, []);
        replaceObject(GMB_META, {});
        replaceObject(DEST_REPLACEMENTS, {});
        replaceArray(GRID_LAYOUT, []);
        const defaultTitle = typeof APP_TITLE === 'string' && APP_TITLE.trim()
            ? APP_TITLE.trim()
            : '巴士路線到站時間監察平台';
        window.KMBETA_RUNTIME_APP_TITLE = defaultTitle;
        updatePageTitle(defaultTitle);
    }

    function prepareDraftConfiguration(configuration) {
        const draft = cloneJson(configuration);
        draft.STOPS = draft.STOPS.map(group => ({
            ...group,
            _draftId: makeDraftId('group'),
            _query: '',
            stops: group.stops.map(stop => ({
                ...stop,
                _draftId: makeDraftId('stop'),
                _displayName: ''
            }))
        }));
        return draft;
    }

    function makeEmptyGroup() {
        return {
            id: makeGroupId(),
            name: '',
            stops: [],
            filter: null,
            exclude: null,
            pin: null,
            _draftId: makeDraftId('group'),
            _query: ''
        };
    }

    function findDraftGroup(groupId) {
        return draftConfig?.STOPS.find(group => group._draftId === groupId) || null;
    }

    function findDraftStop(groupId, stopId) {
        return findDraftGroup(groupId)?.stops.find(stop => stop._draftId === stopId) || null;
    }

    function displayStopName(stop) {
        return stop._displayName || stop.code || stop.id || '尚未選擇巴士站';
    }

    function getSearchResultElement(groupId) {
        return document.querySelector(`.station-stop-search-results[data-group-id="${CSS.escape(groupId)}"]`);
    }

    function getSearchInputElement(groupId) {
        return document.querySelector(`input[data-field="stop-search"][data-group-id="${CSS.escape(groupId)}"]`);
    }

    function positionSearchResults(target) {
        if (!target?.isConnected) return;
        if (!target.innerHTML.trim()) {
            target.style.display = 'none';
            return;
        }
        const input = getSearchInputElement(target.dataset.groupId);
        if (!input) {
            target.style.display = 'none';
            return;
        }
        target.style.display = 'block';

        const inputRect = input.getBoundingClientRect();
        const viewportPadding = 8;
        const width = Math.min(inputRect.width, window.innerWidth - (viewportPadding * 2));
        const left = Math.min(
            Math.max(viewportPadding, inputRect.left),
            window.innerWidth - width - viewportPadding
        );
        const gap = 4;
        const spaceBelow = window.innerHeight - inputRect.bottom - viewportPadding - gap;
        const spaceAbove = inputRect.top - viewportPadding - gap;
        const opensAbove = spaceBelow < 140 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(80, Math.min(240, opensAbove ? spaceAbove : spaceBelow));

        target.style.left = `${left}px`;
        target.style.width = `${width}px`;
        target.style.maxHeight = `${maxHeight}px`;
        target.style.top = opensAbove
            ? `${Math.max(viewportPadding, inputRect.top - maxHeight - gap)}px`
            : `${inputRect.bottom + gap}px`;
    }

    function renderSelectedStop(group, stop, stopIndex) {
        return `<div class="station-selected-stop" data-group-id="${escapeMarkup(group._draftId)}" data-stop-id="${escapeMarkup(stop._draftId)}">
            <div class="station-selected-stop-name">
                ${renderSearchCompanyBadges(stop.type)}
                ${renderStopNameWithCode({ name: displayStopName(stop), code: stop.code, type: stop.type }, {
                    stopLabel: stop.label,
                    labelBeforeCode: true,
                    labelControl: { groupId: group._draftId, stopId: stop._draftId }
                })}
            </div>
            <div class="station-selected-stop-actions">
                <div class="station-config-tag-control">
                    <button class="station-config-tag-button" type="button" title="修改車站標籤" data-action="edit-stop-label" data-group-id="${escapeMarkup(group._draftId)}" data-stop-id="${escapeMarkup(stop._draftId)}">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.59 13.41 11 3.83V3H4a1 1 0 0 0-1 1v7l9.59 9.59a2 2 0 0 0 2.82 0l5.18-5.18a2 2 0 0 0 0-2.82ZM7.5 7.5h.01" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor"/></svg>
                    </button>
                </div>
                <button class="station-config-close station-config-remove-group station-config-remove-group-button" type="button" title="移除巴士站" data-action="remove-stop" data-group-id="${escapeMarkup(group._draftId)}" data-stop-id="${escapeMarkup(stop._draftId)}">×</button>
            </div>
        </div>`;
    }

    function renderSelectedStopList(group) {
        const searchResults = getSearchResultElement(group._draftId);
        const list = searchResults?.closest('.station-config-group')?.querySelector('.station-config-selected-stop-list');
        if (!list) return;
        list.innerHTML = group.stops.length
            ? group.stops.map((stop, stopIndex) => renderSelectedStop(group, stop, stopIndex)).join('')
            : '<div class="station-selected-stop station-selected-stop-empty">尚未選擇巴士站</div>';
    }

    function renderDraftGroups() {
        const groupsContainer = document.querySelector('.station-config-groups');
        if (!groupsContainer || !draftConfig) return;

        groupsContainer.innerHTML = draftConfig.STOPS.map((group, groupIndex) => `
            <article class="station-config-group" data-group-id="${escapeMarkup(group._draftId)}">
                <header class="station-config-group-header">
                    <label class="station-config-group-title-field">
                        <input type="text" maxlength="80" placeholder="顯示車站名稱" value="${escapeMarkup(group.name || '')}" data-field="group-name" data-group-id="${escapeMarkup(group._draftId)}" aria-label="第 ${groupIndex + 1} 個車站群組的顯示名稱">
                    </label>
                    <button class="station-config-close station-config-remove-group station-config-remove-group-button" type="button" title="移除群組" aria-label="移除群組" data-action="remove-group" data-group-id="${escapeMarkup(group._draftId)}">×</button>
                </header>
                <div class="station-search-control">
                    <label class="station-config-field station-config-search-field">
                        <input type="search" autocomplete="off" placeholder="增加車站: 輸入站名、車站編號或路線編號" value="${escapeMarkup(group._query || '')}" data-field="stop-search" data-group-id="${escapeMarkup(group._draftId)}" aria-label="搜尋第 ${groupIndex + 1} 個群組的巴士站">
                    </label>
                    <div class="station-stop-search-results" data-group-id="${escapeMarkup(group._draftId)}" aria-live="polite"></div>
                </div>
                <div class="station-config-selected-stop-list">
                    ${group.stops.length
                        ? group.stops.map((stop, stopIndex) => renderSelectedStop(group, stop, stopIndex)).join('')
                        : '<div class="station-selected-stop station-selected-stop-empty">尚未選擇巴士站</div>'}
                </div>
                <label class="station-config-field station-config-pin-field">
                    <span>置頂線路</span>
                    <input type="text" placeholder="(選填) 註明方向請在後加'|[I/O]' e.g. A22|O" value="${escapeMarkup((group.pin || []).join(', '))}" data-field="pinned-routes" data-group-id="${escapeMarkup(group._draftId)}" aria-label="第 ${groupIndex + 1} 個車站群組的置頂線路">
                </label>
            </article>`).join('');
    }

    function setFormStatus(message = '', tone = '') {
        const status = document.querySelector('.station-config-status');
        if (!status) return;
        status.textContent = message;
        status.className = `station-config-status${tone ? ` is-${tone}` : ''}`;
    }

    function getActiveInvalidFields() {
        return invalidFields.filter(field => field?.isConnected && field.classList.contains('is-invalid'));
    }

    function renderValidationStatus() {
        const status = document.querySelector('.station-config-status');
        if (!status) return;

        const currentField = invalidFields[invalidFieldIndex];
        const activeFields = getActiveInvalidFields();
        invalidFields = activeFields;
        if (!activeFields.length) {
            invalidFieldIndex = -1;
            setFormStatus();
            return;
        }

        const currentIndex = activeFields.indexOf(currentField);
        invalidFieldIndex = currentIndex >= 0
            ? currentIndex
            : Math.min(Math.max(invalidFieldIndex, 0), activeFields.length - 1);
        const total = activeFields.length;
        status.className = 'station-config-status is-error';
        status.innerHTML = `<span class="station-config-status-message">${escapeMarkup(REQUIRED_FIELDS_ERROR)}</span>
            <span class="station-config-error-navigation">
                <button class="station-config-error-nav-button" type="button" data-action="previous-error" title="上一個錯誤" ${total < 2 ? ' disabled' : ''}>▴</button>
                <span class="station-config-error-count" aria-live="polite">${invalidFieldIndex + 1} / ${total}</span>
                <button class="station-config-error-nav-button" type="button" data-action="next-error" title="下一個錯誤" ${total < 2 ? ' disabled' : ''}>▾</button>
            </span>`;
    }

    function focusInvalidField(index) {
        const activeFields = getActiveInvalidFields();
        if (!activeFields.length) {
            renderValidationStatus();
            return;
        }
        invalidFields = activeFields;
        invalidFieldIndex = ((index % activeFields.length) + activeFields.length) % activeFields.length;
        renderValidationStatus();
        const field = invalidFields[invalidFieldIndex];
        field.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        field.focus?.({ preventScroll: true });
    }

    function clearInvalidField(element, updateStatus = true) {
        if (!element) return;
        element.classList.remove('is-invalid');
        element.removeAttribute('aria-invalid');
        if (element.dataset.validationTabindex) {
            element.removeAttribute('tabindex');
            delete element.dataset.validationTabindex;
        }
        if (updateStatus) renderValidationStatus();
    }

    function markInvalidField(element, invalidFields) {
        if (!element) return;
        element.classList.add('is-invalid');
        element.setAttribute('aria-invalid', 'true');
        if (element.matches?.('.station-selected-stop-empty') && !element.hasAttribute('tabindex')) {
            element.setAttribute('tabindex', '-1');
            element.dataset.validationTabindex = 'true';
        }
        if (!invalidFields.includes(element)) invalidFields.push(element);
    }

    function validateRequiredFields() {
        document.querySelectorAll('.station-config-overlay .is-invalid')
            .forEach(element => clearInvalidField(element, false));
        invalidFields = [];
        invalidFieldIndex = -1;
        if (!draftConfig) return false;

        const titleInput = document.querySelector('.station-config-overlay [data-field="app-title"]');
        if (!String(draftConfig.APP_TITLE || '').trim()) {
            markInvalidField(titleInput, invalidFields);
        }

        draftConfig.STOPS.forEach(group => {
            const groupElement = document.querySelector(`.station-config-group[data-group-id="${CSS.escape(group._draftId)}"]`);
            const groupNameInput = groupElement?.querySelector('[data-field="group-name"]');
            if (!String(group.name || '').trim()) {
                markInvalidField(groupNameInput, invalidFields);
            }
            if (!group.stops.length) {
                markInvalidField(groupElement?.querySelector('.station-selected-stop-empty'), invalidFields);
            }
        });

        if (!invalidFields.length) return true;

        invalidFieldIndex = 0;
        focusInvalidField(invalidFieldIndex);
        throw new Error(REQUIRED_FIELDS_ERROR);
    }

    function renderConfigurationWindow() {
        const oldOverlay = document.querySelector('.station-config-overlay');
        oldOverlay?.remove();
        draftConfig = prepareDraftConfiguration(captureCurrentConfiguration());
        pendingImportConfig = null;

        const overlay = document.createElement('div');
        overlay.className = 'popup-window-overlay station-config-overlay';
        overlay.innerHTML = `
            <section class="popup-window station-config-window" role="dialog" aria-modal="true" aria-label="修改車站">
                <header class="station-config-header">
                    <div class="station-config-header-title">
                        <input id="station-config-title" class="station-config-title-input" type="text" maxlength="20" value="${escapeMarkup(draftConfig.APP_TITLE)}" data-field="app-title" placeholder="頁面標題" aria-label="頁面標題">
                    </div>
                    <div class="station-config-header-actions">
                        <button class="station-config-secondary-button" type="button" data-action="import">匯入</button>
                        <button class="station-config-secondary-button" type="button" data-action="export">匯出</button>
                        <button class="station-config-clear" type="button" data-action="clear">清空</button>
                        <button class="station-config-close" type="button" title="關閉" aria-label="關閉修改車站視窗" data-action="close">×</button>
                    </div>
                    <input class="station-config-file-input" type="file" accept=".js,.json,application/javascript,application/json,text/javascript" aria-label="選擇要匯入的設定檔">
                </header>
                <div class="station-config-body">
                    <div class="station-config-groups"></div>
                    <button class="station-config-add-group" type="button" data-action="add-group">＋ 新增車站群組</button>
                </div>
                <footer class="station-config-footer">
                    <div class="station-config-status" role="status" aria-live="polite"></div>
                    <div class="station-config-footer-actions">
                        <button class="station-config-save" type="button" data-action="save">儲存</button>
                        <button class="station-config-cancel" type="button" data-action="cancel">取消</button>
                    </div>
                </footer>
                <section class="station-import-confirm hidden" role="alertdialog" aria-modal="true" aria-labelledby="station-import-confirm-title">
                    <div class="station-import-confirm-card">
                        <h3 id="station-import-confirm-title">取代目前資料？</h3>
                        <p>匯入設定會取代目前顯示的所有車站群組及相關設定。建議先匯出現有資料。</p>
                        <div class="station-import-confirm-actions">
                            <button class="station-config-secondary-button" type="button" data-action="confirm-export">Export</button>
                            <button class="station-config-secondary-button" type="button" data-action="confirm-no">No</button>
                            <button class="station-config-save" type="button" data-action="confirm-yes">Yes</button>
                        </div>
                    </div>
                </section>
            </section>`;

        document.body.appendChild(overlay);
        document.body.classList.add('station-config-open');
        renderDraftGroups();
        hydrateDraftStopNames(draftConfig);
        bindConfigurationWindow(overlay);
        requestAnimationFrame(() => {
            overlay.classList.add('is-open');
            overlay.querySelector('[data-field="app-title"]')?.focus();
        });
    }

    function closeConfigurationWindow() {
        const overlay = document.querySelector('.station-config-overlay');
        if (!overlay) return;
        overlay.remove();
        document.body.classList.remove('station-config-open');
        pendingImportConfig = null;
        searchTimers.forEach(timer => clearTimeout(timer));
        searchTimers.clear();
    }

    function hasUnsavedDraftChanges() {
        if (!draftConfig) return false;
        try {
            return JSON.stringify(stripDraftProperties(draftConfig))
                !== JSON.stringify(captureCurrentConfiguration());
        } catch (error) {
            console.warn('Unable to compare station configuration changes:', error);
            return true;
        }
    }

    function requestCloseConfigurationWindow() {
        if (!hasUnsavedDraftChanges()
            || window.confirm('目前表單有未儲存的資料，確定要關閉「修改車站」視窗嗎？')) {
            closeConfigurationWindow();
        }
    }

    function clearDraftStations() {
        if (draftConfig?.STOPS.length
            && !window.confirm('確定要清空目前視窗內的所有車站群組及巴士站嗎？頁面標題會保留。')) {
            return;
        }
        if (!draftConfig) return;
        draftConfig.STOPS = [];
        renderDraftGroups();
        setFormStatus('已清空車站資料；請按「儲存」套用。', 'success');
    }

    function closeImportConfirmation() {
        document.querySelector('.station-import-confirm')?.classList.add('hidden');
        pendingImportConfig = null;
    }

    function showImportConfirmation(configuration, fileName) {
        pendingImportConfig = configuration;
        const dialog = document.querySelector('.station-import-confirm');
        if (!dialog) return;
        const message = dialog.querySelector('p');
        message.textContent = `「${fileName}」會取代 index.html 目前顯示的所有車站群組及相關設定。建議先匯出現有資料。`;
        dialog.classList.remove('hidden');
        dialog.querySelector('[data-action="confirm-no"]')?.focus();
    }

    function addSearchResult(result) {
        const key = makeDraftId('result');
        searchResultStore.set(key, result);
        return key;
    }

    function renderSearchCompanyBadges(companies) {
        const operators = [...new Set(String(companies || '')
            .split(',')
            .map(company => company.trim().toUpperCase())
            .filter(company => company === 'KMB' || company === 'CTB'))];
        return operators.map(company =>
            `<span class="route-company-badge route-company-badge-${company.toLowerCase()}" title="${company}" aria-label="${company}"></span>`
        ).join('');
    }

    function formatStopCodeForSearch(type, code) {
        const stopCode = String(code || '').trim();
        if (!stopCode) return '';
        if (typeof formatStopCodeForDisplay === 'function') return formatStopCodeForDisplay(type, stopCode);
        return type === 'CTB' ? stopCode.replace(/^0+(?=\d)/, '') : stopCode;
    }

    function renderStopNameWithCode(result, { stopLabel = '', labelBeforeCode = false, labelControl = null } = {}) {
        const name = String(result.name || result.id || '').trim();
        const code = formatStopCodeForSearch(result.type, result.code);
        const codeAlreadyVisible = code && (
            window.busStopSearch.normalizeText(name) === window.busStopSearch.normalizeText(code)
            || window.busStopSearch.normalizeCode(name) === window.busStopSearch.normalizeCode(code)
            || new RegExp(`\\(${escapeRegExp(code)}\\)$`, 'i').test(name)
        );
        const labelHtml = stopLabel && labelControl
            ? `<span class="station-stop-label-control"><button class="station-stop-custom-label station-stop-custom-label-button" type="button" data-action="toggle-stop-label-remove" data-group-id="${escapeMarkup(labelControl.groupId)}" data-stop-id="${escapeMarkup(labelControl.stopId)}" aria-expanded="false">${escapeMarkup(stopLabel)}</button></span>`
            : stopLabel
                ? `<span class="station-stop-custom-label">${escapeMarkup(stopLabel)}</span>`
            : '';
        const codeHtml = code && !codeAlreadyVisible
            ? `<span class="stop-eta-code">${escapeMarkup(code)}</span>`
            : '';
        const suffixHtml = labelBeforeCode ? `${labelHtml}${codeHtml}` : `${codeHtml}${labelHtml}`;
        return `<span class="station-stop-name-with-code"><span class="station-stop-name-text">${escapeMarkup(name)}</span>${suffixHtml}</span>`;
    }

    function renderSearchMessage(target, message, tone = '') {
        if (!target) return;
        target.innerHTML = `<div class="station-search-message${tone ? ` is-${tone}` : ''}">${escapeMarkup(message)}</div>`;
        positionSearchResults(target);
    }

    function closeSearchResults(groupId) {
        const target = getSearchResultElement(groupId);
        if (!target) return;
        const group = findDraftGroup(groupId);
        if (group) group._searchRequestId = '';
        target.innerHTML = '';
        positionSearchResults(target);
    }

    function renderSearchResults(target, results) {
        if (!target) return;
        const groupId = target.dataset.groupId || '';
        const scopeAttributes = `data-group-id="${escapeMarkup(groupId)}"`;
        if (!results.length) {
            renderSearchMessage(target, '找不到相符的巴士站或路線。Citybus 可先輸入路線編號，再由路線選擇巴士站。');
            return;
        }

        const stopResults = results.filter(result => result.kind === 'stop');
        const routeResults = results.filter(result => result.kind === 'route');
        const sections = [];
        if (stopResults.length) {
            sections.push(`<div class="station-search-result-title">巴士站</div>${stopResults.map(result => {
                const key = addSearchResult(result);
                const isSelected = findDraftGroup(groupId)?.stops.some(stop => stop.id === result.id && stop.type === result.type);
                const toggleLabel = isSelected ? '取消選擇巴士站' : '選擇巴士站';
                return `<div class="station-search-result${isSelected ? ' is-selected' : ''}"><button class="station-search-result-add-icon" type="button" data-action="toggle-search-result" ${scopeAttributes} data-result-key="${escapeMarkup(key)}" aria-pressed="${isSelected ? 'true' : 'false'}" title="${toggleLabel}" aria-label="${toggleLabel}">${isSelected ? '−' : '+'}</button><button class="station-search-result-copy-button" type="button" data-action="select-search-result" ${scopeAttributes} data-result-key="${escapeMarkup(key)}" aria-label="選擇巴士站">${renderSearchCompanyBadges(result.type)}<span class="station-search-result-copy">${renderStopNameWithCode(result)}</span></button></div>`;
            }).join('')}`);
        }
        if (routeResults.length) {
            sections.push(`<div class="station-search-result-title">由路線選擇巴士站</div>${routeResults.map(result => {
                const key = addSearchResult(result);
                const journey = result.origin && result.destination ? `${result.origin} → ${result.destination}` : '';
                return `<button class="station-search-result" type="button" data-action="select-search-result" ${scopeAttributes} data-result-key="${escapeMarkup(key)}">${renderSearchCompanyBadges(result.companies || result.company)}<span class="station-search-result-copy"><strong>${escapeMarkup(result.route)}</strong><small>${escapeMarkup(journey)}</small></span></button>`;
            }).join('')}`);
        }
        target.innerHTML = sections.join('');
        positionSearchResults(target);
    }

    function isEnglishOrNumberQuery(value) {
        const query = String(value ?? '').trim();
        return Boolean(query) && /^[A-Za-z0-9\s-]+$/.test(query);
    }

    function extractKmbStopCode(name) {
        return window.busStopSearch.getKmbStopCode(name);
    }

    function getKmbStopDisplayName(stop) {
        return window.busStopSearch.getKmbStopName(stop);
    }

    function getCtbStopDisplayName(stop) {
        return window.busStopSearch.getCtbStopName(stop);
    }

    async function fetchData(url) {
        const separator = url.includes('?') ? '&' : '?';
        const response = await fetch(`${url}${separator}t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`資料請求失敗（${response.status}）`);
        const payload = await response.json();
        return payload.data;
    }

    async function loadStopDisplayName(stop) {
        if (!stop?.id) return '';
        if (stop.type === 'KMB') {
            const catalog = await window.loadKmbStopCatalog();
            const detail = catalog.find(item => String(item.stop) === String(stop.id));
            return getKmbStopDisplayName(detail);
        }
        if (stop.type === 'CTB') {
            const detail = await fetchData(`${api.ctb.stop}/${encodeURIComponent(stop.id)}`);
            return getCtbStopDisplayName(detail);
        }
        return '';
    }

    function updateHydratedStopName(targetDraft, group, stop) {
        if (draftConfig !== targetDraft) return;
        const selector = `.station-selected-stop[data-group-id="${CSS.escape(group._draftId)}"][data-stop-id="${CSS.escape(stop._draftId)}"]`;
        const summaryName = document.querySelector(selector)?.querySelector('.station-selected-stop-name');
        if (summaryName) {
            summaryName.innerHTML = `${renderSearchCompanyBadges(stop.type)}${renderStopNameWithCode({ name: displayStopName(stop), code: stop.code, type: stop.type }, {
                stopLabel: stop.label,
                labelBeforeCode: true,
                labelControl: { groupId: group._draftId, stopId: stop._draftId }
            })}`;
        }
    }

    async function hydrateDraftStopNames(targetDraft) {
        const entries = targetDraft.STOPS.flatMap(group => group.stops.map(stop => ({ group, stop })));
        await Promise.all(entries.map(async ({ group, stop }) => {
            const selectedId = stop.id;
            const selectedType = stop.type;
            try {
                const name = await loadStopDisplayName(stop);
                if (!name || draftConfig !== targetDraft || stop.id !== selectedId || stop.type !== selectedType) return;
                stop._displayName = name;
                updateHydratedStopName(targetDraft, group, stop);
            } catch (error) {
                // Name hydration is intentionally silent; the configured code remains available as a fallback.
                console.warn(`Unable to refresh ${selectedType} stop name ${selectedId}:`, error);
            }
        }));
    }

    function asStopChoice(type, id, code, name, extra = {}) {
        return {
            kind: 'stop',
            type,
            id: String(id),
            code: String(code || id),
            name: String(name || code || id),
            ...extra
        };
    }

    async function searchKmbStops(query) {
        const queryText = window.busStopSearch.normalizeText(query);
        if (!queryText) return [];
        const catalog = await window.loadKmbStopCatalog();
        return catalog
            .map(stop => {
                const code = extractKmbStopCode(stop.name_tc) || extractKmbStopCode(stop.name_en) || stop.stop;
                const name = getKmbStopDisplayName(stop) || String(stop.stop);
                const codeRank = window.busStopSearch.getCodeMatchRank(code, query);
                const codeMatches = codeRank < 3;
                const nameMatches = window.busStopSearch.normalizeText(`${name} ${stop.name_tc} ${stop.name_en}`).includes(queryText);
                if (!codeMatches && !nameMatches) return null;
                return { stop, code, name, codeRank };
            })
            .filter(Boolean)
            .sort((a, b) => window.compareBusStopSearchResults(a, b, query))
            .map(match => asStopChoice('KMB', match.stop.stop, match.code, match.name));
    }

    async function searchCtbStopCode(query) {
        const enteredStopId = String(query || '').trim().replace(/\s+/g, '');
        if (!/^\d{4,8}$/.test(enteredStopId)) return [];
        const stopId = enteredStopId.length < 6 ? enteredStopId.padStart(6, '0') : enteredStopId;
        try {
            const stop = await fetchData(`${api.ctb.stop}/${encodeURIComponent(stopId)}`);
            if (!stop || typeof stop !== 'object' || Array.isArray(stop) || !stop.stop) return [];
            const canonicalStopId = String(stop.stop);
            const name = getCtbStopDisplayName(stop);
            if (!name) return [];
            return [asStopChoice('CTB', canonicalStopId, canonicalStopId, name)];
        } catch {
            return [];
        }
    }

    async function searchRoutes(query) {
        if (typeof loadRouteSearchRoutes !== 'function') return [];
        const queryText = window.busStopSearch.normalizeText(query);
        if (!queryText) return [];
        const routes = await loadRouteSearchRoutes();
        return (routes || [])
            .filter(route => {
                const routeNo = window.busStopSearch.normalizeText(route.route);
                const journey = window.busStopSearch.normalizeText(`${route.origin} ${route.destination}`);
                return routeNo.startsWith(queryText) || journey.includes(queryText);
            })
            .slice(0, 6)
            .map(route => ({ ...route, kind: 'route' }));
    }

    async function findSearchChoices(query) {
        const [kmbResult, ctbResult, routeResult] = await Promise.allSettled([
            searchKmbStops(query),
            searchCtbStopCode(query),
            searchRoutes(query)
        ]);
        const results = [];
        if (kmbResult.status === 'fulfilled') results.push(...kmbResult.value);
        if (ctbResult.status === 'fulfilled') results.push(...ctbResult.value);
        if (routeResult.status === 'fulfilled') results.push(...routeResult.value);
        const stationResults = results
            .filter(result => result.kind === 'stop')
            .sort((a, b) => window.compareBusStopSearchResults(a, b, query));
        const routeResults = results.filter(result => result.kind === 'route');
        return [...stationResults, ...routeResults];
    }

    function scheduleStopSearch(input) {
        const groupId = input.dataset.groupId;
        const group = findDraftGroup(groupId);
        if (!group) return;
        group._query = input.value;
        const target = getSearchResultElement(groupId);
        const query = input.value.trim();
        const timerKey = groupId;
        clearTimeout(searchTimers.get(timerKey));

        if (query.length < 2) {
            renderSearchMessage(target, '請輸入至少兩個字、兩個數字或路線編號。');
            return;
        }

        const requestId = makeDraftId('search');
        group._searchRequestId = requestId;
        renderSearchMessage(target, '搜尋中…');
        searchTimers.set(timerKey, window.setTimeout(async () => {
            try {
                const results = await findSearchChoices(query);
                const currentGroup = findDraftGroup(groupId);
                if (!currentGroup || currentGroup._searchRequestId !== requestId || currentGroup._query !== query) return;
                renderSearchResults(getSearchResultElement(groupId), results);
            } catch (error) {
                console.error('Unable to search for bus stops:', error);
                renderSearchMessage(getSearchResultElement(groupId), '未能搜尋巴士站，請稍後再試。', 'error');
            }
        }, 220));
    }

    function getRouteSearchCompanies(route) {
        const companies = String(route.companies || route.company || '')
            .split(',')
            .map(company => company.trim().toUpperCase())
            .filter(company => company === 'KMB' || company === 'CTB');
        return [...new Set(companies)];
    }

    async function getKmbRouteStopChoices(route) {
        const catalog = await window.loadKmbStopCatalog();
        const byId = new Map(catalog.map(stop => [String(stop.stop), stop]));
        const results = await Promise.all(['outbound', 'inbound'].map(async direction => {
            try {
                const stops = await fetchData(`${api.kmb.routeStop}/${encodeURIComponent(route.route)}/${direction}/${Number(route.serviceType) || 1}`);
                return (Array.isArray(stops) ? stops : []).map(routeStop => {
                    const detail = byId.get(String(routeStop.stop));
                    const name = getKmbStopDisplayName(detail) || String(routeStop.stop);
                    return asStopChoice(
                        'KMB',
                        routeStop.stop,
                        extractKmbStopCode(detail?.name_tc) || extractKmbStopCode(detail?.name_en) || routeStop.stop,
                        name,
                        { route: route.route, direction, sequence: Number(routeStop.seq) || 0 }
                    );
                });
            } catch {
                return [];
            }
        }));
        return results.flat();
    }

    async function getCtbRouteStopChoices(route) {
        const results = await Promise.all(['outbound', 'inbound'].map(async direction => {
            try {
                const routeStops = await fetchData(`${api.ctb.routeStop}/${encodeURIComponent(route.route)}/${direction}`);
                const stops = Array.isArray(routeStops) ? routeStops : [];
                const details = await Promise.all(stops.map(stop =>
                    fetchData(`${api.ctb.stop}/${encodeURIComponent(stop.stop)}`).catch(() => null)
                ));
                return stops.map((routeStop, index) => {
                    const detail = details[index];
                    const name = getCtbStopDisplayName(detail) || routeStop.stop;
                    return asStopChoice(
                        'CTB',
                        routeStop.stop,
                        routeStop.stop,
                        name,
                        { route: route.route, direction, sequence: Number(routeStop.seq) || 0 }
                    );
                });
            } catch {
                return [];
            }
        }));
        return results.flat();
    }

    async function getRouteStopChoices(route) {
        const companies = getRouteSearchCompanies(route);
        const cacheKey = `${route.route}|${companies.join(',')}|${route.serviceType || 1}`;
        if (!routeStopSearchCache.has(cacheKey)) {
            routeStopSearchCache.set(cacheKey, (async () => {
                const results = await Promise.all(companies.map(company =>
                    company === 'KMB' ? getKmbRouteStopChoices(route) : getCtbRouteStopChoices(route)
                ));
                const seen = new Set();
                return results.flat()
                    .filter(choice => {
                        const key = `${choice.type}:${choice.id}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    })
                    .sort((a, b) => a.type.localeCompare(b.type) || a.sequence - b.sequence || a.name.localeCompare(b.name, 'zh-Hant'));
            })().catch(error => {
                routeStopSearchCache.delete(cacheKey);
                throw error;
            }));
        }
        return routeStopSearchCache.get(cacheKey);
    }

    async function showRouteStopChoices(groupId, route) {
        const target = getSearchResultElement(groupId);
        renderSearchMessage(target, `正在載入 ${route.route} 的巴士站…`);
        try {
            const choices = await getRouteStopChoices(route);
            const currentGroup = findDraftGroup(groupId);
            if (!currentGroup) return;
            if (!choices.length) {
                renderSearchMessage(target, `未能取得 ${route.route} 的巴士站資料。`, 'error');
                return;
            }
            renderSearchResults(target, choices);
        } catch (error) {
            console.error('Unable to load route stops:', error);
            renderSearchMessage(target, '未能載入這條路線的巴士站。', 'error');
        }
    }

    function chooseStop(groupId, choice) {
        const group = findDraftGroup(groupId);
        if (!group) return false;
        const isDuplicate = group.stops.some(stop => stop.id === choice.id && stop.type === choice.type);
        if (isDuplicate) {
            setFormStatus(`此${choice.type}巴士站已在群組內。`);
            return false;
        }
        group.stops.push({
            id: choice.id,
            code: choice.code || choice.id,
            label: null,
            type: choice.type,
            _draftId: makeDraftId('stop'),
            _displayName: choice.name
        });
        if (!group.name.trim()) {
            group.name = choice.name;
            const groupNameInput = getSearchResultElement(groupId)
                ?.closest('.station-config-group')
                ?.querySelector('[data-field="group-name"]');
            if (groupNameInput) groupNameInput.value = group.name;
        }
        renderSelectedStopList(group);
        setFormStatus(`已選擇 ${choice.type} 巴士站：${choice.name}。`, 'success');
        return true;
    }

    function clearStopSelection(groupId, stopId, preserveSearchResults = false) {
        const group = findDraftGroup(groupId);
        if (!group) return;
        group.stops = group.stops.filter(stop => stop._draftId !== stopId);
        if (preserveSearchResults) renderSelectedStopList(group);
        else renderDraftGroups();
    }

    function normalizeStopLabel(value) {
        return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    }

    function closeStopLabelDialog() {
        document.querySelector('.station-stop-custom-label-button[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
        document.querySelector('.station-label-dialog')?.remove();
        document.querySelector('.station-label-remove-badge')?.remove();
    }

    function toggleStopLabelRemoveBadge(groupId, stopId, trigger) {
        const stop = findDraftStop(groupId, stopId);
        if (!stop?.label || !trigger) return;
        const existingBadge = document.querySelector('.station-label-remove-badge');
        if (existingBadge?.parentElement === trigger.closest('.station-stop-label-control')) {
            closeStopLabelDialog();
            return;
        }

        closeStopLabelDialog();
        const badge = document.createElement('span');
        badge.className = 'station-label-remove-badge';
        badge.innerHTML = `<button type="button" data-action="remove-stop-label" data-group-id="${escapeMarkup(groupId)}" data-stop-id="${escapeMarkup(stopId)}" title="移除車站標籤" aria-label="移除車站標籤">×</button>`;
        trigger.closest('.station-stop-label-control')?.appendChild(badge);
        trigger.setAttribute('aria-expanded', 'true');
    }

    function removeStopLabel(groupId, stopId) {
        const group = findDraftGroup(groupId);
        const stop = findDraftStop(groupId, stopId);
        if (!group || !stop) return;
        stop.label = null;
        closeStopLabelDialog();
        renderSelectedStopList(group);
        setFormStatus('已清除車站標籤。', 'success');
    }

    function openStopLabelDialog(groupId, stopId) {
        const stop = findDraftStop(groupId, stopId);
        const selectedStop = document.querySelector(`.station-selected-stop[data-group-id="${CSS.escape(groupId)}"][data-stop-id="${CSS.escape(stopId)}"]`);
        const tagControl = selectedStop?.querySelector('.station-config-tag-control');
        if (!stop || !tagControl) return;

        closeStopLabelDialog();
        const dialog = document.createElement('section');
        dialog.className = 'station-label-dialog';
        dialog.dataset.groupId = groupId;
        dialog.dataset.stopId = stopId;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'false');
        dialog.innerHTML = `
            <div class="station-label-dialog-card">
                <input class="station-label-dialog-input" type="text" maxlength="24" autocomplete="off" spellcheck="false" inputmode="verbatim" pattern="[A-Za-z0-9]*" placeholder="增加車站標籤(選填)" value="${escapeMarkup(normalizeStopLabel(stop.label))}" aria-label="車站標籤">
                <div class="station-label-dialog-actions">
                    <button class="station-config-save" type="button" data-action="save-stop-label" data-group-id="${escapeMarkup(groupId)}" data-stop-id="${escapeMarkup(stopId)}">儲存</button>
                    <button class="station-config-cancel" type="button" data-action="cancel-stop-label" data-group-id="${escapeMarkup(groupId)}" data-stop-id="${escapeMarkup(stopId)}">取消</button>
                </div>
            </div>`;
        tagControl.appendChild(dialog);

        const input = dialog.querySelector('.station-label-dialog-input');
        input.addEventListener('input', () => {
            const normalized = normalizeStopLabel(input.value);
            if (input.value !== normalized) input.value = normalized;
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                closeStopLabelDialog();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                saveStopLabel(groupId, stopId);
            }
        });
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    function saveStopLabel(groupId, stopId) {
        const stop = findDraftStop(groupId, stopId);
        const input = document.querySelector('.station-label-dialog-input');
        if (!stop || !input) return;
        stop.label = normalizeStopLabel(input.value) || null;
        closeStopLabelDialog();
        renderDraftGroups();
        setFormStatus(stop.label ? `已設定車站標籤：${stop.label}。` : '已清除車站標籤。', 'success');
    }

    function stripDraftProperties(value) {
        if (Array.isArray(value)) return value.map(stripDraftProperties);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !key.startsWith('_'))
            .map(([key, item]) => [key, stripDraftProperties(item)]));
    }

    function buildConfigurationFromDraft() {
        if (!draftConfig) throw new Error('設定視窗尚未準備完成。');
        const rawConfiguration = stripDraftProperties({
            ...draftConfig,
            APP_TITLE: String(draftConfig.APP_TITLE || '').trim(),
            STOPS: draftConfig.STOPS.map(group => ({
                ...group,
                name: String(group.name || '').trim(),
                stops: group.stops.map(stop => ({
                    ...stop,
                    label: String(stop.label || '').trim() || null
                }))
            }))
        });
        return normalizeConfiguration(rawConfiguration);
    }

    function renderConfigurationFile(configuration) {
        const formatted = value => JSON.stringify(value, null, 4);
        return `// ===== Page Configuration =====\nconst APP_TITLE = ${formatted(configuration.APP_TITLE)};\n\n// ===== Stop Definitions =====\nconst STOPS = ${formatted(configuration.STOPS)};\n\nconst INBOUND_FLIP = ${formatted(configuration.INBOUND_FLIP)};\n\n// ===== Priority Configuration =====\nconst PRIORITY_CONFIG = ${formatted(configuration.PRIORITY_CONFIG)};\n\n// ===== GMB Destination Mapping =====\nconst GMB_META = ${formatted(configuration.GMB_META)};\n\n// ===== Destination Replacements =====\nconst DEST_REPLACEMENTS = ${formatted(configuration.DEST_REPLACEMENTS)};\n\n// ===== Grid Layout =====\nconst GRID_LAYOUT = ${formatted(configuration.GRID_LAYOUT)};\n`;
    }

    function downloadConfiguration() {
        const configuration = captureCurrentConfiguration();
        const source = renderConfigurationFile(configuration);
        const blob = new Blob([source], { type: 'text/javascript;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().slice(0, 10);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `kmbeta1_index_${date}.js`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function extractJavaScriptAssignment(source, name) {
        const declaration = new RegExp(`\\b(?:const|let|var)\\s+${escapeRegExp(name)}\\s*=`, 'm').exec(source);
        if (!declaration) throw new Error(`設定檔缺少 ${name}。`);
        const start = declaration.index + declaration[0].length;
        let depth = 0;
        let quote = null;
        let escaped = false;
        let lineComment = false;
        let blockComment = false;

        for (let index = start; index < source.length; index += 1) {
            const character = source[index];
            const next = source[index + 1];
            if (lineComment) {
                if (character === '\n') lineComment = false;
                continue;
            }
            if (blockComment) {
                if (character === '*' && next === '/') {
                    blockComment = false;
                    index += 1;
                }
                continue;
            }
            if (quote) {
                if (escaped) {
                    escaped = false;
                } else if (character === '\\') {
                    escaped = true;
                } else if (character === quote) {
                    quote = null;
                }
                continue;
            }
            if (character === '/' && next === '/') {
                lineComment = true;
                index += 1;
                continue;
            }
            if (character === '/' && next === '*') {
                blockComment = true;
                index += 1;
                continue;
            }
            if (character === '"' || character === "'") {
                quote = character;
                continue;
            }
            if (character === '{' || character === '[' || character === '(') depth += 1;
            if (character === '}' || character === ']' || character === ')') depth -= 1;
            if (character === ';' && depth === 0) return source.slice(start, index).trim();
        }
        throw new Error(`無法讀取 ${name}。`);
    }

    function stripJavaScriptComments(source) {
        let output = '';
        let quote = null;
        let escaped = false;
        let lineComment = false;
        let blockComment = false;
        for (let index = 0; index < source.length; index += 1) {
            const character = source[index];
            const next = source[index + 1];
            if (lineComment) {
                if (character === '\n') {
                    lineComment = false;
                    output += character;
                }
                continue;
            }
            if (blockComment) {
                if (character === '*' && next === '/') {
                    blockComment = false;
                    index += 1;
                }
                continue;
            }
            if (quote) {
                output += character;
                if (escaped) {
                    escaped = false;
                } else if (character === '\\') {
                    escaped = true;
                } else if (character === quote) {
                    quote = null;
                }
                continue;
            }
            if (character === '/' && next === '/') {
                lineComment = true;
                index += 1;
                continue;
            }
            if (character === '/' && next === '*') {
                blockComment = true;
                index += 1;
                continue;
            }
            output += character;
            if (character === '"' || character === "'") quote = character;
        }
        return output;
    }

    function quoteJavaScriptObjectKeys(source) {
        let output = '';
        let quote = null;
        let escaped = false;

        for (let index = 0; index < source.length; index += 1) {
            const character = source[index];
            if (quote) {
                output += character;
                if (escaped) {
                    escaped = false;
                } else if (character === '\\') {
                    escaped = true;
                } else if (character === quote) {
                    quote = null;
                }
                continue;
            }

            if (character === '"' || character === "'") {
                quote = character;
                output += character;
                continue;
            }

            if (/[A-Za-z_$]/.test(character)) {
                let end = index + 1;
                while (end < source.length && /[A-Za-z0-9_$]/.test(source[end])) end += 1;
                const token = source.slice(index, end);
                let next = end;
                while (next < source.length && /\s/.test(source[next])) next += 1;
                if (source[next] === ':') {
                    output += `"${token}"`;
                    index = end - 1;
                    continue;
                }
                output += token;
                index = end - 1;
                continue;
            }

            output += character;
        }
        return output;
    }

    function parseConfigurationLiteral(source, name) {
        const literal = extractJavaScriptAssignment(source, name);
        const json = quoteJavaScriptObjectKeys(stripJavaScriptComments(literal))
            .replace(/,(\s*[}\]])/g, '$1');
        try {
            return JSON.parse(json);
        } catch (error) {
            throw new Error(`${name} 的格式不支援。請匯入由本程式匯出的 JS 設定檔。`);
        }
    }

    function parseImportedConfiguration(source) {
        const configuration = {
            APP_TITLE: parseConfigurationLiteral(source, 'APP_TITLE'),
            STOPS: parseConfigurationLiteral(source, 'STOPS'),
            INBOUND_FLIP: parseConfigurationLiteral(source, 'INBOUND_FLIP'),
            PRIORITY_CONFIG: parseConfigurationLiteral(source, 'PRIORITY_CONFIG'),
            GMB_META: parseConfigurationLiteral(source, 'GMB_META'),
            DEST_REPLACEMENTS: parseConfigurationLiteral(source, 'DEST_REPLACEMENTS'),
            GRID_LAYOUT: parseConfigurationLiteral(source, 'GRID_LAYOUT')
        };
        return normalizeConfiguration(configuration);
    }

    async function importConfigurationFile(file) {
        try {
            const source = await file.text();
            const imported = parseImportedConfiguration(source);
            showImportConfirmation(imported, file.name);
        } catch (error) {
            console.error('Unable to import configuration:', error);
            setFormStatus(error.message || '無法讀取設定檔。', 'error');
        }
    }

    function saveDraftConfiguration() {
        try {
            validateRequiredFields();
            const configuration = buildConfigurationFromDraft();
            applyRuntimeConfiguration(configuration);
            closeConfigurationWindow();
        } catch {
            if (getActiveInvalidFields().length) {
                renderValidationStatus();
            } else {
                setFormStatus(REQUIRED_FIELDS_ERROR, 'error');
            }
        }
    }

    function bindConfigurationWindow(overlay) {
        const input = overlay.querySelector('.station-config-file-input');
        input.addEventListener('change', event => {
            const [file] = event.target.files || [];
            event.target.value = '';
            if (file) importConfigurationFile(file);
        });

        overlay.addEventListener('input', event => {
            const field = event.target.dataset.field;
            if (!field || !draftConfig) return;
            if (field === 'app-title' || field === 'group-name') {
                clearInvalidField(event.target);
            }
            if (field === 'app-title') {
                const title = truncateAppTitle(event.target.value);
                if (event.target.value !== title) event.target.value = title;
                draftConfig.APP_TITLE = title;
                return;
            }
            const group = findDraftGroup(event.target.dataset.groupId);
            if (!group) return;
            if (field === 'group-name') {
                group.name = event.target.value;
                return;
            }
            if (field === 'pinned-routes') {
                group.pin = normalizePinnedRoutes(event.target.value);
                return;
            }
            if (field === 'stop-search') scheduleStopSearch(event.target);
        });

        overlay.addEventListener('click', event => {
            const searchInput = event.target.closest('input[data-field="stop-search"]');
            if (searchInput) scheduleStopSearch(searchInput);

            const labelDialog = overlay.querySelector('.station-label-dialog');
            const labelRemoveBadge = overlay.querySelector('.station-label-remove-badge');
            if ((labelDialog || labelRemoveBadge)
                && !labelDialog?.contains(event.target)
                && !labelRemoveBadge?.contains(event.target)
                && !event.target.closest('.station-config-tag-button, .station-stop-custom-label-button')) {
                closeStopLabelDialog();
            }
            if (event.target === overlay) {
                requestCloseConfigurationWindow();
                return;
            }
            overlay.querySelectorAll('.station-search-control').forEach(searchControl => {
                if (!searchControl.contains(event.target)) {
                    closeSearchResults(searchControl.querySelector('[data-field="stop-search"]')?.dataset.groupId);
                }
            });
            const control = event.target.closest('[data-action]');
            if (!control) return;
            const { action, groupId, stopId, resultKey } = control.dataset;
            if (action === 'close') {
                requestCloseConfigurationWindow();
            } else if (action === 'add-group') {
                draftConfig.STOPS.push(makeEmptyGroup());
                renderDraftGroups();
                requestAnimationFrame(() => document.querySelector('.station-config-group:last-child input')?.focus());
            } else if (action === 'remove-group') {
                draftConfig.STOPS = draftConfig.STOPS.filter(group => group._draftId !== groupId);
                renderDraftGroups();
            } else if (action === 'remove-stop') {
                clearStopSelection(groupId, stopId);
            } else if (action === 'edit-stop-label') {
                openStopLabelDialog(groupId, stopId);
            } else if (action === 'toggle-stop-label-remove') {
                toggleStopLabelRemoveBadge(groupId, stopId, control);
            } else if (action === 'remove-stop-label') {
                removeStopLabel(groupId, stopId);
            } else if (action === 'save-stop-label') {
                saveStopLabel(groupId, stopId);
            } else if (action === 'cancel-stop-label') {
                closeStopLabelDialog();
            } else if (action === 'previous-error') {
                focusInvalidField(invalidFieldIndex - 1);
            } else if (action === 'next-error') {
                focusInvalidField(invalidFieldIndex + 1);
            } else if (action === 'clear-stop') {
                clearStopSelection(groupId, stopId);
            } else if (action === 'toggle-search-result') {
                const result = searchResultStore.get(resultKey);
                if (!result) return;
                const group = findDraftGroup(groupId);
                const selectedStop = group?.stops.find(stop => stop.id === result.id && stop.type === result.type);
                if (selectedStop) {
                    clearStopSelection(groupId, selectedStop._draftId, true);
                    control.closest('.station-search-result')?.classList.remove('is-selected');
                    control.textContent = '+';
                    control.setAttribute('aria-pressed', 'false');
                    control.setAttribute('title', '選擇巴士站');
                    control.setAttribute('aria-label', '選擇巴士站');
                    setFormStatus(`已取消選擇 ${result.type} 巴士站：${result.name}。`);
                } else if (chooseStop(groupId, result)) {
                    control.closest('.station-search-result')?.classList.add('is-selected');
                    control.textContent = '−';
                    control.setAttribute('aria-pressed', 'true');
                    control.setAttribute('title', '取消選擇巴士站');
                    control.setAttribute('aria-label', '取消選擇巴士站');
                }
            } else if (action === 'select-search-result') {
                const result = searchResultStore.get(resultKey);
                if (!result) return;
                if (result.kind === 'route') {
                    showRouteStopChoices(groupId, result);
                } else {
                    chooseStop(groupId, result);
                    closeSearchResults(groupId);
                }
            } else if (action === 'save') {
                saveDraftConfiguration();
            } else if (action === 'clear') {
                clearDraftStations();
            } else if (action === 'cancel') {
                closeConfigurationWindow();
            } else if (action === 'export' || action === 'confirm-export') {
                downloadConfiguration();
                if (action === 'confirm-export') setFormStatus('已匯出目前資料；確認後可按 Yes 繼續匯入。', 'success');
            } else if (action === 'import') {
                input.click();
            } else if (action === 'confirm-no') {
                closeImportConfirmation();
            } else if (action === 'confirm-yes') {
                try {
                    if (!pendingImportConfig) throw new Error('找不到要匯入的設定。');
                    applyRuntimeConfiguration(pendingImportConfig);
                    closeConfigurationWindow();
                } catch (error) {
                    setFormStatus(error.message || '無法匯入設定。', 'error');
                    closeImportConfirmation();
                }
            }
        });

        overlay.addEventListener('focusin', event => {
            const input = event.target.closest('input[data-field="stop-search"]');
            if (!input) return;
            const target = getSearchResultElement(input.dataset.groupId);
            if (target?.innerHTML.trim()) positionSearchResults(target);
        });
    }

    function repositionOpenSearchResults() {
        document.querySelectorAll('.station-stop-search-results').forEach(target => {
            if (target.innerHTML.trim()) positionSearchResults(target);
        });
    }

    window.addEventListener('resize', repositionOpenSearchResults);
    document.addEventListener('scroll', repositionOpenSearchResults, true);

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !document.querySelector('.station-config-overlay')) return;
        if (document.querySelector('.station-label-dialog')) {
            closeStopLabelDialog();
            return;
        }
        if (!document.querySelector('.station-import-confirm.hidden')) {
            closeImportConfirmation();
        } else {
            requestCloseConfigurationWindow();
        }
    });

    document.getElementById('btn-stop-modify')?.addEventListener('click', renderConfigurationWindow);
    window.openStopModifyWindow = renderConfigurationWindow;
    restoreSavedConfiguration();
}());
