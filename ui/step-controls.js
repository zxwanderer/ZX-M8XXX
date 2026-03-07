// Step controls — left and right panel step/run button handlers

import { hex16 } from '../core/utils.js';

export function initStepControls({
    getSpectrum, traceManager, commentManager,
    getTraceViewAddress, setTraceViewAddress,
    showMessage, showRomModal, openDebuggerPanel,
    updateDebugger, updateStatus
}) {
    // DOM elements
    const chkAutoComment = document.getElementById('chkAutoComment');

    // Left panel buttons
    const btnRun = document.getElementById('btnRun');
    const btnStepInto = document.getElementById('btnStepInto');
    const btnStepOver = document.getElementById('btnStepOver');
    const btnRunTo = document.getElementById('btnRunTo');
    const btnRunToInt = document.getElementById('btnRunToInt');
    const btnRunToRet = document.getElementById('btnRunToRet');
    const btnRunTstates = document.getElementById('btnRunTstates');
    const tstatesInput = document.getElementById('tstatesInput');

    // Right panel buttons
    const btnRightStepInto = document.getElementById('btnRightStepInto');
    const btnRightStepOver = document.getElementById('btnRightStepOver');
    const btnRightRunTo = document.getElementById('btnRightRunTo');
    const btnRightRunToInt = document.getElementById('btnRightRunToInt');
    const btnRightRunToRet = document.getElementById('btnRightRunToRet');
    const btnRightRunTstates = document.getElementById('btnRightRunTstates');
    const rightTstatesInput = document.getElementById('rightTstatesInput');

    // State
    let runToTarget = null;
    let rightRunToTarget = null;

    // Helper: prepare for step/run (stop if running, go to live trace)
    function prepareStep(spectrum) {
        if (spectrum.isRunning()) {
            spectrum.stop();
        }
        traceManager.goToLive();
        setTraceViewAddress(null);
    }

    // ---- Left panel handlers ----

    btnRun.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) {
            showRomModal();
            return;
        }
        spectrum.toggle();
        updateStatus();
    });

    btnStepInto.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) {
            showMessage('ROM not loaded', 'error');
            return;
        }
        if (spectrum.isRunning()) {
            spectrum.stop();
        }
        // Auto-comment feature: add separator comment before stepping
        if (chkAutoComment.checked) {
            commentManager.set(spectrum.cpu.pc, { before: '--------------------' });
        }
        traceManager.goToLive();
        setTraceViewAddress(null);
        spectrum.stepInto();
        openDebuggerPanel();
        updateDebugger();
        updateStatus();
    });

    btnStepOver.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) {
            showMessage('ROM not loaded', 'error');
            return;
        }
        prepareStep(spectrum);
        spectrum.stepOver();
        openDebuggerPanel();
        updateDebugger();
        updateStatus();
    });

    btnRunTo.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        if (runToTarget === null) {
            showMessage('Click a line in disassembly to set target', 'error');
            return;
        }
        prepareStep(spectrum);
        const reached = spectrum.runToAddress(runToTarget);
        if (reached) {
            showMessage(`Reached ${hex16(runToTarget)}`);
        } else {
            showMessage('Target not reached (max cycles)', 'error');
        }
        updateDebugger();
        updateStatus();
    });

    btnRunToInt.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        prepareStep(spectrum);
        const reached = spectrum.runToInterrupt();
        if (reached) {
            showMessage('Interrupt reached');
        } else {
            showMessage('Interrupt not reached (max cycles)', 'error');
        }
        updateDebugger();
        updateStatus();
    });

    btnRunToRet.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        prepareStep(spectrum);
        const reached = spectrum.runToRet();
        if (reached) {
            showMessage(`RET at ${hex16(spectrum.cpu.pc)}`);
        } else {
            showMessage('RET not reached (max cycles)', 'error');
        }
        updateDebugger();
        updateStatus();
    });

    btnRunTstates.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        const tstates = parseInt(tstatesInput.value, 10);
        if (isNaN(tstates) || tstates <= 0) {
            showMessage('Invalid T-states value', 'error');
            return;
        }
        prepareStep(spectrum);
        const executed = spectrum.runTstates(tstates);
        // Auto-comment feature: add separator comment at stop address
        if (chkAutoComment.checked) {
            commentManager.set(spectrum.cpu.pc, { before: '--------------------' });
        }
        showMessage(`Executed ${executed} T-states`);
        updateDebugger();
        updateStatus();
    });

    // ---- Right panel handlers (mirror left panel) ----

    btnRightStepInto.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) {
            showMessage('ROM not loaded', 'error');
            return;
        }
        if (spectrum.isRunning()) {
            spectrum.stop();
        }
        if (chkAutoComment.checked) {
            commentManager.set(spectrum.cpu.pc, { before: '--------------------' });
        }
        traceManager.goToLive();
        setTraceViewAddress(null);
        spectrum.stepInto();
        openDebuggerPanel();
        updateDebugger();
        updateStatus();
    });

    btnRightStepOver.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) {
            showMessage('ROM not loaded', 'error');
            return;
        }
        prepareStep(spectrum);
        spectrum.stepOver();
        openDebuggerPanel();
        updateDebugger();
        updateStatus();
    });

    btnRightRunTo.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        if (rightRunToTarget === null) {
            showMessage('Click a line in disassembly to set target', 'error');
            return;
        }
        prepareStep(spectrum);
        const reached = spectrum.runToAddress(rightRunToTarget);
        if (reached) {
            showMessage(`Reached ${hex16(rightRunToTarget)}`);
        } else {
            showMessage(`Target ${hex16(rightRunToTarget)} not reached (max cycles)`, 'error');
        }
        updateDebugger();
        updateStatus();
    });

    btnRightRunToInt.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        prepareStep(spectrum);
        const reached = spectrum.runToInterrupt();
        if (reached) {
            showMessage(`Interrupt at ${hex16(spectrum.cpu.pc)}`);
        } else {
            showMessage('Interrupt not reached (max cycles)', 'error');
        }
        updateDebugger();
        updateStatus();
    });

    btnRightRunToRet.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        prepareStep(spectrum);
        const reached = spectrum.runToRet();
        if (reached) {
            showMessage(`RET at ${hex16(spectrum.cpu.pc)}`);
        } else {
            showMessage('RET not reached (max cycles)', 'error');
        }
        updateDebugger();
        updateStatus();
    });

    btnRightRunTstates.addEventListener('click', () => {
        const spectrum = getSpectrum();
        if (!spectrum.romLoaded) return;
        const tstates = parseInt(rightTstatesInput.value, 10);
        if (isNaN(tstates) || tstates <= 0) {
            showMessage('Invalid T-states value', 'error');
            return;
        }
        prepareStep(spectrum);
        const executed = spectrum.runTstates(tstates);
        if (chkAutoComment.checked) {
            commentManager.set(spectrum.cpu.pc, { before: '--------------------' });
        }
        showMessage(`Executed ${executed} T-states`);
        updateDebugger();
        updateStatus();
    });

    return {
        getRunToTarget: () => runToTarget,
        setRunToTarget: (v) => { runToTarget = v; },
        getRightRunToTarget: () => rightRunToTarget,
        setRightRunToTarget: (v) => { rightRunToTarget = v; }
    };
}
