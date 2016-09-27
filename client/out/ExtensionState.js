'use strict';
const vscode_languageclient_1 = require('vscode-languageclient');
const fs = require('fs');
const path = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
class ExtensionState {
    static createExtensionState() {
        if (ExtensionState.instance) {
            return ExtensionState.instance;
        }
        else {
            let newState = new ExtensionState();
            ExtensionState.instance = newState;
            return newState;
        }
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
        this.client = new vscode_languageclient_1.LanguageClient('languageServer', 'Language Server', serverOptions, clientOptions);
        Log_1.Log.log("Start Language Server", ViperProtocol_1.LogLevel.Info);
        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();
        if (!this.client || !this.languageServerDisposable) {
            Log_1.Log.error("LanguageClient is undefined");
        }
    }
    dispose() {
        Log_1.Log.log("Ask language server to shut down.", ViperProtocol_1.LogLevel.Info);
        this.client.sendRequest(ViperProtocol_1.Commands.Dispose, (error) => {
            Log_1.Log.log("Language server has shut down, terminate the connection", ViperProtocol_1.LogLevel.Info);
            this.languageServerDisposable.dispose();
        });
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
ExtensionState.isDebugging = false;
ExtensionState.isWin = /^win/.test(process.platform);
ExtensionState.isLinux = /^linux/.test(process.platform);
ExtensionState.isMac = /^darwin/.test(process.platform);
exports.ExtensionState = ExtensionState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFFOUksTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsZ0NBQW9ELGlCQUFpQixDQUFDLENBQUE7QUFDdEUsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRzFCO0lBa0JJLE9BQU8sb0JBQW9CO1FBQ3ZCLEVBQUUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDO1FBQ25DLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksUUFBUSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDcEMsY0FBYyxDQUFDLFFBQVEsR0FBRyxRQUFRLENBQUM7WUFDbkMsTUFBTSxDQUFDLFFBQVEsQ0FBQztRQUNwQixDQUFDO0lBQ0wsQ0FBQztJQUVNLG1CQUFtQixDQUFDLE9BQWdDLEVBQUUsaUJBQTJDLEVBQUUsR0FBWTtRQUNsSCxJQUFJLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQztRQUN2QixvQ0FBb0M7UUFDcEMsSUFBSSxZQUFZLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUMsQ0FBQztRQUVqRixFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQy9CLFNBQUcsQ0FBQyxHQUFHLENBQUMsWUFBWSxHQUFHLDBDQUEwQyxFQUFFLHdCQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7WUFD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