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
exports.ExtensionState = ExtensionState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFFOUksTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsZ0NBQW1FLGlCQUFpQixDQUFDLENBQUE7QUFDckYsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRTFCO0lBQUE7UUFZVyxVQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdEMsWUFBTyxHQUFHLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLFVBQUssR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztJQTRGcEQsQ0FBQztJQTFGRyxPQUFPLG9CQUFvQjtRQUN2QixFQUFFLENBQUEsQ0FBQyxjQUFjLENBQUMsUUFBUSxDQUFDLENBQUEsQ0FBQztZQUN4QixNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsQ0FBQztRQUNuQyxDQUFDO1FBQUEsSUFBSSxDQUFBLENBQUM7WUFDRixJQUFJLFFBQVEsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1lBQ3BDLGNBQWMsQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxRQUFRLENBQUM7UUFDcEIsQ0FBQztJQUNMLENBQUM7SUFFTSxtQkFBbUIsQ0FBQyxPQUFnQyxFQUFFLGlCQUEyQyxFQUFFLEdBQVk7UUFDbEgsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsb0NBQW9DO1FBQ3BDLElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFD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