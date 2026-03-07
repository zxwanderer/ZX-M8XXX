// Labels panel — filter, add, clear, export, import, list click/dblclick handlers

export function initLabelsPanel({
    labelManager, undoManager,
    showLabelDialog, showMessage,
    updateLabelsList, updateDebugger, navigateToAddress
}) {
    // DOM elements
    const labelsList = document.getElementById('labelsList');
    const labelFilterInput = document.getElementById('labelFilterInput');
    const btnAddLabel = document.getElementById('btnAddLabel');
    const btnExportLabels = document.getElementById('btnExportLabels');
    const btnImportLabels = document.getElementById('btnImportLabels');
    const btnClearLabels = document.getElementById('btnClearLabels');
    const labelFileInput = document.getElementById('labelFileInput');

    // Filter input
    labelFilterInput.addEventListener('input', () => {
        updateLabelsList();
    });

    // Add label
    btnAddLabel.addEventListener('click', () => {
        showLabelDialog(null, null);
    });

    // Clear all labels
    btnClearLabels.addEventListener('click', () => {
        const count = labelManager.getAll().length;
        if (count === 0) {
            showMessage('No labels to clear', 'error');
            return;
        }
        if (confirm(`Clear all ${count} label(s)?`)) {
            labelManager.labels.clear();
            labelManager._autoSave();
            showMessage(`Cleared ${count} label(s)`);
            updateLabelsList();
            updateDebugger();
        }
    });

    // Export labels
    btnExportLabels.addEventListener('click', () => {
        const labels = labelManager.getAll();
        if (labels.length === 0) {
            showMessage('No labels to export', 'error');
            return;
        }
        try {
            const json = labelManager.exportJSON();
            const blob = new Blob([json], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const filename = labelManager.currentFile
                ? labelManager.currentFile.replace(/\.[^.]+$/, '') + '_labels.json'
                : 'labels.json';
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            showMessage(`Exported ${labels.length} label(s)`);
        } catch (e) {
            showMessage('Export failed: ' + e.message, 'error');
        }
    });

    // Import labels
    btnImportLabels.addEventListener('click', () => {
        labelFileInput.click();
    });

    labelFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const merge = labelManager.getAll().length > 0 &&
                              confirm('Merge with existing labels?\n(Cancel to replace all)');
                const count = labelManager.importJSON(event.target.result, merge);
                showMessage(`Imported ${count} label(s)${merge ? ' (merged)' : ''}`);
                updateLabelsList();
                updateDebugger();
            } catch (err) {
                showMessage('Invalid labels file: ' + err.message, 'error');
            }
        };
        reader.onerror = () => showMessage('Failed to read file: ' + file.name, 'error');
        reader.readAsText(file);
        labelFileInput.value = '';
    });

    // Label list click — remove, edit, navigate
    labelsList.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.label-remove');
        if (removeBtn) {
            const addr = parseInt(removeBtn.dataset.addr, 10);
            const page = removeBtn.dataset.page === 'null' ? null : parseInt(removeBtn.dataset.page, 10);
            const oldLabel = labelManager.get(addr, page);
            if (!oldLabel) return;
            labelManager.remove(addr, page);
            undoManager.push({
                type: 'label',
                description: `Delete label "${oldLabel.name}"`,
                undo: () => {
                    labelManager.add(oldLabel);
                    updateLabelsList();
                },
                redo: () => {
                    labelManager.remove(addr, page);
                    updateLabelsList();
                }
            });
            showMessage(`Label removed: ${oldLabel.name}`);
            updateLabelsList();
            updateDebugger();
            return;
        }

        const editBtn = e.target.closest('.label-edit');
        if (editBtn) {
            const addr = parseInt(editBtn.dataset.addr, 10);
            const page = editBtn.dataset.page === 'null' ? null : parseInt(editBtn.dataset.page, 10);
            const label = labelManager.get(addr, page);
            showLabelDialog(addr, label);
            return;
        }

        const item = e.target.closest('.label-item');
        if (item) {
            const addr = parseInt(item.dataset.addr, 10);
            navigateToAddress(addr);
        }
    });

    // Label list double-click — navigate
    labelsList.addEventListener('dblclick', (e) => {
        const item = e.target.closest('.label-item');
        if (item) {
            const addr = parseInt(item.dataset.addr, 10);
            navigateToAddress(addr);
        }
    });

    return {};
}
