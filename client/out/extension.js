'use strict';
var ps = require('ps-node');
const path = require('path');
const Timer_1 = require('./Timer');
const vscode = require('vscode');
const ExtensionState_1 = require('./ExtensionState');
const ViperProtocol_1 = require('./ViperProtocol');
const index_1 = require('../node_modules/vscode-uri/lib/index');
const Log_1 = require('./Log');
const StateVisualizer_1 = require('./StateVisualizer');
const Helper_1 = require('./Helper');
let statusBarItem;
let statusBarProgress;
let backendStatusBar;
let abortButton;
let autoSaver;
let state;
let fileSystemWatcher;
let manuallyTriggered;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    Log_1.Log.initialize(context);
    Log_1.Log.log('Viper-Client is now active!', ViperProtocol_1.LogLevel.Info);
    state = ExtensionState_1.ExtensionState.createExtensionState();
    state.checkOperatingSystem();
    context.subscriptions.push(state);
    fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr');
    state.startLanguageServer(context, fileSystemWatcher, false); //break?
    startAutoSaver();
    registerHandlers();
    initializeStatusBar();
    StateVisualizer_1.StateVisualizer.initialize(); //enable second window
}
exports.activate = activate;
// function decorateText(position: vscode.Position) {
//     let ranges: vscode.Range[] = [];
//     //ranges.push(new vscode.Range(position, new vscode.Position(2,5)));
//     let decorationRenderType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({});
//     let options: vscode.DecorationOptions[] = [{
//         range: new vscode.Range(position, new vscode.Position(1, 10)),
//         renderOptions: {
//             before: {
//                 contentText: "⚫",
//                 color: "red",
//             }
//         }
//     }];
//     if (textEditorUnderVerification) {
//         textEditorUnderVerification.setDecorations(decorationRenderType, options);
//     }
// }
function deactivate() {
    Log_1.Log.log("deactivate", ViperProtocol_1.LogLevel.Info);
    state.dispose();
}
exports.deactivate = deactivate;
function initializeStatusBar() {
    state.state = ViperProtocol_1.VerificationState.Stopped;
    statusBarProgress = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 11);
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    updateStatusBarItem(statusBarItem, "Hello from Viper", "white");
    abortButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 9);
    abortButton.command = "extension.stopVerification";
    updateStatusBarItem(abortButton, "$(x) Stop", "orange", null, false);
    state.context.subscriptions.push(statusBarProgress);
    state.context.subscriptions.push(statusBarItem);
    state.context.subscriptions.push(abortButton);
    backendStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 12);
}
function updateStatusBarItem(item, text, color, tooltip = null, show = true) {
    item.text = text;
    item.color = color;
    item.tooltip = tooltip;
    if (show) {
        item.show();
    }
    else {
        item.hide();
    }
}
function startAutoSaver() {
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
        //only save viper files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'viper') {
            if (Helper_1.Helper.getConfiguration('autoSave') === true) {
                manuallyTriggered = false;
                vscode.window.activeTextEditor.document.save();
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
function handleStateChange(params) {
    Log_1.Log.log("The new state is: " + ViperProtocol_1.VerificationState[params.newState], ViperProtocol_1.LogLevel.Debug);
    let window = vscode.window;
    switch (params.newState) {
        case ViperProtocol_1.VerificationState.Starting:
            updateStatusBarItem(statusBarItem, 'starting', 'orange' /*,"Starting " + params.backendName*/);
            break;
        case ViperProtocol_1.VerificationState.VerificationRunning:
            let showProgressBar = Helper_1.Helper.getConfiguration('showProgress') === true;
            if (!params.progress) {
                updateStatusBarItem(statusBarItem, "pre-processing", 'orange');
                updateStatusBarItem(statusBarProgress, progressBarText(0), 'white', null, showProgressBar);
            }
            else {
                updateStatusBarItem(statusBarItem, `verifying ${params.filename}: ` + params.progress.toFixed(1) + "%", 'orange');
                updateStatusBarItem(statusBarProgress, progressBarText(params.progress), 'white', null, showProgressBar);
            }
            abortButton.show();
            break;
        case ViperProtocol_1.VerificationState.Ready:
            if (params.firstTime) {
                updateStatusBarItem(statusBarItem, "ready", 'white');
                //automatically trigger the first verification
                if (params.verificationNeeded && Helper_1.Helper.getConfiguration('autoVerifyAfterBackendChange') === true) {
                    verify(false);
                }
            }
            else {
                let msg = "";
                switch (params.success) {
                    case ViperProtocol_1.Success.Success:
                        msg = `Successfully verified ${params.filename} in ${params.time.toFixed(1)} seconds`;
                        Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(check) " + msg, 'lightgreen');
                        if (params.manuallyTriggered)
                            Log_1.Log.hint(msg);
                        break;
                    case ViperProtocol_1.Success.ParsingFailed:
                        msg = `Parsing ${params.filename} failed after ${params.time.toFixed(1)} seconds`;
                        Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                        break;
                    case ViperProtocol_1.Success.TypecheckingFailed:
                        msg = `Type checking ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                        Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                        break;
                    case ViperProtocol_1.Success.VerificationFailed:
                        msg = `Verifying ${params.filename} failed after ${params.time.toFixed(1)} seconds with ${params.nofErrors} error${params.nofErrors == 1 ? "s" : ""}`;
                        Log_1.Log.log(msg, ViperProtocol_1.LogLevel.Default);
                        updateStatusBarItem(statusBarItem, "$(x) " + msg, 'red');
                        break;
                    case ViperProtocol_1.Success.Aborted:
                        updateStatusBarItem(statusBarItem, "Verification aborted", 'orange');
                        Log_1.Log.log(`Verifying ${params.filename} was aborted`, ViperProtocol_1.LogLevel.Info);
                        break;
                    case ViperProtocol_1.Success.Error:
                        let msg2 = " - see View->Output->Viper for more info";
                        updateStatusBarItem(statusBarItem, `$(x) Internal error` + msg2, 'red');
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
            updateStatusBarItem(statusBarItem, 'preparing', 'orange');
            break;
        default:
            break;
    }
}
function handleInvalidSettings(data) {
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
                Helper_1.Helper.makeSureFileExists(workspaceSettingsPath);
                Helper_1.Helper.showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
            }
            catch (e) {
                Log_1.Log.error("Error accessing workspace settings: " + e);
            }
        }
        else if (choice.title === userSettingsButton.title) {
            try {
                //user Settings
                let userSettings = state.userSettingsPath();
                Log_1.Log.log("UserSettings: " + userSettings, ViperProtocol_1.LogLevel.Debug);
                Helper_1.Helper.makeSureFileExists(userSettings);
                Helper_1.Helper.showFile(userSettings, vscode.ViewColumn.Two);
            }
            catch (e) {
                Log_1.Log.error("Error accessing user settings: " + e);
            }
        }
    });
}
function registerHandlers() {
    state.client.onNotification(ViperProtocol_1.Commands.StateChange, (params) => handleStateChange(params));
    state.client.onNotification(ViperProtocol_1.Commands.InvalidSettings, (data) => handleInvalidSettings(data));
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
    state.client.onNotification(ViperProtocol_1.Commands.BackendChange, (newBackend) => {
        updateStatusBarItem(backendStatusBar, newBackend, "white");
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
        Log_1.Log.updateSettings();
    }));
    //Heap visualization
    state.client.onNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, (params) => StateVisualizer_1.StateVisualizer.storeNewStates(params));
    state.client.onRequest(ViperProtocol_1.Commands.HeapGraph, (heapGraph) => {
        //Log.log("HeapGraph",LogLevel.Debug);
        StateVisualizer_1.StateVisualizer.showHeap(heapGraph);
    });
    vscode.window.onDidChangeTextEditorSelection((change) => {
        //Log.log("OnDidChangeTextEditorSelection",LogLevel.Debug);
        let uri = change.textEditor.document.uri.toString();
        let start = change.textEditor.selection.start;
        StateVisualizer_1.StateVisualizer.showStateSelection(uri, start);
    });
    state.client.onRequest(ViperProtocol_1.Commands.StateSelected, change => {
        //Log.log("stateSelected",LogLevel.Debug);
        let castChange = change;
        StateVisualizer_1.StateVisualizer.showStateSelection(castChange.uri, { line: castChange.line, character: castChange.character });
    });
    //Command Handlers
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.verify', () => {
        manuallyTriggered = true;
        vscode.window.activeTextEditor.document.save().then(saved => {
            if (!saved) {
                //Log.log("manual verification request",LogLevel.Debug);
                verify(true);
            }
        });
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.selectBackend', () => {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.RequestBackendSelection, null);
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.startDebugging', () => {
        let openDoc = vscode.window.activeTextEditor.document.uri.path;
        if (state.isWin) {
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
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.stopVerification', () => {
        if (state.client) {
            Log_1.Log.log("Verification stop request", ViperProtocol_1.LogLevel.Debug);
            abortButton.hide();
            statusBarItem.color = 'orange';
            statusBarItem.text = "aborting";
            statusBarProgress.hide();
            state.client.sendRequest(ViperProtocol_1.Commands.StopVerification, vscode.window.activeTextEditor.document.uri.toString());
        }
        else {
            Log_1.Log.hint("Extension not ready yet.");
        }
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.showStates', () => {
        StateVisualizer_1.StateVisualizer.showStates = true;
        StateVisualizer_1.StateVisualizer.showDecorations();
    }));
    state.context.subscriptions.push(vscode.commands.registerCommand('extension.hideStates', () => {
        StateVisualizer_1.StateVisualizer.showStates = false;
        StateVisualizer_1.StateVisualizer.hideDecorations();
    }));
}
function verify(manuallyTriggered) {
    if (Helper_1.Helper.isViperSourceFile(vscode.window.activeTextEditor.document.uri.toString())) {
        if (!state.client) {
            Log_1.Log.hint("Extension not ready yet.");
        }
        else {
            let workspace = vscode.workspace.rootPath ? vscode.workspace.rootPath : path.dirname(vscode.window.activeTextEditor.document.fileName);
            state.client.sendRequest(ViperProtocol_1.Commands.Verify, { uri: vscode.window.activeTextEditor.document.uri.toString(), manuallyTriggered: manuallyTriggered, workspace: workspace });
        }
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUF1SCxpQkFBaUIsQ0FBQyxDQUFBO0FBQ3pJLHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixrQ0FBOEIsbUJBQW1CLENBQUMsQ0FBQTtBQUNsRCx5QkFBcUIsVUFBVSxDQUFDLENBQUE7QUFHaEMsSUFBSSxhQUFhLENBQUM7QUFDbEIsSUFBSSxpQkFBaUIsQ0FBQztBQUN0QixJQUFJLGdCQUFnQixDQUFDO0FBQ3JCLElBQUksV0FBVyxDQUFDO0FBQ2hCLElBQUksU0FBZ0IsQ0FBQztBQUNyQixJQUFJLEtBQXFCLENBQUM7QUFFMUIsSUFBSSxpQkFBMkMsQ0FBQztBQUNoRCxJQUFJLGlCQUEwQixDQUFDO0FBRS9CLHlEQUF5RDtBQUN6RCwwRUFBMEU7QUFDMUUsa0JBQXlCLE9BQWdDO0lBQ3JELFNBQUcsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDeEIsU0FBRyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsRUFBRSx3QkFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RELEtBQUssR0FBRywrQkFBYyxDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDOUMsS0FBSyxDQUFDLG9CQUFvQixFQUFFLENBQUM7SUFDN0IsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsaUJBQWlCLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyx1QkFBdUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0lBQ25GLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQyxRQUFRO0lBQ3RFLGNBQWMsRUFBRSxDQUFDO0lBQ2pCLGdCQUFnQixFQUFFLENBQUM7SUFDbkIsbUJBQW1CLEVBQUUsQ0FBQztJQUN0QixpQ0FBZSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUEsc0JBQXNCO0FBQ3ZELENBQUM7QUFaZSxnQkFBUSxXQVl2QixDQUFBO0FBRUQscURBQXFEO0FBQ3JELHVDQUF1QztBQUN2QywyRUFBMkU7QUFDM0Usb0hBQW9IO0FBQ3BILG1EQUFtRDtBQUNuRCx5RUFBeUU7QUFDekUsMkJBQTJCO0FBQzNCLHdCQUF3QjtBQUN4QixvQ0FBb0M7QUFDcEMsZ0NBQWdDO0FBQ2hDLGdCQUFnQjtBQUNoQixZQUFZO0FBQ1osVUFBVTtBQUNWLHlDQUF5QztBQUN6QyxxRkFBcUY7QUFDckYsUUFBUTtBQUNSLElBQUk7QUFFSjtJQUNJLFNBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDckMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0FBQ3BCLENBQUM7QUFIZSxrQkFBVSxhQUd6QixDQUFBO0FBRUQ7SUFDSSxLQUFLLENBQUMsS0FBSyxHQUFHLGlDQUFpQixDQUFDLE9BQU8sQ0FBQztJQUV4QyxpQkFBaUIsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDMUYsYUFBYSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN0RixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsa0JBQWtCLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFFaEUsV0FBVyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNuRixXQUFXLENBQUMsT0FBTyxHQUFHLDRCQUE0QixDQUFDO0lBQ25ELG1CQUFtQixDQUFDLFdBQVcsRUFBRSxXQUFXLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQTtJQUVwRSxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNwRCxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDaEQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBRTlDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLGtCQUFrQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBRUQsNkJBQTZCLElBQUksRUFBRSxJQUFZLEVBQUUsS0FBYSxFQUFFLE9BQU8sR0FBVyxJQUFJLEVBQUUsSUFBSSxHQUFZLElBQUk7SUFDeEcsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7SUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7SUFDbkIsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7SUFDdkIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNQLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNoQixDQUFDO0lBQUMsSUFBSSxDQUFDLENBQUM7UUFDSixJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDaEIsQ0FBQztBQUNMLENBQUM7QUFFRDtJQUNJLElBQUksZUFBZSxHQUFHLElBQUksQ0FBQyxDQUFBLElBQUk7SUFDL0IsU0FBUyxHQUFHLElBQUksYUFBSyxDQUFDO1FBQ2xCLHVCQUF1QjtRQUN2QixFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixJQUFJLElBQUksSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLENBQUMsQ0FBQztZQUMxRyxFQUFFLENBQUMsQ0FBQyxlQUFNLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztnQkFDL0MsaUJBQWlCLEdBQUcsS0FBSyxDQUFDO2dCQUMxQixNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuRCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztJQUVwQixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7SUFFNUMsSUFBSSxrQ0FBa0MsR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLDJCQUEyQixDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQ25HLElBQUksMkJBQTJCLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyw4QkFBOEIsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUMvRixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsa0NBQWtDLENBQUMsQ0FBQztJQUNyRSxLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUNsRSxDQUFDO0FBRUQ7SUFDSSxTQUFTLENBQUMsS0FBSyxFQUFFLENBQUM7QUFDdEIsQ0FBQztBQUVELDJCQUEyQixNQUE2QjtJQUNwRCxTQUFHLENBQUMsR0FBRyxDQUFDLG9CQUFvQixHQUFHLGlDQUFpQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ25GLElBQUksTUFBTSxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUM7SUFDM0IsTUFBTSxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7UUFDdEIsS0FBSyxpQ0FBaUIsQ0FBQyxRQUFRO1lBQzNCLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxVQUFVLEVBQUUsUUFBUSxDQUFBLHFDQUFxQyxDQUFDLENBQUM7WUFDOUYsS0FBSyxDQUFDO1FBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxtQkFBbUI7WUFDdEMsSUFBSSxlQUFlLEdBQUcsZUFBTSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxLQUFLLElBQUksQ0FBQztZQUN2RSxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUNuQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsZ0JBQWdCLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQy9ELG1CQUFtQixDQUFDLGlCQUFpQixFQUFFLGVBQWUsQ0FBQyxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQy9GLENBQUM7WUFDRCxJQUFJLENBQUMsQ0FBQztnQkFDRixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsYUFBYSxNQUFNLENBQUMsUUFBUSxJQUFJLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxFQUFFLFFBQVEsQ0FBQyxDQUFDO2dCQUNsSCxtQkFBbUIsQ0FBQyxpQkFBaUIsRUFBRSxlQUFlLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDN0csQ0FBQztZQUNELFdBQVcsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNuQixLQUFLLENBQUM7UUFDVixLQUFLLGlDQUFpQixDQUFDLEtBQUs7WUFDeEIsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7Z0JBQ25CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7Z0JBQ3JELDhDQUE4QztnQkFDOUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLGtCQUFrQixJQUFJLGVBQU0sQ0FBQyxnQkFBZ0IsQ0FBQyw4QkFBOEIsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ2hHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbEIsQ0FBQztZQUNMLENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixJQUFJLEdBQUcsR0FBVyxFQUFFLENBQUM7Z0JBQ3JCLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO29CQUNyQixLQUFLLHVCQUFPLENBQUMsT0FBTzt3QkFDaEIsR0FBRyxHQUFHLHlCQUF5QixNQUFNLENBQUMsUUFBUSxPQUFPLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7d0JBQ3RGLFNBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7d0JBQy9CLG1CQUFtQixDQUFDLGFBQWEsRUFBRSxXQUFXLEdBQUcsR0FBRyxFQUFFLFlBQVksQ0FBQyxDQUFDO3dCQUNwRSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUM7NEJBQUMsU0FBRyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDNUMsS0FBSyxDQUFDO29CQUNWLEtBQUssdUJBQU8sQ0FBQyxhQUFhO3dCQUN0QixHQUFHLEdBQUcsV0FBVyxNQUFNLENBQUMsUUFBUSxpQkFBaUIsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQzt3QkFDbEYsU0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQzt3QkFDL0IsbUJBQW1CLENBQUMsYUFBYSxFQUFFLE9BQU8sR0FBRyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUM7d0JBQ3pELEtBQUssQ0FBQztvQkFDVixLQUFLLHVCQUFPLENBQUMsa0JBQWtCO3dCQUMzQixHQUFHLEdBQUcsaUJBQWlCLE1BQU0sQ0FBQyxRQUFRLGlCQUFpQixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsaUJBQWlCLE1BQU0sQ0FBQyxTQUFTLFNBQVMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDO3dCQUMxSixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzt3QkFDekQsS0FBSyxDQUFDO29CQUNWLEtBQUssdUJBQU8sQ0FBQyxrQkFBa0I7d0JBQzNCLEdBQUcsR0FBRyxhQUFhLE1BQU0sQ0FBQyxRQUFRLGlCQUFpQixNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsaUJBQWlCLE1BQU0sQ0FBQyxTQUFTLFNBQVMsTUFBTSxDQUFDLFNBQVMsSUFBSSxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsRUFBRSxDQUFDO3dCQUN0SixTQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO3dCQUMvQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsT0FBTyxHQUFHLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQzt3QkFDekQsS0FBSyxDQUFDO29CQUNWLEtBQUssdUJBQU8sQ0FBQyxPQUFPO3dCQUNoQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsc0JBQXNCLEVBQUUsUUFBUSxDQUFDLENBQUM7d0JBQ3JFLFNBQUcsQ0FBQyxHQUFHLENBQUMsYUFBYSxNQUFNLENBQUMsUUFBUSxjQUFjLEVBQUUsd0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzt3QkFDbkUsS0FBSyxDQUFDO29CQUNWLEtBQUssdUJBQU8sQ0FBQyxLQUFLO3dCQUNkLElBQUksSUFBSSxHQUFHLDBDQUEwQyxDQUFBO3dCQUNyRCxtQkFBbUIsQ0FBQyxhQUFhLEVBQUUscUJBQXFCLEdBQUcsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO3dCQUN4RSxHQUFHLEdBQUcsYUFBYSxNQUFNLENBQUMsUUFBUSxrQ0FBa0MsQ0FBQzt3QkFDckUsU0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQzt3QkFDYixTQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQzt3QkFDckIsS0FBSyxDQUFDO2dCQUNkLENBQUM7WUFDTCxDQUFDO1lBQ0QsaUJBQWlCLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDekIsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ25CLEtBQUssQ0FBQztRQUNWLEtBQUssaUNBQWlCLENBQUMsUUFBUTtZQUMzQixtQkFBbUIsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzFELEtBQUssQ0FBQztRQUNWO1lBQ0ksS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNMLENBQUM7QUFFRCwrQkFBK0IsSUFBSTtJQUMvQixTQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDdkQsYUFBYSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7SUFDNUIsYUFBYSxDQUFDLElBQUksR0FBRyxrQkFBa0IsQ0FBQztJQUV4QyxJQUFJLGtCQUFrQixHQUF1QixFQUFFLEtBQUssRUFBRSxvQkFBb0IsRUFBRSxDQUFDO0lBQzdFLElBQUksdUJBQXVCLEdBQXVCLEVBQUUsS0FBSyxFQUFFLHlCQUF5QixFQUFFLENBQUM7SUFFdkYsTUFBTSxDQUFDLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQywyQkFBMkIsR0FBRyxJQUFJLEVBQUUsa0JBQWtCLEVBQUUsdUJBQXVCLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNO1FBQzlILEVBQUUsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUVkLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssS0FBSyx1QkFBdUIsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ3hELElBQUksQ0FBQztnQkFDRCxJQUFJLFFBQVEsR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQztnQkFDekMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO29CQUNaLFNBQUcsQ0FBQyxJQUFJLENBQUMscUVBQXFFLENBQUMsQ0FBQTtvQkFDL0UsTUFBTSxDQUFDO2dCQUNYLENBQUM7Z0JBQ0QsbUJBQW1CO2dCQUNuQixJQUFJLHFCQUFxQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxlQUFlLENBQUMsQ0FBQztnQkFDNUUsU0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsR0FBRyxxQkFBcUIsRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN2RSxlQUFNLENBQUMsa0JBQWtCLENBQUMscUJBQXFCLENBQUMsQ0FBQztnQkFDakQsZUFBTSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2xFLENBQUU7WUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsc0NBQXNDLEdBQUcsQ0FBQyxDQUFDLENBQUE7WUFDekQsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssS0FBSyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ25ELElBQUksQ0FBQztnQkFDRCxlQUFlO2dCQUNmLElBQUksWUFBWSxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO2dCQUM1QyxTQUFHLENBQUMsR0FBRyxDQUFDLGdCQUFnQixHQUFHLFlBQVksRUFBRSx3QkFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUN6RCxlQUFNLENBQUMsa0JBQWtCLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQ3hDLGVBQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDekQsQ0FBRTtZQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxpQ0FBaUMsR0FBRyxDQUFDLENBQUMsQ0FBQTtZQUNwRCxDQUFDO1FBQ0wsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ1AsQ0FBQztBQUVEO0lBRUksS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxNQUE2QixLQUFLLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7SUFDaEgsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxlQUFlLEVBQUUsQ0FBQyxJQUFJLEtBQUsscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUM3RixLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLElBQUksRUFBRSxDQUFDLElBQVk7UUFDcEQsU0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBWTtRQUNuRCxTQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBRyxDQUFDLFFBQVEsSUFBSSx3QkFBUSxDQUFDLEtBQUssR0FBRyxLQUFLLEdBQUcsRUFBRSxDQUFDLEdBQUcsSUFBSSxFQUFFLHdCQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEYsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLGNBQWMsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDLElBQVk7UUFDekQsU0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLFNBQUcsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQyxHQUFHLElBQUksRUFBRSx3QkFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzFGLENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxJQUFZO1FBQ3JELFNBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxTQUFHLENBQUMsUUFBUSxJQUFJLHdCQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssR0FBRyxFQUFFLENBQUMsR0FBRyxJQUFJLEVBQUUsd0JBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUN0RixDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxNQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsYUFBYSxFQUFFLENBQUMsVUFBa0I7UUFDbkUsbUJBQW1CLENBQUMsZ0JBQWdCLEVBQUUsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQy9ELENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxHQUFXO1FBQ25ELElBQUksU0FBUyxHQUFlLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2xELElBQUksdUJBQXVCLEdBQUcsU0FBUyxDQUFDLE1BQU0sQ0FBQztRQUMvQyxNQUFNLENBQUMsdUJBQXVCLENBQUM7SUFDbkMsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDLElBQVk7UUFDcEQsSUFBSSxTQUFTLEdBQVEsZUFBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxJQUFJLHNCQUFzQixHQUFHLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNsRCxNQUFNLENBQUMsc0JBQXNCLENBQUM7SUFDbEMsQ0FBQyxDQUFDLENBQUM7SUFDSCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLHNCQUFzQixFQUFFLENBQUMsWUFBc0I7UUFDM0Usd0NBQXdDO1FBQ3hDLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQixNQUFNLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxlQUFlO2dCQUMzRCxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLGFBQWEsRUFBRSxlQUFlLENBQUMsQ0FBQztZQUN0RSxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsYUFBYSxFQUFFLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUNILEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLHFCQUFxQixDQUFDLENBQUMsTUFBTTtRQUMzRSxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUM5QixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQXdCLENBQUM7UUFDdkUsU0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO0lBQ3pCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFSixvQkFBb0I7SUFDcEIsS0FBSyxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyx3QkFBd0IsRUFBRSxDQUFDLE1BQW9FLEtBQUssaUNBQWUsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUNqTCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyx3QkFBUSxDQUFDLFNBQVMsRUFBRSxDQUFDLFNBQW9CO1FBQzVELHNDQUFzQztRQUN0QyxpQ0FBZSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQTtJQUN2QyxDQUFDLENBQUMsQ0FBQztJQUNILE1BQU0sQ0FBQyxNQUFNLENBQUMsOEJBQThCLENBQUMsQ0FBQyxNQUFNO1FBQ2hELDJEQUEyRDtRQUMzRCxJQUFJLEdBQUcsR0FBRyxNQUFNLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDcEQsSUFBSSxLQUFLLEdBQUcsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDO1FBQzlDLGlDQUFlLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ25ELENBQUMsQ0FBQyxDQUFDO0lBQ0gsS0FBSyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsd0JBQVEsQ0FBQyxhQUFhLEVBQUUsTUFBTTtRQUNqRCwwQ0FBMEM7UUFDMUMsSUFBSSxVQUFVLEdBQXFELE1BQU0sQ0FBQztRQUMxRSxpQ0FBZSxDQUFDLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsVUFBVSxDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsVUFBVSxDQUFDLFNBQVMsRUFBRSxDQUFDLENBQUM7SUFDbkgsQ0FBQyxDQUFDLENBQUM7SUFFSCxrQkFBa0I7SUFDbEIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLGtCQUFrQixFQUFFO1FBQ2pGLGlCQUFpQixHQUFHLElBQUksQ0FBQztRQUN6QixNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLENBQUMsS0FBSztZQUNyRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1Qsd0RBQXdEO2dCQUN4RCxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDakIsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNKLEtBQUssQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyx5QkFBeUIsRUFBRTtRQUN4RixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1lBQ2hCLFNBQUcsQ0FBQyxJQUFJLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUN6QyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLHVCQUF1QixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JFLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLDBCQUEwQixFQUFFO1FBQ3pGLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUM7UUFDL0QsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDZCxPQUFPLEdBQUcsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ25ELENBQUM7UUFDRCxJQUFJLFlBQVksR0FBRztZQUNmLElBQUksRUFBRSxhQUFhO1lBQ25CLElBQUksRUFBRSxPQUFPO1lBQ2IsT0FBTyxFQUFFLFFBQVE7WUFDakIsT0FBTyxFQUFFLE9BQU87WUFDaEIsV0FBVyxFQUFFLElBQUk7U0FDcEIsQ0FBQTtRQUNELE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLG1CQUFtQixFQUFFLFlBQVksQ0FBQyxDQUFDLElBQUksQ0FBQztZQUNuRSxTQUFHLENBQUMsR0FBRyxDQUFDLG9DQUFvQyxFQUFFLHdCQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDakUsQ0FBQyxFQUFFLEdBQUc7WUFDRixTQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUMzQixDQUFDLENBQUMsQ0FBQztJQUNQLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDSixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsNEJBQTRCLEVBQUU7UUFDM0YsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDZixTQUFHLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDckQsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ25CLGFBQWEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxDQUFDO1lBQy9CLGFBQWEsQ0FBQyxJQUFJLEdBQUcsVUFBVSxDQUFDO1lBQ2hDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3pCLEtBQUssQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsZ0JBQWdCLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDaEgsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osU0FBRyxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQ3pDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ0osS0FBSyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLHNCQUFzQixFQUFFO1FBQ3JGLGlDQUFlLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQztRQUNsQyxpQ0FBZSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3RDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDSixLQUFLLENBQUMsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsc0JBQXNCLEVBQUU7UUFDckYsaUNBQWUsQ0FBQyxVQUFVLEdBQUcsS0FBSyxDQUFDO1FBQ25DLGlDQUFlLENBQUMsZUFBZSxFQUFFLENBQUM7SUFDdEMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNSLENBQUM7QUFFRCxnQkFBZ0IsaUJBQTBCO0lBQ3RDLEVBQUUsQ0FBQyxDQUFDLGVBQU0sQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDbkYsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUNoQixTQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7UUFDekMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osSUFBSSxTQUFTLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUN2SSxLQUFLLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLEVBQUUsaUJBQWlCLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFDM0ssQ0FBQztJQUNMLENBQUM7QUFDTCxDQUFDO0FBRUQseUJBQXlCLFFBQWdCO0lBQ3JDLElBQUksR0FBRyxHQUFHLEVBQUUsQ0FBQztJQUNiLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxHQUFHLEVBQUUsRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1FBQ3JDLEdBQUcsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0lBQ3BCLENBQUM7SUFDRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxHQUFHLFFBQVEsR0FBRyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUN0QyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNwQixDQUFDO0lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQztBQUNmLENBQUM7QUFFRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUE4REU7QUFFRSxnR0FBZ0c7QUFDaEcsc0NBQXNDO0FBQ3RDLHNDQUFzQztBQUN0QyxnQ0FBZ0M7QUFDaEMsTUFBTTtBQUNOLG9EQUFvRDtBQUVwRDs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7RUE2SEUifQ==