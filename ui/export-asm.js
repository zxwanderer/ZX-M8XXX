// export-asm.js — Export disassembly as sjasmplus-compatible ASM file (extracted from index.html)
import { hex8 as rawHex8, hex16 as rawHex16 } from '../core/utils.js';

export function initExportAsm({ getExportSnapshot, getCpuState, getMemoryState, getMachineType, getProfile,
                                 getAutoMapData, getPagingState, getCurrentBank, readMemory,
                                 regionManager, labelManager, getDisasm, is128kCompat, appVersion }) {

    // Assembly-style hex with '$' prefix
    const hex16 = v => '$' + rawHex16(v);
    const hex8 = v => '$' + rawHex8(v);

    function exportDisassembly() {
        const SCREEN_START = 0x4000;
        const SCREEN_END = 0x5B00;  // Screen memory ends at 5AFF, attributes at 5B00

        const lines = [];
        const now = new Date();
        const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

        // Use snapped state if available, otherwise current state
        const exportSnapshot = getExportSnapshot();
        const usingSnapshot = exportSnapshot !== null;
        const cpu = usingSnapshot ? exportSnapshot.cpu : getCpuState();

        // Paging state (for 128K/Pentagon)
        const paging = usingSnapshot && exportSnapshot.paging
            ? exportSnapshot.paging
            : getPagingState();

        // Memory read function - uses snapshot if available
        const readMem = usingSnapshot
            ? (addr) => exportSnapshot.memory[addr & 0xFFFF]
            : (addr) => readMemory(addr);

        // Build register pairs from individual registers
        const af = (cpu.a << 8) | cpu.f;
        const bc = (cpu.b << 8) | cpu.c;
        const de = (cpu.d << 8) | cpu.e;
        const hl = (cpu.h << 8) | cpu.l;
        const af_ = (cpu.a_ << 8) | cpu.f_;
        const bc_ = (cpu.b_ << 8) | cpu.c_;
        const de_ = (cpu.d_ << 8) | cpu.e_;
        const hl_ = (cpu.h_ << 8) | cpu.l_;
        const stackDepth = 16;
        const sp = cpu.sp;

        // Calculate port $7FFD value for 128K paging
        // Bits 0-2: RAM bank, Bit 3: screen (0=bank5, 1=bank7), Bit 4: ROM, Bit 5: lock
        const port7FFD = (paging.ramBank & 0x07) |
                         (paging.screenBank === 7 ? 0x08 : 0x00) |
                         (paging.romBank ? 0x10 : 0x00) |
                         (paging.pagingDisabled ? 0x20 : 0x00);

        const machineType = getMachineType();

        // DEVICE directive based on machine type
        const deviceMap = {
            '48k': 'ZXSPECTRUM48',
            '128k': 'ZXSPECTRUM128',
            '+2': 'ZXSPECTRUM128',      // +2 uses 128K memory model
            '+2a': 'ZXSPECTRUM128',     // +2A uses 128K memory model
            'pentagon': 'ZXSPECTRUM128'  // Pentagon uses 128K memory model
        };
        const device = deviceMap[machineType] || 'ZXSPECTRUM48';

        // Header with DEVICE
        lines.push('; Disassembly exported from ZX-M8XXX v' + appVersion);
        lines.push(`; Date: ${timestamp}`);
        lines.push(`; Machine: ${machineType.toUpperCase()}`);
        if (usingSnapshot) {
            lines.push(`; Using SNAPSHOT from: ${exportSnapshot.timestamp || 'unknown'}`);
            lines.push('; NOTE: Byte values are from snapshot, but instruction disassembly');
            lines.push(';       uses current memory (may differ if memory changed)');
        }
        lines.push(';');
        lines.push('; CPU State:');
        lines.push(`; PC=${hex16(cpu.pc)}  SP=${hex16(cpu.sp)}  IM=${cpu.im}  IFF1=${cpu.iff1 ? 1 : 0}  IFF2=${cpu.iff2 ? 1 : 0}`);
        lines.push(`; AF=${hex16(af)}  BC=${hex16(bc)}  DE=${hex16(de)}  HL=${hex16(hl)}`);
        lines.push(`; IX=${hex16(cpu.ix)}  IY=${hex16(cpu.iy)}  I=${hex8(cpu.i)}  R=${hex8(cpu.r)}`);
        lines.push(`; AF'=${hex16(af_)}  BC'=${hex16(bc_)}  DE'=${hex16(de_)}  HL'=${hex16(hl_)}`);
        // Add paging info for 128K/Pentagon
        if (machineType !== '48k') {
            lines.push(`;`);
            lines.push(`; Paging: RAM=${paging.ramBank}  ROM=${paging.romBank}  Screen=${paging.screenBank}  Lock=${paging.pagingDisabled ? 1 : 0}`);
            lines.push(`; Port $7FFD = ${hex8(port7FFD)}`);
        }
        lines.push(';');
        lines.push('; Stack contents (SP points to top, growing down):');
        let stackLine = '; SP->';
        for (let i = 0; i < stackDepth; i++) {
            const addr = (sp + i * 2) & 0xFFFF;
            const lo = readMem(addr);
            const hi = readMem((addr + 1) & 0xFFFF);
            const word = lo | (hi << 8);
            if (i > 0 && i % 8 === 0) {
                lines.push(stackLine);
                stackLine = ';     ';
            }
            stackLine += ` ${hex16(word)}`;
        }
        lines.push(stackLine);
        lines.push(';');
        lines.push('');
        lines.push(`    DEVICE ${device}`);
        lines.push('    OPT --syntax=abf  ; allow undocumented instructions');
        lines.push('');

        // Get all mapped regions and heatmap data
        const autoMapData = getAutoMapData();
        const allRegions = regionManager.getAll();

        // Build address set of all addresses with activity (execute, read, write)
        // or marked regions
        const activeAddrs = new Set();
        const executedAddrs = new Set();  // Track which addresses were executed

        // Add executed addresses
        for (const key of autoMapData.executed.keys()) {
            const addr = parseInt(key, 10);  // Parse address (ignores ":page" suffix)
            if (!isNaN(addr) && addr >= 0 && addr < 65536) {
                activeAddrs.add(addr);
                executedAddrs.add(addr);  // Remember this was executed
            }
        }

        // Add read addresses
        for (const key of autoMapData.read.keys()) {
            const addr = parseInt(key, 10);
            if (!isNaN(addr) && addr >= 0 && addr < 65536) {
                activeAddrs.add(addr);
            }
        }

        // Add written addresses
        for (const key of autoMapData.written.keys()) {
            const addr = parseInt(key, 10);
            if (!isNaN(addr) && addr >= 0 && addr < 65536) {
                activeAddrs.add(addr);
            }
        }

        // Add addresses from marked regions
        for (const region of allRegions) {
            for (let a = region.start; a <= region.end; a++) {
                activeAddrs.add(a);
            }
        }

        // Add diagnostic info to header
        lines.push(`; Auto-Map data: ${autoMapData.executed.size} executed, ${autoMapData.read.size} read, ${autoMapData.written.size} written`);
        lines.push(`; Regions: ${allRegions.length} marked regions`);
        lines.push(`; Parsed: ${executedAddrs.size} unique executed addresses`);
        lines.push('');


        if (activeAddrs.size === 0) {
            alert('No mapped regions or heatmap data to export.\nRun the program with Auto-Map tracking enabled first.');
            return;
        }

        // Sort addresses and group into contiguous blocks
        const sortedAddrs = Array.from(activeAddrs).sort((a, b) => a - b);

        // Check if there's executed code in ROM
        const execInROM = Array.from(executedAddrs).filter(a => a < SCREEN_START).length;
        const execInRAM = Array.from(executedAddrs).filter(a => a >= SCREEN_END).length;

        // Ask user if they want to include ROM when ROM code was executed
        let includeROM = false;
        if (execInROM > 0 && execInRAM === 0) {
            includeROM = confirm(`All ${execInROM} executed addresses are in ROM (0000-3FFF).\n\nInclude ROM disassembly in export?`);
        } else if (execInROM > 0) {
            includeROM = confirm(`${execInROM} executed addresses are in ROM.\n\nInclude ROM disassembly in export?`);
        }

        // Check if user wants to include addresses and bytes (from checkbox)
        const includeAddrBytes = document.getElementById('chkExportAddrBytes').checked;
        const dedupLoops = document.getElementById('chkExportDedupLoops').checked;

        // Detect unrolled loops - finds repeating byte patterns in code
        // Returns {patternBytes: [...], repeatCount, totalBytes} or null if no loop found
        // Detect repeating pattern in an instruction array (for nested loop detection)
        function detectPatternInArray(instructions, minRepeats = 3, maxPatternBytes = 512) {
            if (instructions.length < minRepeats * 2) return null;

            let bestResult = null;
            let bestSavings = 0;

            for (let patternLen = 1; patternLen <= Math.min(256, Math.floor(instructions.length / minRepeats)); patternLen++) {
                // Get pattern bytes
                let patternBytes = [];
                for (let i = 0; i < patternLen; i++) {
                    patternBytes = patternBytes.concat(instructions[i].bytes);
                }
                if (patternBytes.length > maxPatternBytes) break;

                // Count repetitions
                let repeatCount = 1;
                let instrIdx = patternLen;

                while (instrIdx + patternLen <= instructions.length) {
                    let matches = true;
                    for (let i = 0; i < patternLen && matches; i++) {
                        const patternInstr = instructions[i];
                        const testInstr = instructions[instrIdx + i];
                        if (patternInstr.bytes.length !== testInstr.bytes.length) {
                            matches = false;
                        } else {
                            for (let b = 0; b < patternInstr.bytes.length; b++) {
                                if (patternInstr.bytes[b] !== testInstr.bytes[b]) {
                                    matches = false;
                                    break;
                                }
                            }
                        }
                    }
                    if (matches) {
                        repeatCount++;
                        instrIdx += patternLen;
                    } else {
                        break;
                    }
                }

                if (repeatCount >= minRepeats) {
                    const totalBytes = patternBytes.length * repeatCount;
                    const savings = totalBytes - patternBytes.length;
                    if (savings > bestSavings) {
                        bestSavings = savings;
                        bestResult = {
                            patternInstructions: instructions.slice(0, patternLen),
                            patternBytes,
                            repeatCount,
                            totalBytes,
                            instrCount: patternLen * repeatCount
                        };
                    }
                }
            }

            return bestResult;
        }

        function detectUnrolledLoop(startAddr, blockEnd, minRepeats = 3, maxPatternBytes = 512) {
            // First, disassemble to find instruction boundaries
            const instructions = [];
            let addr = startAddr;
            const maxScanBytes = Math.min(4096, (blockEnd - startAddr + 1));
            let scannedBytes = 0;

            while (scannedBytes < maxScanBytes && addr <= blockEnd) {
                // Stop at labels (they break the loop pattern)
                if (addr !== startAddr && labelManager.get(addr)) break;
                // Stop at non-code region boundaries (data/text regions break the pattern)
                const region = regionManager.get(addr);
                if (region && region.start === addr && addr !== startAddr && region.type !== 'code') break;

                const dis = getDisasm().disassemble(addr);
                const bytes = [];
                for (let i = 0; i < dis.length; i++) {
                    bytes.push(readMem((addr + i) & 0xFFFF));
                }
                instructions.push({ addr, bytes, length: dis.length, mnemonic: dis.mnemonic });
                scannedBytes += dis.length;
                addr += dis.length;
            }

            if (instructions.length < minRepeats * 2) return null;

            // Try pattern lengths from 1 instruction up to maxPatternBytes worth
            let bestResult = null;
            let bestSavings = 0;

            for (let patternLen = 1; patternLen <= Math.min(256, Math.floor(instructions.length / minRepeats)); patternLen++) {
                // Get pattern bytes
                let patternBytes = [];
                for (let i = 0; i < patternLen; i++) {
                    patternBytes = patternBytes.concat(instructions[i].bytes);
                }
                if (patternBytes.length > maxPatternBytes) break;

                // Count repetitions
                let repeatCount = 1;
                let instrIdx = patternLen;

                while (instrIdx + patternLen <= instructions.length) {
                    // Compare next patternLen instructions
                    let matches = true;
                    for (let i = 0; i < patternLen && matches; i++) {
                        const patternInstr = instructions[i];
                        const testInstr = instructions[instrIdx + i];
                        if (patternInstr.bytes.length !== testInstr.bytes.length) {
                            matches = false;
                        } else {
                            for (let b = 0; b < patternInstr.bytes.length; b++) {
                                if (patternInstr.bytes[b] !== testInstr.bytes[b]) {
                                    matches = false;
                                    break;
                                }
                            }
                        }
                    }
                    if (matches) {
                        repeatCount++;
                        instrIdx += patternLen;
                    } else {
                        break;
                    }
                }

                if (repeatCount >= minRepeats) {
                    const totalBytes = patternBytes.length * repeatCount;
                    const savings = totalBytes - patternBytes.length; // Bytes saved by not repeating
                    if (savings > bestSavings) {
                        bestSavings = savings;
                        bestResult = {
                            patternInstructions: instructions.slice(0, patternLen),
                            patternBytes,
                            repeatCount,
                            totalBytes
                        };
                    }
                }
            }

            return bestResult;
        }

        // Filter out screen memory, and optionally ROM
        // Keep: addresses >= 0x5B00 (above screen, in RAM)
        // Optionally keep: ROM (< 0x4000)
        // Always exclude: screen (0x4000-0x5AFF)
        const filteredAddrs = sortedAddrs.filter(addr => {
            if (addr >= SCREEN_END) return true;  // Above screen - always include
            if (addr < SCREEN_START && includeROM) return true;  // ROM - include if requested
            return false;  // Screen memory - exclude
        });

        // Create Set for O(1) lookup when checking label references
        const exportedAddrs = new Set(filteredAddrs);
        // Track external labels (referenced but not in exported range)
        const externalLabels = new Map();  // addr -> label name

        if (filteredAddrs.length === 0) {
            alert('No exportable addresses found.');
            return;
        }

        // Group into contiguous blocks (gap of 16+ bytes starts new block)
        const blocks = [];
        let blockStart = filteredAddrs[0];
        let blockEnd = filteredAddrs[0];

        for (let i = 1; i < filteredAddrs.length; i++) {
            const addr = filteredAddrs[i];
            if (addr > blockEnd + 16) {
                // Start new block
                blocks.push({ start: blockStart, end: blockEnd });
                blockStart = addr;
            }
            blockEnd = addr;
        }
        blocks.push({ start: blockStart, end: blockEnd });

        // Check for 128K paged memory (addresses >= 0xC000)
        const is128K = is128kCompat(machineType) || getProfile().ramPages > 1;
        let currentBank = -1;

        // Generate disassembly for each block
        for (const block of blocks) {
            // Skip screen memory
            if (block.start >= SCREEN_START && block.end < SCREEN_END) continue;

            // Handle bank paging for 128K
            if (is128K && block.start >= 0xC000) {
                const bank = getCurrentBank();
                if (bank !== currentBank) {
                    lines.push('');
                    lines.push(`    PAGE ${bank}`);
                    currentBank = bank;
                }
            }

            // ORG directive
            lines.push('');
            lines.push(`    ORG ${hex16(block.start)}`);
            lines.push('');

            // Disassemble the block
            let addr = block.start;
            while (addr <= block.end) {
                // Skip screen memory within block
                if (addr >= SCREEN_START && addr < SCREEN_END) {
                    addr = SCREEN_END;
                    if (addr > block.end) break;
                    lines.push('');
                    lines.push(`    ORG ${hex16(addr)}`);
                    lines.push('');
                }

                const region = regionManager.get(addr);
                const wasExecuted = executedAddrs.has(addr);
                const labelObj = labelManager.get(addr);

                // Add label if exists
                if (labelObj && labelObj.name) {
                    lines.push(`${labelObj.name}:`);
                }

                const addrHex = hex16(addr);

                if (region && region.type === 'text') {
                    // Text region - output as DEFM
                    let text = '';
                    let textStart = addr;
                    const textBytes = [];
                    while (addr <= block.end && addr <= region.end) {
                        const byte = readMem(addr);
                        if (byte >= 32 && byte < 127) {
                            text += String.fromCharCode(byte);
                            textBytes.push(rawHex8(byte));
                        } else {
                            break;
                        }
                        addr++;
                    }
                    if (text.length > 0) {
                        let line = `    DEFM "${text.replace(/"/g, '""')}"`;
                        if (includeAddrBytes) {
                            line += `  ; ${rawHex16(textStart)}: ${textBytes.join(' ')}`;
                        }
                        lines.push(line);
                    }
                } else if (region && region.type === 'dw') {
                    // Word data
                    const lo = readMem(addr);
                    const hi = readMem(addr + 1);
                    const word = lo | (hi << 8);
                    let line = `    DEFW ${hex16(word)}`;
                    if (includeAddrBytes) {
                        line += `  ; ${rawHex16(addr)}: ${rawHex8(lo)} ${rawHex8(hi)}`;
                    }
                    lines.push(line);
                    addr += 2;
                } else if (region && (region.type === 'db' || region.type === 'graphics')) {
                    // Byte data or graphics - output as DEFB
                    const bytesPerLine = region.type === 'graphics' ? 8 : 16;
                    let byteCount = 0;
                    let byteValues = [];
                    const startAddr = addr;
                    const rawBytes = [];

                    while (addr <= block.end && addr <= region.end && byteCount < bytesPerLine) {
                        const byte = readMem(addr);
                        byteValues.push(hex8(byte));
                        rawBytes.push(rawHex8(byte));
                        addr++;
                        byteCount++;
                    }
                    if (byteValues.length > 0) {
                        let line = `    DEFB ${byteValues.join(',')}`;
                        if (includeAddrBytes) {
                            line += `  ; ${rawHex16(startAddr)}: ${rawBytes.join(' ')}`;
                        }
                        lines.push(line);
                    }
                } else if (wasExecuted || (region && region.type === 'code')) {
                    // Code - check for unrolled loops first
                    let loopHandled = false;
                    if (dedupLoops) {
                        const loop = detectUnrolledLoop(addr, block.end);
                        if (loop && loop.repeatCount >= 3) {
                            // Helper function to format a mnemonic (replace addresses with labels)
                            const formatMnemonic = (mnemonic) => {
                                const addrMatch = mnemonic.match(/([0-9A-F]{4})h/i);
                                if (addrMatch) {
                                    const refAddr = parseInt(addrMatch[1], 16);
                                    const refLabelObj = labelManager.get(refAddr);
                                    if (refLabelObj && refLabelObj.name) {
                                        mnemonic = mnemonic.replace(addrMatch[0], refLabelObj.name);
                                        if (!exportedAddrs.has(refAddr)) {
                                            externalLabels.set(refAddr, refLabelObj.name);
                                        }
                                    } else {
                                        mnemonic = mnemonic.replace(/([0-9A-F]{4})h/gi, '$$$1');
                                    }
                                }
                                return mnemonic.replace(/([0-9A-F]{2})h/gi, '$$$1');
                            };

                            // Recursive function to output instructions with nested loop detection
                            const outputWithNesting = (instructions, indent) => {
                                let i = 0;
                                while (i < instructions.length) {
                                    // Look for inner loop starting at this instruction
                                    const remaining = instructions.slice(i);
                                    const innerLoop = detectPatternInArray(remaining);

                                    if (innerLoop && innerLoop.repeatCount >= 3) {
                                        // Calculate inner loop byte size for comment
                                        const innerBytes = innerLoop.patternBytes.length * innerLoop.repeatCount;
                                        lines.push('');
                                        lines.push(`${indent}; Unrolled loop detected: ${innerLoop.repeatCount} repetitions, ${innerBytes} bytes`);
                                        lines.push(`${indent}REPT ${innerLoop.repeatCount}`);
                                        // Recursively output inner pattern (may have deeper nesting)
                                        outputWithNesting(innerLoop.patternInstructions, indent + '    ');
                                        lines.push(`${indent}ENDR`);
                                        lines.push('');
                                        i += innerLoop.instrCount;
                                    } else {
                                        // Output single instruction
                                        lines.push(`${indent}${formatMnemonic(instructions[i].mnemonic)}`);
                                        i++;
                                    }
                                }
                            };

                            // Output as REPT block
                            const startAddrHex = rawHex16(addr);
                            lines.push('');  // Empty line before REPT block
                            lines.push(`    ; Unrolled loop detected: ${loop.repeatCount} repetitions, ${loop.totalBytes} bytes`);
                            lines.push(`    REPT ${loop.repeatCount}`);

                            // Output pattern instructions with nested loop detection
                            outputWithNesting(loop.patternInstructions, '        ');

                            lines.push(`    ENDR`);
                            if (includeAddrBytes) {
                                lines.push(`    ; ${startAddrHex}-${rawHex16((addr + loop.totalBytes - 1) & 0xFFFF)}`);
                            }
                            lines.push('');  // Empty line after REPT block

                            addr += loop.totalBytes;
                            loopHandled = true;
                        }
                    }

                    if (!loopHandled) {
                        // Regular code disassembly
                        const dis = getDisasm().disassemble(addr);
                        let mnemonic = dis.mnemonic;

                        // Replace numeric addresses with labels where possible
                        const addrMatch = mnemonic.match(/([0-9A-F]{4})h/i);
                        if (addrMatch) {
                            const refAddr = parseInt(addrMatch[1], 16);
                            const refLabelObj = labelManager.get(refAddr);
                            if (refLabelObj && refLabelObj.name) {
                                // Use label - either in exported range or will be EQU
                                mnemonic = mnemonic.replace(addrMatch[0], refLabelObj.name);
                                // Track external labels for EQU generation
                                if (!exportedAddrs.has(refAddr)) {
                                    externalLabels.set(refAddr, refLabelObj.name);
                                }
                            } else {
                                mnemonic = mnemonic.replace(/([0-9A-F]{4})h/gi, '$$$1');
                            }
                        }
                        // Replace 2-digit hex
                        mnemonic = mnemonic.replace(/([0-9A-F]{2})h/gi, '$$$1');

                        // Build bytes array for address+bytes comment
                        const codeBytes = [];
                        for (let bi = 0; bi < dis.length; bi++) {
                            codeBytes.push(rawHex8(readMem(addr + bi)));
                        }
                        const addrBytesComment = includeAddrBytes
                            ? `  ; ${rawHex16(addr)}: ${codeBytes.join(' ')}`
                            : '';

                        // When using snapshot, output bytes from snapshot with mnemonic as comment
                        // (in case memory changed between snap and export)
                        if (usingSnapshot) {
                            const bytes = codeBytes.map(b => '$' + b);
                            lines.push(`    DEFB ${bytes.join(',')}  ; ${mnemonic}${addrBytesComment ? addrBytesComment.replace('  ; ', ' @ ') : ''}`);
                        } else {
                            lines.push(`    ${mnemonic}${addrBytesComment}`);
                        }
                        addr += dis.length;
                    }
                } else {
                    // Unknown - just data byte (read/write but not executed)
                    const byte = readMem(addr);
                    const startAddr = addr;

                    // Check for run of same byte (for DS compression)
                    let runLength = 1;
                    while (addr + runLength <= block.end &&
                           readMem(addr + runLength) === byte &&
                           !executedAddrs.has(addr + runLength) &&
                           !regionManager.get(addr + runLength) &&
                           !labelManager.get(addr + runLength)) {
                        runLength++;
                    }

                    if (runLength > 10) {
                        // Use DS for long runs
                        let line = `    DS ${runLength}, ${hex8(byte)}`;
                        if (includeAddrBytes) {
                            line += `  ; ${rawHex16(startAddr)}: ${runLength}x ${rawHex8(byte)}`;
                        }
                        lines.push(line);
                        addr += runLength;
                    } else {
                        let line = `    DEFB ${hex8(byte)}`;
                        if (includeAddrBytes) {
                            line += `  ; ${rawHex16(addr)}: ${rawHex8(byte)}`;
                        }
                        lines.push(line);
                        addr++;
                    }
                }
            }
        }

        // Generate EQUs for external labels (referenced but outside exported range)
        if (externalLabels.size > 0) {
            // Find position after DEVICE line to insert EQUs
            const deviceIndex = lines.findIndex(l => l.includes('DEVICE '));
            if (deviceIndex !== -1) {
                const equLines = [];
                equLines.push('');
                equLines.push('; External labels (referenced but not in exported code)');
                // Sort by address
                const sortedExternal = Array.from(externalLabels.entries()).sort((a, b) => a[0] - b[0]);
                for (const [addr, name] of sortedExternal) {
                    equLines.push(`${name} EQU ${hex16(addr)}`);
                }
                equLines.push('');
                // Insert after DEVICE line
                lines.splice(deviceIndex + 1, 0, ...equLines);
            }
        }

        // Restoration code at the bottom
        // Calculate size: DI(1) + [paging: LD A(2) + LD BC(3) + OUT(2) = 7] + LD SP(3) + LD A(2) + LD I,A(2) + LD A(2) + LD R,A(2) +
        // LD BC(3) + LD DE(3) + LD HL(3) + PUSH(1) + LD HL(3) + PUSH(1) + POP AF(1) + POP HL(1) +
        // EX AF,AF'(1) + EXX(1) + LD BC(3) + LD DE(3) + LD IX(4) + LD IY(4) +
        // LD HL(3) + PUSH(1) + LD HL(3) + PUSH(1) + POP AF(1) + POP HL(1) + IM(2) + EI?(1) + JP(3)
        const pagingCodeSize = is128K ? 7 : 0;  // LD A + LD BC + OUT (C),A
        const restoreCodeSize = 59 + (cpu.iff1 ? 1 : 0) + pagingCodeSize;  // 59 bytes base, +1 if EI, +7 if 128K
        const stackDataSize = stackDepth * 2;  // 32 bytes for 16 words
        const totalRestoreSize = restoreCodeSize + stackDataSize;

        // IM2 vector table (257 bytes at I*256)
        if (cpu.im === 2) {
            const vectorBase = cpu.i << 8;
            lines.push('');
            lines.push('');
            lines.push('; ============ IM2 VECTOR TABLE ============');
            lines.push(`; 257 bytes at I*256 = ${hex16(vectorBase)}`);
            lines.push('');
            lines.push(`    ORG ${hex16(vectorBase)}`);
            lines.push('');
            lines.push('im2_vectors:');
            // Output 257 bytes with DS compression for runs
            let i = 0;
            while (i < 257) {
                const addr = (vectorBase + i) & 0xFFFF;
                const byte = readMem(addr);

                // Check for run of same byte
                let runLength = 1;
                while (i + runLength < 257 &&
                       readMem((vectorBase + i + runLength) & 0xFFFF) === byte) {
                    runLength++;
                }

                if (runLength > 10) {
                    let line = `    DS ${runLength}, ${hex8(byte)}`;
                    if (includeAddrBytes) {
                        line += `  ; ${rawHex16(addr)}: ${runLength}x ${rawHex8(byte)}`;
                    }
                    lines.push(line);
                    i += runLength;
                } else {
                    // Output up to 16 bytes as DEFB
                    const count = Math.min(16, 257 - i);
                    const bytes = [];
                    const rawBytes = [];
                    for (let j = 0; j < count; j++) {
                        const a = (vectorBase + i + j) & 0xFFFF;
                        const b = readMem(a);
                        bytes.push(hex8(b));
                        rawBytes.push(rawHex8(b));
                    }
                    let line = `    DEFB ${bytes.join(',')}`;
                    if (includeAddrBytes) {
                        line += `  ; ${rawHex16(addr)}: ${rawBytes.join(' ')}`;
                    }
                    lines.push(line);
                    i += count;
                }
            }
        }

        lines.push('');
        lines.push('');
        lines.push('; ============ STACK DATA ============');
        lines.push(`; ${stackDataSize} bytes at SP=${hex16(sp)}`);
        lines.push('');
        lines.push(`    ORG ${hex16(sp)}  ; SP value`);
        lines.push('');
        lines.push('stack_top:');
        for (let i = 0; i < stackDepth; i++) {
            const addr = (sp + i * 2) & 0xFFFF;
            const lo = readMem(addr);
            const hi = readMem((addr + 1) & 0xFFFF);
            const word = lo | (hi << 8);
            let line = `    DEFW ${hex16(word)}  ; SP+${(i * 2).toString().padStart(2)}`;
            if (includeAddrBytes) {
                line += ` @ ${rawHex16(addr)}: ${rawHex8(lo)} ${rawHex8(hi)}`;
            }
            lines.push(line);
        }
        lines.push('stack_bottom:');
        lines.push('');
        lines.push('');
        lines.push('; ============ RESTORATION CODE ============');
        lines.push(`; ${restoreCodeSize} bytes`);
        lines.push('');
        lines.push('    ORG $4000  ; <-- change to your safe address');
        lines.push('');
        lines.push('restore_state:');
        lines.push('    DI');
        lines.push('');
        // Add 128K paging restoration
        if (is128K) {
            lines.push('    ; Restore 128K paging');
            lines.push(`    LD A,${hex8(port7FFD)}  ; RAM=${paging.ramBank}, ROM=${paging.romBank}, Screen=${paging.screenBank}`);
            lines.push('    LD BC,$7FFD');
            lines.push('    OUT (C),A');
            lines.push('');
        }
        lines.push('    ; Setup stack');
        lines.push('    LD SP,stack_top');
        lines.push('');
        lines.push('    ; Restore I and R registers');
        lines.push(`    LD A,${hex8(cpu.i)}`);
        lines.push('    LD I,A');
        // R increments with each M1 cycle after LD R,A
        // Count M1 cycles from after LD R,A until PC reaches target:
        // LD BC(1) + LD DE(1) + LD HL(1) + PUSH(1) + LD HL(1) + PUSH(1) + POP AF(1) + POP HL(1) +
        // EX AF,AF'(1) + EXX(1) + LD BC(1) + LD DE(1) + LD IX(2) + LD IY(2) +
        // LD HL(1) + PUSH(1) + LD HL(1) + PUSH(1) + POP AF(1) + POP HL(1) + IM(2) + [EI(1)] + JP(1)
        // = 25 without EI, 26 with EI
        const m1CyclesAfterR = 25 + (cpu.iff1 ? 1 : 0);
        const adjustedR = (((cpu.r & 0x7F) - m1CyclesAfterR) & 0x7F) | (cpu.r & 0x80);
        lines.push(`    LD A,${hex8(adjustedR)}  ; R=${hex8(cpu.r)}, minus ${m1CyclesAfterR} M1 cycles`);
        lines.push('    LD R,A');
        lines.push('');
        lines.push('    ; Restore alternate registers (load into main, then swap)');
        lines.push(`    LD BC,${hex16(bc_)}`);
        lines.push(`    LD DE,${hex16(de_)}`);
        lines.push(`    LD HL,${hex16(hl_)}`);
        lines.push('    PUSH HL');
        lines.push(`    LD HL,${hex16(af_)}`);
        lines.push('    PUSH HL');
        lines.push('    POP AF');
        lines.push('    POP HL');
        lines.push('    EX AF,AF\'');
        lines.push('    EXX');
        lines.push('');
        lines.push('    ; Restore main registers');
        lines.push(`    LD BC,${hex16(bc)}`);
        lines.push(`    LD DE,${hex16(de)}`);
        lines.push(`    LD IX,${hex16(cpu.ix)}`);
        lines.push(`    LD IY,${hex16(cpu.iy)}`);
        lines.push('');
        lines.push('    ; Restore HL, AF and jump');
        lines.push(`    LD HL,${hex16(hl)}`);
        lines.push('    PUSH HL');
        lines.push(`    LD HL,${hex16(af)}`);
        lines.push('    PUSH HL');
        lines.push('    POP AF');
        lines.push('    POP HL');
        lines.push('');
        lines.push(`    IM ${cpu.im}`);
        if (cpu.iff1) {
            lines.push('    EI');
        }
        lines.push(`    JP ${hex16(cpu.pc)}`);
        lines.push('');
        lines.push('    SAVESNA "output.sna",restore_state');
        lines.push('');

        // Create and download file
        const content = lines.join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `disasm_${now.toISOString().substring(0,10)}.asm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    document.getElementById('btnExportAsm').addEventListener('click', exportDisassembly);
}
