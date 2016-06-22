'use strict';
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
let autoSaver;
let previewUri = vscode.Uri.parse('viper-preview://debug');
let state;
let isWin = /^win/.test(process.platform);
let enableSecondWindow = false;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    Log_1.Log.initialize(context);
    Log_1.Log.log('Viper-IVE-Client is now active!');
    state = new ExtensionState_1.ExtensionState();
    context.subscriptions.push(state);
    state.startLanguageServer(context, false); //break?
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
    Log_1.Log.log("deactivate");
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
    state.context.subscriptions.push(statusBarProgress);
    state.context.subscriptions.push(statusBarItem);
}
function startAutoSaver() {
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
        //only save silver files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'silver') {
            vscode.window.activeTextEditor.document.save();
            if (enableSecondWindow) {
                showSecondWindow();
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
                break;
            case ViperProtocol_1.VerificationState.VerificationRunning:
                statusBarItem.color = 'orange';
                if (!params.progress) {
                    statusBarItem.text = "pre-processing";
                    statusBarProgress.text = progressBarText(0);
                }
                else {
                    statusBarItem.text = "verifying: " + params.progress + "%";
                    statusBarProgress.text = progressBarText(params.progress);
                }
                statusBarProgress.show();
                break;
            case ViperProtocol_1.VerificationState.Ready:
                if (params.firstTime) {
                    statusBarItem.color = 'white';
                    statusBarItem.text = "ready";
                }
                else {
                    if (params.success) {
                        statusBarItem.color = 'lightgreen';
                        statusBarItem.text = `$(check) done`;
                        window.showInformationMessage("Successfully Verified");
                    }
                    else {
                        statusBarItem.color = 'red';
                        statusBarItem.text = `$(x) failed`;
                    }
                }
                statusBarProgress.hide();
                break;
            case ViperProtocol_1.VerificationState.Stopping:
                statusBarItem.color = 'orange';
                statusBarItem.text = "preparing";
                break;
            default:
                break;
        }
    });
    state.client.onNotification(ViperProtocol_1.Commands.InvalidSettings, (data) => {
        Log_1.Log.log("Invalid Settings detected");
        statusBarItem.color = 'red';
        statusBarItem.text = "Invalid Settings";
        let buttons = { title: "Open Settings" };
        vscode.window.showInformationMessage("Invalid settings: " + data, buttons).then((choice) => {
            if (!choice) {
            }
            else if (choice && choice.title === "Open Settings") {
                //TODO: also put link to user settings
                let workspaceSettingsPath = state.context.asAbsolutePath(path.join('.vscode', 'settings.json'));
                Log_1.Log.log("WorkspaceSettings: " + workspaceSettingsPath);
                showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
            }
        });
    });
    state.client.onNotification(ViperProtocol_1.Commands.Hint, (data) => {
        Log_1.Log.log("H: " + data);
        vscode.window.showInformationMessage(data);
    });
    state.client.onNotification(ViperProtocol_1.Commands.Log, (data) => {
        Log_1.Log.log("S: " + data);
    });
    state.client.onNotification(ViperProtocol_1.Commands.ToLogFile, (data) => {
        Log_1.Log.toLogFile("S: " + data);
    });
    state.client.onNotification(ViperProtocol_1.Commands.Error, (data) => {
        Log_1.Log.error("S: " + data);
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
    let verifyCommandDisposable = vscode.commands.registerCommand('extension.verify', () => {
        if (!state.client) {
            vscode.window.showInformationMessage("extension not ready yet.");
        }
        else {
            state.client.sendRequest(ViperProtocol_1.Commands.Verify, vscode.window.activeTextEditor.document.uri.toString());
        }
    });
    state.context.subscriptions.push(verifyCommandDisposable);
    let selectBackendCommandDisposable = vscode.commands.registerCommand('extension.selectBackend', () => {
        if (!state.client) {
            vscode.window.showInformationMessage("extension not ready yet.");
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
            Log_1.Log.log('Debug session started successfully');
        }, err => {
            Log_1.Log.log('Error: ' + err.message);
        });
    });
    state.context.subscriptions.push(startDebuggingCommandDisposable);
    let selectStopVerificationDisposable = vscode.commands.registerCommand('extension.stopVerification', () => {
        if (!state.client) {
            vscode.window.showInformationMessage("extension not ready yet.");
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
        vscode.window.showInformationMessage('file not found at: ' + path);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUFpRSxpQkFBaUIsQ0FBQyxDQUFBO0FBQ25GLHdCQUFnQixzQ0FBc0MsQ0FBQyxDQUFBO0FBQ3ZELHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQiw4Q0FBbUMsK0JBQStCLENBQUMsQ0FBQTtBQUVuRSxJQUFJLGFBQWEsQ0FBQztBQUNsQixJQUFJLGlCQUFpQixDQUFDO0FBQ3RCLElBQUksU0FBZ0IsQ0FBQztBQUNyQixJQUFJLFVBQVUsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQzNELElBQUksS0FBcUIsQ0FBQztBQUUxQixJQUFJLEtBQUssR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUUxQyxJQUFJLGtCQUFrQixHQUFZLEtBQUssQ0FBQztBQUV4Qyx5REFBeUQ7QUFDekQsMEVBQTBFO0FBQzFFLGtCQUF5QixPQUFnQztJQUNyRCxTQUFHLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3hCLFNBQUcsQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUMzQyxLQUFLLEdBQUcsSUFBSSwrQkFBYyxFQUFFLENBQUM7SUFDN0IsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsS0FBSyxD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QUNyQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztJQUNwQixDQUFDO0lBQ0QsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsR0FBRyxRQUFRLEdBQUcsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdEMsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7SUFDcEIsQ0FBQztJQUNELE1BQU0sQ0FBQyxHQUFHLENBQUM7QUFDZixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBOERFO0FBRUUsZ0dBQWdHO0FBQ2hHLHNDQUFzQztBQUN0QyxzQ0FBc0M7QUFDdEMsZ0NBQWdDO0FBQ2hDLE1BQU07QUFDTixvREFBb0Q7QUFFcEQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0VBNkhFIn0=