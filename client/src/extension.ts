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
import {Backend, ViperSettings, VerificationState, Commands, UpdateStatusBarParams} from './ViperProtocol';
import Uri from '../node_modules/vscode-uri/lib/index';
import {Log} from './Log';
import {DebugContentProvider} from './TextDocumentContentProvider';

let statusBarItem;
let statusBarProgress;
let abortButton;
let autoSaveEnabled: boolean;
let autoSaver: Timer;
let previewUri = vscode.Uri.parse('viper-preview://debug');
let state: ExtensionState;

let isWin = /^win/.test(process.platform);
let isLinux = /^linux/.test(process.platform);
let isMac = /^darwin/.test(process.platform);

let enableSecondWindow: boolean = false;

let fileSystemWatcher: vscode.FileSystemWatcher;
let manuallyTriggered: boolean;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    checkOperatingSystem();
    Log.initialize(context);
    Log.log('Viper-Client is now active!');
    state = new ExtensionState();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr');
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    startAutoSaver();
    registerHandlers();
    initializeStatusBar();

    if (enableSecondWindow) {
        registerTextDocumentProvider();
        showSecondWindow();
    }
}

export function deactivate() {
    Log.log("deactivate");
    state.dispose();
}

let provider: DebugContentProvider;

function registerTextDocumentProvider() {
    provider = new DebugContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', provider);
}

function showSecondWindow() {
    provider.update(previewUri);
    return vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
        vscode.window.showErrorMessage(reason);
    });
}

function initializeStatusBar() {
    statusBarProgress = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);

    state.state = VerificationState.Stopped;
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    statusBarItem.color = 'white';
    statusBarItem.text = "Hello from Viper";
    statusBarItem.show();

    abortButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
    abortButton.text = "$(x) Stop";
    abortButton.color = "orange";
    abortButton.command = "extension.stopVerification";
    abortButton.hide();

    state.context.subscriptions.push(statusBarProgress);
    state.context.subscriptions.push(statusBarItem);
    state.context.subscriptions.push(abortButton);
}

function startAutoSaver() {
    autoSaveEnabled = vscode.workspace.getConfiguration("viperSettings").get('autoSave') === true;
    let autoSaveTimeout = 1000;//ms
    autoSaver = new Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (autoSaveEnabled) {
                manuallyTriggered = false;
                vscode.window.activeTextEditor.document.save();
                if (enableSecondWindow) {
                    showSecondWindow();
                }
            }
        }
    }, autoSaveTimeout);

    state.context.subscriptions.push(autoSaver);

    let onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    let onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(resetAutoSaver);
    state.context.subscriptions.push(onActiveTextEditorChangeDisposable);
    state.context.subscriptions.push(onTextEditorSelectionChange);
}

function resetAutoSaver() {
    autoSaver.reset();
}

