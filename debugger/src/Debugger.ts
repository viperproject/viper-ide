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
import { ViperApiEvent } from './ViperApi';



export interface SessionObserver {
    setSession(session: DebuggerSession): void;
}


export namespace Debugger {
    
    /** Keeps track of the currently active debugger panel. */
    let panel: DebuggerPanel;
    /** Keeps track of the currently active debugging session, if any. */
    let session: DebuggerSession | undefined = undefined;

    let sessionObservers: SessionObserver[];

    export function start(extensionPath: string, activeEditor: vscode.TextEditor) {
        if (panel) {
            panel.reveal();
        }

        var res = canDebug();
        if (isFailure(res)) {
            throw new DebuggerError(`Cannot start debugger: ${res.reason}`);
        }

        // Seup the debugger panel an make sure the debugger is stopped when the
        // window is closed
        panel = new DebuggerPanel(extensionPath);
        panel.onDispose(() => stop());

        sessionObservers = [
            panel, new DecorationsManager(activeEditor)
        ];

        // Bind verification events from the main extension to update the panel
        viperApi.registerApiCallback(
            ViperApiEvent.VerificationTerminated, 
            (m: any) => {
                if (panel) {
                    panel.logMessage(m);
                    update();
                }
            }
        );
    }

    /** API for navigating the states of the current verification session. */
    export function goToState(command: string) {
        if (!session) {
            Logger.debug(`Ignoring '${command}' command, no active debugging session.`);
            return;
        }

        if (command === DebuggerCommand.NextState) {
            session.nextState();
        } else if (command === DebuggerCommand.PrevState) {
            session.prevState();
        } else if (command === DebuggerCommand.ChildState) {
            session.childState();
        } else if (command === DebuggerCommand.ParentState) {
            session.parentState();
        } else if (command === DebuggerCommand.NextErrorState) {
            session.nextErrorState();
        } else {
            throw new DebuggerError(`Unexpected command '${command}'`);
        }
    }


    /** Update the state of the debugger (both panel and view). */
    export function update() {
        let entries: SymbExLogEntry[] = loadSymbExLogFromFile();
        const verifiables = entries.map(Verifiable.from);

        let s = new DebuggerSession(verifiables);
        session = s;

        sessionObservers.forEach(observer => {
            observer.setSession(s);
        });

        session.notifyStateChange();
    }


    export function stop() {
        if (panel) {
            panel.dispose();    
        }
        if (session) {
            session = undefined;
        }
        // TODO: Dispose of all other resources we may have used in here.
    }


    function canDebug(): Success | Failure {
        // TODO: Report some useful error / solution
        if (!configurationAllowsDebugging(viperApi.configuration)) {
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
        // if (!fileState.verified && !viperApi.isVerifying) {
        //     let filename = fileState.uri.toString();
        //     vscode.window.showInformationMessage(`Starting verification of '${filename}' so that it can be debugged.`);
        //     vscode.commands.executeCommand('viper.verify');
        // }

        // TODO: verification provided no states? (Should not be possible)
        // TODO: isVerifying, should be able to proceed and setup listener for completion
        // TODO: What about modes? Do we care?
        // TODO: Could there be any exceptions thrown?

        return new Success();
    }


    // TODO: Does it even make sense to have to allow debugging in config?
    //       This should probably just be a safety check.
    /** Determines if the Viper extension is configured to allow debugging. */
    function configurationAllowsDebugging(configuration: any) {
        // TODO: Should also check the number of threads
        return configuration.get('advancedFeatures').enabled;
    }


    function loadSymbExLogFromFile(): SymbExLogEntry[] {
        try {
            // TODO: Move these out somewhere, where config stuff lives
            // TODO: Find out why the file is output in /tmp and not inside .vscode
            let tmpDir = path.join(os.tmpdir());
            let executionTreeFilename = 'executionTreeData.js';
            let symbExLogPath = path.join(tmpDir, executionTreeFilename);

            if (!fs.existsSync(symbExLogPath)) {
                throw new DebuggerError(`Could not find '${executionTreeFilename}' in '${tmpDir}'`);
            }

            let content = fs.readFileSync(symbExLogPath).toString();
            content = content.substring(content.indexOf("["), content.length).replace(/\n/g, ' ');
            content = content.replace(/oldHeap":,/g, 'oldHeap":[],');

            return <SymbExLogEntry[]>JSON.parse(content);
        } catch (e) {
            e = normalizeError(e);
            if (e instanceof DebuggerError) {
                throw e;
            } else {
                throw DebuggerError.wrapping("Caught an error while trying to read the symbolic execution log.", e);
            }
        }
    }
}
