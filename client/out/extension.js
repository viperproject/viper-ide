'use strict';
const fs = require('fs');
var ps = require('ps-node');
const path = require('path');
const Timer_1 = require('./Timer');
const vscode = require('vscode');
const ExtensionState_1 = require('./ExtensionState');
const ViperProtocol_1 = require('./ViperProtocol');
const index_1 = require('../node_modules/vscode-uri/lib/index');
const Log_1 = require('./Log');
const TextDocumentContentProvider_1 = require('./TextDocumentContentProvider');
let statusBarItem;
let statusBarProgress;
let abortButton;
let autoSaveEnabled;
let autoSaver;
let previewUri = vscode.Uri.parse('viper-preview://debug');
let state;
let isWin = /^win/.test(process.platform);
let isLinux = /^linux/.test(process.platform);
let isMac = /^darwin/.test(process.platform);
let enableSecondWindow = false;
let fileSystemWatcher;
let manuallyTriggered;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    Log_1.Log.initialize(context);
    checkOperatingSystem();
    Log_1.Log.log('Viper-Client is now active!', ViperProtocol_1.LogLevel.Info);
    state = new ExtensionState_1.ExtensionState();
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
exports.activate = activate;
function deactivate() {
    Log_1.Log.log("deactivate", ViperProtocol_1.LogLevel.Info);
    state.dispose();
}
exports.deactivate = deactivate;
let provider;
function registerTextDocumentProvider() {
    provider = new TextDocumentContentProvider_1.DebugContentProvider();
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
    state.state = ViperProtocol_1.VerificationState.Stopped;
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
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
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
    state.client.onNotification(ViperProtocol_1.Commands.StateChange, (params) => {
        let window = vscode.window;
        switch (params.newState) {
            case ViperProtocol_1.VerificationState.Starting:
                statusBarItem.color = 'orange';
                statusBarItem.text = "starting";
                statusBarItem.tooltip = null; //"Starting " + params.backendName;
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                statusBarItem.tooltip = null;
                statusBarItem.color = 'orange';
                if (!params.progress) {
                    statusBarItem.text = "pre-processing";
                    statusBarProgress.text = progressBarText(0);
                }
                else {
                    statusBarItem.text = `verifying ${params.filename}: ` + params.progress.toFixed(1) + "%";
                    statusBarProgress.text = progressBarText(params.progress);
                }
                statusBarProgress.show();
                abortButton.show();
                break;
            case ViperProtocol_1.VerificationState.Ready:
                if (params.firstTime) {
                    statusBarItem.color = 'white';
                    statusBarItem.text = "ready";
                    statusBarItem.tooltip = null;
                    //automatically trigger the first verification
                    verify(false);
                }
                else {
                    let msg = "";
                    switch (params.success) {
                        case ViperProtocol_1.Success.Success:
                            statusBarItem.color = 'lightgreen';
                            msg = `Successfully verified ${params.filename} in ${params.time} seconds`;
                            statusBarItem.text = "$(check) " + msg;
                            Log_1.Log.log(msg);
                            if (params.manuallyTriggered) {
                                Log_1.Log.hint(msg);
                            }
                            break;
                        case ViperProtocol_1.Success.ParsingFailed:
                            Log_1.Log.log(`Parsing ${params.filename} failed after ${params.time} seconds with ${params.nofErrors} errors`, ViperProtocol_1.LogLevel.Default);
                            statusBarItem.color = 'red';
                            statusBarItem.text = `$(x) Parse errors detected`;
                            break;
                        case ViperProtocol_1.Success.VerificationFailed:
                            Log_1.Log.log(`Verifying ${params.filename} failed after ${params.time} seconds with ${params.nofErrors} errors`, ViperProtocol_1.LogLevel.Default);
                            statusBarItem.color = 'red';
                            statusBarItem.text = `$(x) Verification failed with ${params.nofErrors} errors`;
                            break;
                        case ViperProtocol_1.Success.Error:
                            statusBarItem.color = 'red';
                            let msg2 = " - see View->Output->Viper for more info";
                            statusBarItem.text = `$(x) Internal error` + msg2;
                            msg = `Verifying ${params.filename} failed due to an internal error`;
                            Log_1.Log.log(msg);
                            Log_1.Log.hint(msg + msg2);
                            break;
                    }
                }
                statusBarProgress.hide();
                abortButton.hide();
                break;
            case ViperProtocol_1.VerificationState.Stopping:
                statusBarItem.color = 'orange';
                statusBarItem.text = "preparing";
                statusBarItem.tooltip = null;
                break;
            default:
                break;
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.InvalidSettings, (data) => {
        Log_1.Log.log("Invalid Settings detected", ViperProtocol_1.LogLevel.Default);
        statusBarItem.color = 'red';
        statusBarItem.text = "Invalid Settings";
        let userSettingsButton = { title: "Open User Settings" };
        let workspaceSettingsButton = { title: "Open Workspace Settings" };
        vscode.window.showInformationMessage("Viper: Invalid settings: " + data, userSettingsButton, workspaceSettingsButton).then((choice) => {
            if (!choice) {
            }
            else if (choice.title === workspaceSettingsButton.title) {
                try {
                    let rootPath = vscode.workspace.rootPath;
                    if (!rootPath) {
                        Log_1.Log.hint("Only if a folder is opened, the workspace settings can be accessed.");
                        return;
                    }
                    //workspaceSettings
                    let workspaceSettingsPath = path.join(rootPath, '.vscode', 'settings.json');
                    Log_1.Log.log("WorkspaceSettings: " + workspaceSettingsPath, ViperProtocol_1.LogLevel.Debug);
                    makeSureFileExists(workspaceSettingsPath);
                    showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
                }
                catch (e) {
                    Log_1.Log.error("Error accessing workspace settings: " + e);
                }
            }
            else if (choice.title === userSettingsButton.title) {
                try {
                    //user Settings
                    let userSettings = userSettingsPath();
                    Log_1.Log.log("UserSettings: " + userSettings, ViperProtocol_1.LogLevel.Debug);
                    makeSureFileExists(userSettings);
                    showFile(userSettings, vscode.ViewColumn.Two);
                }
                catch (e) {
                    Log_1.Log.error("Error accessing user settings: " + e);
                }
            }
        });
    });
    state.client.onNotification(ViperProtocol_1.Commands.Hint, (data) => {
        Log_1.Log.hint(data);
    });
    state.client.onNotification(ViperProtocol_1.Commands.Log, (data) => {
        Log_1.Log.log((Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? "S: " : "") + data, ViperProtocol_1.LogLevel.Default);
    });
    state.client.onNotification(ViperProtocol_1.Commands.ToLogFile, (data) => {
        Log_1.Log.toLogFile((Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? "S: " : "") + data, ViperProtocol_1.LogLevel.Default);
    });
    state.client.onNotification(ViperProtocol_1.Commands.Error, (data) => {
        Log_1.Log.error((Log_1.Log.logLevel >= ViperProtocol_1.LogLevel.Debug ? "S: " : "") + data, ViperProtocol_1.LogLevel.Default);
    });
    state.client.onRequest(ViperProtocol_1.Commands.UriToPath, (uri) => {
        let uriObject = vscode.Uri.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    });
    state.client.onRequest(ViperProtocol_1.Commands.PathToUri, (path) => {
        let uriObject = index_1.default.file(path);
        let platformIndependentUri = uriObject.toString();
        return platformIndependentUri;
    });
    state.client.onRequest(ViperProtocol_1.Commands.AskUserToSelectBackend, (backendNames) => {
        //only ask the user if there is a choice
        if (backendNames.length > 1) {
            vscode.window.showQuickPick(backendNames).then((selectedBackend) => {
                state.client.sendRequest(ViperProtocol_1.Commands.SelectBackend, selectedBackend);
            });
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.SelectBackend, backendNames[0]);
        }
    });
    state.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((params) => {
        verify(manuallyTriggered);
    }));
    state.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        autoSaveEnabled = vscode.workspace.getConfiguration("viperSettings").get('autoSave') === true;
        Log_1.Log.updateSettings();
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
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.RequestBackendSelection, null);
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
        };
        vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
            Log_1.Log.log('Debug session started successfully', ViperProtocol_1.LogLevel.Info);
        }, err => {
            Log_1.Log.error(err.message);
        });
    });
    state.context.subscriptions.push(startDebuggingCommandDisposable);
    let selectStopVerificationDisposable = vscode.commands.registerCommand('extension.stopVerification', () => {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.StopVerification, vscode.window.activeTextEditor.document.uri.toString());
        }
    });
    state.context.subscriptions.push(selectStopVerificationDisposable);
}
function showFile(filePath, column) {
    let resource = vscode.Uri.file(filePath);
    vscode.workspace.openTextDocument(resource).then((doc) => {
        vscode.window.showTextDocument(doc, column);
    });
}
function makeSureFileExists(fileName) {
    try {
        if (!fs.existsSync(fileName)) {
            fs.createWriteStream(fileName).close();
        }
    }
    catch (e) {
        Log_1.Log.error("Cannot create file: " + e);
    }
}
function verify(manuallyTriggered) {
    if (isViperSourceFile(vscode.window.activeTextEditor.document.uri.toString())) {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.Verify, { uri: vscode.window.activeTextEditor.document.uri.toString(), manuallyTriggered: manuallyTriggered });
        }
    }
}
function isViperSourceFile(uri) {
    return uri.endsWith(".sil") || uri.endsWith(".vpr");
}
function progressBarText(progress) {
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
        Log_1.Log.error("Cannot detect OS");
        return;
    }
    if (isWin) {
        Log_1.Log.log("OS: Windows", ViperProtocol_1.LogLevel.Debug);
    }
    else if (isMac) {
        Log_1.Log.log("OS: OsX", ViperProtocol_1.LogLevel.Debug);
    }
    else if (isLinux) {
        Log_1.Log.log("OS: Linux", ViperProtocol_1.LogLevel.Debug);
    }
}
function userSettingsPath() {
    if (isWin) {
        let appdata = process.env.APPDATA;
        return path.join(appdata, "Code", "User", "settings.json");
    }
    else {
        let home = process.env.HOME;
        if (isLinux) {
            return path.join(home, ".config", "Code", "User", "settings.json");
        }
        else if (isMac) {
            return path.join(home, "Library", "Application Support", "Code", "User", "settings.json");
        }
        else {
            Log_1.Log.error("unknown Operating System: " + process.platform);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFLYixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUE0RyxpQkFBaUIsQ0FBQyxDQUFBO0FBQzlILHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQiw4Q0FBbUMsK0JBQStCLENBQUMsQ0FBQTtBQUVuRSxJQUFJLGFBQWEsQ0FBQztBQUNsQixJQUFJLGlCQUFpQixDQUFDO0FBQ3RCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksZUFBd0IsQ0FBQztBQUM3QixJQUFJLFNBQWdCLENBQUM7QUFDckIsSUFBSSxVQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUMzRCxJQUFJLEtBQXFCLENBQUM7QUFFMUIsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDMUMsSUFBSSxPQUFPLEdBQUcsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDOUMsSUFBSSxLQUFLLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7QUFFN0MsSUFBSSxrQkFBa0IsR0FBWSxLQUFLLENBQUM7QUFFeEMsSUFBSSxpQkFBMkMs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