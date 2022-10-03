/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */

import * as vscode from 'vscode';
import * as path from 'path';
import { Success,TimingInfo } from './ViperProtocol';

export class ViperFileState {

    constructor(uri: vscode.Uri) {
        this.verified = false;
        this.success = Success.None;
        this.verifying = false;
        this.open = true;
        this.changed = true;
        this.uri = uri;
        this.initializeEditor();
    }

    uri: vscode.Uri;
    verified: boolean;
    success: Success;
    verifying: boolean;
    open: boolean;
    changed: boolean;

    timingInfo:TimingInfo;

    editor: vscode.TextEditor;

    public fileOpened(): void {
        this.open = true;
    }

    public name(): string {
        return path.basename(this.uri.toString());
    }

    //for the first open file we need to load the editor like this.
    //for the others the editor is set once the editor is active
    private initializeEditor(): void {
        vscode.window.visibleTextEditors.forEach(editor => {
            if (editor.document.uri.toString() === this.uri.toString()) {
                this.editor = editor;
            }
        });
    }

    public setEditor(editor: vscode.TextEditor): void {
        if (!this.editor) {
            this.editor = editor;
        } else {
            this.editor = editor;
        }
    }
}
