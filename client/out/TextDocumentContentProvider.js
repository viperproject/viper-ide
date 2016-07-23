"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
function postInfoFromForm(info) {
    Log_1.Log.log("Info from Form: " + info);
}
class HeapProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    setState(heapGraph) {
        this.heapGraph = heapGraph;
    }
    provideTextDocumentContent(uri) {
        let body = `<body>
    <h1>Showing Heap for file ${this.heapGraph.fileName}</h1>
    <h2>State ${this.heapGraph.state} at ${this.heapGraph.position.line + 1}:${this.heapGraph.position.character + 1} </h2>
    <img src="${Log_1.Log.svgFilePath}"></img><br />
    <p>${this.heapGraph.stateInfos.replace(/\n/g, "<br />\n").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;")}</p><br />
    <a href='${uri}'>view source</a>
</body>`;
        return body;
    }
    get onDidChange() {
        Log_1.Log.log("PreviewHTML: onDidChange", ViperProtocol_1.LogLevel.Debug);
        return this._onDidChange.event;
    }
    update(uri) {
        this._onDidChange.fire(uri);
    }
    errorSnippet(error) {
        return `<body>
                    ${error}
                </body>`;
    }
}
exports.HeapProvider = HeapProvider;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLGdDQUE0QyxpQkFBaUIsQ0FBQyxDQUFBO0FBRTlELDBCQUEwQixJQUFZO0lBQ2xDLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLENBQUE7QUFDdEMsQ0FBQztBQUVEO0lBQUE7UUFFWSxpQkFBWSxHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksRUFBYyxDQUFDO0lBZ0NqRSxDQUFDO0lBN0JVLFFBQVEsQ0FBQyxTQUFvQjtRQUNoQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztJQUMvQixDQUFDO0lBRU0sMEJBQTBCLENBQUMsR0FBZTtRQUM3QyxJQUFJLElBQUksR0FBRztnQ0FDYSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVE7Z0JBQ3ZDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksR0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsU0FBUyxHQUFDLENBQUM7Z0JBQ2hHLFNBQUcsQ0FBQyxXQUFXO1NBQ3RCLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQywwQkFBMEIsQ0FBQztlQUN2RixHQUFHO1FBQ1YsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELElBQUksV0FBVztRQUNYLFNBQUcsQ0FBQyxHQUFHLENBQUMsMEJBQTBCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQTtRQUNuRCxNQUFNLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUM7SUFDbkMsQ0FBQztJQUVNLE1BQU0sQ0FBQyxHQUFlO1FBQ3pCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFTyxZQUFZLENBQUMsS0FBYTtRQUM5QixNQUFNLENBQUM7c0JBQ08sS0FBSzt3QkFDSCxDQUFDO0lBQ3JCLENBQUM7QUFDTCxDQUFDO0FBbENZLG9CQUFZLGVBa0N4QixDQUFBO0FBRUQsNkZBQTZGO0FBQzdGLGtEQUFrRDtBQUNsRCxTQUFTO0FBQ1QsZ0NBQWdDO0FBQ2hDLHVEQUF1RDtBQUN2RCxzREFBc0Q7QUFDdEQsMkNBQTJDO0FBQzNDLFVBQVU7QUFDVixtREFBbUQ7QUFDbkQsT0FBTztBQUNQLGdGQUFnRjtBQUNoRixPQUFPO0FBQ1AsbUNBQW1DO0FBQ25DLE9BQU87QUFDUCxzRkFBc0Y7QUFDdEYsT0FBTztBQUNQLDhEQUE4RCJ9