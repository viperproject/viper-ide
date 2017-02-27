'use strict';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Commands, LogLevel } from './ViperProtocol';
import { Log } from './Log';
import { ViperFileState } from './ViperFileState';
import Uri from 'vscode-uri/lib/index';
import { Helper } from './Helper';
import { StateVisualizer } from './StateVisualizer';

export class State {
    public client: LanguageClient;
    public context: vscode.ExtensionContext;
    public static instance: State;

    public static viperFiles: Map<string, ViperFileState>;
    public static isBackendReady: boolean;
    public static isDebugging: boolean;
    public static isVerifying: boolean;
    private languageServerDisposable;
    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);
    private static lastActiveFileUri: string;

    public static activeBackend: string;

    public static createState(): State {
        if (State.instance) {
            return State.instance;
        } else {
            this.reset();
            let newState = new State();
            State.instance = newState;
            return newState;
        }
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
        return this.getFileState(this.lastActiveFileUri);
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

    ///retrieves the requested file, creating it when needed
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

    public startLanguageServer(context: vscode.ExtensionContext, fileSystemWatcher: vscode.FileSystemWatcher, brk: boolean) {
        this.context = context;
        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(path.join('server', 'server.js'));

        if (!fs.existsSync(serverModule)) {
            Log.log(serverModule + " does not exist. Reinstall the Extension", LogLevel.Debug);
            return;
        }
        // The debug options for the server
        let debugOptions = { execArgv: ["--nolazy", "--debug" + (brk ? "-brk" : "") + "=5556"] };

        // If the extension is launch in debug mode the debug server options are use
        // Otherwise the run options are used
        let serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
        }

        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: ['viper'],
            synchronize: {
                // Synchronize the setting section 'viperSettings' to the server
                configurationSection: 'viperSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: fileSystemWatcher
            }
        }

        this.client = new LanguageClient('languageServer', 'Language Server', serverOptions, clientOptions, brk);

        Log.log("Start Language Server", LogLevel.Info);
        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();

        if (!this.client || !this.languageServerDisposable) {
            Log.error("LanguageClient is undefined");
        }
    }

    public dispose(): Promise<any> {
        try {
            return new Promise((resolve, reject) => {
                Log.log("Ask language server to shut down.", LogLevel.Info);
                this.client.sendRequest(Commands.Dispose, null).then(() => {
                    Log.log("Language server has shut down, terminate the connection", LogLevel.Info);
                    this.languageServerDisposable.dispose();
                    resolve();
                });
            });
        } catch (e) {
            Log.log("Error disposing state: " + e);
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
