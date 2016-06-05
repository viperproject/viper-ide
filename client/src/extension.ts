'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below


import * as debug from './debug';
import * as fs from 'fs';
var ps = require('ps-node');
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, TransportKind, NotificationType } from 'vscode-languageclient';
import {Timer} from './Timer';
import * as vscode from 'vscode';
import {ExtensionState} from './ExtensionState';

import {DebugContentProvider} from './TextDocumentContentProvider';

let statusBarItem;
let ownContext;

let autoSaver: Timer;
let previewUri = vscode.Uri.parse('viper-preview://debug');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    ownContext = context;
    console.log('Viper-IVE-Client is now active!');
    enableDebugging();
    startAutoSaver();
    startLanguageServer();
    initializeStatusBar();

    //registerTextDocumentProvider()
    //showSecondWindow()
}

let provider;

function registerTextDocumentProvider() {
    provider = new DebugContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', provider);
}

function showSecondWindow() {
    provider.update(previewUri);
    showSecondWindow();
    return vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two).then((success) => {
    }, (reason) => {
        vscode.window.showErrorMessage(reason);
    });
}

function enableDebugging() {
    let processPickerDisposable = vscode.commands.registerCommand('extension.pickProcess', () => {

        ps.lookup({
            psargs: 'ax'
        }, (err, resultList) => {

            let items = [];

            if (err) {
                items.push(err.message);
            } else {
                resultList.forEach(process => {
                    if (process && process.command) {
                        items.push(`${process.command}`);
                    }
                });
            }
            vscode.window.showQuickPick(items);
        });
    });

    ownContext.subscriptions.push(processPickerDisposable);
}

function initializeStatusBar() {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.color = 'orange';
    statusBarItem.text = "starting";
    statusBarItem.show();
    ownContext.subscriptions.push(statusBarItem);
}

function startAutoSaver() {
    let autoSaveTimeout = 1000;//ms
    autoSaver = new Timer(() => {
        if (vscode.window.activeTextEditor != null) {
            vscode.window.activeTextEditor.document.save();
        }
    }, autoSaveTimeout);

    ownContext.subscriptions.push(autoSaver);

    let onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(resetAutoSaver);
    ownContext.subscriptions.push(onActiveTextEditorChangeDisposable);
    ownContext.subscriptions.push(onTextEditorSelectionChange);
}

function resetAutoSaver() {
    autoSaver.reset();
}


function startLanguageServer() {
    // The server is implemented in node
    let serverModule = ownContext.asAbsolutePath(path.join('server', 'server.js'));

    if (!fs.existsSync(serverModule)) {
        console.log(serverModule + " does not exist");
    }
    // The debug options for the server
    let debugOptions = { execArgv: ["--nolazy", "--debug=5556"] };

    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    }

    // Options to control the language client
    let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: ['silver'],
        synchronize: {
            // Synchronize the setting section 'iveServerSettings' to the server
            configurationSection: 'iveSettings',
            // Notify the server about file changes to '.sil files contain in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sil')
        }
    }

    ExtensionState.client = new LanguageClient('Language Server', serverOptions, clientOptions);

    // Create the language client and start the client.
    let disposable = ExtensionState.client.start();

    if (!ExtensionState.client || !disposable) {
        console.error("LanguageClient is undefined");
    }

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    ownContext.subscriptions.push(disposable);

    ExtensionState.client.onNotification({ method: "NailgunReady" }, () => {
        let window = vscode.window;
        statusBarItem.color = 'white';
        statusBarItem.text = "ready";
    });

    ExtensionState.client.onNotification({ method: "VerificationStart" }, () => {
        let window = vscode.window;
        statusBarItem.color = 'orange';
        statusBarItem.text = "pre-processing";
    });

    ExtensionState.client.onNotification({ method: "VerificationProgress" }, (progress: number) => {
        statusBarItem.color = 'orange';
        statusBarItem.text = "verifying: " + progress + "%"
    });

    ExtensionState.client.onNotification({ method: "VerificationEnd" }, (success) => {
        let window = vscode.window;
        if (success) {
            statusBarItem.color = 'lightgreen';
            statusBarItem.text = `$(check) done`;
            window.showInformationMessage("Successfully Verified");
        } else {
            statusBarItem.color = 'red';
            statusBarItem.text = `$(x) failed`;
        }
        //window.showInformationMessage("verification finished");
    });

    ExtensionState.client.onNotification({ method: "InvalidSettings" }, (data) => {
        let buttons: vscode.MessageItem = { title: "Open Settings" };

        vscode.window.showInformationMessage("Invalid settings: " + data, buttons).then((choice) => {
            if (choice.title === "Open Settings") {
                let settingsPath = ownContext.asAbsolutePath(path.join('.vscode','settings.json'));
                //TODO: create TextDocument from path
                let settingsDocument:vscode.TextDocument;
                vscode.window.showTextDocument(settingsDocument);
            }
        });
    });5

    ExtensionState.client.onNotification({ method: "Hint" }, (data: string) => {
        vscode.window.showInformationMessage(data);
    });
}

