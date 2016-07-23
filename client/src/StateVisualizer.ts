'use strict';

import {Log} from './Log';
import {HeapGraph, Commands, ViperSettings, LogLevel} from './ViperProtocol';
import * as fs from 'fs';
import child_process = require('child_process');
import {HeapProvider} from './TextDocumentContentProvider';
import * as vscode from 'vscode';
import {Helper} from './Helper';
import {ExtensionState} from './ExtensionState';

export class StateVisualizer {

    static graphvizProcess: child_process.ChildProcess;
    static provider: HeapProvider;
    static previewUri = vscode.Uri.parse('viper-preview://heapVisualization');

    static decoration: vscode.TextEditorDecorationType;
    static decorationOptions: vscode.DecorationOptions[];
    static textEditorUnderVerification: vscode.TextEditor;

    static showStates: boolean = true;

    public static initialize() {
        this.registerTextDocumentProvider();
    }

    static registerTextDocumentProvider() {
        this.provider = new HeapProvider();
        let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', this.provider);
    }

    static storeNewStates(params: { uri: string, decorations: vscode.DecorationOptions[] }) {
        this.decorationOptions = params.decorations;
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

    static onDidChangeTextEditorSelection(change) {
        if (this.showStates) {
            if (change.textEditor.document.fileName == "\\2") return;
            let selection = change.textEditor.selection;
            if (!selection) {
                Log.log("No selection", LogLevel.Debug);
            } else {
                //Log.log("Selection at " + selection.start.line + ":" + selection.start.character, LogLevel.Debug);
            }
            if (this.decorationOptions) {
                let change = false;
                let selectedState = -1;
                for (var i = 0; i < this.decorationOptions.length; i++) {
                    var option = this.decorationOptions[i];
                    let a = option.range.start;
                    let b = selection.start;
                    if (selectedState < 0 && a.line == b.line && a.character == b.character && option.renderOptions.before.color != 'blue') {
                        option.renderOptions.before.color = 'blue';
                        selectedState = i;
                        Log.log("Request showing the heap of state " + i);
                        ExtensionState.instance.client.sendRequest(Commands.ShowHeap, { uri: vscode.window.activeTextEditor.document.uri.toString(), index: i });
                        change = true;
                    } else if (selectedState >= 0 && option.renderOptions.before.color != 'grey') {
                        option.renderOptions.before.color = 'grey';
                        change = true;
                    }
                    else if (option.renderOptions.before.color != 'red') {
                        option.renderOptions.before.color = 'red';
                        change = true;
                    }
                }
                if (this.showStates && change && selectedState >= 0) {
                    this.showDecorations();
                }
            }
        }
    }

    static hideDecorations() {
        if (this.decoration)
            this.decoration.dispose();
    }
    static showDecorations() {
        if (this.showStates && this.decorationOptions) {
            this.hideDecorations();
            this.decoration = vscode.window.createTextEditorDecorationType({});
            if (this.textEditorUnderVerification) {
                this.textEditorUnderVerification.setDecorations(this.decoration, this.decorationOptions);
            }
        }
    }
}