import * as vscode from 'vscode';
import {Log} from './Log';
import {HeapGraph, Position, LogLevel, StateColors} from './ViperProtocol';
import {StateVisualizer} from './StateVisualizer';
import * as fs from 'fs';
import {Helper} from './Helper';

export class HeapProvider implements vscode.TextDocumentContentProvider {

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    private heapGraphs: HeapGraph[];
    public setState(heapGraph: HeapGraph, index: number) {
        this.heapGraphs[index] = heapGraph;
    }

    public resetState() {
        this.heapGraphs = [];
    }

    stateVisualizer: StateVisualizer;

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let table: string;
        let darkGraphs = <boolean>Helper.getConfiguration("darkGraphs");
        if (this.heapGraphs.length > 1) {
            table = ` <table>
  <tr><td>
   <h1 style="color:${StateColors.currentState(darkGraphs)}">Current State</h1>
   ${this.heapGraphToContent(1 - this.stateVisualizer.nextHeapIndex, this.stateVisualizer.nextHeapIndex)}
  </td><td>
   <h1 style="color:${StateColors.previousState(darkGraphs)}">Previous State</h1>
   ${this.heapGraphToContent(this.stateVisualizer.nextHeapIndex, 1 - this.stateVisualizer.nextHeapIndex)}
  </td></tr>
 </table>`;
        } else if (this.heapGraphs.length == 1) {
            table = ` <h1 style="color:${StateColors.currentState(darkGraphs)}">Current</h1>${this.heapGraphToContent(0)}`;
        } else {
            table = " <p>No graph to show</p>";
        }

        return `<head>
<style>
 table td, table td * {
  vertical-align: top;
 }
</style>        
</head>
<body>
 ${table}
 <p><font face="courier">${this.stringToHtml(this.stateVisualizer.globalInfo)}</font></p>
 <a href='${uri}'>view source</a>
</body>`;
    }

    private heapGraphToContent(index: number, otherIndex?: number): string {
        let heapGraph = this.heapGraphs[index];
        if (!heapGraph) {
            Log.error("invalid index for heapGraphToContent: " + index);
            return;
        }

        let compareToOther: boolean = typeof otherIndex !== 'undefined';
        let otherHeapGraph: HeapGraph;
        if (compareToOther) {
            otherHeapGraph = this.heapGraphs[otherIndex];
        }

        let conditions = "";
        if (heapGraph.conditions.length > 0) {
            heapGraph.conditions.forEach(element => {
                //if the condition is new, draw it in bold (non optimized)
                let isNew = compareToOther && otherHeapGraph.conditions.indexOf(element) < 0;
                conditions += `     <tr><td>${isNew ? "<b>" : ""}${element}${isNew ? "</b>" : ""}</td></tr>\n`;
            });
            conditions = `<h3>Path conditions</h3>
    <table border="solid">${conditions}
    </table>`
        } else {
            conditions = `<h3>No path conditions</h3>`;
        }
        let content = `
    <h2>file: ${heapGraph.fileName}<br />${heapGraph.methodType}: ${heapGraph.methodName}</h2>
    <h3>state ${this.stateVisualizer.decorationOptions[heapGraph.state].numberToDisplay}<br />position: ${heapGraph.position.line + 1}:${heapGraph.position.character + 1}</h3>
    ${this.getSvgContent(Log.svgFilePath(index))}
    ${conditions}
    <p>${this.stringToHtml(heapGraph.stateInfos)}</p><br />`;
        return content;
    }

    //<img src="${Log.svgFilePath(index)}"></img><br />

    private getSvgContent(filePath:string):string{
        let content = fs.readFileSync(filePath).toString();
        return content.substring(content.indexOf("<svg"),content.length);
    }

    get onDidChange(): vscode.Event<vscode.Uri> {
        //Log.log("PreviewHTML: onDidChange", LogLevel.Debug)
        return this._onDidChange.event;
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }

    private errorSnippet(error: string): string {
        return `<body>\n\t${error}\n</body>`;
    }

    private stringToHtml(s: string): string {
        return s.replace(/\n/g, "<br />\n    ").replace(/\t/g, "&nbsp;");
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