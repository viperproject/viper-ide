'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Debugger, SessionObserver } from './Debugger';
import { SymbExLogEntry } from './ViperProtocol';
import { Logger } from './logger';
import { DebuggerSession, SessionEvent, StateUpdate } from './DebuggerSession';
import { DebuggerError } from './Errors';
import { Statement } from './states/Statement';
import { Verifiable } from './states/Verifiable';


class PanelMessage {
    public static StateUpdate(states: StateUpdate) {
        return { type: 'stateUpdate', data: states };
    } 
    public static Verifiables(verifiables: any) {
        return { type: 'verifiables', data: verifiables};
    }
}


export class DebuggerPanel implements SessionObserver {

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
                case 'nextState':
                    this.session!.nextState();
                    break;
                case 'previousState':
                    this.session!.prevState();
                    break;
                case 'childState':
                    this.session!.childState();
                    break;
                case 'parentState':
                    this.session!.parentState();
                    break;
                case 'selectVerifiable':
                    const verifiableName = message.data;
                    this.session!.selectVerifiable(verifiableName);
                default:
                    Logger.error(`Unknown command from debug pane: '${message}'`);
            }
        });

        this.panel.webview.html = Util.getViperDebugViewContent(this.extensionPath);
    }

    public setSession(session: DebuggerSession) {
        // TODO: Potentially call session.dispose here
        this.session = session;

        this.setupSessionCallbacks();

        // Verifiables are a cyclic structure, need to convert them before
        // sending them to the panel
        const verifiables = this.session.verifiables.map(verifiable => {
            return { name: verifiable.name };
        });

        this.postMessage(PanelMessage.Verifiables(verifiables));
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

    private postMessage(message: any) {
        this.panel.webview.postMessage(message);
    }

    private setupSessionCallbacks() {
        if (!this.session) {
            throw new DebuggerError("Session was undefined when setting up callbacks");
        }
        
        this.session.onStateChange((states: StateUpdate) => {
            this.postMessage(PanelMessage.StateUpdate(states));
        });
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