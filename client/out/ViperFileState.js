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
        this.decorationsShown = false;
        this.specialCharsShown = false;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGaWxlU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGaWxlU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBO0FBRVosZ0NBQWdDLGlCQUFpQixDQUFDLENBQUE7QUFDbEQsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsa0NBQThCLG1CQUFtQixDQUFDLENBQUE7QUFHbEQsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0I7SUFFSSxZQUFZLEdBQWU7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDdEIsSUFBSSxDQUFDLE9BQU8sR0FBRyx1QkFBTyxDQUFDLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7UUFDOUIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEtBQUssQ0FBQztRQUMvQixJQUFJLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNmLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxpQ0FBZSxFQUFFLENBQUM7UUFDN0MsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDdEMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7SUFDNUIsQ0FBQztJQWdCTSxVQUFVO1FBQ2IsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDckIsQ0FBQztJQUVNLElBQUk7UUFDUCxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7SUFDOUMsQ0FBQztJQUVELCtEQUErRDtJQUMvRCw0REFBNEQ7SUFDcEQsZ0JBQWdCO1FBQ3BCLE1BQU0sQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLE1BQU07WUFDM0MsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3pELElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1lBQ3pCLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztJQUNQLENBQUM7SUFFTSxTQUFTLENBQUMsTUFBeUI7UUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3pCLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3pCLENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQXhEWSxzQkFBYyxpQkF3RDFCLENBQUEifQ==