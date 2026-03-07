// Z80 Opcodes Reference Table — self-contained UI module
import { z80Opcodes } from '../debug/opcodes-data.js';

export function initOpcodesTable() {
    function renderOpcodes(filter = '', group = 'all', cycles = 'all', sortBy = 'mnemonic') {
        const tbody = document.getElementById('opcodesBody');
        const filterLower = filter.toLowerCase();
        const filtered = z80Opcodes
            .filter(op => {
                const matchesFilter = !filter ||
                    op.m.toLowerCase().includes(filterLower) ||
                    op.d.toLowerCase().includes(filterLower) ||
                    (op.o && op.o.toLowerCase().includes(filterLower));
                const matchesGroup = group === 'all' || op.g === group;
                const matchesCycles = cycles === 'all' || op.c.split('/').some(c => c.trim() === cycles);
                return matchesFilter && matchesGroup && matchesCycles;
            })
            .sort((a, b) => {
                if (sortBy === 'opcode') {
                    const oCmp = (a.o || 'ZZ').localeCompare(b.o || 'ZZ');
                    if (oCmp !== 0) return oCmp;
                    return a.m.localeCompare(b.m);
                }
                // Default: sort by mnemonic
                const mCmp = a.m.localeCompare(b.m);
                if (mCmp !== 0) return mCmp;
                return (a.o || '').localeCompare(b.o || '');
            });
        const rows = filtered.map(op => `<tr>
                    <td class="op-mnemonic${op.u ? ' undoc' : ''}">${op.m}</td>
                    <td class="op-opcode">${op.o || ''}</td>
                    <td class="op-bytes">${op.b}</td>
                    <td class="op-cycles">${op.c}</td>
                    <td class="op-flags">${op.f}</td>
                    <td class="op-desc">${op.d}</td>
                </tr>`).join('');
        tbody.innerHTML = rows;
    }

    // Populate T-states dropdown with unique values
    const cyclesSet = new Set();
    z80Opcodes.forEach(op => {
        // Handle both simple (e.g., '4') and conditional (e.g., '17/10') cycles
        op.c.split('/').forEach(c => cyclesSet.add(c.trim()));
    });
    const cyclesSorted = [...cyclesSet].sort((a, b) => parseInt(a) - parseInt(b));
    const opcodeCyclesSelect = document.getElementById('opcodeCycles');
    cyclesSorted.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c + 'T';
        opcodeCyclesSelect.appendChild(opt);
    });

    function getOpcodeFilters() {
        return {
            search: document.getElementById('opcodeSearch').value,
            group: document.getElementById('opcodeGroup').value,
            cycles: document.getElementById('opcodeCycles').value,
            sort: document.getElementById('opcodeSort').value
        };
    }

    function applyOpcodeFilters() {
        const f = getOpcodeFilters();
        renderOpcodes(f.search, f.group, f.cycles, f.sort);
    }

    document.getElementById('opcodeSearch').addEventListener('input', applyOpcodeFilters);
    document.getElementById('opcodeGroup').addEventListener('change', applyOpcodeFilters);
    document.getElementById('opcodeCycles').addEventListener('change', applyOpcodeFilters);
    document.getElementById('opcodeSort').addEventListener('change', applyOpcodeFilters);

    // Initial render
    renderOpcodes();
}
