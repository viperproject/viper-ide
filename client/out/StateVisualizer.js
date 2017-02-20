'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
const HeapProvider_1 = require('./HeapProvider');
const vscode = require('vscode');
const Helper_1 = require('./Helper');
const ExtensionState_1 = require('./ExtensionState');
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
        this.showHeapGraph();
        //NO LONGER NEEDED: since we use viz.js now:
        // this.generateSvg(heapGraph.heap, Log.dotFilePath(index, false), Log.svgFilePath(index, false), () => {
        //     this.generateSvg(heapGraph.oldHeap, Log.dotFilePath(index, true), Log.svgFilePath(index, true), () => {
        //         this.generateSvg(heapGraph.partialExecutionTree, Log.getPartialExecutionTreeDotPath(index), Log.getPartialExecutionTreeSvgPath(index), () => {
        //             this.showHeapGraph();
        //         });
        //     });
        // });
    }
    pushState(heapGraph) {
        if (Helper_1.Helper.getConfiguration("advancedFeatures").compareStates === true) {
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
        else {
            this.setState(heapGraph);
        }
    }
    setState(heapGraph) {
        let currentIndex = 0;
        if (Helper_1.Helper.getConfiguration("advancedFeatures").compareStates === true) {
            currentIndex = this.provider.nofHeapGraphs() > 0 ? 1 : 0;
        }
        if (this.currentState != heapGraph.state) {
            this.previousState = this.currentState;
            this.currentState = heapGraph.state;
        }
        this.createAndShowHeap(heapGraph, currentIndex);
        this.nextHeapIndex = 1;
        let currentHeap = this.provider.getCurrentHeap();
        let previousHeap = this.provider.getPreviousHeap();
        this.previousState = previousHeap ? previousHeap.state : -1;
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
    //NO LONGER NEEDED: since we use viz.js now:
    // public generateSvg(heapGraphAsDot: string, dotFilePath: string, svgFilePath: string, callback, writeGraphDescriptionToFile: boolean = true) {
    //     try {
    //         //store graph description in file
    //         if (writeGraphDescriptionToFile && heapGraphAsDot) {
    //             Log.writeToDotFile(heapGraphAsDot, dotFilePath);
    //         }
    //         //get dot Executable
    //         State.instance.client.sendRequest(Commands.GetDotExecutable, null).then((dotExecutable: string) => {
    //             //the path should have already been checked by the server, but check again to be sure
    //             if (!dotExecutable || !fs.existsSync(dotExecutable)) {
    //                 Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
    //                 return;
    //             }
    //             if (!fs.existsSync(dotFilePath)) {
    //                 Log.error("Cannot generate svg, dot file not found at: " + dotFilePath);
    //             }
    //             //convert dot to svg
    //             let command = `"${dotExecutable}" -Tsvg "${dotFilePath}" -o "${svgFilePath}"`;
    //             Log.log("Dot Command: " + command, LogLevel.Debug);
    //             this.graphvizProcess = child_process.exec(command);
    //             this.graphvizProcess.on('exit', code => {
    //                 //show svg
    //                 if (code != 0) {
    //                     Log.error("Could not convert dot to svg, exit code: " + code, LogLevel.Debug);
    //                 }
    //                 Log.log(`${path.basename(dotFilePath)} converted to ${path.basename(svgFilePath)}`, LogLevel.Debug);
    //                 callback();
    //             });
    //             this.graphvizProcess.stdout.on('data', data => {
    //                 Log.log("[Graphviz] " + data, LogLevel.Debug);
    //             });
    //             this.graphvizProcess.stderr.on('data', data => {
    //                 Log.log("[Graphviz stderr] " + data, LogLevel.Debug);
    //             });
    //         });
    //     } catch (e) {
    //         Log.error("Error generating svg for: " + dotFilePath + ": " + e);
    //     }
    // }
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
                let isCurrentStateErrorState = false;
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
                        isCurrentStateErrorState = option.isErrorState;
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
                    let simpleMode = Helper_1.Helper.getConfiguration("advancedFeatures").simpleMode;
                    if (!this.executionTrace || simpleMode !== true || (simpleMode === true && isCurrentStateErrorState)) {
                        let params = { uri: this.uri.toString(), clientState: this.currentState };
                        ExtensionState_1.State.instance.client.sendRequest(ViperProtocol_1.Commands.GetExecutionTrace, params).then((trace) => {
                            this.executionTrace = trace;
                            this.markExecutionTrace(darkGraphs);
                        });
                    }
                    else {
                        this.markExecutionTrace(darkGraphs);
                    }
                }
            }
        }
    }
    markExecutionTrace(darkGraphs) {
        Log_1.Log.log("Mark Execution Trace", ViperProtocol_1.LogLevel.Debug);
        this.executionTrace.forEach(element => {
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
    showAllDecorations() {
        try {
            if (StateVisualizer.showStates && this.decorationOptions) {
                Log_1.Log.log("Showing all state markers");
                let darkGraphs = Helper_1.Helper.getConfiguration("advancedFeatures").darkGraphs === true;
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    let option = this.decorationOptions[i];
                    //expand all states
                    this.expand(option);
                    if (option.index == this.currentState) {
                        this.color(option, ViperProtocol_1.StateColors.currentState(darkGraphs), darkGraphs);
                    }
                    else if (option.index == this.previousState) {
                        this.color(option, ViperProtocol_1.StateColors.previousState(darkGraphs), darkGraphs);
                        continue;
                    }
                    else {
                        this.color(option, ViperProtocol_1.StateColors.interestingState(darkGraphs), darkGraphs);
                    }
                }
                this.showDecorations();
            }
        }
        catch (e) {
            Log_1.Log.error("Error showing all states: " + e);
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
                    Log_1.Log.log("Special chars removed from closed file " + this.viperFile.name(), ViperProtocol_1.LogLevel.Info);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RhdGVWaXN1YWxpemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1N0YXRlVmlzdWFsaXplci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixzQkFBb0IsT0FBTyxDQUFDLENBQUE7QUFDNUIsZ0NBQXVNLGlCQUFpQixDQUFDLENBQUE7QUFDek4sTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFFekIsK0JBQTZCLGdCQUFnQixDQUFDLENBQUE7QUFDOUMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMseUJBQXVCLFVBQVUsQ0FBQyxDQUFBO0FBQ2xDLGlDQUFzQixrQkFBa0IsQ0FBQyxDQUFBO0FBY3pDO0lBQUE7UUFJSSxvQkFBZSxHQUFHLEdBQUcsQ0FBQztRQU10QixlQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUluRSxpQkFBWSxHQUFZLEtBQUssQ0FBQztRQVc5QixrQkFBYSxHQUFHLENBQUMsQ0FBQztRQUVWLHlCQUFvQixHQUFHLEtBQUssQ0FBQztRQUM3Qix1QkFBa0IsR0FBRyxLQUFLLENBQUM7UUFDM0IsNEJBQXVCLEdBQUcsS0FBSyxDQUFDO1FBNmFoQyxpQkFBWSxHQUFHLFlBQVksQ0FBQztRQXFNNUIsb0NBQStCLEdBQVUsRUFBRSxDQUFDO0lBb0N4RCxDQUFDO0lBcHBCVSxVQUFVLENBQUMsU0FBeUI7UUFDdkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7UUFDM0IsSUFBSSxDQUFDLEdBQUcsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDO1FBQ3pCLElBQUksQ0FBQyw0QkFBNEIsRUFBRSxDQUFDO0lBQ3hDLENBQUM7SUFFRCw0QkFBNEI7UUFDeEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLDJCQUFZLEVBQUUsQ0FBQztRQUNuQyxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsR0FB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