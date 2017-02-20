'use strict';
const vscode_languageclient_1 = require('vscode-languageclient');
const fs = require('fs');
const path = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
const ViperFileState_1 = require('./ViperFileState');
const Helper_1 = require('./Helper');
class State {
    static createState() {
        if (State.instance) {
            return State.instance;
        }
        else {
            this.reset();
            let newState = new State();
            State.instance = newState;
            return newState;
        }
    }
    static setLastActiveFile(uri, editor) {
        this.lastActiveFileUri = uri.toString();
        let lastActiveFile = this.getFileState(uri);
        if (lastActiveFile) {
            lastActiveFile.setEditor(editor);
        }
        return lastActiveFile;
    }
    static getLastActiveFile() {
        return this.getFileState(this.lastActiveFileUri);
    }
    static resetViperFiles() {
        Log_1.Log.log("Reset all viper files", ViperProtocol_1.LogLevel.Info);
        this.viperFiles.forEach(element => {
            element.changed = true;
            element.verified = false;
            element.verifying = false;
            element.decorationsShown = false;
            element.stateVisualizer.completeReset();
        });
    }
    static reset() {
        this.isBackendReady = false;
        this.isDebugging = false;
        this.isVerifying = false;
        this.viperFiles = new Map();
    }
    static checkBackendReady(prefix) {
        if (!this.isBackendReady) {
            Log_1.Log.log(prefix + "Backend is not ready.", ViperProtocol_1.LogLevel.Debug);
        }
        return this.isBackendReady;
    }
    static getVisualizer(uri) {
        let fileState = this.getFileState(uri);
        return fileState ? fileState.stateVisualizer : null;
    }
    ///retrieves the requested file, creating it when needed
    static getFileState(uri) {
        if (!uri)
            return null;
        let uriObject = Helper_1.Helper.uriToObject(uri);
        let uriString = Helper_1.Helper.uriToString(uri);
        if (!Helper_1.Helper.isViperSourceFile(uriString)) {
            return null;
        }
        let result;
        if (!State.viperFiles.has(uriString)) {
            result = new ViperFileState_1.ViperFileState(uriObject);
            State.viperFiles.set(uriString, result);
        }
        else {
            result = State.viperFiles.get(uriString);
        }
        return result;
    }
    startLanguageServer(context, fileSystemWatcher, brk) {
        this.context = context;
        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(path.join('server', 'server.js'));
        if (!fs.existsSync(serverModule)) {
            Log_1.Log.log(serverModule + " does not exist. Reinstall the Extension", ViperProtocol_1.LogLevel.Debug);
            return;
        }
        // The debug options for the server
        let debugOptions = { execArgv: ["--nolazy", "--debug" + (brk ? "-brk" : "") + "=5556"] };
        // If the extension is launch in debug mode the debug server options are use
        // Otherwise the run options are used
        let serverOptions = {
            run: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc },
            debug: { module: serverModule, transport: vscode_languageclient_1.TransportKind.ipc, options: debugOptions }
        };
        // Options to control the language client
        let clientOptions = {
            // Register the server for plain text documents
            documentSelector: ['viper'],
            synchronize: {
                // Synchronize the setting section 'viperSettings' to the server
                configurationSection: 'viperSettings',
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: fileSystemWatcher
            }
        };
        this.client = new vscode_languageclient_1.LanguageClient('languageServer', 'Language Server', serverOptions, clientOptions, brk);
        Log_1.Log.log("Start Language Server", ViperProtocol_1.LogLevel.Info);
        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();
        if (!this.client || !this.languageServerDisposable) {
            Log_1.Log.error("LanguageClient is undefined");
        }
    }
    dispose() {
        try {
            return new Promise((resolve, reject) => {
                Log_1.Log.log("Ask language server to shut down.", ViperProtocol_1.LogLevel.Info);
                this.client.sendRequest(ViperProtocol_1.Commands.Dispose, null).then(() => {
                    Log_1.Log.log("Language server has shut down, terminate the connection", ViperProtocol_1.LogLevel.Info);
                    this.languageServerDisposable.dispose();
                    resolve();
                });
            });
        }
        catch (e) {
            Log_1.Log.log("Error disposing state: " + e);
        }
    }
    static checkOperatingSystem() {
        if ((this.isWin ? 1 : 0) + (this.isMac ? 1 : 0) + (this.isLinux ? 1 : 0) != 1) {
            Log_1.Log.error("Cannot detect OS");
            return;
        }
        if (this.isWin) {
            Log_1.Log.log("OS: Windows", ViperProtocol_1.LogLevel.Debug);
        }
        else if (this.isMac) {
            Log_1.Log.log("OS: OsX", ViperProtocol_1.LogLevel.Debug);
        }
        else if (this.isLinux) {
            Log_1.Log.log("OS: Linux", ViperProtocol_1.LogLevel.Debug);
        }
    }
}
State.isWin = /^win/.test(process.platform);
State.isLinux = /^linux/.test(process.platform);
State.isMac = /^darwin/.test(process.platform);
exports.State = State;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQW9GLHVCQUF1QixDQUFDLENBQUE7QUFFNUcsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsZ0NBQW1DLGlCQUFpQixDQUFDLENBQUE7QUFDckQsc0JBQW9CLE9BQU8sQ0FBQyxDQUFBO0FBQzVCLGlDQUErQixrQkFBa0IsQ0FBQyxDQUFBO0FBRWxELHlCQUF1QixVQUFVLENBQUMsQ0FBQTtBQUdsQztJQWVJLE9BQWMsV0FBVztRQUNyQixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUNqQixNQUFNLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQztRQUMxQixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDYixJQUFJLFFBQVEsR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQzNCLEtBQUssQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDcEIsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFjLGlCQUFpQixDQUFDLEdBQThCLEVBQUUsTUFBeUI7UUFDckYsSUFBSSxDQUFDLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUN4QyxJQUFJLGNBQWMsR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQzVDLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxDQUFDLENBQUM7WUFDakIsY0FBYyxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyQyxDQUFDO1FBQ0QsTUFBTSxDQUFDLGNB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