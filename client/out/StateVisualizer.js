'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const child_process = require('child_process');
const TextDocumentContentProvider_1 = require('./TextDocumentContentProvider');
const vscode = require('vscode');
const Helper_1 = require('./Helper');
const ExtensionState_1 = require('./ExtensionState');
const ViperFormatter_1 = require('./ViperFormatter');
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
        ViperFormatter_1.ViperFormatter.addCharacterToDecorationOptionLocations();
        this.decorationOptionsOrderedByState = [];
        this.completeDecorationOptions();
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
    static completeDecorationOptions() {
        for (var i = 0; i < this.decorationOptions.length; i++) {
            let option = this.decorationOptions[i];
            //fill decorationOptionsOrderedByState
            option.states.forEach(state => {
                this.decorationOptionsOrderedByState[state] = option;
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
                this.selectedPosition = this.decorationOptionsOrderedByState[selectedState].range.start;
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
                        else if (!errorStateFound &&
                            this.stepInfo[optionState].depth <= this.stepInfo[selectedState].depth
                            && this.stepInfo[optionState].methodIndex === currentMethodIdx //&& optionState > selectedState
                        ) {
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
            return `(${label.substring(1, label.length)})`;
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
        Log_1.Log.log("Hide decorations", ViperProtocol_1.LogLevel.Debug);
        this.doHideDecorations();
        ExtensionState_1.ExtensionState.viperFiles.get(vscode.window.activeTextEditor.document.uri.toString()).decorationsShown = false;
    }
    static doHideDecorations() {
        if (this.decoration) {
            this.decoration.dispose();
        }
    }
    static showDecorations() {
        if (this.showStates && this.decorationOptions) {
            ExtensionState_1.ExtensionState.viperFiles.get(vscode.window.activeTextEditor.document.uri.toString()).decorationsShown = true;
            Log_1.Log.log("Show decorations", ViperProtocol_1.LogLevel.Debug);
            this.doHideDecorations();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQTBHLGlCQUFpQixDQUFDLENBQUE7QUFDNUgsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsOENBQTJCLCtCQUErQixDQUFDLENBQUE7QUFDM0QsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBYWhEO0lBNEJJLE9BQWMsVUFBVTtRQUNwQixJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsT0FBTyw0QkFBNEI7UUFDL0IsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLDBDQUFZLEVBQUUsQ0FBQztRQUNuQyxJQUFJLFlBQVksR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxDQUFDLGVBQWUsRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVELE9BQU8sY0FBYyxDQUFDLE1BQW9FO1FBQ3RGLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsYUFBYSxHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDO1FBQzlELElBQUksQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUM7UUFDNUMsSUFBSSxDQUFDLGFBQWEsR0FBRyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsQ0FBQztRQUN0RCxJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsVUFBVSxDQUFDO1FBQ2hELE1BQU0sQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLE1BQU07WUFDM0MsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztnQkFDOUIsU0FBRyxDQUFDLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO1lBQ3RELENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztnQkFDaEQsSUFBSSxDQUFDLDJCQUEyQixHQUFHLE1BQU0sQ0FBQztZQUM5QyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxTQUFHLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDckIsK0JBQWMsQ0FBQyx1Q0FBdUMsRUFBRSxDQUFDO1FBQ3pELElBQUksQ0FBQywrQkFBK0IsR0FBRyxFQUFFLENBQUM7UUFDMUMsSUFBSSxDQUFDLHlCQUF5QixFQUFFLENBQUM7UUFDakMsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxPQUFjLGlCQUFpQixDQUFDLFNBQW9CLEVBQUUsS0FBYTtRQUMvRCxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2xCLFNBQUcsQ0FBQyxLQUFLLENBQUMsaUNBQWlDLENBQUMsQ0FBQztZQUM3QyxNQUFNLENBQUM7UUFDWCxDQUFDO1FBQ0QsU0FBRyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzFDLDRDQUE0QztRQUU1QyxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFekUsSUFBSSxhQUFhLEdBQW1CLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsQ0FBQztRQUM3RSxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ2xELFNBQUcsQ0FBQyxJQUFJLENBQUMsdURBQXVELEdBQUcsYUFBYSxDQUFDLENBQUM7WUFDbEYsTUFBTSxDQUFDO1FBQ1gsQ0FBQztRQUNELG9CQUFvQjtRQUNwQixJQUFJLENBQUMsZUFBZSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxhQUFhLFdBQVcsU0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsU0FBUyxTQUFHLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvSCxJQUFJLENBQUMsZUFBZSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsSUFBSTtZQUNoQyxVQUFVO1lBQ1YsRUFBRSxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1osU0FBRyxDQUFDLEtBQUssQ0FBQyx5REFBeUQsR0FBRyxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoRyxDQUFDO1lBQ0QsU0FBRyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZELElBQUksQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3pDLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJO1lBQ3ZDLFNBQUcsQ0FBQyxHQUFHLENBQUMsYUFBYSxHQUFHLElBQUksRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2xELENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxJQUFJO1lBQ3ZDLFNBQUcsQ0FBQyxHQUFHLENBQUMsb0JBQW9CLEdBQUcsSUFBSSxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDekQsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBRUQsT0FBZSxhQUFhLENBQUMsU0FBb0IsRUFBRSxLQUFhO1FBQzVELElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN6QyxJQUFJLFlBQVksR0FBRyxLQUFLLENBQUM7UUFDekIsSUFBSSxTQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ3RCLE1BQU0sQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxPQUFPO1lBQzFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEtBQUssU0FBRyxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLFlBQVksR0FBRyxJQUFJLENBQUM7WUFDeEIsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZELFNBQVMsR0FBRyxJQUFJLENBQUM7WUFDckIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ0gsRUFBRSxDQUFDLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLDBDQUEwQztZQUMxQyxlQUFNLENBQUMsUUFBUSxDQUFDLFNBQUcsQ0FBQyxXQUFXLENBQUMsS0FBSyxDQUFDLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNuRSxDQUFDO1FBQ0QsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ3RDLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQztZQUNiLDZDQUE2QztZQUM3QyxNQUFNLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxvQkFBb0IsRUFBRSxJQUFJLENBQUMsVUFBVSxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDLE1BQU07Z0JBQ3ZILFNBQUcsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLEdBQUcsTUFBTSxDQUFDLENBQUM7WUFDL0MsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQU8seUJBQXlCO1FBQzVCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3JELElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxzQ0FBc0M7WUFDdEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsS0FBSztnQkFDdkIsSUFBSSxDQUFDLCtCQUErQixDQUFDLEtBQUssQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUN6RCxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxXQUFXLENBQUMsR0FBVyxFQUFFLGFBQXFCLEVBQUUsR0FBYTtRQUNoRSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxJQUFJLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1lBQzdFLDRCQUE0QjtZQUM1QixFQUFFLENBQUMsQ0FBQyxhQUFhLElBQUksQ0FBQyxJQUFJLGFBQWEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7Z0JBQzdELGNBQWM7Z0JBQ2QsSUFBSSxDQUFDLFVBQVUsR0FBRyxhQUFhLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxXQUFXLEdBQUcsR0FBRyxDQUFDO2dCQUN2QixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLCtCQUErQixDQUFDLGFBQWEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7Z0JBQ3hGLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLLENBQUM7Z0JBQ3ZELElBQUksZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxXQUFXLENBQUM7Z0JBQ2hFLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLGdCQUFnQixDQUFDLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBRW5HLGNBQWM7Z0JBQ2QsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7b0JBQ3JELElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDdkMsSUFBSSxlQUFlLEdBQUcsS0FBSyxDQUFDO29CQUM1QixNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztvQkFFbEYsaUJBQWlCO29CQUNqQixNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsMkJBQVcsQ0FBQyxrQkFBa0IsQ0FBQztvQkFDbkUsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO3dCQUM1QyxJQUFJLFdBQVcsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUNuQyxFQUFFLENBQUMsQ0FBQyxXQUFXLElBQUksYUFBYSxDQUFDLENBQUMsQ0FBQzs0QkFDL0IsaUNBQWlDOzRCQUNqQyxNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsMkJBQVcsQ0FBQyxZQUFZLENBQUM7NEJBQzdELEtBQUssQ0FBQzt3QkFDVixDQUFDO3dCQUNELEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQzs0QkFDcEMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsS0FBSyxHQUFHLDJCQUFXLENBQUMsYUFBYSxDQUFDOzRCQUM5RCxLQUFLLENBQUM7d0JBQ1YsQ0FBQzt3QkFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxZQUFZLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxXQUFXLEtBQUssZ0JBQWdCLENBQUMsQ0FBQyxDQUFDOzRCQUM5RyxNQUFNLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEdBQUcsMkJBQVcsQ0FBQyxVQUFVLENBQUM7NEJBQzNELGVBQWUsR0FBRyxJQUFJLENBQUM7d0JBQzNCLENBQUM7d0JBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBZTs0QkFDckIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxLQUFLLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsQ0FBQyxLQUFLOytCQUNuRSxJQUFJLENBQUMsUUFBUSxDQUFDLFdBQVcsQ0FBQyxDQUFDLFdBQVcsS0FBSyxnQkFBZ0IsQ0FBQyxnQ0FBZ0M7d0JBQ25HLENBQUMsQ0FBQyxDQUFDOzRCQUNDLE1BQU0sQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLEtBQUssR0FBRywyQkFBVyxDQUFDLGdCQUFnQixDQUFDO3dCQUNyRSxDQUFDO29CQUNMLENBQUM7Z0JBQ0wsQ0FBQztnQkFDRCxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztvQkFDbEIsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO2dCQUMzQixDQUFDO2dCQUVELElBQUksQ0FBQyxhQUFhLEdBQUcsYUFBYSxDQUFDO1lBQ3ZDLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWUsUUFBUSxDQUFDLFVBQStCLEVBQUUsV0FBbUI7UUFDeEUsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDO1FBQ2YsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUNuRCxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQyxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ3RELFVBQVUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE9BQU87WUFDN0IsRUFBRSxDQUFDLENBQUMsT0FBTyxJQUFJLFlBQVksQ0FBQyxlQUFlLElBQUksT0FBTyxJQUFJLFlBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO2dCQUNwRixLQUFLLElBQUksR0FBRyxHQUFHLENBQUMsT0FBTyxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztZQUNsRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDSCxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEIsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFBO1FBQ2xELENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxrQkFBa0IsQ0FBQyxHQUFXLEVBQUUsR0FBd0M7UUFDM0UsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsSUFBSSxlQUFNLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUM3RSwyQkFBMkI7WUFDM0IsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3JELElBQUksTUFBTSxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkMsSUFBSSxDQUFDLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7Z0JBQzNCLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLENBQUMsU0FBUyxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLGdCQUFnQixDQUFDLFNBQVMsSUFBSSxHQUFHLENBQUMsU0FBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQzt3QkFDbEosSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUN0RCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDO3dCQUM1QixJQUFJLENBQUMsV0FBVyxHQUFHLEdBQUcsQ0FBQzt3QkFDdkIsU0FBRyxDQUFDLEdBQUcsQ0FBQyxvQ0FBb0MsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7d0JBQ2hFLCtCQUFjLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsd0JBQVEsQ0FBQyxRQUFRLEVBQUU7NEJBQzFELEdBQUcsRUFBRSxHQUFHOzRCQUNSLEtBQUssRUFBRSxJQUFJLENBQUMsVUFBVTt5QkFDekIsQ0FBQyxDQUFDO29CQUNQLENBQUM7b0JBQUMsSUFBSSxDQUFDLENBQUM7b0JBRVIsQ0FBQztnQkFDTCxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxlQUFlO1FBQ2xCLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztRQUN6QiwrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO0lBQ25ILENBQUM7SUFFRCxPQUFlLGlCQUFpQjtRQUM1QixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUNsQixJQUFJLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzlCLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBTyxlQUFlO1FBQ2xCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQztZQUM1QywrQkFBYyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDO1lBQzlHLFNBQUcsQ0FBQyxHQUFHLENBQUMsa0JBQWtCLEVBQUUsd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1QyxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQztZQUN6QixJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsOEJBQThCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDbkUsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLENBQUMsQ0FBQztnQkFDbkMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQzdGLENBQUM7UUFDTCxDQUFDO0lBQ0wsQ0FBQztBQUNMLENBQUM7QUEvT1UsMEJBQVUsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0FBU25FLDBCQUFVLEdBQVksSUFBSSxDQUFDO0FBYTNCLDZCQUFhLEdBQUcsQ0FBQyxDQUFDO0FBMUJoQix1QkFBZSxrQkFtUDNCLENBQUEifQ==