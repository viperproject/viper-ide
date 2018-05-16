'use strict';

import * as vscode from 'vscode';
import { Logger } from './logger';
import { Debugger } from './Debugger';
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

    // Register the main handler, to start the debugger
    on(DebuggerCommand.StartDebugger, (_) => {
        const activeEditor = vscode.window.activeTextEditor;

        Debugger.start(context.extensionPath);

        // Make sure the editor active previously remains focused
        if (activeEditor) {
            vscode.window.showTextDocument(activeEditor.document);
        }

        // Register the rest of the handlers only when the debugger is requested
        on(DebuggerCommand.StopDebugger,  (_) => Debugger.stop());
        on(DebuggerCommand.NextState, (s) => Debugger.goToState(s));
        on(DebuggerCommand.PrevState, (s) => Debugger.goToState(s));
        on(DebuggerCommand.ChildState, (s) => Debugger.goToState(s));
        on(DebuggerCommand.ParentState, (s) => Debugger.goToState(s));
        on(DebuggerCommand.NextErrorState, (s) => Debugger.goToState(s));
    });

    // While deveoping start the debugger immediately
    if (DebuggerSettings.DEVELOPMENT) {
        vscode.commands.executeCommand(DebuggerCommand.StartDebugger);
    }
}


/** Called by VS Code when unloading the extension. */
export function deactivate() {
    Logger.debug("Viper Debugger extension being deactivated");
}