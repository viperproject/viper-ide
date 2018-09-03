import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { SessionObserver } from './Debugger';
import { Logger } from './logger';
import { DebuggerSession, StateUpdate } from './DebuggerSession';
import { DebuggerError } from './Errors';
import { RecordView } from './model/Record';
import { DecorationsManager } from './DecorationsManager';
import { AlloyTranslator } from './model/AlloyTranslator';
import { TranslationEnv } from './model/TranslationEnv';
import { Alloy } from './model/Alloy';
import { DotGraph } from './DotGraph';


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
        retainContextWhenHidden: true,
        enableScripts: true,
        enableCommandUris: true
    };

    private panel: vscode.WebviewPanel;
    private session: DebuggerSession | undefined;

    constructor(readonly extensionPath: string,
                readonly decorationsManager: DecorationsManager) {
        this.panel = vscode.window.createWebviewPanel(
            'viperDebugPanel',
            "Viper Debugger",
            vscode.ViewColumn.Two,
            DebuggerPanel.webviewOptions
        );

        this.panel.webview.onDidReceiveMessage((m) => {
            this.handleMessageFromPanel(m);
        });
        this.panel.webview.html = Util.loadWebviewContent(this.extensionPath);
    }

    public setSession(session: DebuggerSession) {
        if (this.session !== undefined) {
            this.session.removeListeners();
        }

        this.session = session;
        this.setupSessionCallbacks();

        // Verifiables are a cyclic structure, they need to be converted before
        // sending them to the HTML panel
        const verifiables = this.session.program.verifiables.filter((v) => v.records.length > 0)
                                                            .map((v) => ({ name: v.name }) );

        this.postMessage(PanelMessage.Verifiables(verifiables));
    }

    public clearSession() {
        this.session = undefined;
    }

    private logModel(message: string) {
        this.panel.webview.postMessage({
            type: 'logModel',
            text: message
        });
    }

    public postOriginalSymbExLog(symbExLog: any) {
        let message = {
            type: 'symbExLogMessage',
            text: symbExLog
        };

        this.panel.webview.postMessage(message);
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
            case 'goToStateByIndex':
                const index = message.data as number;
                this.session!.goToStateByIndex(index);
                break;
            case 'selectVerifiable':
                const verifiableName = message.data;
                this.session!.selectVerifiable(verifiableName);
                break;

            case 'mouseNavigation':
                let enabled = message.value;
                this.decorationsManager.setMouseNavigation(enabled);
                break;

            default:
                Logger.error(`Unknown command from debug pane: '${message}'`);
        }
    }

    private setupSessionCallbacks() {
        if (!this.session) {
            throw new DebuggerError("Session was undefined when setting up callbacks");
        }
        
        this.session.onStateChange((record: StateUpdate) => {
            // Records are a cyclic structure, it cannot be sent via postMessage. We convert them to `RecordView`
            // which keeps the importa information and discards cyclic links
            let message: any = {
                current: RecordView.from(record.current),
                topLevel: record.topLevel.map(tl => RecordView.from(tl)),
                next: record.next ? RecordView.from(record.next) : undefined,
                previous: record.previous ? RecordView.from(record.previous) : undefined,
                hasNext: record.hasNext,
                hasPrevious: record.hasPrevious,
                hasParent: record.hasParent,
                hasChild: record.hasChild
            };

            this.postMessage(PanelMessage.StateUpdate(message));

            if (!record.current.prestate) {
                return;
            }

            const state = record.current.prestate;
            const env = new TranslationEnv(state);
            const program = this.session!.program;
            const alloyTranslator = new AlloyTranslator(record.verifiable,
                                                    program,
                                                    state,
                                                    env);
            const model = alloyTranslator.translate();
            this.logModel(model);

            this.postMessage({ type: "graphMessage", text: "Generating..." });
            Alloy.generate(model).then(
                (instance) => {
                    // TODO: Log this to the diagnostics panel
                    // Logger.info(JSON.stringify(instance, undefined, 2));
                    this.postMessage({ type: "alloyInstanceMessage", text: instance });
                    const graph = DotGraph.from(record.current, instance, env);
                    this.postMessage({
                        type: "displayGraph",
                        text: graph.toString()
                    });
                },
                (reason) => {
                    // this.postMessage({ type: "clearGraph" });
                    this.postMessage({ type: "graphMessage", text: "No counterexample" });
                    const msg = "Could not find a counterexample for the current verification state";
                    vscode.window.showWarningMessage(msg);
                    Logger.error(reason);
                }
            );
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