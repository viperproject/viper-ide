import * as vscode from 'vscode';
import { LogLevel } from './logger';

export namespace DebuggerSettings {
    function settings(): vscode.WorkspaceConfiguration {
         return vscode.workspace.getConfiguration("viperDebuggerSettings");
    }

    export function debugImmediately(): boolean {
         return settings().get<boolean>("debugImmediately")!;
    }

    export function alloySATSolver(): string {
        return settings().get<string>("alloySATSolver")!;
    }

    export function integerBitWidth(): number {
        return settings().get<number>('integerBitWidth')!;
    }

    export function instancesBaseCount(): number {
        return settings().get<number>('instancesBaseCount')!;
    }

    export function modelDestinationPath(): string {
        return settings().get<string>('modelDestinationPath')!;
    }

    export function logLevel(): LogLevel {
        let logLevelSetting = <keyof typeof LogLevel> settings().get("logLevel");
        if (logLevelSetting !== undefined) { 
            return LogLevel[logLevelSetting];
        } 
        return LogLevel.INFO;
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
