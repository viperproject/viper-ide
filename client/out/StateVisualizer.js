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
        this.decorationOptions = params.decorations.decorationOptions;
        this.stepInfo = params.decorations.stepInfo;
        this.methodBorders = params.decorations.methodBorders;
        vscode.window.visibleTextEditors.forEach(editor => {
            if (editor.document.uri.toString() === params.uri) {
                this.textEditorUnderVerification = editor;
            }
        });
        this.showDecorations();
    }
    static showHeap(heapGraph) {
        if (!heapGraph.heap) {
            Log_1.Log.error("Error creating heap description");
            return;
        }
        Log_1.Log.writeToDotFile(heapGraph.heap);
        //Log.log(graphDescription, LogLevel.Debug);
        this.selectState(heapGraph.fileUri, heapGraph.state, heapGraph.position);
        let dotExecutable = Helper_1.Helper.getConfiguration("dotExecutable");
        if (!dotExecutable || !fs.existsSync(dotExecutable)) {
            Log_1.Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
            return;
        }
        //convert dot to svg
        this.graphvizProcess = child_process.exec(`${dotExecutable} -Tsvg "${Log_1.Log.dotFilePath}" -o "${Log_1.Log.svgFilePath}"`);
        this.graphvizProcess.on('exit', code => {
            //show svg
            if (code != 0) {
                Log_1.Log.error("Could not convert graph description to svg, exit code: " + code, ViperProtocol_1.LogLevel.Debug);
            }
            Log_1.Log.log("Graph converted to heap.svg", ViperProtocol_1.LogLevel.Debug);
            this.showHeapGraph(heapGraph);
        });
        this.graphvizProcess.stdout.on('data', data => {
            Log_1.Log.log("[Graphviz] " + data, ViperProtocol_1.LogLevel.Debug);
        });
        this.graphvizProcess.stderr.on('data', data => {
            Log_1.Log.log("[Graphviz stderr] " + data, ViperProtocol_1.LogLevel.Debug);
        });
    }
    static showHeapGraph(heapGraph) {
        this.provider.setState(heapGraph);
        Helper_1.Helper.showFile(Log_1.Log.dotFilePath, vscode.ViewColumn.Two);
        this.provider.update(this.previewUri);
        vscode.commands.executeCommand('vscode.previewHtml', this.previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
            vscode.window.showErrorMessage(reason);
        });
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
                //color labels
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    let option = this.decorationOptions[i];
                    //default is grey
                    option.renderOptions.before.color = 'grey';
                    for (var j = 0; j < option.states.length; j++) {
                        var optionState = option.states[j];
                        if (optionState == selectedState) {
                            //if it's the current step -> blue
                            option.renderOptions.before.color = 'blue';
                            break;
                        }
                        else if (this.stepInfo[optionState].isErrorState && option.renderOptions.before.color != 'blue') {
                            option.renderOptions.before.color = 'red';
                        }
                        else if (optionState > selectedState &&
                            option.renderOptions.before.color != 'red' &&
                            this.stepInfo[optionState].depth <= this.stepInfo[selectedState].depth) {
                            //if its not a substep and not a previous step and in the current method -> red
                            option.renderOptions.before.color = 'orange';
                        }
                    }
                }
                if (this.showStates) {
                    this.showDecorations();
                }
            }
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
        Log_1.Log.log("Show decorations", ViperProtocol_1.LogLevel.Debug);
        if (this.showStates && this.decorationOptions) {
            this.hideDecorations();
            this.decoration = vscode.window.createTextEditorDecorationType({});
            if (this.textEditorUnderVerification) {
                this.textEditorUnderVerification.setDecorations(this.decoration, this.decorationOptions);
            }
        }
    }
}
StateVisualizer.previewUri = vscode.Uri.parse('viper-preview://heapVisualization');
StateVisualizer.showStates = true;
exports.StateVisualizer = StateVisualizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQW1GLGlCQUFpQixDQUFDLENBQUE7QUFDckcsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsOENBQTJCLCtCQUErQixDQUFDLENBQUE7QUFDM0QsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBbUJoRDtJQW1CSSxPQUFjLFVBQVU7UUFDcEIsSUFBSSxDQUFDLDRCQUE0QixFQUFFLENBQUM7SUFDeEMsQ0FBQztJQUVELE9BQU8sNEJBQTRCO1FBQy9CLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSwwQ0FBWSxFQUFFLENBQUM7UUFDbkMsSUFBSSxZQUFZLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxtQ0FBbUMsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzVHLENBQUM7SUFFRCxPQUFPLGNBQWMsQ0FBQyxNQUFvRTtRQUN0RixJQUFJLENBQUMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQztRQUM5RCxJQUFJLENBQUMsUUFBUSxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDO1FBQzVDLElBQUksQ0FBQyxhQUFhLEdBQUcsTUFBTSxDQUFDLFdBQVcsQ0FBQyxhQUFhLENBQUM7UUFDdEQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsTUFBTTtZQUMzQyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMs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