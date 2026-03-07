// poke-manager.js — POKE Manager (extracted from index.html)
import { hex8, hex16 } from '../core/utils.js';

export function initPokeManager({ readMemory, writePoke, showMessage }) {
    // DOM lookups
    const pokeList = document.getElementById('pokeList');
    const pokeEditors = document.getElementById('pokeEditors');
    const pokeGameLabel = document.getElementById('pokeGameLabel');
    const pokeToggleAll = document.getElementById('pokeToggleAll');
    const btnPokeLoad = document.getElementById('btnPokeLoad');
    const btnPokeClear = document.getElementById('btnPokeClear');
    const btnPokeSave = document.getElementById('btnPokeSave');
    const btnPokeAdd = document.getElementById('btnPokeAdd');
    const btnEditorAdd = document.getElementById('btnEditorAdd');
    const btnEditorReadAll = document.getElementById('btnEditorReadAll');
    const pokeAddName = document.getElementById('pokeAddName');
    const pokeAddAddr = document.getElementById('pokeAddAddr');
    const pokeAddNormal = document.getElementById('pokeAddNormal');
    const pokeAddPoke = document.getElementById('pokeAddPoke');
    const editorAddName = document.getElementById('editorAddName');
    const editorAddAddr = document.getElementById('editorAddAddr');
    const editorAddType = document.getElementById('editorAddType');

    // State
    let pokeEntries = [];       // Array of { name, enabled, patches: [{addr, normal, poke}] }
    let pokeEditorEntries = []; // Array of { name, addr, type }
    let pokeGameName = '';

    function parsePokeValue(v) {
        if (typeof v === 'number') return v & 0xffff;
        const s = String(v).trim();
        if (s.startsWith('$')) return parseInt(s.slice(1), 16) & 0xffff;
        if (s.startsWith('0x') || s.startsWith('0X')) return parseInt(s.slice(2), 16) & 0xffff;
        return parseInt(s, 16) & 0xffff;
    }

    function pokeToggle(index, enable) {
        const entry = pokeEntries[index];
        if (!entry || !readMemory) return;
        entry.enabled = enable;
        for (const p of entry.patches) {
            writePoke(p.addr, enable ? p.poke : p.normal);
        }
    }

    function pokeDisableAll() {
        for (let i = 0; i < pokeEntries.length; i++) {
            if (pokeEntries[i].enabled) pokeToggle(i, false);
        }
    }

    function pokeClearAll() {
        pokeDisableAll();
        pokeEntries = [];
        pokeEditorEntries = [];
        pokeGameName = '';
        renderPokeManager();
    }

    function loadPokeJSON(text) {
        const json = JSON.parse(text);
        pokeDisableAll();
        pokeEntries = [];
        pokeEditorEntries = [];
        pokeGameName = json.game || '';

        if (json.pokes) {
            for (const p of json.pokes) {
                const patches = (p.patches || []).map(pt => Array.isArray(pt)
                    ? { addr: parsePokeValue(pt[0]), normal: parsePokeValue(pt[1]) & 0xff, poke: parsePokeValue(pt[2]) & 0xff }
                    : { addr: parsePokeValue(pt.addr), normal: parsePokeValue(pt.normal) & 0xff, poke: parsePokeValue(pt.poke) & 0xff }
                );
                pokeEntries.push({ name: p.name || 'Unnamed', enabled: false, patches });
                if (p.enabled) {
                    pokeToggle(pokeEntries.length - 1, true);
                }
            }
        }

        if (json.editors) {
            for (const e of json.editors) {
                pokeEditorEntries.push({
                    name: e.name || 'Value',
                    addr: parsePokeValue(e.addr),
                    type: e.type === 'word' ? 'word' : 'byte'
                });
            }
        }

        renderPokeManager();
    }

    function pokeReadEditorValue(ed, input) {
        if (!readMemory) return;
        if (ed.type === 'word') {
            const lo = readMemory(ed.addr);
            const hi = readMemory((ed.addr + 1) & 0xffff);
            input.value = hex16((hi << 8) | lo);
        } else {
            input.value = hex8(readMemory(ed.addr));
        }
    }

    function pokeReadAllEditors() {
        pokeEditorEntries.forEach((ed, i) => {
            const input = document.getElementById('pokeEditor_' + i);
            if (input) pokeReadEditorValue(ed, input);
        });
    }

    function pokeUpdateToggleAll() {
        const cb = pokeToggleAll;
        if (!cb) return;
        if (pokeEntries.length === 0) {
            cb.checked = false;
            cb.indeterminate = false;
        } else {
            const enabledCount = pokeEntries.filter(e => e.enabled).length;
            cb.checked = enabledCount === pokeEntries.length;
            cb.indeterminate = enabledCount > 0 && enabledCount < pokeEntries.length;
        }
    }

    function renderPokeManager() {
        pokeGameLabel.textContent = pokeGameName;

        if (pokeEntries.length === 0) {
            pokeList.innerHTML = '<div class="no-breakpoints">No pokes loaded</div>';
        } else {
            pokeList.innerHTML = '';
            pokeEntries.forEach((entry, i) => {
                const div = document.createElement('div');
                div.className = 'poke-entry';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = entry.enabled;
                cb.title = entry.enabled ? 'Disable poke' : 'Enable poke';
                cb.addEventListener('change', () => {
                    pokeToggle(i, cb.checked);
                    pokeUpdateToggleAll();
                });

                const nameSpan = document.createElement('span');
                nameSpan.className = 'poke-name';
                nameSpan.textContent = entry.name;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'poke-remove';
                removeBtn.textContent = '\u00d7';
                removeBtn.title = 'Remove poke';
                removeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (entry.enabled) pokeToggle(i, false);
                    pokeEntries.splice(i, 1);
                    renderPokeManager();
                });

                div.appendChild(cb);
                div.appendChild(nameSpan);
                div.appendChild(removeBtn);
                pokeList.appendChild(div);
            });
        }

        if (pokeEditorEntries.length === 0) {
            pokeEditors.innerHTML = '';
            pokeEditors.style.display = 'none';
        } else {
            pokeEditors.style.display = '';
            pokeEditors.innerHTML = '';
            pokeEditorEntries.forEach((ed, i) => {
                const div = document.createElement('div');
                div.className = 'poke-editor-entry';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'poke-name';
                nameSpan.textContent = ed.name;

                const addrSpan = document.createElement('span');
                addrSpan.className = 'poke-editor-addr';
                addrSpan.textContent = hex16(ed.addr);

                const input = document.createElement('input');
                input.type = 'text';
                input.maxLength = ed.type === 'word' ? 4 : 2;
                input.style.width = ed.type === 'word' ? '50px' : '30px';
                input.title = ed.type === 'word' ? 'Word value (little-endian)' : 'Byte value';
                input.id = 'pokeEditor_' + i;

                const writeEditorValue = () => {
                    if (!readMemory) return;
                    const val = parsePokeValue(input.value);
                    if (ed.type === 'word') {
                        writePoke(ed.addr, val & 0xff);
                        writePoke((ed.addr + 1) & 0xffff, (val >> 8) & 0xff);
                    } else {
                        writePoke(ed.addr, val & 0xff);
                    }
                };

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') { writeEditorValue(); input.blur(); }
                });
                input.addEventListener('blur', writeEditorValue);

                const max = ed.type === 'word' ? 0xffff : 0xff;
                const digits = ed.type === 'word' ? 4 : 2;
                const spinDiv = document.createElement('span');
                spinDiv.className = 'poke-editor-spin';
                const spinUp = document.createElement('button');
                spinUp.textContent = '\u25B2';
                spinUp.title = 'Increment';
                spinUp.addEventListener('click', () => {
                    if (!readMemory) return;
                    const cur = parsePokeValue(input.value) & max;
                    const nv = cur >= max ? 0 : cur + 1;
                    input.value = digits === 4 ? hex16(nv) : hex8(nv);
                    writeEditorValue();
                });
                const spinDown = document.createElement('button');
                spinDown.textContent = '\u25BC';
                spinDown.title = 'Decrement';
                spinDown.addEventListener('click', () => {
                    if (!readMemory) return;
                    const cur = parsePokeValue(input.value) & max;
                    const nv = cur <= 0 ? max : cur - 1;
                    input.value = digits === 4 ? hex16(nv) : hex8(nv);
                    writeEditorValue();
                });
                spinDiv.appendChild(spinUp);
                spinDiv.appendChild(spinDown);

                const removeBtn = document.createElement('button');
                removeBtn.className = 'poke-remove';
                removeBtn.textContent = '\u00d7';
                removeBtn.title = 'Remove editor';
                removeBtn.addEventListener('click', () => {
                    pokeEditorEntries.splice(i, 1);
                    renderPokeManager();
                });

                div.appendChild(removeBtn);
                div.appendChild(nameSpan);
                div.appendChild(addrSpan);
                div.appendChild(input);
                div.appendChild(spinDiv);
                pokeEditors.appendChild(div);

                pokeReadEditorValue(ed, input);
            });
        }

        pokeUpdateToggleAll();
    }

    // ========== Event bindings ==========

    btnPokeLoad.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => showMessage('Failed to read file: ' + file.name, 'error');
            reader.onload = () => {
                try {
                    loadPokeJSON(reader.result);
                    showMessage('Pokes loaded: ' + file.name);
                } catch (e) {
                    showMessage('Error loading pokes: ' + e.message, 'error');
                }
            };
            reader.readAsText(file);
        }, { once: true });
        input.click();
    });

    btnPokeClear.addEventListener('click', pokeClearAll);

    pokeToggleAll.addEventListener('change', (e) => {
        const enable = e.target.checked;
        for (let i = 0; i < pokeEntries.length; i++) {
            pokeToggle(i, enable);
        }
        renderPokeManager();
    });

    btnEditorReadAll.addEventListener('click', pokeReadAllEditors);

    btnPokeAdd.addEventListener('click', () => {
        const name = pokeAddName.value.trim();
        const addr = pokeAddAddr.value.trim();
        const normal = pokeAddNormal.value.trim();
        const poke = pokeAddPoke.value.trim();
        if (!name || !addr || !normal || !poke) return;

        const patch = {
            addr: parsePokeValue(addr),
            normal: parsePokeValue(normal) & 0xff,
            poke: parsePokeValue(poke) & 0xff
        };

        const existing = pokeEntries.find(e => e.name === name);
        if (existing) {
            existing.patches.push(patch);
            if (existing.enabled) writePoke(patch.addr, patch.poke);
        } else {
            pokeEntries.push({ name, enabled: false, patches: [patch] });
        }

        pokeAddAddr.value = '';
        pokeAddNormal.value = '';
        pokeAddPoke.value = '';
        renderPokeManager();
    });

    btnEditorAdd.addEventListener('click', () => {
        const name = editorAddName.value.trim();
        const addr = editorAddAddr.value.trim();
        const type = editorAddType.value;
        if (!name || !addr) return;

        pokeEditorEntries.push({
            name,
            addr: parsePokeValue(addr),
            type
        });

        editorAddName.value = '';
        editorAddAddr.value = '';
        renderPokeManager();
    });

    btnPokeSave.addEventListener('click', () => {
        if (pokeEntries.length === 0 && pokeEditorEntries.length === 0) return;

        const data = { game: pokeGameName };
        if (pokeEntries.length > 0) {
            data.pokes = pokeEntries.map(e => ({
                name: e.name,
                enabled: e.enabled,
                patches: e.patches.map(p => [
                    hex16(p.addr),
                    hex8(p.normal),
                    hex8(p.poke)
                ])
            }));
        }
        if (pokeEditorEntries.length > 0) {
            data.editors = pokeEditorEntries.map(e => ({
                name: e.name,
                addr: hex16(e.addr),
                type: e.type
            }));
        }

        const json = JSON.stringify(data, null, 4);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (pokeGameName || 'pokes').replace(/[^a-zA-Z0-9_-]/g, '_') + '.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    pokeGameLabel.addEventListener('click', () => {
        const name = prompt('Game name:', pokeGameName);
        if (name !== null) {
            pokeGameName = name.trim();
            pokeGameLabel.textContent = pokeGameName;
        }
    });

    // Initial render
    renderPokeManager();

    // Public API
    return {
        loadPokeJSON,
        pokeClearAll,
        getPokeData() {
            return {
                game: pokeGameName,
                pokes: pokeEntries.map(e => ({
                    name: e.name,
                    enabled: e.enabled,
                    patches: e.patches.map(p => [
                        hex16(p.addr),
                        hex8(p.normal),
                        hex8(p.poke)
                    ])
                })),
                editors: pokeEditorEntries.map(e => ({
                    name: e.name,
                    addr: hex16(e.addr),
                    type: e.type
                }))
            };
        },
        hasData() {
            return pokeEntries.length > 0 || pokeEditorEntries.length > 0;
        }
    };
}
