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


/** The `DebuggerPanel` for the communication with the HTML panel. */
export class DebuggerPanel implements SessionObserver {

    private static webviewOptions: vscode.WebviewPanelOptions & vscode.WebviewOptions = {
        enableFindWidget: true,
        // TODO: think about restoring the pane's context
        retainContextWhenHidden: true,
        enableScripts: true,
        enableCommandUris: true
    };

    private panel: vscode.WebviewPanel;
    private session: DebuggerSession | undefined;

    constructor(readonly extensionPath: string) {
        this.panel = vscode.window.createWebviewPanel(
            'viperDebugPanel',
            "Viper Debugger",
            vscode.ViewColumn.Two,
            DebuggerPanel.webviewOptions
        );

        this.panel.webview.onDidReceiveMessage((m) => this.handleMessageFromPanel(m));
        this.panel.webview.html = Util.loadWebviewContent(this.extensionPath);
    }

    public setSession(session: DebuggerSession) {
        // TODO: Potentially call session.dispose here
        this.session = session;

        this.setupSessionCallbacks();

        // Verifiables are a cyclic structure, they need to be converted before
        // sending them to the HTML panel
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

    private handleMessageFromPanel(message: any) {
        switch (message.command) {
            case 'nextState':
                this.session!.goToNextState();
                break;
            case 'previousState':
                this.session!.goToPrevState();
                break;
            case 'childState':
                this.session!.goToChildState();
                break;
            case 'parentState':
                this.session!.goToParentState();
                break;
            case 'selectVerifiable':
                const verifiableName = message.data;
                this.session!.selectVerifiable(verifiableName);
                break;
            default:
                Logger.error(`Unknown command from debug pane: '${message}'`);
        }
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

    export function loadWebviewContent(extensionPath: string) {
        let htmlPath = path.join(extensionPath, 'out/panel/debugger.html');
        let content = fs.readFileSync(htmlPath).toString();

        // We now know where we are running, we can replace all the temporary paths
        // in the HTML document with the actual extension path.
        return content.replace(/\{\{root\}\}/g, 'vscode-resource:' + extensionPath + '/');
    }
}