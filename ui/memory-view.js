// Memory view — right panel hex dump + left panel hex dump,
// inline byte editor, mouse selection, scroll wheel
// Extracted from index.html

import { hex8, hex16 } from '../core/utils.js';
import { REGION_TYPES } from '../debug/managers.js';

export function initMemoryView({
    getSpectrum, getDisasm, regionManager,
    getMemoryViewAddress, getLeftMemoryViewAddress,
    getMemorySnapshot, updateDebugger, getGoToMemoryAddress,
    MEMORY_LINES, LEFT_MEMORY_LINES, BYTES_PER_LINE
}) {
    // DOM elements
    const memoryView = document.getElementById('memoryView');
    const leftMemoryView = document.getElementById('leftMemoryView');

    // Internal state
    let memoryEditingAddr = null;
    let activeEditInput = null;
    let memSelectionStart = null;
    let memSelectionEnd = null;
    let memIsSelecting = false;

    function updateMemoryView() {
        const spectrum = getSpectrum();
        const memorySnapshot = getMemorySnapshot();
        const disasm = getDisasm();
        const memoryViewAddress = getMemoryViewAddress();
        if (!spectrum.memory || memoryEditingAddr !== null) return;

        let html = '';
        for (let line = 0; line < MEMORY_LINES; line++) {
            const lineAddr = (memoryViewAddress + line * BYTES_PER_LINE) & 0xffff;

            // Address
            html += `<div class="memory-line"><span class="memory-addr" data-addr="${lineAddr}">${hex16(lineAddr)}</span>`;

            // Hex bytes
            html += '<span class="memory-hex">';
            for (let i = 0; i < BYTES_PER_LINE; i++) {
                const addr = (lineAddr + i) & 0xffff;
                const byte = spectrum.memory.read(addr);
                const changed = memorySnapshot && memorySnapshot[addr] !== byte;
                let cls = changed ? 'memory-byte changed' : 'memory-byte';
                // Check for breakpoints
                if (spectrum.hasBreakpointAt(addr)) {
                    cls += ' has-bp';
                }
                // Check for watchpoints
                const wps = spectrum.getWatchpoints();
                for (const wp of wps) {
                    if (addr >= wp.start && addr <= wp.end) {
                        if (wp.read && wp.write) cls += ' has-wp';
                        else if (wp.read) cls += ' has-wp-r';
                        else if (wp.write) cls += ' has-wp-w';
                        break;
                    }
                }
                // Check for memory regions
                const region = regionManager.get(addr);
                if (region && region.type !== REGION_TYPES.CODE) {
                    cls += ` region-${region.type}`;
                }
                const lowByte = byte & 0x7F;
                const isPrintableLow = lowByte >= 32 && lowByte < 127;
                let asciiChar = '';
                if (byte >= 32 && byte < 127) {
                    asciiChar = ` '${String.fromCharCode(byte)}'`;
                } else if ((byte & 0x80) && isPrintableLow) {
                    asciiChar = ` '${String.fromCharCode(lowByte)}'+$80`;
                }
                let tip = `Addr: ${hex16(addr)} (${addr})\nValue: ${hex8(byte)} (${byte})${asciiChar}`;
                if (region && region.type !== REGION_TYPES.CODE) {
                    tip += `\nRegion: ${region.type}${region.comment ? ' - ' + region.comment : ''}`;
                }
                // Add disassembly (if disassembler available)
                if (disasm) {
                    const instr = disasm.disassemble(addr);
                    const bytes = instr.bytes.map(b => hex8(b)).join(' ');
                    tip += `\n${instr.mnemonic} [${bytes}]`;
                }
                html += `<span class="${cls}" data-addr="${addr}" title="${tip}">${hex8(byte)}</span>`;
            }
            html += '</span>';

            // ASCII representation
            html += '<span class="memory-ascii">';
            for (let i = 0; i < BYTES_PER_LINE; i++) {
                const addr = (lineAddr + i) & 0xffff;
                const byte = spectrum.memory.read(addr);
                const isPrintable = byte >= 32 && byte < 127;
                const char = isPrintable ? String.fromCharCode(byte) : '.';
                const changed = memorySnapshot && memorySnapshot[addr] !== byte;
                const asciiRegion = regionManager.get(addr);
                let cls = isPrintable ? 'printable' : '';
                if (changed) cls += ' changed';
                if (asciiRegion && asciiRegion.type === REGION_TYPES.TEXT) {
                    cls += ' region-text';
                }
                html += `<span class="${cls.trim()}">${char}</span>`;
            }
            html += '</span></div>';
        }

        memoryView.innerHTML = html;

        // Reapply selection if active
        if (memSelectionStart !== null) {
            updateMemSelection();
        }
    }

    function finishCurrentEdit(save = true) {
        if (activeEditInput && memoryEditingAddr !== null) {
            const spectrum = getSpectrum();
            if (save) {
                const newValue = parseInt(activeEditInput.value, 16);
                if (!isNaN(newValue) && newValue >= 0 && newValue <= 255) {
                    spectrum.memory.writeDebug(memoryEditingAddr, newValue);
                }
            }
            activeEditInput = null;
            memoryEditingAddr = null;
            updateDebugger(); // Refresh both memory and disassembly
        }
    }

    function startByteEdit(byteElement) {
        // Finish any current edit first (this rebuilds DOM via updateDebugger)
        if (memoryEditingAddr !== null) {
            const addr = parseInt(byteElement.dataset.addr);
            finishCurrentEdit(true);
            // Re-query: finishCurrentEdit triggers DOM rebuild, old element is detached
            byteElement = memoryView.querySelector(`.memory-byte[data-addr="${addr}"]`);
            if (!byteElement) return;
        }

        const spectrum = getSpectrum();
        const addr = parseInt(byteElement.dataset.addr);
        memoryEditingAddr = addr;
        const currentValue = spectrum.memory.read(addr);

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'memory-edit-input';
        input.value = hex8(currentValue);
        input.maxLength = 2;
        activeEditInput = input;

        byteElement.textContent = '';
        byteElement.appendChild(input);

        // Use setTimeout to ensure focus happens after DOM update
        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishCurrentEdit(true);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishCurrentEdit(false);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                const nextAddr = e.shiftKey ? (addr - 1) & 0xffff : (addr + 1) & 0xffff;
                finishCurrentEdit(true);
                setTimeout(() => {
                    const nextByte = memoryView.querySelector(`[data-addr="${nextAddr}"]`);
                    if (nextByte) startByteEdit(nextByte);
                }, 0);
            }
        });

        input.addEventListener('blur', () => {
            // Save on blur (focus lost to non-byte click, etc.)
            // finishCurrentEdit is idempotent — safe if already called by mousedown
            finishCurrentEdit(true);
        });
    }

    function clearMemSelection() {
        memSelectionStart = null;
        memSelectionEnd = null;
        memIsSelecting = false;
        memoryView.querySelectorAll('.memory-byte.selected').forEach(el => {
            el.classList.remove('selected');
        });
    }

    function updateMemSelection() {
        if (memSelectionStart === null) return;

        const start = Math.min(memSelectionStart, memSelectionEnd ?? memSelectionStart);
        const end = Math.max(memSelectionStart, memSelectionEnd ?? memSelectionStart);

        memoryView.querySelectorAll('.memory-byte').forEach(el => {
            const addr = parseInt(el.dataset.addr, 10);
            if (addr >= start && addr <= end) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }

    // Mouse event handlers
    memoryView.addEventListener('mousedown', (e) => {
        const byteEl = e.target.closest('.memory-byte');
        if (byteEl && !e.target.classList.contains('memory-edit-input')) {
            // Right-click: don't start selection, let context menu handle it
            if (e.button === 2) return;

            // Left-click: start selection or edit on double-click
            if (e.button === 0) {
                e.preventDefault();

                // Finish any active edit before starting a new interaction
                if (memoryEditingAddr !== null) {
                    finishCurrentEdit(true);
                }

                const addr = parseInt(byteEl.dataset.addr, 10);

                // Start selection
                memSelectionStart = addr;
                memSelectionEnd = addr;
                memIsSelecting = true;
                updateMemSelection();
            }
        }
    });

    memoryView.addEventListener('mousemove', (e) => {
        if (!memIsSelecting) return;

        const byteEl = e.target.closest('.memory-byte');
        if (byteEl) {
            const addr = parseInt(byteEl.dataset.addr, 10);
            memSelectionEnd = addr;
            updateMemSelection();
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (memIsSelecting) {
            memIsSelecting = false;
            // If single click (no drag), treat as edit
            if (memSelectionStart === memSelectionEnd && e.button === 0) {
                const byteEl = memoryView.querySelector(`.memory-byte[data-addr="${memSelectionStart}"]`);
                if (byteEl && !e.target.classList.contains('memory-edit-input')) {
                    clearMemSelection();
                    startByteEdit(byteEl);
                }
            }
        }
    });

    // Scroll wheel navigation
    memoryView.addEventListener('wheel', (e) => {
        e.preventDefault();
        const goToMemoryAddress = getGoToMemoryAddress();
        const memoryViewAddress = getMemoryViewAddress();
        // Scroll by 3 lines per wheel tick
        const scrollLines = e.deltaY > 0 ? 3 : -3;
        goToMemoryAddress(memoryViewAddress + scrollLines * BYTES_PER_LINE);
    }, { passive: false });

    // Left panel memory view
    function updateLeftMemoryView() {
        const spectrum = getSpectrum();
        const leftMemoryViewAddress = getLeftMemoryViewAddress();
        if (!spectrum.memory) {
            leftMemoryView.innerHTML = '<div class="memory-line">No memory</div>';
            return;
        }

        let html = '';
        for (let line = 0; line < LEFT_MEMORY_LINES; line++) {
            const lineAddr = (leftMemoryViewAddress + line * BYTES_PER_LINE) & 0xffff;

            // Address
            html += `<div class="memory-line"><span class="memory-addr" data-addr="${lineAddr}">${hex16(lineAddr)}</span>`;

            // Hex bytes
            html += '<span class="memory-hex">';
            for (let i = 0; i < BYTES_PER_LINE; i++) {
                const addr = (lineAddr + i) & 0xffff;
                const val = spectrum.memory.read(addr);
                let cls = 'memory-byte';
                // Check for memory regions
                const region = regionManager.get(addr);
                if (region && region.type !== REGION_TYPES.CODE) {
                    cls += ` region-${region.type}`;
                }
                html += `<span class="${cls}" data-addr="${addr}">${hex8(val)}</span>`;
            }
            html += '</span>';

            // ASCII representation (styled like right panel)
            html += '<span class="memory-ascii">';
            for (let i = 0; i < BYTES_PER_LINE; i++) {
                const addr = (lineAddr + i) & 0xffff;
                const byte = spectrum.memory.read(addr);
                const isPrintable = byte >= 32 && byte < 127;
                const char = isPrintable ? String.fromCharCode(byte) : '.';
                const asciiRegion = regionManager.get(addr);
                let cls = isPrintable ? 'printable' : '';
                if (asciiRegion && asciiRegion.type === REGION_TYPES.TEXT) {
                    cls += ' region-text';
                }
                html += `<span class="${cls.trim()}">${char}</span>`;
            }
            html += '</span></div>';
        }

        leftMemoryView.innerHTML = html;
    }

    return {
        updateMemoryView,
        updateLeftMemoryView,
        clearMemSelection,
        getMemSelection: () => ({ start: memSelectionStart, end: memSelectionEnd }),
        getMemoryEditingAddr: () => memoryEditingAddr,
        startByteEdit,
        finishCurrentEdit
    };
}