function registerHandlers() {
    state.client.onNotification(Commands.StateChange, (params: UpdateStatusBarParams) => {
        let window = vscode.window;
        switch (params.newState) {
            case VerificationState.Starting:
                statusBarItem.color = 'orange';
                statusBarItem.text = "starting";
                break;
            case VerificationState.VerificationRunning:
                statusBarItem.color = 'orange';
                if (!params.progress) {
                    statusBarItem.text = "pre-processing";
                    statusBarProgress.text = progressBarText(0);
                }
                else {
                    statusBarItem.text = "verifying: " + params.progress.toFixed(1) + "%"
                    statusBarProgress.text = progressBarText(params.progress);
                }
                statusBarProgress.show();
                abortButton.show();
                break;
            case VerificationState.Ready:
                if (params.firstTime) {
                    statusBarItem.color = 'white';
                    statusBarItem.text = "ready";
                } else {
                    if (params.success) {
                        statusBarItem.color = 'lightgreen';
                        statusBarItem.text = `$(check) done`;
                        if (params.manuallyTriggered) {
                            Log.hint("Successfully Verified " + params.filename);
                        }
                    } else {
                        statusBarItem.color = 'red';
                        statusBarItem.text = `$(x) failed`;
                    }
                }
                statusBarProgress.hide();
                abortButton.hide();
                break;
            case VerificationState.Stopping:
                statusBarItem.color = 'orange';
                statusBarItem.text = "preparing";
                break;
            default:
                break;
        }
    });

    state.client.onNotification(Commands.InvalidSettings, (data) => {
        Log.log("Invalid Settings detected");
        statusBarItem.color = 'red';
        statusBarItem.text = "Invalid Settings";

        let buttons: vscode.MessageItem = { title: "Open Settings" };

        vscode.window.showInformationMessage("Viper: Invalid settings: " + data, buttons).then((choice) => {
            if (!choice) {

            } else if (choice && choice.title === "Open Settings") {
                //user Settings
                let userSettings = userSettingsPath();
                Log.log("UserSettings: " + userSettings);
                showFile(userSettings, vscode.ViewColumn.Three);

                //workspaceSettings
                let workspaceSettingsPath = path.join(vscode.workspace.rootPath, '.vscode', 'settings.json');

                //makeSureFileExists(workspaceSettingsPath);
                //TODO: create file workspaceSettingsPath if it does not exist
                Log.log("WorkspaceSettings: " + workspaceSettingsPath);
                showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
            }
        });
    });

    state.client.onNotification(Commands.Hint, (data: string) => {
        Log.log("H: " + data);
        Log.hint(data);
    });

    state.client.onNotification(Commands.Log, (data: string) => {
        Log.log("S: " + data);
    });

    state.client.onNotification(Commands.ToLogFile, (data: string) => {
        Log.toLogFile("S: " + data);
    });

    state.client.onNotification(Commands.Error, (data: string) => {
        Log.error("S: " + data);
    });


    state.client.onRequest(Commands.UriToPath, (uri: string) => {
        let uriObject: vscode.Uri = vscode.Uri.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    });

    state.client.onRequest(Commands.PathToUri, (path: string) => {
        let uriObject: Uri = Uri.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    });

    state.client.onRequest(Commands.AskUserToSelectBackend, (backendNames: string[]) => {
        //only ask the user if there is a choice
        if (backendNames.length > 1) {
            vscode.window.showQuickPick(backendNames).then((selectedBackend) => {
                state.client.sendRequest(Commands.SelectBackend, selectedBackend);
            });
        } else {
            state.client.sendRequest(Commands.SelectBackend, backendNames[0]);
        }
    });

    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        verify(manuallyTriggered);
    }));

    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        autoSaveEnabled = vscode.workspace.getConfiguration("viperSettings").get('autoSave') === true;
    }));

    let verifyCommandDisposable = vscode.commands.registerCommand('extension.verify', () => {
        manuallyTriggered = true;
        vscode.window.activeTextEditor.document.save().then(saved => {
            if (!saved) {
                verify(true);
            }
        });
    });

    state.context.subscriptions.push(verifyCommandDisposable);

    let selectBackendCommandDisposable = vscode.commands.registerCommand('extension.selectBackend', () => {
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            state.client.sendRequest(Commands.RequestBackendSelection, null);
        }
    });
    state.context.subscriptions.push(selectBackendCommandDisposable);

    let startDebuggingCommandDisposable = vscode.commands.registerCommand('extension.startDebugging', () => {
        let openDoc = vscode.window.activeTextEditor.document.uri.path;
        if (isWin) {
            openDoc = openDoc.substring(1, openDoc.length);
        }
        let launchConfig = {
            name: "Viper Debug",
            type: "viper",
            request: "launch",
            program: openDoc,
            stopOnEntry: true
        }
        vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
            Log.log('Debug session started successfully');
        }, err => {
            Log.log('Error: ' + err.message);
        });
    });
    state.context.subscriptions.push(startDebuggingCommandDisposable);

    let selectStopVerificationDisposable = vscode.commands.registerCommand('extension.stopVerification', () => {
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            state.client.sendRequest(Commands.StopVerification, vscode.window.activeTextEditor.document.uri.toString());
        }
    });
    state.context.subscriptions.push(selectStopVerificationDisposable);
}

function showFile(filePath: string, column: vscode.ViewColumn) {
    let resource = vscode.Uri.file(filePath);
    vscode.workspace.openTextDocument(resource).then((doc) => {
        vscode.window.showTextDocument(doc, column);
    });
}

function makeSureFileExists(fileName: string) {
    try {
        if (fs.existsSync(fileName)) {
            fs.closeSync(fs.openSync(fileName, 'w'));
        }
    } catch (e) {
        Log.error(e);
    }
}

function verify(manuallyTriggered: boolean) {
    if (isViperSourceFile(vscode.window.activeTextEditor.document.uri.toString())){
        if (!state.client) {
            Log.hint("Extension not ready yet.");
        } else {
            state.client.sendRequest(Commands.Verify, { uri: vscode.window.activeTextEditor.document.uri.toString(), manuallyTriggered: manuallyTriggered });
        }
    }
}

