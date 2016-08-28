'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
const vscode = require('vscode');
const StateVisualizer_1 = require('./StateVisualizer');
const path = require('path');
class ViperFileState {
    constructor(uri) {
        this.verified = false;
        this.success = ViperProtocol_1.Success.None;
        this.verifying = false;
        this.open = true;
        this.changed = true;
        this.onlySpecialCharsChanged = false;
        this.needsVerification = false;
        this.decorationsShown = false;
        this.specialCharsShown = false; //TODO: is it really false
        this.uri = uri;
        this.stateVisualizer = new StateVisualizer_1.StateVisualizer();
        this.stateVisualizer.initialize(this);
        this.initializeEditor();
    }
    fileOpened() {
        this.open = true;
    }
    name() {
        return path.basename(this.uri.toString());
    }
    //for the first open file we need to load the editor like this.
    //for the others the editor is set once the editor is active
    initializeEditor() {
        vscode.window.visibleTextEditors.forEach(editor => {
            if (editor.document.uri.toString() === this.uri.toString()) {
                this.editor = editor;
            }
        });
        /*if (this.editor) {
            this.stateVisualizer.removeSpecialCharacters(() => { });
        }*/
    }
    setEditor(editor) {
        if (!this.editor) {
            this.editor = editor;
        }
        else {
            this.editor = editor;
        }
    }
}
exports.ViperFileState = ViperFileState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGaWxlU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGaWxlU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBO0FBRVosZ0NBQWdDLGlCQUFpQixDQUFDLENBQUE7QUFDbEQsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsa0NBQThCLG1CQUFtQixDQUFDLENBQUE7QUFHbEQsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0I7SUFFSSxZQUFZLEdBQWU7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDdEIsSUFBSSxDQUFDLE9BQU8sR0FBRyx1QkFBTyxDQUFDLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUM7UUFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLEtBQUssQ0FBQztRQUM5QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDLENBQUMsMEJBQTBCO1FBQzFELElBQUksQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO1FBQ2YsSUFBSSxDQUFDLGVBQWUsR0FBRyxJQUFJLGlDQUFlLEVBQUUsQ0FBQztRQUM3QyxJQUFJLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN0QyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztJQUM1QixDQUFDO0lBaUJNLFVBQVU7UUFDYixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNyQixDQUFDO0lBRU0sSUFBSTtRQUNQLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUM5QyxDQUFDO0lBRUQsK0RBQStEO0lBQy9ELDREQUE0RDtJQUNwRCxnQkFBZ0I7UUFDcEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsTUFBTTtZQUMzQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztnQkFDekQsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7WUFDekIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0g7O1dBRUc7SUFDUCxDQUFDO0lBRU0sU0FBUyxDQUFDLE1BQXlCO1FBQ3RDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDZixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUV6QixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztRQUN6QixDQUFDO0lBQ0wsQ0FBQztBQUNMLENBQUM7QUE5RFksc0JBQWMsaUJBOEQxQixDQUFBIn0=