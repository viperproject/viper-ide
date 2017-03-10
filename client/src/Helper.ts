'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Log } from './Log';
import * as path from 'path';
import { LogLevel } from './ViperProtocol';
const globToRexep = require('glob-to-regexp');

export class Helper {

    public static viperFileEndings: string[];

    public static loadViperFileExtensions() {
        this.viperFileEndings = ["*.vpr", "*.sil"];
        let fileAssociations = vscode.workspace.getConfiguration("files").get("associations");
        for (var pattern in fileAssociations) {
            let language = fileAssociations[pattern];
            if (language == 'viper') {
                Log.log("Additional file associations detected: " + language + " -> " + pattern, LogLevel.Debug);
                this.viperFileEndings.push(pattern);
            }
        }
    }

    public static getConfiguration(setting: string): any {
        return vscode.workspace.getConfiguration("viperSettings").get(setting);
    }


    public static areAdvancedFeaturesEnabled(): boolean {
        return (Helper.getConfiguration("advancedFeatures").enabled === true);
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
    public static getActiveFileUri(): vscode.Uri {
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
        if (!progress) return "0%";
        return progress.toFixed(0) + "%";
    }
}
