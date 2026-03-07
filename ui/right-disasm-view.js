// Right panel disassembly view (never auto-follows PC)
// Extracted from index.html

import { hex8, hex16, escapeHtml } from '../core/utils.js';

export function initRightDisasmView({
    getSpectrum, getDisasm,
    subroutineManager, labelManager, foldManager,
    getCurrentPage, formatAddrColumn, replaceMnemonicAddresses,
    formatMnemonic, isFlowBreak, disassembleWithFolding,
    getRightDisasmViewAddress, getLabelDisplayMode,
    DISASM_LINES
}) {
    const rightDisassemblyView = document.getElementById('rightDisassemblyView');

    function updateRightDisassemblyView() {
        const spectrum = getSpectrum();
        const disasm = getDisasm();
        if (!spectrum.memory || !disasm) {
            rightDisassemblyView.innerHTML = '<div class="disasm-line">No code</div>';
            return;
        }

        // Right panel doesn't auto-follow - use set address or 0
        const rightDisasmViewAddress = getRightDisasmViewAddress();
        let viewAddr = rightDisasmViewAddress !== null ? rightDisasmViewAddress : 0;

        const pc = spectrum.cpu ? spectrum.cpu.pc : 0;
        const showTstates = document.getElementById('chkRightShowTstates')?.checked || false;
        const labelMode = getLabelDisplayMode();

        const lines = disassembleWithFolding(viewAddr, DISASM_LINES, true);

        rightDisassemblyView.innerHTML = lines.map((line, idx) => {
            // Handle fold summary lines
            if (line.isFoldSummary) {
                const icon = '▸';
                const typeClass = line.foldType === 'user' ? 'user-fold' : '';
                return `<div class="disasm-fold-summary ${typeClass}" data-fold-addr="${line.addr}">
                    <span class="disasm-fold-toggle" data-fold-addr="${line.addr}">${icon}</span>
                    <span class="fold-name">${escapeHtml(line.foldName)}</span>
                    <span class="fold-stats">(${line.byteCount} bytes)</span>
                </div>`;
            }

            const bytesStr = line.bytes.map(b => hex8(b)).join(' ');
            const isCurrent = line.addr === pc;
            const hasBp = spectrum.hasBreakpoint(line.addr);
            const hasDisabledBp = !hasBp && spectrum.hasDisabledBreakpoint(line.addr);
            const classes = ['disasm-line'];
            if (isCurrent) classes.push('current');
            if (hasBp) classes.push('breakpoint');
            if (line.isData) classes.push('data-line');
            if (isFlowBreak(line.mnemonic)) classes.push('flow-break');

            const timing = (showTstates && !line.isData) ? disasm.getTiming(line.bytes) : '';
            const timingHtml = timing ? `<span class="disasm-tstates">${timing}</span>` : '';
            const addrInfo = formatAddrColumn(line.addr, labelMode);
            const mnemonicWithLabels = line.isData ? line.mnemonic : replaceMnemonicAddresses(line.mnemonic, labelMode, line.addr);

            // Subroutine separator with fold toggle (same as left panel)
            let beforeHtml = '';
            const sub = subroutineManager.get(line.addr);
            if (sub) {
                const subName = sub.name || labelManager.get(line.addr, getCurrentPage(line.addr))?.name || `sub_${hex16(line.addr)}`;
                const canFold = sub.endAddress !== null;
                const foldIcon = canFold ? `<span class="disasm-fold-toggle" data-fold-addr="${line.addr}" title="Click to collapse">▾</span>` : '';
                beforeHtml += `<span class="disasm-sub-separator">; ═══════════════════════════════════════════════════════════════</span>`;
                beforeHtml += `<span class="disasm-sub-name">; ${foldIcon}${subName}</span>`;
                if (sub.comment) {
                    beforeHtml += `<span class="disasm-sub-comment">; ${escapeHtml(sub.comment)}</span>`;
                }
                beforeHtml += `<span class="disasm-sub-separator">; ───────────────────────────────────────────────────────────────</span>`;
            }

            // User fold start marker
            const userFold = foldManager.getUserFold(line.addr);
            if (userFold) {
                const foldName = userFold.name || `fold_${hex16(line.addr)}`;
                const foldIcon = `<span class="disasm-fold-toggle" data-fold-addr="${line.addr}" title="Click to collapse">▾</span>`;
                beforeHtml += `<span class="disasm-user-fold-start">; ┌─── ${foldIcon}${escapeHtml(foldName)} ───</span>`;
            }

            return `${beforeHtml}<div class="${classes.join(' ')}" data-addr="${line.addr}">
                <span class="disasm-bp ${hasBp ? 'active' : hasDisabledBp ? 'disabled' : ''}" data-addr="${line.addr}">•</span>
                <span class="disasm-addr">${addrInfo.html}</span>
                <span class="disasm-bytes">${bytesStr}</span>
                ${timingHtml}
                <span class="disasm-mnemonic">${formatMnemonic(mnemonicWithLabels)}</span>
            </div>`;
        }).join('');
    }

    return { updateRightDisassemblyView };
}
