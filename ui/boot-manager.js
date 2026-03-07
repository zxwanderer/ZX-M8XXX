// boot-manager.js — Boot file injection for TRD/Hobeta disks (extracted from index.html)
import { storageGet, storageSet } from '../core/utils.js';

export function initBootManager({ showMessage }) {
    let bootTrdData = null;
    let bootTrdName = null;
    let bootFileType = null;

    // ========== TRD Directory Helpers ==========

    // Read 8-byte space-padded filename from TRD directory entry
    function readTrdFilename(bytes, offset) {
        let name = '';
        for (let j = 0; j < 8; j++) {
            name += String.fromCharCode(bytes[offset + j]);
        }
        return name.trimEnd().toLowerCase();
    }

    // Ensure data is Uint8Array
    function ensureBytes(data) {
        return data instanceof Uint8Array ? data : new Uint8Array(data);
    }

    // Find boot file directory entry in TRD data.
    // Returns { slot, offset, bytes } or null if not found.
    function findBootEntry(data) {
        const bytes = ensureBytes(data);
        for (let i = 0; i < 128; i++) {
            const offset = i * 16;
            const firstByte = bytes[offset];
            if (firstByte === 0x00) break;
            if (firstByte === 0x01) continue;
            if (readTrdFilename(bytes, offset) === 'boot') {
                return { slot: i, offset, bytes };
            }
        }
        return null;
    }

    // Find first free directory slot (0x00 = end, 0x01 = deleted).
    // Returns { slot, offset, wasEndMarker } or null if full.
    function findFreeSlot(bytes) {
        for (let i = 0; i < 128; i++) {
            const offset = i * 16;
            const firstByte = bytes[offset];
            if (firstByte === 0x00) return { slot: i, offset, wasEndMarker: true };
            if (firstByte === 0x01) return { slot: i, offset, wasEndMarker: false };
        }
        return null;
    }

    // Boot TRD file selection
    const btnSelectBootTrd = document.getElementById('btnSelectBootTrd');
    const bootTrdFileInput = document.getElementById('bootTrdFile');
    btnSelectBootTrd.addEventListener('click', () => {
        bootTrdFileInput.click();
    });

    bootTrdFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = new Uint8Array(await file.arrayBuffer());

            // Detect file type: TRD by size, Hobeta by extension/CRC
            let detectedType = null;
            let hasBootFile = false;

            // Check if it's a TRD file (by size)
            if (data.length === 655360 || data.length === 655360 - 256) {
                detectedType = 'trd';
                hasBootFile = trdHasBootFile(data);
            }
            // Check if it's a Hobeta file
            else if (isHobetaFile(data, file.name)) {
                detectedType = 'hobeta';
                hasBootFile = hobetaHasBootFile(data);
            }

            if (!detectedType) {
                showMessage('Invalid file: not a TRD or Hobeta file', 'error');
                return;
            }

            if (!hasBootFile) {
                showMessage(`Selected ${detectedType.toUpperCase()} has no boot file`, 'error');
                return;
            }

            bootTrdData = data;
            bootTrdName = file.name;
            bootFileType = detectedType;

            // Display with type label
            const typeLabel = detectedType === 'hobeta' ? '(Hobeta)' : '(TRD)';
            bootTrdNameEl.textContent = `${file.name} ${typeLabel}`;

            // Save to localStorage
            storageSet('zxm8_bootName', file.name);
            storageSet('zxm8_bootData', arrayBufferToBase64(data));
            storageSet('zxm8_bootType', detectedType);

            showMessage(`Boot file set: ${file.name} ${typeLabel}`);
        } catch (err) {
            showMessage('Failed to load boot file: ' + err.message, 'error');
        }
        // Clear input so same file can be selected again
        e.target.value = '';
    });

    // Boot TRD mode change
    const bootTrdMode = document.getElementById('bootTrdMode');
    const bootTrdNameEl = document.getElementById('bootTrdName');
    bootTrdMode.addEventListener('change', (e) => {
        storageSet('zxm8_bootMode', e.target.value);
        updateBootUIVisibility(e.target.value);
    });

    function updateBootUIVisibility(mode) {
        const isRunMode = mode === 'run_first' || mode === 'run_last';
        btnSelectBootTrd.style.display = isRunMode ? 'none' : '';
        bootTrdNameEl.style.display = isRunMode ? 'none' : '';
    }

    // Helper: Check if TRD has a boot file (filename "boot" in directory)
    function trdHasBootFile(data) {
        return findBootEntry(data) !== null;
    }

    // Helper: Extract boot file from TRD
    function extractBootFile(data) {
        const entry = findBootEntry(data);
        if (!entry) return null;

        const { offset, bytes } = entry;
        const fileType = bytes[offset + 8];
        const startAddr = bytes[offset + 9] | (bytes[offset + 10] << 8);
        const length = bytes[offset + 11] | (bytes[offset + 12] << 8);
        const sectorCount = bytes[offset + 13];
        const firstSector = bytes[offset + 14];
        const firstTrack = bytes[offset + 15];

        // Copy directory entry
        const dirEntry = bytes.slice(offset, offset + 16);

        // Calculate data offset and extract file data
        const trackOffset = firstTrack * 16 * 256; // 16 sectors per track, 256 bytes per sector
        const sectorOffset = firstSector * 256;
        const dataOffset = trackOffset + sectorOffset;
        const dataEnd = dataOffset + sectorCount * 256;
        if (dataEnd > bytes.length) return null; // Corrupt: data extends beyond disk
        const fileData = bytes.slice(dataOffset, dataEnd);

        return { dirEntry, fileData, sectorCount, length, startAddr, fileType };
    }

    // Helper: Detect if file is Hobeta format
    function isHobetaFile(data, filename) {
        // Check by extension first
        const lowerName = filename.toLowerCase();
        const hobetaExtensions = ['.$c', '.$b', '.$d', '.$#', '.hobeta'];
        const hasHobetaExt = hobetaExtensions.some(ext => lowerName.endsWith(ext));

        if (!hasHobetaExt) return false;

        // Validate Hobeta header (17 bytes minimum + at least 1 byte of data)
        if (data.length <= 17) return false;

        // If extension matches and file has header + data, accept it
        // Calculate actual sector count from file size (more reliable than header byte)
        const dataSize = data.length - 17;
        const actualSectors = Math.ceil(dataSize / 256);
        if (actualSectors === 0 || actualSectors > 255) return false;

        return true;
    }

    // Helper: Check if Hobeta file has "boot" filename
    function hobetaHasBootFile(data) {
        if (data.length < 17) return false;
        return readTrdFilename(data, 0) === 'boot';
    }

    // Helper: Extract boot file from Hobeta
    function extractBootFromHobeta(data) {
        if (data.length <= 17) return null;

        // Parse Hobeta header (17 bytes)
        // Bytes 0-7: Filename
        // Byte 8: Type (B/C/D/#)
        // Bytes 9-10: Start address
        // Bytes 11-12: Length
        // Byte 13: Sector count (may be 0 in some files, so calculate from size)
        // Bytes 14-16: CRC
        // Bytes 17+: File data

        const fileType = data[8];
        const startAddr = data[9] | (data[10] << 8);
        const length = data[11] | (data[12] << 8);
        // Calculate sector count from actual data size (more reliable)
        const dataSize = data.length - 17;
        const sectorCount = Math.ceil(dataSize / 256);

        // Create directory entry (16 bytes) in TRD format
        const dirEntry = new Uint8Array(16);
        // Copy filename (8 bytes)
        for (let i = 0; i < 8; i++) {
            dirEntry[i] = data[i];
        }
        dirEntry[8] = fileType;
        dirEntry[9] = startAddr & 0xFF;
        dirEntry[10] = (startAddr >> 8) & 0xFF;
        dirEntry[11] = length & 0xFF;
        dirEntry[12] = (length >> 8) & 0xFF;
        dirEntry[13] = sectorCount;
        // Bytes 14-15 (first sector/track) will be set by injection
        dirEntry[14] = 0;
        dirEntry[15] = 0;

        // Extract file data (after 17-byte header, pad to full sectors)
        const fileData = new Uint8Array(sectorCount * 256);
        fileData.set(data.slice(17));

        return { dirEntry, fileData, sectorCount, length, startAddr, fileType };
    }

    // Helper: Inject boot file into TRD data
    function injectBootIntoTrd(trdData, bootInfo, reuseLocation) {
        const result = new Uint8Array(trdData);

        // Find first free directory slot
        const freeSlot = findFreeSlot(result);
        if (!freeSlot) {
            alert('Cannot add boot: disk directory is full (128 files max)');
            return result;
        }
        const { slot: dirSlot, wasEndMarker } = freeSlot;

        // Get disk info from sector 8 (offset 0x800)
        const sector8Offset = 8 * 256;
        let firstFreeSector = result[sector8Offset + 0xE1];
        let firstFreeTrack = result[sector8Offset + 0xE2];
        const fileCount = result[sector8Offset + 0xE4];
        let freeSectors = result[sector8Offset + 0xE5] | (result[sector8Offset + 0xE6] << 8);

        // Check if there's enough space
        if (freeSectors < bootInfo.sectorCount) {
            alert('Cannot add boot: not enough free space on disk');
            return result;
        }

        // Write directory entry at the slot
        const dirOffset = dirSlot * 16;
        // Copy filename "boot    " (8 chars padded)
        const bootName = 'boot    ';
        for (let i = 0; i < 8; i++) {
            result[dirOffset + i] = bootName.charCodeAt(i);
        }
        result[dirOffset + 8] = bootInfo.fileType;
        result[dirOffset + 9] = bootInfo.startAddr & 0xFF;
        result[dirOffset + 10] = (bootInfo.startAddr >> 8) & 0xFF;
        result[dirOffset + 11] = bootInfo.length & 0xFF;
        result[dirOffset + 12] = (bootInfo.length >> 8) & 0xFF;
        result[dirOffset + 13] = bootInfo.sectorCount;
        result[dirOffset + 14] = firstFreeSector;
        result[dirOffset + 15] = firstFreeTrack;

        // Write file data at the free location
        const trackOffset = firstFreeTrack * 16 * 256;
        const sectorOffset = firstFreeSector * 256;
        const dataOffset = trackOffset + sectorOffset;
        const dataSize = bootInfo.sectorCount * 256;
        if (dataOffset + dataSize > result.length) {
            alert('Cannot add boot: calculated position exceeds disk size');
            return result;
        }
        result.set(bootInfo.fileData.slice(0, dataSize), dataOffset);

        // Update disk info
        // Calculate new free position
        let newSector = firstFreeSector + bootInfo.sectorCount;
        let newTrack = firstFreeTrack;
        while (newSector >= 16) {
            newSector -= 16;
            newTrack++;
        }
        result[sector8Offset + 0xE1] = newSector;
        result[sector8Offset + 0xE2] = newTrack;
        result[sector8Offset + 0xE4] = fileCount + 1;
        freeSectors -= bootInfo.sectorCount;
        result[sector8Offset + 0xE5] = freeSectors & 0xFF;
        result[sector8Offset + 0xE6] = (freeSectors >> 8) & 0xFF;

        // Mark end of directory if we inserted at the end marker
        if (wasEndMarker && dirSlot + 1 < 128) {
            // We inserted at the previous end-of-directory position
            // ALWAYS mark the next slot as end-of-directory
            const nextOffset = (dirSlot + 1) * 16;
            result[nextOffset] = 0x00;
        }

        return result;
    }

    // Helper: Convert ArrayBuffer to base64 for localStorage
    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    // Helper: Convert base64 to Uint8Array
    function base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Load boot TRD settings from localStorage
    function loadBootTrdSettings() {
        const mode = storageGet('zxm8_bootMode', 'none');
        bootTrdMode.value = mode;

        const name = storageGet('zxm8_bootName');
        const dataBase64 = storageGet('zxm8_bootData');
        const storedType = storageGet('zxm8_bootType');
        if (name && dataBase64) {
            try {
                bootTrdData = base64ToArrayBuffer(dataBase64);
                bootTrdName = name;
                // Default to 'trd' for backwards compatibility
                bootFileType = storedType || 'trd';
                // Display with type label
                const typeLabel = bootFileType === 'hobeta' ? '(Hobeta)' : '(TRD)';
                bootTrdNameEl.textContent = `${name} ${typeLabel}`;
            } catch (e) {
                console.warn('Failed to load boot file from localStorage:', e);
            }
        }
    }

    // Process TRD with boot injection if configured
    function processTrdWithBoot(data, filename) {
        const mode = bootTrdMode.value;
        if (mode === 'none' || mode === 'run_first' || mode === 'run_last' || !bootTrdData) {
            return data;
        }

        // Extract boot from boot source (TRD or Hobeta)
        let bootInfo;
        if (bootFileType === 'hobeta') {
            bootInfo = extractBootFromHobeta(bootTrdData);
        } else {
            bootInfo = extractBootFile(bootTrdData);
        }
        if (!bootInfo) {
            alert('Cannot add boot: no boot file found in selected boot source');
            return data;
        }

        const existingBoot = getBootFileInfo(data);

        if (mode === 'add') {
            if (existingBoot) {
                // Already has boot, don't add
                return data;
            }
            // No boot exists, add new one
            return injectBootIntoTrd(data, bootInfo, null);
        }

        if (mode === 'replace') {
            if (existingBoot) {
                // Replace existing boot - reuse its location if new boot fits
                if (bootInfo.sectorCount <= existingBoot.sectorCount) {
                    // New boot fits in old boot's space - reuse location
                    return replaceBootInPlace(data, bootInfo, existingBoot);
                } else {
                    // New boot is larger - remove old and add at first free
                    data = removeBootFromTrd(data);
                    return injectBootIntoTrd(data, bootInfo, null);
                }
            } else {
                // No boot exists, just add
                return injectBootIntoTrd(data, bootInfo, null);
            }
        }

        return data;
    }

    // Helper: Get info about existing boot file on disk
    function getBootFileInfo(data) {
        const entry = findBootEntry(data);
        if (!entry) return null;
        const { slot, offset, bytes } = entry;
        return {
            dirSlot: slot,
            sectorCount: bytes[offset + 13],
            firstSector: bytes[offset + 14],
            firstTrack: bytes[offset + 15]
        };
    }

    // Helper: Replace boot file in place (reuse old boot's disk location)
    function replaceBootInPlace(trdData, bootInfo, existingBoot) {
        const result = new Uint8Array(trdData);
        const dirOffset = existingBoot.dirSlot * 16;

        // Update directory entry with new boot info (keep same disk location)
        const bootName = 'boot    ';
        for (let i = 0; i < 8; i++) {
            result[dirOffset + i] = bootName.charCodeAt(i);
        }
        result[dirOffset + 8] = bootInfo.fileType;
        result[dirOffset + 9] = bootInfo.startAddr & 0xFF;
        result[dirOffset + 10] = (bootInfo.startAddr >> 8) & 0xFF;
        result[dirOffset + 11] = bootInfo.length & 0xFF;
        result[dirOffset + 12] = (bootInfo.length >> 8) & 0xFF;
        result[dirOffset + 13] = bootInfo.sectorCount;
        // Keep same location as old boot
        result[dirOffset + 14] = existingBoot.firstSector;
        result[dirOffset + 15] = existingBoot.firstTrack;

        // Write new boot data at old boot's location
        const trackOffset = existingBoot.firstTrack * 16 * 256;
        const sectorOffset = existingBoot.firstSector * 256;
        const dataOffset = trackOffset + sectorOffset;
        result.set(bootInfo.fileData.slice(0, bootInfo.sectorCount * 256), dataOffset);

        // If new boot is smaller, we waste some sectors (acceptable)
        // File count stays the same (replacing, not adding)

        return result;
    }

    // Helper: Remove boot file from TRD
    function removeBootFromTrd(data) {
        const result = new Uint8Array(data);
        const entry = findBootEntry(result);
        if (entry) {
            // Mark as deleted
            result[entry.offset] = 0x01;
            // Update file count
            const sector8Offset = 8 * 256;
            const fileCount = result[sector8Offset + 0xE4];
            if (fileCount > 0) {
                result[sector8Offset + 0xE4] = fileCount - 1;
            }
        }
        return result;
    }

    loadBootTrdSettings();
    updateBootUIVisibility(bootTrdMode.value);

    return { processTrdWithBoot, getBootMode: () => bootTrdMode.value };
}
