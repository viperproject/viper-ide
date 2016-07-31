import * as vscode from 'vscode';
import {Log} from './Log';
import {HeapGraph, Position, LogLevel} from './ViperProtocol';
import {StateVisualizer} from './StateVisualizer';

function postInfoFromForm(info: string) {
    Log.log("Info from Form: " + info)
}

export class HeapProvider implements vscode.TextDocumentContentProvider {

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    private heapGraph: HeapGraph;
    public setState(heapGraph: HeapGraph) {
        this.heapGraph = heapGraph;
    }

    public provideTextDocumentContent(uri: vscode.Uri): string {

        let methodNameAndType = StateVisualizer.debuggedMethodName.split(" ");

        let body = `<body>
    <h2>Showing heap for ${methodNameAndType[0].toLowerCase()} ${methodNameAndType[1]} in file ${this.heapGraph.fileName}</h2>
    <h3>State ${this.heapGraph.state-StateVisualizer.currentOffset} at ${this.heapGraph.position.line+1}:${this.heapGraph.position.character+1} </h3>
    <img src="${Log.svgFilePath}"></img><br />
    <p>${this.heapGraph.stateInfos.replace(/\n/g,"<br />\n").replace(/\t/g,"&nbsp;&nbsp;&nbsp;&nbsp;")}</p><br />
    <a href='${uri}'>view source</a>
</body>`;
        return body;
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        Log.log("PreviewHTML: onDidChange", LogLevel.Debug)
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    private errorSnippet(error: string): string {
        return `<body>
                    ${error}
                </body>`;
    }
}

// ${editor.document.getText(new vscode.Range(editor.selection.start, editor.selection.end))}
// <div style='border:solid;width:100;height:100'>
// </div>
// <form action="demo_form.asp">
//     First name: <input type="text" name="fname"><br>
//     Last name: <input type="text" name="lname"><br>
//     <input type="submit" value="Submit">
// </form>
// external <a href='http://www.google.ch'>link</a>
// <br>
// <a href='command:vscode.previewHtml?"${uri}"'>refresh</a> using internal link
// <br>
// <a href='${uri}'>view source</a>
// <br>
// <a href='command:editor.action.showReferences?"${editor.document.uri}"'>command</a>
// <br>
// <a href='command:editor.action.startDebug?'>start Debug</a>