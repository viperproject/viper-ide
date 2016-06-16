'use strict';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {VerificationState,Commands} from './ViperProtocol';

export class ExtensionState {
    public client: LanguageClient;
    public context: vscode.ExtensionContext;

    public state:VerificationState;
    
    private languageServerDisposable;

    public startLanguageServer(context: vscode.ExtensionContext,brk:boolean) {
        this.context = context;
        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(path.join('server', 'server.js'));

        if (!fs.existsSync(serverModule)) {
            console.log(serverModule + " does not exist");
        }
        // The debug options for the server
        let debugOptions = { execArgv: ["--nolazy", "--debug"+(brk?"-brk":"")+"=5556"] };

        // If the extension is launch in debug mode the debug server options are use
        // Otherwise the run options are used
        let serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
        }

        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            // Register the server for plain text documents
            documentSelector: ['silver'],
            synchronize: {
                // Synchronize the setting section 'iveServerSettings' to the server
                configurationSection: 'iveSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr')
            }
        }

        this.client = new LanguageClient('Language Server', serverOptions, clientOptions);

        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();

        if (!this.client || !this.languageServerDisposable) {
            console.error("LanguageClient is undefined");
        }

    }
    
    public dispose(){
        //let stopped = false;
        console.log("Ask language server to shut down.");
        this.client.sendRequest(Commands.Dispose,(error)=>{
            console.log("Language server has shut down, terminate the connection");
            this.languageServerDisposable.dispose();
            //stopped = true;
        })
        /*let firstTime = true;
        while(!stopped){
            if(firstTime){
                console.log("waiting");
            }
        }
        console.log("done waiting");*/
    }
}
