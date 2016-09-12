'use strict';

import {Log} from './Log';
import {ShowHeapParams, StepsAsDecorationOptionsResult, MyProtocolDecorationOptions, StateColors, Position, HeapGraph, Commands, LogLevel} from './ViperProtocol';
import * as fs from 'fs';
import child_process = require('child_process');
import {HeapProvider} from './HeapProvider';
import * as vscode from 'vscode';
import {Helper} from './Helper';
import {ExtensionState} from './ExtensionState';
import {ViperFormatter} from './ViperFormatter';
import {ViperFileState} from './ViperFileState';
import * as path from 'path';

export interface MyDecorationOptions extends vscode.DecorationOptions {
    numberToDisplay: number;
    originalPosition: Position;
    depth: number,
    index: number,
    methodIndex: number,
    isErrorState: boolean
}

export class StateVisualizer {

    static showStates: boolean = false;

    viperFile: ViperFileState;

    graphvizProcess: child_process.ChildProcess;
    provider: HeapProvider;
    previewUri = vscode.Uri.parse('viper-preview:State Visualization');

    decoration: vscode.TextEditorDecorationType;
    decorationOptions: MyDecorationOptions[];
    readyToDebug: boolean = false;
    decorationOptionsByPosition: Map<string, MyDecorationOptions>;
    globalInfo: string;
    uri: vscode.Uri;

