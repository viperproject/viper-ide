"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const StateVisualizer_1 = require('./StateVisualizer');
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
        let methodNameAndType = StateVisualizer_1.StateVisualizer.debuggedMethodName.split(" ");
        let body = `<body>
    <h2>Showing heap for ${methodNameAndType[0].toLowerCase()} ${methodNameAndType[1]} in file ${this.heapGraph.fileName}</h2>
    <h3>State ${this.heapGraph.state - StateVisualizer_1.StateVisualizer.currentOffset} at ${this.heapGraph.position.line + 1}:${this.heapGraph.position.character + 1} </h3>
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLGdDQUE0QyxpQkFBaUIsQ0FBQyxDQUFBO0FBQzlELGtDQUE4QixtQkFBbUIsQ0FBQyxDQUFBO0FBRWxELDBCQUEwQixJQUFZO0lBQ2xDLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLENBQUE7QUFDdEMsQ0FBQztBQUVEO0lBQUE7UUFFWSxpQkFBWSxHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksRUFBYyxDQUFDO0lBbUNqRSxDQUFDO0lBaENVLFFBQVEsQ0FBQyxTQUFvQjtRQUNoQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztJQUMvQixDQUFDO0lBRU0sMEJBQTBCLENBQUMsR0FBZTtRQUU3QyxJQUFJLGlCQUFpQixHQUFHLGlDQUFlLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBRXRFLElBQUksSUFBSSxHQUFHOzJCQUNRLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDLFdBQVcsRUFBRSxJQUFJLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUTtnQkFDeEcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEdBQUMsaUNBQWUsQ0FBQyxhQUFhLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTLEdBQUMsQ0FBQztnQkFDOUgsU0FBRyxDQUFDLFdBQVc7U0FDdEIsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBQyxVQUFVLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLDBCQUEwQixDQUFDO2VBQ3ZGLEdBQUc7UUFDVixDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ1gsU0FBRyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQ25ELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRU0sTUFBTSxDQUFDLEdBQWU7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFhO1FBQzlCLE1BQU0sQ0FBQztzQkFDTyxLQUFLO3dCQUNILENBQUM7SUFDckIsQ0FBQztBQUNMLENBQUM7QUFyQ1ksb0JBQVksZUFxQ3hCLENBQUE7QUFFRCw2RkFBNkY7QUFDN0Ysa0RBQWtEO0FBQ2xELFNBQVM7QUFDVCxnQ0FBZ0M7QUFDaEMsdURBQXVEO0FBQ3ZELHNEQUFzRDtBQUN0RCwyQ0FBMkM7QUFDM0MsVUFBVTtBQUNWLG1EQUFtRDtBQUNuRCxPQUFPO0FBQ1AsZ0ZBQWdGO0FBQ2hGLE9BQU87QUFDUCxtQ0FBbUM7QUFDbkMsT0FBTztBQUNQLHNGQUFzRjtBQUN0RixPQUFPO0FBQ1AsOERBQThEIn0=