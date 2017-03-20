// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as path from 'path';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as myExtension from '../extension';
import Uri from 'vscode-uri/lib/index';
import { Common, VerificationState } from '../ViperProtocol';
import { Event } from 'typescript.events';
import { State } from '../ExtensionState';
import * as child_process from 'child_process';
import * as mocha from 'mocha';
import { Helper } from '../Helper';

let ready = false;
//let verified = false;

let executionStates = [];

export class UnitTestCallback {
    backendStarted = (b) => { };
    verificationComplete = (b, f) => { };
    logFileOpened = () => { };
    allFilesVerified = (verified, total) => { };
    ideIsIdle = () => { };
    internalErrorDetected = () => { internalErrorDetected = true }
    activated = () => { };
    viperUpdateComplete = () => { };
    viperUpdateFailed = () => { };
    verificationStopped = () => { };
}

let internalErrorDetected: boolean;

const SILICON = 'silicon';
const CARBON = 'carbon';
const SIMPLE = 'simple.sil';
const EMPTY = 'empty.txt';
const LONG = 'longDuration.vpr';
const START_TIME = new Date().getTime();

//Initialize
State.unitTest = new UnitTestCallback();

//TestOpeningWorkspace();

//first test
StartViperIdeTests();

//Main tests
ViperToolsUpdateTest();
ViperIdeTests();
ViperIdeStressTests();
TestVerificationOfAllFilesInWorkspace();

//last test
FinishViperIdeTests();

function prettyUptime(): string {
    let uptime = new Date().getTime() - START_TIME;
    var hours = Math.floor(uptime / (1000 * 60 * 60));
    var minutes = Math.floor(uptime % (1000 * 60 * 60) / (1000 * 60));
    var seconds = uptime % (1000 * 60) / 1000;
    return (hours ? hours + ':' : '') +
        (minutes < 10 ? '0' : '') + minutes + ':' +
        (seconds < 10 ? '0' : '') + seconds.toFixed(3);
}

function log(msg: string) {
    console.log("[UnitTest " + prettyUptime() + "] " + msg);
}

function waitForBackendStarted(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.backendStarted = () => {
            ready = true;
            resolve(true);
        }
    });
}

function waitForVerification(backend: string, fileName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.verificationComplete = (b, f) => {
            log("Verificaion Completed: file: " + f + ", backend: " + b);
            if (b === backend && f === fileName) {
                resolve(true);
            }
        }
    });
}

function waitForVerificationOfAllFilesInWorkspace(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.allFilesVerified = (res) => {
            resolve(res);
        }
    });
}

function waitForViperToolsUpdate(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.viperUpdateComplete = () => { resolve(true); }
        State.unitTest.viperUpdateFailed = () => { resolve(false); }
    });
}

function waitForAbort(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        log("verification stopped");
        State.unitTest.verificationStopped = () => { resolve(true); }
    });
}

function waitForLogFile(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.logFileOpened = () => { resolve(true); }
    });
}

function waitForIdle(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.ideIsIdle = () => {
            resolve(true);
        }
    });
}

function waitForActivated(): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.activated = () => {
            resolve(true);
        }
    });
}

function wait(timeout): Promise<boolean> {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve(true);
        }, timeout);
    });
}

function StartViperIdeTests() {
    describe("ViperIDE Startup tests:", function () {

        it("Language Detection, and Backend Startup test.", function (done) {
            log("Language Detection, and Backend Startup test.");
            this.timeout(60000);

            openFile(SIMPLE).then(document => {
                if (document.languageId != 'viper') {
                    throw new Error("The language of viper file was not detected correctly: should: viper, is: " + document.languageId);
                }
                return waitForBackendStarted();
            }).then(() => {
                //backend ready
                done();
            });
        });

        it("Test simple verification with silicon", function (done) {
            log("Test simple verification with silicon");
            this.timeout(25000);

            //3. viper file should verify with silicon 
            waitForVerification(SILICON, SIMPLE).then(() => {
                //verified
                done();
            });
        });
    });
}

function ViperToolsUpdateTest() {
    describe("Viper Tools Update Test:", function () {
        it("Viper Tools Update Test", function (done) {
            log("Viper Tools Update Test");
            this.timeout(60000);

            executeCommand('viper.updateViperTools');

            //wait until viper tools update done
            waitForViperToolsUpdate().then(success => {
                //viper tools update done
                if (success) return waitForBackendStarted();
                else throw new Error("viper Tools Update failed");
            }).then(() => {
                //backend ready
                done();
            });
        })
    })
}

