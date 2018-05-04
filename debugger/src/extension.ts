'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Logger } from './logger';

var viperDebuggerPanel: vscode.WebviewPanel | undefined;
var viperApi: any;

export function activate(context: vscode.ExtensionContext) {

    Logger.info('Viper Debugger Started');

    // For easily registering commands
    let reg = (s: any, f: any) => context.subscriptions.push(vscode.commands.registerCommand(s, f));

    reg('viper-debugger.startDebugger', () => startDebugger(context));
    reg('viper-debugger.stopDebugger', () => stopDebugger());

    // Register notification handlers from the main Viper extension
    let viper = vscode.extensions.getExtension('viper-admin.viper-experimental');
    if (viper && viper.isActive) {
        viperApi = viper.exports;
    }

    // TODO: This has to be fixed somehow, we want the typing information to be shared between the two extensions, worst
    //       case we can register events based on a string.
    viperApi.registerApiCallback('VerificationTerminated', logMessageToDebugView);
}


function startDebugger(context: vscode.ExtensionContext) {
    if (viperDebuggerPanel) {
        viperDebuggerPanel.reveal();
        return;
    }

    var res = canDebug();
    if (!res.result) {
        vscode.window.showErrorMessage(`Cannot start debugger: ${res.reason}`);
        return;
    }

    let options: vscode.WebviewPanelOptions & vscode.WebviewOptions = {
        //enableFindWidget: true,
        //retainContextWhenHidden: true,
        enableScripts: true,
        enableCommandUris: true
    };

    let panel = vscode.window.createWebviewPanel(
        'viperDebugPanel',
        "Viper Debugger",
        vscode.ViewColumn.Two,
        options
    );

    panel.webview.html = getViperDebugViewContent(context);

    panel.webview.onDidReceiveMessage(message => {
        switch (message.type) {
            case 'stopDebugger':    
                stopDebugger();
                return;
            default:
                Logger.error(`Unknown command from debug pane: '${message.type}'`);
        }
    }, undefined, context.subscriptions);

    viperDebuggerPanel = panel;
}

function getViperDebugViewContent(context: vscode.ExtensionContext) {
    let path = context.asAbsolutePath('resources/html/debugger.html');
    let content = fs.readFileSync(path).toString();

    // TODO: a sort of hack to be able to use local paths in the resources, maybe there is a better way
    return content.replace(/\{extension-root\}/g, 'vscode-resource:' + context.extensionPath + '/');
}

function stopDebugger() {
    if (viperDebuggerPanel) {
        viperDebuggerPanel.dispose();
        viperDebuggerPanel = undefined;
    }
}

function logMessageToDebugView(message: string) {
    if (!viperDebuggerPanel) {
        Logger.error("The Debugger panel was not created but someone tried to log a message to it");
        return;
    }

    viperDebuggerPanel.webview.postMessage(message);
}

interface CheckResult {
    result: boolean;
    reason: string;
}

function canDebug(): CheckResult {
    // TODO: actually implement this check
    Logger.debug("Proper 'canDebg' check not implemented yet.");
    return { result: true, reason: "" };
}

function debugCurrentFile() {


}

export function deactivate() {
    Logger.debug("Viper Debugger extension being deactivated?");
}