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
    ownContext.subscriptions.push(statusBarItem);
}
function startAutoSaver() {
    let autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(() => {
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
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "VerificationProgress" }, (progress) => {
        statusBarItem.color = 'orange';
        statusBarItem.text = "verifying: " + progress + "%";
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
        //window.showInformationMessage("verification finished");
    });
    ExtensionState_1.ExtensionState.client.onNotification({ method: "InvalidSettings" }, (data) => {
        let buttons = { title: "Open Settings" };
        vscode.window.showInformationMessage("Invalid settings: " + data, buttons).then((choice) => {
            if (choice.title === "Open Settings") {
                let settingsPath = ownContext.asAbsolutePath(path.join('.vscode', 'settings.json'));
                //TODO: create TextDocument from path
                let settingsDocument;
                vscode.window.showTextDocument(settingsDocument);
            }
        });
    });
    5;
    ExtensionState_1.ExtensionState.client.onNotification({ method: "Hint" }, (data) => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2V4dGVuc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFNYixNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixJQUFJLEVBQUUsR0FBRyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDNUIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFDOUksd0JBQW9CLFNBQVMsQ0FBQyxDQUFBO0FBQzlCLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGlDQUE2QixrQkFBa0IsQ0FBQyxDQUFBO0FBRWhELDhDQUFtQywrQkFBK0IsQ0FBQyxDQUFBO0FBRW5FLElBQUksYUFBYSxDQUFDO0FBQ2xCLElBQUksVUFBVSxDQUFDO0FBRWYsSUFBSSxTQUFnQixDQUFDO0FBQ3JCLElBQUksVUFBVSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7QUFFM0QseURBQXlEO0FBQ3pELDBFQUEwRTtBQUMxRSxrQkFBeUIsT0FBZ0M7SUFDckQsVUFBVSxHQUFHLE9BQU8sQ0FBQztJQUNyQixPQUFPLENBQUMsR0FBRyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7SUFDL0MsZUFBZSxFQUFFLENBQUM7SUFDbEIsY0FBYyxFQUFFLENBQUM7SUFDakIsbUJBQW1CLEVBQUUsQ0FBQztJQUN0QixtQkFBbUIsRUFBRSxDQUFDO0lBRXRCLGdDQUFnQztJQUNoQyxvQkFBb0I7QUFDeEIsQ0FBQztBQVZlLGdCQUFRLFdBVXZCLENBQUE7QUFFRCxJQUFJLFFBQVEsQ0FBQztBQUViO0lBQ0ksUUFBUSxHQUFHLElBQUksa0RBQW9CLEVBQUUsQ0FBQztJQUN0QyxJQUFJLFlBQVksR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxDQUFD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