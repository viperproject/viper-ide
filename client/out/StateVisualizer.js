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
        this.currentState = -1;
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
                this.currentState = selectedState;
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
                if (this.currentState != selectedState) {
                    this.currentState = selectedState;
                    Log_1.Log.log("Request showing the heap of state " + this.currentState);
                    let params = {
                        uri: this.uri.toString(),
                        clientIndex: this.currentState
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQWdKLGlCQUFpQixDQUFDLENBQUE7QUFDbEssTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsOENBQTJCLCtCQUErQixDQUFDLENBQUE7QUFDM0QsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBR2hELE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBVzdCO0lBQUE7UUFRSSxlQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQWNuRSxrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUVWLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQUM3Qix1QkFBa0IsR0FBRyxLQUFLLENBQUM7SUFzWXZDLENBQUM7SUFwWVUsVUFBVSxDQUFDLFNBQXlCO1FBQ3ZDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQztRQUN6QixJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsNEJBQTRCO1FBQ3hCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSwwQ0FBWSxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQ3JDLElBQUksWUFBWSxHQUFHLE1BQU0sQ0FBQyxTQUFTLENBQUMsbUNBQW1DLENBQUMsZUFB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