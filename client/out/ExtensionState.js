'use strict';
const vscode_languageclient_1 = require('vscode-languageclient');
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
class ExtensionState {
    startLanguageServer(context, brk) {
        this.context = context;
        // The server is implemented in node
        let serverModule = this.context.asAbsolutePath(path.join('server', 'server.js'));
        if (!fs.existsSync(serverModule)) {
            console.log(serverModule + " does not exist");
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
            documentSelector: ['silver'],
            synchronize: {
                // Synchronize the setting section 'iveServerSettings' to the server
                configurationSection: 'iveSettings',
                // Notify the server about file changes to '.sil files contain in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sil')
            }
        };
        this.client = new vscode_languageclient_1.LanguageClient('Language Server', serverOptions, clientOptions);
        // Create the language client and start the client.
        this.languageServerDisposable = this.client.start();
        if (!this.client || !this.languageServerDisposable) {
            console.error("LanguageClient is undefined");
        }
    }
    dispose() {
        let stopped = false;
        console.log("Ask language server to shut down.");
        this.client.sendRequest({ method: "Dispose" }, (error) => {
            console.log("Language server has shut down, terminate the connection");
            this.languageServerDisposable.dispose();
            stopped = true;
        });
        let firstTime = true;
        while (!stopped) {
            if (firstTime) {
                console.log("waiting");
            }
        }
        console.log("done waiting");
    }
}
exports.ExtensionState = ExtensionState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFDOUksTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFFN0I7SUFNVyxtQkFBbUIsQ0FBQyxPQUFnQyxFQUFDLEdBQVc7UUFDbkUsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsb0NBQW9DO1FBQ3BDLElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFakYsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvQixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFDRCxtQ0FBbUM7UUFDbkMsSUFBSSxZQUFZLEdBQUcsRUFBRSxRQUFRLEVBQUUsQ0FBQyxVQUFVLEVBQUUsU0FBUyxHQUFDLENBQUMsR0FBRyxHQUFDLE1BQU0sR0FBQyxFQUFFLENBQUMsR0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBRWpGLDRFQUE0RTtRQUM1RSxxQ0FBcUM7UUFDckMsSUFBSSxhQUFhLEdBQWtCO1lBQy9CLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLHFDQUFhLENBQUMsR0FBRyxFQUFFO1lBQzNELEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLHFDQUFhLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUU7U0FDdkYsQ0FBQTtRQUVELHlDQUF5QztRQUN6QyxJQUFJLGFBQWEsR0FBMEI7WUFDdkMsK0NBQStDO1lBQy9DLGdCQUFnQixFQUFFLENBQUMsUUFBUSxDQUFDO1lBQzVCLFdBQVcsRUFBRTtnQkFDVCxvRUFBb0U7Z0JBQ3BFLG9CQUFvQixFQUFFLGFBQWE7Z0JBQ25DLCtFQUErRTtnQkFDL0UsVUFBVSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsVUFBVSxDQUFDO2FBQ25FO1NBQ0osQ0FBQTtRQUVELElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxzQ0FBYyxDQUFDLGlCQUFpQixFQUFFLGFBQWEsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUVsRixtREFBbUQ7UUFDbkQsSUFBSSxDQUFDLHdCQUF3QixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLENBQUM7UUFFcEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQztZQUNqRCxPQUFPLENBQUMsS0FBSyxDQUFDLDZCQUE2QixDQUFDLENBQUM7UUFDakQsQ0FBQztJQUVMLENBQUM7SUFFTSxPQUFPO1FBQ1YsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLENBQUMsQ0FBQztRQUNqRCxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxFQUFDLE1BQU0sRUFBQyxTQUFTLEVBQUMsRUFBQyxDQUFDLEtBQUs7WUFDN0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyx5REFBeUQsQ0FBQyxDQUFDO1lBQ3ZFLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN4QyxPQUFPLEdBQUcsSUFBSSxDQUFDO1FBQ25CLENBQUMsQ0FBQyxDQUFBO1FBQ0YsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO1FBQ3JCLE9BQU0sQ0FBQyxPQUFPLEVBQUMsQ0FBQztZQUNaLEVBQUUsQ0FBQSxDQUFDLFNBQVMsQ0FBQyxDQUFBLENBQUM7Z0JBQ1YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUMzQixDQUFDO1FBQ0wsQ0FBQztRQUNELE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDaEMsQ0FBQztBQUNMLENBQUM7QUEvRFksc0JBQWMsaUJBK0QxQixDQUFBIn0=