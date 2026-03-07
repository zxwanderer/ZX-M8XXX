// poke-search.js — POKE Search / Memory Scanner (extracted from index.html)
import { hex8, hex16 } from '../core/utils.js';
import { SLOT1_START } from '../core/constants.js';

export function initPokeSearch({ readMemory, startWriteTrace, stopWriteTrace, showMessage, goToMemoryAddress }) {

    // DOM lookups
    const btnPokeSnap = document.getElementById('btnPokeSnap');
    const pokeSearchMode = document.getElementById('pokeSearchMode');
    const btnPokeSearch = document.getElementById('btnPokeSearch');
    const btnPokeReset = document.getElementById('btnPokeReset');
    const pokeStatus = document.getElementById('pokeStatus');
    const pokeResults = document.getElementById('pokeResults');
    const pokeSkipScreen = document.getElementById('pokeSkipScreen');
    const pokeFilterValue = document.getElementById('pokeFilterValue');
    const btnPokeFilter = document.getElementById('btnPokeFilter');
    const btnPokeTrace = document.getElementById('btnPokeTrace');
    const btnPokeTraceClear = document.getElementById('btnPokeTraceClear');

    // State
    let pokeSnapshot = null;  // Last snapshot for comparison
    let pokeSnapshots = [];   // All snapshots taken (each is Uint8Array of 64K)
    let pokeCandidates = null;  // Set of candidate addresses (null = all RAM)
    let pokeSnapCount = 0;  // Number of snapshots taken
    let pokeValueHistory = new Map();  // addr -> [val0, val1, ...] display history per candidate
    let pokePreFilterCandidates = null;  // Backup before filter
    let pokePreFilterHistory = null;     // Backup before filter
    let pokeBlacklist = null;        // Set<number> — addresses to exclude from search
    let pokeWriteTracing = false;

    // Functions

    function updatePokeStatus() {
        let text = pokeSnapCount > 0 ? `snaps: ${pokeSnapCount}` : '';
        if (pokeCandidates !== null) {
            text += (text ? ', ' : '') + `${pokeCandidates.size} candidates`;
        }
        if (pokeBlacklist) {
            text += (text ? ', ' : '') + `BL: ${pokeBlacklist.size}`;
        }
        pokeStatus.textContent = text ? `(${text})` : '';
    }

    function updatePokeResults() {
        if (pokeCandidates === null || pokeCandidates.size === 0) {
            pokeResults.innerHTML = '';
            return;
        }
        // Show first 100 candidates — values from snapshots only, not live memory
        const lastSnap = pokeSnapshots.length > 0 ? pokeSnapshots[pokeSnapshots.length - 1] : null;
        const addrs = [...pokeCandidates].slice(0, 100);
        let html = addrs.map(addr => {
            const val = lastSnap ? lastSnap[addr] : 0;
            const hist = pokeValueHistory.get(addr);
            const tip = hist ? hist.map(v => hex8(v)).join(' \u2192 ') : '';
            return `<span class="poke-result" data-addr="${addr}" title="${tip}"><span class="addr">${hex16(addr)}</span><span class="val">${hex8(val)}</span></span>`;
        }).join('');
        if (pokeCandidates.size > 100) {
            html += `<span class="poke-status">...and ${pokeCandidates.size - 100} more</span>`;
        }
        pokeResults.innerHTML = html;
    }

    // Event bindings

    btnPokeSnap.addEventListener('click', () => {
        if (!readMemory) return;
        pokeSnapshot = new Uint8Array(0x10000);
        for (let addr = 0; addr < 0x10000; addr++) {
            pokeSnapshot[addr] = readMemory(addr);
        }
        pokeSnapshots.push(pokeSnapshot);
        pokeSnapCount++;
        updatePokeStatus();
    });

    btnPokeSearch.addEventListener('click', () => {
        if (!readMemory || pokeSnapshots.length < 2) {
            showMessage('Need at least 2 snapshots', 'error');
            return;
        }

        const mode = pokeSearchMode.value;

        // Always scan all RAM — snapshot history provides the narrowing
        const skipScreen = pokeSkipScreen.checked;
        const startAddr = skipScreen ? 0x5C00 : SLOT1_START;

        const newCandidates = new Set();
        const newHistory = new Map();

        for (let addr = startAddr; addr < 0x10000; addr++) {
            if (pokeBlacklist && pokeBlacklist.has(addr)) continue;
            // Build value sequence from all snapshots
            const values = [];
            for (let s = 0; s < pokeSnapshots.length; s++) {
                values.push(pokeSnapshots[s][addr]);
            }

            if (values.length < 2) {
                if (mode === 'unchanged') {
                    newCandidates.add(addr);
                    newHistory.set(addr, values);
                }
                continue;
            }

            // Validate ALL consecutive snap-to-snap pairs
            let match = true;
            for (let i = 1; i < values.length; i++) {
                const pv = values[i - 1], cv = values[i];
                let ok = false;
                switch (mode) {
                    case 'dec1': ok = cv === ((pv - 1) & 0xff); break;
                    case 'inc1': ok = cv === ((pv + 1) & 0xff); break;
                    case 'decreased': ok = cv < pv; break;
                    case 'increased': ok = cv > pv; break;
                    case 'changed': ok = cv !== pv; break;
                    case 'unchanged': ok = cv === pv; break;
                }
                if (!ok) { match = false; break; }
            }

            if (match) {
                newCandidates.add(addr);
                newHistory.set(addr, values);
            }
        }

        pokeCandidates = newCandidates;
        pokeValueHistory = newHistory;
        pokePreFilterCandidates = null;
        pokePreFilterHistory = null;

        showMessage(`${pokeCandidates.size} candidate(s) found`);
        updatePokeStatus();
        updatePokeResults();
    });

    btnPokeFilter.addEventListener('click', () => {
        const valStr = pokeFilterValue.value.trim();

        // Empty value = undo filter
        if (!valStr) {
            if (pokePreFilterCandidates) {
                pokeCandidates = pokePreFilterCandidates;
                pokeValueHistory = pokePreFilterHistory;
                pokePreFilterCandidates = null;
                pokePreFilterHistory = null;
                showMessage(`Filter cleared, ${pokeCandidates.size} candidate(s)`);
                updatePokeStatus();
                updatePokeResults();
            }
            return;
        }

        if (!pokeCandidates || pokeCandidates.size === 0) {
            showMessage('No candidates to filter', 'error');
            return;
        }
        if (!/^[0-9A-Fa-f]{1,2}$/.test(valStr)) {
            showMessage('Enter hex value (00-FF)', 'error');
            return;
        }
        const targetValue = parseInt(valStr, 16);

        // Save pre-filter state (only if not already filtered)
        if (!pokePreFilterCandidates) {
            pokePreFilterCandidates = new Set(pokeCandidates);
            pokePreFilterHistory = new Map(pokeValueHistory);
        }

        // Filter from pre-filter set using last snapshot (allows re-filtering with different value)
        const lastSnap = pokeSnapshots.length > 0 ? pokeSnapshots[pokeSnapshots.length - 1] : null;
        if (!lastSnap) {
            showMessage('No snapshots taken', 'error');
            return;
        }
        const source = pokePreFilterCandidates;
        const filtered = new Set();
        for (const addr of source) {
            if (lastSnap[addr] === targetValue) {
                filtered.add(addr);
            }
        }
        pokeCandidates = filtered;
        // Restore full history then prune
        pokeValueHistory = new Map(pokePreFilterHistory);
        for (const addr of pokeValueHistory.keys()) {
            if (!filtered.has(addr)) pokeValueHistory.delete(addr);
        }
        showMessage(`${filtered.size} candidate(s) after filter`);
        updatePokeStatus();
        updatePokeResults();
    });

    btnPokeReset.addEventListener('click', () => {
        pokeSnapshot = null;
        pokeSnapshots = [];
        pokeCandidates = null;
        pokeValueHistory = new Map();
        pokePreFilterCandidates = null;
        pokePreFilterHistory = null;
        pokeSnapCount = 0;
        pokeResults.innerHTML = '';
        pokeFilterValue.value = '';
        updatePokeStatus();
    });

    btnPokeTrace.addEventListener('click', () => {
        const btn = btnPokeTrace;
        if (!pokeWriteTracing) {
            startWriteTrace();
            pokeWriteTracing = true;
            btn.textContent = 'Stop Trace';
            btn.classList.add('active');
        } else {
            const addrs = stopWriteTrace();
            pokeWriteTracing = false;
            btn.textContent = 'Trace';
            btn.classList.remove('active');
            if (addrs && addrs.size > 0) {
                if (pokeBlacklist) {
                    for (const a of addrs) pokeBlacklist.add(a);
                } else {
                    pokeBlacklist = new Set(addrs);
                }
            }
            showMessage(`Blacklisted ${pokeBlacklist ? pokeBlacklist.size : 0} addresses`);
            btnPokeTraceClear.classList.toggle('hidden', !pokeBlacklist);
            updatePokeStatus();
        }
    });

    btnPokeTraceClear.addEventListener('click', () => {
        pokeBlacklist = null;
        btnPokeTraceClear.classList.add('hidden');
        updatePokeStatus();
        showMessage('Blacklist cleared');
    });

    pokeResults.addEventListener('click', (e) => {
        const resultEl = e.target.closest('.poke-result');
        if (resultEl) {
            const addr = parseInt(resultEl.dataset.addr);
            goToMemoryAddress(addr);
        }
    });

    // Public API
    return {
        stopTracing() {
            if (pokeWriteTracing) {
                stopWriteTrace();
                pokeWriteTracing = false;
                const btn = document.getElementById('btnPokeTrace');
                btn.textContent = 'Trace';
                btn.classList.remove('active');
            }
        }
    };
}
