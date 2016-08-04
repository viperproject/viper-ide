'use strict';

import {Log} from './Log';
import {StateColors, MethodBorder, Position, HeapGraph, Commands, ViperSettings, LogLevel} from './ViperProtocol';
import * as fs from 'fs';
import child_process = require('child_process');
import {HeapProvider} from './TextDocumentContentProvider';
import * as vscode from 'vscode';
import {Helper} from './Helper';
import {ExtensionState} from './ExtensionState';

export interface StepsAsDecorationOptionsResult {
    decorationOptions: MyDecorationOptions[],
    methodBorders: MethodBorder[],
    stepInfo: StepInfo[],
    globalInfo:string
}

export interface MyDecorationOptions extends vscode.DecorationOptions {
    states: number[];
}

interface StepInfo {
    depth: number,
    methodIndex: number,
    index: number,
    isErrorState: boolean
}

export class StateVisualizer {

    static graphvizProcess: child_process.ChildProcess;
    static provider: HeapProvider;
    static previewUri = vscode.Uri.parse('viper-preview:State Visualization');

    static decoration: vscode.TextEditorDecorationType;
    static decorationOptions: MyDecorationOptions[];
    static textEditorUnderVerification: vscode.TextEditor;
    static methodBorders: MethodBorder[];
    static stepInfo: StepInfo[];
    static globalInfo: string;

    static showStates: boolean = true;

    static shownState: number;
    static selectedPosition: Position;
    static previousState:number;
    static debuggedUri: string;
    static currentDepth: number;
    static debuggedMethodName: string;
    static currentOffset: number;

    static nextHeapIndex = 0;

    public static initialize() {
        this.registerTextDocumentProvider();
    }

    static registerTextDocumentProvider() {
        this.provider = new HeapProvider();
        let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', this.provider);
    }

    static storeNewStates(params: { uri: string, decorations: StepsAsDecorationOptionsResult }) {
        Log.log("Store new States", LogLevel.Debug);
        this.previousState = -1;
        this.decorationOptions = params.decorations.decorationOptions;
        this.stepInfo = params.decorations.stepInfo;
        this.methodBorders = params.decorations.methodBorders;
        this.globalInfo = params.decorations.globalInfo;
        vscode.window.visibleTextEditors.forEach(editor => {
            if (!editor.document || !params) {
                Log.error("invalid arguments for storeNewStates");
            }
            if (editor.document.uri.toString() === params.uri) {
                this.textEditorUnderVerification = editor;
            }
        });
        Log.deleteDotFiles();
        this.showDecorations();
    }

    public static createAndShowHeap(heapGraph: HeapGraph, index: number) {
        if (!heapGraph.heap) {
            Log.error("Error creating heap description");
            return;
        }
        Log.writeToDotFile(heapGraph.heap, index);
        //Log.log(graphDescription, LogLevel.Debug);

        this.selectState(heapGraph.fileUri, heapGraph.state, heapGraph.position);

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

    private static showHeapGraph(heapGraph: HeapGraph, index: number) {
        this.provider.setState(heapGraph, index);
        let dotFileShown = false;
        let heapShown = false;
        vscode.workspace.textDocuments.forEach(element => {
            if (element.fileName === Log.dotFilePath(index)) {
                dotFileShown = true;
            }
            if (element.uri.toString() == this.previewUri.toString()) {
                heapShown = true;
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

    static selectState(uri: string, selectedState: number, pos: Position) {
        if (this.showStates && Helper.isViperSourceFile(uri) && this.decorationOptions) {
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
                        else if (optionState > selectedState && !errorStateFound &&
                            this.stepInfo[optionState].depth <= this.stepInfo[selectedState].depth &&
                            this.stepInfo[optionState].methodIndex === currentMethodIdx) {
                            option.renderOptions.before.color = StateColors.interestingState;
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

    private static getLabel(decoration: MyDecorationOptions, methodIndex: number) {
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
            return `(${label.substring(1, label.length)})⚫`
        }
    }

    static showStateSelection(uri: string, pos: { line: number, character: number }) {
        if (this.showStates && Helper.isViperSourceFile(uri) && this.decorationOptions) {
            //is counter example state?
            for (let i = 0; i < this.decorationOptions.length; i++) {
                let option = this.decorationOptions[i];
                let a = option.range.start;
                if (a.line == pos.line && a.character == pos.character) {
                    if (!this.selectedPosition || this.selectedPosition.line != pos.line || this.selectedPosition.character != pos.character || uri != this.debuggedUri) {
                        this.shownState = this.decorationOptions[i].states[0];
                        this.selectedPosition = pos;
                        this.debuggedUri = uri;
                        Log.log("Request showing the heap of state " + this.shownState);
                        ExtensionState.instance.client.sendRequest(Commands.ShowHeap, {
                            uri: uri,
                            index: this.shownState
                        });
                    } else {
                        //Log.log("State already selected", LogLevel.Debug);
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