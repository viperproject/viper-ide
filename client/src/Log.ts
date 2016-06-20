'use strict';

import * as vscode from "vscode";

export class Log{

    static outputChannel = vscode.window.createOutputChannel('ViperIVE');

    public static log(message:string){
        this.outputChannel.append(message + "\n");
        console.log(message);
    }

    public static error(message:string){
        this.outputChannel.append("ERROR: " + message + "\n");
        console.error(message);
    }
}