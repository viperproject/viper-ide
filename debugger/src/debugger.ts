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
import { Verifiable } from './Verifiable';


var viperDebuggerPanel: vscode.WebviewPanel | undefined;


export function startDebugger(context: vscode.ExtensionContext) {
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

    // Properly dispose of all the debugger's resources
    panel.onDidDispose(() => stopDebugger());

    panel.webview.onDidReceiveMessage(message => {
        switch (message.command) {
            case 'stopDebugger':    
                if (viperDebuggerPanel) {
                    viperDebuggerPanel.dispose();
                }
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

    // We now know where we are running, we can replace all the temporary paths
    // in the HTML document with the actual extension path.
    return content.replace(/\{\{root\}\}/g, 'vscode-resource:' + context.extensionPath + '/');
}


export function updateDebuggerView() {
    let entries: SymbExLogEntry[] = loadSymbExLogFromFile();
    entries.forEach(e => addSymbolicExecution(e));

    entries.forEach((entry, index, array) => {
        const v = Verifiable.from(entry);

        if (!viperDebuggerPanel) {
            Logger.error("Trying to add symbolic execution but the debugging panel does not exist.");
            return;
        }

        let message = {
            type: 'addSymbolicExecutionEntry',
            data: JSON.stringify(v)
        };

        viperDebuggerPanel.webview.postMessage(message);
    });
}


export function stopDebugger() {
    if (viperDebuggerPanel) {
        // TODO: Dispose of all other resources we may have used in here.
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


function addSymbolicExecution(entry: SymbExLogEntry) {
    if (!viperDebuggerPanel) {
        Logger.error("Trying to add symbolic execution but the debugging panel does not exist.");
        return;
    }

    let message = {
        type: 'addSymbolicExecutionEntry',
        data: JSON.stringify(entry, null, 4)
    };

    viperDebuggerPanel.webview.postMessage(message);
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