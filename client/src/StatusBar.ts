/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */

import * as vscode from "vscode";
import { Helper } from './Helper';
import { Settings } from "./Settings";

export class StatusBar {

    private elem: vscode.StatusBarItem
    public command: string;

    constructor(priority, context: vscode.ExtensionContext) {
        this.elem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, priority);
        context.subscriptions.push(this.elem);
    }

    public update(text: string, color: string, tooltip: string = null): StatusBar {
        this.elem.text = text;
        this.elem.color = color;
        this.elem.tooltip = tooltip;
        return this;
    }

    public setCommand(command: string): void {
        this.elem.command = command;
    }

    public updateProgressBar(progress: number, tooltip: string = null): StatusBar {
        return this.update(this.progressBarText(progress), Color.PROGRESS_BAR, tooltip);
    }
    public updateProgressLabel(progressLabel: string, progress: number, postfix?: string): StatusBar {
        return this.update(progressLabel + " " + Helper.formatProgress(progress) + (postfix ? " " + postfix : ""), Color.PROGRESS_BAR);
    }

    public show(): StatusBar {
        if (Settings.showProgress()) {
            this.elem.show();
        }
        return this;
    }

    public hide(): StatusBar {
        this.elem.hide();
        return this;
    }

    private progressBarText(progress: number): string {
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;
        const completed = Math.floor(progress / 10);
        return "⚫".repeat(completed) + "⚪".repeat(10 - completed);
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
