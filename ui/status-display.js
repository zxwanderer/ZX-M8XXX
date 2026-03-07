// status-display.js — showMessage, updateStatus, updateRZXStatus (extracted from index.html)

export function initStatusDisplay({ getSpectrum, getIsDebuggerVisible }) {
    const fpsEl = document.getElementById('fps');
    const machineSelect = document.getElementById('machineSelect');
    const btnRun = document.getElementById('btnRun');
    const debuggerPanel = document.getElementById('debuggerPanel');
    const rzxInfo = document.getElementById('rzxInfo');
    const rzxStatus = document.getElementById('rzxStatus');
    const btnRzxStop = document.getElementById('btnRzxStop');

    let updateDebuggerFn = null;

    function setUpdateDebugger(fn) {
        updateDebuggerFn = fn;
    }

    function showMessage(text, type = 'success') {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 3000);
    }

    function updateStatus() {
        const spectrum = getSpectrum();
        fpsEl.textContent = spectrum.getFps();
        machineSelect.value = spectrum.machineType;
        btnRun.textContent = spectrum.isRunning() ? 'Pause' : 'Run';
        btnRun.disabled = !spectrum.romLoaded;

        // Update debugger if open (or in landscape mode where it's always visible)
        if (debuggerPanel.classList.contains('open') || window.innerWidth >= 1400) {
            if (updateDebuggerFn) updateDebuggerFn();
        }

        // Update RZX status
        updateRZXStatus();
    }

    function updateRZXStatus() {
        const spectrum = getSpectrum();
        if (spectrum.isRZXPlaying()) {
            rzxInfo.style.visibility = 'visible';
            const frame = spectrum.getRZXFrame();
            const total = spectrum.getRZXTotalFrames();
            const percent = Math.round((frame / total) * 100);
            rzxStatus.textContent = `${frame}/${total} (${percent}%)`;
        } else {
            rzxInfo.style.visibility = 'hidden';
        }
    }

    // RZX stop button handler
    btnRzxStop.addEventListener('click', () => {
        const spectrum = getSpectrum();
        spectrum.rzxStop();
        updateRZXStatus();
        showMessage('RZX playback stopped');
    });

    return { showMessage, updateStatus, updateRZXStatus, setUpdateDebugger };
}
