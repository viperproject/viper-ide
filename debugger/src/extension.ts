'use strict';

import * as vscode from 'vscode';
import { Logger } from './logger';
import * as d from './debugger';
import { DebuggerCommand } from './Commands';
import * as DebuggerSettings from './DebuggerSettings';
import { ViperApiEvent } from './ViperApi';


export var viperApi: any;


export function activate(context: vscode.ExtensionContext) {

    Logger.info('Viper Debugger started');

    // For easily registering commands
    let reg = (s: any, f: any) => context.subscriptions.push(vscode.commands.registerCommand(s, f));

    reg(DebuggerCommand.StartDebugger, () => d.startDebugger(context));
    reg(DebuggerCommand.StopDebugger, () => d.stopDebugger());

    // Register notification handlers from the main Viper extension
    let viper = vscode.extensions.getExtension('viper-admin.viper-experimental');

    if (viper && viper.isActive) {
        viperApi = viper.exports;
    } else {
        Logger.error("The Viper API is not available when starting the debugger extension!");
        internalDebuggerError();
    }

    // While deveoping start the debugger as soon as a verification finishes
    if (DebuggerSettings.DEVELOPMENT) {
        viperApi.registerApiCallback(
            ViperApiEvent.VerificationTerminated, 
            (m: any) => {
                d.logMessageToDebugView(m);
                d.updateDebuggerView();
            }
        );

        vscode.commands.executeCommand(DebuggerCommand.StopDebugger);
    }
}

export function deactivate() {
    Logger.debug("Viper Debugger extension being deactivated");
}


function internalDebuggerError() {
    vscode.window.showErrorMessage("Internal debugger error, terminating. See log for details");
    deactivate();
}