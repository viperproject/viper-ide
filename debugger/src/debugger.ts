
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Logger } from './logger';
import { viperApi } from './extension';

var viperDebuggerPanel: vscode.WebviewPanel | undefined;


export function startDebugger(context: vscode.ExtensionContext) {
    // TODO: Check if we can actually debug.
    // TODO: Get the file name
    // TODO: Show states

    if (viperDebuggerPanel) {
        viperDebuggerPanel.reveal();
        return;
    }

    var res = canDebug();
    if (isFailure(res)) {
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
        switch (message.command) {
            case 'stopDebugger':    
                stopDebugger();
                return;
            default:
                Logger.error(`Unknown command from debug pane: '${message}'`);
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


export function stopDebugger() {
    if (viperDebuggerPanel) {
        viperDebuggerPanel.dispose();
        viperDebuggerPanel = undefined;
    }
}


export function logMessageToDebugView(message: string) {
    if (!viperDebuggerPanel) {
        Logger.error("The Debugger panel was not created but someone tried to log a message to it");
        return;
    }

    let logMessage = {
        type: 'logMessage',
        text: message
    };

    viperDebuggerPanel.webview.postMessage(logMessage);
}

function isFailure(check: Success | Failure): check is Failure {
    return check instanceof Failure;
}

// function isSuccess(check: Success | Failure): check is Failure {
//     return check instanceof Success;
// }

class Success {}

class Failure {
    readonly reason: string;
    constructor(reason: string) {
        this.reason = reason;
    }
}

function canDebug(): Success | Failure {
    // TODO: Report some useful error / solution
    if (!viperApi.configuration.debuggingFeatures()) {
        return new Failure("The current Viper configuration does not allow debugging.");
    }

    let fileState = viperApi.getLastActiveFile();
    if (!fileState) {
        return new Failure("Cannot debug, there is no Viper file open.");
    }

    if (!viperApi.isBackendReady()) {
        return new Failure("Cannot start debugging, backend is not ready.");
    }

    // TODO: Do we know that this exact file is being verified?
    if (!fileState.verified && !viperApi.isVerifying) {
        let filename = fileState.uri.toString();
        vscode.window.showInformationMessage(`Starting verification of '${filename}' so that it can be debugged.`);
        vscode.commands.executeCommand('viper.verify');
    }

    // TODO: verification provided no states? (Should not be possible)
    // TODO: isVerifying, should be able to proceed and setup listener for completion
    // TODO: What about modes? Do we care?
    // TODO: Could there be any exceptions thrown?

    return new Success();
}