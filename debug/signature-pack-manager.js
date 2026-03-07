// signature-pack-manager.js — Signature pack system (engine/game matching, .skool/.asm import)
import { storageGet, storageSet, storageRemove } from '../core/utils.js';

export class SignaturePackManager {
    constructor() {
        this.packs = [];        // Array of { id, file, type, enabled, name }
        this.loadedPacks = {};  // id → full pack data (loaded on demand)
        this.indexUrl = 'signatures/index.json';
        this._Assembler = null;
        this._VFS = null;
    }

    // Set assembler and VFS references for .skool/.asm import
    setAssembler(Assembler, VFS) {
        this._Assembler = Assembler;
        this._VFS = VFS;
    }

    // Load the index file listing all available packs
    async loadIndex() {
        try {
            const resp = await fetch(this.indexUrl);
            if (!resp.ok) {
                console.warn('Signature index not found');
                this.packs = [];
                return;
            }
            const idx = await resp.json();
            this.packs = idx.packs || [];
            // Restore enabled/disabled state from localStorage
            const saved = this._loadEnabledState();
            if (saved) {
                for (const p of this.packs) {
                    if (saved[p.id] !== undefined) p.enabled = saved[p.id];
                }
            }
        } catch (e) {
            console.warn('Failed to load signature index:', e);
            this.packs = [];
        }
    }

    // Load a single pack file by ID
    async loadPack(id) {
        if (this.loadedPacks[id]) return this.loadedPacks[id];
        const entry = this.packs.find(p => p.id === id);
        if (!entry) return null;
        try {
            const resp = await fetch('signatures/' + entry.file);
            if (!resp.ok) return null;
            const pack = await resp.json();
            this.loadedPacks[id] = pack;
            return pack;
        } catch (e) {
            console.warn('Failed to load pack:', id, e);
            return null;
        }
    }

    // Toggle enabled state for a pack
    setEnabled(id, enabled) {
        const entry = this.packs.find(p => p.id === id);
        if (entry) {
            entry.enabled = enabled;
            this._saveEnabledState();
        }
    }

    // Get all enabled packs
    getEnabledPacks() {
        return this.packs.filter(p => p.enabled);
    }

    // Add a new pack from imported data (e.g., parsed .skool file)
    addPack(pack) {
        // Remove existing pack with same ID
        this.packs = this.packs.filter(p => p.id !== pack.id);
        delete this.loadedPacks[pack.id];

        const entry = {
            id: pack.id,
            file: pack.id + '.json',
            type: pack.type || 'game',
            enabled: true,
            name: pack.name || pack.id,
            source: pack.source || ''
        };
        this.packs.push(entry);
        this.loadedPacks[pack.id] = pack;

        // Save pack to localStorage (can't write to filesystem from browser)
        this._savePackToStorage(pack);
        this._saveEnabledState();
        this._saveCustomIndex();
        return entry;
    }

    // Remove a pack
    removePack(id) {
        this.packs = this.packs.filter(p => p.id !== id);
        delete this.loadedPacks[id];
        storageRemove('zxm8_sigpack_' + id);
        this._saveEnabledState();
        this._saveCustomIndex();
    }

    // Load all enabled packs into memory
    async loadAllEnabled() {
        const enabled = this.getEnabledPacks();
        for (const entry of enabled) {
            // Try localStorage first (user-imported packs)
            if (!this.loadedPacks[entry.id]) {
                const stored = this._loadPackFromStorage(entry.id);
                if (stored) {
                    this.loadedPacks[entry.id] = stored;
                    continue;
                }
            }
            // Then try fetching from signatures/ directory
            await this.loadPack(entry.id);
        }
    }

    // --- Matching engine ---

    // Scan memory for matching anchors across all enabled packs.
    // Each anchor is searched independently anywhere in memory (address-independent).
    // Returns array of { pack, matched, total, confidence, anchorMatches[] }
    scanMemory(readByte, startAddr, endAddr) {
        const results = [];
        for (const entry of this.getEnabledPacks()) {
            const pack = this.loadedPacks[entry.id];
            if (!pack || !pack.anchors || pack.anchors.length === 0) continue;

            const matchResult = this._matchAnchors(pack, readByte, startAddr, endAddr);
            if (matchResult.matched > 0) {
                results.push({
                    packId: entry.id,
                    pack: pack,
                    matched: matchResult.matched,
                    total: pack.anchors.length,
                    confidence: matchResult.matched / pack.anchors.length,
                    anchorMatches: matchResult.anchorMatches
                });
            }
        }
        results.sort((a, b) => b.confidence - a.confidence);
        return results;
    }

    // Match anchors by scanning all of memory for each anchor's byte pattern.
    // Each anchor can be found at any address — not tied to a base offset.
    _matchAnchors(pack, readByte, startAddr, endAddr) {
        // Two-pass matching with per-anchor offsets and voting.
        //
        // Pass 1 (exact): match all bytes exactly — highest confidence,
        //   catches same-game and same-engine at same addresses.
        // Pass 2 (masked): for unmatched anchors, use mask to ignore
        //   16-bit address operands — catches relocated code where only
        //   CALL/JP/LD addresses changed but opcodes are identical.
        //
        // Both passes contribute to the offset vote histogram.
        // Each anchor is resolved to the highest-voted offset where it matched.

        const anchorData = pack.anchors.map(anchor => ({
            anchor,
            origAddr: anchor.address,
            exactAddrs: [],     // pass 1 matches (all bytes identical)
            maskedAddrs: []     // pass 2 matches (address operands ignored)
        }));

        // Pass 1: exact matching (no masks)
        for (const ad of anchorData) {
            const bytes = ad.anchor.bytes;
            const len = bytes.length;
            for (let addr = startAddr; addr <= endAddr - len + 1; addr++) {
                let match = true;
                for (let i = 0; i < len; i++) {
                    if (readByte(addr + i) !== bytes[i]) { match = false; break; }
                }
                if (match) ad.exactAddrs.push(addr);
            }
        }

        // Pass 2: masked matching for anchors with no exact matches
        for (const ad of anchorData) {
            if (ad.exactAddrs.length > 0) continue;    // already matched exactly
            const mask = ad.anchor.mask;
            if (!mask) continue;                        // no mask = no address operands to relax
            const bytes = ad.anchor.bytes;
            const len = bytes.length;
            for (let addr = startAddr; addr <= endAddr - len + 1; addr++) {
                let match = true;
                for (let i = 0; i < len; i++) {
                    if ((readByte(addr + i) & mask[i]) !== (bytes[i] & mask[i])) { match = false; break; }
                }
                if (match) ad.maskedAddrs.push(addr);
            }
        }

        // Build offset histogram from both passes.
        // Exact matches get double weight (more trustworthy).
        const offsetVotes = {};
        for (const ad of anchorData) {
            for (const addr of ad.exactAddrs) {
                const offset = addr - ad.origAddr;
                offsetVotes[offset] = (offsetVotes[offset] || 0) + 2;
            }
            for (const addr of ad.maskedAddrs) {
                const offset = addr - ad.origAddr;
                offsetVotes[offset] = (offsetVotes[offset] || 0) + 1;
            }
        }

        // Rank offsets by votes
        const rankedOffsets = Object.entries(offsetVotes)
            .map(([off, votes]) => ({ offset: parseInt(off), votes }))
            .sort((a, b) => b.votes - a.votes);

        // Resolve each anchor to its best match
        const anchorMatches = [];
        for (const ad of anchorData) {
            const allAddrs = ad.exactAddrs.length > 0 ? ad.exactAddrs : ad.maskedAddrs;
            if (allAddrs.length === 0) continue;

            const matchSet = new Set(allAddrs);
            let resolved = null;

            // Prefer highest-voted offset where this anchor matched
            for (const { offset } of rankedOffsets) {
                const target = ad.origAddr + offset;
                if (matchSet.has(target)) {
                    resolved = { foundAddr: target, offset };
                    break;
                }
            }

            // Unique match: only one place in memory
            if (!resolved && allAddrs.length === 1) {
                resolved = {
                    foundAddr: allAddrs[0],
                    offset: allAddrs[0] - ad.origAddr
                };
            }

            if (resolved) {
                anchorMatches.push({
                    anchor: ad.anchor,
                    origAddr: ad.origAddr,
                    foundAddr: resolved.foundAddr,
                    offset: resolved.offset
                });
            }
        }

        return { matched: anchorMatches.length, anchorMatches };
    }

