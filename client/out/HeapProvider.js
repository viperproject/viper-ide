"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const Helper_1 = require('./Helper');
class HeapProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
    }
    nofHeapGraphs() {
        return this.heapGraphs.length;
    }
    setState(heapGraph, index) {
        this.heapGraphs[index] = heapGraph;
    }
    getCurrentHeap() {
        return this.heapGraphs[1 - this.stateVisualizer.nextHeapIndex];
    }
    getPreviousHeap() {
        return this.heapGraphs[this.stateVisualizer.nextHeapIndex];
    }
    resetState() {
        this.heapGraphs = [];
    }
    provideTextDocumentContent(uri) {
        let previousState = "Previous State";
        let currentState = "Current State";
        if (Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true) {
            previousState = "Reference State";
            currentState = "Error State";
        }
        let table;
        let darkGraphs = Helper_1.Helper.getConfiguration("advancedFeatures").darkGraphs === true;
        if (this.heapGraphs.length > 1) {
            table = ` <table style="width:100%">
  <colgroup>
   <col style="width: 50%" />
   <col style="width: 50%" />
  </colgroup>
  <tr><td>
   <h1 class="Hprev">${previousState}</h1>
   ${this.heapGraphToContent(this.stateVisualizer.nextHeapIndex, 1 - this.stateVisualizer.nextHeapIndex)}
  </td><td>
   <h1 class="Hcurr">${currentState}</h1>
   ${this.heapGraphToContent(1 - this.stateVisualizer.nextHeapIndex, this.stateVisualizer.nextHeapIndex)}
  </td></tr>
 </table>`;
        }
        else if (this.heapGraphs.length == 1) {
            table = ` <h1 class="Hcurr">${currentState}</h1>${this.heapGraphToContent(0)}`;
        }
        else {
            table = " <p>No graph to show</p>";
        }
        let debugInfo = `<p><font face="courier">${this.stringToHtml(this.stateVisualizer.globalInfo)}</font></p>
 <a href='${uri}'>view source</a>`;
        return `<!DOCTYPE html>
<html lang="en"><head>
<style>
 table td, table td * {
  vertical-align: top;
 }
 svg {
     width:100%;
     height:auto;
     max-height: 500px;
 }
 .Hcurr {
     color:${ViperProtocol_1.StateColors.currentState(darkGraphs)}
 }
 .Hprev {
     color:${ViperProtocol_1.StateColors.previousState(darkGraphs)}
 }
 .ErrorState {
     color:red
 }
</style>
</head>
<body>
 ${table}
 ${Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? debugInfo : ""}
</body>
</html>`;
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
            conditions = `<h3>Path conditions</h3>
    <table border="solid">${conditions}
    </table>`;
        }
        else {
            conditions = `<h3>No path conditions</h3>`;
        }
        let oldHeap = Helper_1.Helper.getConfiguration("advancedFeatures").showOldState === true ? `<h3>Old Heap</h3>
    ${this.getSvgContent(Log_1.Log.svgFilePath(index, true))}` : "";
        let partialExecutionTree = Helper_1.Helper.getConfiguration("advancedFeatures").showPartialExecutionTree === true ? `<h3>Partial Execution Tree</h3>
    ${this.getSvgContent(Log_1.Log.getPartialExecutionTreeSvgPath(index))}` : "";
        let state = this.stateVisualizer.decorationOptions[heapGraph.state];
        let debugInfo = `<p>${this.stringToHtml(heapGraph.stateInfos)}</p>`;
        let content = `
    <h2>${heapGraph.fileName}<br />${heapGraph.methodType}: ${heapGraph.methodName}<br />${state.hoverMessage}</h2>
    <h3${state.isErrorState ? ' class="ErrorState">Errorstate' : ">State"} ${state.numberToDisplay}</h3>
    ${this.getSvgContent(Log_1.Log.svgFilePath(index, false))}
    ${conditions}
    ${oldHeap}
    ${partialExecutionTree}
    ${Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? debugInfo : ""}<br />
    `;
        return content;
    }
    //position: ${heapGraph.position.line + 1}:${heapGraph.position.character + 1}
    //<img src="${Log.svgFilePath(index)}"></img><br />
    getSvgContent(filePath) {
        let content = fs.readFileSync(filePath).toString();
        return content.substring(content.indexOf("<svg"), content.length);
    }
    get onDidChange() {
        //Log.log("PreviewHTML: onDidChange", LogLevel.Debug)
        return this._onDidChange.event;
    }
    update(uri) {
        this._onDidChange.fire(uri);
    }
    errorSnippet(error) {
        return `<body>\n\t${error}\n</body>`;
    }
    stringToHtml(s) {
        return s.replace(/\n/g, "<br />\n    ").replace(/\t/g, "&nbsp;");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0hlYXBQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBQzFCLGdDQUErQyxpQkFBaUIsQ0FBQyxDQUFBO0FBRWpFLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLHlCQUFxQixVQUFVLENBQUMsQ0FBQTtBQUVoQztJQUFBO1FBRVksaUJBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQWMsQ0FBQztJQThKakUsQ0FBQztJQTFKVSxhQUFhO1FBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztJQUNsQyxDQUFDO0lBQ00sUUFBUSxDQUFDLFNBQW9CLEVBQUUsS0FBYTtRQUMvQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsQ0FBQztJQUN2QyxDQUFDO0lBRU0sY0FBYztRQUNqQixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU0sZUFBZTtRQUNsQixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFTSxVQUFVO1FBQ2IsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7SUFDekIsQ0FBQztJQUlNLDBCQUEwQixDQUFDLEdBQWU7UUFDN0MsSUFBSSxhQUFhLEdBQUcsZ0JBQWdCLENBQUM7UUFDckMsSUFBSSxZQUFZLEdBQUcsZUFBZSxDQUFDO1FBQ25DLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2xFLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQztZQUNsQyxZQUFZLEdBQUcsYUFBYSxDQUFDO1FBQ2pDLENBQUM7UUFFRCxJQUFJLEtBQWEsQ0FBQztRQUNsQixJQUFJLFVBQVUsR0FBWSxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxDQUFDO1FBQzFGLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0IsS0FBSyxHQUFHOzs7Ozs7dUJBTUcsYUFBYTtLQUMvQixJQUFJLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDOzt1QkFFakYsWUFBWTtLQUM5QixJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsYUFBYSxDQUFDOztVQUU5RixDQUFDO1FBQ0gsQ0FBQztRQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLEtBQUssR0FBRyxzQkFBc0IsWUFBWSxRQUFRLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ25GLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLEtBQUssR0FBRywwQkFBMEIsQ0FBQztRQUN2QyxDQUFDO1FBRUQsSUFBSSxTQUFTLEdBQUcsMkJBQTJCLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLGVBQWUsQ0FBQyxVQUFVLENBQUM7WUFDekYsR0FBRyxtQkFBbUIsQ0FBQztRQUUzQixNQUFNLENBQUM7Ozs7Ozs7Ozs7OzthQVlGLDJCQUFXLENBQUMsWUFBWSxDQUFDLFVBQVUsQ0FBQzs7O2FBR3BDLDJCQUFXLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQzs7Ozs7Ozs7R0FRL0MsS0FBSztHQUNMLFNBQUcsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLEdBQUcsU0FBUyxHQUFHLEVBQUU7O1FBRTFDLENBQUM7SUFDTCxDQUFDO0lBRU8sa0JBQWtCLENBQUMsS0FBYSxFQUFFLFVBQW1CO1FBQ3pELElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDdkMsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1lBQ2IsU0FBRyxDQUFDLEtBQUssQ0FBQyx3Q0FBd0MsR0FBRyxLQUFLLENBQUMsQ0FBQztZQUM1RCxNQUFNLENBQUM7UUFDWCxDQUFDO1FBRUQsSUFBSSxjQUFjLEdBQVksT0FBTyxVQUFVLEtBQUssV0FBVyxDQUFDO1FBQ2hFLElBQUksY0FBeUIsQ0FBQztRQUM5QixFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1lBQ2pCLGNBQWMsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2pELENBQUM7UUFFRCxJQUFJLFVBQVUsR0FBRyxFQUFFLENBQUM7UUFDcEIsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsQyxTQUFTLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxPQUFPO2dCQUNoQywwREFBMEQ7Z0JBQzFELElBQUksS0FBSyxHQUFHLGNBQWMsSUFBSSxjQUFjLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQzdFLFVBQVUsSUFBSSxnQkFBZ0IsS0FBSyxHQUFHLEtBQUssR0FBRyxFQUFFLEdBQUcsT0FBTyxHQUFHLEtBQUssR0FBRyxNQUFNLEdBQUcsRUFBRSxjQUFjLENBQUM7WUFDbkcsQ0FBQyxDQUFDLENBQUM7WUFDSCxVQUFVLEdBQUc7NEJBQ0csVUFBVTthQUN6QixDQUFBO1FBQ0wsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osVUFBVSxHQUFHLDZCQUE2QixDQUFDO1FBQy9DLENBQUM7UUFFRCxJQUFJLE9BQU8sR0FBRyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxZQUFZLEtBQUssSUFBSSxHQUFHO01BQ3BGLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUN0RCxJQUFJLG9CQUFvQixHQUFHLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLHdCQUF3QixLQUFLLElBQUksR0FBRztNQUM3RyxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQUcsQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDO1FBRW5FLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLElBQUksU0FBUyxHQUFHLE1BQU0sSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztRQUNwRSxJQUFJLE9BQU8sR0FBRztVQUNaLFNBQVMsQ0FBQyxRQUFRLFNBQVMsU0FBUyxDQUFDLFVBQVUsS0FBSyxTQUFTLENBQUMsVUFBVSxTQUFTLEtBQUssQ0FBQyxZQUFZO1NBQ3BHLEtBQUssQ0FBQyxZQUFZLEdBQUcsZ0NBQWdDLEdBQUcsUUFBUSxJQUFJLEtBQUssQ0FBQyxlQUFlO01BQzVGLElBQUksQ0FBQyxhQUFhLENBQUMsU0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7TUFDakQsVUFBVTtNQUNWLE9BQU87TUFDUCxvQkFBb0I7TUFDcEIsU0FBRyxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssR0FBRyxTQUFTLEdBQUcsRUFBRTtLQUNoRCxDQUFDO1FBQ0UsTUFBTSxDQUFDLE9BQU8sQ0FBQztJQUNuQixDQUFDO0lBRUQsOEVBQThFO0lBRTlFLG1EQUFtRDtJQUUzQyxhQUFhLENBQUMsUUFBZ0I7UUFDbEMsSUFBSSxPQUFPLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNuRCxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztJQUN0RSxDQUFDO0lBRUQsSUFBSSxXQUFXO1FBQ1gscURBQXFEO1FBQ3JELE1BQU0sQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEtBQUssQ0FBQztJQUNuQyxDQUFDO0lBRU0sTUFBTSxDQUFDLEdBQWU7UUFDekIsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUFhO1FBQzlCLE1BQU0sQ0FBQyxhQUFhLEtBQUssV0FBVyxDQUFDO0lBQ3pDLENBQUM7SUFFTyxZQUFZLENBQUMsQ0FBUztRQUMxQixNQUFNLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsY0FBYyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztJQUNyRSxDQUFDO0FBQ0wsQ0FBQztBQWhLWSxvQkFBWSxlQWdLeEIsQ0FBQTtBQUVELDZGQUE2RjtBQUM3RixrREFBa0Q7QUFDbEQsU0FBUztBQUNULGdDQUFnQztBQUNoQyx1REFBdUQ7QUFDdkQsc0RBQXNEO0FBQ3RELDJDQUEyQztBQUMzQyxVQUFVO0FBQ1YsbURBQW1EO0FBQ25ELE9BQU87QUFDUCxnRkFBZ0Y7QUFDaEYsT0FBTztBQUNQLG1DQUFtQztBQUNuQyxPQUFPO0FBQ1Asc0ZBQXNGO0FBQ3RGLE9BQU87QUFDUCw4REFBOEQifQ==