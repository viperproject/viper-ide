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
        //this.needsVerification = false;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGaWxlU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGaWxlU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBO0FBRVosZ0NBQWdDLGlCQUFpQixDQUFDLENBQUE7QUFDbEQsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsa0NBQThCLG1CQUFtQixDQUFDLENBQUE7QUFHbEQsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0I7SUFFSSxZQUFZLEdBQWU7UUFDdkIsSUFBSSxDQUFDLFFBQVEsR0FBRyxLQUFLLENBQUM7UUFDdEIsSUFBSSxDQUFDLE9BQU8sR0FBRyx1QkFBTyxDQUFDLElBQUksQ0FBQztRQUM1QixJQUFJLENBQUMsU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN2QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztRQUNqQixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQztRQUNwQixJQUFJLENBQUMsdUJBQXVCLEdBQUcsS0FBSyxDQUFDO1FBQ3JDLGlDQUFpQztRQUNqQyxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1FBQzlCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxLQUFLLENBQUMsQ0FBQywwQkFBMEI7UUFDMUQsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7UUFDZixJQUFJLENBQUMsZUFBZSxHQUFHLElBQUksaUNBQWUsRUFBRSxDQUFDO1FBQzdDLElBQUksQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3RDLElBQUksQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0lBQzVCLENBQUM7SUFpQk0sVUFBVTtRQUNiLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ3JCLENBQUM7SUFFTSxJQUFJO1FBQ1AsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFRCwrREFBK0Q7SUFDL0QsNERBQTREO0lBQ3BELGdCQUFnQjtRQUNwQixNQUFNLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxNQUFNO1lBQzNDLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN6RCxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztZQUN6QixDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSDs7V0FFRztJQUNQLENBQUM7SUFFTSxTQUFTLENBQUMsTUFBeUI7UUFDdEMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNmLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBRXpCLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksQ0FBQyxNQUFNLEdBQUcsTUFBTSxDQUFDO1FBQ3pCLENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQTlEWSxzQkFBYyxpQkE4RDFCLENBQUEifQ==