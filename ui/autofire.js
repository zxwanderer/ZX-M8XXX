// Autofire — periodic key press/release with named profiles (init-function pattern, DI)

const STORAGE_KEY = 'zxm8_autofire';

const DEFAULT_PROFILE = { name: 'Default', key: 'fire', rate: '10', hold: '50' };

const KEY_LABELS = {
    'fire': 'Fire', ' ': 'Space', 'Enter': 'Enter',
    'Shift': 'CS', 'Alt': 'SS'
};

function keyLabel(key) {
    return KEY_LABELS[key] || key.toUpperCase();
}

export function initAutofire({ getSpectrum, showMessage }) {
    const chk = document.getElementById('chkAutofire');
    const listEl = document.getElementById('autofireList');
    const keySelect = document.getElementById('autofireKey');
    const rateSelect = document.getElementById('autofireRate');
    const holdSelect = document.getElementById('autofireHold');
    const statusSpan = document.getElementById('autofireStatus');
    const btnAdd = document.getElementById('btnAutofireAdd');

    let timerId = null;
    let holdTimeoutId = null;
    let profiles = [];
    let activeIndex = 0;

    // --- Compact key dropdown (size toggle) ---
    // Native <select> dropdown height can't be controlled via CSS.
    // Toggle size attribute: collapsed (size=1) -> expanded (size=20 scrollable listbox).
    // Use position:fixed to escape parent overflow clipping.

    let savedKeyWidth = '';
    const keyWrapper = keySelect.parentElement;
    const controlsRow = keyWrapper.parentElement;

    keySelect.addEventListener('mousedown', (e) => {
        if (keySelect.size > 1) return; // already expanded
        e.preventDefault();
        const rect = keySelect.getBoundingClientRect();
        const rowRect = controlsRow.getBoundingClientRect();
        savedKeyWidth = keySelect.style.width;
        // Lock row and wrapper dimensions so layout doesn't shift
        controlsRow.style.height = rowRect.height + 'px';
        keyWrapper.style.width = rect.width + 'px';
        keyWrapper.style.height = rect.height + 'px';
        keySelect.size = 20;
        keySelect.style.position = 'fixed';
        keySelect.style.left = rect.left + 'px';
        keySelect.style.top = rect.top + 'px';
        keySelect.style.width = rect.width + 'px';
        keySelect.style.zIndex = '10000';
        keySelect.focus();
    });

    keySelect.addEventListener('change', collapseKeySelect);
    keySelect.addEventListener('blur', collapseKeySelect);

    function collapseKeySelect() {
        if (keySelect.size <= 1) return;
        keySelect.removeAttribute('size');
        keySelect.style.position = '';
        keySelect.style.left = '';
        keySelect.style.top = '';
        keySelect.style.width = savedKeyWidth;
        keySelect.style.zIndex = '';
        // Release locked dimensions
        keyWrapper.style.width = '';
        keyWrapper.style.height = '';
        controlsRow.style.height = '';
    }

    // --- Persistence ---

    function load() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && Array.isArray(saved.profiles) && saved.profiles.length > 0) {
                profiles = saved.profiles;
                activeIndex = Math.min(saved.activeIndex || 0, profiles.length - 1);
            } else if (saved && saved.key !== undefined) {
                // Migrate old single-profile format
                profiles = [{ name: 'Default', key: saved.key, rate: saved.rate, hold: saved.hold }];
                activeIndex = 0;
            } else {
                profiles = [{ ...DEFAULT_PROFILE }];
                activeIndex = 0;
            }
        } catch (_) {
            profiles = [{ ...DEFAULT_PROFILE }];
            activeIndex = 0;
        }
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles, activeIndex }));
    }

    // --- Profile list rendering ---

    function renderList() {
        listEl.innerHTML = '';
        for (let i = 0; i < profiles.length; i++) {
            const p = profiles[i];
            const row = document.createElement('div');
            row.dataset.index = i;
            row.style.cssText = 'display: flex; align-items: center; padding: 2px 5px; font-size: 11px; font-family: monospace; border-radius: 2px; margin-bottom: 1px; cursor: pointer; gap: 6px;';
            row.style.background = i === activeIndex ? 'var(--bg-button)' : 'var(--bg-primary)';

            const name = document.createElement('span');
            name.textContent = p.name;
            name.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ' + (i === activeIndex ? 'var(--cyan)' : 'var(--text-primary)') + ';';

            const key = document.createElement('span');
            key.textContent = keyLabel(p.key);
            key.style.cssText = 'min-width: 36px; text-align: center; color: var(--accent); font-size: 10px;';

            const rate = document.createElement('span');
            rate.textContent = p.rate + 'Hz';
            rate.style.cssText = 'min-width: 30px; text-align: right; color: var(--text-secondary); font-size: 10px;';

            const hold = document.createElement('span');
            hold.textContent = p.hold + '%';
            hold.style.cssText = 'min-width: 24px; text-align: right; color: var(--text-secondary); font-size: 10px;';

            const renBtn = document.createElement('span');
            renBtn.textContent = '\u270E';
            renBtn.title = 'Rename';
            renBtn.style.cssText = 'color: var(--text-secondary); cursor: pointer; padding: 0 2px; font-size: 11px;';
            renBtn.addEventListener('mouseenter', () => { renBtn.style.color = 'var(--accent)'; });
            renBtn.addEventListener('mouseleave', () => { renBtn.style.color = 'var(--text-secondary)'; });
            renBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newName = prompt('Rename profile:', p.name);
                if (newName === null) return;
                p.name = newName.trim() || 'Untitled';
                renderList();
                save();
            });

            const delBtn = document.createElement('span');
            delBtn.textContent = '\u00D7';
            delBtn.title = 'Remove';
            delBtn.style.cssText = 'color: var(--text-secondary); cursor: pointer; padding: 0 2px; font-size: 12px;';
            delBtn.addEventListener('mouseenter', () => { delBtn.style.color = 'var(--accent)'; });
            delBtn.addEventListener('mouseleave', () => { delBtn.style.color = 'var(--text-secondary)'; });
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (profiles.length <= 1) { showMessage('Cannot delete the last profile'); return; }
                if (!confirm(`Delete profile "${p.name}"?`)) return;
                const wasActive = i === activeIndex;
                if (wasActive && isAutofireActive()) stopAutofire();
                profiles.splice(i, 1);
                if (activeIndex >= profiles.length) activeIndex = profiles.length - 1;
                else if (i < activeIndex) activeIndex--;
                loadProfileIntoControls();
                renderList();
                save();
            });

            row.addEventListener('click', () => {
                const wasActive = isAutofireActive();
                if (wasActive) stopAutofire();
                activeIndex = i;
                loadProfileIntoControls();
                renderList();
                save();
                if (wasActive) startAutofire();
            });

            row.addEventListener('mouseenter', () => {
                if (i !== activeIndex) row.style.background = 'var(--bg-button)';
            });
            row.addEventListener('mouseleave', () => {
                if (i !== activeIndex) row.style.background = 'var(--bg-primary)';
            });

            row.appendChild(name);
            row.appendChild(key);
            row.appendChild(rate);
            row.appendChild(hold);
            row.appendChild(renBtn);
            row.appendChild(delBtn);
            listEl.appendChild(row);
        }
    }

    function loadProfileIntoControls() {
        const p = profiles[activeIndex];
        if (!p) return;
        keySelect.value = p.key;
        rateSelect.value = p.rate;
        holdSelect.value = p.hold;
    }

    function saveControlsToProfile() {
        const p = profiles[activeIndex];
        if (!p) return;
        p.key = keySelect.value;
        p.rate = rateSelect.value;
        p.hold = holdSelect.value;
        renderList();
        save();
    }

    // --- Key press/release ---

    function pressKey(key) {
        const spectrum = getSpectrum();
        if (key === 'fire') {
            spectrum.kempstonState |= 0x10;
        } else {
            spectrum.ula.keyDown(key);
        }
    }

    function releaseKey(key) {
        const spectrum = getSpectrum();
        if (key === 'fire') {
            spectrum.kempstonState &= ~0x10;
        } else {
            spectrum.ula.keyUp(key);
        }
    }

    // --- Autofire engine ---

    function startAutofire() {
        stopAutofire();

        const key = keySelect.value;
        const holdPct = parseInt(holdSelect.value, 10);

        // 100% hold = constant press, no cycling
        if (holdPct === 100) {
            pressKey(key);
            // Set timerId so isAutofireActive() returns true
            timerId = setTimeout(() => {}, 0x7FFFFFFF);
        } else {
            const rate = parseInt(rateSelect.value, 10);
            const cycle = 1000 / rate;
            const holdTime = cycle * (holdPct / 100);
            const gapTime = cycle - holdTime;

            // Recursive setTimeout chain avoids setInterval batching
            function tick() {
                pressKey(key);
                holdTimeoutId = setTimeout(() => {
                    releaseKey(key);
                    holdTimeoutId = null;
                    timerId = setTimeout(tick, gapTime);
                }, holdTime);
            }

            tick();
        }

        chk.checked = true;
        statusSpan.textContent = 'ON';
        statusSpan.style.color = 'var(--cyan)';
    }

    function stopAutofire() {
        if (timerId !== null) {
            clearTimeout(timerId);
            timerId = null;
        }
        if (holdTimeoutId !== null) {
            clearTimeout(holdTimeoutId);
            holdTimeoutId = null;
        }
        // Ensure key is released
        releaseKey(keySelect.value);

        chk.checked = false;
        statusSpan.textContent = '';
    }

    function isAutofireActive() {
        return timerId !== null || holdTimeoutId !== null;
    }

    function toggleAutofire() {
        if (isAutofireActive()) {
            stopAutofire();
            showMessage('Autofire OFF');
        } else {
            startAutofire();
            showMessage('Autofire ON');
        }
    }

    // --- Event handlers ---

    chk.addEventListener('change', () => {
        if (chk.checked) {
            startAutofire();
            showMessage('Autofire ON');
        } else {
            stopAutofire();
            showMessage('Autofire OFF');
        }
    });

    function onSettingChange() {
        saveControlsToProfile();
        if (isAutofireActive()) startAutofire();
    }
    keySelect.addEventListener('change', onSettingChange);
    rateSelect.addEventListener('change', onSettingChange);
    holdSelect.addEventListener('change', onSettingChange);

    btnAdd.addEventListener('click', () => {
        const name = prompt('Profile name:', '');
        if (name === null) return;
        const trimmed = name.trim() || 'Untitled';
        profiles.push({ name: trimmed, key: 'fire', rate: '10', hold: '50' });
        activeIndex = profiles.length - 1;
        loadProfileIntoControls();
        renderList();
        save();
        showMessage(`Profile "${trimmed}" added`);
    });

    // --- Init ---

    load();
    loadProfileIntoControls();
    renderList();

    return { toggleAutofire, stopAutofire, isAutofireActive };
}
