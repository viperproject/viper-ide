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
        if (this.editor) {
            this.stateVisualizer.removeSpecialCharacters(() => { });
        }
    }
    setEditor(editor) {
        if (!this.editor) {
            this.editor = editor;
            this.stateVisualizer.removeSpecialCharacters(() => { });
        }
        else {
            this.editor = editor;
        }
    }
}
exports.ViperFileState = ViperFileState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGaWxlU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGaWxlU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBO0FBRVosZ0NBQWdDLGlCQUFpQixDQUFDLENBQUE7QUFDbEQsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsa0NBQThCLG1CQUFtQixDQUFDLENBQUE7QUFHbEQsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0I7SUFFSSxZQUFZLEdBQWU7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDdEIsSUFBSSxDQUFDLE9BQU8sR0FBRyx1QkFBTyxDQUFDLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO1FBQy9CLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFDOUIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxDQUFDLDBCQUEwQjtRQUMxRCxJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxpQ0FBZSxFQUFFLENBQUM7UUFDN0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7SUFDNUIsQ0FBQztJQWdCTSxVQUFVO1FBQ2IsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDckIsQ0FBQztJQUVNLElBQUk7UUFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELCtEQUErRDtJQUMvRCw0REFBNEQ7SUFDcEQsZ0JBQWdCO1FBQ3BCLE1BQU0sQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLE1BQU07WUFDM0MsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1lBQ3pCLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2QsSUFBSSxDQUFDLGVBQWUsQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQzVELENBQUM7SUFDTCxDQUFDO0lBRU0sU0FBUyxDQUFDLE1BQXdCO1FBQ3JDLEVBQUUsQ0FBQSxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBLENBQUM7WUFDYixJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztZQUNyQixJQUFJLENBQUMsZUFBZSxDQUFDLHVCQUF1QixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDNUQsQ0FBQztRQUFBLElBQUksQ0FBQSxDQUFDO1lBQ0YsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDekIsQ0FBQztJQUNMLENBQUM7QUFDTCxDQUFDO0FBNURZLHNCQUFjLGlCQTREMUIsQ0FBQSJ9