function isViperSourceFile(uri: string): boolean {
    return uri.endsWith(".sil") || uri.endsWith(".vpr");
}

function progressBarText(progress: number): string {
    let bar = "";
    for (var i = 0; i < progress / 10; i++) {
        bar = bar + "⚫";
    }
    for (var i = 10; i > progress / 10; i--) {
        bar = bar + "⚪";
    }
    return bar;
}

function checkOperatingSystem() {
    if ((isWin ? 1 : 0) + (isMac ? 1 : 0) + (isLinux ? 1 : 0) != 1) {
        Log.error("Cannot detect OS")
        return;
    }
    if (isWin) {
        Log.log("OS: Windows");
    }
    else if (isMac) {
        Log.log("OS: OsX");
    }
    else if (isLinux) {
        Log.log("OS: Linux");
    }
}

function userSettingsPath() {
    if (isWin) {
        let appdata = process.env.APPDATA;
        return path.join(appdata, "Code", "User", "settings.json");
    } else {
        let home = process.env.HOME;
        if (isLinux) {
            return path.join(home, ".config", "Code", "User", "settings.json");
        } else if (isMac) {
            return path.join(home, "Library", "Application Support", "Code", "User", "settings.json");
        } else {
            Log.error("unknown Operating System: " + process.platform);
        }
    }
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
    Log.log('Remove decoration on: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")

    ranges.push(new vscode.Range(start, end));
    let decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(30,30,30,1)'
    }); //TODO: get color from theme
    editor.setDecorations(decorationRenderType, ranges);
}

function markError(start: vscode.Position, end: vscode.Position, message: string) {
    Log.log('Mark error: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")
    let window = vscode.window;
    let editor = window.activeTextEditor;
    let range = new vscode.Range(start, end);
    let diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)
}

function decorate(start: vscode.Position, end: vscode.Position) {
    Log.log('Decorate ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".")
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
        Log.hint('File not found at: ' + path);
        return false;
    }
    return true;
}
*/

    // let addBackendDisposable = vscode.commands.registerCommand('extension.addNewBackend', () => {
    //         Log.log("add new backend");
    //         let window = vscode.window;
    //         window.showInputBox()
    // });
    // context.subscriptions.push(addBackendDisposable);

    /*
    let siliconCommandDisposable = vscode.commands.registerCommand('extension.compileSilicon', () => {
        //Log.hint('Silicon-build-command detected');
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
            Log.log('ERROR: SILICON_HOME Environment Variable is not set.');
        }

        Log.log('-> Env: SILICON_HOME: ' + siliconHome);

        Log.log('-> Silicon: verify ' + currfile);
        const ls = exec('silicon.bat --ideMode ' + currfile, { cwd: siliconHome });

        var time = "0";

        ls.stdout.on('data', (data) => {
            Log.log(`stdout: ${data}`);
            let stringData: string = data;
            let parts = stringData.split("\r\n"); //TODO: make compatible with OSX and LINUX

            parts.forEach((part, i, array) => {
                if (part.startsWith('Silicon finished in')) {
                    time = /.*?(\d*\.\d*)/.exec(part)[1];
                }
                else if (part == 'No errors found.') {
                    Log.hint('Successfully verified with Silicon in ' + time + ' seconds.');
                    time = "0";
                }
                else if (part.startsWith('The following errors were found')) {
                    Log.hint('Silicon: Verification failed after ' + time + ' seconds.');
                    time = "0";
                }
                else if (part.startsWith('  ')) {
                    let pos = /\s*(\d*):(\d*):(\.*)/.exec(part);
                    if (pos.length != 4) {
                        Log.log('ERROR: could not parse error description: "' + part + '"');
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
            Log.log(`stderr: ${data}`);
        });

        ls.on('close', (code) => {
            Log.log(`child process exited with code ${code}`);
        });

        Log.log('after silicon start');
    });
    let carbonCommandDisposable = vscode.commands.registerCommand('extension.compileCarbon', () => {
        Log.hint('Carbon-build-command detected');
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
        //      Log.hint('file not found at: '+gutterImagePath);
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
        //     Log.hint('callback');
        // });
        // og.hint('method end reached');
    });

    context.subscriptions.push(testCommandDisposable)
    context.subscriptions.push(carbonCommandDisposable);
    context.subscriptions.push(siliconCommandDisposable);
    */


