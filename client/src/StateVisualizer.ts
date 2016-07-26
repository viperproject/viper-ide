'use strict';

import {Log} from './Log';
import {MethodBorder, Position, HeapGraph, Commands, ViperSettings, LogLevel} from './ViperProtocol';
import * as fs from 'fs';
import child_process = require('child_process');
import {HeapProvider} from './TextDocumentContentProvider';
import * as vscode from 'vscode';
import {Helper} from './Helper';
import {ExtensionState} from './ExtensionState';

export interface StepsAsDecorationOptionsResult {
    decorationOptions: [MyDecorationOptions],
    methodBorders: [MethodBorder]
    stepInfo: [StepInfo]
}

export interface MyDecorationOptions extends vscode.DecorationOptions {
    states: [number];
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
    static previewUri = vscode.Uri.parse('viper-preview://heapVisualization');

    static decoration: vscode.TextEditorDecorationType;
    static decorationOptions: MyDecorationOptions[];
    static textEditorUnderVerification: vscode.TextEditor;
    static methodBorders: [MethodBorder];
    static stepInfo: [StepInfo];

    static showStates: boolean = true;

    static shownState: number;
    static selectedPosition: Position;
    static debuggedUri: string;
    static currentDepth: number;

    public static initialize() {
        this.registerTextDocumentProvider();
    }

    static registerTextDocumentProvider() {
        this.provider = new HeapProvider();
        let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', this.provider);
    }

    static storeNewStates(params: { uri: string, decorations: StepsAsDecorationOptionsResult }) {
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

    public static showHeap(heapGraph: HeapGraph) {
        if (!heapGraph.heap) {
            Log.error("Error creating heap description");
            return;
        }
        Log.writeToDotFile(heapGraph.heap);
        //Log.log(graphDescription, LogLevel.Debug);

        this.selectState(heapGraph.fileUri, heapGraph.state, heapGraph.position);

        let dotExecutable: string = <string>Helper.getConfiguration("dotExecutable");
        if (!dotExecutable || !fs.existsSync(dotExecutable)) {
            Log.hint("Fix the path to the dotExecutable, no file found at: " + dotExecutable);
            return;
        }
        //convert dot to svg
        this.graphvizProcess = child_process.exec(`${dotExecutable} -Tsvg "${Log.dotFilePath}" -o "${Log.svgFilePath}"`);

        this.graphvizProcess.on('exit', code => {
            //show svg
            if (code != 0) {
                Log.error("Could not convert graph description to svg, exit code: " + code, LogLevel.Debug);
            }
            Log.log("Graph converted to heap.svg", LogLevel.Debug);
            this.showHeapGraph(heapGraph);
        });

        this.graphvizProcess.stdout.on('data', data => {
            Log.log("[Graphviz] " + data, LogLevel.Debug);
        });
        this.graphvizProcess.stderr.on('data', data => {
            Log.log("[Graphviz stderr] " + data, LogLevel.Debug);
        });
    }

    private static showHeapGraph(heapGraph: HeapGraph) {
        this.provider.setState(heapGraph);
        Helper.showFile(Log.dotFilePath, vscode.ViewColumn.Two);
        this.provider.update(this.previewUri);
        vscode.commands.executeCommand('vscode.previewHtml', this.previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
            vscode.window.showErrorMessage(reason);
        });
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
                            this.stepInfo[optionState].depth <= this.stepInfo[selectedState].depth
                        /*&& this.methodIndices[optionState] === currentMethodIdx*/) {
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
        Log.log("Show decorations", LogLevel.Debug);
        if (this.showStates && this.decorationOptions) {
            this.hideDecorations();
            this.decoration = vscode.window.createTextEditorDecorationType({});
            if (this.textEditorUnderVerification) {
                this.textEditorUnderVerification.setDecorations(this.decoration, this.decorationOptions);
            }
        }
    }
}