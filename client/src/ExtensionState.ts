/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, StreamInfo } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as child_process from "child_process";
import * as readline from 'readline';
import { Commands, LogLevel, ViperSettings } from './ViperProtocol';
import { Log } from './Log';
import { ViperFileState } from './ViperFileState';
import Uri from 'vscode-uri';
import { Helper } from './Helper';
import { StateVisualizer } from './StateVisualizer';
import { Color, StatusBar } from './StatusBar';
import { VerificationController, Task } from './VerificationController';
import { UnitTestCallback } from './test/extension.test';
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

    // Set to false for debuggin. Should eventually be changed back to true.
    public static autoVerify: boolean = false;

    //status bar
    public static statusBarItem: StatusBar;
    public static statusBarProgress: StatusBar;
    public static backendStatusBar: StatusBar;
    public static abortButton: StatusBar;
    
    public static diagnosticCollection: vscode.DiagnosticCollection;

    public static checkedSettings:ViperSettings;

    public static viperApi: ViperApi;

    public static getTimeoutOfActiveBackend():number{
        if (!this.checkedSettings) {
            //TODO Make this a settable parameter.
            return 10000;
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

    public static setLastActiveFile(uri: Uri | string | vscode.Uri, editor: vscode.TextEditor): ViperFileState {
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

    public static getVisualizer(uri: Uri | string | vscode.Uri): StateVisualizer {
        let fileState = this.getFileState(uri);
        return fileState ? fileState.stateVisualizer : null;
    }

    // retrieves the requested file, creating it when needed
    public static getFileState(uri: Uri | string | vscode.Uri): ViperFileState {
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
        let serverOptions: ServerOptions;
        if (Helper.attachToViperServer()) {
            const connectionInfo = {
                host: Helper.getViperServerAddress(),
                port: Helper.getViperServerPort()
            }
            serverOptions = () => State.connectToServer(connectionInfo);
        } else {
            const serverBin = Helper.getServerJarPath(Helper.isNightly());
            // check if server binary exists:
            if (!fs.existsSync(serverBin)) {
                const msg = `The server binary ${serverBin} does not exist. Please update Viper Tools.`;
                vscode.window.showErrorMessage(msg);
                return Promise.reject(msg);
            }
            serverOptions = () => State.startServerProcess(serverBin);
        }
  
        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // register server for viper files
            documentSelector: [{ scheme: 'file', language: 'viper' }],
            synchronize: {
                // Synchronize the setting section 'viperSettings' to the server
                configurationSection: 'viperSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: fileSystemWatcher
            }
        }

        State.client = new LanguageClient('viperServer', 'ViperServer', serverOptions, clientOptions, brk);

        Log.log("Start Language Server", LogLevel.Info);
        // Create the language client and start the client.
        const disposable = State.client.start();

        // Push the disposable to the context's subscriptions so that the
        // client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);
        this.context = context;

        return State.client.onReady();
    }

    // creates a server for the given server binary
    private static async startServerProcess(serverBin: string): Promise<StreamInfo> {
        const javaPath = await State.checkDependenciesAndGetJavaPath();

        // spawn ViperServer and get port number on which it is reachable:
        const portNr = await new Promise((resolve:(port: number) => void, reject) => {
            const portRegex = /<ViperServerPort:(\d+)>/;
            let portFound: boolean = false;
            function stdOutLineHandler(line: string): void {
                // check whether `line` contains the port number
                if (!portFound) {
                    const match = line.match(portRegex);
                    if (match != null && match[1] != null) {
                        const port = Number(match[1]);
                        if (port != NaN) {
                            portFound = true;
                            resolve(port);
                        }
                    }
                }
            }

            const processArgs = Helper.getServerProcessArgs(serverBin);
            Helper.log(`Viper-IDE: Running '${javaPath} ${processArgs.join(' ')}'`);
            const serverProcess = child_process.spawn(javaPath, processArgs);
            // redirect stdout to readline which nicely combines and splits lines
            const rl = readline.createInterface({ input: serverProcess.stdout });
            rl.on('line', stdOutLineHandler);
            serverProcess.stdout.on('data', (data) => Helper.logServer(data));
            serverProcess.stderr.on('data', (data) => Helper.logServer(data));
            serverProcess.on('close', (code) => {
                Helper.log(`ViperServer process has ended with return code ${code}`);
            });
            serverProcess.on('error', (err) => {
                const msg = `ViperServer process has encountered an error: ${err}`
                Helper.log(msg);
                reject(msg);
            });
        });

        // connect to server
        return new Promise((resolve: (info: StreamInfo) => void, reject) => {
            const clientSocket = new net.Socket();
            clientSocket.connect(portNr, 'localhost', () => {
                Helper.log(`Connected to ViperServer`);
                resolve({
                reader: clientSocket,
                writer: clientSocket
                });
            });
            clientSocket.on('error', (err) => {
                Helper.log(`Error occurred on connection to ViperServer: ${err}`);
                reject(err);
            });
        });
    }

    // creates a server for the given server binary
    private static async connectToServer(connectionInfo: net.NetConnectOpts): Promise<StreamInfo> {
        await State.checkDependenciesAndGetJavaPath();
        const socket = net.connect(connectionInfo);
        return {
        reader: socket,
        writer: socket
        };
    }

    private static async checkDependenciesAndGetJavaPath(): Promise<string> {
        // test whether java and z3 binaries can be used:
        Helper.log("Checking Java...");
        const javaPath = await Helper.getJavaPath();
        await Helper.spawn(javaPath, ["-version"]);
        Helper.log("Checking Z3...");
        const z3Path = Helper.getZ3Path(Helper.isNightly());
        await Helper.spawn(z3Path, ["--version"]);
        return javaPath;
    }

    public static dispose(): Promise<any> {
        try {
            return new Promise((resolve, reject) => {
                Log.log("Initiating language server shutdown.", LogLevel.Info);
                State.client.stop() // initiate's LSP's termination sequence
            });
        } catch (e) {
            Log.error("Error disposing state: " + e);
        }
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
