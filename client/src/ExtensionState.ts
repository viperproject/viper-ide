/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Commands, LogLevel, ViperSettings } from './ViperProtocol';
import { Log } from './Log';
import { ViperFileState } from './ViperFileState';
import { URI } from 'vscode-uri';
import { Helper } from './Helper';
import { StateVisualizer } from './StateVisualizer';
import { Color, StatusBar } from './StatusBar';
import { VerificationController, Task } from './VerificationController';
import { ViperApi } from './ViperApi';

export class State {
    public static client: LanguageClient;
    public static context: vscode.ExtensionContext;
    public static instance: State;

    public static viperFiles: Map<string, ViperFileState> = new Map<string, ViperFileState>();
    public static isBackendReady: boolean;
    public static isDebugging: boolean;
    public static isVerifying: boolean;
    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);
    private static lastActiveFileUri: string;
    public static verificationController: VerificationController;

    public static activeBackend: string;
    public static isActiveViperEngine: boolean = true;

    public static unitTest: UnitTestCallback;

    public static autoVerify: boolean = true;

    //status bar
    public static statusBarItem: StatusBar;
    public static statusBarProgress: StatusBar;
    public static backendStatusBar: StatusBar;
    public static abortButton: StatusBar;
    
    public static diagnosticCollection: vscode.DiagnosticCollection;

    public static checkedSettings:ViperSettings;

    public static viperApi: ViperApi;

    // public static createState(): State {
    //     if (State.instance) {
    //         return State.instance;
    //     } else {
    //         this.reset();
    //         let newState = new State();
    //         State.instance = newState;
    //         return newState;
    //     }
    // }

    public static getTimeoutOfActiveBackend():number{
        if(!this.checkedSettings){
            Log.error("Error getting timeout, there are no checked Settings available, default to no timeout.");
            return 0;
        }else{
            let backend = this.checkedSettings.verificationBackends.find(b => b.name == this.activeBackend);
            return backend.timeout;
        }
    }

    public static addToWorklist(task: Task) {
        this.verificationController.addToWorklist(task);
    }

    public static initializeStatusBar(context) {
        this.statusBarItem = new StatusBar(10, context);
        this.statusBarItem.update("Hello from Viper", Color.READY).show();

        this.abortButton = new StatusBar(11, context);
        this.abortButton.setCommand("viper.stopVerification");
        this.abortButton.update("$(x) Stop", Color.WARNING);
        this.statusBarProgress = new StatusBar(9, context);
        this.hideProgress();

        this.backendStatusBar = new StatusBar(12, context);
        this.backendStatusBar.show();

        
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
    }

    public static hideProgress(){
        this.abortButton.hide();
        this.statusBarProgress.hide().updateProgressBar(0);
    }

    public static setLastActiveFile(uri: URI | string | vscode.Uri, editor: vscode.TextEditor): ViperFileState {
        this.lastActiveFileUri = uri.toString();
        let lastActiveFile = this.getFileState(uri);
        if (lastActiveFile) {
            lastActiveFile.setEditor(editor);
        }
        return lastActiveFile;
    }

    public static getLastActiveFile(): ViperFileState {
        if (this.lastActiveFileUri) {
            return this.getFileState(this.lastActiveFileUri);
        } else {
            Log.log("WARNING, No file uri of the last active file.", LogLevel.Info)
            return null;
        }
    }

    public static resetViperFiles() {
        Log.log("Reset all viper files", LogLevel.Info);
        this.viperFiles.forEach(element => {
            element.changed = true;
            element.verified = false;
            element.verifying = false;
            element.decorationsShown = false;
            element.stateVisualizer.completeReset();
        });
    }

    public static reset() {
        this.isBackendReady = false;
        this.isDebugging = false;
        this.isVerifying = false;
        this.viperFiles = new Map<string, ViperFileState>();
    }

    public static checkBackendReady(prefix: string) {
        if (!this.isBackendReady) {
            Log.log(prefix + "Backend is not ready.", LogLevel.Debug);
        }
        return this.isBackendReady;
    }

    public static getVisualizer(uri: URI | string | vscode.Uri): StateVisualizer {
        let fileState = this.getFileState(uri);
        return fileState ? fileState.stateVisualizer : null;
    }

    ///retrieves the requested file, creating it when needed
    public static getFileState(uri: URI | string | vscode.Uri): ViperFileState {
        if (!uri) return null;
        let uriObject: vscode.Uri = Helper.uriToObject(uri);
        let uriString: string = Helper.uriToString(uri);

        if (!Helper.isViperSourceFile(uriString)) {
            return null;
        }
        let result: ViperFileState;
        if (!State.viperFiles.has(uriString)) {
            result = new ViperFileState(uriObject)
            State.viperFiles.set(uriString, result);
        } else {
            result = State.viperFiles.get(uriString);
        }
        return result;
    }

    public static startLanguageServer(context: vscode.ExtensionContext, fileSystemWatcher: vscode.FileSystemWatcher, brk: boolean): Promise<void> {
        // The server is implemented in node
        let serverModule = State.context.asAbsolutePath(path.join('server', 'server.js'));

        if (!fs.existsSync(serverModule)) {
            Log.log(serverModule + " does not exist. Reinstall the Extension", LogLevel.Debug);
            return;
        }
        const args = [
            "--globalStorage", Helper.getGlobalStoragePath(context),
            "--logDir", Helper.getLogDir()
        ];
        // The debug options for the server
        const debugOptions = { execArgv: ["--nolazy", "--inspect=5443"] };

        // If the extension is launch in debug mode the debug server options are use
        // Otherwise the run options are used
        let serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc, args: args },
            debug: { module: serverModule, transport: TransportKind.ipc, args: args, options: debugOptions }
        }

        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: [{ scheme: 'file', language: 'viper' }],
            synchronize: {
                // Synchronize the setting section 'viperSettings' to the server
                configurationSection: 'viperSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: fileSystemWatcher
            }
        }

        State.client = new LanguageClient('languageServer', 'Language Server', serverOptions, clientOptions, brk);

        Log.log("Start Language Server", LogLevel.Info);
        // Create the language client and start the client.
        const disposable = State.client.start();
        // Push the disposable to the context's subscriptions so that the
        // client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);

        return State.client.onReady();
    }

    public static async dispose(): Promise<void> {
        if (State.client == null) {
            State.reset();
            return;
        }
        try {
            Log.log("Ask language server to stop all verifications.", LogLevel.Info);
            await State.client.sendRequest(Commands.StopAllVerifications, null);
            Log.log("Language server has stopped verifications", LogLevel.Info);
            await State.client.stop();
            Log.log("Language server has stopped", LogLevel.Info);
        } catch (e) {
            Log.error("Error disposing state: " + e);
        }
        State.reset();
    }

    public static checkOperatingSystem() {
        if ((this.isWin ? 1 : 0) + (this.isMac ? 1 : 0) + (this.isLinux ? 1 : 0) != 1) {
            Log.error("Cannot detect OS")
            return;
        }
        if (this.isWin) {
            Log.log("OS: Windows", LogLevel.Debug);
        }
        else if (this.isMac) {
            Log.log("OS: OsX", LogLevel.Debug);
        }
        else if (this.isLinux) {
            Log.log("OS: Linux", LogLevel.Debug);
        }
    }
}

export interface UnitTestCallback {
    backendStarted: (backend: string) => void;
    verificationComplete: (backend: string, filename: string) => void;
    logFileOpened: () => void;
    allFilesVerified: (verified: number, total: number) => void;
    ideIsIdle: () => void;
    internalErrorDetected: () => void;
    viperUpdateComplete: () => void;
    viperUpdateFailed: () => void;
    verificationStopped: () => void;
    verificationStarted: (backend: string, filename: string) => void;
}
