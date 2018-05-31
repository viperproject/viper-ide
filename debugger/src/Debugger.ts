'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from './logger';
import { viperApi } from './extension';
import { SymbExLogEntry } from './ViperProtocol';
import { Success, Failure, isFailure } from './util';
import { DebuggerError, normalizeError } from './Errors';
import { Verifiable } from './states/Verifiable';
import { DebuggerCommand } from './Commands';
import { DebuggerSession } from './DebuggerSession';
import { DebuggerPanel } from './DebuggerPanel';
import { DecorationsManager } from './DecorationsManager';
import * as external from './external';


/** An object that wants to be notified when the debugger session changes.
 *  
 *  The `Debugger` keeps track of the observers and notifies them whenever the
 *  session is changed.
 */
export interface SessionObserver {

    /** A handler called when a new debugger session is available. */
    setSession(session: DebuggerSession): void;

    /** To notify that the session has been terminated. */
    clearSession(): void;
}

export namespace Debugger {
    
    /** The URI of the file currently being debugged. */
    let debuggedFile: vscode.Uri;
    /** Keeps track of the currently active debugger panel. */
    let panel: DebuggerPanel | undefined;
    /** Keeps track of the currently active debugging session, if any. */
    let session: DebuggerSession | undefined = undefined;
    /** Observers are notified whenever the debugger session is changed. */
    let sessionObservers: SessionObserver[];
    let disposables: { dispose: () => void }[] = [];

    export function start(context: vscode.ExtensionContext, activeEditor: vscode.TextEditor) {
        if (panel) {
            panel.reveal();
        }

        var res = canDebug();
        if (isFailure(res)) {
            throw new DebuggerError(`Cannot start debugger: ${res.reason}`);
        }

        // Seup the debugger panel an make sure the debugger is stopped when the window is closed
        panel = new DebuggerPanel(context.extensionPath);
        panel.onDispose(() => onPanelDispose());
        context.subscriptions.push(panel);

        let decorationsManager = new DecorationsManager(activeEditor);

        disposables.push(decorationsManager);

        // SessionObservers are notified whenever there is a new debugging session
        sessionObservers = [
            panel, decorationsManager
        ];

        // Bind verification events from the main extension to update the panel
        viperApi.onVerificationTerminated(
            (m: external.ViperApi.VerificationTerminatedEvent) => {
                let VerificationSuccess = external.ViperApi.VerificationSuccess;
                if (m.status === VerificationSuccess.Error
                        || m.status === VerificationSuccess.ParsingFailed
                        || m.status === VerificationSuccess.TypecheckingFailed
                        || m.status === VerificationSuccess.Timeout) {
                    if (session) {
                        disposeSession();
                    }
                } else {
                    debuggedFile = m.filename;
                }
            }
        );

        // Setup a handler for the symbolic execution logs sent by ViperServer
        viperApi.registerServerMessageCallback('symbolic_execution_logger_report', (messageType: string, message: any) => {
            if (panel) {
                let content = message.msg_body.log;

                // TODO: Fix the message in ViperServer
                content = content.substring(content.indexOf("["), content.length).replace(/\n/g, ' ');
                let entries = <SymbExLogEntry[]>JSON.parse(content);

                update(entries);
            }
        });
    }

    /** API for navigating the states of the current verification session. */
    export function goToState(command: string) {
        if (!session) {
            Logger.debug(`Ignoring '${command}' command, no active debugging session.`);
            return;
        }

        if (command === DebuggerCommand.NextState) {
            session.goToNextState();
        } else if (command === DebuggerCommand.PrevState) {
            session.goToPrevState();
        } else if (command === DebuggerCommand.ChildState) {
            session.goToChildState();
        } else if (command === DebuggerCommand.ParentState) {
            session.goToParentState();
        } else if (command === DebuggerCommand.NextErrorState) {
            session.nextErrorState();
        } else {
            throw new DebuggerError(`Unexpected command '${command}'`);
        }
    }


    function disposeSession() {
        sessionObservers.forEach(o => o.clearSession());
        session = undefined;
    }


    /** Update the state of the debugger (both panel and view). */
    function update(entries: SymbExLogEntry[]) {
        const verifiables = entries.map(Verifiable.from);

        session = new DebuggerSession(debuggedFile, verifiables);

        sessionObservers.forEach(observer => {
            observer.setSession(session!);
        });

        session.notifyStateChange();
    }


    /** API function to stop the debugger. */
    export function stop() {
        // Don't remove these calls. We want to make sure that the panel is
        // disposed-of properly when stopping the debugger.
        if (panel) {
            panel.dispose();    
        } else {
            onPanelDispose();
        }
    }

    /** Called when the panel is disposed directly, not via a command or any
     *  other callback, meaning when the panel is closed. */
    function onPanelDispose() {
        disposables.forEach(element => element.dispose());

        // Maybe this is not even needed
        panel = undefined;
        session = undefined;
        sessionObservers = [];
    }


    function canDebug(): Success | Failure {
        // TODO: Report some useful error / solution
        if (!configurationAllowsDebugging()) {
            return new Failure("The current Viper configuration does not allow debugging.");
        }

        let fileState = viperApi.getLastActiveFile();
        if (!fileState) {
            return new Failure("Cannot debug, there is no Viper file open.");
        }

        // TODO: If we do things with callbacks, we don't need check
        // if (!viperApi.isBackendReady()) {
        //     return new Failure("Cannot start debugging, backend is not ready.");
        // }

        // TODO: We probably don't want to trigger verification yet...
        if (!viperApi.isVerifying()) {
            let filename = fileState.uri.toString();
            //vscode.window.showInformationMessage(`Starting verification of '${filename}' so that it can be debugged.`);
            vscode.commands.executeCommand('viper.verify');
        }

        return new Success();
    }

    /** Determines if the Viper extension is configured to allow debugging. */
    function configurationAllowsDebugging() {
        // TODO: Should put some actual checks here
        return true;
    }
}
