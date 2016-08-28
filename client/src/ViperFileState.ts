'use strict'

import {LogLevel, Success} from './ViperProtocol';
import * as vscode from 'vscode';
import {StateVisualizer} from './StateVisualizer';
import {HeapProvider} from './TextDocumentContentProvider';
import {Log} from './Log';
import * as path from 'path';

export class ViperFileState {

    constructor(uri: vscode.Uri) {
        this.verified = false;
        this.success = Success.None;
        this.verifying = false;
        this.open = true;
        this.changed = true;
        this.onlySpecialCharsChanged = false;
        this.needsVerification = false;
        this.decorationsShown = false;
        this.specialCharsShown = false; //TODO: is it really false
        this.uri = uri;
        this.stateVisualizer = new StateVisualizer();
        this.stateVisualizer.initialize(this);
        this.initializeEditor();
    }

    uri: vscode.Uri;
    verified: boolean;
    success: Success;
    verifying: boolean;
    open: boolean;
    changed: boolean;
    onlySpecialCharsChanged: boolean;
    needsVerification: boolean;
    decorationsShown: boolean;
    specialCharsShown: boolean;

    editor: vscode.TextEditor;

    stateVisualizer: StateVisualizer;

    public fileOpened() {
        this.open = true;
    }

    public name(): string {
        return path.basename(this.uri.toString());
    }

    //for the first open file we need to load the editor like this.
    //for the others the editor is set once the editor is active
    private initializeEditor() {
        vscode.window.visibleTextEditors.forEach(editor => {
            if (editor.document.uri.toString() === this.uri.toString()) {
                this.editor = editor;
            }
        });
        /*if (this.editor) {
            this.stateVisualizer.removeSpecialCharacters(() => { });
        }*/
    }

    public setEditor(editor: vscode.TextEditor) {
        if (!this.editor) {
            this.editor = editor;
            //this.stateVisualizer.removeSpecialCharacters(() => { });
        } else {
            this.editor = editor;
        }
    }
}