// Undo/redo manager — extracted from index.html
export class UndoManager {
    constructor(maxHistory = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistory = maxHistory;
        this.onChange = null;
        this.lastAction = null;
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    push(action) {
        // action = {type, description, undo(), redo()}
        this.undoStack.push(action);
        this.redoStack = [];
        if (this.undoStack.length > this.maxHistory) {
            this.undoStack.shift();
        }
        if (this.onChange) this.onChange();
    }

    undo() {
        if (this.undoStack.length === 0) return false;
        const action = this.undoStack.pop();
        action.undo();
        this.redoStack.push(action);
        this.lastAction = { type: 'undo', description: action.description };
        if (this.onChange) this.onChange();
        return true;
    }

    redo() {
        if (this.redoStack.length === 0) return false;
        const action = this.redoStack.pop();
        action.redo();
        this.undoStack.push(action);
        this.lastAction = { type: 'redo', description: action.description };
        if (this.onChange) this.onChange();
        return true;
    }

    clear() {
        this.undoStack = [];
        this.redoStack = [];
        if (this.onChange) this.onChange();
    }
}
