/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 
'use strict';

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as globToRexep from 'glob-to-regexp';
import * as path from 'path';
import * as os from 'os';
import { Log } from './Log';
import { LogLevel } from './ViperProtocol';

export class Helper {
    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);

    public static viperFileEndings: string[];

    public static loadViperFileExtensions() {
        this.viperFileEndings = ["*.vpr", "*.sil"];
        let fileAssociations = vscode.workspace.getConfiguration("files").get("associations", []);
        for (var pattern in fileAssociations) {
            let language = fileAssociations[pattern];
            if (language == 'viper') {
                Log.log("Additional file associations detected: " + language + " -> " + pattern, LogLevel.Debug);
                this.viperFileEndings.push(pattern);
            }
        }
    }

    //unused
    public static makeSureFileExists(fileName: string) {
        try {
            if (!fs.existsSync(fileName)) {
                fs.createWriteStream(fileName).close();
            }
            fs.accessSync(fileName);
        } catch (e) {
            Log.error("Error making sure " + fileName + " exists. Are you missing access permission? " + e);
        }
    }

    public static isViperSourceFile(uri: string | vscode.Uri): boolean {
        if (!uri) return false;
        let uriString = this.uriToString(uri);
        return this.viperFileEndings.some(globPattern => {
            let regex = globToRexep(globPattern);
            return regex.test(uriString);
        });
    }

    public static uriEquals(a: string | vscode.Uri, b: string | vscode.Uri) {
        if (!a || !b) return false;
        return this.uriToString(a) == this.uriToString(b);
    }

    public static uriToString(uri: string | vscode.Uri): string {
        if (!uri) return null;
        if (typeof uri === "string") {
            return uri;
        } else {
            return uri.toString();
        }
    }

    public static uriToObject(uri: string | vscode.Uri): vscode.Uri {
        if (!uri) return null;
        if (typeof uri === "string") {
            return vscode.Uri.parse(uri);
        } else {
            return uri;
        }
    }

    ///might be null
    public static getActiveFileUri(): vscode.Uri | null {
        if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor.document.uri;
        } else {
            return null;
        }
    }

    public static formatSeconds(time: number): string {
        if (!time) return "0 seconds";
        return time.toFixed(1) + " seconds";
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

    public static spawn(
        cmd: string, 
        args?: string[] | undefined, 
        options?: child_process.SpawnOptionsWithoutStdio | undefined
    ): Promise<Output> {
        Log.log(`Viper-IDE: Running '${cmd} ${args ? args.join(' ') : ''}'`, LogLevel.Verbose);
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
    
            const proc = child_process.spawn(cmd, args, options);
    
            proc.stdout.on('data', (data) => stdout += data);
            proc.stderr.on('data', (data) => stderr += data);
            proc.on('close', (code) => {
                Log.log("┌──── Begin stdout ────┐", LogLevel.Verbose);
                Log.log(stdout, LogLevel.Verbose);
                Log.log("└──── End stdout ──────┘", LogLevel.Verbose);
                Log.log("┌──── Begin stderr ────┐", LogLevel.Verbose);
                Log.log(stderr, LogLevel.Verbose);
                Log.log("└──── End stderr ──────┘", LogLevel.Verbose);
                resolve({ stdout, stderr, code });
            });
            proc.on('error', (err) => {
                Log.log("┌──── Begin stdout ────┐", LogLevel.Info);
                Log.log(stdout, LogLevel.Info);
                Log.log("└──── End stdout ──────┘", LogLevel.Info);
                Log.log("┌──── Begin stderr ────┐", LogLevel.Info);
                Log.log(stderr, LogLevel.Info);
                Log.log("└──── End stderr ──────┘", LogLevel.Info);
                Log.log(`Error: ${err}`, LogLevel.Info);
                reject(err);
            });
        });
    }

    public static rethrow(msg: string): (originalReason: any) => PromiseLike<never> {
        return (originalReason: any) => {
            Log.log(originalReason, LogLevel.Info);
            throw new Error(`${msg} (reason: '${originalReason}')`);
        }
    }
}

export interface Output {
    stdout: string;
    stderr: string;
    code: number | null;
}
