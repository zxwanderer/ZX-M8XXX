// Shared utility functions — pure, zero dependencies

export function hex8(val) {
    return (val & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export function hex16(val) {
    return (val & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

export function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// Safe localStorage wrappers — handle quota errors, private browsing, missing storage
export function storageGet(key, fallback = null) {
    try {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
    } catch (e) {
        return fallback;
    }
}

export function storageSet(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        return false;
    }
}

export function storageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        // Ignore
    }
}

export function arrayToBase64(data) {
    const arr = data instanceof Uint8Array ? data : new Uint8Array(data);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < arr.length; i += chunkSize) {
        const end = Math.min(i + chunkSize, arr.length);
        const chunk = Array.from(arr.subarray(i, end));
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}