    // Apply labels from matched anchors using per-anchor offsets.
    // Each label is assigned to its nearest matched anchor (by source address)
    // and relocated using that anchor's offset. This correctly handles both
    // uniform relocation and shuffled procedures.
    applyLabels(matchResult, targetLabelManager, targetRegionManager, page) {
        const pack = matchResult.pack;
        const anchorMatches = matchResult.anchorMatches;
        if (!anchorMatches || anchorMatches.length === 0) return { labelCount: 0, regionCount: 0, offset: 0, uniqueOffsets: 0 };

        // System pattern packs: each anchor IS the label — apply directly at found address
        if (pack.type === 'system') {
            return this._applySystemPatternLabels(matchResult, targetLabelManager, targetRegionManager, page);
        }

        const labelPage = page !== undefined ? page : null;
        let labelCount = 0;
        let regionCount = 0;

        // Sort anchors by original address for nearest-anchor lookup
        const sorted = [...anchorMatches].sort((a, b) => a.origAddr - b.origAddr);

        // Check if all offsets are the same (common case)
        const offsetSet = new Set(sorted.map(m => m.offset));
        const uniformOffset = offsetSet.size === 1 ? sorted[0].offset : null;

        // Disable auto-save during bulk insert, save once at end
        const prevAutoSave = targetLabelManager.autoSaveEnabled;
        targetLabelManager.autoSaveEnabled = false;

        if (uniformOffset !== null) {
            // Uniform offset — efficient bulk apply
            labelCount = this._applyLabelsWithOffset(pack, uniformOffset, targetLabelManager, labelPage);
            regionCount = this._applyRegionsWithOffset(pack, uniformOffset, targetRegionManager, labelPage);
        } else {
            // Per-anchor offsets — each label uses its nearest anchor's offset
            if (pack.labels) {
                for (const [addrStr, name] of Object.entries(pack.labels)) {
                    const addr = parseInt(addrStr, 16) || parseInt(addrStr, 10);
                    if (isNaN(addr)) continue;
                    const nearest = this._findNearestAnchor(sorted, addr);
                    if (!nearest) continue;
                    const mapped = (addr + nearest.offset) & 0xFFFF;
                    const key = targetLabelManager._key(mapped, labelPage);
                    if (!targetLabelManager.labels.has(key)) {
                        targetLabelManager.add({ address: mapped, page: labelPage, name: name });
                        labelCount++;
                    }
                }
            }
            if (pack.regions && targetRegionManager) {
                for (const region of pack.regions) {
                    const nearest = this._findNearestAnchor(sorted, region.start);
                    if (!nearest) continue;
                    const start = (region.start + nearest.offset) & 0xFFFF;
                    const end = (region.end + nearest.offset) & 0xFFFF;
                    if (start > end) continue;
                    if (!targetRegionManager.get(start, labelPage)) {
                        targetRegionManager.add({
                            start, end,
                            type: region.type || 'code', page: labelPage,
                            comment: region.comment || ''
                        });
                        regionCount++;
                    }
                }
            }
        }

        targetLabelManager.autoSaveEnabled = prevAutoSave;
        if (prevAutoSave) targetLabelManager._autoSave();

        // Compute dominant offset for display
        const offsetCounts = {};
        for (const m of sorted) offsetCounts[m.offset] = (offsetCounts[m.offset] || 0) + 1;
        const dominantOffset = parseInt(Object.entries(offsetCounts).sort((a, b) => b[1] - a[1])[0][0]);

        return { labelCount, regionCount, offset: dominantOffset, uniqueOffsets: offsetSet.size };
    }

