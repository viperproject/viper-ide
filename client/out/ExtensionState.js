'use strict';
const vscode_languageclient_1 = require('vscode-languageclient');
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
class ExtensionState {
    startLanguageServer(context, brk) {
        this.context = context;
        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(path.join('server', 'server.js'));
        if (!fs.existsSync(serverModule)) {
            Log_1.Log.log(serverModule + " does not exist");
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
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr')
            }
        };
        this.client = new vscode_languageclient_1.LanguageClient('Language Server', serverOptions, clientOptions);
        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();
        if (!this.client || !this.languageServerDisposable) {
            Log_1.Log.error("LanguageClient is undefined");
        }
    }
    dispose() {
        //let stopped = false;
        Log_1.Log.log("Ask language server to shut down.");
        this.client.sendRequest(ViperProtocol_1.Commands.Dispose, (error) => {
            Log_1.Log.log("Language server has shut down, terminate the connection");
            this.languageServerDisposable.dispose();
            //stopped = true;
        });
        /*let firstTime = true;
        while(!stopped){
            if(firstTime){
                Log.log("waiting");
            }
        }
        Log.log("done waiting");*/
    }
}
exports.ExtensionState = ExtensionState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFDOUksTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsZ0NBQTBDLGlCQUFpQixDQUFDLENBQUE7QUFDNUQsc0JBQWtCLE9BQU8sQ0FBQyxDQUFBO0FBRTFCO0lBUVcsbUJBQW1CLENBQUMsT0FBZ0MsRUFBRSxHQUFZO1FBQ3JFLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLG9DQUFvQztRQUNwQyxJQUFJLFlBQVksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxXQUFXLENBQUMsQ0FBQyxDQUFDO1FBRWpGLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDL0IsU0FBRyxDQUFDLEdBQUcsQ0FBQyxZQUFZLEdBQUcsaUJBQWlCLENBQUMsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsbUNBQW1DO1FBQ25DLElBQUksWUFBWSxHQUFHLEVBQUUsUUFBUSxFQUFFLENBQUMsVUFBVSxFQUFFLFNBQVMsR0FBRyxDQUFDLEdBQUcsR0FBRyxNQUFNLEdBQUcsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLEVBQUUsQ0FBQztRQUV6Riw0RUFBNEU7UUFDNUUscUNBQXFDO1FBQ3JDLElBQUksYUFBYSxHQUFrQjtZQUMvQixHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxxQ0FBYSxDQUFDLEdBQUcsRUFBRTtZQUMzRCxLQUFLLEVBQUUsRUFBRSxNQUFNLEVBQUUsWUFBWSxFQUFFLFNBQVMsRUFBRSxxQ0FBYSxDQUFDLEdBQUcsRUFBRSxPQUFPLEVBQUUsWUFBWSxFQUFFO1NBQ3ZGLENBQUE7UUFFRCx5Q0FBeUM7UUFDekMsSUFBSSxhQUFhLEdBQTBCO1lBQ3ZDLCtDQUErQztZQUMvQyxnQkFBZ0IsRUFBRSxDQUFDLE9BQU8sQ0FBQztZQUMzQixXQUFXLEVBQUU7Z0JBQ1QsZ0VBQWdFO2dCQUNoRSxvQkFBb0IsRUFBRSxlQUFlO2dCQUNyQyxzRkFBc0Y7Z0JBQ3RGLFVBQVUsRUFBRSxNQUFNLENBQUMsU0FBUyxDQUFDLHVCQUF1QixDQUFDLG9CQUFvQixDQUFDO2FBQzdFO1NBQ0osQ0FBQTtRQUVELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxzQ0FBYyxDQUFDLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUVsRixtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFcEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztZQUNqRCxTQUFHLENBQUMsS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDN0MsQ0FBQztJQUNMLENBQUM7SUFFTSxPQUFPO1FBQ1Ysc0JBQXNCO1FBQ3RCLFNBQUcsQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUM3QyxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUs7WUFDNUMsU0FBRyxDQUFDLEdBQUcsQ0FBQyx5REFBeUQsQ0FBQyxDQUFDO1lBQ25FLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN4QyxpQkFBaUI7UUFDckIsQ0FBQyxDQUFDLENBQUE7UUFDRjs7Ozs7O2tDQU0wQjtJQUM5QixDQUFDO0FBQ0wsQ0FBQztBQWhFWSxzQkFBYyxpQkFnRTFCLENBQUEifQ==