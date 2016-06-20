"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
function postInfoFromForm(info) {
    Log_1.Log.log("Info from Form: " + info);
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
        Log_1.Log.log("PreviewHTML: onDidChange");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRTFCLDBCQUEwQixJQUFZO0lBQ2xDLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLENBQUE7QUFDdEMsQ0FBQztBQUVEO0lBQUE7UUFDWSxpQkFBWSxHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksRUFBYyxDQUFDO0lBbUVqRSxDQUFDO0lBakVVLDBCQUEwQixDQUFDLEdBQWU7UUFDN0MsSUFBSSxNQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztRQUM1QyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLHFEQUFxRCxDQUFDLENBQUE7UUFDbkYsQ0FBQztRQUVELElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckMsSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUVqRSxJQUFJLElBQUksR0FBRztNQUNiLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDOzs7Ozs7Ozs7OzJDQVVsRCxHQUFHOztlQUUvQixHQUFHOztxREFFbUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHOzs7UUFHaEUsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELElBQUksV0FBVztRQUNYLFNBQUcsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLENBQUMsQ0FBQTtRQUNuQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7SUFDbkMsQ0FBQztJQUVNLE1BQU0sQ0FBQyxHQUFlO1FBQ3pCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFTyxjQUFjO1FBQ2xCLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUM7UUFDNUMsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNyQyxJQUFJLFFBQVEsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pFLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ2hELElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRTFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsS0FBSyxDQUFDLENBQUMsSUFBSSxPQUFPLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLHlDQUF5QyxDQUFDLENBQUM7UUFDeEUsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDN0QsQ0FBQztJQUNMLENBQUM7SUFFTyxZQUFZLENBQUMsS0FBYTtRQUM5QixNQUFNLENBQUM7c0JBQ08sS0FBSzt3QkFDSCxDQUFDO0lBQ3JCLENBQUM7SUFFTyxPQUFPLENBQUMsUUFBNkIsRUFBRSxTQUFpQixFQUFFLE9BQWU7UUFDN0UsTUFBTSxDQUFDOzt3QkFFUyxDQUFDO0lBQ3JCLENBQUM7QUFDTCxDQUFDO0FBcEVZLDRCQUFvQix1QkFvRWhDLENBQUEifQ==