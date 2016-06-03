"use strict";
const vscode = require('vscode');
class DebugContentProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    provideTextDocumentContent(uri) {
        return this.createCssSnippet();
    }
    get onDidChange() {
        return this._onDidChange.event;
    }
    update(uri) {
        this._onDidChange.fire(uri);
    }
    createCssSnippet() {
        let editor = vscode.window.activeTextEditor;
        if (!(editor.document.languageId === 'css')) {
            return this.errorSnippet("Active editor doesn't show a CSS document - no properties to preview.");
        }
        return this.extractSnippet();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFFakM7SUFBQTtRQUNZLGlCQUFZLEdBQUcsSUFBSSxNQUFNLENBQUMsWUFBWSxFQUFjLENBQUM7SUErQ2pFLENBQUM7SUE3Q1UsMEJBQTBCLENBQUMsR0FBZTtRQUM3QyxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixFQUFFLENBQUM7SUFDbkMsQ0FBQztJQUVELElBQUksV0FBVztRQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRU0sTUFBTSxDQUFDLEdBQWU7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLGdCQUFnQjtRQUNwQixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1FBQzVDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsS0FBSyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsdUVBQXVFLENBQUMsQ0FBQTtRQUNyRyxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztJQUNqQyxDQUFDO0lBRU8sY0FBYztRQUNsQixJQUFJLE1BQU0sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDO1FBQzVDLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckMsSUFBSSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqRSxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUNoRCxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxRQUFRLENBQUMsQ0FBQztRQUUxQyxFQUFFLENBQUMsQ0FBQyxTQUFTLEtBQUssQ0FBQyxDQUFDLElBQUksT0FBTyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO1FBQ3hFLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsU0FBUyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzdELENBQUM7SUFDTCxDQUFDO0lBRU8sWUFBWSxDQUFDLEtBQWE7UUFDOUIsTUFBTSxDQUFDO3NCQUNPLEtBQUs7d0JBQ0gsQ0FBQztJQUNyQixDQUFDO0lBRU8sT0FBTyxDQUFDLFFBQTZCLEVBQUUsU0FBaUIsRUFBRSxPQUFlO1FBQzdFLE1BQU0sQ0FBQzs7d0JBRVMsQ0FBQztJQUNyQixDQUFDO0FBQ0wsQ0FBQztBQWhEWSw0QkFBb0IsdUJBZ0RoQyxDQUFBIn0=