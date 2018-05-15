'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Debugger } from './Debugger';
import { SymbExLogEntry } from './ViperProtocol';
import { Logger } from './logger';
import { DebuggerSession, StateChangeEvent } from './DebuggerSession';
import { DebuggerError } from './Errors';


export class DebuggerPanel {

    private panel: vscode.WebviewPanel;
    private session: DebuggerSession | undefined;

    constructor(readonly extensionPath: string) {

        let options: vscode.WebviewPanelOptions & vscode.WebviewOptions = {
            //enableFindWidget: true,
            //retainContextWhenHidden: true,
            enableScripts: true,
            enableCommandUris: true
        };

        this.panel = vscode.window.createWebviewPanel(
            'viperDebugPanel',
            "Viper Debugger",
            vscode.ViewColumn.Two,
            options
        );

        this.panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'stopDebugger':    
                    Debugger.stop();
                    return;
                default:
                    Logger.error(`Unknown command from debug pane: '${message}'`);
            }
        });

        this.panel.webview.html = Util.getViperDebugViewContent(this.extensionPath);
    }

    public addSymbolicExecution(entry: SymbExLogEntry) {
        if (!this.panel) {
            Logger.error("Trying to add symbolic execution but the debugging panel does not exist.");
            return;
        }

        let message = {
            type: 'addSymbolicExecutionEntry',
            data: JSON.stringify(entry, null, 4)
        };

        this.panel.webview.postMessage(message);
    }

    public setSession(session: DebuggerSession) {
        // TODO: Potentially call session.dispose here
        this.session = session;

        // TODO: Probably move this out
        this.session.verifiables.forEach((verifiable) => {
            let message = {
                type: 'addSymbolicExecutionEntry',
                data: verifiable
            };

            this.panel.webview.postMessage(message);
        });

        this.setupSessionCallbacks();
    }

    public logMessage(message: string) {
        let logMessage = {
            type: 'logMessage',
            text: message
        };

        this.panel.webview.postMessage(logMessage);
    }

    public onDispose(listener: () => void) {
        this.panel.onDidDispose(listener);
    }

    public reveal() {
        this.panel.reveal();
    }

    public dispose() {
        this.panel.dispose();
    }

    private setupSessionCallbacks() {
        if (!this.session) {
            throw new DebuggerError("Session was undefined when setting up callbacks");
        }
        
        this.session.onStateChange((e: StateChangeEvent) => this.logMessage(e.toString()));
    }
}


namespace Util {

    export function getViperDebugViewContent(extensionPath: string) {
        let htmlPath = path.join(extensionPath, 'resources/html/debugger.html');
        let content = fs.readFileSync(htmlPath).toString();

        // We now know where we are running, we can replace all the temporary paths
        // in the HTML document with the actual extension path.
        return content.replace(/\{\{root\}\}/g, 'vscode-resource:' + extensionPath + '/');
    }
}