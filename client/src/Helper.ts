'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import {Log} from './Log';

export class Helper {

    public static showFile(filePath: string, column: vscode.ViewColumn) {
        let resource = vscode.Uri.file(filePath);
        vscode.workspace.openTextDocument(resource).then((doc) => {
            vscode.window.showTextDocument(doc, column);
        });
    }

    public static getConfiguration(setting: string) {
        return vscode.workspace.getConfiguration("viperSettings").get(setting);
    }

    public static makeSureFileExists(fileName: string) {
        try {
            if (!fs.existsSync(fileName)) {
                fs.createWriteStream(fileName).close();
            }
        } catch (e) {
            Log.error("Cannot create file: " + e);
        }
    }
    public static isViperSourceFile(uri: string): boolean {
        return uri.endsWith(".sil") || uri.endsWith(".vpr");
    }
}
