// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2011-2020 ETH Zurich.

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as myExtension from '../extension';
import { State, UnitTestCallback } from '../ExtensionState';
import { Log } from '../Log';
import { Common } from '../ViperProtocol';

export const PROJECT_ROOT = path.join(__dirname, "..", "..");
export const DATA_ROOT = path.join(PROJECT_ROOT, "src", "test", "data");
export const SILICON = 'silicon';
export const CARBON = 'carbon';


export const SIMPLE = 'simple.sil';
export const EMPTY = 'empty.sil';
export const EMPTY_TXT = 'empty.txt';
export const LONG = 'longDuration.vpr';

export default class TestHelper {
    private static callbacks: UnitTestCallbackImpl = null;

    public static async setup() {
        // setup callbacks:
        assert(this.callbacks == null);
        this.callbacks = new UnitTestCallbackImpl();
        State.unitTest = this.callbacks;

        // The following comment explains how an extension could be restarted in between test suites:
        // https://github.com/microsoft/vscode/issues/45774#issuecomment-373423895
        // However, we solve it by executing each test suite individually. This is controlled by `runTest.ts`
        // that calls `index.ts` with a particular test suite.
    }

    public static async teardown() {
        assert(this.callbacks != null);
        this.callbacks = null;
        await myExtension.deactivate();
        // FIXME: set all args to true as soon as leaking java command is fixed
        await this.checkForRunningProcesses(false, true, true);
    }

    public static log(msg: string) {
        console.log(`[UnitTest ${Log.prettyUptime()}] ${msg}`);
    }

    private static getTestDataPath(fileName: string): string {
        return path.join(DATA_ROOT, fileName);
    }

    public static async startExtension(): Promise<void> {
        await TestHelper.openFile(EMPTY);
        await TestHelper.waitForBackendStarted();
    }

    public static async openFile(fileName: string): Promise<vscode.TextDocument> {
        const filePath = TestHelper.getTestDataPath(fileName);
        TestHelper.log("Open " + filePath);
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
        return document;
    }

    public static async closeFile(): Promise<void> {
        const filePath = TestHelper.getTestDataPath(vscode.window.activeTextEditor.document.fileName);
        TestHelper.log("close " + filePath);
        await TestHelper.executeCommand("workbench.action.closeActiveEditor");
    }
    
    public static async openAndVerify(fileName: string): Promise<vscode.TextDocument> {
        const filePath = TestHelper.getTestDataPath(fileName);
        // open file, ...
        const document = await TestHelper.openFile(fileName);

        const verified = TestHelper.waitForVerification(fileName);
        // ... send verification command to server...
        await TestHelper.verify();
        // ... and wait for result notification from server
        await verified;
        return document;
    }

    public static resetErrors() {
        TestHelper.callbacks.resetInternalError();
    }

    public static hasObservedInternalError(): boolean {
        return TestHelper.callbacks.internalError;
    }

