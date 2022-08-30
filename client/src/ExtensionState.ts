/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';
import { LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as net from 'net';
import * as child_process from "child_process";
import * as readline from 'readline';
import { Location } from 'vs-verification-toolbox';
import { LogLevel, ViperSettings } from './ViperProtocol';
import { Log } from './Log';
import { ViperFileState } from './ViperFileState';
import { URI } from 'vscode-uri';
import { Helper } from './Helper';
import { StateVisualizer } from './StateVisualizer';
import { Color, StatusBar } from './StatusBar';
import { VerificationController, Task } from './VerificationController';
import { ViperApi } from './ViperApi';
import { Settings } from './Settings';

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

    // public static checkedSettings:ViperSettings;

    public static viperApi: ViperApi;

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
        this.backendStatusBar.setCommand("viper.selectBackend");
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

    // retrieves the requested file, creating it when needed
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

    public static async startLanguageServer(context: vscode.ExtensionContext, fileSystemWatcher: vscode.FileSystemWatcher, location: Location, brk: boolean): Promise<void> {
        await State.checkDependenciesAndGetJavaPath(location);
        const policy = Settings.getServerPolicy();
        let serverOptions: ServerOptions;
        let serverDisposable: vscode.Disposable;
        if (policy.create) {
            const {streamInfo, disposable} = await State.startServerProcess(context, location);
            serverDisposable = disposable;
            serverOptions = () => Promise.resolve(streamInfo);
        } else {
            serverOptions = () => State.connectToServer(policy.address, policy.port);
        }

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: [{ scheme: 'file', language: 'viper' }],
            synchronize: {
                // Synchronize the setting section 'viperSettings' to the server
                configurationSection: 'viperSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: fileSystemWatcher
            }
        }

        State.client = new LanguageClient('viperserver', 'Viper Server', serverOptions, clientOptions, brk);

        Log.log("Start Viper Server", LogLevel.Info);
        // Create the language client and start the client.
        const disposable = State.client.start();
        // Push the disposable to the context's subscriptions so that the
        // client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);
        context.subscriptions.push(serverDisposable);

        return State.client.onReady();
    }

    /**creates a server for the given server binary; the disposable object kills the server process */
    private static async startServerProcess(context: vscode.ExtensionContext, location: Location): Promise<{streamInfo: StreamInfo, disposable: vscode.Disposable}> {
        const javaPath = await State.checkDependenciesAndGetJavaPath(location);
        const cwd = await Settings.getJavaCwd();
        const processArgs = await Settings.getServerProcessArgs(location, "viper.server.ViperServerRunner");

        // spawn ViperServer and get port number on which it is reachable:
        const {port: portNr, disposable: disposable} = await new Promise((resolve:(res: {port: number, disposable: vscode.Disposable}) => void, reject) => {
            const command = `"${javaPath}" ${processArgs} --serverMode LSP`; // processArgs is already escaped but escape javaPath as well.
            Log.log(`Spawning ViperServer with ${command}`, LogLevel.Verbose);
            const serverProcess = child_process.spawn(command, [], { shell: true, cwd: cwd });
            Log.log(`ViperServer has been spawned and has PID ${serverProcess.pid}`, LogLevel.Verbose);
            const disposable = new vscode.Disposable(() => serverProcess.kill('SIGINT'));

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
                            resolve({port, disposable});
                        }
                    }
                }
            }

            // redirect stdout to readline which nicely combines and splits lines
            const rl = readline.createInterface({ input: serverProcess.stdout });
            rl.on('line', stdOutLineHandler);
            serverProcess.stdout.on('data', (data) => Log.log(data, LogLevel.Verbose));
            serverProcess.stderr.on('data', (data) => Log.log(data, LogLevel.Verbose));
            serverProcess.on('close', (code) => {
                Log.log(`ViperServer process has ended with return code ${code}`, LogLevel.Info);
            });
            serverProcess.on('error', (err) => {
                const msg = `ViperServer process has encountered an error: ${err}`
                Log.log(msg, LogLevel.Info);
                reject(msg);
            });
        });

        // connect to server
        return State.connectToServer('localhost', portNr)
            .then(info => ({streamInfo: info, disposable: disposable}));
    }

    /** `disposable` is simply passed to the returned promise */
    private static async connectToServer(host: string, port: number): Promise<StreamInfo> {
        return new Promise((resolve: (res: StreamInfo) => void, reject) => {
            const clientSocket = new net.Socket();
            clientSocket.connect(port, host, () => {
                Log.log(`Connected to ViperServer`, LogLevel.Info);
                resolve({
                    reader: clientSocket,
                    writer: clientSocket
                });
            });
            clientSocket.on('error', (err) => {
                Log.log(`Error occurred on connection to ViperServer: ${err}`, LogLevel.Info);
                reject(err);
            });
        });
    }

    private static async checkDependenciesAndGetJavaPath(location: Location): Promise<string> {
        // test whether java and z3 binaries can be used:
        Log.log("Checking Java...", LogLevel.Verbose);
        const javaPath = await Settings.getJavaPath().then(p => p.path);
        await Helper.spawn(javaPath, ["-version"]);
        Log.log("Checking Z3...", LogLevel.Verbose);
        const z3Path = await Settings.getZ3Path(location);
        await Helper.spawn(z3Path, ["--version"]);
        Log.log("Checking Boogie...", LogLevel.Verbose);
        const boogiePath = await Settings.getBoogiePath(location);
        await Helper.spawn(boogiePath, ["-version"]);
        return javaPath;
    }

    public static async dispose(): Promise<void> {
        if (State.client == null) {
            State.reset();
            return;
        }
        try {
            Log.log("Initiating language server shutdown.", LogLevel.Info);
            await State.client.stop(); // initiates LSP's termination sequence
            Log.log("Language server has stopped", LogLevel.Info);
        } catch (e) {
            Log.error("Error disposing state: " + e);
        }
        State.reset();
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
