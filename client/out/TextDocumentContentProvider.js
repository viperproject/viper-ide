"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
function postInfoFromForm(info) {
    Log_1.Log.log("Info from Form: " + info);
}
class DebugContentProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    setState(heapGraph) {
        this.heapGraph = heapGraph;
    }
    provideTextDocumentContent(uri) {
        let body = `<body>
    <h1>Showing Heap for file ${this.heapGraph.fileName}</h1>
    <h2>State ${this.heapGraph.state} at ${this.heapGraph.position.line}:${this.heapGraph.position.character} </h2>
    <img src="${Log_1.Log.svgFilePath}"></img>
    <p>${this.heapGraph.stateInfos.replace(/\n/g, "<br />")}</p>
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
exports.DebugContentProvider = DebugContentProvider;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQ0EsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLGdDQUE0QyxpQkFBaUIsQ0FBQyxDQUFBO0FBRTlELDBCQUEwQixJQUFZO0lBQ2xDLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLENBQUE7QUFDdEMsQ0FBQztBQUVEO0lBQUE7UUFFWSxpQkFBWSxHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksRUFBYyxDQUFDO0lBK0JqRSxDQUFDO0lBNUJVLFFBQVEsQ0FBQyxTQUFvQjtRQUNoQyxJQUFJLENBQUMsU0FBUyxHQUFHLFNBQVMsQ0FBQztJQUMvQixDQUFDO0lBRU0sMEJBQTBCLENBQUMsR0FBZTtRQUM3QyxJQUFJLElBQUksR0FBRztnQ0FDYSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVE7Z0JBQ3ZDLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxTQUFTO2dCQUM1RixTQUFHLENBQUMsV0FBVztTQUN0QixJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFDLFFBQVEsQ0FBQztRQUNsRCxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ1gsU0FBRyxDQUFDLEdBQUcsQ0FBQywwQkFBMEIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFBO1FBQ25ELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRU0sTUFBTSxDQUFDLEdBQWU7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFhO1FBQzlCLE1BQU0sQ0FBQztzQkFDTyxLQUFLO3dCQUNILENBQUM7SUFDckIsQ0FBQztBQUNMLENBQUM7QUFqQ1ksNEJBQW9CLHVCQWlDaEMsQ0FBQTtBQUVELDZGQUE2RjtBQUM3RixrREFBa0Q7QUFDbEQsU0FBUztBQUNULGdDQUFnQztBQUNoQyx1REFBdUQ7QUFDdkQsc0RBQXNEO0FBQ3RELDJDQUEyQztBQUMzQyxVQUFVO0FBQ1YsbURBQW1EO0FBQ25ELE9BQU87QUFDUCxnRkFBZ0Y7QUFDaEYsT0FBTztBQUNQLG1DQUFtQztBQUNuQyxPQUFPO0FBQ1Asc0ZBQXNGO0FBQ3RGLE9BQU87QUFDUCw4REFBOEQifQ==