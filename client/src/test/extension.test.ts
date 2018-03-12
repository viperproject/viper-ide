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
import Uri from 'vscode-uri';
import { Common, VerificationState } from '../ViperProtocol';
import { Event } from 'typescript.events';
import { State } from '../ExtensionState';
import * as child_process from 'child_process';
import * as mocha from 'mocha';
import { Helper } from '../Helper';
import { Log } from '../Log';

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
    verificationStarted = (b, f) => { };
}

let internalErrorDetected: boolean;

const SILICON = 'silicon';
const CARBON = 'carbon';
const SIMPLE = 'simple.sil';
const EMPTY = 'empty.txt';
const LONG = 'longDuration.vpr';

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

function log(msg: string) {
    console.log("[UnitTest " + Log.prettyUptime() + "] " + msg);
}

function waitForBackendStarted(backend?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.backendStarted = (b) => {
            log("Backend " + b + " started");
            if (!backend || b === backend) {
                ready = true;
                resolve(true);
            }
        }
    });
}

function waitForVerification(fileName: string, backend?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.verificationComplete = (b, f) => {
            log("Verification Completed: file: " + f + ", backend: " + b);
            if ((!backend || b === backend) && f === fileName) {
                resolve(true);
            }
        }
    });
}

function waitForVerificationStart(fileName: string, backend?: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        State.unitTest.verificationStarted = (b, f) => {
            log("Verification Started: file: " + f + ", backend: " + b);
            if ((!backend || b === backend) && f === fileName) {
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
        State.unitTest.verificationStopped = () => {
            log("verification stopped");
            resolve(true);
        }
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

function waitForTimeout(timeout, event: Promise<any>): Promise<boolean> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve(true);
        }, timeout)
        event.then(() => {
            resolve(false);
        })
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
            this.timeout(40000);

            openFile(SIMPLE).then(document => {
                if (document.languageId != 'viper') {
                    throw new Error("The language of viper file was not detected correctly: should: viper, is: " + document.languageId);
                }
                return waitForBackendStarted(SILICON);
            }).then(() => {
                //     selectBackend(CARBON);
                //     return waitForBackendStarted(CARBON);
                // }).then(() => {
                //backend ready
                done();
            });
        });

        it("Test simple verification with silicon", function (done) {
            log("Test simple verification with silicon");
            this.timeout(25000);

            //3. viper file should verify with silicon 
            waitForVerification(SIMPLE).then(() => {
                //verified
                done();
            });
        });
    });
}

function ViperToolsUpdateTest() {
    describe("Viper Tools Update Test:", function () {
        // //requires running backend
        it("Viper Tools Update Test", function (done) {
            log("Viper Tools Update Test");
            this.timeout(60000);

            executeCommand('viper.updateViperTools');

            openFile(LONG);

            //wait until viper tools update done
            waitForViperToolsUpdate().then(success => {
                //viper tools update done
                if (success) return waitForBackendStarted();
                else throw new Error("viper Tools Update failed");
            }).then(() => {
                return waitForVerification(LONG);
            }).then(() => {
                //backend ready
                done();
            });
        })

        //requires running backend
        it("Test abort of first verification after viper tools update", function (done) {
            log("Test abort of first verification after viper tools update");
            this.timeout(30000)

            internalErrorDetected = false;

            //stop the verification after 1000ms
            setTimeout(() => {
                stopVerification()
            }, 1000)

            verify();

            waitForAbort().then(() => {
                return checkForRunningProcesses(false, false, true);
                //return wait(1000);
            }).then(ok => {
                //aborted
                //reverify longDuration viper file
                verify()
                return waitForVerification(LONG);
            }).then(() => {
                //verified
                checkForInternalErrorBefore(done);
            });
        });
    })
}

