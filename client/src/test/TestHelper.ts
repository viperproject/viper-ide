// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Copyright (c) 2011-2020 ETH Zurich.

import assert from 'assert';
import { SpawnOptionsWithoutStdio } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import * as myExtension from '../extension';
import { State, UnitTestCallback } from '../ExtensionState';
import { Log } from '../Log';
import { Common, LogLevel, Output } from '../ViperProtocol';
import * as fs from 'fs';

export const PROJECT_ROOT = path.join(__dirname, "..", "..");
export const DATA_ROOT = path.join(PROJECT_ROOT, "src", "test", "data");
export const SILICON = 'silicon';
export const CARBON = 'carbon';

export const SETUP_TIMEOUT = 20 * 1000; // 20 sec


export const SIMPLE = 'simple.sil';
export const EMPTY = 'empty.sil';
export const EMPTY_TXT = 'empty.txt';
export const LONG = 'longDuration.vpr';
export const WARNINGS = 'warnings.vpr';
export const BRANCH1 = 'branch1.vpr'
export const BRANCH2 = 'branch2.vpr'


export default class TestHelper {
    private static callbacks: UnitTestCallbackImpl = null;
    private static context: vscode.ExtensionContext = null;

    /**
     * Configures the state used for unit tests.
     * When called as part of the first testsuite, the extension's start is not awaited.
     * However, for subsequent testsuites, the extension's activation is awaited.
     */
    public static async setup(): Promise<void> {
        // setup callbacks:
        assert(this.callbacks == null);
        this.callbacks = new UnitTestCallbackImpl();
        State.unitTest = this.callbacks;
        // call `Log.updateSettings()` as early as possible after setting `State.unitTest` such that 
        // the appropriate log level for tests is set:
        Log.updateSettings();

        await TestHelper.closeAllFiles();

        // The following comment explains how an extension could be restarted in between test suites:
        // https://github.com/microsoft/vscode/issues/45774#issuecomment-373423895
        // However, we solve it by executing each test suite individually. This is controlled by `runTest.ts`
        // that calls `index.ts` with a particular test suite.
        if (this.context != null) {
            // VScode does not automatically start the extension when reopening a
            // Viper file if we have manually terminated the extension before
            await myExtension.activate(this.context);
        }
    }

    public static async teardown(): Promise<void> {
        assert(this.callbacks != null);
        this.callbacks = null;
        this.context = await myExtension.shutdown();
        // wait shortly (1s) to ensure that the OS reports the (killed) processes correctly:
        // await new Promise(resolve => setTimeout(resolve, 1000));
        await TestHelper.checkForRunningProcesses(true, true, true);

        // at the very end, set `unitTest` to false and dispose log because `Log.dispose()` as part of `deactivate`
        // has been ignored if `unitTest` is non-null:
        State.unitTest = null;
        // directly write the log file's location to the console (as opposed to sending it to `Log`) because
        // all log output is suppressed while unit testing:
        console.info(`Log file is stored at '${Log.logFilePath}'`);
        Log.dispose();
    }

    public static log(msg: string): void {
        Log.logWithOrigin("UnitTest", msg, LogLevel.Verbose);
    }

