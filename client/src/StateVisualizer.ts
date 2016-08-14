'use strict';

import {Log} from './Log';
import {StepInfo, StateColors, MethodBorder, Position, HeapGraph, Commands, ViperSettings, LogLevel} from './ViperProtocol';
import * as fs from 'fs';
import child_process = require('child_process');
import {HeapProvider} from './TextDocumentContentProvider';
import * as vscode from 'vscode';
import {Helper} from './Helper';
import {ExtensionState} from './ExtensionState';
import {ViperFormatter} from './ViperFormatter';
import {ViperFileState} from './ViperFileState';
import * as path from 'path';

export interface StepsAsDecorationOptionsResult {
    decorationOptions: MyDecorationOptions[],
    methodBorders: MethodBorder[],
    stepInfo: StepInfo[],
    globalInfo: string
    uri: string;
}

export interface MyDecorationOptions extends vscode.DecorationOptions {
    states: number[];
}

export class StateVisualizer {

    static showStates: boolean = true;

    viperFile: ViperFileState;

    graphvizProcess: child_process.ChildProcess;
    provider: HeapProvider;
    previewUri = vscode.Uri.parse('viper-preview:State Visualization');

    decoration: vscode.TextEditorDecorationType;
    decorationOptions: MyDecorationOptions[];
    //textEditorUnderVerification: vscode.TextEditor;
    methodBorders: MethodBorder[];
    stepInfo: StepInfo[];
    globalInfo: string;
    uri: vscode.Uri;

    shownState: number;
    selectedPosition: Position;
    previousState: number;
    currentDepth: number;
    debuggedMethodName: string;
    currentOffset: number;

    decorationOptionsOrderedByState: MyDecorationOptions[];

    nextHeapIndex = 0;

    private removingSpecialChars = false;
    private addingSpecialChars = false;

    public initialize(viperFile: ViperFileState) {
        this.viperFile = viperFile;
        this.uri = viperFile.uri;
        this.registerTextDocumentProvider();
    }

    registerTextDocumentProvider() {
        this.provider = new HeapProvider();
        this.provider.stateVisualizer = this;
        let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', this.provider);
    }

    public reset() {
        this.nextHeapIndex = 0;
        this.provider.resetState();
        this.selectedPosition = null;
    }

    storeNewStates(decorations: StepsAsDecorationOptionsResult) {
        Log.log("Store new States", LogLevel.Debug);

        if (!decorations) {
            Log.error("invalid arguments for storeNewStates");
            return;
        }

        this.previousState = -1;
        this.decorationOptions = decorations.decorationOptions;
        this.stepInfo = decorations.stepInfo;
        this.methodBorders = decorations.methodBorders;
        this.globalInfo = decorations.globalInfo;

        Log.deleteDotFiles();
        this.addCharacterToDecorationOptionLocations();
        this.decorationOptionsOrderedByState = [];
        this.completeDecorationOptions();
        this.showDecorations();
    }

    public createAndShowHeap(heapGraph: HeapGraph, index: number) {
        if (!heapGraph.heap) {
            Log.error("Error creating heap description");
            return;
        }
        Log.writeToDotFile(heapGraph.heap, index);
        //Log.log(graphDescription, LogLevel.Debug);

        if (heapGraph.fileUri != this.uri.toString()) {
            Log.error("Uri mismatch in StateVisualizer: " + this.uri.toString() + " expected, " + heapGraph.fileUri + " found.")
            return
        }

        this.selectState(heapGraph.state, heapGraph.position);

        let dotExecutable: string = <string>Helper.getConfiguration("dotExecutable");
        if (!dotExecutable || !fs.existsSync(dotExecutable)) {
            Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
            return;
        }
        //convert dot to svg
        this.graphvizProcess = child_process.exec(`${dotExecutable} -Tsvg "${Log.dotFilePath(index)}" -o "${Log.svgFilePath(index)}"`);
        this.graphvizProcess.on('exit', code => {
            //show svg
            if (code != 0) {
                Log.error("Could not convert graph description to svg, exit code: " + code, LogLevel.Debug);
            }
            Log.log("Graph converted to heap.svg", LogLevel.Debug);
            this.showHeapGraph(heapGraph, index);
        });

        this.graphvizProcess.stdout.on('data', data => {
            Log.log("[Graphviz] " + data, LogLevel.Debug);
        });
        this.graphvizProcess.stderr.on('data', data => {
            Log.log("[Graphviz stderr] " + data, LogLevel.Debug);
        });
    }