    public static async checkForRunningProcesses(checkJava: boolean, checkBoogie: boolean, checkZ3: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            let command: string;
            if (State.isWin) {
                let terms = [];
                if (checkJava) {
                    let term = `(CommandLine like "%Viper%" and (`;
                    let innerTerms = [];
                    if (checkJava) innerTerms.push('name="java.exe"');
                    term += innerTerms.join(' or ');
                    term += '))'
                    terms.push(term);
                }
                if (checkBoogie) terms.push('name="Boogie.exe"');  // TODO use platform-independent binary names
                if (checkZ3) terms.push('name="z3.exe"');   // TODO use platform-independent binary names
                command = `wmic process where '` + terms.join(' or ') + `' get ParentProcessId,ProcessId,Name,CommandLine`
            } else if (State.isMac) {
                let terms = [];
                if (checkZ3) terms.push('pgrep -x -l -u "$UID" z3')
                if (checkJava) terms.push('pgrep -l -u "$UID" -f java.*Viper')
                if (checkBoogie) terms.push('pgrep -x -l -u "$UID" Boogie');
                command = terms.join('; ');
            } else {
                let terms = [];
                if (checkZ3) terms.push('pgrep -x -l -u "$(whoami)" z3')
                if (checkJava) terms.push('pgrep -l -u "$(whoami)" -f java.*Viper')
                if (checkBoogie) terms.push('pgrep -x -l -u "$(whoami)" Boogie');
                command = terms.join('; ');
            }
            const pgrep = Common.executer(command);
            pgrep.stdout.on('data', data => {
                TestHelper.log("Process found: " + data);
                const stringData = (<string>data).replace(/[\n\r]/g, " ");
                if (/^.*?(\d+).*/.test(stringData)) {
                    reject("Process found");
                }
            });
            pgrep.on('exit', data => {
                resolve();
            });
        });
    }

    public static async verify(): Promise<void> {
        await TestHelper.executeCommand('viper.verify');
    }

    public static async stopVerification(): Promise<void> {
        await TestHelper.executeCommand('viper.stopVerification');
    }

    public static async selectBackend(backend: string): Promise<void> {
        await TestHelper.executeCommand('viper.selectBackend', backend)
    }

    public static async startViperToolsUpdate(): Promise<void> {
        await TestHelper.executeCommand('viper.updateViperTools');
    }

    public static executeCommand(command: string, args?) {
        TestHelper.log(command + (args ? ' ' + args : ''));
        return vscode.commands.executeCommand(command, args);
    }

    public static waitForBackendStarted(backend?: string): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.backendStarted = (b) => {
                TestHelper.log("Backend " + b + " started");
                if (!backend || b === backend) {
                    resolve();
                }
            }
        });
    }

    public static waitForVerificationStart(fileName: string, backend?: string): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.verificationStarted = (b, f) => {
                TestHelper.log(`Verification Started: file: ${f}, backend: ${b}`);
                if ((!backend || b === backend) && f === fileName) {
                    resolve();
                }
            }
        });
    }

    public static waitForVerification(fileName: string, backend?: string): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.verificationComplete = (b, f) => {
                TestHelper.log(`Verification Completed: file: ${f}, backend: ${b}`);
                if ((!backend || b === backend) && f === fileName) {
                    resolve();
                }
            }
        });
    }

    public static waitForVerificationOfAllFilesInWorkspace(): Promise<{verified: number, total: number}> {
        return new Promise(resolve => {
            TestHelper.callbacks.allFilesVerified = (verified, total) => {
                TestHelper.log(`Verification of all files completed: ${verified} of ${total}`);
                resolve({verified: verified, total: total});
            }
        });
    }

    public static waitForAbort(): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.verificationStopped = () => {
                TestHelper.log("verification stopped");
                resolve();
            }
        });
    }

    public static waitForLogFile(): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.logFileOpened = () => { 
                TestHelper.log("log file opened");
                resolve(); 
            }
        });
    }

    public static waitForIdle(): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.ideIsIdle = () => { 
                TestHelper.log("IDE is idle");
                resolve(); 
            }
        });
    }

    public static waitForViperToolsUpdate(): Promise<boolean> {
        return new Promise(resolve => {
            TestHelper.callbacks.viperUpdateComplete = () => { resolve(true); }
            TestHelper.callbacks.viperUpdateFailed = () => { resolve(false); }
        });
    }

    /**
     * Promise is resolved with true if timeout is hit, otherwise if event happens before timeout returned promise is resolved with false
     */
    public static waitForTimeout(timeoutMs, event: Promise<any>): Promise<boolean> {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true);
            }, timeoutMs);
            event.then(() => {
                resolve(false);
            });
        });
    }

    public static wait(timeoutMs: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(function() {
                resolve();
            }, timeoutMs);
        });
    }
}

class UnitTestCallbackImpl implements UnitTestCallback {
    private errorDetected = false;

    public get internalError(): boolean {
        return this.errorDetected;
    }

    public resetInternalError() {
        this.errorDetected = false;
    }

    backendStarted = (backend: string) => { };
    verificationComplete = (backend: string, filename: string) => { };
    logFileOpened = () => { };
    allFilesVerified = (verified: number, total: number) => { };
    ideIsIdle = () => { };
    internalErrorDetected = () => { this.errorDetected = true; }
    activated = () => { };
    viperUpdateComplete = () => { };
    viperUpdateFailed = () => { };
    verificationStopped = () => { };
    verificationStarted = (backend: string, filename: string) => { };
}