/*
function colorFileGutter(color: string) {
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(editor.document.lineCount, Number.MAX_VALUE));
    colorGutter(color, range);
}

function colorGutter(color: string, range: vscode.Range) {
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let ranges = [];
    ranges.push(range);
    var bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
        overviewRulerColor: color
    });
    editor.setDecorations(bookmarkDecorationType, ranges);
}

function removeDecorations() {
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let selection = editor.selection;
    let ranges = [];
    let start = new vscode.Position(0, 0);
    let end = new vscode.Position(editor.document.lineCount - 1, Number.MAX_VALUE);
    console.log('Remove decoration on: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")

    ranges.push(new vscode.Range(start, end));
    let decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(30,30,30,1)'
    }); //TODO: get color from theme
    editor.setDecorations(decorationRenderType, ranges);
}

function markError(start: vscode.Position, end: vscode.Position, message: string) {
    console.log('Mark error: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let range = new vscode.Range(start, end);
    let diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)
}

function decorate(start: vscode.Position, end: vscode.Position) {
    console.log('Decorate ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let ranges = [];
    ranges.push(new vscode.Range(start, end));
    let decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'red'
    });
    editor.setDecorations(decorationRenderType, ranges);
}

function doesFileExist(path: string): boolean {
    if (!fs.existsSync(path)) {
        vscode.window.showInformationMessage('file not found at: ' + path);
        return false;
    }
    return true;
}
*/

    // let verifyCommandDisposable = vscode.commands.registerCommand('extension.verify', () => {
    // }

    // let addBackendDisposable = vscode.commands.registerCommand('extension.addNewBackend', () => {
    //         console.log("add new backend");
    //         let window = vscode.window;
    //         window.showInputBox()
    // });
    // context.subscriptions.push(addBackendDisposable);

    /*
    let siliconCommandDisposable = vscode.commands.registerCommand('extension.compileSilicon', () => {
        //vscode.window.showInformationMessage('Silicon-build-command detected');
        //removeDecorations();
        let window = vscode.window;
        let editor = window.activeTextEditor;
        if (!editor) return;

        //start verification of current file
        const exec = child_process.exec;
        //const ls = spawn('dir');
        let currfile = '"' + editor.document.fileName + '"';

        //let siliconHome = 'C:\\Users\\ruben\\Desktop\\Masterthesis\\Viper\\silicon';
        let env = process.env;
        let siliconHome = process.env.SILICON_HOME;
        if (!siliconHome) {
            console.log('ERROR: SILICON_HOME Environment Variable is not set.');
        }

        console.log('-> Env: SILICON_HOME: ' + siliconHome);

        console.log('-> Silicon: verify ' + currfile);
        const ls = exec('silicon.bat --ideMode ' + currfile, { cwd: siliconHome });

        var time = "0";

        ls.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            let stringData: string = data;
            let parts = stringData.split("\r\n"); //TODO: make compatible with OSX and LINUX

            parts.forEach((part, i, array) => {
                if (part.startsWith('Silicon finished in')) {
                    time = /.*?(\d*\.\d*)/.exec(part)[1];
                }
                else if (part == 'No errors found.') {
                    vscode.window.showInformationMessage('Successfully verified with Silicon in ' + time + ' seconds.');
                    time = "0";
                }
                else if (part.startsWith('The following errors were found')) {
                    vscode.window.showInformationMessage('Silicon: Verification failed after ' + time + ' seconds.');
                    time = "0";
                }
                else if (part.startsWith('  ')) {
                    let pos = /\s*(\d*):(\d*):(\.*)/.exec(part);
                    if (pos.length != 4) {
                        console.log('ERROR: could not parse error description: "' + part + '"');
                        return;
                    }
                    let lineNr = +pos[1]-1;
                    let charNr = +pos[2]-1;
                    let message = pos[3].trim();
                    markError(new vscode.Position(lineNr, charNr), new vscode.Position(lineNr, Number.MAX_VALUE),message);
                }
            })
        });

        ls.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`);
        });

        ls.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });

        console.log('after silicon start');
    });
    let carbonCommandDisposable = vscode.commands.registerCommand('extension.compileCarbon', () => {
        vscode.window.showInformationMessage('Carbon-build-command detected');
        removeDecorations();
    });

    let testCommandDisposable = vscode.commands.registerCommand('extension.test', () => {
        let window = vscode.window;
        let editor = window.activeTextEditor;
        if (!editor) return;

        //create a position(lineNumber,characterNumber)
        let origin = new vscode.Position(0, 0);

        let selection = editor.selection;
        let start = selection.start;
        let end = selection.end;

        let ranges = [];
        ranges.push(new vscode.Range(start, end));

        decorate(selection.start, selection.end);
        // //showing an input box
        // let lineNumber = window.showInputBox("line to delete");

        // //delete selection
        // editor.edit(editBuilder =>{
        //     editBuilder.delete(selection);
        // })

        // //validate file paths
        // let gutterImagePath = context.asAbsolutePath("error.png");
        // if (!fs.existsSync(gutterImagePath)){
        //      vscode.window.showInformationMessage('file not found at: '+gutterImagePath);
        //      return;
        // }
        // //decorate the gutter and overviewRuler
        // var bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
        //     gutterIconPath: gutterImagePath,
        //     overviewRulerLane: vscode.OverviewRulerLane.Full,
        //     overviewRulerColor: 'rgba(255, 0, 0, 0.7)'
        // });
        // editor.setDecorations(bookmarkDecorationType, ranges);

        // //check if file exists
        //let siliconPath = "C:\Users\ruben\Desktop\Masterthesis\Viper\silicon\target\scala-2.11\silicon.jar"
        //if(!doesFileExist(siliconPath)) return;

        // let exec = require('child_process').exec;
        // exec('silicon', function callback(error, stdout, stderr) {
        //     vscode.window.showInformationMessage('callback');
        // });
        // vscode.window.showInformationMessage('method end reached');
    });

    context.subscriptions.push(testCommandDisposable)
    context.subscriptions.push(carbonCommandDisposable);
    context.subscriptions.push(siliconCommandDisposable);
    */


