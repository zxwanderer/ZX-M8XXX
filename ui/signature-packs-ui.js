// signature-packs-ui.js — Signature Packs management UI and GitHub Repository Browser (extracted from index.html)
import { hex8, hex16 } from '../core/utils.js';

export function initSignaturePacksUI({ signaturePackManager, labelManager, regionManager,
                                        getSpectrum, ZipLoader, showMessage, updateDebugger }) {
    // ========== Signature Packs UI ==========
    function renderSigPackList() {
        const container = document.getElementById('sigPackList');
        if (!container) return;
        container.innerHTML = '';

        if (signaturePackManager.packs.length === 0) {
            container.innerHTML = '<div style="color: var(--text-secondary); font-size: 11px; font-style: italic;">No signature packs loaded. Import a .skool or pack JSON file.</div>';
            return;
        }

        for (const entry of signaturePackManager.packs) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'margin-bottom: 4px;';

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 3px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: 3px;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = entry.enabled;
            cb.title = 'Enable/disable this pack';
            cb.addEventListener('change', () => {
                signaturePackManager.setEnabled(entry.id, cb.checked);
            });

            const typeSpan = document.createElement('span');
            typeSpan.style.cssText = 'font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; padding: 1px 4px; border-radius: 2px; background: var(--bg-button); color: var(--text-secondary);';
            typeSpan.textContent = entry.type || 'game';

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'flex: 1; font-size: 11px; color: var(--text-primary);';
            nameSpan.textContent = entry.name || entry.id;

            const pack = signaturePackManager.loadedPacks[entry.id];
            const statsSpan = document.createElement('span');
            statsSpan.style.cssText = 'font-size: 10px; color: var(--text-secondary);';
            if (pack && pack.stats) {
                statsSpan.textContent = `${pack.stats.labels}L ${pack.stats.regions}R ${pack.stats.anchors}A`;
                statsSpan.title = `${pack.stats.labels} labels, ${pack.stats.regions} regions, ${pack.stats.anchors} anchors`;
            }

            const btnExport = document.createElement('button');
            btnExport.textContent = 'Export';
            btnExport.style.cssText = 'font-size: 10px; padding: 1px 6px;';
            btnExport.title = 'Export pack as JSON';
            btnExport.addEventListener('click', async () => {
                await signaturePackManager.loadPack(entry.id);
                const json = signaturePackManager.exportPack(entry.id);
                if (json) {
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = entry.id + '.json';
                    a.click();
                    URL.revokeObjectURL(url);
                }
            });

            // Anchor detail panel (collapsible, below the row)
            const anchorPanel = document.createElement('div');
            anchorPanel.style.cssText = 'display: none; background: var(--bg-primary); border: 1px solid var(--border-primary); border-top: none; border-radius: 0 0 3px 3px; padding: 4px 6px; max-height: 200px; overflow-y: auto;';

            function renderAnchorPanel(targetPack) {
                anchorPanel.innerHTML = '';
                if (!targetPack || !targetPack.anchors || targetPack.anchors.length === 0) {
                    anchorPanel.innerHTML = '<div style="color: var(--text-secondary); font-size: 10px; font-style: italic;">No anchors. Load the game in emulator and click Build to create anchors from memory.</div>';
                    return;
                }
                const header = document.createElement('div');
                header.style.cssText = 'font-size: 10px; color: var(--cyan); margin-bottom: 3px;';
                header.textContent = `${targetPack.anchors.length} anchors (${targetPack.anchors[0].bytes.length} bytes each)`;
                anchorPanel.appendChild(header);

                const table = document.createElement('div');
                table.style.cssText = 'font-family: monospace; font-size: 10px; line-height: 1.4;';
                for (const anchor of targetPack.anchors) {
                    const line = document.createElement('div');
                    line.style.cssText = 'display: flex; gap: 8px; padding: 1px 0; border-bottom: 1px solid var(--bg-tertiary);';
                    const addrSpan = document.createElement('span');
                    addrSpan.style.cssText = 'color: var(--cyan); min-width: 36px;';
                    addrSpan.textContent = '$' + hex16(anchor.address);
                    const labelSpan = document.createElement('span');
                    labelSpan.style.cssText = 'color: var(--green); min-width: 120px; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    labelSpan.textContent = anchor.label;
                    labelSpan.title = anchor.label;
                    const hexSpan = document.createElement('span');
                    hexSpan.style.cssText = 'white-space: nowrap;';
                    if (anchor.mask) {
                        // Show masked bytes dimmed (address operands that are ignored during matching)
                        hexSpan.innerHTML = anchor.bytes.map((b, i) => {
                            const h = hex8(b);
                            return anchor.mask[i] === 0
                                ? `<span style="opacity:0.3" title="masked (address operand)">${h}</span>`
                                : `<span style="color:var(--text-secondary)">${h}</span>`;
                        }).join(' ');
                    } else {
                        hexSpan.style.color = 'var(--text-secondary)';
                        hexSpan.textContent = anchor.bytes.map(b => hex8(b)).join(' ');
                    }
                    line.appendChild(addrSpan);
                    line.appendChild(labelSpan);
                    line.appendChild(hexSpan);
                    table.appendChild(line);
                }
                anchorPanel.appendChild(table);
            }

            const btnBuildAnchors = document.createElement('button');
            btnBuildAnchors.textContent = 'Build';
            btnBuildAnchors.style.cssText = 'font-size: 10px; padding: 1px 6px;';
            btnBuildAnchors.title = 'Build anchor patterns from current memory';
            btnBuildAnchors.addEventListener('click', async () => {
                if (!pack) {
                    await signaturePackManager.loadPack(entry.id);
                }
                const loadedPack = signaturePackManager.loadedPacks[entry.id];
                if (!loadedPack) { showMessage('Pack not loaded'); return; }
                const spectrum = getSpectrum();
                const readByte = (addr) => spectrum.memory.read(addr);
                const anchors = signaturePackManager.buildAnchorsFromMemory(loadedPack, readByte);
                loadedPack.anchors = anchors;
                loadedPack.stats.anchors = anchors.length;
                signaturePackManager._savePackToStorage(loadedPack);
                // Update stats display
                statsSpan.textContent = `${loadedPack.stats.labels}L ${loadedPack.stats.regions}R ${loadedPack.stats.anchors}A`;
                statsSpan.title = `${loadedPack.stats.labels} labels, ${loadedPack.stats.regions} regions, ${loadedPack.stats.anchors} anchors`;
                // Show anchor panel
                renderAnchorPanel(loadedPack);
                anchorPanel.style.display = 'block';
                row.style.borderRadius = '3px 3px 0 0';
                showMessage(`Built ${anchors.length} anchors for "${loadedPack.name}"`);
            });

            const btnDirectApply = document.createElement('button');
            btnDirectApply.textContent = 'Apply';
            btnDirectApply.style.cssText = 'font-size: 10px; padding: 1px 6px;';
            btnDirectApply.title = 'Apply all labels from this pack directly (no scanning)';
            btnDirectApply.addEventListener('click', async () => {
                if (!signaturePackManager.loadedPacks[entry.id]) {
                    const stored = signaturePackManager._loadPackFromStorage(entry.id);
                    if (stored) signaturePackManager.loadedPacks[entry.id] = stored;
                    else await signaturePackManager.loadPack(entry.id);
                }
                const loadedPack = signaturePackManager.loadedPacks[entry.id];
                if (!loadedPack || !loadedPack.labels) { showMessage('Pack has no labels'); return; }
                // Apply all labels at offset 0 (direct, no matching)
                const prevAutoSave = labelManager.autoSaveEnabled;
                labelManager.autoSaveEnabled = false;
                const labelCount = signaturePackManager._applyLabelsWithOffset(loadedPack, 0, labelManager, null);
                const regionCount = signaturePackManager._applyRegionsWithOffset(loadedPack, 0, regionManager, null);
                labelManager.autoSaveEnabled = prevAutoSave;
                if (prevAutoSave) labelManager._autoSave();
                showMessage(`Applied ${labelCount} labels, ${regionCount} regions from "${loadedPack.name}"`);
                if (typeof updateDebugger === 'function') updateDebugger();
            });

            const btnViewAnchors = document.createElement('button');
            btnViewAnchors.textContent = 'View';
            btnViewAnchors.style.cssText = 'font-size: 10px; padding: 1px 6px;';
            btnViewAnchors.title = 'View/hide anchor patterns';
            btnViewAnchors.addEventListener('click', async () => {
                if (anchorPanel.style.display !== 'none') {
                    anchorPanel.style.display = 'none';
                    row.style.borderRadius = '3px';
                    return;
                }
                if (!pack) {
                    await signaturePackManager.loadPack(entry.id);
                }
                const loadedPack = signaturePackManager.loadedPacks[entry.id];
                renderAnchorPanel(loadedPack);
                anchorPanel.style.display = 'block';
                row.style.borderRadius = '3px 3px 0 0';
            });

            const btnRemove = document.createElement('button');
            btnRemove.textContent = '\u00D7';
            btnRemove.style.cssText = 'font-size: 12px; padding: 1px 5px; color: var(--error);';
            btnRemove.title = 'Remove this pack';
            btnRemove.addEventListener('click', () => {
                signaturePackManager.removePack(entry.id);
                renderSigPackList();
                showMessage(`Removed pack "${entry.name || entry.id}"`);
            });

            row.appendChild(cb);
            row.appendChild(typeSpan);
            row.appendChild(nameSpan);
            row.appendChild(statsSpan);
            row.appendChild(btnDirectApply);
            row.appendChild(btnBuildAnchors);
            row.appendChild(btnViewAnchors);
            row.appendChild(btnExport);
            row.appendChild(btnRemove);
            wrapper.appendChild(row);
            wrapper.appendChild(anchorPanel);
            container.appendChild(wrapper);
        }
    }

    // Import source files (.skool, .asm, .a80, .zip containing any mix)
    document.getElementById('btnSigImportSkool').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.skool,.asm,.a80,.z80asm,.txt,.zip';
        input.multiple = true;
        input.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            // Collect all source file texts (from direct files and ZIP contents)
            const allFileTexts = [];
            const decoder = new TextDecoder('utf-8');

            for (const file of files) {
                const lower = file.name.toLowerCase();
                if (lower.endsWith('.zip')) {
                    // Extract source files from ZIP
                    const zipData = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
                        reader.onload = () => resolve(reader.result);
                        reader.readAsArrayBuffer(file);
                    });
                    const zipFiles = await ZipLoader.extract(zipData);
                    const zipName = file.name.replace(/\.zip$/i, '');
                    for (const zf of zipFiles) {
                        const zfLower = zf.name.toLowerCase();
                        if (zfLower.endsWith('.skool') || zfLower.endsWith('.asm') ||
                            zfLower.endsWith('.a80') || zfLower.endsWith('.z80asm') || zfLower.endsWith('.txt')) {
                            allFileTexts.push({ path: zf.name, text: decoder.decode(zf.data), fileName: zf.name, zipName });
                        }
                    }
                } else {
                    // Direct source file
                    const text = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onerror = () => reject(new Error('Failed to read file: ' + file.name));
                        reader.onload = () => resolve(reader.result);
                        reader.readAsText(file);
                    });
                    allFileTexts.push({ path: file.name, text, fileName: file.name, zipName: null });
                }
            }

            if (allFileTexts.length === 0) {
                showMessage('No source files found');
                return;
            }

            // Separate by type
            const skoolFiles = allFileTexts.filter(f => f.fileName.toLowerCase().endsWith('.skool'));
            const asmFiles = allFileTexts.filter(f => {
                const lower = f.fileName.toLowerCase();
                return lower.endsWith('.asm') || lower.endsWith('.a80') || lower.endsWith('.z80asm') ||
                       (lower.endsWith('.txt') && !lower.endsWith('.skool'));
            });

            // Process .skool files individually
            for (const f of skoolFiles) {
                const baseName = f.fileName.replace(/\.(skool|txt)$/i, '');
                const packId = baseName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                const pack = signaturePackManager.parseSkoolFile(f.text, packId, baseName);
                signaturePackManager.addPack(pack);
                showMessage(`Imported "${baseName}": ${pack.stats.labels} labels, ${pack.stats.anchors} anchors`);
            }

            // Process .asm files as a batch
            if (asmFiles.length > 0) {
                const mainName = (asmFiles[0].zipName || asmFiles[0].fileName).replace(/\.(asm|a80|z80asm|txt|zip)$/i, '');
                const packId = mainName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                const pack = signaturePackManager.parseAsmFiles(asmFiles, packId, mainName);
                signaturePackManager.addPack(pack);
                showMessage(`Imported "${mainName}": ${pack.stats.labels} labels, ${pack.stats.anchors} anchors`);
            }

            renderSigPackList();
        }, { once: true });
        input.click();
    });

    // Import pack JSON
    document.getElementById('btnSigImportPack').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onerror = () => showMessage('Failed to read file: ' + file.name, 'error');
            reader.onload = () => {
                const entry = signaturePackManager.importPackJSON(reader.result);
                if (entry) {
                    renderSigPackList();
                    showMessage(`Imported pack "${entry.name}"`);
                } else {
                    showMessage('Failed to import pack');
                }
            };
            reader.readAsText(file);
        }, { once: true });
        input.click();
    });

    // Scan memory for matches
    document.getElementById('btnSigScanMemory').addEventListener('click', async () => {
        const resultsDiv = document.getElementById('sigScanResults');
        resultsDiv.classList.remove('hidden');
        resultsDiv.textContent = 'Scanning...';

        await signaturePackManager.loadAllEnabled();

        // Build memory segments to scan:
        // - Current mapped memory $5C00-$FFFF (skip screen $4000-$5BFF)
        // - All RAM pages (128K+) that aren't currently mapped
        const spectrum = getSpectrum();
        const mem = spectrum.memory;
        const segments = [];

        if (mem.profile.ramPages === 1) {
            // 48K: single block, skip screen area
            segments.push({
                label: 'RAM',
                readByte: (addr) => mem.read(addr),
                start: 0x5C00,
                end: 0xFFFF
            });
        } else {
            // 128K+: scan each RAM page as a flat 16K block
            const pageCount = mem.ram.length;
            for (let page = 0; page < pageCount; page++) {
                const pageData = mem.ram[page];
                segments.push({
                    label: `Page ${page}`,
                    page: page,
                    readByte: (addr) => pageData[addr],
                    start: 0,
                    end: 0x3FFF
                });
            }
        }

        // Scan all segments, merge results
        let allResults = [];
        for (const seg of segments) {
            resultsDiv.textContent = `Scanning ${seg.label}...`;
            const results = signaturePackManager.scanMemory(seg.readByte, seg.start, seg.end);
            for (const r of results) {
                r.segment = seg.label;
                r.page = seg.page;
            }
            allResults.push(...results);
        }

        // Deduplicate: if same pack matched in multiple segments, keep best
        const bestByPack = {};
        for (const r of allResults) {
            const existing = bestByPack[r.packId];
            if (!existing || r.confidence > existing.confidence ||
                (r.confidence === existing.confidence && r.matched > existing.matched)) {
                bestByPack[r.packId] = r;
            }
        }
        const results = Object.values(bestByPack).sort((a, b) => b.confidence - a.confidence);

        if (results.length === 0) {
            resultsDiv.innerHTML = '<span style="color: var(--text-secondary);">No matches found. Load a program and ensure packs have anchors built.</span>';
            return;
        }

        resultsDiv.innerHTML = '';
        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom: 4px; color: var(--cyan); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;';
        header.textContent = 'Scan Results';
        resultsDiv.appendChild(header);

        for (const r of results) {
            const block = document.createElement('div');
            block.style.cssText = 'margin-bottom: 6px; padding: 4px 6px; background: var(--bg-primary); border-radius: 2px;';

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 2px;';

            const confidence = Math.round(r.confidence * 100);
            const confSpan = document.createElement('span');
            confSpan.style.cssText = `font-size: 10px; min-width: 36px; font-weight: bold; color: ${confidence >= 75 ? 'var(--green)' : confidence >= 50 ? 'var(--yellow)' : 'var(--error)'};`;
            confSpan.textContent = confidence + '%';

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'flex: 1; font-size: 11px;';
            const segInfo = r.segment ? ` [${r.segment}]` : '';
            nameSpan.textContent = r.pack.name + ` (${r.matched}/${r.total} anchors)${segInfo}`;

            // Determine offset mode
            const offsets = r.anchorMatches.map(m => m.offset);
            const uniqueOffsets = [...new Set(offsets)];
            const modeSpan = document.createElement('span');
            modeSpan.style.cssText = 'font-size: 9px; padding: 1px 4px; border-radius: 2px; background: var(--bg-button); color: var(--text-secondary);';
            if (uniqueOffsets.length === 1) {
                const off = uniqueOffsets[0];
                modeSpan.textContent = off === 0 ? 'exact' : `offset ${off >= 0 ? '+' : ''}${off}`;
                modeSpan.title = 'All matched anchors at consistent offset';
            } else {
                // Count how many anchors have the dominant offset
                const offCounts = {};
                for (const o of offsets) offCounts[o] = (offCounts[o] || 0) + 1;
                const topOff = Object.entries(offCounts).sort((a, b) => b[1] - a[1]);
                modeSpan.textContent = `${uniqueOffsets.length} offsets`;
                const details = topOff.slice(0, 3).map(([o, c]) => {
                    const n = parseInt(o);
                    return `${n === 0 ? '0' : (n >= 0 ? '+' : '') + n}: ${c}`;
                }).join(', ');
                modeSpan.title = `Procedures at different offsets (${details})`;
            }

            const btnApply = document.createElement('button');
            btnApply.textContent = 'Apply';
            btnApply.style.cssText = 'font-size: 10px; padding: 1px 8px;';
            btnApply.title = 'Apply labels using per-anchor offsets';
            btnApply.addEventListener('click', () => {
                const result = signaturePackManager.applyLabels(r, labelManager, regionManager, r.page);
                let offStr = '';
                if (result.uniqueOffsets === 1) {
                    offStr = result.offset === 0 ? '' : ` at offset ${result.offset >= 0 ? '+' : ''}${result.offset}`;
                } else {
                    offStr = ` across ${result.uniqueOffsets} offsets`;
                }
                showMessage(`Applied ${result.labelCount} labels, ${result.regionCount} regions from "${r.pack.name}"${offStr}`);
                if (typeof updateDebugger === 'function') updateDebugger();
            });

            row.appendChild(confSpan);
            row.appendChild(nameSpan);
            row.appendChild(modeSpan);
            row.appendChild(btnApply);
            block.appendChild(row);

            // Show per-anchor details
            const details = document.createElement('div');
            details.style.cssText = 'font-size: 10px; color: var(--text-secondary); margin-left: 44px;';
            for (const m of r.anchorMatches) {
                const line = document.createElement('div');
                const label = m.anchor.label || '?';
                const offStr = m.offset === 0 ? '' : ` (${m.offset >= 0 ? '+' : ''}${m.offset})`;
                const pagePrefix = r.page !== undefined ? `p${r.page}:` : '';
                line.textContent = `${label}: ${hex16(m.origAddr)} → ${pagePrefix}${hex16(m.foundAddr)}${offStr}`;
                details.appendChild(line);
            }
            block.appendChild(details);

            resultsDiv.appendChild(block);
        }
    });

    // ========== GitHub Repository Browser ==========
    const sigGitHubBrowser = document.getElementById('sigGitHubBrowser');
    const sigGitHubUrl = document.getElementById('sigGitHubUrl');
    const sigGitHubStatus = document.getElementById('sigGitHubStatus');
    const sigGitHubFileList = document.getElementById('sigGitHubFileList');
    const sigGitHubActions = document.getElementById('sigGitHubActions');
    const sigGitHubSelected = document.getElementById('sigGitHubSelected');
    let sigGitHubFiles = [];  // Array of { path, name, download_url, size, checked }
    let sigGitHubCurrentPath = '';  // Current browsed path within repo
    let sigGitHubOwnerRepo = '';    // "owner/repo"

    // Parse GitHub URL into owner/repo
    function parseGitHubRepo(input) {
        input = input.trim();
        // Full URL: https://github.com/owner/repo/...
        const urlMatch = input.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (urlMatch) return urlMatch[1].replace(/\.git$/, '');
        // Short form: owner/repo
        if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(input)) return input;
        return null;
    }

    // Fetch directory listing from GitHub API
    async function fetchGitHubDir(ownerRepo, path) {
        const apiUrl = `https://api.github.com/repos/${ownerRepo}/contents/${path}`;
        const resp = await fetch(apiUrl);
        if (!resp.ok) {
            if (resp.status === 403) throw new Error('GitHub API rate limit exceeded. Try again later.');
            if (resp.status === 404) throw new Error('Repository or path not found.');
            throw new Error(`GitHub API error: ${resp.status}`);
        }
        return await resp.json();
    }

    // Recursively find .skool and .json files in a repo
    async function scanGitHubRepo(ownerRepo, path, depth) {
        if (depth > 3) return []; // Limit recursion depth
        const items = await fetchGitHubDir(ownerRepo, path);
        if (!Array.isArray(items)) return [];

        const results = [];
        const subdirs = [];

        for (const item of items) {
            if (item.type === 'file') {
                const lower = item.name.toLowerCase();
                if (lower.endsWith('.skool') || lower.endsWith('.json') ||
                    lower.endsWith('.asm') || lower.endsWith('.a80') || lower.endsWith('.z80asm')) {
                    results.push({
                        path: item.path,
                        name: item.name,
                        download_url: item.download_url,
                        size: item.size,
                        checked: !lower.endsWith('.json') // pre-check .skool and .asm files
                    });
                }
            } else if (item.type === 'dir') {
                subdirs.push(item.path);
            }
        }

        // Scan subdirectories
        for (const subdir of subdirs) {
            sigGitHubStatus.textContent = `Scanning ${subdir}...`;
            const subResults = await scanGitHubRepo(ownerRepo, subdir, depth + 1);
            results.push(...subResults);
        }

        return results;
    }

    // Render the file list with checkboxes
    function renderGitHubFileList() {
        sigGitHubFileList.innerHTML = '';
        if (sigGitHubFiles.length === 0) {
            sigGitHubFileList.innerHTML = '<div style="color: var(--text-secondary); font-size: 11px; font-style: italic;">No .skool or .json files found.</div>';
            sigGitHubActions.classList.add('hidden');
            return;
        }

        for (let i = 0; i < sigGitHubFiles.length; i++) {
            const f = sigGitHubFiles[i];
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 2px 0;';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = f.checked;
            cb.dataset.idx = i;
            cb.addEventListener('change', () => {
                sigGitHubFiles[i].checked = cb.checked;
                updateGitHubSelectedCount();
            });

            const icon = document.createElement('span');
            icon.style.cssText = 'font-size: 10px; color: var(--text-secondary);';
            const ext = f.name.split('.').pop().toLowerCase();
            icon.textContent = ext === 'skool' ? 'SKOOL' : ext === 'json' ? 'JSON' : 'ASM';

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'flex: 1; font-size: 11px; color: var(--text-primary);';
            nameSpan.textContent = f.path;
            nameSpan.title = f.download_url;

            const sizeSpan = document.createElement('span');
            sizeSpan.style.cssText = 'font-size: 10px; color: var(--text-secondary); min-width: 50px; text-align: right;';
            sizeSpan.textContent = f.size > 1024 ? Math.round(f.size / 1024) + ' KB' : f.size + ' B';

            row.appendChild(cb);
            row.appendChild(icon);
            row.appendChild(nameSpan);
            row.appendChild(sizeSpan);
            sigGitHubFileList.appendChild(row);
        }

        sigGitHubActions.classList.remove('hidden');
        updateGitHubSelectedCount();
    }

    function updateGitHubSelectedCount() {
        const count = sigGitHubFiles.filter(f => f.checked).length;
        sigGitHubSelected.textContent = `${count} of ${sigGitHubFiles.length} selected`;
    }

    // Toggle GitHub browser
    document.getElementById('btnSigGitHub').addEventListener('click', () => {
        sigGitHubBrowser.classList.toggle('hidden');
        if (!sigGitHubBrowser.classList.contains('hidden')) {
            sigGitHubUrl.focus();
        }
    });

    document.getElementById('btnSigGitHubClose').addEventListener('click', () => {
        sigGitHubBrowser.classList.add('hidden');
    });

    // Browse repo
    document.getElementById('btnSigGitHubFetch').addEventListener('click', async () => {
        const ownerRepo = parseGitHubRepo(sigGitHubUrl.value);
        if (!ownerRepo) {
            sigGitHubStatus.textContent = 'Enter a valid GitHub URL or owner/repo';
            return;
        }
        sigGitHubOwnerRepo = ownerRepo;
        sigGitHubStatus.textContent = `Scanning ${ownerRepo}...`;
        sigGitHubFileList.innerHTML = '';
        sigGitHubActions.classList.add('hidden');

        try {
            sigGitHubFiles = await scanGitHubRepo(ownerRepo, '', 0);
            sigGitHubStatus.textContent = `Found ${sigGitHubFiles.length} file(s) in ${ownerRepo}`;
            renderGitHubFileList();
        } catch (e) {
            sigGitHubStatus.textContent = e.message;
            sigGitHubFiles = [];
        }
    });

    // Handle Enter key in URL input
    sigGitHubUrl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btnSigGitHubFetch').click();
        }
    });

    // Import selected files
    document.getElementById('btnSigGitHubImport').addEventListener('click', async () => {
        const selected = sigGitHubFiles.filter(f => f.checked);
        if (selected.length === 0) {
            sigGitHubStatus.textContent = 'No files selected';
            return;
        }

        let imported = 0;
        let failed = 0;

        // Separate files by type
        const skoolFiles = selected.filter(f => f.name.toLowerCase().endsWith('.skool'));
        const jsonFiles = selected.filter(f => f.name.toLowerCase().endsWith('.json'));
        const asmFiles = selected.filter(f => {
            const lower = f.name.toLowerCase();
            return lower.endsWith('.asm') || lower.endsWith('.a80') || lower.endsWith('.z80asm');
        });

        // Process .skool files individually
        for (const file of skoolFiles) {
            sigGitHubStatus.textContent = `Downloading ${file.name}...`;
            try {
                const resp = await fetch(file.download_url);
                if (!resp.ok) { failed++; continue; }
                const text = await resp.text();
                const baseName = file.name.replace(/\.(skool|txt)$/i, '');
                const packId = baseName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                const pack = signaturePackManager.parseSkoolFile(text, packId, baseName);
                pack.source = `github:${sigGitHubOwnerRepo}/${file.path}`;
                signaturePackManager.addPack(pack);
                imported++;
            } catch (e) {
                console.warn('Failed to import:', file.path, e);
                failed++;
            }
        }

        // Process .json files individually
        for (const file of jsonFiles) {
            sigGitHubStatus.textContent = `Downloading ${file.name}...`;
            try {
                const resp = await fetch(file.download_url);
                if (!resp.ok) { failed++; continue; }
                const text = await resp.text();
                const entry = signaturePackManager.importPackJSON(text);
                if (entry) imported++; else failed++;
            } catch (e) {
                console.warn('Failed to import:', file.path, e);
                failed++;
            }
        }

        // Process .asm files as a batch (for INCLUDE resolution)
        if (asmFiles.length > 0) {
            sigGitHubStatus.textContent = `Downloading ${asmFiles.length} ASM files...`;
            const fileTexts = [];
            let allOk = true;

            // Also download all unchecked .asm files in the repo for INCLUDE resolution
            const allAsmInRepo = sigGitHubFiles.filter(f => {
                const lower = f.name.toLowerCase();
                return lower.endsWith('.asm') || lower.endsWith('.a80') || lower.endsWith('.z80asm');
            });

            for (const file of allAsmInRepo) {
                sigGitHubStatus.textContent = `Downloading ${file.name}...`;
                try {
                    const resp = await fetch(file.download_url);
                    if (!resp.ok) { if (file.checked) allOk = false; continue; }
                    const text = await resp.text();
                    fileTexts.push({ path: file.path, text: text });
                } catch (e) {
                    console.warn('Failed to download:', file.path, e);
                    if (file.checked) allOk = false;
                }
            }

            if (fileTexts.length > 0) {
                sigGitHubStatus.textContent = 'Parsing ASM files...';
                try {
                    const repoName = sigGitHubOwnerRepo.split('/').pop();
                    const packId = repoName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                    const pack = signaturePackManager.parseAsmFiles(fileTexts, packId, repoName);
                    pack.source = `github:${sigGitHubOwnerRepo}`;
                    signaturePackManager.addPack(pack);
                    imported++;
                } catch (e) {
                    console.warn('Failed to parse ASM files:', e);
                    failed++;
                }
            }
        }

        sigGitHubStatus.textContent = `Imported ${imported} pack(s)` + (failed ? `, ${failed} failed` : '');
        renderSigPackList();
        if (imported > 0) showMessage(`Imported ${imported} pack(s) from GitHub`);
    });

    // Initialize signature packs on startup
    signaturePackManager.init().then(() => renderSigPackList());

    return { renderSigPackList };
}
