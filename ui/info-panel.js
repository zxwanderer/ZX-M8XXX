// info-panel.js — Info subtab switching + opcodes table init (lazy-loaded from tab-system.js)

import { initOpcodesTable } from './opcodes-table.js';

export function initInfoPanel() {
    // Wire info subtab switching
    document.querySelectorAll('.info-subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.infotab;
            document.querySelectorAll('.info-subtab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.info-subtab-content').forEach(c => c.classList.remove('active'));
            document.getElementById('info-' + tabId).classList.add('active');
        });
    });

    // Initialize opcodes table
    initOpcodesTable();
}
