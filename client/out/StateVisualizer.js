'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const child_process = require('child_process');
const TextDocumentContentProvider_1 = require('./TextDocumentContentProvider');
const vscode = require('vscode');
const Helper_1 = require('./Helper');
const ExtensionState_1 = require('./ExtensionState');
const path = require('path');
class StateVisualizer {
    constructor() {
        this.previewUri = vscode.Uri.parse('viper-preview:State Visualization');
        this.nextHeapIndex = 0;
        this.removingSpecialChars = false;
        this.addingSpecialChars = false;
    }
    initialize(viperFile) {
        this.viperFile = viperFile;
        this.uri = viperFile.uri;
        this.registerTextDocumentProvider();
    }
    registerTextDocumentProvider() {
        this.provider = new TextDocumentContentProvider_1.HeapProvider();
        this.provider.stateVisualizer = this;
        let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', this.provider);
    }
    reset() {
        this.nextHeapIndex = 0;
        this.provider.resetState();
        this.shownState = -1;
    }
    completeReset() {
        this.reset();
        this.decorationOptions = [];
        this.doHideDecorations();
        this.decorationOptionsByPosition = new Map();
    }
    //needed to cast the decorations 
    toDecorationOptions(decorations) {
        let result = [];
        decorations.forEach(d => {
            result.push({
                numberToDisplay: d.numberToDisplay,
                hoverMessage: d.hoverMessage,
                range: new vscode.Range(new vscode.Position(d.range.start.line, d.range.start.character), new vscode.Position(d.range.end.line, d.range.end.character)),
                renderOptions: {
                    before: {
                        contentText: d.renderOptions.before.contentText,
                        color: d.renderOptions.before.color
                    }
                },
                originalPosition: new vscode.Position(d.originalPosition.line, d.originalPosition.character),
                depth: d.depth,
                index: d.index,
                methodIndex: d.methodIndex,
                isErrorState: d.isErrorState
            });
        });
        return result;
    }
    storeNewStates(decorations) {
        Log_1.Log.log("Store new States", ViperProtocol_1.LogLevel.Debug);
        if (!decorations) {
            Log_1.Log.error("invalid arguments for storeNewStates");
            return;
        }
        this.previousState = -1;
        this.decorationOptions = this.toDecorationOptions(decorations.decorationOptions);
        this.globalInfo = decorations.globalInfo;
        this.decorationOptionsByPosition = new Map();
        this.completeDecorationOptions();
    }
    createAndShowHeap(heapGraph, index) {
        if (!heapGraph.heap) {
            Log_1.Log.error("Error creating heap description");
            return;
        }
        Log_1.Log.writeToDotFile(heapGraph.heap, index);
        //Log.log(graphDescription, LogLevel.Debug);
        if (heapGraph.fileUri != this.uri.toString()) {
            Log_1.Log.error("Uri mismatch in StateVisualizer: " + this.uri.toString() + " expected, " + heapGraph.fileUri + " found.");
            return;
        }
        this.selectState(heapGraph.methodName, heapGraph.state, heapGraph.position);
        this.generateSvg(Log_1.Log.dotFilePath(index), Log_1.Log.svgFilePath(index), () => {
            this.showHeapGraph(heapGraph, index);
        });
    }
    generateSvg(dotFilePath, svgFilePath, callback) {
        try {
            let dotExecutable = Helper_1.Helper.getConfiguration("dotExecutable");
            if (!dotExecutable || !fs.existsSync(dotExecutable)) {
                Log_1.Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
                return;
            }
            if (!fs.existsSync(dotFilePath)) {
                Log_1.Log.error("Cannot generate svg, dot file not found at: " + dotFilePath);
            }
            //convert dot to svg
            this.graphvizProcess = child_process.exec(`${dotExecutable} -Tsvg "${dotFilePath}" -o "${svgFilePath}"`);
            this.graphvizProcess.on('exit', code => {
                //show svg
                if (code != 0) {
                    Log_1.Log.error("Could not convert dot to svg, exit code: " + code, ViperProtocol_1.LogLevel.Debug);
                }
                Log_1.Log.log(`${path.basename(dotFilePath)} converted to ${path.basename(svgFilePath)}`, ViperProtocol_1.LogLevel.Debug);
                callback();
            });
            this.graphvizProcess.stdout.on('data', data => {
                Log_1.Log.log("[Graphviz] " + data, ViperProtocol_1.LogLevel.Debug);
            });
            this.graphvizProcess.stderr.on('data', data => {
                Log_1.Log.log("[Graphviz stderr] " + data, ViperProtocol_1.LogLevel.Debug);
            });
        }
        catch (e) {
            Log_1.Log.error("Error generating svg for: " + dotFilePath + ": " + e);
        }
    }
    showHeapGraph(heapGraph, index) {
        this.provider.setState(heapGraph, index);
        // let dotFileShown = false;
        // vscode.workspace.textDocuments.forEach(element => {
        //     if (element.fileName === Log.dotFilePath(index)) {
        //         dotFileShown = true;
        //     }
        // });
        // if (!dotFileShown) {
        //     //Log.log("Show dotFile", LogLevel.Debug);
        //     //Helper.showFile(Log.dotFilePath(index), vscode.ViewColumn.Two);
        // }
        this.provider.update(this.previewUri);
        //Log.log("Show heap graph", LogLevel.Debug);
        vscode.commands.executeCommand('vscode.previewHtml', this.previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
            Log_1.Log.error("HTML Preview error: " + reason);
        });
    }
    completeDecorationOptions() {
        for (var i = 0; i < this.decorationOptions.length; i++) {
            let option = this.decorationOptions[i];
            //fill in decorationOptionsOrderedByState
            let key = this.vscodePosToKey(option.range.start);
            if (this.decorationOptionsByPosition.has(key)) {
                Log_1.Log.error("multiple decoration options with the same position detected at: " + key);
            }
            this.decorationOptionsByPosition.set(key, option);
        }
    }
    vscodePosToKey(pos) {
        return pos.line + ":" + pos.character;
    }
    posToKey(line, character) {
        return line + ":" + character;
    }
    selectState(debuggedMethodName, selectedState, pos) {
        if (StateVisualizer.showStates && this.decorationOptions) {
            //state should be visualized
            if (selectedState >= 0 && selectedState < this.decorationOptions.length) {
                let selectedOption = this.decorationOptions[selectedState];
                //its in range
                this.shownState = selectedState;
                //this.selectedPosition = this.decorationOptionsOrderedByState[selectedState].range.start;
                this.currentDepth = selectedOption.depth;
                let currentMethodIdx = selectedOption.methodIndex;
                this.debuggedMethodName = debuggedMethodName;
                let darkGraphs = Helper_1.Helper.getConfiguration("darkGraphs");
                //color labels
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    let option = this.decorationOptions[i];
                    let errorStateFound = false;
                    option.renderOptions.before.contentText = this.getLabel(option, currentMethodIdx);
                    //default is grey
                    option.renderOptions.before.color = ViperProtocol_1.StateColors.uninterestingState(darkGraphs);
                    if (option.index == selectedState) {
                        //if it's the current step -> red
                        option.renderOptions.before.color = ViperProtocol_1.StateColors.currentState(darkGraphs);
                        continue;
                    }
                    if (option.index == this.previousState) {
                        option.renderOptions.before.color = ViperProtocol_1.StateColors.previousState(darkGraphs);
                        continue;
                    }
                    else if (option.isErrorState && option.methodIndex === currentMethodIdx) {
                        option.renderOptions.before.color = ViperProtocol_1.StateColors.errorState(darkGraphs);
                        errorStateFound = true;
                    }
                    else if (!errorStateFound &&
                        option.depth <= option.depth
                        && option.methodIndex === currentMethodIdx //&& option.state > selectedState
                    ) {
                        option.renderOptions.before.color = ViperProtocol_1.StateColors.interestingState(darkGraphs);
                    }
                }
                if (StateVisualizer.showStates) {
                    this.showDecorations();
                }
                this.previousState = selectedState;
            }
        }
    }
    getLabel(decoration, methodIndex) {
        if (decoration.methodIndex == methodIndex)
            return `(${decoration.numberToDisplay})`;
        else
            return "⚫";
    }
    showStateSelection(pos) {
        if (StateVisualizer.showStates && this.decorationOptionsByPosition) {
            let key = this.posToKey(pos.line, pos.character);
            if (this.decorationOptionsByPosition.has(key)) {
                let selectedState = this.decorationOptionsByPosition.get(key).index;
                if (this.shownState != selectedState) {
                    this.shownState = selectedState;
                    Log_1.Log.log("Request showing the heap of state " + this.shownState);
                    let params = {
                        uri: this.uri.toString(),
                        clientIndex: this.shownState
                    };
                    ExtensionState_1.ExtensionState.instance.client.sendRequest(ViperProtocol_1.Commands.ShowHeap, params);
                }
                else {
                }
            }
        }
    }
    hideDecorations() {
        Log_1.Log.log("Hide decorations", ViperProtocol_1.LogLevel.Debug);
        this.doHideDecorations();
        this.viperFile.decorationsShown = false;
    }
    doHideDecorations() {
        if (this.decoration) {
            this.decoration.dispose();
        }
    }
    showDecorations() {
        let editor = this.viperFile.editor;
        if (StateVisualizer.showStates && this.decorationOptions) {
            if (editor.document.uri.toString() !== this.uri.toString()) {
                Log_1.Log.log("Don't show states file mismatch", ViperProtocol_1.LogLevel.Debug);
                return;
            }
            this.viperFile.decorationsShown = true;
            Log_1.Log.log("Show decorations", ViperProtocol_1.LogLevel.Debug);
            this.doHideDecorations();
            this.decoration = vscode.window.createTextEditorDecorationType({});
            if (editor) {
                editor.setDecorations(this.decoration, this.decorationOptions);
            }
            else {
                Log_1.Log.error("cannot show decorations: no editor to show it in");
            }
        }
    }
    //SPECIAL CHARACTER METHODS
    areSpecialCharsBeingModified(s) {
        if (this.addingSpecialChars) {
            Log_1.Log.log(s + " they are already being added to " + this.viperFile.name(), ViperProtocol_1.LogLevel.Debug);
            return true;
        }
        if (this.removingSpecialChars) {
            Log_1.Log.log(s + " they are already being removed from " + this.viperFile.name(), ViperProtocol_1.LogLevel.Debug);
            return true;
        }
        return false;
    }
    addCharacterToDecorationOptionLocations(callback) {
        Log_1.Log.log("Try to add special chars to " + this.viperFile.name(), ViperProtocol_1.LogLevel.Debug);
        if (this.areSpecialCharsBeingModified("Don't add special chars,"))
            return;
        if (!this.decorationOptions || this.decorationOptions.length == 0)
            return;
        try {
            let editor = this.viperFile.editor;
            if (StateVisualizer.showStates && editor && this.decorationOptions) {
                this.addingSpecialChars = true;
                this.viperFile.specialCharsShown = true;
                Log_1.Log.log("Adding Special characters", ViperProtocol_1.LogLevel.Debug);
                let openDoc = editor.document;
                let edit = new vscode.WorkspaceEdit();
                this.decorationOptions.forEach((element, i) => {
                    let p = this.decorationOptions[i].originalPosition;
                    //need to create a propper vscode.Position object
                    let pos = new vscode.Position(p.line, p.character);
                    edit.insert(openDoc.uri, pos, '\u200B');
                });
                this.viperFile.onlySpecialCharsChanged = true;
                vscode.workspace.applyEdit(edit).then(resolve => {
                    if (resolve) {
                        openDoc.save().then(() => {
                            this.addingSpecialChars = false;
                            Log_1.Log.log("Special chars added to file " + this.viperFile.name(), ViperProtocol_1.LogLevel.Debug);
                            callback();
                        });
                    }
                    else {
                        this.addingSpecialChars = false;
                    }
                }, reason => {
                    Log_1.Log.error("Error adding special chars: apply was rejected: " + reason);
                    this.addingSpecialChars = false;
                });
            }
        }
        catch (e) {
            this.addingSpecialChars = false;
            Log_1.Log.error("Error adding special chars: " + e);
        }
    }
    removeSpecialCharacters(callback) {
        if (this.areSpecialCharsBeingModified("Don't remove special chars,"))
            return;
        try {
            if (!this.viperFile.editor || !this.viperFile.editor.document) {
                Log_1.Log.error("Error removing special chars, no document to remove it from");
                return;
            }
            this.removingSpecialChars = true;
            //Log.log("Remove special characters from " + path.basename(this.uri.toString()), LogLevel.Info);
            let openDoc = this.viperFile.editor.document;
            let edit = new vscode.WorkspaceEdit();
            let content = openDoc.getText();
            let start = 0;
            let found = false;
            for (let i = 0; i < content.length; i++) {
                if (content[i] === '⦿' || content[i] === '\u200B') {
                    if (!found) {
                        found = true;
                        start = i;
                    }
                }
                else if (found) {
                    let range = new vscode.Range(openDoc.positionAt(start), openDoc.positionAt(i));
                    edit.delete(openDoc.uri, range);
                    found = false;
                }
            }
            if (edit.size > 0) {
                this.viperFile.onlySpecialCharsChanged = true;
                vscode.workspace.applyEdit(edit).then(resolve => {
                    if (resolve) {
                        this.viperFile.editor.document.save().then(saved => {
                            Log_1.Log.log("Special Chars removed from file " + this.viperFile.name(), ViperProtocol_1.LogLevel.Info);
                            this.removingSpecialChars = false;
                            this.viperFile.specialCharsShown = false;
                            callback();
                        });
                    }
                    else {
                        this.removingSpecialChars = false;
                    }
                }, reason => {
                    this.removingSpecialChars = false;
                    Log_1.Log.error("Error removing special characters: edit was rejected: " + reason);
                });
            }
            else {
                this.removingSpecialChars = false;
                Log_1.Log.log("No special chars to remove");
                callback();
            }
        }
        catch (e) {
            this.removingSpecialChars = false;
            Log_1.Log.error("Error removing special characters: " + e);
        }
    }
    removeSpecialCharsFromClosedDocument(callback) {
        if (this.areSpecialCharsBeingModified("Don't remove special chars from closed file,"))
            return;
        try {
            this.removingSpecialChars = true;
            fs.readFile(this.uri.fsPath, (err, data) => {
                if (!err && data) {
                    let newData = data.toString();
                    if (newData.indexOf("⦿") >= 0 || newData.indexOf("\u200B") >= 0) {
                        newData = newData.replace(/[⦿\u200B]/g, "");
                        this.viperFile.onlySpecialCharsChanged = true;
                        fs.writeFileSync(this.uri.fsPath, newData);
                    }
                    Log_1.Log.log("Special Chars removed from closed file " + this.viperFile.name(), ViperProtocol_1.LogLevel.Info);
                    this.removingSpecialChars = false;
                    this.viperFile.specialCharsShown = false;
                    callback();
                }
                else {
                    this.removingSpecialChars = false;
                    Log_1.Log.error("cannot remove special chars from closed file: " + err.message);
                }
            });
        }
        catch (e) {
            this.removingSpecialChars = false;
            Log_1.Log.error("Error removing special chars form closed file: " + e);
        }
    }
}
StateVisualizer.showStates = false;
exports.StateVisualizer = StateVisualizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQXVMLGlCQUFpQixDQUFDLENBQUE7QUFDek0sTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsOENBQTJCLCtCQUErQixDQUFDLENBQUE7QUFDM0QsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBR2hELE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBVzdCO0lBQUE7UUFRSSxlQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQWNuRSxrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUVWLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQUM3Qix1QkFBa0IsR0FBRyxLQUFLLENBQUM7SUFnWnZDLENBQUM7SUE5WVUsVUFBVSxDQUFDLFNBQXlCO1FBQ3ZDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQztRQUN6QixJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsNEJBQTRCO1FBQ3hCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSwwQ0FBWSxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQ3JDLElBQUksWUFBWSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsbUNBQW1DLENBQUMsZUFB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