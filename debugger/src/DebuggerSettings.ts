import * as vscode from 'vscode';
import { LogLevel, Logger } from './logger';

export namespace DebuggerSettings {
    const settings = vscode.workspace.getConfiguration("viperDebuggerSettings");

    export var logLevel: LogLevel = LogLevel.INFO;
    export const debugImmediately = settings.get<boolean>("debugImmediately") ? true : false;
    export const alloySATSolver: string = settings.get<string>("alloySATSolver") || 'minisat(jni)';

    let logLevelSetting = <keyof typeof LogLevel> settings.get("logLevel");
    if (logLevelSetting !== undefined) { 
        logLevel = LogLevel[logLevelSetting];
    } else {
        Logger.warn("Could not read logLevel from settings");
    }
    
    export function getValidColor(key: string) {
        let highlightingSettings = vscode.workspace.getConfiguration("viperDebuggerSettings.highlighting");
        let colorString = (<string> highlightingSettings.get(key)).trim();

        let valid = colorString.match(/^#[a-fA-F\d]{6}$/) ||
                    colorString.match(/^#[a-fA-F\d]{3}$/) ||
                    colorString.match(/^rgb\(\s*\d,\s*\d,\s*\d\s*\)$/);

        if (valid) {
            return colorString;
        } else {
            let message = `Invalid color value for '${key}' setting, falling back to default value.`;
            vscode.window.showErrorMessage(message, "Open User Settings")
                         .then((item) => {
                             if (item) {
                                vscode.commands.executeCommand("workbench.action.openGlobalSettings");
                             }
                         });
            let inspection = highlightingSettings.inspect(key);
            return inspection!.defaultValue;
        }
    }
}