    public static getTestDataPath(fileName: string): string {
        return path.join(DATA_ROOT, fileName);
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

    public static async closeAllFiles(): Promise<void> {
        TestHelper.log("closing all files");
        await TestHelper.executeCommand('workbench.action.closeAllEditors');
    }
    
    public static async openAndVerify(fileName: string): Promise<vscode.TextDocument> {
        // open file, ...
        const document = await TestHelper.openFile(fileName);

        const verified = TestHelper.waitForVerification(fileName);
        // ... send verification command to server...
        TestHelper.log("openAndVerify: file is open, now executing the verify command");
        await TestHelper.verify();
        TestHelper.log("openAndVerify: file is open, verify command has been executed");
        // ... and wait for result notification from server
        await verified;
        TestHelper.log("openAndVerify: file is verified");
        return document;
    }

    public static resetErrors(): void {
        TestHelper.callbacks.resetInternalError();
    }

    public static hasObservedInternalError(): boolean {
        return TestHelper.callbacks.internalError;
    }

    public static async checkForRunningProcesses(checkJava: boolean, checkBoogie: boolean, checkZ3: boolean): Promise<void> {
        const options: SpawnOptionsWithoutStdio = {
            shell: true
        };
        const outputs: Output[] = [];
        // note for pgrep on macOS and linux:
        // the pgrep command might show up in the list of running commands. Simply using `-f java.*Viper` can thus lead to false
        // positives as it matches the command line of just this pgrep command. Two different solutions to this problem are
        // described here: https://serverfault.com/q/367921
        // either one can use `-f [j]ava.*Viper` or `-f [^]]java.*Viper` to avoid this problem. As we do have a static string to match
        // against, we have opted for the first variant.
        // note that we add `|| true` on macOS and Linux because `pgrep` exits with code 1 if no process is found.
        if (State.isWin) {
            function getArgs(whereCond: string): string[] {
                return ['process', 'where', whereCond, 'get', 'ParentProcessId,ProcessId,Name,CommandLine'];
            }
            if (checkZ3) outputs.push(await Common.spawn('wmic', getArgs('name="z3.exe"'), options));
            if (checkJava) outputs.push(await Common.spawn('wmic', getArgs('(CommandLine like "%Viper%" and name="java.exe")'), options));
            if (checkBoogie) outputs.push(await Common.spawn('wmic', getArgs('name="Boogie.exe"'), options));
        } else if (State.isMac) {
            if (checkZ3) outputs.push(await Common.spawn('pgrep', ['-x', '-l', '-u', '"$UID"', 'z3', '||', 'true'], options));
            if (checkJava) outputs.push(await Common.spawn('pgrep', ['-l', '-u', '"$UID"', '-f', '"[j]ava.*Viper"', '||', 'true'], options));
            if (checkBoogie) outputs.push(await Common.spawn('pgrep', ['-x', '-l', '-u', '"$UID"', 'Boogie', '||', 'true'], options));
        } else {
            if (checkZ3) outputs.push(await Common.spawn('pgrep', ['-x', '-l', '-u', '"$(whoami)"', 'z3', '||', 'true'], options));
            if (checkJava) outputs.push(await Common.spawn('pgrep', ['-l', '-u', '"$(whoami)"', '-f', '"[j]ava.*Viper"', '||', 'true'], options));
            if (checkBoogie) outputs.push(await Common.spawn('pgrep', ['-x', '-l', '-u', '"$(whoami)"', 'Boogie', '||', 'true'], options));
        }
        const outputMsgs = outputs
            .map(out => {
                const stringData = out.stdout.replace(/[\n\r]/g, " ");
                if (/^.*?(\d+).*/.test(stringData)) {
                    const outputMsg = `Process found: '${out.stdout}'`;
                    TestHelper.log(outputMsg);
                    return [outputMsg];
                } else {
                    return [];
                }
            }).reduce((prev, cur) => prev.concat(cur), []);
        if (outputMsgs.length == 0) {
            // no processes found
            return Promise.resolve();
        } else {
            return Promise.reject(new Error(`The following processes have been found: ${outputMsgs.join(', ')}`));
        }
    }

    /** the returned promise completes when the command has been sent (i.e. not when verification has finished) */
    public static async verify(): Promise<void> {
        await TestHelper.executeCommand('viper.verify');
    }

    public static async stopVerification(): Promise<void> {
        await TestHelper.executeCommand('viper.stopVerification');
    }

    public static async selectBackend(backend: string): Promise<void> {
        await TestHelper.executeCommand('viper.selectBackend', backend)
    }

    public static executeCommand(command: string, args?): Thenable<unknown> {
        TestHelper.log(command + (args ? ' ' + args : ''));
        return vscode.commands.executeCommand(command, args);
    }

    public static checkIfExtensionIsActivatedOrWaitForIt(): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.extensionActivated = () => {
                resolve();
            }
            // check whether activation has already happened in the past:
            if (myExtension.isActivated()) {
                resolve();
            }
        });
    }

    public static waitForExtensionActivation(): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.extensionActivated = () => {
                resolve();
            }
        });
    }

    public static waitForExtensionRestart(): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.extensionRestarted = () => { resolve(); }
        });
    }

    public static waitForBackendStarted(backend?: string): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.backendStarted = (b: string) => {
                TestHelper.log(`Backend ${b} started`);
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
                if ((!backend || b.toLowerCase() === backend.toLowerCase()) && f === fileName) {
                    resolve();
                }
            }
        });
    }

    public static waitForVerification(fileName: string, backend?: string): Promise<void> {
        return new Promise(resolve => {
            TestHelper.callbacks.verificationComplete = (b, f) => {
                TestHelper.log(`Verification Completed: file: ${f}, backend: ${b}`);
                if ((!backend || b.toLowerCase() === backend.toLowerCase()) && f === fileName) {
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
        return new Promise((resolve, reject) => {
            TestHelper.callbacks.verificationStopped = (success: boolean) => {
                TestHelper.log(`verification stopped ${success ? "successfully" : "unsuccessfully"}`);
                if (success) {
                    resolve();
                } else {
                    reject();
                }
            }
        });
    }

    public static waitForVerificationOrAbort(): Promise<void> {
        let resolved = false
        return new Promise((resolve, reject) => {
            TestHelper.callbacks.verificationComplete = (b, f) => {
                TestHelper.log(`Verification Completed: file: ${f}, backend: ${b}`);
                if (!resolved) {
                    resolved = true;
                    resolve();
                }
            }
            TestHelper.callbacks.verificationStopped = (success: boolean) => {
                TestHelper.log(`verification stopped ${success ? "successfully" : "unsuccessfully"}`);
                if (!resolved) {
                    resolved = true;
                    if (success) {
                        resolve();
                    } else {
                        reject();
                    }
                }
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

    /**
     * Promise is resolved with true if timeout is hit, otherwise if event happens before timeout returned promise is resolved with false
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public static waitForTimeout(timeoutMs, event: Promise<any>): Promise<boolean> {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve(true);
            }, timeoutMs);
            event.then(() => {
                resolve(false);
            }, reject);
        });
    }

    public static wait(timeoutMs: number): Promise<void> {
        return new Promise(resolve => {
            setTimeout(function() {
                resolve();
            }, timeoutMs);
        });
    }

    public static getDecorationOptions(): object[] {
        return TestHelper.callbacks.decorationOptions;
    }
}

class UnitTestCallbackImpl implements UnitTestCallback {
    private errorDetected = false;
    private decorationOptions_ = null;

    public get internalError(): boolean {
        return this.errorDetected;
    }

    public resetInternalError(): void {
        this.errorDetected = false;
    }

    public get decorationOptions(): object[] {
        return this.decorationOptions_;
    }

    extensionActivated: () => void = () => { };
    extensionRestarted: () => void = () => { };
    backendStarted: (backend: string) => void = () => { };
    verificationComplete: (backend: string, filename: string) => void = () => { };
    logFileOpened: () => void = () => { };
    allFilesVerified: (verified: number, total: number) => void = () => { };
    ideIsIdle: () => void = () => { };
    internalErrorDetected: () => void = () => { this.errorDetected = true; };
    verificationStopped: (success: boolean) => void = () => { };
    verificationStarted: (backend: string, filename: string) => void = () => { };
    showRedBeams: (decorationOptions: vscode.DecorationOptions[]) => void = (opts) => {this.decorationOptions_ = opts};
}
