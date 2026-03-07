// Code folding manager — extracted from index.html
import { storageGet, storageSet } from '../core/utils.js';

export class FoldManager {
    constructor() {
        this.userFolds = new Map();    // address -> {endAddress, name}
        this.collapsed = new Set();    // Set of collapsed start addresses (both sub and user)
        this.currentFile = null;
        this.autoSaveEnabled = true;
        this._subroutineManager = null;
    }

    setSubroutineManager(sm) {
        this._subroutineManager = sm;
    }

    // Add a user-defined fold
    addUserFold(startAddr, endAddr, name = null) {
        this.userFolds.set(startAddr, {
            endAddress: endAddr,
            name: name
        });
        this._autoSave();
    }

    // Remove a user-defined fold
    removeUserFold(addr) {
        const existed = this.userFolds.has(addr);
        this.userFolds.delete(addr);
        this.collapsed.delete(addr);
        this._autoSave();
        return existed;
    }

    // Get user fold at address
    getUserFold(addr) {
        return this.userFolds.get(addr) || null;
    }

    // Toggle collapse state for any fold (subroutine or user)
    toggle(addr) {
        if (this.collapsed.has(addr)) {
            this.collapsed.delete(addr);
        } else {
            this.collapsed.add(addr);
        }
        this._autoSave();
    }

    // Collapse a fold
    collapse(addr) {
        this.collapsed.add(addr);
        this._autoSave();
    }

    // Expand a fold
    expand(addr) {
        this.collapsed.delete(addr);
        this._autoSave();
    }

    // Check if an address is the start of a collapsed fold
    isCollapsed(addr) {
        return this.collapsed.has(addr);
    }

    // Get the collapsed range containing an address, if any
    // Returns {start, end} or null
    getCollapsedRangeContaining(addr) {
        // Check subroutines
        for (const collapsedAddr of this.collapsed) {
            const sub = this._subroutineManager.get(collapsedAddr);
            if (sub && sub.endAddress !== null) {
                if (addr >= collapsedAddr && addr <= sub.endAddress) {
                    return { start: collapsedAddr, end: sub.endAddress };
                }
            }
            // Check user folds
            const userFold = this.userFolds.get(collapsedAddr);
            if (userFold) {
                if (addr >= collapsedAddr && addr <= userFold.endAddress) {
                    return { start: collapsedAddr, end: userFold.endAddress };
                }
            }
        }
        return null;
    }

    // Collapse all foldable items
    collapseAll() {
        // Collapse all subroutines
        for (const [addr, sub] of this._subroutineManager.subs) {
            if (sub.endAddress !== null) {
                this.collapsed.add(addr);
            }
        }
        // Collapse all user folds
        for (const addr of this.userFolds.keys()) {
            this.collapsed.add(addr);
        }
        this._autoSave();
    }

    // Expand all folds
    expandAll() {
        this.collapsed.clear();
        this._autoSave();
    }

    // Clear all state
    clear() {
        this.userFolds.clear();
        this.collapsed.clear();
    }

    // Set current file (for localStorage key)
    setCurrentFile(filename) {
        this.currentFile = filename;
        this._autoLoad();
    }

    _autoSave() {
        if (!this.autoSaveEnabled || !this.currentFile) return;
        const key = `zxm8_folds_${this.currentFile.toLowerCase()}`;
        storageSet(key, this.exportJSON());
    }

    _autoLoad() {
        if (!this.currentFile) return;
        const key = `zxm8_folds_${this.currentFile.toLowerCase()}`;
        const data = storageGet(key);
        if (data) {
            this.importJSON(data, false);
        }
    }

    exportJSON() {
        const userFoldsArr = [];
        for (const [addr, data] of this.userFolds) {
            userFoldsArr.push({
                start: addr,
                end: data.endAddress,
                name: data.name
            });
        }
        return JSON.stringify({
            userFolds: userFoldsArr,
            collapsed: Array.from(this.collapsed)
        });
    }

    importJSON(jsonStr, merge = false) {
        try {
            const data = JSON.parse(jsonStr);
            if (!merge) {
                this.userFolds.clear();
                this.collapsed.clear();
            }
            if (data.userFolds) {
                for (const fold of data.userFolds) {
                    this.userFolds.set(fold.start, {
                        endAddress: fold.end,
                        name: fold.name || null
                    });
                }
            }
            if (data.collapsed) {
                for (const addr of data.collapsed) {
                    this.collapsed.add(addr);
                }
            }
            return true;
        } catch (e) {
            console.error('Failed to import folds:', e);
            return false;
        }
    }
}
