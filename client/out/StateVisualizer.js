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
        this.addingTimingInformation = false;
        this.timingPrefix = '//@TIMING:';
        this.removeSpecialCharacterCallbacks = [];
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
        this.previousState = -1;
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
            Log_1.Log.error("Error creating heap description: no heap");
            return;
        }
        if (heapGraph.fileUri != this.uri.toString()) {
            Log_1.Log.error("Uri mismatch in StateVisualizer: " + this.uri.toString() + " expected, " + heapGraph.fileUri + " found.");
            return;
        }
        this.provider.setState(heapGraph, index);
        this.generateSvg(heapGraph.heap, Log_1.Log.dotFilePath(index, false), Log_1.Log.svgFilePath(index, false), () => {
            this.generateSvg(heapGraph.oldHeap, Log_1.Log.dotFilePath(index, true), Log_1.Log.svgFilePath(index, true), () => {
                this.generateSvg(heapGraph.partialExecutionTree, Log_1.Log.getPartialExecutionTreeDotPath(index), Log_1.Log.getPartialExecutionTreeSvgPath(index), () => {
                    this.showHeapGraph();
                });
            });
        });
    }
    pushState(heapGraph) {
        //update heap preview
        let currHeapIndex = this.nextHeapIndex;
        this.nextHeapIndex = 1 - this.nextHeapIndex;
        this.createAndShowHeap(heapGraph, currHeapIndex);
        //only update previous state, if not already updated
        if (this.currentState != heapGraph.state) {
            this.previousState = this.currentState;
            this.currentState = heapGraph.state;
        }
        //highligh states
        this.markStateSelection(heapGraph.methodName, heapGraph.position);
    }
    setState(heapGraph, heapIndex) {
        this.createAndShowHeap(heapGraph, 1);
        let currentHeap = this.provider.getCurrentHeap();
        this.previousState = this.provider.getPreviousHeap().state;
        this.markStateSelection(currentHeap.methodName, currentHeap.position);
    }
    focusOnState(heapGraph) {
        this.reset();
        this.nextHeapIndex = 1;
        this.createAndShowHeap(heapGraph, 0);
        this.currentState = heapGraph.state;
        this.previousState = -1;
        this.markStateSelection(heapGraph.methodName, heapGraph.position);
        this.requestState(heapGraph.state, false);
    }
    generateSvg(heapGraphAsDot, dotFilePath, svgFilePath, callback, writeGraphDescriptionToFile = true) {
        try {
            //store graph description in file
            if (writeGraphDescriptionToFile && heapGraphAsDot) {
                Log_1.Log.writeToDotFile(heapGraphAsDot, dotFilePath);
            }
            //get dot Executable
            ExtensionState_1.State.instance.client.sendRequest(ViperProtocol_1.Commands.GetDotExecutable, null).then((dotExecutable) => {
                //the path should have already been checked by the server, but check again to be sure
                if (!dotExecutable || !fs.existsSync(dotExecutable)) {
                    Log_1.Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
                    return;
                }
                if (!fs.existsSync(dotFilePath)) {
                    Log_1.Log.error("Cannot generate svg, dot file not found at: " + dotFilePath);
                }
                //convert dot to svg
                let command = `"${dotExecutable}" -Tsvg "${dotFilePath}" -o "${svgFilePath}"`;
                Log_1.Log.log("Dot Command: " + command, ViperProtocol_1.LogLevel.Debug);
                this.graphvizProcess = child_process.exec(command);
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
    markStateSelection(debuggedMethodName, pos) {
        if (StateVisualizer.showStates && this.decorationOptions) {
            //state should be visualized
            if (this.currentState >= 0 && this.currentState < this.decorationOptions.length) {
                let selectedOption = this.decorationOptions[this.currentState];
                //this.selectedPosition = this.decorationOptionsOrderedByState[selectedState].range.start;
                this.currentDepth = selectedOption.depth;
                let currentMethodIdx = selectedOption.methodIndex;
                this.debuggedMethodName = debuggedMethodName;
                let darkGraphs = Helper_1.Helper.getConfiguration("advancedFeatures").darkGraphs === true;
                //color labels
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    let option = this.decorationOptions[i];
                    let errorStateFound = false;
                    this.hide(option);
                    this.color(option, ViperProtocol_1.StateColors.uninterestingState(darkGraphs), darkGraphs);
                    if (option.index == this.currentState) {
                        //if it's the current step -> red
                        this.expand(option);
                        this.color(option, ViperProtocol_1.StateColors.currentState(darkGraphs), darkGraphs);
                        continue;
                    }
                    else if (option.index == this.previousState) {
                        this.expand(option);
                        this.color(option, ViperProtocol_1.StateColors.previousState(darkGraphs), darkGraphs);
                        continue;
                    }
                    else if (option.isErrorState /*&& option.methodIndex === currentMethodIdx*/) {
                        this.collapse(option);
                        this.color(option, ViperProtocol_1.StateColors.errorState(darkGraphs), darkGraphs);
                        errorStateFound = true;
                    }
                }
                if (StateVisualizer.showStates) {
                    //mark execution trace that led to the current state
                    Log_1.Log.log("Request Execution Trace", ViperProtocol_1.LogLevel.Info);
                    let params = { uri: this.uri.toString(), clientState: this.currentState };
                    ExtensionState_1.State.instance.client.sendRequest(ViperProtocol_1.Commands.GetExecutionTrace, params).then((trace) => {
                        Log_1.Log.log("Mark Execution Trace", ViperProtocol_1.LogLevel.Debug);
                        trace.forEach(element => {
                            let option = this.decorationOptions[element.state];
                            if (element.state != this.previousState && element.state != this.currentState) {
                                if (element.showNumber) {
                                    this.expand(option);
                                }
                                else {
                                    this.collapse(option);
                                }
                                this.color(option, element.color, darkGraphs);
                            }
                        });
                        this.showDecorations();
                    });
                }
            }
        }
    }
    //request the heap graph of state from the language server
    requestState(state, isHeapNeeded) {
        Log_1.Log.log("Request showing the heap of state " + state, ViperProtocol_1.LogLevel.Debug);
        let params = {
            uri: this.uri.toString(),
            clientIndex: state,
            isHeapNeeded: isHeapNeeded
        };
        ExtensionState_1.State.instance.client.sendRequest(ViperProtocol_1.Commands.ShowHeap, params);
    }
    //handle both selection change, or debugger movement notification
    showStateSelection(pos) {
        if (StateVisualizer.showStates && this.decorationOptionsByPosition) {
            let key = this.posToKey(pos.line, pos.character);
            if (this.decorationOptionsByPosition.has(key)) {
                //there is a decoration at the selected position
                let decoration = this.decorationOptionsByPosition.get(key);
                let selectedState = decoration.index;
                if (Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode === true) {
                    //Simple Mode
                    if (decoration.renderOptions.before.contentText && decoration.renderOptions.before.contentText.length > 0) {
                        //the selected element is visible and thus, lies on the execution path to the current state
                        if (this.previousState == selectedState || this.currentState == selectedState) {
                            //the shown state has been selected twice, focus on current state
                            this.focusOnState(this.provider.getCurrentHeap());
                        }
                        else {
                            this.requestState(selectedState, true);
                        }
                    }
                }
                else {
                    //Advanced Mode
                    if (this.currentState != selectedState) {
                        this.previousState = this.currentState;
                        this.currentState = selectedState;
                        this.requestState(this.currentState, true);
                    }
                    else {
                        //focus on current state if it is selected twice in a row
                        this.focusOnState(this.provider.getCurrentHeap());
                    }
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
    getLastTiming() {
        let uri = this.viperFile.editor.document.uri.toString();
        let viperFile = ExtensionState_1.State.viperFiles.get(uri);
        let timingInfo;
        if (viperFile) {
            timingInfo = viperFile.timingInfo;
        }
        return timingInfo;
    }
    addTimingInformationToFileState(timingInfo) {
        if (this.areSpecialCharsBeingModified("Don't add timing to file, its being modified"))
            return;
        try {
            let editor = this.viperFile.editor;
            if (Helper_1.Helper.getConfiguration("preferences").showProgress && this.viperFile.open && editor) {
                //strangely editor is null here, even though I just checked
                let uri = editor.document.uri.toString();
                let viperFile = ExtensionState_1.State.viperFiles.get(uri);
                if (viperFile) {
                    viperFile.timingInfo = timingInfo;
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error adding timing information: " + e);
        }
    }
    //TIMING IN FILE
    getLastTimingFromFile() {
        let content = this.viperFile.editor.document.getText();
        let timingStart = content.indexOf(this.timingPrefix);
        let timingEnd = content.indexOf('}', timingStart) + 1;
        let timingInfo;
        if (timingStart >= 0) {
            try {
                timingInfo = JSON.parse(content.substring(timingStart + this.timingPrefix.length, timingEnd));
            }
            catch (e) {
                Log_1.Log.log("Warning: Misformed timing information: " + content.substring(timingStart + this.timingPrefix.length, timingEnd));
            }
        }
        return timingInfo;
    }
    addTimingInformationToFile(time) {
        if (this.areSpecialCharsBeingModified("Don't add timing to file, its being modified"))
            return;
        try {
            let editor = this.viperFile.editor;
            if (Helper_1.Helper.getConfiguration("preferences").showProgress && this.viperFile.open && editor) {
                this.addingTimingInformation = true;
                let openDoc = editor.document;
                let edit = new vscode.WorkspaceEdit();
                let content = openDoc.getText();
                let timingStart = content.indexOf(this.timingPrefix);
                let timingEnd = content.indexOf('}', timingStart) + 1;
                let newTiming = this.timingPrefix + JSON.stringify(time);
                if (timingStart >= 0) {
                    if (timingEnd <= 0) {
                        timingEnd = content.length + 1;
                    }
                    //replace existing timing
                    edit.replace(openDoc.uri, new vscode.Range(openDoc.positionAt(timingStart), openDoc.positionAt(timingEnd)), newTiming);
                }
                else {
                    //add new timing if there is non yet
                    edit.insert(openDoc.uri, openDoc.positionAt(content.length), "\n" + newTiming);
                }
                this.viperFile.onlySpecialCharsChanged = true;
                vscode.workspace.applyEdit(edit).then(resolve => {
                    if (resolve) {
                        openDoc.save().then(() => {
                            this.addingTimingInformation = false;
                            Log_1.Log.log("Timing information added to " + this.viperFile.name(), ViperProtocol_1.LogLevel.Debug);
                        });
                    }
                    else {
                        this.addingTimingInformation = false;
                    }
                }, reason => {
                    Log_1.Log.error("Error adding timing information: apply was rejected: " + reason);
                    this.addingTimingInformation = false;
                });
            }
        }
        catch (e) {
            this.addingTimingInformation = false;
            Log_1.Log.error("Error adding timing information: " + e);
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
        this.removeSpecialCharacterCallbacks.push(callback);
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
                            this.callTheRemoveSpecialCharCallbacks();
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
                this.callTheRemoveSpecialCharCallbacks();
            }
        }
        catch (e) {
            this.removingSpecialChars = false;
            Log_1.Log.error("Error removing special characters: " + e);
        }
    }
    callTheRemoveSpecialCharCallbacks() {
        while (this.removeSpecialCharacterCallbacks.length > 0) {
            let callback = this.removeSpecialCharacterCallbacks.shift();
            callback();
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFDMUIsZ0NBQXFNLGlCQUFpQixDQUFDLENBQUE7QUFDdk4sTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBTyxhQUFhLFdBQVcsZUFBZSxDQUFDLENBQUM7QUFDaEQsK0JBQTJCLGdCQUFnQixDQUFDLENBQUE7QUFDNUMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXFCLFVBQVUsQ0FBQyxDQUFBO0FBQ2hDLGlDQUFvQixrQkFBa0IsQ0FBQyxDQUFBO0FBRXZDLE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBWTdCO0lBQUE7UUFJSSxvQkFBZSxHQUFHLEdBQUcsQ0FBQztRQU10QixlQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUluRSxpQkFBWSxHQUFZLEtBQUssQ0FBQztRQVc5QixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUVWLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQUM3Qix1QkFBa0IsR0FBRyxLQUFLLENBQUM7UUFDM0IsNEJBQXVCLEdBQUcsS0FBSyxDQUFDO1FBK1doQyxpQkFBWSxHQUFHLFlBQVksQ0FBQztRQXFNNUIsb0NBQStCLEdBQVUsRUFBRSxDQUFDO0lBb0N4RCxDQUFDO0lBdGxCVSxVQUFVLENBQUMsU0FBeUI7UUFDdkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDO1FBQ3pCLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFFRCw0QkFBNEI7UUFDeEIsSUFB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