    // Find nearest anchor to an address using binary search on sorted array
    _findNearestAnchor(sortedAnchors, addr) {
        let lo = 0, hi = sortedAnchors.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (sortedAnchors[mid].origAddr < addr) lo = mid + 1;
            else hi = mid;
        }
        // lo = first anchor with origAddr >= addr; check lo and lo-1
        let best = null, bestDist = Infinity;
        for (const i of [lo - 1, lo]) {
            if (i >= 0 && i < sortedAnchors.length) {
                const dist = Math.abs(sortedAnchors[i].origAddr - addr);
                if (dist < bestDist) { bestDist = dist; best = sortedAnchors[i]; }
            }
        }
        return best;
    }

    // Apply system pattern labels — each anchor is placed directly at its found address
    _applySystemPatternLabels(matchResult, targetLabelManager, targetRegionManager, page) {
        const anchorMatches = matchResult.anchorMatches;
        const labelPage = page !== undefined ? page : null;
        let labelCount = 0;

        const prevAutoSave = targetLabelManager.autoSaveEnabled;
        targetLabelManager.autoSaveEnabled = false;

        for (const match of anchorMatches) {
            const addr = match.foundAddr;
            const label = match.anchor.label;
            if (!label) continue;
            const key = targetLabelManager._key(addr, labelPage);
            const existing = targetLabelManager.labels.get(key);
            // Skip user labels; replace auto/signature labels
            if (existing && existing.source !== 'signature' && !/^(sub_|loc_)[0-9a-fA-F]{4}$/.test(existing.name)) continue;
            targetLabelManager.add({ address: addr, page: labelPage, name: label, source: 'signature' });
            labelCount++;
        }

        targetLabelManager.autoSaveEnabled = prevAutoSave;
        if (prevAutoSave) targetLabelManager._autoSave();

        return { labelCount, regionCount: 0, offset: 0, uniqueOffsets: anchorMatches.length };
    }

    // Apply all pack labels shifted by a global offset
    _applyLabelsWithOffset(pack, offset, targetLabelManager, page) {
        let count = 0;
        if (!pack.labels) return 0;
        for (const [addrStr, name] of Object.entries(pack.labels)) {
            const addr = parseInt(addrStr, 16) || parseInt(addrStr, 10);
            if (isNaN(addr)) continue;
            const mapped = (addr + offset) & 0xFFFF;
            const key = targetLabelManager._key(mapped, page);
            if (!targetLabelManager.labels.has(key)) {
                targetLabelManager.add({ address: mapped, page: page, name: name });
                count++;
            }
        }
        return count;
    }

    // Apply all pack regions shifted by a global offset
    _applyRegionsWithOffset(pack, offset, targetRegionManager, page) {
        let count = 0;
        if (!pack.regions || !targetRegionManager) return 0;
        for (const region of pack.regions) {
            const start = (region.start + offset) & 0xFFFF;
            const end = (region.end + offset) & 0xFFFF;
            if (start > end) continue;
            const existing = targetRegionManager.get(start, page);
            if (!existing) {
                targetRegionManager.add({
                    start: start, end: end,
                    type: region.type || 'code', page: page,
                    comment: region.comment || ''
                });
                count++;
            }
        }
        return count;
    }

    // --- .skool file parser ---

    // Parse a SkoolKit .skool file into a signature pack
    parseSkoolFile(text, packId, packName) {
        const lines = text.split(/\r?\n/);
        const labels = {};
        const regions = [];
        const comments = {};
        const asmLines = []; // collect source lines for assembler pass
        let lastAsmAddr = null;
        let currentLabel = null;
        let currentRegionStart = null;
        let currentRegionType = null;
        let lastAddr = null;
        let baseAddress = null;
        let equs = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // @equ directive: symbolic constants
            const equMatch = line.match(/^@equ=(\w+)=\$([0-9a-fA-F]+)/);
            if (equMatch) {
                equs[equMatch[1]] = parseInt(equMatch[2], 16);
                continue;
            }

            // @label directive: next instruction gets this label
            const labelMatch = line.match(/^@label=(\S+)/);
            if (labelMatch) {
                currentLabel = labelMatch[1];
                continue;
            }

            // Skip other directives and blank lines
            if (line.startsWith('@') || line.trim() === '') {
                // End of entry — close current region
                if (line.trim() === '' && currentRegionStart !== null && lastAddr !== null) {
                    regions.push({
                        start: currentRegionStart,
                        end: lastAddr,
                        type: currentRegionType
                    });
                    currentRegionStart = null;
                    currentRegionType = null;
                }
                continue;
            }

            // Pure comment line (entry header)
            if (line.startsWith(';')) continue;

            // Instruction line: control char + address + instruction [; comment]
            const instrMatch = line.match(/^([cbtwsugir* ])(\$[0-9a-fA-F]+|\d+)\s+(.*)/);
            if (!instrMatch) continue;

            const control = instrMatch[1];
            const addrStr = instrMatch[2];
            const rest = instrMatch[3];
            let addr;

            if (addrStr.startsWith('$')) {
                addr = parseInt(addrStr.substring(1), 16);
            } else {
                addr = parseInt(addrStr, 10);
            }

            if (isNaN(addr)) continue;

            if (baseAddress === null) baseAddress = addr;
            lastAddr = addr;

            // Apply pending label
            if (currentLabel) {
                labels[addr.toString(16)] = currentLabel;
                currentLabel = null;
            }

            // Map control chars to region types
            const regionTypeMap = {
                'c': 'code', '*': 'code',
                'b': 'db', 'g': 'db',
                't': 'text',
                'w': 'dw',
                's': 'db',
                'u': 'db'
            };

            // Start new region if control char is an entry start
            if (control !== ' ' && control !== 'i' && regionTypeMap[control]) {
                // Close previous region
                if (currentRegionStart !== null && lastAddr !== null) {
                    const prevAddr = lastAddr === addr ? addr - 1 : lastAddr;
                    if (prevAddr >= currentRegionStart) {
                        regions.push({
                            start: currentRegionStart,
                            end: prevAddr,
                            type: currentRegionType
                        });
                    }
                }
                currentRegionStart = addr;
                currentRegionType = regionTypeMap[control];
            }

            // Extract inline comment
            const commentIdx = rest.indexOf(';');
            const instrText = commentIdx >= 0 ? rest.substring(0, commentIdx).trim() : rest.trim();
            if (commentIdx >= 0) {
                const commentText = rest.substring(commentIdx + 1).trim()
                    .replace(/^\{/, '').replace(/\}$/, '').trim();
                if (commentText) {
                    comments[addr.toString(16)] = commentText;
                }
            }

            // Collect instruction text for assembler pass
            if (instrText) {
                // Insert ORG when address is not contiguous with previous
                // (first line, or gap > 4 bytes which exceeds any single Z80 instruction)
                if (lastAsmAddr === null || addr < lastAsmAddr || addr > lastAsmAddr + 4) {
                    asmLines.push('        ORG $' + addr.toString(16));
                }
                asmLines.push('        ' + instrText);
                lastAsmAddr = addr;
            }

            // Auto-generate label from entry header comment
            // If this is an entry start (c, b, t, etc.) and no @label was given
            if (control !== ' ' && control !== 'i' && !labels[addr.toString(16)]) {
                // Look back for a header comment like "; Routine at XXXX"
                for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
                    const prevLine = lines[j].trim();
                    if (prevLine === '') break;
                    if (prevLine.startsWith(';')) {
                        // Use first header comment as auto-label only if short
                        const headerText = prevLine.replace(/^;\s*/, '');
                        if (headerText.length <= 40 && !headerText.match(/^(Data|Routine|Unused) (block )?at /i)) {
                            // Convert to label-safe name
                            const safeName = headerText
                                .replace(/[^a-zA-Z0-9_\s]/g, '')
                                .trim()
                                .replace(/\s+/g, '_')
                                .toLowerCase();
                            if (safeName.length >= 2 && safeName.length <= 32) {
                                labels[addr.toString(16)] = safeName;
                            }
                        }
                        break;
                    }
                }
            }
        }

        // Close final region
        if (currentRegionStart !== null && lastAddr !== null) {
            regions.push({
                start: currentRegionStart,
                end: lastAddr,
                type: currentRegionType
            });
        }

        // Assemble collected lines using sjasmplus to get actual bytes
        const anchors = this._assembleSourceAndBuildAnchors(asmLines.join('\n'), labels);

        return {
            id: packId,
            name: packName,
            type: 'game',
            source: 'skool-import',
            baseAddress: baseAddress || 0,
            machineType: '48k',
            anchors: anchors,
            labels: labels,
            regions: regions,
            comments: comments,
            stats: {
                labels: Object.keys(labels).length,
                regions: regions.length,
                comments: Object.keys(comments).length,
                anchors: anchors.length
            }
        };
    }

    // Parse Z80 assembly files (sjasmplus/pasmo/z80asm format)
    // fileTexts: array of { path, text } for multi-file repos (INCLUDEs resolved)
    // or single string for one file
    parseAsmFiles(fileTexts, packId, packName) {
        // Normalize to array
        if (typeof fileTexts === 'string') {
            fileTexts = [{ path: 'main.asm', text: fileTexts }];
        }

        // Build a lookup of path → text for INCLUDE resolution
        const fileMap = {};
        for (const f of fileTexts) {
            // Store by multiple key variants for flexible matching
            fileMap[f.path] = f.text;
            fileMap[f.path.replace(/\\/g, '/')] = f.text;
            // Also store by filename only
            const name = f.path.split('/').pop().split('\\').pop();
            if (!fileMap[name]) fileMap[name] = f.text;
        }

        const labels = {};
        const regions = [];
        const comments = {};
        const equs = {};
        let pc = 0;
        let baseAddress = null;
        let currentRegionStart = null;
        let currentRegionType = null;
        const processedFiles = new Set();

        // Resolve an INCLUDE path
        const resolveInclude = (includePath) => {
            // Try exact path
            const normalized = includePath.replace(/\\/g, '/').replace(/^\//, '');
            if (fileMap[normalized]) return fileMap[normalized];
            // Try without leading directory
            const name = normalized.split('/').pop();
            if (fileMap[name]) return fileMap[name];
            // Try all partial matches
            for (const key of Object.keys(fileMap)) {
                if (key.endsWith(normalized) || key.endsWith('/' + normalized)) {
                    return fileMap[key];
                }
            }
            return null;
        };

        // Process a single file's lines
        const processFile = (text, filePath) => {
            if (processedFiles.has(filePath)) return;
            processedFiles.add(filePath);
            const lines = text.split(/\r?\n/);

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i];

                // Strip comments (but preserve for label comments)
                const commentIdx = line.indexOf(';');
                let comment = '';
                if (commentIdx >= 0) {
                    comment = line.substring(commentIdx + 1).trim();
                    line = line.substring(0, commentIdx);
                }
                line = line.trim();
                if (!line) continue;

                // INCLUDE directive
                const includeMatch = line.match(/^\s*(?:INCLUDE|include)\s+["']([^"']+)["']/i);
                if (includeMatch) {
                    const inclText = resolveInclude(includeMatch[1]);
                    if (inclText) {
                        processFile(inclText, includeMatch[1]);
                    }
                    continue;
                }

                // ORG directive
                const orgMatch = line.match(/^\s*(?:ORG|org)\s+(.+)/i);
                if (orgMatch) {
                    // Close current region
                    if (currentRegionStart !== null && pc > currentRegionStart) {
                        regions.push({ start: currentRegionStart, end: pc - 1, type: currentRegionType });
                    }
                    currentRegionStart = null;
                    pc = this._parseAsmValue(orgMatch[1].trim(), equs);
                    if (baseAddress === null) baseAddress = pc;
                    continue;
                }

                // EQU / = constant
                const equMatch = line.match(/^(\w+)\s+(?:EQU|equ|=)\s+(.+)/i);
                if (equMatch) {
                    equs[equMatch[1]] = this._parseAsmValue(equMatch[2].trim(), equs);
                    continue;
                }

                // DEFINE (sjasmplus) — treat like EQU with value 1
                const defMatch = line.match(/^\s*(?:DEFINE|define)\s+(\w+)/i);
                if (defMatch) {
                    equs[defMatch[1]] = 1;
                    continue;
                }

                // Skip assembler directives we don't process
                if (/^\s*(?:MACRO|macro|ENDM|endm|IF|IFDEF|IFNDEF|ELSE|ENDIF|STRUCT|ENDS|MODULE|ENDMODULE|OUTPUT|DEVICE|SLOT|PAGE|PHASE|DEPHASE|UNPHASE|ALIGN|ASSERT|DISPLAY|EMPTYTAP|SAVETAP|SAVEBIN|SAVESNA)/i.test(line)) {
                    continue;
                }

                // Label at start of line (with or without colon)
                let label = null;
                const labelMatch = line.match(/^(\w+):?\s*(.*)/);
                if (labelMatch) {
                    const potentialLabel = labelMatch[1];
                    const rest = labelMatch[2].trim();

                    // Distinguish label from instruction: if rest is empty or starts with
                    // an instruction/directive, then potentialLabel is a label.
                    // If potentialLabel is a known mnemonic, it's an instruction.
                    if (!this._isZ80Mnemonic(potentialLabel)) {
                        label = potentialLabel;
                        line = rest;

                        // Store label at current PC
                        if (baseAddress !== null) {
                            labels[pc.toString(16)] = label;
                            if (comment) {
                                comments[pc.toString(16)] = comment;
                            }
                        }
                    }
                }

                // If line is now empty (label-only line), continue
                if (!line) continue;

                // Data directives
                const dataMatch = line.match(/^\s*(DEFB|defb|DB|db|DEFM|defm|DM|dm)\s+(.*)/i);
                if (dataMatch) {
                    const size = this._countDataBytes(dataMatch[2]);
                    if (currentRegionStart === null) {
                        currentRegionStart = pc;
                        currentRegionType = 'db';
                    }
                    pc += size;
                    continue;
                }

                const dwMatch = line.match(/^\s*(DEFW|defw|DW|dw)\s+(.*)/i);
                if (dwMatch) {
                    const items = this._splitDataItems(dwMatch[2]);
                    if (currentRegionStart === null) {
                        currentRegionStart = pc;
                        currentRegionType = 'dw';
                    }
                    pc += items.length * 2;
                    continue;
                }

                const dsMatch = line.match(/^\s*(DEFS|defs|DS|ds)\s+(.*)/i);
                if (dsMatch) {
                    const val = this._parseAsmValue(dsMatch[2].split(',')[0].trim(), equs);
                    if (currentRegionStart === null) {
                        currentRegionStart = pc;
                        currentRegionType = 'db';
                    }
                    pc += (val > 0 ? val : 1);
                    continue;
                }

                // Instruction — calculate size and advance PC
                const instrSize = this._z80InstrSize(line, equs);
                if (instrSize > 0) {
                    // Start code region if not in one
                    if (currentRegionStart === null) {
                        currentRegionStart = pc;
                        currentRegionType = 'code';
                    } else if (currentRegionType !== 'code') {
                        // Close data region, start code
                        regions.push({ start: currentRegionStart, end: pc - 1, type: currentRegionType });
                        currentRegionStart = pc;
                        currentRegionType = 'code';
                    }
                    pc += instrSize;
                }
            }
        };

        // Find main file — look for one with INCLUDE directives or ORG
        let mainFile = fileTexts[0];
        for (const f of fileTexts) {
            if (/\bINCLUDE\b/i.test(f.text) && /\bORG\b/i.test(f.text)) {
                mainFile = f;
                break;
            }
        }

        processFile(mainFile.text, mainFile.path);

        // Close final region
        if (currentRegionStart !== null && pc > currentRegionStart) {
            regions.push({ start: currentRegionStart, end: pc - 1, type: currentRegionType });
        }

        // Assemble using the existing sjasmplus assembler to get actual bytes
        const asmResult = this._assembleAndBuildAnchors(fileTexts, mainFile, labels);
        const anchors = asmResult.anchors;

        // When the assembler provides symbols, use them to correct label
        // addresses. parseAsmFiles PC tracking drifts on macros/DUP/etc,
        // but the real assembler handles them correctly.
        let correctedLabels = labels;
        let correctedComments = comments;
        let correctedRegions = regions;
        if (asmResult.symbols) {
            // Build labels directly from assembler symbols instead of
            // correcting parseAsmFiles labels. The assembler handles macros,
            // DUP, etc. correctly — its symbol addresses are authoritative.
            const outputStart = asmResult.outputStart;
            const outputEnd = asmResult.outputEnd;

            // Build name→comment map from parseAsmFiles for comment preservation
            const nameToComment = {};
            for (const [addrStr, name] of Object.entries(labels)) {
                if (comments[addrStr]) {
                    nameToComment[name] = comments[addrStr];
                    nameToComment[name.toLowerCase()] = comments[addrStr];
                }
            }

            // Build labels from ALL assembler symbols (labels + EQU constants).
            // EQU constants often define CALL/JP targets outside the main
            // disassembled range — these are valid labels for a signature pack.
            correctedLabels = {};
            correctedComments = {};
            const seenSymNames = new Set();
            for (const sym of asmResult.symbols) {
                if (!sym.name || typeof sym.value !== 'number') continue;
                if (sym.value < 0 || sym.value > 0xFFFF) continue;
                if (sym.name.startsWith('__')) continue;
                // Deduplicate by name — macro expansions can create multiple
                // symbols with the same name at different addresses
                const lname = sym.name.toLowerCase();
                if (seenSymNames.has(lname)) continue;
                seenSymNames.add(lname);
                const addrKey = sym.value.toString(16);
                correctedLabels[addrKey] = sym.name;
                const cmt = nameToComment[sym.name] || nameToComment[sym.name.toLowerCase()];
                if (cmt) correctedComments[addrKey] = cmt;
            }

            // Replace regions with a single code extent from the assembler output
            if (typeof asmResult.outputStart === 'number' && typeof asmResult.outputEnd === 'number') {
                correctedRegions = [{ start: asmResult.outputStart, end: asmResult.outputEnd, type: 'code' }];
            }

            // Update baseAddress from assembler if available
            if (typeof asmResult.outputStart === 'number') {
                baseAddress = asmResult.outputStart;
            }

        }

        return {
            id: packId,
            name: packName,
            type: 'game',
            source: 'asm-import',
            baseAddress: baseAddress || 0,
            machineType: '48k',
            anchors: anchors,
            labels: correctedLabels,
            regions: correctedRegions,
            comments: correctedComments,
            stats: {
                labels: Object.keys(correctedLabels).length,
                regions: correctedRegions.length,
                comments: Object.keys(correctedComments).length,
                anchors: anchors.length
            }
        };
    }

    // Parse a numeric value from ASM: $FF, 0FFh, 0xFF, 0b1010, 255, label
    _parseAsmValue(str, equs) {
        str = str.trim().split(/[\s,;]/)[0]; // take first token
        if (str.startsWith('$')) return parseInt(str.substring(1), 16) || 0;
        if (str.startsWith('0x') || str.startsWith('0X')) return parseInt(str.substring(2), 16) || 0;
        if (str.startsWith('0b') || str.startsWith('0B')) return parseInt(str.substring(2), 2) || 0;
        if (/^[0-9][0-9a-fA-F]*h$/i.test(str)) return parseInt(str, 16) || 0;
        if (/^\d+$/.test(str)) return parseInt(str, 10) || 0;
        if (equs && equs[str] !== undefined) return equs[str];
        return 0;
    }

    // Count bytes in a DEFB/DB/DEFM operand list
    _countDataBytes(operands) {
        let count = 0;
        let inString = false;
        let strChar = '';
        let i = 0;
        while (i < operands.length) {
            const ch = operands[i];
            if (inString) {
                if (ch === strChar) { inString = false; }
                else { count++; }
                i++;
            } else if (ch === '"' || ch === "'") {
                inString = true;
                strChar = ch;
                i++;
            } else if (ch === ',') {
                i++;
            } else if (/\s/.test(ch)) {
                i++;
            } else {
                // Numeric value = 1 byte
                count++;
                // Skip to next comma or end
                while (i < operands.length && operands[i] !== ',' && operands[i] !== '"' && operands[i] !== "'") i++;
            }
        }
        return Math.max(count, 1);
    }

    // Split comma-separated data items (respecting strings)
    _splitDataItems(operands) {
        const items = [];
        let current = '';
        let inString = false;
        let strChar = '';
        for (const ch of operands) {
            if (inString) {
                current += ch;
                if (ch === strChar) inString = false;
            } else if (ch === '"' || ch === "'") {
                current += ch;
                inString = true;
                strChar = ch;
            } else if (ch === ',') {
                if (current.trim()) items.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) items.push(current.trim());
        return items;
    }

    // Check if a token is a Z80 mnemonic (not a label)
    _isZ80Mnemonic(token) {
        const upper = token.toUpperCase();
        return /^(NOP|LD|INC|DEC|RLCA|RRCA|ADD|ADC|SUB|SBC|AND|XOR|OR|CP|RLA|RRA|DAA|CPL|SCF|CCF|HALT|RET|RETI|RETN|POP|PUSH|EX|EXX|DI|EI|NEG|IM|RLC|RRC|RL|RR|SLA|SRA|SRL|SLL|BIT|RES|SET|JP|JR|DJNZ|CALL|RST|IN|OUT|OUTI|OTIR|OUTD|OTDR|INI|INIR|IND|INDR|LDI|LDIR|LDD|LDDR|CPI|CPIR|CPD|CPDR|RLD|RRD|DEFB|DB|DEFW|DW|DEFS|DS|DEFM|DM|ORG|EQU|INCLUDE)$/.test(upper);
    }

    // Calculate Z80 instruction size from mnemonic line
    _z80InstrSize(line, equs) {
        // Normalize: uppercase, collapse whitespace
        const norm = line.replace(/\s+/g, ' ').trim().toUpperCase();
        const parts = norm.split(/[\s,]+/);
        const mnem = parts[0];

        // No-operand single byte
        if (/^(NOP|RLCA|RRCA|RLA|RRA|DAA|CPL|SCF|CCF|HALT|DI|EI|EXX|RET|RETI|RETN)$/.test(mnem) && parts.length <= 1) return 1;
        if (mnem === 'RET' && parts.length > 1) return 1; // RET cc

        // EX instructions
        if (mnem === 'EX') return (norm.includes('IX') || norm.includes('IY')) ? 2 : 1;

        // RST
        if (mnem === 'RST') return 1;

        // DJNZ, JR: 2 bytes
        if (mnem === 'DJNZ' || mnem === 'JR') return 2;

        // JP: 3 bytes, except JP (HL/IX/IY)
        if (mnem === 'JP') {
            if (norm.includes('(HL)')) return 1;
            if (norm.includes('(IX)') || norm.includes('(IY)')) return 2;
            return 3;
        }

        // CALL: 3 bytes
        if (mnem === 'CALL') return 3;

        // PUSH/POP: 1 byte (2 for IX/IY)
        if (mnem === 'PUSH' || mnem === 'POP') {
            return (norm.includes('IX') || norm.includes('IY')) ? 2 : 1;
        }

        // INC/DEC
        if (mnem === 'INC' || mnem === 'DEC') {
            if (norm.includes('(IX') || norm.includes('(IY')) return 3;
            if (norm.includes('IX') || norm.includes('IY')) return 2;
            return 1;
        }

        // IM
        if (mnem === 'IM') return 2;
        // NEG
        if (mnem === 'NEG') return 2;

        // Block instructions
        if (/^(LDI|LDIR|LDD|LDDR|CPI|CPIR|CPD|CPDR|INI|INIR|IND|INDR|OUTI|OTIR|OUTD|OTDR|RLD|RRD)$/.test(mnem)) return 2;

        // IN/OUT
        if (mnem === 'IN') {
            if (norm.includes('(C)')) return 2;
            return 2; // IN A,(n)
        }
        if (mnem === 'OUT') {
            if (norm.includes('(C)')) return 2;
            return 2; // OUT (n),A
        }

        // BIT/RES/SET
        if (mnem === 'BIT' || mnem === 'RES' || mnem === 'SET') {
            if (norm.includes('(IX') || norm.includes('(IY')) return 4;
            return 2;
        }

        // Shifts/rotates: RLC, RRC, RL, RR, SLA, SRA, SRL, SLL
        if (/^(RLC|RRC|RL|RR|SLA|SRA|SRL|SLL)$/.test(mnem)) {
            if (norm.includes('(IX') || norm.includes('(IY')) return 4;
            return 2;
        }

        // LD — the complex one
        if (mnem === 'LD') {
            // LD with IX/IY+d and immediate: 4 bytes (e.g., LD (IX+d),n)
            if ((norm.includes('(IX') || norm.includes('(IY')) && /\d+$/.test(norm.replace(/\)/g, ''))) {
                // LD r,(IX+d) or LD (IX+d),r = 3
                // LD (IX+d),n = 4
                const operands = norm.substring(2).trim();
                if (/\(I[XY][+-]\w+\)\s*,\s*[A-E,H,L]/.test(operands)) return 3;
                if (/[A-E,H,L]\s*,\s*\(I[XY]/.test(operands)) return 3;
                return 4; // LD (IX+d),n
            }
            if (norm.includes('(IX') || norm.includes('(IY')) return 3;

            // LD SP,HL/IX/IY
            if (/SP\s*,\s*(HL|IX|IY)/.test(norm)) {
                return norm.includes('IX') || norm.includes('IY') ? 2 : 1;
            }

            // LD rr,(nn) or LD (nn),rr — ED prefix for non-HL
            if (/\(\w+\)\s*,\s*(HL|BC|DE|SP)/.test(norm) && !/\(I[XY]/.test(norm)) {
                const reg = norm.match(/(HL|BC|DE|SP)/);
                if (reg && reg[1] === 'HL') return 3;
                return 4; // ED prefix
            }
            if (/(BC|DE|SP|HL)\s*,\s*\(\w+\)/.test(norm) && !/\(I[XY]/.test(norm)) {
                const reg = norm.match(/(HL|BC|DE|SP)/);
                if (reg && reg[1] === 'HL') return 3;
                return 4; // ED prefix
            }

            // LD (nn),A or LD A,(nn): 3 bytes
            if (/\(\$?\w+\)\s*,\s*A/.test(norm) && !/\([BCDEHL]\)/.test(norm) && !/\(I[XY]/.test(norm)) return 3;
            if (/A\s*,\s*\(\$?\w+\)/.test(norm) && !/\([BCDEHL]\)/.test(norm) && !/\(I[XY]/.test(norm)) return 3;

            // LD r,n (immediate byte): 2 bytes
            if (/^LD\s+[A-E,H,L]\s*,\s*/.test(norm) && !/\(/.test(norm)) {
                const operand = parts[parts.length - 1];
                // If operand is a register, it's LD r,r = 1 byte
                if (/^[A-E,H,L]$/.test(operand)) return 1;
                return 2; // LD r,n
            }

            // LD A,I / LD A,R / LD I,A / LD R,A: 2 bytes (ED prefix)
            if (/[AIR]\s*,\s*[IR]/.test(norm)) return 2;

            // LD rr,nn (16-bit immediate): 3 bytes (4 for IX/IY)
            if (/(BC|DE|HL|SP|IX|IY)\s*,/.test(norm)) {
                if (norm.includes('IX') || norm.includes('IY')) return 4;
                return 3;
            }

            // LD r,(HL) or LD (HL),r or LD r,r: 1 byte
            if (/\(HL\)/.test(norm)) {
                // LD (HL),n = 2 bytes
                const afterComma = norm.split(',')[1]?.trim();
                if (afterComma && !/^[A-E,H,L]$/.test(afterComma) && afterComma !== '(HL)') return 2;
                return 1;
            }
            if (/\((BC|DE)\)/.test(norm)) return 1;

            return 1; // LD r,r fallback
        }

        // ADD/ADC/SUB/SBC/AND/XOR/OR/CP
        if (/^(ADD|ADC|SUB|SBC|AND|XOR|OR|CP)$/.test(mnem)) {
            if (norm.includes('IX') || norm.includes('IY')) {
                if (norm.includes('(IX') || norm.includes('(IY')) return 3;
                return 2;
            }
            // ADD HL,rr = 1 byte; ADD A,n = 2; ADD A,r = 1
            if (/(HL|BC|DE|SP)\s*,\s*(HL|BC|DE|SP)/.test(norm)) {
                return /^(ADC|SBC)$/.test(mnem) ? 2 : 1; // ADC/SBC HL,rr = ED prefix
            }
            if (norm.includes('(HL)')) return 1;
            // Check if operand is register
            const lastOp = parts[parts.length - 1];
            if (/^[A-E,H,L]$/.test(lastOp) || lastOp === 'A') return 1;
            return 2; // immediate
        }

        // Fallback: assume 1 byte for unknown
        return 1;
    }

    // Build a mask for anchor bytes that marks 16-bit address operands as
    // don't-care (0x00). This allows anchors to match even when absolute
    // addresses differ between games (e.g. CALL $8100 vs CALL $8050).
    // Opcode and 8-bit operand bytes are marked 0xFF (must match exactly).
    _z80AddrMask(bytes) {
        const n = bytes.length;
        const mask = new Array(n).fill(0xFF);
        let i = 0;
        while (i < n) {
            const b = bytes[i];

            // DD/FD prefix (IX/IY instructions)
            if ((b === 0xDD || b === 0xFD) && i + 1 < n) {
                const b2 = bytes[i + 1];
                if (b2 === 0xCB) {
                    i += 4; continue;                                   // DD/FD CB d op — 4 bytes, no addr
                }
                if (b2 === 0x21 || b2 === 0x22 || b2 === 0x2A) {        // LD IX/IY,nn / LD (nn),IX/IY / LD IX/IY,(nn)
                    if (i + 3 < n) { mask[i + 2] = 0; mask[i + 3] = 0; }
                    i += 4; continue;
                }
                // DD/FD + CALL/JP nn variants
                if (b2 === 0xCD || b2 === 0xC3 || (b2 & 0xC7) === 0xC2 || (b2 & 0xC7) === 0xC4) {
                    if (i + 3 < n) { mask[i + 2] = 0; mask[i + 3] = 0; }
                    i += 4; continue;
                }
                // DD/FD + instruction with displacement byte (e.g. LD (IX+d),r)
                // These are 3 bytes: prefix, opcode, displacement — no 16-bit addr
                // Most DD/FD instructions: check if next byte is a normal 1-byte op
                // Treat prefix as transparent, process next byte normally
                i++; continue;
            }

            // ED prefix
            if (b === 0xED && i + 1 < n) {
                const b2 = bytes[i + 1];
                // LD (nn),rr / LD rr,(nn): ED 43/4B/53/5B/63/6B/73/7B nn nn
                if ((b2 & 0xC7) === 0x43 || (b2 & 0xC7) === 0x4B) {
                    if (i + 3 < n) { mask[i + 2] = 0; mask[i + 3] = 0; }
                    i += 4; continue;
                }
                i += 2; continue;                                       // Other ED ops are 2 bytes
            }

            // CB prefix — all 2 bytes, no addresses
            if (b === 0xCB) { i += 2; continue; }

            // Unprefixed instructions with 16-bit immediate (3 bytes)
            if (b === 0x01 || b === 0x11 || b === 0x21 || b === 0x31 || // LD rr,nn
                b === 0x22 || b === 0x2A ||                             // LD (nn),HL / LD HL,(nn)
                b === 0x32 || b === 0x3A ||                             // LD (nn),A / LD A,(nn)
                b === 0xC3 || b === 0xCD ||                             // JP nn / CALL nn
                (b & 0xC7) === 0xC2 ||                                  // JP cc,nn
                (b & 0xC7) === 0xC4) {                                  // CALL cc,nn
                if (i + 2 < n) { mask[i + 1] = 0; mask[i + 2] = 0; }
                i += 3; continue;
            }

            // 2-byte instructions (8-bit immediate, relative jumps)
            if (b === 0x06 || b === 0x0E || b === 0x16 || b === 0x1E || // LD r,n
                b === 0x26 || b === 0x2E || b === 0x36 || b === 0x3E || // LD r,n / LD (HL),n
                b === 0xC6 || b === 0xCE || b === 0xD6 || b === 0xDE || // ADD/ADC/SUB/SBC A,n
                b === 0xE6 || b === 0xEE || b === 0xF6 || b === 0xFE || // AND/XOR/OR/CP n
                b === 0xD3 || b === 0xDB ||                             // OUT (n),A / IN A,(n)
                b === 0x10 || b === 0x18 ||                             // DJNZ / JR
                b === 0x20 || b === 0x28 || b === 0x30 || b === 0x38) { // JR cc
                i += 2; continue;
            }

            // Everything else: 1-byte instruction
            i++;
        }

        // If mask is all 0xFF, return null (no masking needed — slightly faster matching)
        return mask.some(m => m === 0) ? mask : null;
    }

    // Use the existing sjasmplus assembler to assemble source files into bytes,
    // then build anchors from the output at each labeled address.
    _assembleAndBuildAnchors(fileTexts, mainFile, labels, anchorLen = 16) {
        if (!this._Assembler || !this._VFS) return { anchors: [], symbols: null };
        try {
            // Add all files to VFS for INCLUDE resolution
            this._VFS.reset();
            for (const f of fileTexts) {
                this._VFS.addFile(f.path, f.text);
            }
            // Assemble
            const result = this._Assembler.assembleProject(mainFile.path);
            if (!result || !result.success || !result.output || result.output.length === 0) return { anchors: [], symbols: null };

            const output = result.output;
            const outputStart = result.outputStart;
            const symbols = result.symbols || [];

            // Build anchors from assembled bytes at each symbol address.
            // Uses assembler symbols directly (not parseAsmFiles labels).
            // EQU constants outside the output range are naturally skipped
            // by the offset bounds check below.
            const anchors = [];
            const anchoredNames = new Set();
            for (const sym of symbols) {
                if (!sym.name || typeof sym.value !== 'number') continue;
                if (sym.value < 0 || sym.value > 0xFFFF) continue;
                if (sym.name.startsWith('__')) continue;
                const lname = sym.name.toLowerCase();
                if (anchoredNames.has(lname)) continue;
                anchoredNames.add(lname);

                const addr = sym.value;
                const offset = addr - outputStart;
                if (offset < 0 || offset >= output.length) continue;

                // Collect up to anchorLen consecutive bytes
                const bytes = [];
                let allZero = true, allFF = true;
                for (let i = 0; i < anchorLen && offset + i < output.length; i++) {
                    const b = output[offset + i];
                    bytes.push(b);
                    if (b !== 0x00) allZero = false;
                    if (b !== 0xFF) allFF = false;
                }

                if (bytes.length < 4) continue;
                if (allZero || allFF) continue;

                anchors.push({ address: addr, bytes: bytes, mask: this._z80AddrMask(bytes), label: sym.name });
            }
            return { anchors, symbols, outputStart, outputEnd: outputStart + output.length - 1 };
        } catch (e) {
            console.warn('Signature assembler failed, anchors not built:', e.message);
            return { anchors: [], symbols: null };
        }
    }

    // Assemble a single source string and build anchors from the output.
    // Used by the skool parser (which converts skool → ASM text first).
    _assembleSourceAndBuildAnchors(source, labels, anchorLen = 16) {
        if (!this._Assembler || !source.trim()) return [];
        try {
            const result = this._Assembler.assemble(source, '<skool-import>');
            if (!result || !result.success || !result.output || result.output.length === 0) return [];

            const output = result.output;
            const outputStart = result.outputStart;
            const anchors = [];

            for (const [addrStr, name] of Object.entries(labels)) {
                const addr = parseInt(addrStr, 16) || parseInt(addrStr, 10);
                if (isNaN(addr)) continue;

                const offset = addr - outputStart;
                if (offset < 0 || offset >= output.length) continue;

                const bytes = [];
                let allZero = true, allFF = true;
                for (let i = 0; i < anchorLen && offset + i < output.length; i++) {
                    const b = output[offset + i];
                    bytes.push(b);
                    if (b !== 0x00) allZero = false;
                    if (b !== 0xFF) allFF = false;
                }

                if (bytes.length < 4) continue;
                if (allZero || allFF) continue;

                anchors.push({ address: addr, bytes: bytes, mask: this._z80AddrMask(bytes), label: name });
            }
            return anchors;
        } catch (e) {
            console.warn('Skool assembler failed, anchors not built:', e.message);
            return [];
        }
    }

    // Build/rebuild anchors from current emulator memory for a pack.
    // Use this when anchors weren't auto-built at import time (e.g., JSON pack
    // without anchors), or to refresh anchors using the actual loaded game binary.
    buildAnchorsFromMemory(pack, readByte) {
        const anchors = [];
        const anchorLen = 16; // bytes per anchor

        // Build anchor for every label in the pack
        const entries = [];
        for (const [addrStr, name] of Object.entries(pack.labels)) {
            const addr = parseInt(addrStr, 16) || parseInt(addrStr, 10);
            if (isNaN(addr) || addr > 0xFFFF) continue;
            entries.push({ addr, name });
        }
        entries.sort((a, b) => a.addr - b.addr);

        for (const entry of entries) {
            const addr = entry.addr;
            // Skip if too close to end of address space
            if (addr + anchorLen > 0x10000) continue;

            // Read bytes from memory
            const bytes = [];
            let allZero = true;
            let allFF = true;
            for (let j = 0; j < anchorLen; j++) {
                const b = readByte(addr + j);
                bytes.push(b);
                if (b !== 0x00) allZero = false;
                if (b !== 0xFF) allFF = false;
            }

            // Skip trivial patterns (all zeros, all FF — likely uninitialised memory)
            if (allZero || allFF) continue;

            anchors.push({
                address: addr,
                bytes: bytes,
                mask: this._z80AddrMask(bytes),
                label: entry.name
            });
        }
        return anchors;
    }

    // --- Persistence ---

    _saveEnabledState() {
        const state = {};
        for (const p of this.packs) state[p.id] = p.enabled;
        storageSet('zxm8_sigpacks_enabled', JSON.stringify(state));
    }

    _loadEnabledState() {
        const json = storageGet('zxm8_sigpacks_enabled');
        if (!json) return null;
        try { return JSON.parse(json); } catch(e) { return null; }
    }

    _savePackToStorage(pack) {
        storageSet('zxm8_sigpack_' + pack.id, JSON.stringify(pack));
    }

    _loadPackFromStorage(id) {
        const json = storageGet('zxm8_sigpack_' + id);
        if (!json) return null;
        try { return JSON.parse(json); } catch(e) { return null; }
    }

    // Save index of user-imported packs to localStorage
    _saveCustomIndex() {
        const customPacks = this.packs.filter(p =>
            this._loadPackFromStorage(p.id) !== null
        );
        storageSet('zxm8_sigpacks_custom', JSON.stringify(customPacks));
    }

    // Merge custom packs from localStorage into the index
    _loadCustomIndex() {
        const json = storageGet('zxm8_sigpacks_custom');
        if (!json) return;
        try {
            const custom = JSON.parse(json);
            for (const entry of custom) {
                if (!this.packs.find(p => p.id === entry.id)) {
                    this.packs.push(entry);
                }
            }
        } catch(e) {}
    }

    // Full init: load index + merge custom + load enabled
    async init() {
        await this.loadIndex();
        this._loadCustomIndex();
        // Restore enabled state after merge
        const saved = this._loadEnabledState();
        if (saved) {
            for (const p of this.packs) {
                if (saved[p.id] !== undefined) p.enabled = saved[p.id];
            }
        }
    }

    // Export pack as downloadable JSON
    exportPack(id) {
        const pack = this.loadedPacks[id];
        if (!pack) return null;
        return JSON.stringify(pack, null, 2);
    }

    // Import pack from JSON string
    importPackJSON(jsonStr) {
        try {
            const pack = JSON.parse(jsonStr);
            if (!pack.id || !pack.name) {
                console.warn('Invalid pack: missing id or name');
                return null;
            }
            return this.addPack(pack);
        } catch(e) {
            console.warn('Failed to parse pack JSON:', e);
            return null;
        }
    }

    getPackCount() { return this.packs.length; }
    getEnabledCount() { return this.packs.filter(p => p.enabled).length; }
}