function ViperIdeTests() {
    // Defines a Mocha test suite to group tests of similar kind together
    describe("ViperIDE tests:", function () {

        //requires running backend
        it("Test abort", function (done) {
            log("Test abort");
            this.timeout(30000);

            internalErrorDetected = false;

            //open a file that takes longer
            openFile(LONG).then(() => {
                verify();
                return waitForVerification(LONG);
            }).then(() => {
                verify();
                //stop the verification after 300ms
                setTimeout(() => {
                    stopVerification()
                }, 300)

                return waitForAbort();
            }).then(() => {
                return checkForRunningProcesses(false, true, true);
            }).then(ok => {
                //aborted
                //reverify longDuration viper file
                verify()
                return waitForVerification(LONG);
            }).then(() => {
                //verified
                checkForInternalErrorBefore(done);
            })
        });

        //requires running non-silicon backend
        it("Test closing files", function (done) {
            log("Test closing files");
            this.timeout(30000);
            internalErrorDetected = false;

            //selectBackend(SILICON);
            //waitForBackendStarted(SILICON).then(() => {
            openFile(LONG).then(() => {
                verify();
                return wait(500)
            }).then(() => {
                return closeFile();
            }).then(() => {
                return openFile(SIMPLE);
            }).then(() => {
                return wait(200);
            }).then(() => {
                stopVerification();
            }).then(() => {
                return closeFile();
            }).then(() => {
                return openFile(LONG);
            }).then(() => {
                return waitForVerification(LONG);
            }).then(() => {
                checkForInternalErrorBefore(done);
            })
        });

        it("Test not verifying verified files", function (done) {
            log("Test not verifying verified files");
            this.timeout(40000);

            let simpleAlreadyOpen = path.basename(vscode.window.activeTextEditor.document.fileName) == SIMPLE

            //reopen simple viper file
            openFile(SIMPLE).then(() => {
                if (simpleAlreadyOpen) return true;
                return waitForVerification(SIMPLE);
            }).then(() => {
                //simulate context switch by opening non-viper file
                return openFile(EMPTY);
            }).then(() => {
                return openFile(SIMPLE);
            }).then(() => {
                //wait 1000ms for verification start
                return waitForTimeout(1000, waitForVerificationStart(SIMPLE));
            }).then(timeoutHit => {
                if (timeoutHit) {
                    done();
                } else {
                    //verified
                    throw new Error("unwanted reverification of verified file after switching context");
                }
            });
        });

        it("Test zooming", function (done) {
            log("Test zooming");
            this.timeout(20000);

            executeCommand("workbench.action.zoomIn").then(() => {
                return wait(5000);
            }).then(() => {
                return executeCommand("workbench.action.zoomOut");
            }).then(() => {
                return waitForTimeout(9000, waitForBackendStarted())
            }).then((timeoutHit) => {
                if (timeoutHit) {
                    done();
                } else {
                    throw new Error("backend was restarted, but it should not be");
                }
            });
        });

        it("Test autoVerify", function (done) {
            log("Test autoVerify");
            this.timeout(2000);

            //turn auto verify back on in the end 
            let timer = setTimeout(() => {
                executeCommand("viper.toggleAutoVerify")
            }, 1500);

            executeCommand("viper.toggleAutoVerify").then(() => {
                return openFile(LONG)
            }).then(() => {
                return openFile(SIMPLE)
            }).then(() => {
                return waitForTimeout(1000, waitForVerificationStart(LONG))
            }).then((timeoutHit) => {
                if (timeoutHit) {
                    clearTimeout(timer);
                    executeCommand("viper.toggleAutoVerify").then(() => done())
                } else {
                    throw new Error("verification was started even if autoVerify is disabled");
                }
            })
        });

        //requires SIMPLE open
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

function checkForInternalErrorBefore(done) {
    if (internalErrorDetected) {
        throw new Error("Internal error detected");
    } else {
        done();
    }
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
                } else {
                    checkForInternalErrorBefore(done);
                }
            }, 9000);

            //submit 10 verification requests
            for (let i = 0; i < 10; i++) {
                verify();
            }

            waitForVerification(SIMPLE).then(() => {
                verificationDone = true;
                return waitForVerification(SIMPLE);
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
                return waitForVerification(SIMPLE, SILICON);
            }).then(() => {
                checkForInternalErrorBefore(done);
            });
        });

        it("3. quickly start, stop, and restart verification", function (done) {
            log("3. quickly start, stop, and restart verification");
            this.timeout(15000);

            internalErrorDetected = false;

            verify()
            stopVerification()
            verify()
            waitForVerification(SIMPLE).then(() => {
                checkForInternalErrorBefore(done);
            });
        });

        it("4. closing all files right after starting verificaiton", function (done) {
            log("4. closing all files right after starting verificaiton");
            this.timeout(6000);

            internalErrorDetected = false;

            let timer = setTimeout(() => {
                checkForInternalErrorBefore(done);
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
                //backend ready
                return waitForVerification(SIMPLE, CARBON);
            }).then(() => {
                //verified
                selectBackend(SILICON);
                //backend ready
                return waitForVerification(SIMPLE, SILICON);
            }).then(() => {
                done();
            })
        });
    })
}

function TestVerificationOfAllFilesInWorkspace() {
    describe("Workspace tests:", function () {
        it("Test Verification of all files in folder", function (done) {
            log("Test Verification of all files in folder");
            this.timeout(200000);

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

            wait(5000).then(() => {
                return checkForRunningProcesses(true, true, true);
            }).then(ok => {
                if (ok) {
                    done();
                }
            })
        });
    })
}

function checkForRunningProcesses(checkJava: boolean, checkBoogie: boolean, checkZ3: boolean): Thenable<boolean> {
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
            if (checkBoogie) terms.push('name="Boogie.exe"');
            if (checkZ3) terms.push('name="z3.exe"');
            command = `wmic process where '` + terms.join(' or ') + `' get ParentProcessId,ProcessId,Name,CommandLine`
        } else if (State.isMac) {
            let terms = [];
            if (checkZ3) terms.push('pgrep -x -l -u "$UID" z3')
            if (checkJava) terms.push('pgrep -l -u "$UID" -f java.*Viper')
            if (checkBoogie) terms.push('pgrep -x -l -u "$UID" Boogie');
            command = terms.join('; ');
        }
        else {
            let terms = [];
            if (checkZ3) terms.push('pgrep -x -l -u "$(whoami)" z3')
            if (checkJava) terms.push('pgrep -l -u "$(whoami)" -f java.*Viper')
            if (checkBoogie) terms.push('pgrep -x -l -u "$(whoami)" Boogie');
            command = terms.join('; ');
        }
        let pgrep = Common.executer(command);
        pgrep.stdout.on('data', data => {
            log("Process found: " + data);
            let stringData = (<string>data).replace(/[\n\r]/g, " ");
            if (/^.*?(\d+).*/.test(stringData)) {
                resolve(false);

                throw new Error("Process found");
            }
        });
        pgrep.on('exit', data => {
            resolve(true);
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

function closeFile(): Thenable<{}> {
    let filePath = path.join(TestContext.DATA_ROOT, vscode.window.activeTextEditor.document.fileName);
    log("close " + filePath);
    return vscode.commands.executeCommand("workbench.action.closeActiveEditor");
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