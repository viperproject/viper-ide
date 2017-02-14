"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const Helper_1 = require('./Helper');
const viz = require('viz.js');
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
            if (Helper_1.Helper.getConfiguration("advancedFeatures").compareStates === true) {
                previousState = "Reference State";
                currentState = "Error State";
            }
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
        let currentHeap = "";
        let oldHeap = "";
        let partialExecutionTree = "";
        //use viz.js
        currentHeap = this.generateSvg(heapGraph.heap);
        if (Helper_1.Helper.getConfiguration("advancedFeatures").showOldState === true) {
            oldHeap = `<h3>Old Heap</h3>
    ${this.generateSvg(heapGraph.oldHeap)}`;
        }
        if (Helper_1.Helper.getConfiguration("advancedFeatures").showPartialExecutionTree === true) {
            partialExecutionTree = `<h3>Partial Execution Tree</h3>
    ${this.generateSvg(heapGraph.partialExecutionTree)}`;
        }
        //use graphviz
        //         currentHeap = this.getSvgContent(Log.svgFilePath(index, false));
        //         if (Helper.getConfiguration("advancedFeatures").showOldState === true) {
        //             oldHeap = `<h3>Old Heap</h3>
        // ${this.getSvgContent(Log.svgFilePath(index, true))}`;
        //         }
        //         if (Helper.getConfiguration("advancedFeatures").showPartialExecutionTree === true) {
        //             partialExecutionTree = `<h3>Partial Execution Tree</h3>
        // ${this.getSvgContent(Log.getPartialExecutionTreeSvgPath(index))}`;
        //         }
        let state = this.stateVisualizer.decorationOptions[heapGraph.state];
        let debugInfo = `<p>${this.stringToHtml(heapGraph.stateInfos)}</p>`;
        let content = `
    <h2>${heapGraph.fileName}<br />${heapGraph.methodType}: ${heapGraph.methodName}<br />${state.hoverMessage}</h2>
    <h3${state.isErrorState ? ' class="ErrorState">Errorstate' : ">State"} ${state.numberToDisplay}</h3>
    ${currentHeap}
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
    generateSvg(data) {
        try {
            let result = viz(data, { format: "svg", engine: "dot" });
            if (!result) {
                Log_1.Log.error("cannot generate svg from data");
                return "";
            }
            return result;
        }
        catch (e) {
            Log_1.Log.error("error generating svg from data: " + e);
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0hlYXBQcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUEsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsc0JBQW9CLE9BQU8sQ0FBQyxDQUFBO0FBQzVCLGdDQUFpRCxpQkFBaUIsQ0FBQyxDQUFBO0FBRW5FLE1BQVksRUFBRSxXQUFNLElBQUksQ0FBQyxDQUFBO0FBQ3pCLHlCQUF1QixVQUFVLENBQUMsQ0FBQTtBQUNsQyxNQUFZLEdBQUcsV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUU5QjtJQUFBO1FBRVksaUJBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxZQUFZLEVBQWMsQ0FBQztJQXFNakUsQ0FBQztJQWpNVSxhQUFhO1FBQ2hCLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQztJQUNsQyxDQUFDO0lBQ00sUUFBUSxDQUFDLFNBQW9CLEVBQUUsS0FBYTtRQUMvQyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLFNBQVMsQ0FBQztJQUN2QyxDQUFDO0lBRU0sY0FBYztRQUNqQixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUNuRSxDQUFDO0lBRU0sZUFBZTtRQUNsQixNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQy9ELENBQUM7SUFFTSxVQUFVO1FBQ2IsSUFBSSxDQUFDLFVBQVUsR0FBRyxFQUFFLENBQUM7SUFDekIsQ0FBQztJQUlNLDBCQUEwQixDQUFDLEdBQWU7UUFDN0MsSUFBSSxhQUFhLEdBQUcsZ0JBQWdCLENBQUM7UUFDckMsSUFBSSxZQUFZLEdBQUcsZUFBZSxDQUFDO1FBQ25DLEVBQUUsQ0FBQyxDQUFDLGVBQU0s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