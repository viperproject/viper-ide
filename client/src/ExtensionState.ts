'use strict';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {VerificationState, Commands,LogLevel} from './ViperProtocol';
import {Log} from './Log';

export class ExtensionState {
    public client: LanguageClient;
    public context: vscode.ExtensionContext;

    public state: VerificationState;

    private languageServerDisposable;

    public startLanguageServer(context: vscode.ExtensionContext,fileSystemWatcher:vscode.FileSystemWatcher, brk: boolean) {
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

        this.client = new LanguageClient('Language Server', serverOptions, clientOptions);

        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();

        if (!this.client || !this.languageServerDisposable) {
            Log.error("LanguageClient is undefined");
        }
    }

    public dispose() {
        Log.log("Ask language server to shut down.", LogLevel.Info);
        this.client.sendRequest(Commands.Dispose, (error) => {
            Log.log("Language server has shut down, terminate the connection", LogLevel.Info);
            this.languageServerDisposable.dispose();
        })
    }
}
