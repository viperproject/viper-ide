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

    // Register notification handlers from the main Viper extension
    let viper = vscode.extensions.getExtension('viper-admin.viper-experimental');

    if (viper && viper.isActive) {
        viperApi = viper.exports;
    } else {
        Logger.error("The Viper API is not available when starting the debugger extension!");
        internalDebuggerError();
    }

    // For easily registering commands
    let reg = (command: string, handler: (c: string) => any) => {
        const disposable = vscode.commands.registerCommand(command, () => handler(command));
        context.subscriptions.push(disposable);
    };

    reg(DebuggerCommand.StartDebugger, (_) => d.startDebugger(context));
    reg(DebuggerCommand.StopDebugger, (_) => d.stopDebugger());
    // TODO: not sure about this
    reg(DebuggerCommand.NextState, d.goToState);
    reg(DebuggerCommand.PrevState, d.goToState);
    reg(DebuggerCommand.ChildState, d.goToState);
    reg(DebuggerCommand.ParentState, d.goToState);
    reg(DebuggerCommand.NextErrorState, d.goToState);

    // While deveoping start the debugger as soon as a verification finishes
    if (DebuggerSettings.DEVELOPMENT) {
        vscode.commands.executeCommand(DebuggerCommand.StartDebugger);
    }
}

export function deactivate() {
    Logger.debug("Viper Debugger extension being deactivated");
}


function internalDebuggerError() {
    vscode.window.showErrorMessage("Internal debugger error, terminating. See log for details");
    deactivate();
}