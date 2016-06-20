
import * as vscode from 'vscode';
import {Log} from './Log';

function postInfoFromForm(info: string) {
    Log.log("Info from Form: " + info)
}

export class DebugContentProvider implements vscode.TextDocumentContentProvider {
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let editor = vscode.window.activeTextEditor;
        if (!(editor.document.languageId === 'silver')) {
            return this.errorSnippet("information can only be shown for viper source code")
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

    get onDidChange(): vscode.Event<vscode.Uri> {
        Log.log("PreviewHTML: onDidChange")
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    private extractSnippet(): string {
        let editor = vscode.window.activeTextEditor;
        let text = editor.document.getText();
        let selStart = editor.document.offsetAt(editor.selection.anchor);
        let propStart = text.lastIndexOf('{', selStart);
        let propEnd = text.indexOf('}', selStart);

        if (propStart === -1 || propEnd === -1) {
            return this.errorSnippet("Cannot determine the rule's properties.");
        } else {
            return this.snippet(editor.document, propStart, propEnd);
        }
    }

    private errorSnippet(error: string): string {
        return `<body>
                    ${error}
                </body>`;
    }

    private snippet(document: vscode.TextDocument, propStart: number, propEnd: number): string {
        return `<body>
                    <div id="el">Lorem ipsum dolor sit amet, mi et mauris nec ac luctus lorem, proin leo nulla integer metus vestibulum lobortis, eget</div>
                </body>`;
    }
}