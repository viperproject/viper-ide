"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const StateVisualizer_1 = require('./StateVisualizer');
class HeapProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    setState(heapGraph, index) {
        this.heapGraphs[index] = heapGraph;
    }
    resetState() {
        this.heapGraphs = [];
    }
    provideTextDocumentContent(uri) {
        let table;
        if (this.heapGraphs.length > 1) {
            table = ` <table>
  <tr><td>
   <h1 style="color:${ViperProtocol_1.StateColors.currentState}">Current</h1>
   ${this.heapGraphToContent(1 - StateVisualizer_1.StateVisualizer.nextHeapIndex, StateVisualizer_1.StateVisualizer.nextHeapIndex)}
  </td><td>
   <h1 style="color:${ViperProtocol_1.StateColors.previousState}">Previous</h1>
   ${this.heapGraphToContent(StateVisualizer_1.StateVisualizer.nextHeapIndex, 1 - StateVisualizer_1.StateVisualizer.nextHeapIndex)}
  </td></tr>
 </table>`;
        }
        else if (this.heapGraphs.length == 1) {
            table = ` <h1 style="color:${ViperProtocol_1.StateColors.currentState}">Current</h1>${this.heapGraphToContent(0)}`;
        }
        else {
            table = " <p>No graph to show</p>";
        }
        return `<body>
 ${table}
 <p>${this.stringToHtml(StateVisualizer_1.StateVisualizer.globalInfo)}</p>
 <a href='${uri}'>view source</a>
</body>`;
    }
    heapGraphToContent(index, otherIndex) {
        let heapGraph = this.heapGraphs[index];
        if (!heapGraph) {
            Log_1.Log.error("invalid index for heapGraphToContent: " + index);
            return;
        }
        let compareToOther = typeof otherIndex !== 'undefined';
        let otherHeapGraph;
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
            conditions = `<h3>Path condition</h3>
    <table border="solid">${conditions}
    </table>`;
        }
        else {
            conditions = `<h3>No path condition</h3>`;
        }
        let content = `
    <h2>Showing heap for ${heapGraph.methodType} ${heapGraph.methodName} in file ${heapGraph.fileName}</h2>
    <h3>State ${heapGraph.state - heapGraph.methodOffset} at ${heapGraph.position.line + 1}:${heapGraph.position.character + 1} </h3>
    <img src="${Log_1.Log.svgFilePath(index)}"></img><br />
    ${conditions}
    <p>${this.stringToHtml(heapGraph.stateInfos)}</p><br />`;
        return content;
    }
    get onDidChange() {
        Log_1.Log.log("PreviewHTML: onDidChange", ViperProtocol_1.LogLevel.Debug);
        return this._onDidChange.event;
    }
    update(uri) {
        this._onDidChange.fire(uri);
    }
    errorSnippet(error) {
        return `<body>\n\t${error}\n</body>`;
    }
    stringToHtml(s) {
        return s.replace(/\n/g, "<br />\n    ").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGV4dERvY3VtZW50Q29udGVudFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1RleHREb2N1bWVudENvbnRlbnRQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLGdDQUF5RCxpQkFBaUIsQ0FBQyxDQUFBO0FBQzNFLGtDQUE4QixtQkFBbUIsQ0FBQyxDQUFBO0FBRWxEO0lBQUE7UUFFWSxpQkFBWSxHQUFHLElBQUksTUFBTSxDQUFDLFlBQVksRUFBYyxDQUFDO0lBd0ZqRSxDQUFDO0lBckZVLFFBQVEsQ0FBQyxTQUFvQixFQUFFLEtBQWE7UUFDL0MsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxTQUFTLENBQUM7SUFDdkMsQ0FBQztJQUVNLFVBQVU7UUFDYixJQUFJLENBQUMsVUFBVSxHQUFHLEVBQUUsQ0FBQztJQUN6QixDQUFDO0lBRU0sMEJBQTBCLENBQUMsR0FBZTtRQUM3QyxJQUFJLEtBQWEsQ0FBQztRQUNsQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdCLEtBQUssR0FBRzs7c0JBRUUsMkJBQVcsQ0FBQyxZQUFZO0tBQ3pDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLEdBQUcsaUNBQWUsQ0FBQyxhQUFhLEVBQUMsaUNBQWUsQ0FBQyxhQUFhLENBQUM7O3NCQUV2RSwyQkFBVyxDQUFDLGFBQWE7S0FDMUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGlDQUFlLENBQUMsYUFBYSxFQUFDLENBQUMsR0FBRyxpQ0FBZSxDQUFDLGFBQWEsQ0FBQzs7VUFFbkYsQ0FBQztRQUNILENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyQyxLQUFLLEdBQUcscUJBQXFCLDJCQUFXLENBQUMsWUFBWSxpQkFBaUIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDdkcsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osS0FBSyxHQUFHLDBCQUEwQixDQUFDO1FBQ3ZDLENBQUM7UUFFRCxNQUFNLENBQUM7R0FDWixLQUFLO01BQ0YsSUFBSSxDQUFDLFlBQVksQ0FBQyxpQ0FBZSxDQUFDLFVBQVUsQ0FBQztZQUN2QyxHQUFHO1FBQ1AsQ0FBQztJQUNMLENBQUM7SUFFTyxrQkFBa0IsQ0FBQyxLQUFhLEVBQUUsVUFBbUI7UUFDekQsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDYixTQUFHLENBQUMsS0FBSyxDQUFDLHdDQUF3QyxHQUFHLEtBQUssQ0FBQyxDQUFDO1lBQzVELE1BQU0sQ0FBQztRQUNYLENBQUM7UUFFRCxJQUFJLGNBQWMsR0FBWSxPQUFPLFVBQVUsS0FBSyxXQUFXLENBQUM7UUFDaEUsSUFBSSxjQUF5QixDQUFDO1FBQzlCLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDakIsY0FBYyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDakQsQ0FBQztRQUVELElBQUksVUFBVSxHQUFHLEVBQUUsQ0FBQztRQUNwQixFQUFFLENBQUMsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xDLFNBQVMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLE9BQU87Z0JBQ2hDLDBEQUEwRDtnQkFDMUQsSUFBSSxLQUFLLEdBQUcsY0FBYyxJQUFJLGNBQWMsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDN0UsVUFBVSxJQUFJLGdCQUFnQixLQUFLLEdBQUMsS0FBSyxHQUFDLEVBQUUsR0FBRyxPQUFPLEdBQUcsS0FBSyxHQUFDLE1BQU0sR0FBQyxFQUFFLGNBQWMsQ0FBQztZQUMzRixDQUFDLENBQUMsQ0FBQztZQUNILFVBQVUsR0FBRzs0QkFDRyxVQUFVO2FBQ3pCLENBQUE7UUFDTCxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixVQUFVLEdBQUcsNEJBQTRCLENBQUM7UUFDOUMsQ0FBQztRQUVELElBQUksT0FBTyxHQUFHOzJCQUNLLFNBQVMsQ0FBQyxVQUFVLElBQUksU0FBUyxDQUFDLFVBQVUsWUFBWSxTQUFTLENBQUMsUUFBUTtnQkFDckYsU0FBUyxDQUFDLEtBQUssR0FBRyxTQUFTLENBQUMsWUFBWSxPQUFPLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsSUFBSSxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsR0FBRyxDQUFDO2dCQUM5RyxTQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQztNQUNoQyxVQUFVO1NBQ1AsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQztRQUNyRCxNQUFNLENBQUMsT0FBTyxDQUFDO0lBQ25CLENBQUM7SUFFRCxJQUFJLFdBQVc7UUFDWCxTQUFHLENBQUMsR0FBRyxDQUFDLDBCQUEwQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDbkQsTUFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDO0lBQ25DLENBQUM7SUFFTSxNQUFNLENBQUMsR0FBZTtRQUN6QixJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNoQyxDQUFDO0lBRU8sWUFBWSxDQUFDLEtBQWE7UUFDOUIsTUFBTSxDQUFDLGFBQWEsS0FBSyxXQUFXLENBQUM7SUFDekMsQ0FBQztJQUVPLFlBQVksQ0FBQyxDQUFTO1FBQzFCLE1BQU0sQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxjQUFjLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLDBCQUEwQixDQUFDLENBQUM7SUFDdkYsQ0FBQztBQUNMLENBQUM7QUExRlksb0JBQVksZUEwRnhCLENBQUE7QUFFRCw2RkFBNkY7QUFDN0Ysa0RBQWtEO0FBQ2xELFNBQVM7QUFDVCxnQ0FBZ0M7QUFDaEMsdURBQXVEO0FBQ3ZELHNEQUFzRDtBQUN0RCwyQ0FBMkM7QUFDM0MsVUFBVTtBQUNWLG1EQUFtRDtBQUNuRCxPQUFPO0FBQ1AsZ0ZBQWdGO0FBQ2hGLE9BQU87QUFDUCxtQ0FBbUM7QUFDbkMsT0FBTztBQUNQLHNGQUFzRjtBQUN0RixPQUFPO0FBQ1AsOERBQThEIn0=