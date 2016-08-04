'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const child_process = require('child_process');
const TextDocumentContentProvider_1 = require('./TextDocumentContentProvider');
const vscode = require('vscode');
const Helper_1 = require('./Helper');
const ExtensionState_1 = require('./ExtensionState');
class StateVisualizer {
    static initialize() {
        this.registerTextDocumentProvider();
    }
    static registerTextDocumentProvider() {
        this.provider = new TextDocumentContentProvider_1.HeapProvider();
        let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', this.provider);
    }
    static storeNewStates(params) {
        Log_1.Log.log("Store new States", ViperProtocol_1.LogLevel.Debug);
        this.previousState = -1;
        this.decorationOptions = params.decorations.decorationOptions;
        this.stepInfo = params.decorations.stepInfo;
        this.methodBorders = params.decorations.methodBorders;
        this.globalInfo = params.decorations.globalInfo;
        vscode.window.visibleTextEditors.forEach(editor => {
            if (!editor.document || !params) {
                Log_1.Log.error("invalid arguments for storeNewStates");
            }
            if (editor.document.uri.toString() === params.uri) {
                this.textEditorUnderVerification = editor;
            }
        });
        Log_1.Log.deleteDotFiles();
        this.showDecorations();
    }
    static createAndShowHeap(heapGraph, index) {
        if (!heapGraph.heap) {
            Log_1.Log.error("Error creating heap description");
            return;
        }
        Log_1.Log.writeToDotFile(heapGraph.heap, index);
        //Log.log(graphDescription, LogLevel.Debug);
        this.selectState(heapGraph.fileUri, heapGraph.state, heapGraph.position);
        let dotExecutable = Helper_1.Helper.getConfiguration("dotExecutable");
        if (!dotExecutable || !fs.existsSync(dotExecutable)) {
            Log_1.Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
            return;
        }
        //convert dot to svg
        this.graphvizProcess = child_process.exec(`${dotExecutable} -Tsvg "${Log_1.Log.dotFilePath(index)}" -o "${Log_1.Log.svgFilePath(index)}"`);
        this.graphvizProcess.on('exit', code => {
            //show svg
            if (code != 0) {
                Log_1.Log.error("Could not convert graph description to svg, exit code: " + code, ViperProtocol_1.LogLevel.Debug);
            }
            Log_1.Log.log("Graph converted to heap.svg", ViperProtocol_1.LogLevel.Debug);
            this.showHeapGraph(heapGraph, index);
        });
        this.graphvizProcess.stdout.on('data', data => {
            Log_1.Log.log("[Graphviz] " + data, ViperProtocol_1.LogLevel.Debug);
        });
        this.graphvizProcess.stderr.on('data', data => {
            Log_1.Log.log("[Graphviz stderr] " + data, ViperProtocol_1.LogLevel.Debug);
        });
    }
    static showHeapGraph(heapGraph, index) {
        this.provider.setState(heapGraph, index);
        let dotFileShown = false;
        let heapShown = false;
        vscode.workspace.textDocuments.forEach(element => {
            if (element.fileName === Log_1.Log.dotFilePath(index)) {
                dotFileShown = true;
            }
            if (element.uri.toString() == this.previewUri.toString()) {
                heapShown = true;
            }
        });
        if (!dotFileShown) {
            //Log.log("Show dotFile", LogLevel.Debug);
            Helper_1.Helper.showFile(Log_1.Log.dotFilePath(index), vscode.ViewColumn.Two);
        }
        this.provider.update(this.previewUri);
        if (!heapShown) {
            //Log.log("Show heap graph", LogLevel.Debug);
            vscode.commands.executeCommand('vscode.previewHtml', this.previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
                Log_1.Log.error("HTML Preview error: " + reason);
            });
        }
    }
    static selectState(uri, selectedState, pos) {
        if (this.showStates && Helper_1.Helper.isViperSourceFile(uri) && this.decorationOptions) {
            //state should be visualized
            if (selectedState >= 0 && selectedState < this.stepInfo.length) {
                //its in range
                this.shownState = selectedState;
                this.debuggedUri = uri;
                this.selectedPosition = pos;
                this.currentDepth = this.stepInfo[selectedState].depth;
                let currentMethodIdx = this.stepInfo[selectedState].methodIndex;
                this.debuggedMethodName = this.methodBorders[currentMethodIdx].methodName.replace(/-/g, "").trim();
                //color labels
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    let option = this.decorationOptions[i];
                    let errorStateFound = false;
                    option.renderOptions.before.contentText = this.getLabel(option, currentMethodIdx);
                    //default is grey
                    option.renderOptions.before.color = ViperProtocol_1.StateColors.uninterestingState;
                    for (var j = 0; j < option.states.length; j++) {
                        var optionState = option.states[j];
                        if (optionState == selectedState) {
                            //if it's the current step -> red
                            option.renderOptions.before.color = ViperProtocol_1.StateColors.currentState;
                            break;
                        }
                        if (optionState == this.previousState) {
                            option.renderOptions.before.color = ViperProtocol_1.StateColors.previousState;
                            break;
                        }
                        else if (this.stepInfo[optionState].isErrorState && this.stepInfo[optionState].methodIndex === currentMethodIdx) {
                            option.renderOptions.before.color = ViperProtocol_1.StateColors.errorState;
                            errorStateFound = true;
                        }
                        else if (optionState > selectedState && !errorStateFound &&
                            this.stepInfo[optionState].depth <= this.stepInfo[selectedState].depth &&
                            this.stepInfo[optionState].methodIndex === currentMethodIdx) {
                            option.renderOptions.before.color = ViperProtocol_1.StateColors.interestingState;
                        }
                    }
                }
                if (this.showStates) {
                    this.showDecorations();
                }
                this.previousState = selectedState;
            }
        }
    }
    static getLabel(decoration, methodIndex) {
        let label = "";
        let methodBorder = this.methodBorders[methodIndex];
        this.currentOffset = methodBorder.firstStateIndex - 1;
        decoration.states.forEach(element => {
            if (element >= methodBorder.firstStateIndex && element <= methodBorder.lastStateIndex) {
                label += "," + (element - this.currentOffset);
            }
        });
        if (label.length == 0) {
            return "⚫";
        }
        else {
            return `(${label.substring(1, label.length)})⚫`;
        }
    }
    static showStateSelection(uri, pos) {
        if (this.showStates && Helper_1.Helper.isViperSourceFile(uri) && this.decorationOptions) {
            //is counter example state?
            for (let i = 0; i < this.decorationOptions.length; i++) {
                let option = this.decorationOptions[i];
                let a = option.range.start;
                if (a.line == pos.line && a.character == pos.character) {
                    if (!this.selectedPosition || this.selectedPosition.line != pos.line || this.selectedPosition.character != pos.character || uri != this.debuggedUri) {
                        this.shownState = this.decorationOptions[i].states[0];
                        this.selectedPosition = pos;
                        this.debuggedUri = uri;
                        Log_1.Log.log("Request showing the heap of state " + this.shownState);
                        ExtensionState_1.ExtensionState.instance.client.sendRequest(ViperProtocol_1.Commands.ShowHeap, {
                            uri: uri,
                            index: this.shownState
                        });
                    }
                    else {
                    }
                }
            }
        }
    }
    static hideDecorations() {
        if (this.decoration)
            this.decoration.dispose();
    }
    static showDecorations() {
        //Log.log("Show decorations", LogLevel.Debug);
        if (this.showStates && this.decorationOptions) {
            this.hideDecorations();
            this.decoration = vscode.window.createTextEditorDecorationType({});
            if (this.textEditorUnderVerification) {
                this.textEditorUnderVerification.setDecorations(this.decoration, this.decorationOptions);
            }
        }
    }
}
StateVisualizer.previewUri = vscode.Uri.parse('viper-preview:State Visualization');
StateVisualizer.showStates = true;
StateVisualizer.nextHeapIndex = 0;
exports.StateVisualizer = StateVisualizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQWdHLGlCQUFpQixDQUFDLENBQUE7QUFDbEgsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsOENBQTJCLCtCQUErQixDQUFDLENBQUE7QUFDM0QsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBb0JoRDtJQXlCSSxPQUFjLFVBQVU7UUFDcEIsSUFBSSxDQUFDLDRCQUE0QixFQUFFLENBQUM7SUFDeEMsQ0FBQztJQUVELE9BQU8sNEJBQTRCO1FBQy9CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSwwQ0FBWSxFQUFFLENBQUM7UUFDbkMsSUFBSSxZQUFZLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxtQ0FBbUMsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzVHLENBQUM7SUFFRCxPQUFPLGNBQWMsQ0FBQyxNQUFvRTtRQUN0RixTQUFHLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQztRQUM5RCxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDO1FBQzVDLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUM7UUFDdEQsSUFBSSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQztRQUNoRCxNQUFNLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxNQUFNO1lBQzNDLEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLFNBQUcsQ0FBQyxLQUFLLENBQUMsc0NBQXNDLENBQUMsQ0FBQztZQUN0RCxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEtBQUssTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2hELElBQUksQ0FBQywyQkFBMkIsR0FBRyxNQUFNLENBQUM7WUFDOUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsU0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO1FBQ3JCLElBQUksQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUMzQixDQUFDO0lBRUQsT0FBYyxpQkFBaUIsQ0FBQyxTQUFvQixFQUFFLEtBQWE7UUFDL0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNsQixTQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7WUFDN0MsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUNELFNBQUcsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMxQyw0Q0FBNEM7UUFFNUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBRXpFLElBQUksYUFBYSxHQUFtQixlQUFNLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUM7UUFDN0UsRUFBRSxDQUFDLENBQUMsQ0FBQyxhQUFhLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsRCxTQUFHLENBQUMsSUFBSSxDQUFDLHVEQUF1RCxHQUFHLGFBQWEsQ0FBQyxDQUFDO1lBQ2xGLE1BQU0sQ0FBQztRQUNYLENBQUM7UUFDRCxvQkFBb0I7UUFDcEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsYUFBYSxXQUFXLFNBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLFNBQVMsU0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDL0gsSUFBSSxDQUFDLGVBQWUsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLElBQUk7WUFDaEMsVUFBVTtZQUNWLEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNaLFNBQUcsQ0FBQyxLQUFLLENBQUMseURBQXlELEdBQUcsSUFBSSxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDaEcsQ0FBQztZQUNELFNBQUcsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsSUFBSTtZQUN2QyxTQUFHLENBQUMsR0FBRyxDQUFDLGFBQWEsR0FBRyxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsSUFBSTtZQUN2QyxTQUFHLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLElBQUksRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3pELENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELE9BQWUsYUFBYSxDQUFDLFNBQW9CLEVBQUUsS0FBYTtRQUM1RCxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDekMsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztRQUN0QixNQUFNLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsT0FBTztZQUMxQyxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsUUFBUSxLQUFLLFNBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM5QyxZQUFZLEdBQUcsSUFBSSxDQUFDO1lBQ3hCLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLElBQUksQ0FBQyxVQUFVLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDO2dCQUN2RCxTQUFTLEdBQUcsSUFBSSxDQUFDO1lBQ3JCLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILEVBQUUsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztZQUNoQiwwQ0FBMEM7WUFDMUMsZUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDbkUsQ0FBQztRQUNELElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDYiw2Q0FBNkM7WUFDN0MsTUFBTSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sT0FBTyxDQUFDLEVBQUUsQ0FBQyxNQUFNO2dCQUN2SCxTQUFHLENBQUMsS0FBSyxDQUFDLHNCQUFzQixHQUFHLE1BQU0sQ0FBQyxDQUFDO1lBQy9DLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLFdBQVcsQ0FBQyxHQUFXLEVBQUUsYUFBcUIsRUFBRSxHQUFhO1FBQ2hFLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksZUFBTSxDQUFDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7WUFDN0UsNEJBQTRCO1lBQzVCLEVBQUUsQ0FBQyxDQUFDLGFBQWEsSUFBSSxDQUFDLElBQUksYUFBYSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDN0QsY0FBYztnQkFDZCxJQUFJLENBQUMsVUFBVSxHQUFHLGFBQWEsQ0FBQztnQkFDaEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLENBQUM7Z0JBQ3ZCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxHQUFHLENBQUM7Z0JBQzVCLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQ3ZELElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxXQUFXLENBQUM7Z0JBQ2hFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRW5HLGNBQWM7Z0JBQ2QsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQ3JELElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkMsSUFBSSxlQUFlLEdBQUcsS0FBSyxDQUFDO29CQUM1QixNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztvQkFFbEYsaUJBQWlCO29CQUNqQixNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsMkJBQVcsQ0FBQyxrQkFBa0IsQ0FBQztvQkFDbkUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO3dCQUM1QyxJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNuQyxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksYUFBYSxDQUFDLENBQUMsQ0FBQzs0QkFDL0IsaUNBQWlDOzRCQUNqQyxNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsMkJBQVcsQ0FBQyxZQUFZLENBQUM7NEJBQzdELEtBQUssQ0FBQzt3QkFDVixDQUFDO3dCQUNELEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzs0QkFDcEMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLDJCQUFXLENBQUMsYUFBYSxDQUFDOzRCQUM5RCxLQUFLLENBQUM7d0JBQ1YsQ0FBQzt3QkFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxXQUFXLEtBQUssZ0JBQWdCLENBQUMsQ0FBQyxDQUFDOzRCQUM5RyxNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsMkJBQVcsQ0FBQyxVQUFVLENBQUM7NEJBQzNELGVBQWUsR0FBRyxJQUFJLENBQUM7d0JBQzNCLENBQUM7d0JBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFdBQVcsR0FBRyxhQUFhLElBQUksQ0FBQyxlQUFlOzRCQUNwRCxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUs7NEJBQ3RFLElBQUksQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLENBQUMsV0FBVyxLQUFLLGdCQUFnQixDQUFDLENBQUMsQ0FBQzs0QkFDOUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLDJCQUFXLENBQUMsZ0JBQWdCLENBQUM7d0JBQ3JFLENBQUM7b0JBQ0wsQ0FBQztnQkFDTCxDQUFDO2dCQUNELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO29CQUNsQixJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7Z0JBQzNCLENBQUM7Z0JBRUQsSUFBSSxDQUFDLGFBQWEsR0FBRyxhQUFhLENBQUM7WUFDdkMsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBZSxRQUFRLENBQUMsVUFBK0IsRUFBRSxXQUFtQjtRQUN4RSxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUM7UUFDZixJQUFJLFlBQVksR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ25ELElBQUksQ0FBQyxhQUFhLEdBQUcsWUFBWSxDQUFDLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDdEQsVUFBVSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsT0FBTztZQUM3QixFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksWUFBWSxDQUFDLGVBQWUsSUFBSSxPQUFPLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BGLEtBQUssSUFBSSxHQUFHLEdBQUcsQ0FBQyxPQUFPLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1lBQ2xELENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNwQixNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2YsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUE7UUFDbkQsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLGtCQUFrQixDQUFDLEdBQVcsRUFBRSxHQUF3QztRQUMzRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQzdFLDJCQUEyQjtZQUMzQixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDckQsSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN2QyxJQUFJLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztnQkFDM0IsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxTQUFTLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7b0JBQ3JELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGdCQUFnQixJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsU0FBUyxJQUFJLEdBQUcsQ0FBQyxTQUFTLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO3dCQUNsSixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ3RELElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxHQUFHLENBQUM7d0JBQzVCLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDO3dCQUN2QixTQUFHLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQzt3QkFDaEUsK0JBQWMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLFFBQVEsRUFBRTs0QkFDMUQsR0FBRyxFQUFFLEdBQUc7NEJBQ1IsS0FBSyxFQUFFLElBQUksQ0FBQyxVQUFVO3lCQUN6QixDQUFDLENBQUM7b0JBQ1AsQ0FBQztvQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFFUixDQUFDO2dCQUNMLENBQUM7WUFDTCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFPLGVBQWU7UUFDbEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2xDLENBQUM7SUFDRCxPQUFPLGVBQWU7UUFDbEIsOENBQThDO1FBQzlDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDdkIsSUFBSSxDQUFDLFVBQVUsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLDhCQUE4QixDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ25FLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUM7Z0JBQ25DLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztZQUM3RixDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUM7QUFDTCxDQUFDO0FBck5VLDBCQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztBQVNuRSwwQkFBVSxHQUFZLElBQUksQ0FBQztBQVUzQiw2QkFBYSxHQUFHLENBQUMsQ0FBQztBQXZCaEIsdUJBQWUsa0JBeU4zQixDQUFBIn0=