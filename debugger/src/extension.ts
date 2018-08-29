import * as vscode from 'vscode';
import { Logger } from './logger';
import { Debugger } from './Debugger';
import { DebuggerCommand } from './Commands';
import { DebuggerSettings } from './DebuggerSettings';


/** The API exported by the "main" Viper extension.
 *  
 *  It allows listening for verification events.
 */
export var viperApi: any;
let extensionContext: vscode.ExtensionContext;


export function getAbsolutePath(relativePath: string) {
    return extensionContext.asAbsolutePath(relativePath);
}


/** Called by VS Code when loading the extension. */
export function activate(context: vscode.ExtensionContext) {
    if (DebuggerSettings.logLevel) {
        Logger.setLogLevel(DebuggerSettings.logLevel);
    }

    Logger.debug('Viper Debugger extension starting');
    extensionContext = context;

    // Retrieve the Viper API so we can listen on verification eventes
    let viper = vscode.extensions.getExtension('viper-admin.viper-experimental');
    if (viper && viper.isActive) {
        viperApi = viper.exports;
    } else {
        Logger.error("Could not retrieve the Viper API when starting the debugger extension!");
        vscode.window.showErrorMessage("Itternal debugger error, terminating. See log for details");
        deactivate();
    }

    // Setup handlers for the commands that the debugger exports
    setupCommandHandlers(context);

    // While deveoping start the debugger immediately
    if (DebuggerSettings.debugImmediately()) {
        vscode.commands.executeCommand(DebuggerCommand.StartDebugger);
    }
    Logger.debug('Viper Debugger extension started');
}


/** Called by VS Code when unloading the extension. */
export function deactivate() {
    Debugger.stop();
    Logger.debug("Viper Debugger extension being deactivated");
}


/** Sets up the handlers for the commands provided by the debugger. */
function setupCommandHandlers(context: vscode.ExtensionContext) {
    // Helper for registering commands
    let on = (command: string, handler: (c: string) => void) => {
        const disposable = vscode.commands.registerCommand(command, () => handler(command));
        context.subscriptions.push(disposable);
    };

    on(DebuggerCommand.StartDebugger, (_) => {
        const activeEditor = vscode.window.activeTextEditor!;

        Debugger.start(context, activeEditor);

        // Make sure the editor active previously remains focused
        if (activeEditor.viewColumn) {
            vscode.window.showTextDocument(activeEditor.document, activeEditor.viewColumn);
        }
    });
    on(DebuggerCommand.StopDebugger,  (_) => Debugger.stop());
    on(DebuggerCommand.NextState, (s) => Debugger.goToState(s));
    on(DebuggerCommand.PrevState, (s) => Debugger.goToState(s));
    on(DebuggerCommand.ChildState, (s) => Debugger.goToState(s));
    on(DebuggerCommand.ParentState, (s) => Debugger.goToState(s));
}