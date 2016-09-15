'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const child_process = require('child_process');
const HeapProvider_1 = require('./HeapProvider');
const vscode = require('vscode');
const Helper_1 = require('./Helper');
const ExtensionState_1 = require('./ExtensionState');
const path = require('path');
class StateVisualizer {
    constructor() {
        this.collapsedSymbol = "⚫";
        this.previewUri = vscode.Uri.parse('viper-preview:State Visualization');
        this.readyToDebug = false;
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
        this.provider = new HeapProvider_1.HeapProvider();
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
        this.readyToDebug = false;
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
                parent: d.parent,
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
        this.readyToDebug = this.decorationOptions.length > 0;
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
            this.provider.setState(heapGraph, index);
            this.showHeapGraph();
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
    showHeapGraph() {
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
    collapseOutsideMethod(option, currentMethodIdx) {
        if (option.methodIndex == currentMethodIdx)
            option.renderOptions.before.contentText = this.getLabel(option);
        else
            option.renderOptions.before.contentText = this.collapsedSymbol;
    }
    getLabel(option) {
        if (!option)
            return "()";
        return `(${option.numberToDisplay})`;
    }
    expand(option) {
        option.renderOptions.before.contentText = this.getLabel(option);
    }
    collapse(option) {
        option.renderOptions.before.contentText = this.collapsedSymbol;
    }
    hide(option) {
        option.renderOptions.before.contentText = "";
    }
    color(option, color, darkGraphs) {
        let isOldCurrentState = ViperProtocol_1.StateColors.currentState(darkGraphs) == option.renderOptions.before.color;
        let isOldPreviousState = ViperProtocol_1.StateColors.previousState(darkGraphs) == option.renderOptions.before.color;
        let isOldErrorState = ViperProtocol_1.StateColors.errorState(darkGraphs) == option.renderOptions.before.color;
        let isNewCurrentState = ViperProtocol_1.StateColors.currentState(darkGraphs) == color;
        let isNewPreviousState = ViperProtocol_1.StateColors.previousState(darkGraphs) == color;
        let isNewUninterestingState = ViperProtocol_1.StateColors.uninterestingState(darkGraphs) == color;
        let isNewInterestingState = ViperProtocol_1.StateColors.interestingState(darkGraphs) == color;
        let isNewErrorState = ViperProtocol_1.StateColors.errorState(darkGraphs) == color;
        if (isNewUninterestingState
            || isNewCurrentState
            || (!isOldCurrentState && isNewPreviousState)
            || (!isOldCurrentState && !isOldPreviousState && isNewErrorState)
            || (!isOldCurrentState && !isOldPreviousState && !isOldErrorState && isNewInterestingState)) {
            option.renderOptions.before.color = color;
        }
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
                    this.hide(option);
                    //this.collapse(option);
                    //this.collapseOutsideMethod(option, currentMethodIdx);
                    //default is grey
                    this.color(option, ViperProtocol_1.StateColors.uninterestingState(darkGraphs), darkGraphs);
                    if (option.isErrorState /*&& option.methodIndex === currentMethodIdx*/) {
                        this.collapse(option);
                        this.color(option, ViperProtocol_1.StateColors.errorState(darkGraphs), darkGraphs);
                        errorStateFound = true;
                    }
                    if (option.index == selectedState) {
                        //if it's the current step -> red
                        this.color(option, ViperProtocol_1.StateColors.currentState(darkGraphs), darkGraphs);
                        continue;
                    }
                    if (option.index == this.previousState) {
                        this.color(option, ViperProtocol_1.StateColors.previousState(darkGraphs), darkGraphs);
                        continue;
                    }
                }
                if (StateVisualizer.showStates) {
                    //mark execution trace that led to the current state
                    Log_1.Log.log("Request Execution Trace", ViperProtocol_1.LogLevel.Info);
                    ExtensionState_1.ExtensionState.instance.client.sendRequest(ViperProtocol_1.Commands.GetExecutionTrace, { uri: this.uri.toString(), clientState: selectedState }).then((trace) => {
                        Log_1.Log.log("Mark Execution Trace", ViperProtocol_1.LogLevel.Debug);
                        trace.forEach(element => {
                            let option = this.decorationOptions[element];
                            this.expand(option);
                            this.color(option, ViperProtocol_1.StateColors.interestingState(darkGraphs), darkGraphs);
                        });
                        this.showDecorations();
                    });
                }
                this.previousState = selectedState;
            }
        }
    }
    showStateSelection(pos) {
        if (StateVisualizer.showStates && this.decorationOptionsByPosition) {
            let key = this.posToKey(pos.line, pos.character);
            if (this.decorationOptionsByPosition.has(key)) {
                let selectedState = this.decorationOptionsByPosition.get(key).index;
                if (this.currentState != selectedState) {
                    this.currentState = selectedState;
                    Log_1.Log.log("Request showing the heap of state " + this.currentState, ViperProtocol_1.LogLevel.Debug);
                    let params = {
                        uri: this.uri.toString(),
                        clientIndex: this.currentState
                    };
                    ExtensionState_1.ExtensionState.instance.client.sendRequest(ViperProtocol_1.Commands.ShowHeap, params);
                }
                else {
                    //hide previous state if the same state is selected twice
                    Log_1.Log.log("Hide previous state", ViperProtocol_1.LogLevel.Debug);
                    this.previousState = -1;
                    this.provider.discardState(this.nextHeapIndex);
                    this.nextHeapIndex = 1;
                    this.showHeapGraph();
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
                Log_1.Log.log("No special chars to remove", ViperProtocol_1.LogLevel.Debug);
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
                    Log_1.Log.log("WARNING: cannot remove special chars from closed file: does it still exist?" + err.message, ViperProtocol_1.LogLevel.Debug);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQWdKLGlCQUFpQixDQUFDLENBQUE7QUFDbEssTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsK0JBQTJCLGdCQUFnQixDQUFDLENBQUE7QUFDNUMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBR2hELE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBWTdCO0lBQUE7UUFJSSxvQkFBZSxHQUFHLEdBQUcsQ0FBQztRQU10QixlQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUluRSxpQkFBWSxHQUFZLEtBQUssQ0FBQztRQVc5QixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUVWLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQUM3Qix1QkFBa0IsR0FBRyxLQUFLLENBQUM7SUFtY3ZDLENBQUM7SUFqY1UsVUFBVSxDQUFDLFNBQXlCO1FBQ3ZDLElBQUksQ0FBQyxTQUFTLEdBQUcsU0FBUyxDQUFDO1FBQzNCLElBQUksQ0FBQyxHQUFHLEdBQUcsU0FBUyxDQUFDLEdBQUcsQ0FBQztRQUN6QixJQUFJLENBQUMsNEJBQTRCLEVBQUUsQ0FBQztJQUN4QyxDQUFDO0lBRUQsNEJBQTRCO1FBQ3hCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSwyQkFBWSxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FB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