    private showHeapGraph(heapGraph: HeapGraph, index: number) {
        this.provider.setState(heapGraph, index);
        let dotFileShown = false;
        let heapShown = false;
        vscode.workspace.textDocuments.forEach(element => {
            if (element.fileName === Log.dotFilePath(index)) {
                dotFileShown = true;
            }
            if (element.uri.toString() == this.previewUri.toString()) {
                //heapShown = true;
            }
        });
        if (!dotFileShown) {
            //Log.log("Show dotFile", LogLevel.Debug);
            Helper.showFile(Log.dotFilePath(index), vscode.ViewColumn.Two);
        }
        this.provider.update(this.previewUri);
        if (!heapShown) {
            //Log.log("Show heap graph", LogLevel.Debug);
            vscode.commands.executeCommand('vscode.previewHtml', this.previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
                Log.error("HTML Preview error: " + reason);
            });
        }
    }

    completeDecorationOptions() {
        for (var i = 0; i < this.decorationOptions.length; i++) {
            let option = this.decorationOptions[i];
            //fill decorationOptionsOrderedByState
            option.states.forEach(state => {
                this.decorationOptionsOrderedByState[state] = option;
            });
        }
    }

    selectState(selectedState: number, pos: Position) {
        if (StateVisualizer.showStates && this.decorationOptions) {
            //state should be visualized
            if (selectedState >= 0 && selectedState < this.stepInfo.length) {
                //its in range
                this.shownState = selectedState;
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
                    option.renderOptions.before.color = StateColors.uninterestingState;
                    for (var j = 0; j < option.states.length; j++) {
                        var optionState = option.states[j];
                        if (optionState == selectedState) {
                            //if it's the current step -> red
                            option.renderOptions.before.color = StateColors.currentState;
                            break;
                        }
                        if (optionState == this.previousState) {
                            option.renderOptions.before.color = StateColors.previousState;
                            break;
                        }
                        else if (this.stepInfo[optionState].isErrorState && this.stepInfo[optionState].methodIndex === currentMethodIdx) {
                            option.renderOptions.before.color = StateColors.errorState;
                            errorStateFound = true;
                        }
                        else if (!errorStateFound &&
                            this.stepInfo[optionState].depth <= this.stepInfo[selectedState].depth
                            && this.stepInfo[optionState].methodIndex === currentMethodIdx //&& optionState > selectedState
                        ) {
                            option.renderOptions.before.color = StateColors.interestingState;
                        }
                    }
                }
                if (StateVisualizer.showStates) {
                    this.showDecorations();
                }

                this.previousState = selectedState;
            }
        }
    }

    private getLabel(decoration: MyDecorationOptions, methodIndex: number) {
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
        } else {
            return `(${label.substring(1, label.length)})`
        }
    }

    showStateSelection(pos: { line: number, character: number }) {
        if (StateVisualizer.showStates && this.decorationOptions) {
            //is counter example state?
            for (let i = 0; i < this.decorationOptions.length; i++) {
                let option = this.decorationOptions[i];
                let a = option.range.start;
                if (a.line == pos.line && a.character == pos.character) {
                    if (!this.selectedPosition || this.selectedPosition.line != pos.line || this.selectedPosition.character != pos.character) {
                        this.shownState = this.decorationOptions[i].states[0];
                        this.selectedPosition = pos;
                        Log.log("Request showing the heap of state " + this.shownState);
                        ExtensionState.instance.client.sendRequest(Commands.ShowHeap, {
                            uri: this.uri.toString(),
                            index: this.shownState
                        });
                    } else {
                        //Log.log("State already selected", LogLevel.Debug);
                    }
                }
            }
        }
    }

    hideDecorations() {
        Log.log("Hide decorations", LogLevel.Debug);
        this.doHideDecorations();
        this.viperFile.decorationsShown = false;
    }

    private doHideDecorations() {
        if (this.decoration) {
            this.decoration.dispose();
        }
    }

    showDecorations() {
        let editor = this.viperFile.editor;
        if (StateVisualizer.showStates && this.decorationOptions) {
            if (editor.document.uri.toString() !== this.uri.toString()) {
                Log.log("Don't show states file mismatch", LogLevel.Debug);
                return;
            }
            this.viperFile.decorationsShown = true;
            Log.log("Show decorations", LogLevel.Debug);
            this.doHideDecorations();
            this.decoration = vscode.window.createTextEditorDecorationType({});
            if (editor) {
                editor.setDecorations(this.decoration, this.decorationOptions);
            } else {
                Log.error("cannot show decorations: no editor to show it in");
            }
        }
    }


    //SPECIAL CHARACTER METHODS

    private areSpecialCharsBeingModified(s: string) {
        if (this.addingSpecialChars) {
            Log.log(s + " they are already being added to "+ this.viperFile.name(),LogLevel.Debug);
            return true;
        }
        if (this.removingSpecialChars) {
            Log.log(s + " they are already being removed from "+ this.viperFile.name(),LogLevel.Debug);
            return true;
        }
        return false;
    }

    addCharacterToDecorationOptionLocations() {
        if (this.areSpecialCharsBeingModified("Don't add special chars,")) return;
        try {
            this.addingSpecialChars = true;
            this.viperFile.specialCharsShown = true;
            let editor = this.viperFile.editor;
            if (StateVisualizer.showStates && editor) {
                Log.log("addCharacterToDecorationOptionLocations", LogLevel.Debug);
                let openDoc = editor.document;
                let edit = new vscode.WorkspaceEdit();
                this.decorationOptions.forEach((element, i) => {
                    let p = this.stepInfo[i].originalPosition;
                    //need to create a propper vscode.Position object
                    let pos = new vscode.Position(p.line, p.character);
                    edit.insert(openDoc.uri, pos, '⦿');
                });
                vscode.workspace.applyEdit(edit).then(params => {
                    openDoc.save().then(() => {
                        this.addingSpecialChars = false;
                    });
                });
            }
        } catch (e) {
            this.addingSpecialChars = false;
            Log.error("Error adding special chars: " + e);
        }
    }

    public removeSpecialCharacters(callback) {
        if (this.areSpecialCharsBeingModified("Don't remove special chars,")) return;
        try {
            if (!this.viperFile.editor || !this.viperFile.editor.document) {
                Log.error("Error removing special chars, no document to remove it from");
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
                if (content[i] === '⦿') {
                    if (!found) {
                        found = true;
                        start = i;
                    }
                } else if (found) {
                    let range = new vscode.Range(openDoc.positionAt(start), openDoc.positionAt(i));
                    edit.delete(openDoc.uri, range);
                    found = false;
                }

            }
            vscode.workspace.applyEdit(edit).then(resolve => {
                if (resolve) {
                    this.viperFile.editor.document.save().then(saved => {
                        Log.log("Special Chars removed from file " + this.viperFile.name(), LogLevel.Info)
                        this.removingSpecialChars = false;
                        this.viperFile.specialCharsShown = false;
                        callback();
                    });
                } else {
                    this.removingSpecialChars = false;
                }
            });
        } catch (e) {
            this.removingSpecialChars = false;
            Log.error("Eror removing special characters: " + e);
        }
    }

    public removeSpecialCharsFromClosedDocument(callback) {
        if (this.areSpecialCharsBeingModified("Don't remove special chars from closed file,")) return;
        try {
            this.removingSpecialChars = true;
            fs.readFile(this.uri.fsPath, (err, data) => {
                if (!err && data) {
                    let newData = data.toString();
                    if (newData.indexOf("⦿") >= 0) {
                        newData = newData.replace(/⦿/g, "");
                        fs.writeFileSync(this.uri.fsPath, newData);
                    }
                    Log.log("Special Chars removed from closed file " + this.viperFile.name(), LogLevel.Info)
                    this.removingSpecialChars = false;
                    this.viperFile.specialCharsShown = false;
                    callback();
                }
                else {
                    this.removingSpecialChars = false;
                    Log.error("cannot remove special chars from closed file: " + err.message);
                }
            });
        } catch (e) {
            this.removingSpecialChars = false;
            Log.error("Error removing special chars form closed file: " + e);
        }
    }
}