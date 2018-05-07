'use strict';

import * as vscode from 'vscode';
import { Logger } from './logger';
import * as d from './debugger';

export var viperApi: any;

export function activate(context: vscode.ExtensionContext) {

    Logger.info('Viper Debugger Started');

    // For easily registering commands
    let reg = (s: any, f: any) => context.subscriptions.push(vscode.commands.registerCommand(s, f));

    reg('viper-debugger.startDebugger', () => d.startDebugger(context));
    reg('viper-debugger.stopDebugger', () => d.stopDebugger());

    // Register notification handlers from the main Viper extension
    let viper = vscode.extensions.getExtension('viper-admin.viper-experimental');

    if (viper && viper.isActive) {
        viperApi = viper.exports;
    } else {
        // TODO: Should we exit here? There's not much we can do without the API
        Logger.error("The Viper API is not available when starting the debugger extension!");
    }

    // TODO: Remove this, or put it behind a debug flag
    viperApi.registerApiCallback('VerificationTerminated', () => {
        vscode.commands.executeCommand('viper-debugger.startDebugger');
    });

    // TODO: This has to be fixed somehow, we want the typing information to be shared between the two extensions, worst
    //       case we can register events based on a string.
    viperApi.registerApiCallback('VerificationTerminated', d.logMessageToDebugView);
}

export function deactivate() {
    Logger.debug("Viper Debugger extension being deactivated?");
}