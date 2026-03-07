// gamepad.js — Hardware Gamepad support and calibration (extracted from index.html)
import { storageGet, storageSet, storageRemove } from '../core/utils.js';

export function initGamepad({ getGamepadEnabled, setGamepadEnabled, getGamepadMapping, setGamepadMapping,
                               enableKempston, saveInputSettings, showMessage }) {

    const chkGamepad = document.getElementById('chkGamepad');
    const gamepadStatus = document.getElementById('gamepadStatus');

    function updateGamepadStatus() {
        if (!chkGamepad.checked) {
            gamepadStatus.textContent = '';
            return;
        }
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let found = false;
        for (let gp of gamepads) {
            if (gp && gp.connected) {
                gamepadStatus.textContent = `(${gp.id.substring(0, 30)})`;
                gamepadStatus.style.color = 'var(--green)';
                found = true;
                break;
            }
        }
        if (!found) {
            gamepadStatus.textContent = '(No gamepad detected)';
            gamepadStatus.style.color = 'var(--text-dim)';
        }
    }

    chkGamepad.addEventListener('change', () => {
        setGamepadEnabled(chkGamepad.checked);
        if (chkGamepad.checked) {
            enableKempston();
        }
        updateGamepadStatus();
        saveInputSettings();
        showMessage(chkGamepad.checked ?
            'Hardware gamepad enabled' :
            'Hardware gamepad disabled');
    });

    // Listen for gamepad connect/disconnect
    window.addEventListener('gamepadconnected', (e) => {
        updateGamepadStatus();
        if (chkGamepad.checked) {
            showMessage(`Gamepad connected: ${e.gamepad.id.substring(0, 40)}`);
        }
    });
    window.addEventListener('gamepaddisconnected', (e) => {
        updateGamepadStatus();
        if (chkGamepad.checked) {
            showMessage('Gamepad disconnected');
        }
    });

    // Gamepad Calibration
    const gamepadCalibDialog = document.getElementById('gamepadCalibDialog');
    const gamepadCalibInfo = document.getElementById('gamepadCalibInfo');
    const gamepadCalibStatus = document.getElementById('gamepadCalibStatus');
    const btnCalibrateGamepad = document.getElementById('btnCalibrateGamepad');
    let gamepadCalibrating = null;
    let gamepadCalibPollId = null;
    let gamepadBaseline = null;

    function updateGamepadCalibDisplay() {
        const m = getGamepadMapping() || {};
        const fmt = (entry) => {
            if (!entry) return '-';
            if (entry.type === 'axis') {
                return `Axis ${entry.index} ${entry.direction > 0 ? '+' : '-'}`;
            } else if (entry.type === 'button') {
                return `Button ${entry.index}`;
            }
            return '-';
        };
        document.getElementById('gamepadMapUp').textContent = fmt(m.up);
        document.getElementById('gamepadMapDown').textContent = fmt(m.down);
        document.getElementById('gamepadMapLeft').textContent = fmt(m.left);
        document.getElementById('gamepadMapRight').textContent = fmt(m.right);
        document.getElementById('gamepadMapFire').textContent = fmt(m.fire);
        document.getElementById('gamepadMapC').textContent = fmt(m.c);
        document.getElementById('gamepadMapA').textContent = fmt(m.a);
        document.getElementById('gamepadMapStart').textContent = fmt(m.start);
    }

    function captureGamepadBaseline() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (let gp of gamepads) {
            if (gp && gp.connected) {
                gamepadBaseline = {
                    axes: [...gp.axes],
                    buttons: gp.buttons.map(b => b.pressed)
                };
                return;
            }
        }
        gamepadBaseline = null;
    }

    function pollGamepadForCalibration() {
        if (!gamepadCalibrating) return;

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let gp = null;
        for (let g of gamepads) {
            if (g && g.connected) { gp = g; break; }
        }
        if (!gp || !gamepadBaseline) {
            gamepadCalibPollId = requestAnimationFrame(pollGamepadForCalibration);
            return;
        }

        // Check for axis changes (threshold 0.4 difference from baseline)
        for (let i = 0; i < gp.axes.length; i++) {
            const diff = gp.axes[i] - (gamepadBaseline.axes[i] || 0);
            if (Math.abs(diff) > 0.4) {
                const mapping = {
                    type: 'axis',
                    index: i,
                    direction: diff > 0 ? 1 : -1,
                    threshold: 0.3
                };
                const m = getGamepadMapping() || {};
                m[gamepadCalibrating] = mapping;
                setGamepadMapping(m);
                gamepadCalibStatus.textContent = `Assigned: Axis ${i} ${diff > 0 ? '+' : '-'}`;
                gamepadCalibrating = null;
                updateGamepadCalibDisplay();
                return;
            }
        }

        // Check for button presses
        for (let i = 0; i < gp.buttons.length; i++) {
            if (gp.buttons[i].pressed && !(gamepadBaseline.buttons[i])) {
                const mapping = { type: 'button', index: i };
                const m = getGamepadMapping() || {};
                m[gamepadCalibrating] = mapping;
                setGamepadMapping(m);
                gamepadCalibStatus.textContent = `Assigned: Button ${i}`;
                gamepadCalibrating = null;
                updateGamepadCalibDisplay();
                return;
            }
        }

        gamepadCalibPollId = requestAnimationFrame(pollGamepadForCalibration);
    }

    btnCalibrateGamepad.addEventListener('click', () => {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        let found = false;
        for (let gp of gamepads) {
            if (gp && gp.connected) {
                gamepadCalibInfo.textContent = gp.id;
                gamepadCalibInfo.style.color = 'var(--green)';
                found = true;
                break;
            }
        }
        if (!found) {
            gamepadCalibInfo.textContent = 'No gamepad detected - connect one first';
            gamepadCalibInfo.style.color = 'var(--text-dim)';
        }
        gamepadCalibStatus.textContent = '';
        gamepadCalibrating = null;
        updateGamepadCalibDisplay();
        gamepadCalibDialog.classList.remove('hidden');
    });

    // Assign buttons
    document.querySelectorAll('.gamepad-assign-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const dir = btn.dataset.dir;
            gamepadCalibrating = dir;
            gamepadCalibStatus.textContent = `Move stick ${dir.toUpperCase()} or press button...`;
            captureGamepadBaseline();
            if (gamepadCalibPollId) cancelAnimationFrame(gamepadCalibPollId);
            gamepadCalibPollId = requestAnimationFrame(pollGamepadForCalibration);
        });
    });

    document.getElementById('btnGamepadCalibReset').addEventListener('click', () => {
        if (gamepadCalibPollId) cancelAnimationFrame(gamepadCalibPollId);
        gamepadCalibrating = null;
        setGamepadMapping(null);
        storageRemove('zxm8_gamepad');
        updateGamepadCalibDisplay();
        gamepadCalibStatus.textContent = 'Mapping reset to default';
    });

    document.getElementById('btnGamepadCalibSave').addEventListener('click', () => {
        const m = getGamepadMapping();
        if (m) {
            storageSet('zxm8_gamepad', JSON.stringify(m));
            showMessage('Gamepad mapping saved');
        }
        gamepadCalibDialog.classList.add('hidden');
        if (gamepadCalibPollId) cancelAnimationFrame(gamepadCalibPollId);
        gamepadCalibrating = null;
    });

    document.getElementById('btnGamepadCalibClose').addEventListener('click', () => {
        gamepadCalibDialog.classList.add('hidden');
        if (gamepadCalibPollId) cancelAnimationFrame(gamepadCalibPollId);
        gamepadCalibrating = null;
    });

    // Load saved gamepad mapping
    try {
        const savedMapping = storageGet('zxm8_gamepad');
        if (savedMapping) {
            setGamepadMapping(JSON.parse(savedMapping));
        }
    } catch (e) { console.warn('Failed to load gamepad mapping:', e); }

    return {
        updateStatus: updateGamepadStatus
    };
}