function ViperIdeTests() {
    // Defines a Mocha test suite to group tests of similar kind together
    describe("ViperIDE tests:", function () {

        it("Test abort", function (done) {
            log("Test abort");
            this.timeout(30000);

            //open a file that takes longer
            openFile(LONG);
            //stop the verification after 1000ms
            setTimeout(() => {
                stopVerification()
            }, 1000)

            waitForAbort().then(() => {
                //aborted
                //reverify longDuration viper file
                verify()
                return waitForVerification(SILICON, LONG);
            }).then(() => {
                //verified
                done();
            })
        });

        it("Test not verifying verified files", function (done) {
            log("Test not verifying verified files");
            this.timeout(6000);

            let simpleAlreadyOpen = path.basename(vscode.window.activeTextEditor.document.fileName) == SIMPLE

            let timer = setTimeout(() => {
                done();
            }, 5000);

            //reopen simple silicon file
            openFile(SIMPLE).then(() => {
                if (simpleAlreadyOpen) return true;
                return waitForVerification(SILICON, SIMPLE);
            }).then(() => {
                //simulate context switch by opening non-viper file
                return openFile(EMPTY);
            }).then(() => {
                return openFile(SIMPLE);
            }).then(() => {
                //wait 5000ms for verification
                return waitForVerification(SILICON, SIMPLE);
            }).then(() => {
                //verified
                throw new Error("unwanted reverification of verified file after switching context");
            });
        });

        it("Test zooming", function (done) {
            log("Test zooming");
            this.timeout(11000);

            let timer = setTimeout(() => {
                done();
            }, 10000);
            executeCommand("workbench.action.zoomIn").then(() => {
                return wait(500);
            }).then(() => {
                return executeCommand("workbench.action.zoomOut");
            }).then(() => {
                return waitForBackendStarted();
            }).then(() => {
                //verified
                clearTimeout(timer);
            });
        });

        it("Test Helper Methods", function (done) {
            log("Test Helper Methods");
            this.timeout(1000);

            checkAssert(Helper.formatProgress(12.9), "13%", "formatProgress");
            checkAssert(Helper.formatSeconds(12.99), "13.0 seconds", "formatSeconds");
            checkAssert(Helper.isViperSourceFile("/folder/file.vpr"), true, "isViperSourceFile unix path");
            checkAssert(Helper.isViperSourceFile("..\\.\\folder\\file.sil"), true, "isViperSourceFile relavive windows path");
            checkAssert(!Helper.isViperSourceFile("C:\\absolute\\path\\file.ts"), true, "isViperSourceFile absolute windows path");
            checkAssert(path.basename(Helper.uriToString(Helper.getActiveFileUri())), SIMPLE, "active file");
            done();
        });

        it("Test opening logFile", function (done) {
            log("Test opening logFile");
            this.timeout(2000);

            executeCommand('viper.openLogFile');
            waitForLogFile().then(() => {
                executeCommand('workbench.action.closeActiveEditor');
                return wait(500);
            }).then(() => {
                done();
            })
        });
    });
}

function executeCommand(command: string, args?) {
    log(command + (args ? ' ' + args : ''));
    return vscode.commands.executeCommand(command, args);
}

function verify() {
    executeCommand('viper.verify');
}

function stopVerification() {
    executeCommand('viper.stopVerification');
}

function selectBackend(backend) {
    executeCommand('viper.selectBackend', backend);
}

function closeAllEditors() {
    executeCommand('workbench.action.closeAllEditors');
}

function ViperIdeStressTests() {
    describe("ViperIDE Stress Tests:", function () {
        it("1. multiple fast verification requests", function (done) {
            log("1. multiple fast verification requests");
            this.timeout(11000);

            internalErrorDetected = false;
            let verificationDone = false;

            let timer = setTimeout(() => {
                //the file should be verified exactly once
                //no internal error must happen
                if (!verificationDone) {
                    throw new Error("No verification completed");
                } else if (internalErrorDetected) {
                    throw new Error("Internal error detected");
                } else {
                    done();
                }
            }, 10000);

            //submit 10 verification requests
            for (let i = 0; i < 10; i++) {
                verify();
            }

            waitForVerification(SILICON, SIMPLE).then(() => {
                verificationDone = true;
                return waitForVerification(SILICON, SIMPLE);
            }).then(() => {
                throw new Error("multiple verifications seen");
            });
        });

        it("2. quickly change backends", function (done) {
            log("2. quickly change backends");
            this.timeout(50000);

            internalErrorDetected = false;

            selectBackend(CARBON);

            //submit 10 verification requests
            for (let i = 0; i < 10; i++) {
                selectBackend(SILICON);
                selectBackend(CARBON);
            }

            wait(500).then(() => {
                selectBackend(SILICON);
                return waitForVerification(SILICON, SIMPLE);
            }).then(() => {
                if (internalErrorDetected) {
                    throw new Error("Internal error detected");
                } else {
                    done();
                }
            });
        });

        it("3. quickly start, stop, and restart verification", function (done) {
            log("3. quickly start, stop, and restart verification");
            this.timeout(15000);

            internalErrorDetected = false;

            verify()
            stopVerification()
            verify()
            waitForVerification(SILICON, SIMPLE).then(() => {
                if (internalErrorDetected) {
                    throw new Error("Internal error detected");
                } else {
                    done();
                }
            });
        });

        it("4. closing all files right after starting verificaiton", function (done) {
            log("4. closing all files right after starting verificaiton");
            this.timeout(6000);

            internalErrorDetected = false;

            let timer = setTimeout(() => {
                //no internal error must happen
                if (internalErrorDetected) {
                    throw new Error("Internal error detected");
                } else {
                    done();
                }
            }, 5000);

            verify()
            executeCommand('workbench.action.closeAllEditors');
        });

        it("Test simple verification with carbon", function (done) {
            log("Test simple verification with carbon");
            this.timeout(35000);

            openFile(SIMPLE).then(() => {
                //change backend to carbon
                selectBackend(CARBON);
                return waitForBackendStarted()
            }).then(() => {
                //backend ready
                return waitForVerification(CARBON, SIMPLE);
            }).then(() => {
                //verified
                done();
            })
        });
    })
}

