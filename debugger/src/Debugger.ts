import * as vscode from 'vscode';
import { Logger } from './logger';
import { viperApi } from './extension';
import { SymbExLog } from './external';
import { Success, Failure, isFailure } from './util';
import { DebuggerError } from './Errors';
import { DebuggerCommand } from './Commands';
import { DebuggerSession } from './DebuggerSession';
import { DebuggerPanel } from './DebuggerPanel';
import { DecorationsManager } from './DecorationsManager';
import * as external from './external';
import { Program } from './model/Program';


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

    export function start(context: vscode.ExtensionContext, activeEditor: vscode.TextEditor) {
        if (panel) {
            panel.reveal();
        }

        var res = canDebug();
        if (isFailure(res)) {
            throw new DebuggerError(`Cannot start debugger: ${res.reason}`);
        }

        let decorationsManager = new DecorationsManager(activeEditor);

        // FIXME: The debugger panel knows the decorations manager since it acts
        //        as a controller for it. Maybe there is a better way to set
        //        this up.
        // Seup the debugger panel an make sure the debugger is stopped when the window is closed
        panel = new DebuggerPanel(context.extensionPath, decorationsManager);
        panel.onDispose(() => onPanelDispose());
        panel.onDispose(() => decorationsManager.dispose());
        context.subscriptions.push(panel);

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
                let log = <SymbExLog>message.msg_body;

                panel.postOriginalSymbExLog(log);
                update(log);
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
        } else {
            throw new DebuggerError(`Unexpected command '${command}'`);
        }
    }


    function disposeSession() {
        sessionObservers.forEach(o => o.clearSession());
        session = undefined;
    }


    /** Update the state of the debugger (both panel and view). */
    function update(log: SymbExLog) {
        const program = Program.from(log);

        if (session) {
            session.removeListeners();
            session = undefined;
        }

        session = new DebuggerSession(debuggedFile, program);

        sessionObservers.forEach(observer => {
            observer.clearSession();
            observer.setSession(session!);
        });
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
     *  other callback, meaning when the panel is closed.
     */
    function onPanelDispose() {
        // Maybe this is not even needed
        panel = undefined;
        session = undefined;
        sessionObservers = [];
    }


    function canDebug(): Success | Failure {
        // TODO: Try to configure the backend rather than checking if it's configured properly
        // if (!configurationAllowsDebugging()) {
        //     return new Failure("The current Viper configuration does not allow debugging.");
        // }

        let fileState = viperApi.getLastActiveFile();
        if (!fileState) {
            return new Failure("Cannot debug, there is no Viper file open.");
        }

        // We trigger verification again, so we can gather the SymbExLog
        if (!viperApi.isVerifying()) {
            vscode.commands.executeCommand('viper.verify');
        }

        return new Success();
    }
}
