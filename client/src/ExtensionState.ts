/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';
import * as child_process from "child_process";
import { LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as net from 'net';
import * as path from 'path';
import * as readline from 'readline';
import * as unusedFilename from 'unused-filename';
import { Location } from 'vs-verification-toolbox';
import { Backend, Common, LogLevel } from './ViperProtocol';
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

    public static activeBackend: Backend;
    public static isActiveViperEngine: boolean = true;

    public static unitTest: UnitTestCallback;

    public static autoVerify: boolean = true;

    //status bar
    public static statusBarItem: StatusBar;
    public static statusBarProgress: StatusBar;
    public static backendStatusBar: StatusBar;
    public static abortButton: StatusBar;
    
    public static diagnosticCollection: vscode.DiagnosticCollection;

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
        let uriObject: vscode.Uri = Common.uriToObject(uri);
        let uriString: string = Common.uriToString(uri);

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

    public static async startLanguageServer(context: vscode.ExtensionContext, fileSystemWatcher: vscode.FileSystemWatcher, location: Location): Promise<void> {
        const policy = Settings.getServerPolicy();
        let serverOptions: ServerOptions;
        let serverDisposable: Disposable;
        if (policy.create) {
            const { streamInfo, disposable } = await State.startServerProcess(location);
            serverDisposable = disposable;
            serverOptions = () => Promise.resolve(streamInfo);
        } else {
            serverOptions = () => State.connectToServer(policy.address, policy.port);
        }

        const traceOutputForCi: vscode.OutputChannel = {
            name: "Output Channel forwarding to log file",
            append: function (value: string): void {
                Log.logWithOrigin("LSP trace", value, LogLevel.LowLevelDebug);
            },
            appendLine: function (value: string): void {
                Log.logWithOrigin("LSP trace", value, LogLevel.LowLevelDebug);
            },
            replace: function (value: string): void {},
            clear: function (): void {},
            show: function (param: any): void {},
            hide: function (): void {},
            dispose: function (): void {}
        };

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: [{ scheme: 'file', language: 'viper' }],
            synchronize: {
                // Synchronize the setting section 'viperSettings' to the server
                configurationSection: 'viperSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: fileSystemWatcher
            },
            // redirect output while unit testing to the log file as no UI is available:
            traceOutputChannel: State.unitTest ? traceOutputForCi : undefined
        }

        // the ID `viperserver` has to match the first part of `viperserver.trace.server` controlling the amount of tracing
        State.client = new LanguageClient('viperserver', 'Viper IDE - ViperServer Communication', serverOptions, clientOptions);

        // Create the language client and start the client.
        const disposable = State.client.start();
        // Push the disposable to the context's subscriptions so that the
        // client can be deactivated on extension deactivation
        context.subscriptions.push(disposable);
        context.subscriptions.push(serverDisposable);

        return State.client.onReady();
    }

    /**creates a server for the given server binary; the disposable object kills the server process */
    private static async startServerProcess(location: Location): Promise<{ streamInfo: StreamInfo, disposable: Disposable }> {
        const javaPath = (await Settings.getJavaPath()).path;
        const cwd = await Settings.getJavaCwd();
        const logDirectory = Helper.getLogDir();
        const serverLogFile = unusedFilename.sync(path.join(logDirectory, "viperserver.log"));
        const processArgs = await Settings.getServerJavaArgs(location, "viper.server.ViperServerRunner");
        const serverArgs = await Settings.getServerArgs(Log.logLevel, serverLogFile);

        // spawn ViperServer and get port number on which it is reachable:
        const { port: portNr, disposable: disposable } = await new Promise((resolve:(res: { port: number, disposable: Disposable }) => void, reject) => {
            // we use `--singleClient` such that the server correctly terminates if the client sends the exit notification:
            const command = `"${javaPath}" ${processArgs} ${serverArgs}`; // processArgs & serverArgs are already escaped but escape javaPath as well.
            Log.log(`Spawning ViperServer with ${command}`, LogLevel.Verbose);
            const serverProcess = child_process.spawn(command, [], { shell: true, cwd: cwd });
            Log.log(`ViperServer has been spawned and has PID ${serverProcess.pid}`, LogLevel.Verbose);
            /** this function should be invoked when the ViperServer process has ended */
            let viperServerProcessHasEnded: () => void;
            const onCloseViperServerProcess = new Promise<void>(resolve => { viperServerProcessHasEnded = resolve; });
            // note: do not use construct an object of type `vscode.Disposable` (using its constructor)
            // since the resulting disposable does not seem to be awaitable.
            const disposable = { dispose: async () => {
                const success = serverProcess.kill('SIGTERM');
                // `kill` only signals the process to exit. Thus, wait until process has indeed terminated:
                Log.log(`Awaiting termination of the ViperServer process`, LogLevel.Debug);
                await onCloseViperServerProcess;
                if (success) {
                    Log.log(`Killing ViperServer (PID ${serverProcess.pid}) has succeeded`, LogLevel.Verbose);
                } else {
                    Log.log(`Killing ViperServer (PID ${serverProcess.pid}) has failed`, LogLevel.Info);
                }
            }};

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
                            resolve({ port, disposable });
                        }
                    }
                }
            }

            // redirect stdout to readline which nicely combines and splits lines
            const rl = readline.createInterface({ input: serverProcess.stdout });
            rl.on('line', stdOutLineHandler);
            serverProcess.stdout.on('data', (data) => Log.log(data, LogLevel.Verbose, true));
            serverProcess.stderr.on('data', (data) => Log.log(data, LogLevel.Verbose, true));
            serverProcess.on('close', (code) => {
                const msg = `ViperServer process has ended with return code ${code}`;
                Log.log(msg, LogLevel.Info, true);
                // reject the promise (this covers the case where ViperServer crashes during startup
                // and thus the promise has not been resolved yet. In case the promise has already
                // been resolved, this call to reject is simply ignored.)
                reject(new Error(msg));
                viperServerProcessHasEnded();
            });
            serverProcess.on('error', (err) => {
                const msg = `ViperServer process has encountered an error: ${err}`;
                Log.log(msg, LogLevel.Info); // TODO: remove
                Log.log(msg, LogLevel.Info, true);
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
    extensionRestarted: () => void;
}

type Disposable = { dispose(): any };
