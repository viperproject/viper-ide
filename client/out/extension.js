'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
var vscode = require('vscode');
var fs = require('fs');
//import child_process = require('child_process');
var path = require('path');
var vscode_1 = require('vscode');
var vscode_languageclient_1 = require('vscode-languageclient');
var Timer_1 = require('./Timer');
var statusBarItem;
var server;
var autoSaver;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
    console.log('Viper-IVE-Client is now active!');
    //colorFileGutter('red');
    //create statusbar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBarItem.color = 'white';
    statusBarItem.text = "ready";
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    var autoSaveTimeout = 1000; //ms
    autoSaver = new Timer_1.Timer(function () {
        if (vscode.window.activeTextEditor != null) {
            vscode.window.activeTextEditor.document.save();
        }
    }, autoSaveTimeout);
    context.subscriptions.push(autoSaver);
    // The server is implemented in node
    var serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
    if (!fs.existsSync(serverModule)) {
        console.log(serverModule + " does not exist");
    }
    // The debug options for the server
    var debugOptions = { execArgv: ["--nolazy", "--debug=5555"] };
    // If the extension is launch in debug mode the debug server options are use
    // Otherwise the run options are used
    var serverOptions = {
        run: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc },
        debug: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc, options: debugOptions }
    };
    // Options to control the language client
    var clientOptions = {
        // Register the server for plain text documents
        documentSelector: ['silver'],
        synchronize: {
            // Synchronize the setting section 'iveServerSettings' to the server
            configurationSection: 'iveSettings',
            // Notify the server about file changes to '.clientrc files contain in the workspace
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };
    server = new vscode_languageclient_1.LanguageClient('Language Server', serverOptions, clientOptions);
    // Create the language client and start the client.
    var disposable = server.start();
    // Push the disposable to the context's subscriptions so that the 
    // client can be deactivated on extension deactivation
    context.subscriptions.push(disposable);
    server.onNotification({ method: "VerificationStart" }, function () {
        var window = vscode.window;
        statusBarItem.color = 'orange';
        statusBarItem.text = "pre-processing";
        //window.showInformationMessage("verification running");
    });
    server.onNotification({ method: "VerificationProgress" }, function (progress) {
        statusBarItem.color = 'orange';
        statusBarItem.text = "verifying: " + progress + "%";
    });
    server.onNotification({ method: "VerificationEnd" }, function (success) {
        var window = vscode.window;
        if (success) {
            statusBarItem.color = 'lightgreen';
            statusBarItem.text = "$(check) done";
            window.showInformationMessage("Successfully Verified");
        }
        else {
            statusBarItem.color = 'red';
            statusBarItem.text = "$(x) failed";
        }
        //window.showInformationMessage("verification finished");
    });
    server.onNotification({ method: "InvalidSettings" }, function (data) {
        vscode.window.showInformationMessage("Invalid settings: " + data);
    });
    server.onNotification({ method: "Hint" }, function (data) {
        vscode.window.showInformationMessage(data);
    });
    function colorFileGutter(color) {
        var window = vscode.window;
        var editor = window.activeTextEditor;
        var range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(editor.document.lineCount, Number.MAX_VALUE));
        colorGutter(color, range);
    }
    function colorGutter(color, range) {
        var window = vscode.window;
        var editor = window.activeTextEditor;
        var ranges = [];
        ranges.push(range);
        var bookmarkDecorationType = vscode.window.createTextEditorDecorationType({
            overviewRulerColor: color
        });
        editor.setDecorations(bookmarkDecorationType, ranges);
    }
    function resetAutoSaver() {
        autoSaver.reset();
    }
    var onActiveTextEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(resetAutoSaver);
    var onTextEditorSelectionChange = vscode.window.onDidChangeTextEditorSelection(resetAutoSaver);
    context.subscriptions.push(onActiveTextEditorChangeDisposable);
    context.subscriptions.push(onTextEditorSelectionChange);
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
}
exports.activate = activate;
function removeDecorations() {
    var window = vscode.window;
    var editor = window.activeTextEditor;
    var selection = editor.selection;
    var ranges = [];
    var start = new vscode.Position(0, 0);
    var end = new vscode.Position(editor.document.lineCount - 1, Number.MAX_VALUE);
    console.log('Remove decoration on: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".");
    ranges.push(new vscode.Range(start, end));
    var decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(30,30,30,1)'
    }); //TODO: get color from theme
    editor.setDecorations(decorationRenderType, ranges);
}
function markError(start, end, message) {
    console.log('Mark error: ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".");
    var window = vscode.window;
    var editor = window.activeTextEditor;
    var range = new vscode.Range(start, end);
    var diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
}
function decorate(start, end) {
    console.log('Decorate ' + start.line + ':' + start.character + ' to ' + end.line + ':' + end.character + ".");
    var window = vscode.window;
    var editor = window.activeTextEditor;
    var ranges = [];
    ranges.push(new vscode.Range(start, end));
    var decorationRenderType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'red'
    });
    editor.setDecorations(decorationRenderType, ranges);
}
function doesFileExist(path) {
    if (!fs.existsSync(path)) {
        vscode.window.showInformationMessage('file not found at: ' + path);
        return false;
    }
    return true;
}
//# sourceMappingURL=extension.js.map