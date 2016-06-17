'use strict';
var ps = require('ps-node');
const path = require('path');
const Timer_1 = require('./Timer');
const vscode = require('vscode');
const ExtensionState_1 = require('./ExtensionState');
const ViperProtocol_1 = require('./ViperProtocol');
const TextDocumentContentProvider_1 = require('./TextDocumentContentProvider');
let statusBarItem;
let statusBarProgress;
let autoSaver;
let previewUri = vscode.Uri.parse('viper-preview://debug');
let state;
let enableSecondWindow = false;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    console.log('Viper-IVE-Client is now active!');
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
    console.log("deactivate");
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
        let buttons = { title: "Open Settings" };
        vscode.window.showInformationMessage("Invalid settings: " + data, buttons).then((choice) => {
            if (choice.title === "Open Settings") {
                let workspaceSettingsPath = path.join(vscode.workspace.rootPath, '.vscode', 'settings.json');
                showFile(workspaceSettingsPath, vscode.ViewColumn.Two);
                let userSettingsPath = state.context.asAbsolutePath(path.join('.vscode', 'settings.json'));
                showFile(userSettingsPath, vscode.ViewColumn.Three);
            }
        });
    });
    state.client.onNotification(ViperProtocol_1.Commands.Hint, (data) => {
        console.log("H: " + data);
        vscode.window.showInformationMessage(data);
    });
    state.client.onRequest(ViperProtocol_1.Commands.UriToPath, (uri) => {
        let uriObject = vscode.Uri.parse(uri);
        let platformIndependentPath = uriObject.fsPath;
        return platformIndependentPath;
    });
    state.client.onRequest(ViperProtocol_1.Commands.PathToUri, (path) => {
        let uriObject = vscode.Uri.parse(path);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0Isd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBQ2hELGdDQUFpRSxpQkFBaUIsQ0FBQyxDQUFBO0FBRW5GLDhDQUFtQywrQkFBK0IsQ0FBQyxDQUFBO0FBRW5FLElBQUksYUFBYSxDQUFDO0FBQ2xCLElBQUksaUJBQWlCLENBQUM7QUFDdEIsSUFBSSxTQUFnQixDQUFDO0FBQ3JCLElBQUksVUFBVSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFDM0QsSUFBSSxLQUFxQixDQUFDO0FBRTFCLElBQUksa0JBQWtCLEdBQVksS0FBSyxDQUFDO0FBRXhDLHlEQUF5RDtBQUN6RCwwRUFBMEU7QUFDMUUsa0JBQXlCLE9BQWdDO0lBQ3JELE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUMvQyxLQUFLLEdBQUcsSUFBSSwrQkFBYyxFQUFFLENBQUM7SUFDN0IsT0FBTyxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDbEMsS0FBSyxDQUFDLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLFFBQVE7SUFDbkQsY0FBYyxFQUFFLENBQUM7SUFDakIsZ0JBQWdCLEVBQUUsQ0FBQztJQUNuQixtQkFBbUIsRUFBRSxDQUFDO0lBRXRCLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQztRQUNy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