    currentState: number;
    previousState: number;
    currentDepth: number;
    debuggedMethodName: string;
    currentOffset: number;

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
        this.currentState = -1;
    }

    public completeReset() {
        this.reset();
        this.decorationOptions = [];
        this.readyToDebug = false;
        this.doHideDecorations();
        this.decorationOptionsByPosition = new Map<string, MyDecorationOptions>();
    }

    //needed to cast the decorations 
    private toDecorationOptions(decorations: MyProtocolDecorationOptions[]): MyDecorationOptions[] {
        let result: MyDecorationOptions[] = [];
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
            })
        });
        return result;
    }

    storeNewStates(decorations: StepsAsDecorationOptionsResult) {
        Log.log("Store new States", LogLevel.Debug);

        if (!decorations) {
            Log.error("invalid arguments for storeNewStates");
            return;
        }

        this.previousState = -1;
        this.decorationOptions = this.toDecorationOptions(decorations.decorationOptions);
        this.globalInfo = decorations.globalInfo;
        this.decorationOptionsByPosition = new Map<string, MyDecorationOptions>();
        this.completeDecorationOptions();
        this.readyToDebug = this.decorationOptions.length > 0;
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
            return;
        }

        this.selectState(heapGraph.methodName, heapGraph.state, heapGraph.position);

        this.generateSvg(Log.dotFilePath(index), Log.svgFilePath(index), () => {
            this.showHeapGraph(heapGraph, index);
        })
    }

    public generateSvg(dotFilePath: string, svgFilePath: string, callback) {
        try {
            let dotExecutable: string = <string>Helper.getConfiguration("dotExecutable");
            if (!dotExecutable || !fs.existsSync(dotExecutable)) {
                Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
                return;
            }

            if (!fs.existsSync(dotFilePath)) {
                Log.error("Cannot generate svg, dot file not found at: " + dotFilePath);
            }
            //convert dot to svg
            this.graphvizProcess = child_process.exec(`${dotExecutable} -Tsvg "${dotFilePath}" -o "${svgFilePath}"`);
            this.graphvizProcess.on('exit', code => {
                //show svg
                if (code != 0) {
                    Log.error("Could not convert dot to svg, exit code: " + code, LogLevel.Debug);
                }
                Log.log(`${path.basename(dotFilePath)} converted to ${path.basename(svgFilePath)}`, LogLevel.Debug);
                callback();
            });
            this.graphvizProcess.stdout.on('data', data => {
                Log.log("[Graphviz] " + data, LogLevel.Debug);
            });
            this.graphvizProcess.stderr.on('data', data => {
                Log.log("[Graphviz stderr] " + data, LogLevel.Debug);
            });
        } catch (e) {
            Log.error("Error generating svg for: " + dotFilePath + ": " + e);
        }
    }

    private showHeapGraph(heapGraph: HeapGraph, index: number) {
        this.provider.setState(heapGraph, index);
        this.provider.update(this.previewUri);
        //Log.log("Show heap graph", LogLevel.Debug);
        vscode.commands.executeCommand('vscode.previewHtml', this.previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
            Log.error("HTML Preview error: " + reason);
        });
    }

    completeDecorationOptions() {
        for (var i = 0; i < this.decorationOptions.length; i++) {
            let option = this.decorationOptions[i];
            //fill in decorationOptionsOrderedByState
            let key = this.vscodePosToKey(option.range.start);
            if (this.decorationOptionsByPosition.has(key)) {
                Log.error("multiple decoration options with the same position detected at: " + key);
            }
            this.decorationOptionsByPosition.set(key, option);
        }
    }

    vscodePosToKey(pos: vscode.Position): string {
        return pos.line + ":" + pos.character;
    }
    posToKey(line: number, character: number): string {
        return line + ":" + character;
    }

    selectState(debuggedMethodName: string, selectedState: number, pos: Position) {
        if (StateVisualizer.showStates && this.decorationOptions) {
            //state should be visualized
            if (selectedState >= 0 && selectedState < this.decorationOptions.length) {
                let selectedOption = this.decorationOptions[selectedState];
                //its in range
                this.currentState = selectedState;
                //this.selectedPosition = this.decorationOptionsOrderedByState[selectedState].range.start;
                this.currentDepth = selectedOption.depth;
                let currentMethodIdx = selectedOption.methodIndex;
                this.debuggedMethodName = debuggedMethodName

                let darkGraphs = <boolean>Helper.getConfiguration("darkGraphs");
                //color labels
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    let option = this.decorationOptions[i];
                    let errorStateFound = false;
                    option.renderOptions.before.contentText = this.getLabel(option, currentMethodIdx);

                    //default is grey
                    option.renderOptions.before.color = StateColors.uninterestingState(darkGraphs);
                    if (option.index == selectedState) {
                        //if it's the current step -> red
                        option.renderOptions.before.color = StateColors.currentState(darkGraphs);
                        continue;
                    }
                    if (option.index == this.previousState) {
                        option.renderOptions.before.color = StateColors.previousState(darkGraphs);
                        continue;
                    }
                    else if (option.isErrorState && option.methodIndex === currentMethodIdx) {
                        option.renderOptions.before.color = StateColors.errorState(darkGraphs);
                        errorStateFound = true;
                    }
                    else if (!errorStateFound &&
                        option.depth <= option.depth
                        && option.methodIndex === currentMethodIdx //&& option.state > selectedState
                    ) {
                        option.renderOptions.before.color = StateColors.interestingState(darkGraphs);
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
        if (decoration.methodIndex == methodIndex)
            return `(${decoration.numberToDisplay})`;
        else
            return "⚫";
    }

    showStateSelection(pos: { line: number, character: number }) {
        if (StateVisualizer.showStates && this.decorationOptionsByPosition) {
            let key = this.posToKey(pos.line, pos.character);
            if (this.decorationOptionsByPosition.has(key)) {
                let selectedState = this.decorationOptionsByPosition.get(key).index;
                if (this.currentState != selectedState) {
                    this.currentState = selectedState
                    Log.log("Request showing the heap of state " + this.currentState, LogLevel.Debug);
                    let params: ShowHeapParams = {
                        uri: this.uri.toString(),
                        clientIndex: this.currentState
                    }
                    ExtensionState.instance.client.sendRequest(Commands.ShowHeap, params);
                } else {
                    //Log.log("State already selected", LogLevel.Debug);
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
            Log.log(s + " they are already being added to " + this.viperFile.name(), LogLevel.Debug);
            return true;
        }
        if (this.removingSpecialChars) {
            Log.log(s + " they are already being removed from " + this.viperFile.name(), LogLevel.Debug);
            return true;
        }
        return false;
    }

    addCharacterToDecorationOptionLocations(callback) {
        Log.log("Try to add special chars to " + this.viperFile.name(), LogLevel.Debug);
        if (this.areSpecialCharsBeingModified("Don't add special chars,")) return;
        if (!this.decorationOptions || this.decorationOptions.length == 0) return;
        try {
            let editor = this.viperFile.editor;
            if (StateVisualizer.showStates && editor && this.decorationOptions) {
                this.addingSpecialChars = true;
                this.viperFile.specialCharsShown = true;
                Log.log("Adding Special characters", LogLevel.Debug);
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
                            Log.log("Special chars added to file " + this.viperFile.name(), LogLevel.Debug);
                            callback();
                        });
                    } else {
                        this.addingSpecialChars = false;
                    }
                }, reason => {
                    Log.error("Error adding special chars: apply was rejected: " + reason)
                    this.addingSpecialChars = false;
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
                if (content[i] === '⦿' || content[i] === '\u200B') {
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
            if (edit.size > 0) {
                this.viperFile.onlySpecialCharsChanged = true;
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
                }, reason => {
                    this.removingSpecialChars = false;
                    Log.error("Error removing special characters: edit was rejected: " + reason);
                });
            } else {
                this.removingSpecialChars = false;
                Log.log("No special chars to remove", LogLevel.Debug)
                callback();
            }
        } catch (e) {
            this.removingSpecialChars = false;
            Log.error("Error removing special characters: " + e);
        }
    }

    public removeSpecialCharsFromClosedDocument(callback) {
        if (this.areSpecialCharsBeingModified("Don't remove special chars from closed file,")) return;
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