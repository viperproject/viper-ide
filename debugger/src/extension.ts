'use strict';

import * as vscode from 'vscode';
import { Logger } from './logger';
import * as ViperDebugger from './debugger';
import { DebuggerCommand } from './Commands';
import * as DebuggerSettings from './DebuggerSettings';
import { ViperApiEvent } from './ViperApi';


/** The API exported by the "main" Viper extension.
 *  
 *  It allows listening for verification events.
 */
export var viperApi: any;


/** Called by VS Code when loading the extension. */
export function activate(context: vscode.ExtensionContext) {
    Logger.info('Viper Debugger started');

    // Retrieve the Viper API so we can listen on verification eventes
    let viper = vscode.extensions.getExtension('viper-admin.viper-experimental');
    if (viper && viper.isActive) {
        viperApi = viper.exports;
    } else {
        Logger.error("The Viper API is not available when starting the debugger extension!");
        vscode.window.showErrorMessage("Internal debugger error, terminating. See log for details");
        deactivate();
    }

    // For easily registering commands
    let on = (command: string, handler: (c: string) => any) => {
        const disposable = vscode.commands.registerCommand(command, () => handler(command));
        context.subscriptions.push(disposable);
    };

    on(DebuggerCommand.StartDebugger, (_) => ViperDebugger.startDebugger(context.extensionPath));
    on(DebuggerCommand.StopDebugger,  (_) => ViperDebugger.stopDebugger());

    on(DebuggerCommand.NextState, ViperDebugger.goToState);
    on(DebuggerCommand.PrevState, ViperDebugger.goToState);
    on(DebuggerCommand.ChildState, ViperDebugger.goToState);
    on(DebuggerCommand.ParentState, ViperDebugger.goToState);
    on(DebuggerCommand.NextErrorState, ViperDebugger.goToState);

    // While deveoping start the debugger immediately
    if (DebuggerSettings.DEVELOPMENT) {
        vscode.commands.executeCommand(DebuggerCommand.StartDebugger);
    }
}


/** Called by VS Code when unloading the extension. */
export function deactivate() {
    Logger.debug("Viper Debugger extension being deactivated");
}