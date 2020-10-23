/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as viz from 'viz.js';
import { Log } from './Log';
import { HeapGraph, LogLevel, StateColors } from './ViperProtocol';
import { StateVisualizer } from './StateVisualizer';
import { Helper } from './Helper';

export class HeapProvider implements vscode.TextDocumentContentProvider {

    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();

    private heapGraphs: HeapGraph[];

    public nofHeapGraphs(): number {
        return this.heapGraphs.length;
    }
    public setState(heapGraph: HeapGraph, index: number) {
        this.heapGraphs[index] = heapGraph;
    }

    public getCurrentHeap(): HeapGraph {
        return this.heapGraphs[1 - this.stateVisualizer.nextHeapIndex];
    }

    public getPreviousHeap(): HeapGraph {
        return this.heapGraphs[this.stateVisualizer.nextHeapIndex];
    }

    public resetState() {
        this.heapGraphs = [];
    }

    stateVisualizer: StateVisualizer;

    public provideTextDocumentContent(uri: vscode.Uri): string {
        let previousState = "Previous State";
        let currentState = "Current State";
        if (Helper.getConfiguration("advancedFeatures").simpleMode === true) {
            if (Helper.getConfiguration("advancedFeatures").compareStates === true) {
                previousState = "Reference State";
                currentState = "Error State";
            }
        }

        let table: string;
        let darkGraphs = <boolean>Helper.getConfiguration("advancedFeatures").darkGraphs === true;
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
        } else if (this.heapGraphs.length == 1) {
            table = ` <h1 class="Hcurr">${currentState}</h1>${this.heapGraphToContent(0)}`;
        } else {
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
     color:${StateColors.currentState(darkGraphs)}
 }
 .Hprev {
     color:${StateColors.previousState(darkGraphs)}
 }
 .ErrorState {
     color:red
 }
</style>
</head>
<body>
 ${table}
 ${Log.logLevel >= LogLevel.Debug ? debugInfo : ""}
</body>
</html>`;
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

        let currentHeap = "";
        let oldHeap = "";
        let partialExecutionTree = "";

        //use viz.js
        currentHeap = this.generateSvg(heapGraph.heap);
        if (Helper.getConfiguration("advancedFeatures").showOldState === true) {
            oldHeap = `<h3>Old Heap</h3>
    ${this.generateSvg(heapGraph.oldHeap)}`;
        }
        if (Helper.getConfiguration("advancedFeatures").showPartialExecutionTree === true) {
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
    ${Log.logLevel >= LogLevel.Debug ? debugInfo : ""}<br />
    `;

        return content;
    }

    //position: ${heapGraph.position.line + 1}:${heapGraph.position.character + 1}

    //<img src="${Log.svgFilePath(index)}"></img><br />

    private getSvgContent(filePath: string): string {
        let content = fs.readFileSync(filePath).toString();
        return content.substring(content.indexOf("<svg"), content.length);
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

    private generateSvg(data: string): string {
        try {
            let result = viz(data, { format: "svg", engine: "dot" });
            if (!result) {
                Log.error("cannot generate svg from data");
                return "";
            }
            return result;
        } catch (e) {
            Log.error("error generating svg from data: " + e);
        }
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