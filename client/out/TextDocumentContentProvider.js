"use strict";
const vscode = require('vscode');
function postInfoFromForm(info) {
    console.log("Info from Form: " + info);
}
class DebugContentProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    provideTextDocumentContent(uri) {
        let editor = vscode.window.activeTextEditor;
        if (!(editor.document.languageId === 'silver')) {
            return this.errorSnippet("information can only be shown for viper source code");
        }
        let text = editor.document.getText();
        let selStart = editor.document.offsetAt(editor.selection.anchor);
        let body = `<body>
    ${editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end))}
    <div style='border:solid;width:100;height:100'>
    </div>
    <form action="demo_form.asp">
        First name: <input type="text" name="fname"><br>
        Last name: <input type="text" name="lname"><br>
        <input type="submit" value="Submit">
    </form>
    external <a href='http://www.google.ch'>link</a>
    <br>
    <a href='command:vscode.previewHtml?"${uri}"'>refresh</a> using internal link
    <br>
    <a href='${uri}'>view source</a>
    <br>
    <a href='command:editor.action.showReferences?"${editor.document.uri}"'>command</a>
    <br>
    <a href='command:editor.action.startDebug?'>start Debug</a>
</body>`;
        return body;
    }
    get onDidChange() {
        console.log("PreviewHTML: onDidChange");
        return this._onDidChange.event;
    }
    update(uri) {
        this._onDidChange.fire(uri);
    }
    extractSnippet() {
        let editor = vscode.window.activeTextEditor;
        let text = editor.document.getText();
        let selStart = editor.document.offsetAt(editor.selection.anchor);
        let propStart = text.lastIndexOf('{', selStart);
        let propEnd = text.indexOf('}', selStart);
        if (propStart === -1 || propEnd === -1) {
            return this.errorSnippet("Cannot determine the rule's properties.");
        }
        else {
            return this.snippet(editor.document, propStart, propEnd);
        }
    }
    errorSnippet(error) {
        return `<body>
                    ${error}
                </body>`;
    }
    snippet(document, propStart, propEnd) {
        return `<body>
                    <div id="el">Lorem ipsum dolor sit amet, mi et mauris nec ac luctus lorem, proin leo nulla integer metus vestibulum lobortis, eget</div>
                </body>`;
    }
}
exports.DebugContentProvider = DebugContentProvider;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFFakMsMEJBQTBCLElBQVk7SUFDbEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsQ0FBQTtBQUMxQyxDQUFDO0FBRUQ7SUFBQTtRQUNZLGlCQUFZLEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxFQUFjLENBQUM7SUFtRWpFLENBQUM7SUFqRVUsMEJBQTBCLENBQUMsR0FBZTtRQUM3QyxJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1FBQzVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMscURBQXFELENBQUMsQ0FBQTtRQUNuRixDQUFDO1FBRUQsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNyQyxJQUFJLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWpFLElBQUksSUFBSSxHQUFHO01BQ2IsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7Ozs7Ozs7Ozs7MkNBVWxELEdBQUc7O2VBRS9CLEdBQUc7O3FEQUVtQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUc7OztRQUdoRSxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ1gsT0FBTyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsQ0FBQyxDQUFBO1FBQ3ZDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRU0sTUFBTSxDQUFDLEdBQWU7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLGNBQWM7UUFDbEIsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztRQUM1QyxJQUFJLElBQUksR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JDLElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakUsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDaEQsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFMUMsRUFBRSxDQUFDLENBQUMsU0FBUyxLQUFLLENBQUMsQ0FBQyxJQUFJLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMseUNBQXlDLENBQUMsQ0FBQztRQUN4RSxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM3RCxDQUFDO0lBQ0wsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFhO1FBQzlCLE1BQU0sQ0FBQztzQkFDTyxLQUFLO3dCQUNILENBQUM7SUFDckIsQ0FBQztJQUVPLE9BQU8sQ0FBQyxRQUE2QixFQUFFLFNBQWlCLEVBQUUsT0FBZTtRQUM3RSxNQUFNLENBQUM7O3dCQUVTLENBQUM7SUFDckIsQ0FBQztBQUNMLENBQUM7QUFwRVksNEJBQW9CLHVCQW9FaEMsQ0FBQSJ9