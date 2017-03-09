'use strict';

import * as vscode from "vscode";
import * as path from 'path';
import * as fs from 'fs';
import { Progress, LogLevel } from './ViperProtocol';
import { Helper } from './Helper';

export class StatusBar {

    private elem: vscode.StatusBarItem
    public command: string;

    constructor(priority, context: vscode.ExtensionContext) {
        this.elem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
        context.subscriptions.push(this.elem);
    }

    public update(text: string, color: string, tooltip: string = null, show: boolean = true) {
        this.elem.text = text;
        this.elem.color = color;
        this.elem.tooltip = tooltip;
        if (show) {
            this.elem.show();
        } else {
            this.elem.hide();
        }
    }

    public setCommand(command:string){
        this.elem.command = command;
    }

    public updateProgressBar(progress: number, tooltip: string = null, show: boolean = true) {
        this.update(this.progressBarText(progress), Color.PROGRESS_BAR, tooltip, show);
    }
    public updateProgressLabel(progressLabel: string, progress: number, totalProgress?: string) {
        this.update(progressLabel + " " + Helper.formatProgress(progress) + (totalProgress?" "+totalProgress:""), Color.PROGRESS_BAR);
    }

    public show() {
        this.elem.show();
    }

    public hide() {
        this.elem.hide();
    }

    private progressBarText(progress: number): string {
        progress = Math.floor(progress);
        let bar = "";
        for (var i = 0; i <= progress / 10; i++) {
            bar = bar + "⚫";
        }
        for (var i = 10; i > progress / 10; i--) {
            bar = bar + "⚪";
        }
        return bar;
    }
}

export class Color {
    public static READY = 'white';
    public static SUCCESS = 'lightgreen';
    public static ERROR = 'red';
    public static WARNING = 'orange';
    public static ACTIVE = 'orange';
    public static PROGRESS_BAR = 'orange';
}