function TestVerificationOfAllFilesInWorkspace() {
    describe("Workspace tests:", function () {
        it("Test Verification of all files in folder", function (done) {
            log("Test Verification of all files in folder");
            this.timeout(100000);

            executeCommand('workbench.action.closeAllEditors');
            waitForIdle().then(() => {
                executeCommand('viper.verifyAllFilesInWorkspace', Helper.uriToString(TestContext.DATA_ROOT));
                return waitForVerificationOfAllFilesInWorkspace();
            }).then((result: any) => {
                if (result.verified == result.total) {
                    done();
                } else {
                    throw new Error("partially verified workspace: (" + result.verified + "/" + result.total + ")");
                }
            })
        });
    })
}

function TestOpeningWorkspace() {
    describe("Folder Tests:", function () {
        it("Test opening a folder", function (done) {
            log("Test opening a folder");
            this.timeout(100000);

            executeCommand('vscode.openFolder', Helper.uriToObject(Common.pathToUri(TestContext.DATA_ROOT))).then(() => {
                State.unitTest = new UnitTestCallback();
                return wait(10000);
            }).then(() => {
                return waitForBackendStarted();
            }).then(() => {
                done();
            })
        });
    })
}

function FinishViperIdeTests() {
    describe("Deactivation Tests:", function () {
        it("Test closing all auxilary processes", function (done) {
            log("Test closing all auxilary processes");
            this.timeout(10000);

            TestContext.dispose();

            //wait 15000ms
            setTimeout(() => {
                let command: string;
                if (State.isWin) {
                    command = `wmic process where 'CommandLine like "%Viper%" and (name="ng.exe" or name="java.exe" or name="Boogie.exe" or name="z3.exe")' get ProcessId,Name,commandline` // 
                } else {
                    command = 'pgrep -x -l -u "$UID" ng; pgrep -x -l -u "$UID" z3; pgrep -l -u "$UID" -f nailgun; pgrep -x -l -u "$UID" Boogie'
                }
                let pgrep = Common.executer(command);
                pgrep.stdout.on('data', data => {
                    log("Process found: " + data);
                    let stringData = (<string>data).replace(/[\n\r]/g, " ");
                    if (/^.*?(\d+).*/.test(stringData)) {
                        throw new Error("Process found");
                    }
                });
                pgrep.on('exit', data => {
                    done();
                });
            }, 5000);
        });
    })
}
function checkAssert(seen, expected, message: string) {
    assert(expected === seen, message + ": Expected: " + expected + " Seen: " + seen);
}

function openFile(fileName): Promise<vscode.TextDocument> {
    return new Promise((resolve, reject) => {
        let filePath = path.join(TestContext.DATA_ROOT, fileName);
        log("open " + filePath);
        vscode.workspace.openTextDocument(filePath).then(document => {
            vscode.window.showTextDocument(document).then((editor) => {
                resolve(document);
            });
        });
    });
}

class TestContext {

    private static PROJECT_ROOT = path.join(__dirname, '../../');

    public static DATA_ROOT = path.join(TestContext.PROJECT_ROOT, "src", "test", "data");

    public static subscriptions: any[] = [];
    public static asAbsolutePath(relativePath: string): string {
        //return path.join(vscode.workspace.rootPath, relativePath);
        return path.join(TestContext.PROJECT_ROOT, relativePath);
    }

    public static dispose() {
        myExtension.deactivate();
        this.subscriptions.forEach(disposable => {
            disposable.dispose();
        });
    }
}