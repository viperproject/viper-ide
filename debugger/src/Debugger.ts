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
import { ViperApiEvent } from './ViperApi';


export class Debugger {
    
    /** Keeps track of wheteher a debugger has been instantiated already */
    private static instantiated: boolean = false;
    /** Keeps track of the currently active debugger panel. */
    private panel: DebuggerPanel;
    /** Keeps track of the currently active debugging session, if any. */
    private session: DebuggerSession | undefined = undefined;

    private constructor(extensionPath: string) {
        if (Debugger.instantiated) {
            throw new DebuggerError("A Debugger has been instantiated already, are you instantiating twice?");
        }

        var res = Debugger.canDebug();
        if (isFailure(res)) {
            throw new DebuggerError(`Cannot start debugger: ${res.reason}`);
        }

        // Seup the debugger panel an make sure the debugger is stopped when the
        // window is closed
        this.panel = new DebuggerPanel(extensionPath);
        this.panel.onDispose(() => this.stopDebugger());

        // Bind verification events from the main extension to update the panel
        viperApi.registerApiCallback(
            ViperApiEvent.VerificationTerminated, 
            (m: any) => {
                if (this.panel) {
                    this.panel.logMessage(m);
                    this.update();
                }
            }
        );

        Debugger.instantiated = true;
    }

    /** API for navigating the states of the current verification session. */
    public goToState(command: string) {
        if (!this.session) {
            Logger.debug(`Ignoring '${command}' command, no active debugging this.session.`);
            return;
        }

        if (command === DebuggerCommand.NextState) {
            this.session.nextState();
        } else if (command === DebuggerCommand.PrevState) {
            this.session.prevState();
        } else if (command === DebuggerCommand.ChildState) {
            this.session.childState();
        } else if (command === DebuggerCommand.ParentState) {
            this.session.parentState();
        } else if (command === DebuggerCommand.NextErrorState) {
            this.session.nextErrorState();
        } else {
            throw new DebuggerError(`Unexpected command '${command}'`);
        }
    }


    /** Update the state of the debugger (both panel and view). */
    public update() {
        let entries: SymbExLogEntry[] = Debugger.loadSymbExLogFromFile();
        const verifiables = entries.map(Verifiable.from);

        this.session = new DebuggerSession(verifiables);
        if (this.panel) {
            this.panel.setSession(this.session);
        }
    }


    public stopDebugger() {
        if (this.panel) {
            this.panel.dispose();    
        }
        if (this.session) {
            this.session = undefined;
        }
        // TODO: Dispose of all other resources we may have used in here.
    }


    private static canDebug(): Success | Failure {
        // TODO: Report some useful error / solution
        if (!Debugger.configurationAllowsDebugging(viperApi.configuration)) {
            return new Failure("The current Viper configuration does not allow debugging.");
        }

        let fileState = viperApi.getLastActiveFile();
        if (!fileState) {
            return new Failure("Cannot debug, there is no Viper file open.");
        }

        // TODO: If we do things with callbacks, we don't need this check
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
    private static configurationAllowsDebugging(configuration: any) {
        // TODO: Should also check the number of threads
        return configuration.get('advancedFeatures').enabled;
    }


    private static loadSymbExLogFromFile(): SymbExLogEntry[] {
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
