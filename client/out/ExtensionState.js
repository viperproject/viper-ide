'use strict';
const vscode_languageclient_1 = require('vscode-languageclient');
const fs = require('fs');
const path = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
class ExtensionState {
    constructor() {
        this.isWin = /^win/.test(process.platform);
        this.isLinux = /^linux/.test(process.platform);
        this.isMac = /^darwin/.test(process.platform);
    }
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
    checkOperatingSystem() {
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
    userSettingsPath() {
        if (this.isWin) {
            let appdata = process.env.APPDATA;
            return path.join(appdata, "Code", "User", "settings.json");
        }
        else {
            let home = process.env.HOME;
            if (this.isLinux) {
                return path.join(home, ".config", "Code", "User", "settings.json");
            }
            else if (this.isMac) {
                return path.join(home, "Library", "Application Support", "Code", "User", "settings.json");
            }
            else {
                Log_1.Log.error("unknown Operating System: " + process.platform);
            }
        }
    }
}
ExtensionState.isDebugging = false;
exports.ExtensionState = ExtensionState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFFOUksTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsZ0NBQW9ELGlCQUFpQixDQUFDLENBQUE7QUFDdEUsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRzFCO0lBQUE7UUFjVyxVQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdEMsWUFBTyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLFVBQUssR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQTZGcEQsQ0FBQztJQTNGRyxPQUFPLG9CQUFvQjtRQUN2QixFQUFFLENBQUMsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMxQixNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztRQUNuQyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixJQUFJLFFBQVEsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BDLGNBQWMsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDcEIsQ0FBQztJQUNMLENBQUM7SUFFTSxtQkFBbUIsQ0FBQyxPQUFnQyxFQUFFLGlCQUEyQyxFQUFFLEdBQVk7UUFDbEgsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsb0NBQW9DO1FBQ3BDLElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFD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