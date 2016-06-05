'use strict';
const fs = require('fs');
var ps = require('ps-node');
const path = require('path');
const vscode_languageclient_1 = require('vscode-languageclient');
const Timer_1 = require('./Timer');
const vscode = require('vscode');
const ExtensionState_1 = require('./ExtensionState');
const TextDocumentContentProvider_1 = require('./TextDocumentContentProvider');
let statusBarItem;
let statusBarProgress;
let ownContext;
let autoSaver;
let previewUri = vscode.Uri.parse('viper-preview://debug');
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    ownContext = context;
    console.log('Viper-IVE-Client is now active!');
    enableDebugging();
    startAutoSaver();
    startLanguageServer();
    initializeStatusBar();
    //registerTextDocumentProvider()
    //showSecondWindow()
}
exports.activate = activate;
let provider;
function registerTextDocumentProvider() {
    provider = new TextDocumentContentProvider_1.DebugContentProvider();
    let registration = vscode.workspace.registerTextDocumentContentProvider('viper-preview', provider);
}
function showSecondWindow() {
    provider.update(previewUri);
    //showSecondWindow();
    return vscode.commands.executeCommand('vscode.previewHtml', previewUri, vscode.ViewColumn.Two).then((success) => { }, (reason) => {
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
            }
            else {
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
    statusBarProgress = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    ownContext.subscriptions.push(statusBarItem);
    ownContext.subscriptions.push(statusBarProgress);
}
function startAutoSaver() {
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
        //only save silver files
        if (vscode.window.activeTextEditor != null && vscode.window.activeTextEditor.document.languageId == 'silver') {
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
    let serverOptions = {
        run: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc },
        debug: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc, options: debugOptions }
    };
    // Options to control the language client
    let clientOptions = {
        // Register the server for plain text documents
        documentSelector: ['silver'],
        synchronize: {
            // Synchronize the setting section 'iveServerSettings' to the server
            configurationSection: 'iveSettings',
            // Notify the server about file changes to '.sil files contain in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sil')
        }
    };
    ExtensionState_1.ExtensionState.client = new vscode_languageclient_1.LanguageClient('Language Server', serverOptions, clientOptions);
    // Create the language client and start the client.
    let disposable = ExtensionState_1.ExtensionState.client.start();
    if (!ExtensionState_1.ExtensionState.client || !disposable) {
        console.error("LanguageClient is undefined");
    }
    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    ownContext.subscriptions.push(disposable);
    ExtensionState_1.ExtensionState.client.onNotification({ method: "NailgunReady" }, () => {
        let window = vscode.window;
        statusBarItem.color = 'white';
        statusBarItem.text = "ready";
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "VerificationStart" }, () => {
        let window = vscode.window;
        statusBarItem.color = 'orange';
        statusBarItem.text = "pre-processing";
        statusBarProgress.text = progressBarText(0);
        statusBarProgress.show();
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "VerificationProgress" }, (progress) => {
        statusBarItem.color = 'orange';
        statusBarItem.text = "verifying: " + progress + "%";
        statusBarProgress.text = progressBarText(progress);
        statusBarProgress.show();
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "VerificationEnd" }, (success) => {
        let window = vscode.window;
        if (success) {
            statusBarItem.color = 'lightgreen';
            statusBarItem.text = `$(check) done`;
            window.showInformationMessage("Successfully Verified");
        }
        else {
            statusBarItem.color = 'red';
            statusBarItem.text = `$(x) failed`;
        }
        statusBarProgress.hide();
        //window.showInformationMessage("verification finished");
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "InvalidSettings" }, (data) => {
        let buttons = { title: "Open Settings" };
        vscode.window.showInformationMessage("Invalid settings: " + data, buttons).then((choice) => {
            if (choice.title === "Open Settings") {
                let settingsPath = path.join(vscode.workspace.rootPath, '.vscode', 'settings.json');
                showFile(settingsPath);
            }
        });
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "Hint" }, (data) => {
        vscode.window.showInformationMessage(data);
    });
}
function showFile(filePath) {
    let resource = vscode.Uri.file(filePath);
    vscode.workspace.openTextDocument(resource).then((doc) => {
        vscode.window.showTextDocument(doc, vscode.ViewColumn.Two);
    });
}
function progressBarText(progress) {
    let bar = "";
    for (var i = 0; i < progress / 10; i++) {
        bar = bar + "O";
    }
    for (var i = 10; i > progress / 10; i--) {
        bar = bar + "_";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFDOUksd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBRWhELDhDQUFtQywrQkFBK0IsQ0FBQyxDQUFBO0FBRW5FLElBQUksYUFBYSxDQUFDO0FBQ2xCLElBQUksaUJBQWlCLENBQUM7QUFDdEIsSUFBSSxVQUFVLENBQUM7QUFFZixJQUFJLFNBQWdCLENBQUM7QUFDckIsSUFBSSxVQUFVLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztBQUUzRCx5REFBeUQ7QUFDekQsMEVBQTBFO0FBQzFFLGtCQUF5QixPQUFnQztJQUNyRCxVQUFVLEdBQUcsT0FBTyxDQUFDO0lBQ3JCLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUNBQWlDLENBQUMsQ0FBQztJQUMvQyxlQUFlLEVBQUUsQ0FBQztJQUNsQixjQUFjLEVBQUUsQ0FBQztJQUNqQixtQkFBbUIsRUFBRSxDQUFDO0lBQ3RCLG1CQUFtQixFQUFFLENBQUM7SUFFdEIsZ0NBQWdDO0lBQ2hDLG9CQUFvQjtBQUN4QixDQUFDO0FBVmUsZ0JBQVEsV0FVdkIsQ0FBQTtBQUVELElBQUksUUFBUSxDQUFDO0FBRWI7SUFDSSxRQUFRLEdBQUcsSUFBSSxrREFBb0IsRUFBRSxDQUFDO0lBQ3RDLElBQUksWUFBWSxHQUFHLE1BQU0sQ0FB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