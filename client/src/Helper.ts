/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2023 ETH Zurich.
  */

import * as vscode from 'vscode';
import * as fs from 'fs';
import globToRexep from 'glob-to-regexp';
import * as path from 'path';
import * as os from 'os';
import { Log } from './Log';
import { Common, LogLevel } from './ViperProtocol';
import { ProjectManager, ProjectRoot } from './ProjectManager';

export class Helper {
    public static viperFileEndings: string[];

    public static loadViperFileExtensions(): void {
        this.viperFileEndings = ["*.vpr", "*.sil"];
        const fileAssociations = vscode.workspace.getConfiguration("files").get("associations", []);
        for (const pattern in fileAssociations) {
            const language = fileAssociations[pattern];
            if (language === 'viper') {
                Log.log("Additional file associations detected: " + language + " -> " + pattern, LogLevel.Debug);
                this.viperFileEndings.push(pattern);
            }
        }
    }

    public static isViperSourceFile(uri: string | vscode.Uri): boolean {
        if (!uri) return false;
        const uriString = Common.uriToString(uri);
        return this.viperFileEndings.some(globPattern => {
            const regex = globToRexep(globPattern);
            return regex.test(uriString);
        });
    }

    ///might be null
    public static getActiveFileUri(): [vscode.Uri, vscode.TextEditor] | null {
        if (vscode.window.activeTextEditor) {
            return [vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor];
        } else {
            return null;
        }
    }
    /// Returns the project uri if we are in a project,
    /// otherwise null
    public static getActiveProjectUri(): ProjectRoot | null {
        const activeFileUri = Helper.getActiveFileUri();
        if (activeFileUri) {
            return ProjectManager.getProject(activeFileUri[0]) ?? null;
        } else {
            return null;
        }
    }
    /// Returns the project uri if we are in a project,
    /// otherwise the uri of the active file
    public static getActiveVerificationUri(): vscode.Uri | null {
        const activeFileUri = Helper.getActiveFileUri();
        if (activeFileUri) {
            return ProjectManager.getProject(activeFileUri[0]) ?? activeFileUri[0];
        } else {
            return null;
        }
    }

    public static formatSeconds(time: number): string {
        if (!time) return "0s";
        return time.toFixed(1) + "s";
    }

    public static formatProgress(progress: number): string {
        if (progress <= 0) return "0%";
        return progress.toFixed(0) + "%";
    }

    /**
     * Returns the path to the global storage location provided by VSCode to the extension
     */
    public static getGlobalStoragePath(context: vscode.ExtensionContext): string {
        return context.globalStorageUri.fsPath;
    }

    /**
     * Returns the directory in which log files should be stored.
     * The directory will be created if it does not exist yet
     */
     public static getLogDir(): string {
        // check if a particular dir has been passed as an environment variable.
        // this is mainly used for CI purposes:
        let logDir = process.env["VIPER_IDE_LOG_DIR"];
        if (logDir == null || logDir === "") {
            logDir = path.join(os.tmpdir(), ".vscode");
        }
        //create logfile's directory if it wasn't created before
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        return logDir;
    }

    public static getGitHubToken(): string {
        return process.env["GITHUB_TOKEN"];
    }

    /**
     * Returns true if `getGobraToolsPath` should be wiped after activating the extension to ensure a clean system state.
     */
    public static cleanInstall(): boolean {
        const value = process.env["VIPER_IDE_CLEAN_INSTALL"];
        return value != null &&
            (value == "1" || value.toUpperCase() == "TRUE");
    }

    /**
     * Returns true if Viper-IDE runs in a non-interactive environment and confirmations should automatically be accepted.
     */
    public static assumeYes(): boolean {
        const value = process.env["VIPER_IDE_ASSUME_YES"];
        return value != null && 
            (value == "1" || value.toUpperCase() == "TRUE");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static rethrow(msg: string): (originalReason: any) => PromiseLike<never> {
        return originalReason => {
            Log.log(originalReason, LogLevel.Info);
            throw new Error(`${msg} (reason: '${originalReason}')`);
        };
    }

    public static identity<T>(param: T): T {
        return param;
    }
}

export interface Output {
    stdout: string;
    stderr: string;
    code: number | null;
}
