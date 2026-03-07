// explorer.js — File analysis tool (extracted from index.html)
import { hex8, hex16 } from '../core/utils.js';
import {
    SLOT1_START,
    SCREEN_SIZE, SCREEN_BITMAP_SIZE, SCREEN_ATTR_SIZE,
    SCREEN_WIDTH, SCREEN_HEIGHT
} from '../core/constants.js';
function isFlowBreak(mnemonic) {
    const mn = mnemonic.replace(/<[^>]+>/g, '').toUpperCase();
    return mn.startsWith('JP') || mn.startsWith('JR') ||
           mn.startsWith('RET') || mn.startsWith('DJNZ') ||
           mn.startsWith('RST') || mn.startsWith('CALL') ||
           mn === 'HALT';
}

export function initExplorer({ DSKLoader, Disassembler, SZXLoader, RZXLoader, ZipLoader, pako, getPalette, getRomLabels }) {
    // ========== Explorer Tab ==========
    const explorerFileInput = document.getElementById('explorerFileInput');
    const btnExplorerLoad = document.getElementById('btnExplorerLoad');
    const explorerFileName = document.getElementById('explorerFileName');
    const explorerFileSize = document.getElementById('explorerFileSize');
    const explorerInfoOutput = document.getElementById('explorerInfoOutput');
    const explorerBasicOutput = document.getElementById('explorerBasicOutput');
    const explorerBasicSource = document.getElementById('explorerBasicSource');
    const explorerDisasmOutput = document.getElementById('explorerDisasmOutput');
    const explorerDisasmAddr = document.getElementById('explorerDisasmAddr');
    const explorerDisasmLen = document.getElementById('explorerDisasmLen');
    const explorerDisasmSource = document.getElementById('explorerDisasmSource');
    const btnExplorerDisasm = document.getElementById('btnExplorerDisasm');
    const explorerHexOutput = document.getElementById('explorerHexOutput');
    const explorerHexAddr = document.getElementById('explorerHexAddr');
    const explorerHexLen = document.getElementById('explorerHexLen');
    const explorerHexSource = document.getElementById('explorerHexSource');
    const btnExplorerHex = document.getElementById('btnExplorerHex');

    // Explorer state
    let explorerData = null;         // Raw file data
    let explorerParsed = null;       // Parsed file structure
    let explorerFileType = null;     // 'tap', 'sna', 'z80', 'trd', 'scl', 'zip'
    let explorerBlocks = [];         // Parsed blocks/files
    let explorerZipFiles = [];       // Files from ZIP archive
    let explorerZipParentName = null; // Store parent ZIP name for drill-down

    // Preview canvas elements
    const explorerPreviewContainer = document.getElementById('explorerPreviewContainer');
    const explorerPreviewCanvas = document.getElementById('explorerPreviewCanvas');
    const explorerPreviewLabel = document.getElementById('explorerPreviewLabel');
    const explorerPreviewCtx = explorerPreviewCanvas.getContext('2d');

    // Get current palette from ULA (falls back to default if not available)
    function getExplorerPalette() {
        const palette = getPalette();
        if (palette) {
            // ULA palette is 16 colors: 0-7 regular, 8-15 bright
            return {
                regular: palette.slice(0, 8).map(c => [c[0], c[1], c[2]]),
                bright: palette.slice(8, 16).map(c => [c[0], c[1], c[2]])
            };
        }
        // Default palette if ULA not available
        return {
            regular: [[0,0,0], [0,0,215], [215,0,0], [215,0,215], [0,215,0], [0,215,215], [215,215,0], [215,215,215]],
            bright: [[0,0,0], [0,0,255], [255,0,0], [255,0,255], [0,255,0], [0,255,255], [255,255,0], [255,255,255]]
        };
    }

    // Preview rendering functions
    function explorerUpdatePreview(data, blockData = null) {
        if (!data) {
            explorerPreviewContainer.style.display = 'none';
            return;
        }

        const len = data.length;
        let previewType = null;
        let label = '';

        // Detect preview type by size
        if (len === SCREEN_SIZE) {
            previewType = 'scr';
            label = 'Screen (6912 bytes)';
        } else if (len === SCREEN_BITMAP_SIZE) {
            previewType = 'mono_full';
            label = 'Bitmap (6144 bytes)';
        } else if (len === 4096) {
            previewType = 'mono_2_3';
            label = 'Bitmap 2/3 (4096 bytes)';
        } else if (len === 2048) {
            previewType = 'mono_1_3';
            label = 'Bitmap 1/3 (2048 bytes)';
        } else if (len === 768) {
            previewType = 'font';
            label = 'Font / Attributes (768 bytes)';
        } else if (len === 9216) {
            previewType = 'ifl';
            label = 'IFL 8×2 Multicolor (9216 bytes)';
        } else if (len === 12288) {
            previewType = 'mlt';
            label = 'MLT 8×1 Multicolor (12288 bytes)';
        } else if (len === 18432) {
            previewType = 'rgb3';
            label = 'RGB3 Tricolor (18432 bytes)';
        }

        if (!previewType) {
            explorerPreviewContainer.style.display = 'none';
            return;
        }

        // Show preview
        explorerPreviewContainer.style.display = 'flex';
        explorerPreviewLabel.textContent = label;

        // Render based on type
        switch (previewType) {
            case 'scr':
                explorerRenderSCR(data);
                break;
            case 'mono_full':
                explorerRenderMono(data, 3);
                break;
            case 'mono_2_3':
                explorerRenderMono(data, 2);
                break;
            case 'mono_1_3':
                explorerRenderMono(data, 1);
                break;
            case 'font':
                explorerRenderFont(data);
                break;
            case 'ifl':
                explorerRenderIFL(data);
                break;
            case 'mlt':
                explorerRenderMLT(data);
                break;
            case 'rgb3':
                explorerRenderRGB3(data);
                break;
        }
    }

    function explorerRenderSCR(data) {
        explorerPreviewCanvas.width = SCREEN_WIDTH;
        explorerPreviewCanvas.height = SCREEN_HEIGHT;
        const imageData = explorerPreviewCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        const pixels = imageData.data;

        // Process all three screen thirds
        const sections = [
            { bitmapAddr: 0, attrAddr: SCREEN_BITMAP_SIZE, yOffset: 0 },
            { bitmapAddr: 2048, attrAddr: SCREEN_BITMAP_SIZE + 256, yOffset: 64 },
            { bitmapAddr: 4096, attrAddr: SCREEN_BITMAP_SIZE + 512, yOffset: 128 }
        ];

        for (const section of sections) {
            const { bitmapAddr, attrAddr, yOffset } = section;
            for (let line = 0; line < 8; line++) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 32; col++) {
                        const bitmapOffset = bitmapAddr + col + row * 32 + line * SCREEN_WIDTH;
                        const byte = data[bitmapOffset];
                        const attrOffset = attrAddr + col + row * 32;
                        const attr = data[attrOffset];

                        const isBright = (attr & 0x40) !== 0;
                        const ink = attr & 0x07;
                        const paper = (attr >> 3) & 0x07;
                        const pal = getExplorerPalette();
                        const palette = isBright ? pal.bright : pal.regular;
                        const inkRgb = palette[ink];
                        const paperRgb = palette[paper];

                        const x = col * 8;
                        const y = yOffset + row * 8 + line;

                        for (let bit = 0; bit < 8; bit++) {
                            const isSet = (byte & (0x80 >> bit)) !== 0;
                            const rgb = isSet ? inkRgb : paperRgb;
                            const idx = ((y * SCREEN_WIDTH) + x + bit) * 4;
                            pixels[idx] = rgb[0];
                            pixels[idx + 1] = rgb[1];
                            pixels[idx + 2] = rgb[2];
                            pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }

        explorerPreviewCtx.putImageData(imageData, 0, 0);
    }

    function explorerRenderMono(data, thirds) {
        explorerPreviewCanvas.width = SCREEN_WIDTH;
        explorerPreviewCanvas.height = SCREEN_HEIGHT;
        const imageData = explorerPreviewCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        const pixels = imageData.data;

        // Fill with black
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 255;
        }

        const ink = [215, 215, 215];
        const paper = [0, 0, 0];

        for (let third = 0; third < thirds; third++) {
            const bitmapBase = third * 2048;
            for (let y = 0; y < 64; y++) {
                const charRow = Math.floor(y / 8);
                const pixelLine = y % 8;
                const bitmapOffset = bitmapBase + charRow * 32 + pixelLine * SCREEN_WIDTH;

                for (let col = 0; col < 32; col++) {
                    const byte = data[bitmapOffset + col];
                    const screenY = third * 64 + y;
                    const x = col * 8;

                    for (let bit = 0; bit < 8; bit++) {
                        const isSet = (byte & (0x80 >> bit)) !== 0;
                        const rgb = isSet ? ink : paper;
                        const idx = ((screenY * SCREEN_WIDTH) + x + bit) * 4;
                        pixels[idx] = rgb[0];
                        pixels[idx + 1] = rgb[1];
                        pixels[idx + 2] = rgb[2];
                        pixels[idx + 3] = 255;
                    }
                }
            }
        }

        explorerPreviewCtx.putImageData(imageData, 0, 0);
    }

    function explorerRenderFont(data) {
        // 96 chars, 8 bytes each = 768 bytes
        // Render as 16x6 grid (96 chars)
        explorerPreviewCanvas.width = 128;
        explorerPreviewCanvas.height = 48;
        const imageData = explorerPreviewCtx.createImageData(128, 48);
        const pixels = imageData.data;

        // Fill with black
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 255;
        }

        const ink = [215, 215, 215];

        for (let charIdx = 0; charIdx < 96; charIdx++) {
            const gridX = charIdx % 16;
            const gridY = Math.floor(charIdx / 16);
            const charOffset = charIdx * 8;

            for (let line = 0; line < 8; line++) {
                const byte = data[charOffset + line];
                const y = gridY * 8 + line;
                const x = gridX * 8;

                for (let bit = 0; bit < 8; bit++) {
                    if ((byte & (0x80 >> bit)) !== 0) {
                        const idx = ((y * 128) + x + bit) * 4;
                        pixels[idx] = ink[0];
                        pixels[idx + 1] = ink[1];
                        pixels[idx + 2] = ink[2];
                    }
                }
            }
        }

        explorerPreviewCtx.putImageData(imageData, 0, 0);
    }

    function explorerRenderIFL(data) {
        // IFL: 8×2 multicolor - SCREEN_BITMAP_SIZE bitmap + 3072 attributes (1 attr per 2 pixel lines)
        explorerPreviewCanvas.width = SCREEN_WIDTH;
        explorerPreviewCanvas.height = SCREEN_HEIGHT;
        const imageData = explorerPreviewCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        const pixels = imageData.data;

        const sections = [
            { bitmapAddr: 0, yOffset: 0 },
            { bitmapAddr: 2048, yOffset: 64 },
            { bitmapAddr: 4096, yOffset: 128 }
        ];

        for (const section of sections) {
            const { bitmapAddr, yOffset } = section;
            for (let line = 0; line < 8; line++) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 32; col++) {
                        const bitmapOffset = bitmapAddr + col + row * 32 + line * SCREEN_WIDTH;
                        const byte = data[bitmapOffset];

                        const screenY = yOffset + row * 8 + line;
                        // IFL: 96 attribute rows (SCREEN_HEIGHT/2), one per 2 pixel lines
                        const attrRow = Math.floor(screenY / 2);
                        const attrOffset = SCREEN_BITMAP_SIZE + attrRow * 32 + col;
                        const attr = data[attrOffset];

                        const isBright = (attr & 0x40) !== 0;
                        const ink = attr & 0x07;
                        const paper = (attr >> 3) & 0x07;
                        const pal = getExplorerPalette();
                        const palette = isBright ? pal.bright : pal.regular;
                        const inkRgb = palette[ink];
                        const paperRgb = palette[paper];

                        const x = col * 8;
                        for (let bit = 0; bit < 8; bit++) {
                            const isSet = (byte & (0x80 >> bit)) !== 0;
                            const rgb = isSet ? inkRgb : paperRgb;
                            const idx = ((screenY * SCREEN_WIDTH) + x + bit) * 4;
                            pixels[idx] = rgb[0];
                            pixels[idx + 1] = rgb[1];
                            pixels[idx + 2] = rgb[2];
                            pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }
        explorerPreviewCtx.putImageData(imageData, 0, 0);
    }

    function explorerRenderMLT(data) {
        // MLT: 8×1 multicolor - SCREEN_BITMAP_SIZE bitmap + SCREEN_BITMAP_SIZE attributes (1 attr per pixel line)
        explorerPreviewCanvas.width = SCREEN_WIDTH;
        explorerPreviewCanvas.height = SCREEN_HEIGHT;
        const imageData = explorerPreviewCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        const pixels = imageData.data;

        const sections = [
            { bitmapAddr: 0, yOffset: 0 },
            { bitmapAddr: 2048, yOffset: 64 },
            { bitmapAddr: 4096, yOffset: 128 }
        ];

        for (const section of sections) {
            const { bitmapAddr, yOffset } = section;
            for (let line = 0; line < 8; line++) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 32; col++) {
                        const bitmapOffset = bitmapAddr + col + row * 32 + line * SCREEN_WIDTH;
                        const byte = data[bitmapOffset];

                        const screenY = yOffset + row * 8 + line;
                        // MLT: SCREEN_HEIGHT attribute rows, one per pixel line
                        const attrOffset = SCREEN_BITMAP_SIZE + screenY * 32 + col;
                        const attr = data[attrOffset];

                        const isBright = (attr & 0x40) !== 0;
                        const ink = attr & 0x07;
                        const paper = (attr >> 3) & 0x07;
                        const pal = getExplorerPalette();
                        const palette = isBright ? pal.bright : pal.regular;
                        const inkRgb = palette[ink];
                        const paperRgb = palette[paper];

                        const x = col * 8;
                        for (let bit = 0; bit < 8; bit++) {
                            const isSet = (byte & (0x80 >> bit)) !== 0;
                            const rgb = isSet ? inkRgb : paperRgb;
                            const idx = ((screenY * SCREEN_WIDTH) + x + bit) * 4;
                            pixels[idx] = rgb[0];
                            pixels[idx + 1] = rgb[1];
                            pixels[idx + 2] = rgb[2];
                            pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }
        explorerPreviewCtx.putImageData(imageData, 0, 0);
    }

    function explorerRenderRGB3(data) {
        // RGB3: Tricolor - 3 × SCREEN_BITMAP_SIZE bitmaps (Red, Green, Blue)
        explorerPreviewCanvas.width = SCREEN_WIDTH;
        explorerPreviewCanvas.height = SCREEN_HEIGHT;
        const imageData = explorerPreviewCtx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
        const pixels = imageData.data;

        // Fill with black
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 255;
        }

        const sections = [
            { bitmapAddr: 0, yOffset: 0 },
            { bitmapAddr: 2048, yOffset: 64 },
            { bitmapAddr: 4096, yOffset: 128 }
        ];

        // Process each color plane
        for (const section of sections) {
            const { bitmapAddr, yOffset } = section;
            for (let line = 0; line < 8; line++) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 32; col++) {
                        const baseOffset = bitmapAddr + col + row * 32 + line * SCREEN_WIDTH;
                        const redByte = data[baseOffset];                        // Red plane
                        const greenByte = data[baseOffset + SCREEN_BITMAP_SIZE];     // Green plane
                        const blueByte = data[baseOffset + SCREEN_BITMAP_SIZE * 2];  // Blue plane

                        const screenY = yOffset + row * 8 + line;
                        const x = col * 8;

                        for (let bit = 0; bit < 8; bit++) {
                            const mask = 0x80 >> bit;
                            const r = (redByte & mask) ? 255 : 0;
                            const g = (greenByte & mask) ? 255 : 0;
                            const b = (blueByte & mask) ? 255 : 0;

                            const idx = ((screenY * SCREEN_WIDTH) + x + bit) * 4;
                            pixels[idx] = r;
                            pixels[idx + 1] = g;
                            pixels[idx + 2] = b;
                            pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }
        explorerPreviewCtx.putImageData(imageData, 0, 0);
    }

    function explorerRenderDualScreen(screen5, screen7, activeScreen) {
        // Render two screens side by side for 128K
        explorerPreviewCanvas.width = 520;  // 256 + 8 gap + 256
        explorerPreviewCanvas.height = SCREEN_HEIGHT;
        explorerPreviewContainer.style.display = 'flex';
        explorerPreviewLabel.textContent = `128K Screens (Bank 5 / Bank 7) - Active: ${activeScreen}`;

        const imageData = explorerPreviewCtx.createImageData(520, SCREEN_HEIGHT);
        const pixels = imageData.data;

        // Fill with dark background
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 32; pixels[i + 1] = 32; pixels[i + 2] = 48; pixels[i + 3] = 255;
        }

        // Render screen 5 (left)
        if (screen5) {
            explorerRenderSCRToImageData(pixels, 520, screen5, 0);
        }

        // Render screen 7 (right, offset by 264 pixels)
        if (screen7) {
            explorerRenderSCRToImageData(pixels, 520, screen7, 264);
        }

        explorerPreviewCtx.putImageData(imageData, 0, 0);

        // Draw border around active screen
        explorerPreviewCtx.strokeStyle = '#0f0';
        explorerPreviewCtx.lineWidth = 2;
        if (activeScreen === 5) {
            explorerPreviewCtx.strokeRect(1, 1, 254, 190);
        } else {
            explorerPreviewCtx.strokeRect(265, 1, 254, 190);
        }
    }

    function explorerRenderSCRToImageData(pixels, canvasWidth, data, xOffset) {
        const sections = [
            { bitmapAddr: 0, attrAddr: SCREEN_BITMAP_SIZE, yOffset: 0 },
            { bitmapAddr: 2048, attrAddr: SCREEN_BITMAP_SIZE + 256, yOffset: 64 },
            { bitmapAddr: 4096, attrAddr: SCREEN_BITMAP_SIZE + 512, yOffset: 128 }
        ];

        for (const section of sections) {
            const { bitmapAddr, attrAddr, yOffset } = section;
            for (let line = 0; line < 8; line++) {
                for (let row = 0; row < 8; row++) {
                    for (let col = 0; col < 32; col++) {
                        const bitmapOffset = bitmapAddr + col + row * 32 + line * SCREEN_WIDTH;
                        const byte = data[bitmapOffset];
                        const attrOffset = attrAddr + col + row * 32;
                        const attr = data[attrOffset];

                        const isBright = (attr & 0x40) !== 0;
                        const ink = attr & 0x07;
                        const paper = (attr >> 3) & 0x07;
                        const pal = getExplorerPalette();
                        const palette = isBright ? pal.bright : pal.regular;
                        const inkRgb = palette[ink];
                        const paperRgb = palette[paper];

                        const x = col * 8 + xOffset;
                        const y = yOffset + row * 8 + line;

                        for (let bit = 0; bit < 8; bit++) {
                            const isSet = (byte & (0x80 >> bit)) !== 0;
                            const rgb = isSet ? inkRgb : paperRgb;
                            const idx = ((y * canvasWidth) + x + bit) * 4;
                            pixels[idx] = rgb[0];
                            pixels[idx + 1] = rgb[1];
                            pixels[idx + 2] = rgb[2];
                            pixels[idx + 3] = 255;
                        }
                    }
                }
            }
        }
    }

    // Sub-tab switching
    document.querySelectorAll('.explorer-subtab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.explorer-subtab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.explorer-subtab-content').forEach(c => {
                c.classList.remove('active');
                c.style.display = 'none';
            });
            btn.classList.add('active');
            const contentId = 'explorer-' + btn.dataset.subtab;
            const content = document.getElementById(contentId);
            if (content) {
                content.classList.add('active');
                content.style.display = '';
            }
        });
    });

    // File load button
    btnExplorerLoad.addEventListener('click', () => explorerFileInput.click());

    explorerFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            explorerData = new Uint8Array(data);
            explorerFileName.textContent = file.name;
            explorerFileSize.textContent = `(${explorerData.length.toLocaleString()} bytes)`;

            // Detect file type
            const ext = file.name.split('.').pop().toLowerCase();
            explorerFileType = ext;

            // Parse file
            await explorerParseFile(file.name, ext);

            // Clear all sub-tab outputs (prevent stale content from previous file)
            explorerBasicOutput.innerHTML = '<div class="explorer-empty">Select a BASIC program source</div>';
            explorerDisasmOutput.innerHTML = '<div class="explorer-empty">Select a source to disassemble</div>';
            explorerHexOutput.innerHTML = '';

            // Render File Info
            explorerRenderFileInfo();

            // Switch to File Info tab
            document.querySelector('.explorer-subtab[data-subtab="info"]').click();

        } catch (err) {
            explorerFileName.textContent = 'Error loading file';
            explorerFileSize.textContent = '';
            console.error('Explorer load error:', err);
        }

        e.target.value = '';
    });

    // Parse file based on type
    async function explorerParseFile(filename, ext) {
        explorerBlocks = [];
        explorerZipFiles = [];
        explorerParsed = null;

        switch (ext) {
            case 'tap':
                explorerParsed = explorerParseTAP(explorerData);
                break;
            case 'tzx':
                explorerParsed = explorerParseTZX(explorerData);
                break;
            case 'sna':
                explorerParsed = explorerParseSNA(explorerData);
                break;
            case 'z80':
                explorerParsed = explorerParseZ80(explorerData);
                break;
            case 'trd':
                explorerParsed = explorerParseTRD(explorerData);
                break;
            case 'scl':
                explorerParsed = explorerParseSCL(explorerData);
                break;
            case 'dsk':
                explorerParsed = explorerParseDSK(explorerData);
                break;
            case 'zip':
                explorerParsed = await explorerParseZIP(explorerData);
                break;
            case 'scr':
            case 'bsc':
            case 'fnt':
            case 'chr':
                explorerParsed = explorerParseRawGraphics(explorerData, ext);
                break;
            case 'szx':
                explorerParsed = explorerParseSZX(explorerData);
                break;
            case 'rzx':
                explorerParsed = await explorerParseRZX(explorerData);
                break;
            default:
                // Check if raw data matches known graphics sizes
                explorerParsed = explorerParseRawGraphics(explorerData, ext);
        }
    }

    // Raw graphics file parser (SCR, BSC, fonts, etc.)
    function explorerParseRawGraphics(data, ext) {
        const len = data.length;
        let graphicsType = null;
        let description = '';

        // Detect by size
        if (len === SCREEN_SIZE) {
            graphicsType = 'scr';
            description = 'ZX Spectrum Screen (bitmap + attributes)';
        } else if (len === SCREEN_BITMAP_SIZE) {
            graphicsType = 'bitmap';
            description = 'Monochrome Bitmap (full screen)';
        } else if (len === 4096) {
            graphicsType = 'bitmap_2_3';
            description = 'Monochrome Bitmap (2/3 screen)';
        } else if (len === 2048) {
            graphicsType = 'bitmap_1_3';
            description = 'Monochrome Bitmap (1/3 screen)';
        } else if (len === 768) {
            if (ext === 'fnt' || ext === 'chr') {
                graphicsType = 'font';
                description = 'ZX Spectrum Font (96 characters)';
            } else {
                graphicsType = 'attr';
                description = 'Attribute data (768 bytes)';
            }
        } else if (len === 9216) {
            graphicsType = 'ifl';
            description = 'IFL 8×2 Multicolor (6144 + 3072 attributes)';
        } else if (len === 11136) {
            graphicsType = 'bsc';
            description = 'BSC Screen (6912 + 4224 border)';
        } else if (len === 12288) {
            graphicsType = 'mlt';
            description = 'MLT 8×1 Multicolor (6144 + 6144 attributes)';
        } else if (len === 18432) {
            graphicsType = 'rgb3';
            description = 'RGB3 Tricolor (3 × 6144 bitmaps)';
        }

        if (graphicsType) {
            return {
                type: 'graphics',
                graphicsType: graphicsType,
                description: description,
                size: len,
                data: data
            };
        }

        return { type: 'unknown', size: len };
    }

    // TAP file parser
    function explorerParseTAP(data) {
        const blocks = [];
        let offset = 0;

        while (offset < data.length - 1) {
            const blockLen = data[offset] | (data[offset + 1] << 8);
            if (blockLen === 0 || offset + 2 + blockLen > data.length) break;

            const blockData = data.slice(offset + 2, offset + 2 + blockLen);
            const flag = blockData[0];

            let blockInfo = {
                offset: offset,
                length: blockLen,
                flag: flag,
                data: blockData
            };

            if (flag === 0 && blockLen === 19) {
                // Header block
                const type = blockData[1];
                const name = String.fromCharCode(...blockData.slice(2, 12)).trim();
                const dataLen = blockData[12] | (blockData[13] << 8);
                const param1 = blockData[14] | (blockData[15] << 8);
                const param2 = blockData[16] | (blockData[17] << 8);

                const typeNames = ['Program', 'Number array', 'Character array', 'Bytes'];
                blockInfo.blockType = 'header';
                blockInfo.headerType = type;
                blockInfo.typeName = typeNames[type] || 'Unknown';
                blockInfo.name = name;
                blockInfo.dataLength = dataLen;
                blockInfo.param1 = param1;
                blockInfo.param2 = param2;

                if (type === 0) {
                    // Program: param1 = autostart, param2 = vars offset
                    blockInfo.autostart = param1 < 32768 ? param1 : null;
                    blockInfo.varsOffset = param2;
                } else if (type === 3) {
                    // Bytes: param1 = start address
                    blockInfo.startAddress = param1;
                }
            } else {
                // Data block
                blockInfo.blockType = 'data';
            }

            blocks.push(blockInfo);
            offset += 2 + blockLen;
        }

        explorerBlocks = blocks;
        return { type: 'tap', blocks: blocks, size: data.length };
    }

    // TZX file parser
    function explorerParseTZX(data) {
        // Check TZX header: "ZXTape!" + 0x1A
        const header = String.fromCharCode(...data.slice(0, 7));
        if (header !== 'ZXTape!' || data[7] !== 0x1A) {
            return { type: 'unknown', size: data.length, error: 'Invalid TZX header' };
        }

        const versionMajor = data[8];
        const versionMinor = data[9];
        const blocks = [];
        let offset = 10;

        const blockNames = {
            0x10: 'Standard Speed Data',
            0x11: 'Turbo Speed Data',
            0x12: 'Pure Tone',
            0x13: 'Pulse Sequence',
            0x14: 'Pure Data',
            0x15: 'Direct Recording',
            0x18: 'CSW Recording',
            0x19: 'Generalized Data',
            0x20: 'Pause/Stop',
            0x21: 'Group Start',
            0x22: 'Group End',
            0x23: 'Jump to Block',
            0x24: 'Loop Start',
            0x25: 'Loop End',
            0x26: 'Call Sequence',
            0x27: 'Return from Sequence',
            0x28: 'Select Block',
            0x2A: 'Stop if 48K',
            0x2B: 'Set Signal Level',
            0x30: 'Text Description',
            0x31: 'Message',
            0x32: 'Archive Info',
            0x33: 'Hardware Type',
            0x35: 'Custom Info',
            0x5A: 'Glue Block'
        };

        while (offset < data.length) {
            const blockId = data[offset];
            const blockName = blockNames[blockId] || `Unknown (0x${hex8(blockId)})`;
            let blockLen = 0;
            let blockInfo = {
                offset: offset,
                id: blockId,
                name: blockName
            };

            offset++;

            switch (blockId) {
                case 0x10: // Standard speed data block
                    {
                        const pause = data[offset] | (data[offset + 1] << 8);
                        const dataLen = data[offset + 2] | (data[offset + 3] << 8);
                        blockLen = 4 + dataLen;
                        blockInfo.pause = pause;
                        blockInfo.dataLength = dataLen;

                        // Parse header if it's a standard header block
                        const blockData = data.slice(offset + 4, offset + 4 + dataLen);
                        if (dataLen === 19 && blockData[0] === 0) {
                            const type = blockData[1];
                            const name = String.fromCharCode(...blockData.slice(2, 12)).replace(/\x00/g, ' ').trim();
                            const len = blockData[12] | (blockData[13] << 8);
                            const param1 = blockData[14] | (blockData[15] << 8);
                            const typeNames = ['Program', 'Number array', 'Character array', 'Bytes'];
                            blockInfo.headerType = typeNames[type] || 'Unknown';
                            blockInfo.fileName = name;
                            blockInfo.fileLength = len;
                            if (type === 0) blockInfo.autostart = param1 < 32768 ? param1 : null;
                            if (type === 3) blockInfo.startAddress = param1;
                        } else if (blockData[0] === 0xFF) {
                            blockInfo.dataBlock = true;
                        }
                    }
                    break;

                case 0x11: // Turbo speed data block
                    {
                        blockLen = 18 + (data[offset + 15] | (data[offset + 16] << 8) | (data[offset + 17] << 16));
                        blockInfo.dataLength = blockLen - 18;
                    }
                    break;

                case 0x12: // Pure tone
                    blockLen = 4;
                    blockInfo.pulseLength = data[offset] | (data[offset + 1] << 8);
                    blockInfo.pulseCount = data[offset + 2] | (data[offset + 3] << 8);
                    break;

                case 0x13: // Pulse sequence
                    {
                        const pulseCount = data[offset];
                        blockLen = 1 + pulseCount * 2;
                    }
                    break;

                case 0x14: // Pure data block
                    blockLen = 10 + (data[offset + 7] | (data[offset + 8] << 8) | (data[offset + 9] << 16));
                    blockInfo.dataLength = blockLen - 10;
                    break;

                case 0x15: // Direct recording
                    blockLen = 8 + (data[offset + 5] | (data[offset + 6] << 8) | (data[offset + 7] << 16));
                    break;

                case 0x18: // CSW recording
                    blockLen = 4 + (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24));
                    break;

                case 0x19: // Generalized data block
                    blockLen = 4 + (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24));
                    break;

                case 0x20: // Pause/stop
                    blockLen = 2;
                    blockInfo.pause = data[offset] | (data[offset + 1] << 8);
                    if (blockInfo.pause === 0) blockInfo.stopTape = true;
                    break;

                case 0x21: // Group start
                    {
                        const nameLen = data[offset];
                        blockLen = 1 + nameLen;
                        blockInfo.groupName = String.fromCharCode(...data.slice(offset + 1, offset + 1 + nameLen));
                    }
                    break;

                case 0x22: // Group end
                    blockLen = 0;
                    break;

                case 0x23: // Jump to block
                    blockLen = 2;
                    blockInfo.jump = data[offset] | (data[offset + 1] << 8);
                    break;

                case 0x24: // Loop start
                    blockLen = 2;
                    blockInfo.repetitions = data[offset] | (data[offset + 1] << 8);
                    break;

                case 0x25: // Loop end
                    blockLen = 0;
                    break;

                case 0x26: // Call sequence
                    {
                        const callCount = data[offset] | (data[offset + 1] << 8);
                        blockLen = 2 + callCount * 2;
                    }
                    break;

                case 0x27: // Return from sequence
                    blockLen = 0;
                    break;

                case 0x28: // Select block
                    blockLen = 2 + (data[offset] | (data[offset + 1] << 8));
                    break;

                case 0x2A: // Stop tape if in 48K mode
                    blockLen = 4;
                    break;

                case 0x2B: // Set signal level
                    blockLen = 5;
                    break;

                case 0x30: // Text description
                    {
                        const textLen = data[offset];
                        blockLen = 1 + textLen;
                        blockInfo.text = String.fromCharCode(...data.slice(offset + 1, offset + 1 + textLen));
                    }
                    break;

                case 0x31: // Message block
                    {
                        const msgLen = data[offset + 1];
                        blockLen = 2 + msgLen;
                        blockInfo.displayTime = data[offset];
                        blockInfo.message = String.fromCharCode(...data.slice(offset + 2, offset + 2 + msgLen));
                    }
                    break;

                case 0x32: // Archive info
                    {
                        const archiveLen = data[offset] | (data[offset + 1] << 8);
                        blockLen = 2 + archiveLen;
                        // Parse archive info strings
                        const infoTypes = ['Title', 'Publisher', 'Author', 'Year', 'Language', 'Type', 'Price', 'Loader', 'Origin', 'Comment'];
                        const stringCount = data[offset + 2];
                        let infoOffset = offset + 3;
                        blockInfo.archiveInfo = [];
                        for (let i = 0; i < stringCount && infoOffset < offset + 2 + archiveLen; i++) {
                            const typeId = data[infoOffset];
                            const strLen = data[infoOffset + 1];
                            const str = String.fromCharCode(...data.slice(infoOffset + 2, infoOffset + 2 + strLen));
                            blockInfo.archiveInfo.push({
                                type: infoTypes[typeId] || `Info ${typeId}`,
                                value: str
                            });
                            infoOffset += 2 + strLen;
                        }
                    }
                    break;

                case 0x33: // Hardware type
                    {
                        const hwCount = data[offset];
                        blockLen = 1 + hwCount * 3;
                    }
                    break;

                case 0x35: // Custom info block
                    blockLen = 20 + (data[offset + 16] | (data[offset + 17] << 8) | (data[offset + 18] << 16) | (data[offset + 19] << 24));
                    blockInfo.customId = String.fromCharCode(...data.slice(offset, offset + 16)).replace(/\x00/g, '').trim();
                    break;

                case 0x5A: // Glue block
                    blockLen = 9;
                    break;

                default:
                    // Unknown block - try to skip based on common patterns
                    // Many unknown blocks have length at offset 0-3
                    if (offset + 4 <= data.length) {
                        blockLen = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
                        if (blockLen > data.length - offset) {
                            // Invalid length, stop parsing
                            blockInfo.error = 'Unknown block type, cannot determine length';
                            blocks.push(blockInfo);
                            offset = data.length;
                            continue;
                        }
                    } else {
                        offset = data.length;
                        continue;
                    }
            }

            blockInfo.length = blockLen;
            blocks.push(blockInfo);
            offset += blockLen;
        }

        explorerBlocks = blocks;
        return {
            type: 'tzx',
            version: `${versionMajor}.${versionMinor}`,
            blocks: blocks,
            size: data.length
        };
    }

    // SNA file parser
    function explorerParseSNA(data) {
        const is128 = data.length === 131103 || data.length === 147487;

        const regs = {
            I: data[0],
            HLa: data[1] | (data[2] << 8),
            DEa: data[3] | (data[4] << 8),
            BCa: data[5] | (data[6] << 8),
            AFa: data[7] | (data[8] << 8),
            HL: data[9] | (data[10] << 8),
            DE: data[11] | (data[12] << 8),
            BC: data[13] | (data[14] << 8),
            IY: data[15] | (data[16] << 8),
            IX: data[17] | (data[18] << 8),
            IFF2: (data[19] & 0x04) ? 1 : 0,
            R: data[20],
            AF: data[21] | (data[22] << 8),
            SP: data[23] | (data[24] << 8),
            IM: data[25],
            border: data[26]
        };

        // For 48K SNA, PC is on stack
        if (!is128) {
            const spOffset = regs.SP - 0x4000 + 27;
            if (spOffset >= 0 && spOffset < data.length - 1) {
                regs.PC = data[spOffset] | (data[spOffset + 1] << 8);
            }
        } else {
            // 128K SNA has PC after memory
            regs.PC = data[49179] | (data[49180] << 8);
            regs.port7FFD = data[49181];
            regs.trdosROM = data[49182];
        }

        return {
            type: 'sna',
            is128: is128,
            registers: regs,
            memoryOffset: 27,
            size: data.length
        };
    }

    // Z80 file parser
    function explorerParseZ80(data) {
        const regs = {
            A: data[0],
            F: data[1],
            BC: data[2] | (data[3] << 8),
            HL: data[4] | (data[5] << 8),
            PC: data[6] | (data[7] << 8),
            SP: data[8] | (data[9] << 8),
            I: data[10],
            R: (data[11] & 0x7f) | ((data[12] & 0x01) << 7),
            border: (data[12] >> 1) & 0x07,
            DE: data[13] | (data[14] << 8),
            BCa: data[15] | (data[16] << 8),
            DEa: data[17] | (data[18] << 8),
            HLa: data[19] | (data[20] << 8),
            Aa: data[21],
            Fa: data[22],
            IY: data[23] | (data[24] << 8),
            IX: data[25] | (data[26] << 8),
            IFF1: data[27] ? 1 : 0,
            IFF2: data[28] ? 1 : 0,
            IM: data[29] & 0x03
        };

        let version = 1;
        let is128 = false;
        let compressed = (data[12] & 0x20) !== 0;
        let hwMode = 0;
        let port7FFD = 0;
        let pages = [];

        if (regs.PC === 0) {
            // V2 or V3
            const extLen = data[30] | (data[31] << 8);
            version = extLen === 23 ? 2 : 3;
            regs.PC = data[32] | (data[33] << 8);
            hwMode = data[34];
            port7FFD = data[35];

            if (version === 2) {
                // V2: hwMode 3=128K, 4=128K+IF1, 9=Pentagon (non-standard but used by some savers)
                is128 = hwMode === 3 || hwMode === 4 || hwMode === 9;
            } else {
                // V3: 4-6=128K variants, 7=+3, 9=Pentagon, 12=+2, 13=+2A
                is128 = hwMode >= 4 && hwMode <= 6 || hwMode === 7 || hwMode === 9 || hwMode === 12 || hwMode === 13;
            }

            // Parse pages
            const headerLen = 30 + 2 + extLen;
            let offset = headerLen;
            while (offset < data.length - 3) {
                const compLen = data[offset] | (data[offset + 1] << 8);
                const pageNum = data[offset + 2];
                const isCompressed = compLen !== 0xffff;
                const dataLen = isCompressed ? compLen : 16384;

                // Determine page description
                let pageDesc = '';
                if (is128 || hwMode === 9) {
                    // 128K/Pentagon page mapping
                    if (pageNum === 0) pageDesc = 'ROM 48K (modified)';
                    else if (pageNum === 1) pageDesc = 'IF1 ROM';
                    else if (pageNum === 2) pageDesc = 'ROM 128K (modified)';
                    else if (pageNum >= 3 && pageNum <= 10) pageDesc = `RAM bank ${pageNum - 3}`;
                    else if (pageNum === 11) pageDesc = 'Multiface ROM';
                    else pageDesc = `Unknown`;
                } else {
                    // 48K page mapping
                    if (pageNum === 4) pageDesc = '0x8000-0xBFFF';
                    else if (pageNum === 5) pageDesc = '0xC000-0xFFFF';
                    else if (pageNum === 8) pageDesc = '0x4000-0x7FFF';
                    else pageDesc = `Unknown`;
                }

                pages.push({
                    num: pageNum,
                    offset: offset,
                    compLen: isCompressed ? compLen : 16384,
                    compressed: isCompressed,
                    desc: pageDesc
                });

                offset += 3 + dataLen;
            }
        }

        regs.AF = (regs.A << 8) | regs.F;
        regs.AFa = (regs.Aa << 8) | regs.Fa;

        return {
            type: 'z80',
            version: version,
            is128: is128,
            hwMode: hwMode,
            port7FFD: port7FFD,
            compressed: compressed,
            registers: regs,
            pages: pages,
            size: data.length
        };
    }

    // SZX file parser
    function explorerParseSZX(data) {
        if (!SZXLoader.isSZX(data)) {
            return { type: 'szx', error: 'Invalid SZX file', size: data.length };
        }

        const info = SZXLoader.parse(data);
        const bytes = new Uint8Array(data);

        // Extract registers from Z80R chunk
        const regs = {};
        for (const chunk of info.chunks) {
            if (chunk.id === 'Z80R') {
                const r = bytes.slice(chunk.offset, chunk.offset + chunk.size);
                regs.F = r[0]; regs.A = r[1];
                regs.C = r[2]; regs.B = r[3];
                regs.E = r[4]; regs.D = r[5];
                regs.L = r[6]; regs.H = r[7];
                regs.Fa = r[8]; regs.Aa = r[9];
                regs.Ca = r[10]; regs.Ba = r[11];
                regs.Ea = r[12]; regs.Da = r[13];
                regs.La = r[14]; regs.Ha = r[15];
                regs.IXL = r[16]; regs.IXH = r[17];
                regs.IYL = r[18]; regs.IYH = r[19];
                regs.SP = r[20] | (r[21] << 8);
                regs.PC = r[22] | (r[23] << 8);
                regs.I = r[24];
                regs.R = r[25];
                regs.IFF1 = r[26] & 1;
                regs.IFF2 = r[27] & 1;
                regs.IM = r[28];
                // Combine register pairs
                regs.AF = (regs.A << 8) | regs.F;
                regs.BC = (regs.B << 8) | regs.C;
                regs.DE = (regs.D << 8) | regs.E;
                regs.HL = (regs.H << 8) | regs.L;
                regs.AFa = (regs.Aa << 8) | regs.Fa;
                regs.BCa = (regs.Ba << 8) | regs.Ca;
                regs.DEa = (regs.Da << 8) | regs.Ea;
                regs.HLa = (regs.Ha << 8) | regs.La;
                regs.IX = (regs.IXH << 8) | regs.IXL;
                regs.IY = (regs.IYH << 8) | regs.IYL;
                break;
            }
        }

        // Extract border from SPCR chunk
        let border = 0;
        let port7FFD = 0;
        for (const chunk of info.chunks) {
            if (chunk.id === 'SPCR') {
                border = bytes[chunk.offset];
                port7FFD = bytes[chunk.offset + 1];
                break;
            }
        }
        regs.border = border;
        regs.port7FFD = port7FFD;

        return {
            type: 'szx',
            version: `${info.majorVersion}.${info.minorVersion}`,
            machineId: info.machineId,
            machineType: info.machineType,
            is128: info.is128,
            chunks: info.chunks,
            registers: regs,
            size: data.length
        };
    }

    // RZX file parser
    async function explorerParseRZX(data) {
        if (!RZXLoader.isRZX(data)) {
            return { type: 'rzx', error: 'Invalid RZX file', size: data.length };
        }

        const rzxLoader = new RZXLoader();
        try {
            await rzxLoader.parse(data.buffer || data);

            const result = {
                type: 'rzx',
                totalFrames: rzxLoader.getFrameCount(),
                creatorInfo: rzxLoader.creatorInfo,
                snapshotType: rzxLoader.getSnapshotType(),
                snapshot: rzxLoader.getSnapshot(),
                allSnapshots: rzxLoader.allSnapshots || [],
                size: data.length,
                stats: rzxLoader.getStats(),
                frames: rzxLoader.getFrames()
            };

            // Parse embedded snapshot for registers
            if (result.snapshot && result.snapshotType) {
                if (result.snapshotType === 'sna') {
                    result.embeddedParsed = explorerParseSNA(result.snapshot);
                } else if (result.snapshotType === 'z80') {
                    result.embeddedParsed = explorerParseZ80(result.snapshot);
                }
            }

            return result;
        } catch (e) {
            return { type: 'rzx', error: e.message, size: data.length };
        }
    }

    // TRD file parser
    function explorerParseTRD(data) {
        const files = [];

        // Read directory (first 8 sectors = 2048 bytes)
        for (let i = 0; i < 128; i++) {
            const entryOffset = i * 16;
            if (data[entryOffset] === 0) break;
            if (data[entryOffset] === 1) continue; // Deleted

            const name = String.fromCharCode(...data.slice(entryOffset, entryOffset + 8)).replace(/\s+$/, '');
            const ext = String.fromCharCode(data[entryOffset + 8]);
            const startAddr = data[entryOffset + 9] | (data[entryOffset + 10] << 8);
            const length = data[entryOffset + 11] | (data[entryOffset + 12] << 8);
            const sectors = data[entryOffset + 13];
            const startSector = data[entryOffset + 14];
            const startTrack = data[entryOffset + 15];

            files.push({
                name: name,
                ext: ext,
                startAddress: startAddr,
                length: length,
                sectors: sectors,
                startSector: startSector,
                startTrack: startTrack,
                offset: (startTrack * 16 + startSector) * 256
            });
        }

        // Read disk info from sector 8 (track 0, sector 8)
        const infoOffset = 8 * 256;
        const diskTitle = String.fromCharCode(...data.slice(infoOffset + 0xF5, infoOffset + 0xFD)).trim();
        const freeSpace = data[infoOffset + 0xE5];

        explorerBlocks = files;
        return {
            type: 'trd',
            files: files,
            diskTitle: diskTitle,
            freeSectors: freeSpace,
            size: data.length
        };
    }

    // SCL file parser
    function explorerParseSCL(data) {
        const files = [];

        // Check signature
        const sig = String.fromCharCode(...data.slice(0, 8));
        if (sig !== 'SINCLAIR') {
            return { type: 'scl', error: 'Invalid SCL signature', size: data.length };
        }

        const fileCount = data[8];
        let offset = 9;

        for (let i = 0; i < fileCount; i++) {
            const name = String.fromCharCode(...data.slice(offset, offset + 8)).replace(/\s+$/, '');
            const ext = String.fromCharCode(data[offset + 8]);
            const startAddr = data[offset + 9] | (data[offset + 10] << 8);
            const length = data[offset + 11] | (data[offset + 12] << 8);
            const sectors = data[offset + 13];

            files.push({
                name: name,
                ext: ext,
                startAddress: startAddr,
                length: length,
                sectors: sectors
            });

            offset += 14;
        }

        // Calculate data offsets
        let dataOffset = 9 + fileCount * 14;
        for (const file of files) {
            file.offset = dataOffset;
            dataOffset += file.sectors * 256;
        }

        explorerBlocks = files;
        return {
            type: 'scl',
            files: files,
            size: data.length
        };
    }

    // DSK file parser
    function explorerParseDSK(data) {
        try {
            const dskImage = DSKLoader.parse(data);
            const diskSpec = DSKLoader.getDiskSpec(dskImage);
            let files = [];
            try {
                files = DSKLoader.listFiles(dskImage);
            } catch (e) {
                // Non-CP/M disk or corrupt directory — show geometry without files
            }

            // Store DSKImage for later file data extraction
            explorerBlocks = files;
            return {
                type: 'dsk',
                dskImage: dskImage,
                diskSpec: diskSpec,
                files: files,
                isExtended: dskImage.isExtended,
                numTracks: dskImage.numTracks,
                numSides: dskImage.numSides,
                size: data.length
            };
        } catch (err) {
            return { type: 'dsk', error: err.message, size: data.length };
        }
    }

    // ZIP file parser
    async function explorerParseZIP(data) {
        try {
            const files = await ZipLoader.extract(data.buffer);
            explorerZipFiles = files;

            // Auto-drill into ZIP if it contains exactly one supported file
            const supportedExts = ['tap', 'tzx', 'sna', 'z80', 'trd', 'scl', 'dsk'];
            const supportedFiles = files.filter(f => {
                const ext = f.name.split('.').pop().toLowerCase();
                return supportedExts.includes(ext);
            });

            if (supportedFiles.length === 1) {
                // Auto-extract and parse the single file
                const zipFile = supportedFiles[0];
                const ext = zipFile.name.split('.').pop().toLowerCase();

                explorerZipParentName = explorerFileName.textContent;
                explorerData = new Uint8Array(zipFile.data);
                explorerFileName.textContent = `${explorerZipParentName} > ${zipFile.name}`;
                explorerFileSize.textContent = `(${explorerData.length.toLocaleString()} bytes)`;
                explorerFileType = ext;

                // Parse based on type
                switch (ext) {
                    case 'tap':
                        return explorerParseTAP(explorerData);
                    case 'tzx':
                        return explorerParseTZX(explorerData);
                    case 'sna':
                        return explorerParseSNA(explorerData);
                    case 'z80':
                        return explorerParseZ80(explorerData);
                    case 'trd':
                        return explorerParseTRD(explorerData);
                    case 'scl':
                        return explorerParseSCL(explorerData);
                }
            }

            return {
                type: 'zip',
                files: files.map(f => ({
                    name: f.name,
                    size: f.data.length
                })),
                size: data.length
            };
        } catch (err) {
            return { type: 'zip', error: err.message, size: data.length };
        }
    }

    // Helper to render register table
    function explorerRenderRegsTable(r) {
        return `<table class="explorer-info-table">
            <tr><th>PC</th><td>${hex16(r.PC)}</td><th>SP</th><td>${hex16(r.SP)}</td></tr>
            <tr><th>AF</th><td>${hex16(r.AF)}</td><th>AF'</th><td>${hex16(r.AFa)}</td></tr>
            <tr><th>BC</th><td>${hex16(r.BC)}</td><th>BC'</th><td>${hex16(r.BCa)}</td></tr>
            <tr><th>DE</th><td>${hex16(r.DE)}</td><th>DE'</th><td>${hex16(r.DEa)}</td></tr>
            <tr><th>HL</th><td>${hex16(r.HL)}</td><th>HL'</th><td>${hex16(r.HLa)}</td></tr>
            <tr><th>IX</th><td>${hex16(r.IX)}</td><th>IY</th><td>${hex16(r.IY)}</td></tr>
            <tr><th>I</th><td>${hex8(r.I)}</td><th>R</th><td>${hex8(r.R)}</td></tr>
            <tr><th>IM</th><td>${r.IM}</td><th>IFF2</th><td>${r.IFF2}</td></tr>
            <tr><th>Border</th><td>${r.border}</td><th></th><td></td></tr>
        </table>`;
    }

    // Render File Info
    function explorerRenderFileInfo() {
        if (!explorerParsed) {
            explorerInfoOutput.innerHTML = '<div class="explorer-empty">No file loaded</div>';
            return;
        }

        let html = '';

        switch (explorerParsed.type) {
            case 'tap':
                html = explorerRenderTAPInfo();
                break;
            case 'tzx':
                html = explorerRenderTZXInfo();
                break;
            case 'sna':
                html = explorerRenderSNAInfo();
                break;
            case 'z80':
                html = explorerRenderZ80Info();
                break;
            case 'szx':
                html = explorerRenderSZXInfo();
                break;
            case 'rzx':
                html = explorerRenderRZXInfo();
                break;
            case 'trd':
                html = explorerRenderTRDInfo();
                break;
            case 'scl':
                html = explorerRenderSCLInfo();
                break;
            case 'dsk':
                html = explorerRenderDSKInfo();
                break;
            case 'zip':
                html = explorerRenderZIPInfo();
                break;
            case 'graphics':
                html = explorerRenderGraphicsInfo();
                break;
            default:
                html = `<div class="explorer-info-section"><div class="explorer-info-header">File Info</div><table class="explorer-info-table"><tr><th>Type</th><td>Unknown</td></tr><tr><th>Size</th><td>${explorerParsed.size.toLocaleString()} bytes</td></tr></table></div>`;
        }

        explorerInfoOutput.innerHTML = html;

        // Update source selectors
        explorerUpdateSourceSelectors();

        // Update preview - check for previewable content
        explorerUpdatePreviewForFile();
    }

    function explorerRenderGraphicsInfo() {
        const p = explorerParsed;
        return `<div class="explorer-info-section"><div class="explorer-info-header">${p.description}</div><table class="explorer-info-table"><tr><th>Type</th><td>${p.graphicsType.toUpperCase()}</td></tr><tr><th>Size</th><td>${p.size.toLocaleString()} bytes</td></tr></table></div>`;
    }

    function explorerUpdatePreviewForFile() {
        // For graphics files, preview directly
        if (explorerParsed && explorerParsed.type === 'graphics') {
            // For BSC, extract the SCR portion (first SCREEN_SIZE bytes)
            if (explorerParsed.graphicsType === 'bsc') {
                explorerUpdatePreview(explorerData.slice(0, SCREEN_SIZE));
            } else {
                explorerUpdatePreview(explorerData);
            }
            return;
        }

        // For raw files loaded directly, check the file size
        if (explorerData && !explorerParsed) {
            explorerUpdatePreview(explorerData);
            return;
        }

        // For TAP files, check each data block for screen data
        if (explorerParsed && explorerParsed.type === 'tap') {
            for (const block of explorerBlocks) {
                if (block.blockType === 'data') {
                    // Data block - check if it's a screen (minus flag and checksum bytes)
                    const contentLen = block.data.length - 2; // subtract flag byte and checksum
                    if (contentLen === SCREEN_SIZE || contentLen === SCREEN_BITMAP_SIZE || contentLen === 4096 ||
                        contentLen === 2048 || contentLen === SCREEN_ATTR_SIZE) {
                        // Extract content (skip flag byte, exclude checksum)
                        const content = block.data.slice(1, block.data.length - 1);
                        explorerUpdatePreview(content);
                        return;
                    }
                }
            }
        }

        // For TZX files, check data blocks for screen data
        if (explorerParsed && explorerParsed.type === 'tzx') {
            for (const block of explorerBlocks) {
                // Check standard speed data blocks (0x10)
                if (block.id === 0x10 && block.dataLength) {
                    // Data starts at offset + 1 (block ID) + 4 (pause + length)
                    const dataStart = block.offset + 1 + 4;
                    const blockData = explorerData.slice(dataStart, dataStart + block.dataLength);
                    // Check for data block with screen-sized content
                    if (blockData.length > 0 && blockData[0] === 0xFF) {
                        const contentLen = blockData.length - 2; // subtract flag and checksum
                        if (contentLen === SCREEN_SIZE || contentLen === SCREEN_BITMAP_SIZE || contentLen === 4096 ||
                            contentLen === 2048 || contentLen === SCREEN_ATTR_SIZE) {
                            const content = blockData.slice(1, blockData.length - 1);
                            explorerUpdatePreview(content);
                            return;
                        }
                    }
                }
            }
        }

        // For SNA, extract screen from memory
        if (explorerParsed && explorerParsed.type === 'sna') {
            // SNA memory layout: 27-byte header, then RAM starting at $4000
            // Bank 5 (screen at $4000) is always first 16KB after header
            const memOffset = 27;

            if (explorerParsed.is128) {
                // 128K SNA: show both screens (bank 5 and bank 7)
                const port7FFD = explorerParsed.registers.port7FFD || 0;
                const activeScreen = (port7FFD & 0x08) ? 7 : 5;
                const pagedBank = port7FFD & 0x07;

                // Bank 5 is always at offset 27 (first 16KB after header)
                const screen5 = explorerData.slice(memOffset, memOffset + SCREEN_SIZE);

                // Bank 7 location depends on which bank is paged at $C000
                let screen7 = null;
                if (pagedBank === 7) {
                    // Bank 7 is paged in at $C000, so it's in the first 48KB
                    // Offset: 27 (header) + 32768 ($C000 - $4000) = 32795
                    const bank7Offset = 27 + 32768;
                    screen7 = explorerData.slice(bank7Offset, bank7Offset + SCREEN_SIZE);
                } else {
                    // Bank 7 is in the remaining banks after offset 49183
                    // Remaining banks are stored in order, excluding banks 2, 5, and pagedBank
                    // Order: 0,1,3,4,6,7 minus pagedBank (if not 2,5,7)
                    const remainingBanks = [0, 1, 3, 4, 6, 7].filter(b => b !== pagedBank);
                    const bank7Index = remainingBanks.indexOf(7);
                    if (bank7Index >= 0) {
                        const bank7Offset = 49183 + bank7Index * 16384;
                        if (explorerData.length >= bank7Offset + SCREEN_SIZE) {
                            screen7 = explorerData.slice(bank7Offset, bank7Offset + SCREEN_SIZE);
                        }
                    }
                }

                // Render both screens side by side
                explorerRenderDualScreen(screen5, screen7, activeScreen);
                return;
            } else {
                // 48K SNA: screen is at offset 27
                if (explorerData.length >= memOffset + SCREEN_SIZE) {
                    const screen = explorerData.slice(memOffset, memOffset + SCREEN_SIZE);
                    // Show preview with custom label for SNA
                    explorerPreviewContainer.style.display = 'flex';
                    explorerPreviewLabel.textContent = '48K Screen';
                    explorerRenderSCR(screen);
                    return;
                }
            }
        }

        // For Z80 files, extract and decompress screen
        if (explorerParsed && explorerParsed.type === 'z80') {
            const screen = explorerExtractZ80Screen(explorerData, explorerParsed);
            if (screen) {
                explorerPreviewContainer.style.display = 'flex';
                explorerPreviewLabel.textContent = `Z80 v${explorerParsed.version} Screen`;
                explorerRenderSCR(screen);
                return;
            }
        }

        // For SZX files, extract screen from RAMP chunk
        if (explorerParsed && explorerParsed.type === 'szx') {
            try {
                const screen = SZXLoader.extractScreen(explorerData);
                if (screen) {
                    explorerPreviewContainer.style.display = 'flex';
                    explorerPreviewLabel.textContent = `SZX v${explorerParsed.version} Screen`;
                    explorerRenderSCR(screen);
                    return;
                }
            } catch (e) {
                console.error('SZX screen extraction error:', e);
            }
        }

        // For RZX files, extract screen from embedded snapshot
        if (explorerParsed && explorerParsed.type === 'rzx' && explorerParsed.snapshot) {
            try {
                let screen = null;
                if (explorerParsed.snapshotType === 'sna') {
                    // SNA: screen is at offset 27
                    if (explorerParsed.snapshot.length >= 27 + SCREEN_SIZE) {
                        screen = explorerParsed.snapshot.slice(27, 27 + SCREEN_SIZE);
                    }
                } else if (explorerParsed.snapshotType === 'z80' && explorerParsed.embeddedParsed) {
                    // Use Z80 extraction
                    screen = explorerExtractZ80Screen(explorerParsed.snapshot, explorerParsed.embeddedParsed);
                }

                if (screen) {
                    explorerPreviewContainer.style.display = 'flex';
                    explorerPreviewLabel.textContent = `RZX Embedded ${explorerParsed.snapshotType.toUpperCase()} Screen`;
                    explorerRenderSCR(screen);
                    return;
                }
            } catch (e) {
                console.error('RZX screen extraction error:', e);
            }
        }

        // For TRD/SCL, look for previewable files (screens, fonts)
        if (explorerParsed && (explorerParsed.type === 'trd' || explorerParsed.type === 'scl')) {
            const previewSizes = [SCREEN_SIZE, SCREEN_BITMAP_SIZE, 4096, 2048, SCREEN_ATTR_SIZE, 9216, 11136, 12288, 18432];
            for (const file of explorerParsed.files) {
                if (previewSizes.includes(file.length)) {
                    const fileData = explorerData.slice(file.offset, file.offset + file.length);
                    explorerUpdatePreview(fileData);
                    return;
                }
            }
        }

        // For DSK, look for previewable files (check data size after +3DOS header)
        if (explorerParsed && explorerParsed.type === 'dsk') {
            const previewSizes = [SCREEN_SIZE, SCREEN_BITMAP_SIZE, 4096, 2048, SCREEN_ATTR_SIZE, 9216, 11136, 12288, 18432];
            for (const file of explorerParsed.files) {
                if (previewSizes.includes(file.size)) {
                    const fileData = DSKLoader.readFileData(
                        explorerParsed.dskImage, file.name, file.ext, file.user, file.rawSize || file.size
                    );
                    if (fileData) {
                        // Skip +3DOS header for preview
                        const content = file.hasPlus3Header ? fileData.slice(128) : fileData;
                        explorerUpdatePreview(content);
                        return;
                    }
                }
            }
        }

        // No previewable content
        explorerUpdatePreview(null);
    }

    // Z80 decompression (RLE: ED ED count value -> repeat value count times)
    function explorerDecompressZ80(data, start, end) {
        const output = [];
        let i = start;

        while (i < end) {
            if (data[i] === 0xED && i + 1 < end && data[i + 1] === 0xED) {
                // Compressed sequence: ED ED count value
                if (i + 3 < end) {
                    const count = data[i + 2];
                    const value = data[i + 3];
                    for (let j = 0; j < count; j++) {
                        output.push(value);
                    }
                    i += 4;
                } else {
                    break;
                }
            } else {
                output.push(data[i]);
                i++;
            }
        }

        return new Uint8Array(output);
    }

    // Extract screen from Z80 file (supports v1, v2, v3, compressed and uncompressed)
    function explorerExtractZ80Screen(data, parsed) {
        try {
            if (parsed.version === 1) {
                // V1: 30-byte header, then memory (possibly compressed)
                if (parsed.compressed) {
                    // Find end marker (00 ED ED 00) and decompress
                    let endMarker = data.length;
                    for (let i = 30; i < data.length - 3; i++) {
                        if (data[i] === 0x00 && data[i + 1] === 0xED &&
                            data[i + 2] === 0xED && data[i + 3] === 0x00) {
                            endMarker = i;
                            break;
                        }
                    }
                    const memory = explorerDecompressZ80(data, 30, endMarker);
                    if (memory.length >= SCREEN_SIZE) {
                        return memory.slice(0, SCREEN_SIZE);
                    }
                } else {
                    // Uncompressed v1
                    if (data.length >= 30 + SCREEN_SIZE) {
                        return data.slice(30, 30 + SCREEN_SIZE);
                    }
                }
            } else {
                // V2/V3: extended header + compressed pages
                const extLen = data[30] | (data[31] << 8);
                const headerEnd = 32 + extLen;
                const hwMode = data[34];

                // Determine which page contains the screen
                // Page 8 always contains the screen ($4000-$7FFF)
                // For 48K: page 8 = $4000-$7FFF
                // For 128K: pages 3-10 = RAM banks 0-7, so page 8 = bank 5 (screen)
                const screenPage = 8;

                // Parse pages
                let offset = headerEnd;
                while (offset < data.length - 3) {
                    const pageLen = data[offset] | (data[offset + 1] << 8);
                    const pageNum = data[offset + 2];
                    offset += 3;

                    if (pageNum === screenPage) {
                        let pageData;
                        if (pageLen === 0xFFFF) {
                            // Uncompressed page
                            pageData = data.slice(offset, offset + 16384);
                        } else {
                            // Compressed page
                            pageData = explorerDecompressZ80(data, offset, offset + pageLen);
                        }

                        if (pageData.length >= SCREEN_SIZE) {
                            return pageData.slice(0, SCREEN_SIZE);
                        }
                    }

                    // Move to next page
                    if (pageLen === 0xFFFF) {
                        offset += 16384;
                    } else {
                        offset += pageLen;
                    }
                }
            }
        } catch (e) {
            console.error('Z80 screen extraction error:', e);
        }
        return null;
    }

    function explorerRenderTAPInfo() {
        let html = `<div class="explorer-info-section"><div class="explorer-info-header">TAP File · ${explorerBlocks.length} blocks · ${explorerData.length.toLocaleString()} bytes</div><div class="explorer-block-list">`;

        for (let i = 0; i < explorerBlocks.length; i++) {
            const block = explorerBlocks[i];
            const data = block.data;

            // Calculate checksum (XOR of all bytes except the last one, which is the stored checksum)
            let calcChecksum = 0;
            for (let j = 0; j < data.length - 1; j++) {
                calcChecksum ^= data[j];
            }
            const storedChecksum = data[data.length - 1];
            const checksumOk = calcChecksum === storedChecksum;
            const checksumClass = checksumOk ? 'checksum-ok' : 'checksum-bad';
            const checksumMark = checksumOk ? '\u2713' : '\u2717';

            if (block.blockType === 'header') {
                // Header block - different colors for different types
                let blockClass = 'explorer-block';
                if (block.headerType === 0) blockClass += ' basic-block';
                else if (block.headerType === 3) blockClass += ' code-block';
                else if (block.headerType === 1 || block.headerType === 2) blockClass += ' array-block';

                html += `<div class="${blockClass}" data-block-index="${i}">`;
                html += `<div class="explorer-block-header">${i + 1}: ${block.typeName}</div>`;
                html += `<div class="explorer-block-meta">Offset: ${block.offset} | Flag: ${block.flag} ($${hex8(block.flag)}) | Length: ${block.length} bytes | Checksum: ${hex8(storedChecksum)} <span class="${checksumClass}">${checksumMark}</span></div>`;
                html += `<div class="explorer-block-details">`;
                html += `<span class="label">Filename:</span> <span class="filename">"${block.name}"</span><br>`;
                html += `<span class="label">Data length:</span> ${block.dataLength} bytes`;

                if (block.headerType === 0) {
                    // Program
                    html += `<br><span class="label">Autostart:</span> ${block.autostart !== null ? block.autostart : 'None'}`;
                } else if (block.headerType === 3) {
                    // Bytes/CODE
                    html += `<br><span class="label">Start address:</span> <span class="value">$${hex16(block.startAddress)}</span>`;
                } else if (block.headerType === 1 || block.headerType === 2) {
                    // Number/Character array
                    html += `<br><span class="label">Variable name:</span> ${String.fromCharCode((block.param1 & 0x3F) + 0x40)}`;
                }

                html += `</div></div>`;
            } else {
                // Data block
                html += `<div class="explorer-block data-block" data-block-index="${i}">`;
                html += `<div class="explorer-block-header">${i + 1}: Data</div>`;
                html += `<div class="explorer-block-meta">Offset: ${block.offset} | Flag: ${block.flag} ($${hex8(block.flag)}) | Length: ${block.length} bytes | Checksum: ${hex8(storedChecksum)} <span class="${checksumClass}">${checksumMark}</span></div>`;
                html += `</div>`;
            }
        }

        html += '</div></div>';
        return html;
    }

    function explorerRenderTZXInfo() {
        const p = explorerParsed;
        let html = `<div class="explorer-info-section"><div class="explorer-info-header">TZX File v${p.version} · ${explorerBlocks.length} blocks · ${explorerData.length.toLocaleString()} bytes</div><div class="explorer-block-list">`;

        for (let i = 0; i < explorerBlocks.length; i++) {
            const block = explorerBlocks[i];
            let blockClass = 'explorer-block';

            // Color code different block types
            if (block.id === 0x10 || block.id === 0x11 || block.id === 0x14) {
                if (block.headerType) blockClass += ' code-block';
                else if (block.dataBlock) blockClass += ' data-block';
                else blockClass += ' data-block';
            } else if (block.id === 0x30 || block.id === 0x31 || block.id === 0x32) {
                blockClass += ' basic-block'; // Text/info blocks
            } else if (block.id === 0x20 || block.id === 0x21 || block.id === 0x22 || block.id === 0x24 || block.id === 0x25) {
                blockClass += ' array-block'; // Control blocks
            }

            html += `<div class="${blockClass}" data-block-index="${i}">`;
            html += `<div class="explorer-block-header">${i + 1}: ${block.name}</div>`;
            html += `<div class="explorer-block-meta">Offset: ${block.offset} | ID: $${hex8(block.id)} | Length: ${block.length} bytes</div>`;

            // Block-specific details
            let details = '';
            switch (block.id) {
                case 0x10: // Standard speed data
                    if (block.headerType) {
                        details = `<span class="label">Type:</span> ${block.headerType}<br>`;
                        details += `<span class="label">Filename:</span> <span class="filename">"${block.fileName}"</span><br>`;
                        details += `<span class="label">Data length:</span> ${block.fileLength} bytes`;
                        if (block.autostart !== undefined && block.autostart !== null) {
                            details += `<br><span class="label">Autostart:</span> ${block.autostart}`;
                        }
                        if (block.startAddress !== undefined) {
                            details += `<br><span class="label">Start address:</span> <span class="value">$${hex16(block.startAddress)}</span>`;
                        }
                    } else if (block.dataBlock) {
                        details = `<span class="label">Data length:</span> ${block.dataLength} bytes`;
                    } else {
                        details = `<span class="label">Data length:</span> ${block.dataLength} bytes`;
                    }
                    if (block.pause) details += `<br><span class="label">Pause:</span> ${block.pause} ms`;
                    break;

                case 0x11: // Turbo speed data
                    details = `<span class="label">Data length:</span> ${block.dataLength} bytes`;
                    break;

                case 0x12: // Pure tone
                    details = `<span class="label">Pulse length:</span> ${block.pulseLength} T-states<br>`;
                    details += `<span class="label">Pulse count:</span> ${block.pulseCount}`;
                    break;

                case 0x14: // Pure data
                    details = `<span class="label">Data length:</span> ${block.dataLength} bytes`;
                    break;

                case 0x20: // Pause/stop
                    if (block.stopTape) {
                        details = `<span class="label">Action:</span> Stop the tape`;
                    } else {
                        details = `<span class="label">Pause:</span> ${block.pause} ms`;
                    }
                    break;

                case 0x21: // Group start
                    details = `<span class="label">Group:</span> "${block.groupName}"`;
                    break;

                case 0x23: // Jump
                    details = `<span class="label">Jump:</span> ${block.jump} blocks`;
                    break;

                case 0x24: // Loop start
                    details = `<span class="label">Repetitions:</span> ${block.repetitions}`;
                    break;

                case 0x30: // Text description
                    details = `<span class="label">Text:</span> "${block.text}"`;
                    break;

                case 0x31: // Message
                    details = `<span class="label">Display time:</span> ${block.displayTime}s<br>`;
                    details += `<span class="label">Message:</span> "${block.message}"`;
                    break;

                case 0x32: // Archive info
                    if (block.archiveInfo && block.archiveInfo.length > 0) {
                        for (const info of block.archiveInfo) {
                            details += `<span class="label">${info.type}:</span> "${info.value}"<br>`;
                        }
                        details = details.slice(0, -4); // Remove trailing <br>
                    }
                    break;

                case 0x35: // Custom info
                    details = `<span class="label">Custom ID:</span> "${block.customId}"`;
                    break;
            }

            if (details) {
                html += `<div class="explorer-block-details">${details}</div>`;
            }

            if (block.error) {
                html += `<div class="explorer-block-details" style="color: var(--error);">${block.error}</div>`;
            }

            html += '</div>';
        }

        html += '</div></div>';
        return html;
    }

    function explorerRenderSNAInfo() {
        const r = explorerParsed.registers;
        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">SNA Snapshot (${explorerParsed.is128 ? '128K' : '48K'})</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Machine</th><td>${explorerParsed.is128 ? 'ZX Spectrum 128K' : 'ZX Spectrum 48K'}</td></tr>
            </table>
        </div>`;

        html += `<div class="explorer-info-section">
            <div class="explorer-info-header">Registers</div>
            ${explorerRenderRegsTable(r)}
        </div>`;

        return html;
    }

    function explorerRenderZ80Info() {
        const r = explorerParsed.registers;

        // Determine machine type name from hwMode
        let machineType = explorerParsed.is128 ? 'ZX Spectrum 128K' : 'ZX Spectrum 48K';
        if (explorerParsed.version >= 2) {
            const hwMode = explorerParsed.hwMode;
            if (explorerParsed.version === 2) {
                if (hwMode === 0) machineType = '48K';
                else if (hwMode === 1) machineType = '48K + IF1';
                else if (hwMode === 2) machineType = 'SamRam';
                else if (hwMode === 3) machineType = '128K';
                else if (hwMode === 4) machineType = '128K + IF1';
            } else {
                if (hwMode === 0) machineType = '48K';
                else if (hwMode === 1) machineType = '48K + IF1';
                else if (hwMode === 2) machineType = 'SamRam';
                else if (hwMode === 3) machineType = '48K + MGT';
                else if (hwMode === 4) machineType = '128K';
                else if (hwMode === 5) machineType = '128K + IF1';
                else if (hwMode === 6) machineType = '128K + MGT';
                else if (hwMode === 7) machineType = '+3';
                else if (hwMode === 9) machineType = 'Pentagon';
                else if (hwMode === 12) machineType = '+2';
                else if (hwMode === 13) machineType = '+2A';
            }
        }

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">Z80 Snapshot (v${explorerParsed.version})</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Version</th><td>${explorerParsed.version}</td></tr>
                <tr><th>Machine</th><td>${machineType} (hwMode=${explorerParsed.hwMode})</td></tr>
                <tr><th>Compressed</th><td>${explorerParsed.compressed ? 'Yes' : 'No'}</td></tr>
                ${explorerParsed.is128 ? `<tr><th>Port 7FFD</th><td>${hex8(explorerParsed.port7FFD)}</td></tr>` : ''}
            </table>
        </div>`;

        html += `<div class="explorer-info-section">
            <div class="explorer-info-header">Registers</div>
            <table class="explorer-info-table">
                <tr><th>PC</th><td>${hex16(r.PC)}</td><th>SP</th><td>${hex16(r.SP)}</td></tr>
                <tr><th>AF</th><td>${hex16(r.AF)}</td><th>AF'</th><td>${hex16(r.AFa)}</td></tr>
                <tr><th>BC</th><td>${hex16(r.BC)}</td><th>BC'</th><td>${hex16(r.BCa)}</td></tr>
                <tr><th>DE</th><td>${hex16(r.DE)}</td><th>DE'</th><td>${hex16(r.DEa)}</td></tr>
                <tr><th>HL</th><td>${hex16(r.HL)}</td><th>HL'</th><td>${hex16(r.HLa)}</td></tr>
                <tr><th>IX</th><td>${hex16(r.IX)}</td><th>IY</th><td>${hex16(r.IY)}</td></tr>
                <tr><th>I</th><td>${hex8(r.I)}</td><th>R</th><td>${hex8(r.R)}</td></tr>
                <tr><th>IM</th><td>${r.IM}</td><th>IFF1</th><td>${r.IFF1}</td></tr>
                <tr><th>Border</th><td>${r.border}</td><th>IFF2</th><td>${r.IFF2}</td></tr>
            </table>
        </div>`;

        // Show pages
        if (explorerParsed.pages && explorerParsed.pages.length > 0) {
            html += `<div class="explorer-info-section">
                <div class="explorer-info-header">Pages (${explorerParsed.pages.length})</div>
                <div class="explorer-block-list">`;

            for (const page of explorerParsed.pages) {
                const romClass = (page.num === 0 || page.num === 2) ? ' style="color: var(--cyan);"' : '';
                html += `<div class="explorer-block"${romClass}>
                    <span class="explorer-block-type">Page ${page.num}</span>
                    <span class="explorer-block-size">${page.desc} (${page.compLen} bytes${page.compressed ? ', compressed' : ''})</span>
                </div>`;
            }

            html += '</div></div>';
        }

        return html;
    }

    function explorerRenderSZXInfo() {
        if (explorerParsed.error) {
            return `<div class="explorer-info-section"><div class="explorer-info-header">SZX File</div><table class="explorer-info-table"><tr><th>Error</th><td>${explorerParsed.error}</td></tr></table></div>`;
        }

        const r = explorerParsed.registers;
        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">SZX Snapshot (v${explorerParsed.version}, ${explorerParsed.is128 ? '128K' : '48K'})</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Version</th><td>${explorerParsed.version}</td></tr>
                <tr><th>Machine</th><td>${explorerParsed.machineType} (ID: ${explorerParsed.machineId})</td></tr>
                <tr><th>Chunks</th><td>${explorerParsed.chunks.length}</td></tr>
            </table>
        </div>`;

        if (r && r.PC !== undefined) {
            html += `<div class="explorer-info-section">
                <div class="explorer-info-header">Registers</div>
                <table class="explorer-info-table">
                    <tr><th>PC</th><td>${hex16(r.PC)}</td><th>SP</th><td>${hex16(r.SP)}</td></tr>
                    <tr><th>AF</th><td>${hex16(r.AF)}</td><th>AF'</th><td>${hex16(r.AFa)}</td></tr>
                    <tr><th>BC</th><td>${hex16(r.BC)}</td><th>BC'</th><td>${hex16(r.BCa)}</td></tr>
                    <tr><th>DE</th><td>${hex16(r.DE)}</td><th>DE'</th><td>${hex16(r.DEa)}</td></tr>
                    <tr><th>HL</th><td>${hex16(r.HL)}</td><th>HL'</th><td>${hex16(r.HLa)}</td></tr>
                    <tr><th>IX</th><td>${hex16(r.IX)}</td><th>IY</th><td>${hex16(r.IY)}</td></tr>
                    <tr><th>I</th><td>${hex8(r.I)}</td><th>R</th><td>${hex8(r.R)}</td></tr>
                    <tr><th>IM</th><td>${r.IM}</td><th>IFF1</th><td>${r.IFF1}</td></tr>
                    <tr><th>Border</th><td>${r.border}</td><th>IFF2</th><td>${r.IFF2}</td></tr>
                </table>
            </div>`;
        }

        // Show chunk list
        html += `<div class="explorer-info-section">
            <div class="explorer-info-header">Chunks</div>
            <div class="explorer-block-list">`;

        for (const chunk of explorerParsed.chunks) {
            html += `<div class="explorer-block">
                <span class="explorer-block-type">${chunk.id}</span>
                <span class="explorer-block-size">${chunk.size} bytes @ ${hex16(chunk.offset)}</span>
            </div>`;
        }

        html += '</div></div>';
        return html;
    }

    function explorerRenderRZXInfo() {
        if (explorerParsed.error) {
            return `<div class="explorer-info-section"><div class="explorer-info-header">RZX File</div><table class="explorer-info-table"><tr><th>Error</th><td>${explorerParsed.error}</td></tr></table></div>`;
        }

        const stats = explorerParsed.stats;
        const creatorStr = explorerParsed.creatorInfo ?
            `${explorerParsed.creatorInfo.name} v${explorerParsed.creatorInfo.majorVersion}.${explorerParsed.creatorInfo.minorVersion}` :
            'Unknown';

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">RZX Input Recording</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Frames</th><td>${explorerParsed.totalFrames.toLocaleString()}</td></tr>
                <tr><th>Duration</th><td>${stats ? stats.durationSeconds + 's' : '?'} (@ 50fps)</td></tr>
                <tr><th>Snapshots</th><td>${explorerParsed.allSnapshots && explorerParsed.allSnapshots.length > 0
                    ? explorerParsed.allSnapshots.map((s, i) =>
                        `${s.ext.toUpperCase()}${i === 0 ? ' (start)' : i === explorerParsed.allSnapshots.length - 1 ? ' (end)' : ''} <button onclick="explorerExtractRZXSnapshot(${i})" class="small-btn">Extract</button>`
                      ).join('<br>')
                    : 'None'}</td></tr>
                <tr><th>Creator</th><td>${creatorStr}</td></tr>
            </table>
        </div>`;

        // Show frame statistics
        if (stats) {
            html += `<div class="explorer-info-section">
                <div class="explorer-info-header">Frame Statistics</div>
                <table class="explorer-info-table">
                    <tr><th>Total Inputs</th><td>${stats.totalInputs.toLocaleString()}</td></tr>
                    <tr><th>Total M1 Cycles</th><td>${stats.totalFetchCount.toLocaleString()}</td></tr>
                    <tr><th>Avg M1/Frame</th><td>${stats.avgFetchCount.toLocaleString()}</td></tr>
                    <tr><th>Avg Inputs/Frame</th><td>${stats.avgInputsPerFrame}</td></tr>
                    <tr><th>M1 Range</th><td>${stats.fetchRange.min} - ${stats.fetchRange.max}</td></tr>
                    <tr><th>Inputs Range</th><td>${stats.inputsRange.min} - ${stats.inputsRange.max}</td></tr>
                </table>
            </div>`;
        }

        // Show embedded snapshot registers if available
        if (explorerParsed.embeddedParsed && explorerParsed.embeddedParsed.registers) {
            const r = explorerParsed.embeddedParsed.registers;
            const snapType = explorerParsed.snapshotType.toUpperCase();
            const is128 = explorerParsed.embeddedParsed.is128;

            html += `<div class="explorer-info-section">
                <div class="explorer-info-header">Embedded ${snapType} Snapshot (${is128 ? '128K' : '48K'})</div>
                <table class="explorer-info-table">
                    <tr><th>PC</th><td>${hex16(r.PC)}</td><th>SP</th><td>${hex16(r.SP)}</td></tr>
                    <tr><th>AF</th><td>${hex16(r.AF)}</td><th>AF'</th><td>${hex16(r.AFa)}</td></tr>
                    <tr><th>BC</th><td>${hex16(r.BC)}</td><th>BC'</th><td>${hex16(r.BCa)}</td></tr>
                    <tr><th>DE</th><td>${hex16(r.DE)}</td><th>DE'</th><td>${hex16(r.DEa)}</td></tr>
                    <tr><th>HL</th><td>${hex16(r.HL)}</td><th>HL'</th><td>${hex16(r.HLa)}</td></tr>
                    <tr><th>IX</th><td>${hex16(r.IX)}</td><th>IY</th><td>${hex16(r.IY)}</td></tr>
                    <tr><th>I</th><td>${hex8(r.I)}</td><th>R</th><td>${hex8(r.R)}</td></tr>
                    <tr><th>IM</th><td>${r.IM}</td><th>Border</th><td>${r.border}</td></tr>
                </table>
            </div>`;

            // Show embedded snapshot pages
            const embPages = explorerParsed.embeddedParsed.pages;
            if (embPages && embPages.length > 0) {
                html += `<div class="explorer-info-section">
                    <div class="explorer-info-header">Snapshot Pages (${embPages.length})</div>
                    <div class="explorer-block-list">`;

                for (const page of embPages) {
                    const romClass = (page.num === 0 || page.num === 2) ? ' style="color: var(--cyan);"' : '';
                    html += `<div class="explorer-block"${romClass}>
                        <span class="explorer-block-type">Page ${page.num}</span>
                        <span class="explorer-block-size">${page.desc} (${page.compLen} bytes${page.compressed ? ', compressed' : ''})</span>
                    </div>`;
                }

                html += '</div></div>';
            }
        }

        // Show keypress timeline (human-readable)
        if (explorerParsed.frames && explorerParsed.frames.length > 0) {
            html += explorerRenderRZXKeyTimeline();
        }

        return html;
    }

    // Extract embedded snapshot from RZX and download it
    // index: which snapshot to extract (0 = first/start, default; higher = later/end)
    function explorerExtractRZXSnapshot(index = 0) {
        if (!explorerParsed || explorerParsed.type !== 'rzx') {
            alert('No RZX file loaded');
            return;
        }

        const allSnapshots = explorerParsed.allSnapshots;
        if (!allSnapshots || allSnapshots.length === 0) {
            alert('No embedded snapshots to extract');
            return;
        }

        if (index < 0 || index >= allSnapshots.length) {
            alert(`Invalid snapshot index: ${index}`);
            return;
        }

        const snapInfo = allSnapshots[index];
        const snapshot = snapInfo.data;
        const ext = snapInfo.ext || 'bin';
        const baseName = (explorerFileName.textContent || 'rzx_snapshot').replace(/\.rzx$/i, '');
        const suffix = allSnapshots.length > 1 ? `_snap${index + 1}` : '_embedded';
        const filename = baseName + suffix + '.' + ext;

        // Create download blob
        const blob = new Blob([snapshot], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

    }
    // Make globally accessible for inline onclick in generated HTML
    window.explorerExtractRZXSnapshot = explorerExtractRZXSnapshot;

    // Decode RZX input value to human-readable format
    // NOTE: RZX only stores VALUES, not ports - so for keyboard we show all possible keys per bit
    function rzxDecodeInput(value) {
        // Kempston joystick: active HIGH, values 0x01-0x1F
        // Bits: 0=Right, 1=Left, 2=Down, 3=Up, 4=Fire
        if (value > 0 && value <= 0x1F) {
            const dirs = [];
            if (value & 0x01) dirs.push('Right');
            if (value & 0x02) dirs.push('Left');
            if (value & 0x04) dirs.push('Down');
            if (value & 0x08) dirs.push('Up');
            if (value & 0x10) dirs.push('Fire');
            return 'Kemp: ' + dirs.join('+');
        }

        // Keyboard: active LOW (0=pressed in bits 0-4)
        // All 8 possible keys for each bit (one per row):
        const keysPerBit = [
            'CS/A/Q/1/0/P/Ent/Spc',   // bit 0
            'Z/S/W/2/9/O/L/SS',        // bit 1
            'X/D/E/3/8/I/K/M',         // bit 2
            'C/F/R/4/7/U/J/N',         // bit 3
            'V/G/T/5/6/Y/H/B'          // bit 4
        ];

        const pressed = [];
        for (let bit = 0; bit < 5; bit++) {
            if ((value & (1 << bit)) === 0) {
                pressed.push(keysPerBit[bit]);
            }
        }

        if (pressed.length === 0) return '(none)';
        return pressed.join(' + ');
    }

    // Current RZX decode mode (for explorer)
    let rzxDecodeMode = 'all';

    // Decode pressed bits (already normalized: 1=pressed) to key names
    function rzxDecodeBits(bits, originalValue, mode = null) {
        mode = mode || rzxDecodeMode;

        // Check if Kempston (original value was low with bits SET)
        if (originalValue > 0 && originalValue <= 0x1F) {
            const dirs = [];
            if (bits & 0x01) dirs.push('Right');
            if (bits & 0x02) dirs.push('Left');
            if (bits & 0x04) dirs.push('Down');
            if (bits & 0x08) dirs.push('Up');
            if (bits & 0x10) dirs.push('Fire');
            return dirs.length > 0 ? dirs.join('+') : '(none)';
        }

        // Keyboard decode based on mode
        const decodeModes = {
            'all': [
                'CS/A/Q/1/0/P/Ent/Spc',   // bit 0
                'Z/S/W/2/9/O/L/SS',        // bit 1
                'X/D/E/3/8/I/K/M',         // bit 2
                'C/F/R/4/7/U/J/N',         // bit 3
                'V/G/T/5/6/Y/H/B'          // bit 4
            ],
            'if2p1': [  // Interface II Port 1 (1-5): 1=Left, 2=Right, 3=Down, 4=Up, 5=Fire
                'Left',   // bit 0 = 1
                'Right',  // bit 1 = 2
                'Down',   // bit 2 = 3
                'Up',     // bit 3 = 4
                'Fire'    // bit 4 = 5
            ],
            'if2p2': [  // Interface II Port 2 (6-0): 6=Left, 7=Right, 8=Down, 9=Up, 0=Fire
                'Fire',   // bit 0 = 0
                'Up',     // bit 1 = 9
                'Down',   // bit 2 = 8
                'Right',  // bit 3 = 7
                'Left'    // bit 4 = 6
            ],
            'cursors': [  // Cursor keys: 5=Left, 6=Down, 7=Up, 8=Right, 0=Fire
                'Fire',   // bit 0 = 0
                '?',      // bit 1 = 9
                'Right',  // bit 2 = 8
                'Up',     // bit 3 = 7
                'Left/Down' // bit 4 = 5 or 6
            ],
            'qaop': [  // QAOP + Space: Q=Up, A=Down, O=Left, P=Right, Space=Fire
                'Up/Fire',   // bit 0 = Q or Space
                'Down/Left', // bit 1 = A or O
                '?',         // bit 2
                '?',         // bit 3
                'Right'      // bit 4 = P (row 0xDF)
            ],
            'kempston': [
                'Right',  // bit 0
                'Left',   // bit 1
                'Down',   // bit 2
                'Up',     // bit 3
                'Fire'    // bit 4
            ]
        };

        const keysPerBit = decodeModes[mode] || decodeModes['all'];

        const pressed = [];
        for (let bit = 0; bit < 5; bit++) {
            if (bits & (1 << bit)) {
                pressed.push(keysPerBit[bit]);
            }
        }

        return pressed.length > 0 ? pressed.join('+') : '(none)';
    }

    // Check if a value indicates "no input" (all key bits = 1)
    function rzxIsNoInput(value) {
        return (value & 0x1F) === 0x1F || value === 0;
    }

    // Extract pressed key bits (0-4) from a value, ignoring upper bits
    function rzxGetPressedBits(value) {
        if (value > 0 && value <= 0x1F) {
            return value & 0x1F;
        }
        return (~value) & 0x1F;
    }

    function explorerRenderRZXKeyTimeline() {
        if (!explorerParsed.frames || explorerParsed.frames.length === 0) return '';

        const GAP_TOLERANCE = 5;  // frames

        const events = [];
        let currentBits = 0;
        let currentValue = 0xFF;
        let keyStartFrame = 0;
        let lastActiveFrame = 0;

        for (let i = 0; i < explorerParsed.frames.length; i++) {
            const frame = explorerParsed.frames[i];

            let frameBits = 0;
            let frameValue = 0xFF;

            for (const input of frame.inputs) {
                if (!rzxIsNoInput(input)) {
                    const bits = rzxGetPressedBits(input);
                    frameBits |= bits;
                    frameValue = input;
                }
            }

            if (frameBits !== 0 && currentBits === 0) {
                currentBits = frameBits;
                currentValue = frameValue;
                keyStartFrame = i;
                lastActiveFrame = i;
            } else if (frameBits === 0 && currentBits !== 0) {
                if (i - lastActiveFrame > GAP_TOLERANCE) {
                    events.push({
                        type: 'press',
                        startFrame: keyStartFrame,
                        endFrame: lastActiveFrame,
                        duration: lastActiveFrame - keyStartFrame + 1,
                        value: currentValue,
                        bits: currentBits
                    });
                    currentBits = 0;
                }
            } else if (frameBits !== 0 && currentBits !== 0) {
                if (frameBits === currentBits) {
                    lastActiveFrame = i;
                } else {
                    events.push({
                        type: 'press',
                        startFrame: keyStartFrame,
                        endFrame: lastActiveFrame,
                        duration: lastActiveFrame - keyStartFrame + 1,
                        value: currentValue,
                        bits: currentBits
                    });
                    currentBits = frameBits;
                    currentValue = frameValue;
                    keyStartFrame = i;
                    lastActiveFrame = i;
                }
            }
        }

        if (currentBits !== 0) {
            events.push({
                type: 'press',
                startFrame: keyStartFrame,
                endFrame: explorerParsed.frames.length - 1,
                duration: explorerParsed.frames.length - keyStartFrame,
                value: currentValue,
                bits: currentBits
            });
        }

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">Keypress Timeline (${events.length} keypresses)
                <select id="rzxDecodeMode" style="margin-left: 10px; font-size: 11px;">
                    <option value="all">All keys</option>
                    <option value="if2p1">Interface II Port 1 (1-5)</option>
                    <option value="if2p2">Interface II Port 2 (6-0)</option>
                    <option value="cursors">Cursor keys (5-8)</option>
                    <option value="qaop">QAOP + Space</option>
                    <option value="kempston">Kempston</option>
                </select>
            </div>
            <div class="explorer-file-list" style="max-height: 350px; font-size: 11px;">`;

        if (events.length === 0) {
            html += '<div style="color: var(--text-secondary); padding: 8px;">No keypresses detected</div>';
        } else {
            html += `<div class="explorer-file-entry" style="padding: 2px 4px; color: var(--text-secondary); border-bottom: 1px solid var(--border-color);">
                <span style="width: 55px; display: inline-block;">Start</span>
                <span style="width: 70px; display: inline-block;">Duration</span>
                <span>Keys (possible)</span>
            </div>`;

            const maxToShow = 200;
            for (let i = 0; i < Math.min(maxToShow, events.length); i++) {
                const e = events[i];
                const startMs = Math.round(e.startFrame * 20);
                const durMs = Math.round(e.duration * 20);
                const durStr = durMs >= 1000 ? `${(durMs/1000).toFixed(1)}s` : `${durMs}ms`;

                const keysStr = rzxDecodeBits(e.bits, e.value);

                const bitNums = [];
                for (let b = 0; b < 5; b++) {
                    if (e.bits & (1 << b)) bitNums.push(b);
                }
                const bitStr = bitNums.length > 0 ? `[b${bitNums.join(',')}]` : '';

                html += `<div class="explorer-file-entry" style="padding: 2px 4px;">
                    <span style="color: var(--cyan); width: 55px; display: inline-block;">F${e.startFrame}</span>
                    <span style="color: var(--text-secondary); width: 70px; display: inline-block;">${durStr}</span>
                    <span style="color: var(--text-primary);">${keysStr}</span>
                    <span style="color: var(--text-secondary); margin-left: 8px;">${bitStr}</span>
                </div>`;
            }

            if (events.length > maxToShow) {
                html += `<div style="color: var(--text-secondary); padding: 4px;">... and ${events.length - maxToShow} more keypresses</div>`;
            }
        }

        html += '</div></div>';

        html += explorerRenderRZXFrameDetails();

        return html;
    }

    function explorerRenderRZXFrameDetails() {
        const framesWithInput = [];
        for (let i = 0; i < explorerParsed.frames.length && framesWithInput.length < 30; i++) {
            const frame = explorerParsed.frames[i];
            const hasInput = frame.inputs.some(v => !rzxIsNoInput(v));
            if (hasInput) {
                framesWithInput.push({ index: i, frame });
            }
        }

        if (framesWithInput.length === 0) return '';

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">Frames with Input (first ${framesWithInput.length})</div>
            <div class="explorer-file-list" style="max-height: 250px; font-size: 11px;">`;

        for (const { index, frame } of framesWithInput) {
            const timeMs = Math.round(index * 20);

            const activeInputs = [...new Set(frame.inputs.filter(v => !rzxIsNoInput(v)))];
            const inputStr = activeInputs.map(v => rzxDecodeInput(v)).join('; ');

            html += `<div class="explorer-file-entry" style="padding: 2px 4px;">
                <span style="color: var(--cyan); width: 50px; display: inline-block;">F${index}</span>
                <span style="color: var(--text-secondary); width: 60px; display: inline-block;">${timeMs}ms</span>
                <span style="color: var(--text-secondary); width: 70px; display: inline-block;">M1:${frame.fetchCount}</span>
                <span style="color: #f80;">${inputStr}</span>
            </div>`;
        }

        html += '</div></div>';
        return html;
    }

    function explorerRenderTRDInfo() {
        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">TRD Disk Image</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Label</th><td>${explorerParsed.diskTitle || '(none)'}</td></tr>
                <tr><th>Files</th><td>${explorerParsed.files.length}</td></tr>
                <tr><th>Free</th><td>${explorerParsed.freeSectors} sectors</td></tr>
            </table>
        </div>`;

        html += `<div class="explorer-info-section">
            <div class="explorer-info-header">File List</div>
            <div class="explorer-file-list">`;

        for (let i = 0; i < explorerParsed.files.length; i++) {
            const file = explorerParsed.files[i];
            const len = file.length;
            const previewable = len === SCREEN_SIZE || len === SCREEN_BITMAP_SIZE || len === 4096 ||
                len === 2048 || len === SCREEN_ATTR_SIZE || len === 9216 ||
                len === 11136 || len === 12288 || len === 18432;
            const previewIcon = previewable ? '\u2B1A' : '';
            html += `<div class="explorer-file-entry" data-index="${i}">
                <span class="explorer-file-num">${i + 1}</span>
                <span class="explorer-file-type">${file.ext}</span>
                <span class="explorer-file-name">${file.name}</span>
                <span class="explorer-file-size">${file.length}</span>
                <span class="explorer-file-addr">$${hex16(file.startAddress)}</span>
                <span class="explorer-file-preview">${previewIcon}</span>
            </div>`;
        }

        html += '</div></div>';
        return html;
    }

    function explorerRenderSCLInfo() {
        if (explorerParsed.error) {
            return `<div class="explorer-info-section">
                <div class="explorer-info-header">SCL File</div>
                <div style="color:#e74c3c">Error: ${explorerParsed.error}</div>
            </div>`;
        }

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">SCL Archive</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Files</th><td>${explorerParsed.files.length}</td></tr>
            </table>
        </div>`;

        html += `<div class="explorer-info-section">
            <div class="explorer-info-header">File List</div>
            <div class="explorer-file-list">`;

        for (let i = 0; i < explorerParsed.files.length; i++) {
            const file = explorerParsed.files[i];
            const len = file.length;
            const previewable = len === SCREEN_SIZE || len === SCREEN_BITMAP_SIZE || len === 4096 ||
                len === 2048 || len === SCREEN_ATTR_SIZE || len === 9216 ||
                len === 11136 || len === 12288 || len === 18432;
            const previewIcon = previewable ? '\u2B1A' : '';
            html += `<div class="explorer-file-entry" data-index="${i}">
                <span class="explorer-file-num">${i + 1}</span>
                <span class="explorer-file-type">${file.ext}</span>
                <span class="explorer-file-name">${file.name}</span>
                <span class="explorer-file-size">${file.length}</span>
                <span class="explorer-file-addr">$${hex16(file.startAddress)}</span>
                <span class="explorer-file-preview">${previewIcon}</span>
            </div>`;
        }

        html += '</div></div>';
        return html;
    }

    function explorerRenderDSKInfo() {
        if (explorerParsed.error) {
            return `<div class="explorer-info-section">
                <div class="explorer-info-header">DSK Disk Image</div>
                <div style="color:#e74c3c">Error: ${explorerParsed.error}</div>
            </div>`;
        }

        const formatType = explorerParsed.isExtended ? 'Extended CPC DSK' : 'Standard CPC DSK';
        const geometry = `${explorerParsed.numTracks} tracks, ${explorerParsed.numSides} side${explorerParsed.numSides > 1 ? 's' : ''}`;
        const spec = explorerParsed.diskSpec;

        let sectorInfo = '';
        if (explorerParsed.dskImage) {
            const t0 = explorerParsed.dskImage.getTrack(0, 0);
            if (t0 && t0.sectors.length > 0) {
                const sectorSize = t0.sectors[0].data.length;
                sectorInfo = `${t0.sectors.length} sectors/track, ${sectorSize} bytes/sector`;
            }
        }

        let specRows = '';
        if (spec) {
            specRows += `<tr><th>Block size</th><td>${spec.blockSize} bytes</td></tr>`;
            specRows += `<tr><th>Reserved</th><td>${spec.reservedTracks} track${spec.reservedTracks !== 1 ? 's' : ''}</td></tr>`;
        }

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">DSK Disk Image</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Format</th><td>${formatType}</td></tr>
                <tr><th>Geometry</th><td>${geometry}</td></tr>
                ${sectorInfo ? `<tr><th>Sectors</th><td>${sectorInfo}</td></tr>` : ''}
                ${specRows}
                <tr><th>Files</th><td>${explorerParsed.files.length}</td></tr>
            </table>
        </div>`;

        if (explorerParsed.files.length > 0) {
            html += `<div class="explorer-info-section">
                <div class="explorer-info-header">File List (+3DOS / CP/M)</div>
                <div class="explorer-file-list">`;

            for (let i = 0; i < explorerParsed.files.length; i++) {
                const file = explorerParsed.files[i];
                const sizeStr = file.size.toLocaleString();

                const fullName = file.name + (file.ext ? '.' + file.ext : '');

                let typeStr = '-';
                if (file.hasPlus3Header) {
                    const typeNames = { 0: 'BASIC', 1: 'NUM', 2: 'CHR', 3: 'CODE' };
                    typeStr = typeNames[file.plus3Type] || '-';
                }

                let addrStr = '';
                if (file.plus3Type === 3 && file.loadAddress !== undefined) {
                    addrStr = '$' + hex16(file.loadAddress);
                } else if (file.plus3Type === 0 && file.autostart !== undefined && file.autostart < 32768) {
                    addrStr = 'LINE ' + file.autostart;
                }

                const len = file.size;
                const previewable = len === SCREEN_SIZE || len === SCREEN_BITMAP_SIZE || len === 4096 ||
                    len === 2048 || len === SCREEN_ATTR_SIZE || len === 9216 ||
                    len === 11136 || len === 12288 || len === 18432;
                const previewIcon = previewable ? '\u2B1A' : '';

                html += `<div class="explorer-file-entry" data-index="${i}">
                    <span class="explorer-file-num">${i + 1}</span>
                    <span class="explorer-file-type">${typeStr}</span>
                    <span class="explorer-file-name">${fullName}</span>
                    <span class="explorer-file-size">${sizeStr}</span>
                    <span class="explorer-file-addr">${addrStr}</span>
                    <span class="explorer-file-preview">${previewIcon}</span>
                </div>`;
            }

            html += '</div></div>';
        }

        return html;
    }

    function explorerRenderZIPInfo() {
        if (explorerParsed.error) {
            return `<div class="explorer-info-section">
                <div class="explorer-info-header">ZIP Archive</div>
                <div style="color:#e74c3c">Error: ${explorerParsed.error}</div>
            </div>`;
        }

        let html = `<div class="explorer-info-section">
            <div class="explorer-info-header">ZIP Archive</div>
            <table class="explorer-info-table">
                <tr><th>Size</th><td>${explorerData.length.toLocaleString()} bytes</td></tr>
                <tr><th>Files</th><td>${explorerParsed.files.length}</td></tr>
            </table>
        </div>`;

        html += `<div class="explorer-info-section">
            <div class="explorer-info-header">File List <span style="font-size:10px;color:var(--text-secondary)">(click to open)</span></div>
            <div class="explorer-block-list">`;

        for (let i = 0; i < explorerParsed.files.length; i++) {
            const file = explorerParsed.files[i];
            const ext = file.name.split('.').pop().toLowerCase();
            const supported = ['tap', 'tzx', 'sna', 'z80', 'trd', 'scl', 'dsk', 'rzx'].includes(ext);

            let extraInfo = '';
            if (ext === 'rzx' && file.data && file.data.length > 10) {
                extraInfo = ' <span style="color:var(--cyan)">[RZX]</span>';
            }

            html += `<div class="explorer-block${supported ? ' explorer-zip-file' : ''}" data-zip-index="${i}" style="${supported ? 'cursor:pointer' : 'opacity:0.5'}">
                <span class="explorer-block-num">${i + 1}</span>
                <span class="explorer-block-type">${ext.toUpperCase()}</span>
                <span class="explorer-block-name">${file.name}${extraInfo}</span>
                <span class="explorer-block-size">${file.size.toLocaleString()} bytes</span>
            </div>`;
        }

        html += '</div></div>';
        return html;
    }

    // Handle RZX decode mode change
    explorerInfoOutput.addEventListener('change', (e) => {
        if (e.target.id === 'rzxDecodeMode') {
            rzxDecodeMode = e.target.value;
            if (explorerParsed && explorerParsed.type === 'rzx') {
                explorerInfoOutput.innerHTML = explorerRenderRZXInfo();
                const dropdown = document.getElementById('rzxDecodeMode');
                if (dropdown) dropdown.value = rzxDecodeMode;
            }
        }
    });

    // Handle clicking on ZIP file entries and TAP blocks
    explorerInfoOutput.addEventListener('click', async (e) => {
        const zipEntry = e.target.closest('.explorer-zip-file');
        if (zipEntry) {
            const idx = parseInt(zipEntry.dataset.zipIndex);
            if (isNaN(idx) || !explorerZipFiles[idx]) return;

            const zipFile = explorerZipFiles[idx];
            const ext = zipFile.name.split('.').pop().toLowerCase();

            if (!['tap', 'tzx', 'sna', 'z80', 'trd', 'scl', 'dsk', 'rzx'].includes(ext)) return;

            explorerZipParentName = explorerFileName.textContent;
            explorerData = new Uint8Array(zipFile.data);
            explorerFileName.textContent = `${explorerZipParentName} > ${zipFile.name}`;
            explorerFileSize.textContent = `(${explorerData.length.toLocaleString()} bytes)`;
            explorerFileType = ext;

            await explorerParseFile(zipFile.name, ext);

            explorerBasicOutput.innerHTML = '<div class="explorer-empty">Select a BASIC program source</div>';
            explorerDisasmOutput.innerHTML = '<div class="explorer-empty">Select a source to disassemble</div>';
            explorerHexOutput.innerHTML = '';

            explorerRenderFileInfo();
            return;
        }

        const blockEntry = e.target.closest('.explorer-block[data-block-index]');
        if (blockEntry && explorerParsed && explorerParsed.type === 'tap') {
            const idx = parseInt(blockEntry.dataset.blockIndex);
            if (isNaN(idx) || !explorerBlocks[idx]) return;

            const block = explorerBlocks[idx];

            if (block.blockType === 'data' && block.data.length > 2) {
                const content = block.data.slice(1, block.data.length - 1);
                const contentLen = content.length;

                if (contentLen === SCREEN_SIZE || contentLen === SCREEN_BITMAP_SIZE || contentLen === 4096 ||
                    contentLen === 2048 || contentLen === SCREEN_ATTR_SIZE || contentLen === 9216 ||
                    contentLen === 11136 || contentLen === 12288 || contentLen === 18432) {
                    explorerUpdatePreview(content);
                    return;
                }
            }

            document.querySelector('.explorer-subtab[data-subtab="hexdump"]').click();

            if (block.blockType === 'data') {
                explorerHexSource.value = idx.toString();
            } else {
                if (idx + 1 < explorerBlocks.length && explorerBlocks[idx + 1].blockType === 'data') {
                    explorerHexSource.value = (idx + 1).toString();
                }
            }

            const dataLen = block.length;
            explorerHexLen.value = Math.min(dataLen, 65536);
            explorerHexAddr.value = '0000';

            explorerRenderHexDump();
        }

        const trdEntry = e.target.closest('.explorer-file-entry[data-index]');
        if (trdEntry && explorerParsed && (explorerParsed.type === 'trd' || explorerParsed.type === 'scl')) {
            const idx = parseInt(trdEntry.dataset.index);
            if (isNaN(idx) || !explorerParsed.files[idx]) return;

            const file = explorerParsed.files[idx];
            const fileData = explorerData.slice(file.offset, file.offset + file.length);

            const contentLen = fileData.length;
            if (contentLen === SCREEN_SIZE || contentLen === SCREEN_BITMAP_SIZE || contentLen === 4096 ||
                contentLen === 2048 || contentLen === SCREEN_ATTR_SIZE || contentLen === 9216 ||
                contentLen === 11136 || contentLen === 12288 || contentLen === 18432) {
                explorerUpdatePreview(fileData);
                return;
            }

            if (file.ext === 'B') {
                document.querySelector('.explorer-subtab[data-subtab="basic"]').click();
                explorerBasicSource.value = idx.toString();
                explorerDecodeBASIC();
                return;
            }

            if (file.ext === 'C') {
                document.querySelector('.explorer-subtab[data-subtab="disasm"]').click();
                explorerDisasmSource.value = idx.toString();
                explorerDisasmAddr.value = hex16(file.startAddress);
                explorerDisasmLen.value = Math.min(file.length, 4096);
                explorerRenderDisasm();
                return;
            }

            document.querySelector('.explorer-subtab[data-subtab="hexdump"]').click();
            explorerHexSource.value = idx.toString();
            explorerHexLen.value = Math.min(file.length, 65536);
            explorerHexAddr.value = '0000';
            explorerRenderHexDump();
        }

        const dskEntry = e.target.closest('.explorer-file-entry[data-index]');
        if (dskEntry && explorerParsed && explorerParsed.type === 'dsk') {
            const idx = parseInt(dskEntry.dataset.index);
            if (isNaN(idx) || !explorerParsed.files[idx]) return;

            const file = explorerParsed.files[idx];

            const fileData = DSKLoader.readFileData(
                explorerParsed.dskImage, file.name, file.ext, file.user, file.rawSize || file.size
            );
            if (!fileData || fileData.length === 0) return;

            const hasHeader = file.hasPlus3Header;
            const contentData = hasHeader ? fileData.slice(128) : fileData;
            const contentLen = contentData.length;

            if (contentLen === SCREEN_SIZE || contentLen === SCREEN_BITMAP_SIZE || contentLen === 4096 ||
                contentLen === 2048 || contentLen === SCREEN_ATTR_SIZE || contentLen === 9216 ||
                contentLen === 11136 || contentLen === 12288 || contentLen === 18432) {
                explorerUpdatePreview(contentData);
                return;
            }

            if (file.plus3Type === 0) {
                document.querySelector('.explorer-subtab[data-subtab="basic"]').click();
                explorerBasicSource.value = idx.toString();
                explorerRenderBASIC();
                return;
            }

            if (file.plus3Type === 3 && file.loadAddress !== undefined) {
                document.querySelector('.explorer-subtab[data-subtab="disasm"]').click();
                explorerDisasmSource.value = idx.toString();
                explorerDisasmAddr.value = hex16(file.loadAddress);
                explorerDisasmLen.value = Math.min(file.size, 4096);
                explorerRenderDisasm();
                return;
            }

            document.querySelector('.explorer-subtab[data-subtab="hexdump"]').click();
            explorerHexSource.value = idx.toString();
            explorerHexLen.value = Math.min(file.rawSize || file.size, 65536);
            explorerHexAddr.value = '0000';
            explorerRenderHexDump();
        }
    });

    // Update source selectors based on file type
    function explorerUpdateSourceSelectors() {
        const basicOpts = [];
        const disasmOpts = [];
        const hexOpts = [];
        let basicSources = [];

        if (explorerParsed.type === 'tap') {
            for (let i = 0; i < explorerBlocks.length; i++) {
                const block = explorerBlocks[i];
                if (block.blockType === 'header' && block.headerType === 0) {
                    basicOpts.push(`<option value="${i}">Block ${i + 1}: ${block.name}</option>`);
                    basicSources.push(i.toString());
                }
            }
            for (let i = 0; i < explorerBlocks.length; i++) {
                const block = explorerBlocks[i];
                if (block.blockType === 'header' && block.headerType === 3) {
                    disasmOpts.push(`<option value="${i}">Block ${i + 1}: ${block.name} @ ${hex16(block.startAddress)}</option>`);
                }
            }
            for (let i = 0; i < explorerBlocks.length; i++) {
                const block = explorerBlocks[i];
                if (block.blockType === 'data') {
                    const prevBlock = i > 0 ? explorerBlocks[i - 1] : null;
                    const name = prevBlock && prevBlock.blockType === 'header' ? prevBlock.name : `Block ${i + 1}`;
                    const addr = prevBlock && prevBlock.startAddress !== undefined ? ` @ ${hex16(prevBlock.startAddress)}` : '';
                    if (!prevBlock || prevBlock.headerType !== 3) {
                        disasmOpts.push(`<option value="data:${i}">${name} data${addr} (${block.length} bytes)</option>`);
                    }
                }
            }
            for (let i = 0; i < explorerBlocks.length; i++) {
                const block = explorerBlocks[i];
                if (block.blockType === 'data') {
                    const prevBlock = i > 0 ? explorerBlocks[i - 1] : null;
                    const name = prevBlock && prevBlock.blockType === 'header' ? prevBlock.name : `Block ${i + 1}`;
                    hexOpts.push(`<option value="${i}">${name} (${block.length} bytes)</option>`);
                }
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            const files = explorerParsed.files;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file.ext === 'B') {
                    basicOpts.push(`<option value="${i}">${file.name}.${file.ext}</option>`);
                    basicSources.push(i.toString());
                    disasmOpts.push(`<option value="basic:${i}">${file.name}.${file.ext} (BASIC @ 5CCB)</option>`);
                } else if (file.ext === 'C') {
                    disasmOpts.push(`<option value="${i}">${file.name}.${file.ext} @ ${hex16(file.startAddress)}</option>`);
                } else if (file.ext === 'D') {
                    disasmOpts.push(`<option value="${i}">${file.name}.${file.ext} @ ${hex16(file.startAddress)}</option>`);
                }
                hexOpts.push(`<option value="${i}">${file.name}.${file.ext} (${file.length} bytes)</option>`);
            }
        } else if (explorerParsed.type === 'dsk') {
            disasmOpts.push('<option value="boot">Boot sector @ $FE10</option>');
            hexOpts.push('<option value="boot">Boot sector (512 bytes)</option>');
            const files = explorerParsed.files;
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const displayName = file.name + (file.ext ? '.' + file.ext : '');
                const addrStr = file.loadAddress !== undefined ? ` @ ${hex16(file.loadAddress)}` : '';
                if (file.plus3Type === 0) {
                    basicOpts.push(`<option value="${i}">${displayName}</option>`);
                    basicSources.push(i.toString());
                }
                if (file.plus3Type === 3 || file.plus3Type === undefined) {
                    disasmOpts.push(`<option value="${i}">${displayName}${addrStr} (${file.size} bytes)</option>`);
                }
                hexOpts.push(`<option value="${i}">${displayName} (${file.size} bytes)</option>`);
            }
        } else if (explorerParsed.type === 'sna' || explorerParsed.type === 'z80') {
            disasmOpts.push('<option value="memory">Full memory</option>');
            hexOpts.push('<option value="memory">Full memory</option>');
        }

        explorerBasicSource.innerHTML = '<option value="">Select source...</option>' + basicOpts.join('');
        explorerDisasmSource.innerHTML = '<option value="">Select source...</option>' + disasmOpts.join('');
        explorerHexSource.innerHTML = '<option value="">Whole file</option>' + hexOpts.join('');

        if (basicSources.length === 1) {
            explorerBasicSource.value = basicSources[0];
            explorerRenderBASIC();
            document.querySelector('.explorer-subtab[data-subtab="basic"]').click();
        }

        if (explorerDisasmSource.options.length > 1) {
            explorerDisasmSource.selectedIndex = 1;
            explorerDisasmSource.dispatchEvent(new Event('change'));
        }

        const dataLen = explorerData ? explorerData.length : 0;
        if (dataLen > 0 && dataLen <= 4096) {
            explorerDisasmLen.value = dataLen;
        } else {
            explorerDisasmLen.value = 256;
        }
        if (dataLen > 0 && dataLen <= 65536) {
            explorerHexLen.value = dataLen;
        } else {
            explorerHexLen.value = 256;
        }
        if (explorerHexSource.options.length > 1) {
            explorerHexSource.selectedIndex = 1;
        }
    }

    btnExplorerDisasm.addEventListener('click', () => {
        explorerRenderDisasm();
    });

    explorerDisasmSource.addEventListener('change', () => {
        const source = explorerDisasmSource.value;
        if (!source) return;

        if (explorerParsed.type === 'tap') {
            if (source.startsWith('data:')) {
                const blockIdx = parseInt(source.slice(5));
                const prevBlock = blockIdx > 0 ? explorerBlocks[blockIdx - 1] : null;
                if (prevBlock && prevBlock.blockType === 'header' && prevBlock.startAddress !== undefined) {
                    explorerDisasmAddr.value = hex16(prevBlock.startAddress);
                }
            } else {
                const blockIdx = parseInt(source);
                const headerBlock = explorerBlocks[blockIdx];
                if (headerBlock && headerBlock.startAddress !== undefined) {
                    explorerDisasmAddr.value = hex16(headerBlock.startAddress);
                }
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            if (source.startsWith('basic:')) {
                explorerDisasmAddr.value = '5CCB';
            } else {
                const fileIdx = parseInt(source);
                const file = explorerParsed.files[fileIdx];
                if (file && file.startAddress !== undefined) {
                    explorerDisasmAddr.value = hex16(file.startAddress);
                }
            }
        } else if (explorerParsed.type === 'dsk') {
            if (source === 'boot') {
                explorerDisasmAddr.value = 'FE10';
            } else {
                const fileIdx = parseInt(source);
                const file = explorerParsed.files[fileIdx];
                if (file && file.loadAddress !== undefined) {
                    explorerDisasmAddr.value = hex16(file.loadAddress);
                } else {
                    explorerDisasmAddr.value = '0000';
                }
            }
        } else if (source === 'memory') {
            explorerDisasmAddr.value = '4000';
        }

        explorerRenderDisasm();
    });

    function explorerRenderDisasm() {
        const addr = parseInt(explorerDisasmAddr.value, 16) || 0;
        const len = parseInt(explorerDisasmLen.value, 10) || 256;
        const source = explorerDisasmSource.value;

        let data = null;
        let baseAddr = addr;

        if (source === 'memory' && (explorerParsed.type === 'sna' || explorerParsed.type === 'z80')) {
            data = explorerData.slice(explorerParsed.memoryOffset || 27);
            baseAddr = SLOT1_START;
        } else if (source && explorerParsed.type === 'tap') {
            if (source.startsWith('data:')) {
                const blockIdx = parseInt(source.slice(5));
                const dataBlock = explorerBlocks[blockIdx];
                if (dataBlock && dataBlock.blockType === 'data') {
                    data = dataBlock.data.slice(1, -1);
                    const prevBlock = blockIdx > 0 ? explorerBlocks[blockIdx - 1] : null;
                    if (prevBlock && prevBlock.blockType === 'header' && prevBlock.startAddress !== undefined) {
                        baseAddr = prevBlock.startAddress;
                    } else {
                        baseAddr = 0;
                    }
                }
            } else {
                const blockIdx = parseInt(source);
                const headerBlock = explorerBlocks[blockIdx];
                if (headerBlock && headerBlock.blockType === 'header' && blockIdx + 1 < explorerBlocks.length) {
                    const dataBlock = explorerBlocks[blockIdx + 1];
                    data = dataBlock.data.slice(1, -1);
                    baseAddr = headerBlock.startAddress || 0;
                    explorerDisasmAddr.value = hex16(baseAddr);
                }
            }
        } else if (source && (explorerParsed.type === 'trd' || explorerParsed.type === 'scl')) {
            if (source.startsWith('basic:')) {
                const fileIdx = parseInt(source.slice(6));
                const file = explorerParsed.files[fileIdx];
                if (file) {
                    const fullSize = file.sectors * 256;
                    data = explorerData.slice(file.offset, file.offset + fullSize);
                    baseAddr = 0x5D3B;
                }
            } else {
                const fileIdx = parseInt(source);
                const file = explorerParsed.files[fileIdx];
                if (file) {
                    const fullSize = file.sectors * 256;
                    data = explorerData.slice(file.offset, file.offset + fullSize);
                    baseAddr = file.startAddress;
                    explorerDisasmAddr.value = hex16(baseAddr);
                }
            }
        } else if (source && explorerParsed.type === 'dsk') {
            if (source === 'boot') {
                const bootSector = explorerParsed.dskImage.readSector(0, 0,
                    explorerParsed.diskSpec && explorerParsed.diskSpec.firstSectorId !== undefined
                        ? explorerParsed.diskSpec.firstSectorId : 1);
                if (bootSector && bootSector.length > 16) {
                    data = bootSector.slice(16);
                    baseAddr = 0xFE10;
                    explorerDisasmAddr.value = 'FE10';
                }
            } else {
                const fileIdx = parseInt(source);
                const file = explorerParsed.files[fileIdx];
                if (file) {
                    const rawData = DSKLoader.readFileData(
                        explorerParsed.dskImage, file.name, file.ext, file.user, file.rawSize || file.size
                    );
                    if (rawData && file.hasPlus3Header && rawData.length > 128) {
                        data = rawData.slice(128);
                    } else {
                        data = rawData;
                    }
                    baseAddr = (file.loadAddress !== undefined) ? file.loadAddress : 0;
                    explorerDisasmAddr.value = hex16(baseAddr);
                }
            }
        } else if (!source && explorerData) {
            data = explorerData;
        }

        if (!data || data.length === 0) {
            explorerDisasmOutput.innerHTML = '<div class="explorer-empty">No data to disassemble</div>';
            return;
        }

        const fakeMemory = {
            read: (a) => {
                const offset = a - baseAddr;
                if (offset >= 0 && offset < data.length) {
                    return data[offset];
                }
                return 0;
            }
        };

        const disasm = new Disassembler(fakeMemory);

        let html = '';
        let offset = addr - baseAddr;
        const endOffset = Math.min(offset + len, data.length);

        const romLabels = getRomLabels();

        while (offset < endOffset && offset >= 0) {
            const currentAddr = baseAddr + offset;

            const result = disasm.disassemble(currentAddr);
            const instrLen = result.length || 1;
            const bytesHex = result.bytes.map(b => hex8(b)).join(' ');

            let mnemonic = result.mnemonic || '???';
            const addrMatch = mnemonic.match(/([0-9A-F]{4})h/i);
            if (addrMatch) {
                const targetAddr = parseInt(addrMatch[1], 16);
                const label = romLabels[targetAddr];
                if (label) {
                    mnemonic = mnemonic.replace(addrMatch[0], `<span class="dl">${label}</span>`);
                }
            }

            html += `<span class="da">${hex16(currentAddr)}</span>  <span class="dm">${mnemonic.padEnd(20)}</span> <span class="db">; ${bytesHex}</span>\n`;

            if (isFlowBreak(mnemonic)) {
                html += '\n';
            }

            offset += instrLen;
        }

        explorerDisasmOutput.innerHTML = html || '<div class="explorer-empty">No instructions</div>';
    }

    btnExplorerHex.addEventListener('click', () => {
        explorerRenderHexDump();
    });

    function explorerRenderHexDump() {
        const addr = parseInt(explorerHexAddr.value, 16) || 0;
        const len = parseInt(explorerHexLen.value, 10) || 256;
        const source = explorerHexSource.value;

        let data = null;
        let baseAddr = addr;

        if (source === 'memory' && (explorerParsed.type === 'sna' || explorerParsed.type === 'z80')) {
            data = explorerData.slice(explorerParsed.memoryOffset || 27);
            baseAddr = SLOT1_START;
        } else if (source && explorerParsed.type === 'tap') {
            const blockIdx = parseInt(source);
            const block = explorerBlocks[blockIdx];
            if (block && block.blockType === 'data') {
                data = block.data;
                baseAddr = 0;
            }
        } else if (source && (explorerParsed.type === 'trd' || explorerParsed.type === 'scl')) {
            const fileIdx = parseInt(source);
            const file = explorerParsed.files[fileIdx];
            if (file) {
                data = explorerData.slice(file.offset, file.offset + file.length);
                baseAddr = 0;
            }
        } else if (source && explorerParsed.type === 'dsk') {
            if (source === 'boot') {
                const bootSector = explorerParsed.dskImage.readSector(0, 0,
                    explorerParsed.diskSpec && explorerParsed.diskSpec.firstSectorId !== undefined
                        ? explorerParsed.diskSpec.firstSectorId : 1);
                if (bootSector) {
                    data = bootSector;
                    baseAddr = 0xFE00;
                }
            } else {
                const fileIdx = parseInt(source);
                const file = explorerParsed.files[fileIdx];
                if (file) {
                    data = DSKLoader.readFileData(
                        explorerParsed.dskImage, file.name, file.ext, file.user, file.rawSize || file.size
                    );
                    baseAddr = 0;
                }
            }
        } else if (explorerData) {
            data = explorerData;
        }

        if (!data || data.length === 0) {
            explorerHexOutput.innerHTML = '<div class="explorer-empty">No data</div>';
            return;
        }

        let html = '';
        const startOffset = Math.max(0, addr - baseAddr);
        const endOffset = Math.min(startOffset + len, data.length);

        for (let offset = startOffset; offset < endOffset; offset += 16) {
            const lineAddr = baseAddr + offset;
            let bytesHex = '';
            let ascii = '';

            for (let i = 0; i < 16; i++) {
                if (offset + i < data.length) {
                    const b = data[offset + i];
                    bytesHex += hex8(b) + ' ';
                    ascii += (b >= 32 && b < 127) ? String.fromCharCode(b) : '.';
                } else {
                    bytesHex += '   ';
                    ascii += ' ';
                }
                if (i === 7) bytesHex += ' ';
            }

            html += `<span class="ha">${hex16(lineAddr)}</span>  <span class="hb">${bytesHex}</span>  <span class="hc">${ascii}</span>\n`;
        }

        explorerHexOutput.innerHTML = html || '<div class="explorer-empty">No data</div>';
    }

    // BASIC Decoder for Explorer
    const ExplorerBasicDecoder = (() => {
        // ZX Spectrum BASIC tokens (0xA3-0xFF)
        const TOKENS = {
            0xA3: ['SPECTRUM', true, true], 0xA4: ['PLAY', true, true],
            0xA5: ['RND', true, false], 0xA6: ['INKEY$', true, false],
            0xA7: ['PI', true, false], 0xA8: ['FN', true, false],
            0xA9: ['POINT', true, false], 0xAA: ['SCREEN$', true, false],
            0xAB: ['ATTR', true, false], 0xAC: ['AT', true, true],
            0xAD: ['TAB', true, true], 0xAE: ['VAL$', true, false],
            0xAF: ['CODE', true, true], 0xB0: ['VAL', true, true],
            0xB1: ['LEN', true, false], 0xB2: ['SIN', true, false],
            0xB3: ['COS', true, false], 0xB4: ['TAN', true, false],
            0xB5: ['ASN', true, false], 0xB6: ['ACS', true, false],
            0xB7: ['ATN', true, false], 0xB8: ['LN', true, false],
            0xB9: ['EXP', true, false], 0xBA: ['INT', true, false],
            0xBB: ['SQR', true, false], 0xBC: ['SGN', true, false],
            0xBD: ['ABS', true, false], 0xBE: ['PEEK', true, false],
            0xBF: ['IN', true, true], 0xC0: ['USR', true, true],
            0xC1: ['STR$', true, false], 0xC2: ['CHR$', true, false],
            0xC3: ['NOT', true, true], 0xC4: ['BIN', true, true],
            0xC5: ['OR', true, true], 0xC6: ['AND', true, true],
            0xC7: ['<=', false, false], 0xC8: ['>=', false, false],
            0xC9: ['<>', false, false], 0xCA: ['LINE', true, true],
            0xCB: ['THEN', true, true], 0xCC: ['TO', true, true],
            0xCD: ['STEP', true, true], 0xCE: ['DEF FN', true, true],
            0xCF: ['CAT', true, true], 0xD0: ['FORMAT', true, true],
            0xD1: ['MOVE', true, true], 0xD2: ['ERASE', true, true],
            0xD3: ['OPEN #', true, false], 0xD4: ['CLOSE #', true, false],
            0xD5: ['MERGE', true, true], 0xD6: ['VERIFY', true, true],
            0xD7: ['BEEP', true, true], 0xD8: ['CIRCLE', true, true],
            0xD9: ['INK', true, true], 0xDA: ['PAPER', true, true],
            0xDB: ['FLASH', true, true], 0xDC: ['BRIGHT', true, true],
            0xDD: ['INVERSE', true, true], 0xDE: ['OVER', true, true],
            0xDF: ['OUT', true, true], 0xE0: ['LPRINT', true, true],
            0xE1: ['LLIST', true, true], 0xE2: ['STOP', true, false],
            0xE3: ['READ', true, true], 0xE4: ['DATA', true, true],
            0xE5: ['RESTORE', true, true], 0xE6: ['NEW', true, false],
            0xE7: ['BORDER', true, true], 0xE8: ['CONTINUE', true, false],
            0xE9: ['DIM', true, true], 0xEA: ['REM', true, true],
            0xEB: ['FOR', true, true], 0xEC: ['GO TO', true, true],
            0xED: ['GO SUB', true, true], 0xEE: ['INPUT', true, true],
            0xEF: ['LOAD', true, true], 0xF0: ['LIST', true, true],
            0xF1: ['LET', true, true], 0xF2: ['PAUSE', true, true],
            0xF3: ['NEXT', true, true], 0xF4: ['POKE', true, true],
            0xF5: ['PRINT', true, true], 0xF6: ['PLOT', true, true],
            0xF7: ['RUN', true, true], 0xF8: ['SAVE', true, true],
            0xF9: ['RANDOMIZE', true, true], 0xFA: ['IF', true, true],
            0xFB: ['CLS', true, false], 0xFC: ['DRAW', true, true],
            0xFD: ['CLEAR', true, true], 0xFE: ['RETURN', true, false],
            0xFF: ['COPY', true, false]
        };

        const CONTROL_CODES = {
            0x10: 'INK', 0x11: 'PAPER', 0x12: 'FLASH',
            0x13: 'BRIGHT', 0x14: 'INVERSE', 0x15: 'OVER',
            0x16: 'AT', 0x17: 'TAB'
        };

        function parseFloat5(bytes) {
            if (bytes.length < 5) return null;
            const exp = bytes[0];
            if (exp === 0) {
                if (bytes[1] === 0x00 && bytes[4] === 0x00) {
                    return bytes[2] | (bytes[3] << 8);
                }
                if (bytes[1] === 0xFF && bytes[4] === 0x00) {
                    const val = bytes[2] | (bytes[3] << 8);
                    return val > 32767 ? val - 65536 : -val;
                }
                return 0;
            }
            const sign = (bytes[1] & 0x80) ? -1 : 1;
            const mantissa = (((bytes[1] | 0x80) << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4]) >>> 0;
            return sign * (mantissa / 0x100000000) * Math.pow(2, exp - 128);
        }

        function formatNumber(n) {
            if (n === null || n === undefined) return '?';
            if (Number.isInteger(n)) return n.toString();
            return parseFloat(n.toPrecision(10)).toString();
        }

        function decode(data) {
            const lines = [];
            let offset = 0;

            while (offset < data.length - 4) {
                const lineNum = (data[offset] << 8) | data[offset + 1];
                let lineLen = data[offset + 2] | (data[offset + 3] << 8);

                if (lineLen === 0) {
                    break;
                }

                const availableLen = data.length - offset - 4;
                if (lineLen > availableLen) {
                    lineLen = availableLen;
                }

                if (lineLen === 0) {
                    break;
                }

                const lineData = data.slice(offset + 4, offset + 4 + lineLen);
                const decoded = decodeLine(lineData);

                lines.push({
                    number: lineNum,
                    offset: offset,
                    text: decoded.text,
                    obfuscations: decoded.obfuscations
                });

                offset += 4 + lineLen;
            }
            return lines;
        }

        function decodeLine(data) {
            let text = '';
            let obfuscations = [];
            let i = 0;
            let inString = false;
            let inREM = false;
            let lastWasSpace = false;
            let asciiBeforeFP = '';
            let asciiStartPos = -1;

            function addText(str, spaceBefore = false, spaceAfter = false) {
                if (spaceBefore && text.length > 0 && !lastWasSpace && !text.endsWith(' ') && !text.endsWith(':')) {
                    text += ' ';
                }
                text += str;
                lastWasSpace = str.endsWith(' ') || spaceAfter;
                if (spaceAfter && !str.endsWith(' ')) {
                    text += ' ';
                    lastWasSpace = true;
                }
            }

            while (i < data.length) {
                const byte = data[i];

                if (byte === 0x0D) break;

                if (inREM) {
                    if (byte >= 0x20 && byte < 0x80) {
                        text += String.fromCharCode(byte);
                    } else if (byte === 0x0E) {
                        i += 5;
                    } else if (TOKENS[byte]) {
                        const [keyword, spaceBefore, spaceAfter] = TOKENS[byte];
                        if (spaceBefore && text.length > 0 && !text.endsWith(' ')) text += ' ';
                        text += keyword;
                        if (spaceAfter) text += ' ';
                    } else {
                        text += `[${hex8(byte)}]`;
                    }
                    i++;
                    continue;
                }

                if (byte === 0x0E && !inString) {
                    const fpBytes = [];
                    for (let j = 0; j < 5 && i + 1 + j < data.length; j++) {
                        fpBytes.push(data[i + 1 + j]);
                    }
                    const fpValue = parseFloat5(fpBytes);
                    const fpFormatted = formatNumber(fpValue);
                    let isObfuscated = false;
                    let asciiDisplay = asciiBeforeFP.trim();

                    if (asciiDisplay !== '') {
                        let asciiNum = parseFloat(asciiDisplay);
                        if (asciiDisplay.startsWith('.')) asciiNum = parseFloat('0' + asciiDisplay);
                        if (isNaN(asciiNum)) {
                            isObfuscated = true;
                        } else {
                            const valuesMatch = Math.abs(Math.abs(asciiNum) - Math.abs(fpValue)) < 0.0001 ||
                                               Math.abs(asciiNum - fpValue) < 0.0001;
                            if (!valuesMatch) isObfuscated = true;
                        }
                    } else {
                        isObfuscated = true;
                        asciiDisplay = '(hidden)';
                    }

                    if (isObfuscated) {
                        obfuscations.push({ ascii: asciiDisplay, actual: fpValue });
                        if (asciiStartPos >= 0 && asciiStartPos < text.length) {
                            text = text.substring(0, asciiStartPos);
                        }
                        text += `{{${fpFormatted}}}`;
                    }
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                    i += 6;
                    continue;
                }

                const isNumberChar = (byte >= 0x30 && byte <= 0x39) || byte === 0x2E ||
                                     byte === 0x2B || byte === 0x2D || byte === 0x45 || byte === 0x65;
                if (!inString && isNumberChar) {
                    if (asciiStartPos < 0) asciiStartPos = text.length;
                    asciiBeforeFP += String.fromCharCode(byte);
                } else if (!inString && byte !== 0x0E) {
                    if (byte !== 0x20 || asciiBeforeFP === '') {
                        asciiBeforeFP = '';
                        asciiStartPos = -1;
                    } else if (byte === 0x20 && asciiBeforeFP !== '') {
                        asciiBeforeFP += ' ';
                    }
                }

                if (byte === 0x22) {
                    inString = !inString;
                    text += '"';
                    lastWasSpace = false;
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                    i++;
                    continue;
                }

                if (inString) {
                    if (byte >= 0x20 && byte < 0x7F) {
                        text += String.fromCharCode(byte);
                    } else {
                        text += `[${hex8(byte)}]`;
                    }
                    i++;
                    continue;
                }

                if (CONTROL_CODES[byte]) {
                    addText('{' + CONTROL_CODES[byte] + ' ', true, false);
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                    if (byte >= 0x16) {
                        i++;
                        if (i < data.length) text += data[i];
                        i++;
                        if (i < data.length) text += ',' + data[i];
                    } else {
                        i++;
                        if (i < data.length) text += data[i];
                    }
                    text += '}';
                    i++;
                    continue;
                }

                if (TOKENS[byte]) {
                    const [keyword, spaceBefore, spaceAfter] = TOKENS[byte];
                    addText(keyword, spaceBefore, spaceAfter);
                    if (byte === 0xEA) inREM = true;
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                    i++;
                    continue;
                }

                if (byte === 0x3A) {
                    text += ':';
                    lastWasSpace = false;
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                    i++;
                    continue;
                }

                if (byte >= 0x20 && byte < 0x80) {
                    text += String.fromCharCode(byte);
                    lastWasSpace = (byte === 0x20);
                } else if (byte >= 0x90 && byte <= 0xA2) {
                    text += `[UDG-${String.fromCharCode(65 + byte - 0x90)}]`;
                    lastWasSpace = false;
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                } else if (byte >= 0x80 && byte <= 0x8F) {
                    text += `[BLK]`;
                    lastWasSpace = false;
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                } else if (byte < 0x20 && byte !== 0x0E) {
                    if (byte === 0x06) text += ',';
                    asciiBeforeFP = '';
                    asciiStartPos = -1;
                }
                i++;
            }
            return { text: text.trim(), obfuscations };
        }

        return { decode, parseFloat5, TOKENS };
    })();

    // BASIC view button handler
    const btnExplorerBasic = document.getElementById('btnExplorerBasic');
    if (btnExplorerBasic) {
        btnExplorerBasic.addEventListener('click', () => {
            explorerRenderBASIC();
        });
    }

    // Alias for TRD click handler compatibility
    function explorerDecodeBASIC() {
        explorerRenderBASIC();
    }

    function explorerRenderBASIC() {
        const source = explorerBasicSource.value;
        if (!source) {
            explorerBasicOutput.innerHTML = '<div class="explorer-empty">Select a BASIC program source</div>';
            return;
        }

        let data = null;

        if (explorerParsed.type === 'tap') {
            const blockIdx = parseInt(source);
            const headerBlock = explorerBlocks[blockIdx];
            if (headerBlock && headerBlock.blockType === 'header' && headerBlock.headerType === 0 && blockIdx + 1 < explorerBlocks.length) {
                const dataBlock = explorerBlocks[blockIdx + 1];
                data = dataBlock.data.slice(1, -1);
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            const fileIdx = parseInt(source);
            const file = explorerParsed.files[fileIdx];
            if (file) {
                data = explorerData.slice(file.offset, file.offset + file.length);
            }
        } else if (explorerParsed.type === 'dsk') {
            const fileIdx = parseInt(source);
            const file = explorerParsed.files[fileIdx];
            if (file && explorerParsed.dskImage) {
                const rawData = DSKLoader.readFileData(
                    explorerParsed.dskImage, file.name, file.ext, file.user, file.rawSize || file.size
                );
                if (rawData) {
                    if (file.hasPlus3Header && rawData.length > 128) {
                        data = rawData.slice(128);
                    } else {
                        data = rawData;
                    }
                }
            }
        }

        if (!data || data.length === 0) {
            explorerBasicOutput.innerHTML = '<div class="explorer-empty">No BASIC data found</div>';
            return;
        }

        try {
            const lines = ExplorerBasicDecoder.decode(data);

            if (lines.length === 0) {
                const hexBytes = Array.from(data.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
                explorerBasicOutput.innerHTML = `<div class="explorer-empty">No BASIC lines found<br><span style="font-size:10px;color:var(--text-secondary)">First 16 bytes: ${hexBytes}</span></div>`;
                return;
            }

            let html = '';
            for (const line of lines) {
                let highlighted = highlightBasicLine(line.text);

                html += `<div class="explorer-basic-line">`;
                html += `<span class="explorer-basic-linenum">${line.number}</span>`;
                html += `<span>${highlighted}</span>`;
                html += `</div>`;

                if (line.obfuscations && line.obfuscations.length > 0) {
                    for (const obf of line.obfuscations) {
                        html += `<div style="color:#e67e22;font-size:10px;margin-left:60px;">`;
                        const actualNum = typeof obf.actual === 'number' ? obf.actual : parseFloat(obf.actual);
                        if (Number.isInteger(actualNum) && actualNum >= 16384 && actualNum <= 65535) {
                            html += `\u26A0 Obfuscated: "${obf.ascii}" \u2192 <span class="explorer-basic-addr" data-addr="${actualNum}" style="cursor:pointer;text-decoration:underline;color:var(--cyan)" title="Click to disassemble">${obf.actual}</span>`;
                        } else {
                            html += `\u26A0 Obfuscated: "${obf.ascii}" \u2192 ${obf.actual}`;
                        }
                        html += `</div>`;
                    }
                }
            }

            explorerBasicOutput.innerHTML = html;

        } catch (err) {
            explorerBasicOutput.innerHTML = `<div class="explorer-empty">Error decoding BASIC: ${err.message}</div>`;
        }
    }

    function highlightBasicLine(text) {
        let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        html = html.replace(/"([^"]*)"/g, '<span class="explorer-basic-string">"$1"</span>');

        const keywords = Object.values(ExplorerBasicDecoder.TOKENS).map(t => t[0]).sort((a, b) => b.length - a.length);
        for (const kw of keywords) {
            const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('\\b(' + escaped + ')\\b', 'g');
            html = html.replace(regex, '<span class="explorer-basic-keyword">$1</span>');
        }

        html = html.replace(/(USR|PEEK|POKE|RANDOMIZE\s+USR)(\s*<[^>]+>)?\s*(\d{4,5})/gi, (match, keyword, span, addr) => {
            const addrNum = parseInt(addr);
            if (addrNum >= 16384 && addrNum <= 65535) {
                return `${keyword}${span || ''} <span class="explorer-basic-addr" data-addr="${addrNum}" style="cursor:pointer;text-decoration:underline;color:var(--cyan)" title="Click to disassemble">${addr}</span>`;
            }
            return match;
        });

        html = html.replace(/(USR|PEEK|POKE)(<\/span>)?\s*(<span[^>]*>)?VAL(<\/span>)?\s*"([\d.]+(?:[Ee][+\-]?\d+)?)"/gi, (match, keyword, kwClose, valOpen, valClose, numStr) => {
            const addrNum = Math.round(parseFloat(numStr));
            if (addrNum >= 16384 && addrNum <= 65535) {
                return `${keyword}${kwClose || ''} ${valOpen || ''}VAL${valClose || ''} "<span class="explorer-basic-addr" data-addr="${addrNum}" style="cursor:pointer;text-decoration:underline;color:var(--cyan)" title="Click to disassemble at ${addrNum}">${numStr}</span>"`;
            }
            return match;
        });

        html = html.replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*>)/g, '<span class="explorer-basic-number">$1</span>');

        html = html.replace(/\{\{([^}]+)\}\}/g, '<span style="color:#e67e22;font-weight:bold">{{$1}}</span>');

        return html;
    }

    // Handle clicking on addresses in BASIC listing
    explorerBasicOutput.addEventListener('click', (e) => {
        const addrSpan = e.target.closest('.explorer-basic-addr');
        if (!addrSpan) return;

        let addr = parseInt(addrSpan.dataset.addr);
        if (isNaN(addr)) return;

        document.querySelector('.explorer-subtab[data-subtab="disasm"]').click();

        let foundSource = '';

        if (explorerParsed.type === 'tap') {
            for (let i = 0; i < explorerBlocks.length; i++) {
                const block = explorerBlocks[i];
                if (block.blockType === 'header' && block.headerType === 3) {
                    const startAddr = block.startAddress;
                    const dataBlock = explorerBlocks[i + 1];
                    if (dataBlock && dataBlock.blockType === 'data') {
                        const endAddr = startAddr + dataBlock.length - 2;
                        if (addr >= startAddr && addr < endAddr) {
                            foundSource = i.toString();
                            break;
                        }
                    }
                }
            }

            if (!foundSource) {
                for (let i = 0; i < explorerBlocks.length; i++) {
                    const block = explorerBlocks[i];
                    if (block.blockType === 'data' && i > 0) {
                        const prevBlock = explorerBlocks[i - 1];
                        if (prevBlock.blockType === 'header' && prevBlock.startAddress !== undefined) {
                            const startAddr = prevBlock.startAddress;
                            const endAddr = startAddr + block.length - 2;
                            if (addr >= startAddr && addr < endAddr) {
                                foundSource = 'data:' + i.toString();
                                break;
                            }
                        }
                    }
                }
            }

            if (!foundSource) {
                for (let i = 0; i < explorerBlocks.length; i++) {
                    if (explorerBlocks[i].blockType === 'data') {
                        foundSource = 'data:' + i.toString();
                        break;
                    }
                }
            }
        } else if (explorerParsed.type === 'trd' || explorerParsed.type === 'scl') {
            for (let i = 0; i < explorerParsed.files.length; i++) {
                const file = explorerParsed.files[i];
                if (file.ext === 'C' || file.ext === 'D') {
                    const endAddr = file.startAddress + file.length;
                    if (addr >= file.startAddress && addr < endAddr) {
                        foundSource = i.toString();
                        break;
                    }
                }
            }

            if (!foundSource) {
                for (let i = 0; i < explorerParsed.files.length; i++) {
                    const file = explorerParsed.files[i];
                    if (file.ext === 'B') {
                        const basicBase = 0x5D3B;
                        const fullSize = file.sectors * 256;
                        const endAddr = basicBase + fullSize;
                        if (addr >= basicBase && addr < endAddr) {
                            foundSource = 'basic:' + i.toString();
                            break;
                        }
                    }
                }
            }

            if (!foundSource) {
                for (let i = 0; i < explorerParsed.files.length; i++) {
                    const file = explorerParsed.files[i];
                    if (file.ext === 'C') {
                        const endAddr = file.startAddress + file.length;
                        if (addr >= file.startAddress && addr < endAddr) {
                            foundSource = i.toString();
                            break;
                        }
                    }
                }
            }

            if (!foundSource) {
                for (let i = 0; i < explorerParsed.files.length; i++) {
                    const file = explorerParsed.files[i];
                    if (file.ext === 'C') {
                        foundSource = i.toString();
                        if (addr < file.startAddress || addr >= file.startAddress + file.length) {
                            addr = file.startAddress;
                        }
                        break;
                    }
                }
            }
        } else if (explorerParsed.type === 'sna' || explorerParsed.type === 'z80') {
            foundSource = 'memory';
        }

        if (foundSource) {
            explorerDisasmSource.value = foundSource;
        }

        explorerDisasmAddr.value = hex16(addr);
        explorerDisasmLen.value = 256;

        explorerRenderDisasm();
    });

} // end of initExplorer