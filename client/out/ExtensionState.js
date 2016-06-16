'use strict';
const vscode_languageclient_1 = require('vscode-languageclient');
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const ViperProtocol_1 = require('./ViperProtocol');
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
                // Notify the server about file changes to .sil or .vpr files contain in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.sil, **/*.vpr')
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
        //let stopped = false;
        console.log("Ask language server to shut down.");
        this.client.sendRequest(ViperProtocol_1.Commands.Dispose, (error) => {
            console.log("Language server has shut down, terminate the connection");
            this.languageServerDisposable.dispose();
            //stopped = true;
        });
        /*let firstTime = true;
        while(!stopped){
            if(firstTime){
                console.log("waiting");
            }
        }
        console.log("done waiting");*/
    }
}
exports.ExtensionState = ExtensionState;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRXh0ZW5zaW9uU3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvRXh0ZW5zaW9uU3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBQ2Isd0NBQXNILHVCQUF1QixDQUFDLENBQUE7QUFDOUksTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFDekIsTUFBWSxJQUFJLFdBQU0sTUFBTSxDQUFDLENBQUE7QUFDN0IsZ0NBQXlDLGlCQUFpQixDQUFDLENBQUE7QUFFM0Q7SUFRVyxtQkFBbUIsQ0FBQyxPQUFnQyxFQUFDLEdBQVc7UUFDbkUsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsb0NBQW9DO1FBQ3BDLElBQUksWUFBWSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLFdBQVcsQ0FBQyxDQUFDLENBQUM7UUFFakYsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMvQixPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ2xELENBQUM7UUFDRCxtQ0FBbUM7UUFDbkMsSUFBSSxZQUFZLEdBQUcsRUFBRSxRQUFRLEVBQUUsQ0FBQyxVQUFVLEVBQUUsU0FBUyxHQUFDLENBQUMsR0FBRyxHQUFDLE1BQU0sR0FBQyxFQUFFLENBQUMsR0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1FBRWpGLDRFQUE0RTtRQUM1RSxxQ0FBcUM7UUFDckMsSUFBSSxhQUFhLEdBQWtCO1lBQy9CLEdBQUcsRUFBRSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLHFDQUFhLENBQUMsR0FBRyxFQUFFO1lBQzNELEtBQUssRUFBRSxFQUFFLE1BQU0sRUFBRSxZQUFZLEVBQUUsU0FBUyxFQUFFLHFDQUFhLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxZQUFZLEVBQUU7U0FDdkYsQ0FBQTtRQUVELHlDQUF5QztRQUN6QyxJQUFJLGFBQWEsR0FBMEI7WUFDdkMsK0NBQStDO1lBQy9DLGdCQUFnQixFQUFFLENBQUMsUUFBUSxDQUFDO1lBQzVCLFdBQVcsRUFBRTtnQkFDVCxvRUFBb0U7Z0JBQ3BFLG9CQUFvQixFQUFFLGFBQWE7Z0JBQ25DLHNGQUFzRjtnQkFDdEYsVUFBVSxFQUFFLE1BQU0sQ0FBQyxTQUFTLENBQUMsdUJBQXVCLENBQUMsb0JBQW9CLENBQUM7YUFDN0U7U0FDSixDQUFBO1FBRUQsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLHNDQUFjLENBQUMsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLGFBQWEsQ0FBQyxDQUFDO1FBRWxGLG1EQUFtRDtRQUNuRCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUVwRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQyxDQUFDO1lBQ2pELE9BQU8sQ0FBQyxLQUFLLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUNqRCxDQUFDO0lBRUwsQ0FBQztJQUVNLE9BQU87UUFDVixzQkFBc0I7UUFDdEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO1FBQ2pELElBQUksQ0FBQyxNQUFNLENBQUMsV0FBVyxDQUFDLHdCQUFRLENBQUMsT0FBTyxFQUFDLENBQUMsS0FBSztZQUMzQyxPQUFPLENBQUMsR0FBRyxDQUFDLHlEQUF5RCxDQUFDLENBQUM7WUFDdkUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3hDLGlCQUFpQjtRQUNyQixDQUFDLENBQUMsQ0FBQTtRQUNGOzs7Ozs7c0NBTThCO0lBQ2xDLENBQUM7QUFDTCxDQUFDO0FBakVZLHNCQUFjLGlCQWlFMUIsQ0FBQSJ9