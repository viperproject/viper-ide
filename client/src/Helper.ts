'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import {Log} from './Log';
import * as path from 'path';
import {LogLevel} from './ViperProtocol';

export class Helper {

    public static showFile(filePath: string, column: vscode.ViewColumn) {
        let resource = vscode.Uri.file(filePath);
        let doc;
        //see if the document is already open
        for (let i = 0; i < vscode.workspace.textDocuments.length; i++) {
            let elem = vscode.workspace.textDocuments[i];
            if (elem.fileName === filePath) {
                doc = elem;
            }
        }
        if (doc) {
            //just show it if its open already
            vscode.window.showTextDocument(doc, column, true).then(msg => {
                Log.log("file shown (already open): " + path.basename(msg.document.uri.toString()), LogLevel.Debug)
            });
        } else {
            if (!resource) {
                Log.error("resource is undefined");
                return;
            }
            //open it
            vscode.workspace.openTextDocument(resource).then((doc) => {
                if (!doc) {
                    Log.error("doc is undefined");
                    return;
                }
                vscode.window.showTextDocument(doc, column, true).then(msg => {
                });
            }, (reason) => {
                Log.error("Show file error: " + reason);
            });
        }
    }

    public static getConfiguration(setting: string): any {
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
