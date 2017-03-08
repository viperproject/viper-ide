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

let ready = false;
//let verified = false;

let executionStates = [];
let context;

let backendReadyCallback;
let verificationCompletionCallback;
let abortCallback;
let updateViperToolsCallback;

const SILICON = 'silicon';
const CARBON = 'carbon';
const SIMPLE = 'simple.sil';
const LONG = 'longDuration.vpr';

function waitForBackendStarted(): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        backendReadyCallback = () => { resolve(true); }
    });
}

function waitForVerification(backend: string, fileName: string): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        verificationCompletionCallback = (b, f) => {
            if (b === backend && f === fileName) {
                resolve(true);
            }
        }
    });
}

function waitForViperToolsUpdate(): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        updateViperToolsCallback = () => { resolve(true); }
    });
}

function waitForAbort(): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        abortCallback = () => { resolve(true); }
    });
}

function wait(timeout): Thenable<boolean> {
    return new Promise((resolve, reject) => {
        setTimeout(function () {
            resolve(true);
        }, timeout);
    });
}

// Defines a Mocha test suite to group tests of similar kind together
describe("ViperIDE tests", function () {
    before(() => {
        context = new TestContext();
        myExtension.initializeUnitTest(function (state) {
            executionStates.push(state);
            if (state.event == "BackendStarted") {
                backendReadyCallback(state.backend);
                ready = true;
            }
            else if (state.event == "ViperUpdateComplete") {
                updateViperToolsCallback();
            }
            else if (state.event == "ViperUpdateFailed") {
            }
            else if (ready && state.event == "VerificationComplete") {
                verificationCompletionCallback(state.backend, state.fileName);
                console.log("UnitTest: " + state.fileName + " verified with " + state.backend);
            }
            else if (state.event == 'VerificationStopped') {
                abortCallback();
            }
        });
    });

    //must be first test
    it("Language detection and backend startup test", function (done) {
        this.timeout(10000);

        openFile(context, SIMPLE).then(document => {
            if (document.languageId != 'viper') {
                throw new Error("The language of viper file was not detected correctly: should: viper, is: " + document.languageId);
            }
            return waitForBackendStarted();
        }).then(() => {
            console.log("UnitTest: BackendStarted");
            done();
        });
    });


    it("Test simple verification with silicon", function (done) {
        this.timeout(15000);
        //3. viper file should verify with silicon 
        waitForVerification(SILICON, SIMPLE).then(() => {
            //verified
            console.log("UnitTest: silicon verification complete");
            done();
        });
    });

    it("Test abort", function (done) {
        this.timeout(15000);

        //open a file that takes longer
        openFile(context, LONG);
        //stop the verification after 1000ms
        setTimeout(() => {
            vscode.commands.executeCommand('viper.stopVerification');
        }, 1000)

        waitForAbort().then(() => {
            //aborted
            //wait before reverifying
            return true //wait(500);
        }).then(() => {
            //reverify longDuration viper file
            vscode.commands.executeCommand('viper.verify');
            return waitForVerification(SILICON, LONG);
        }).then(() => {
            //verified
            done();
        })
    });

    it("Test not verifying verified files", function (done) {

        this.timeout(6000);

        let simpleAlreadyOpen = path.basename(vscode.window.activeTextEditor.document.fileName) == SIMPLE

        let timer = setTimeout(() => {
            done();
        }, 5000);

        //reopen simple silicon file
        openFile(context, SIMPLE).then(() => {
            if (simpleAlreadyOpen) return true;
            return waitForVerification(SILICON, SIMPLE);
        }).then(() => {
            //simulate context switch by opening non-viper file
            return openFile(context, 'empty.txt');
        }).then(() => {
            return openFile(context, SIMPLE);
        }).then(() => {
            //wait 5000ms for verification
            return waitForVerification(SILICON, SIMPLE);
        }).then(() => {
            //verified
            clearTimeout(timer);
        });
    });

    it("Test zooming", function (done) {

        this.timeout(11000);
        let timer = setTimeout(() => {
            done();
        }, 10000);
        console.log('UnitTest: zoom in')
        vscode.commands.executeCommand("workbench.action.zoomIn").then(() => {
            return wait(500);
        }).then(() => {
            console.log('UnitTest: zoom out')
            return vscode.commands.executeCommand("workbench.action.zoomOut");
        }).then(() => {
            return waitForBackendStarted();
        }).then(() => {
            //verified
            clearTimeout(timer);
        });
    });

    it("Test Viper Tools Update", function (done) {
        this.timeout(50000);
        vscode.commands.executeCommand('viper.updateViperTools');
        //wait until viper tools update done
        waitForViperToolsUpdate().then(() => {
            //viper tools update done
            return waitForBackendStarted();
        }).then(() => {
            //backend ready
            done();
        });
    });

    it("Test simple verification with carbon", function (done) {
        this.timeout(25000);
        //change backend to carbon
        vscode.commands.executeCommand('viper.selectBackend', 'carbon');

        waitForBackendStarted().then(() => {
            //backend ready
            return waitForVerification(CARBON, SIMPLE);
        }).then(() => {
            //verified
            done();
        })
    });

    //must be last test
    it("Test closing all auxilary processes", function (done) {
        this.timeout(5000);
        context.dispose();

        //wait 1000ms
        setTimeout(() => {
            let command: string;
            if (State.isWin) {
                command = `wmic process where 'name="ng.exe" or name="java.exe" or name="Boogie.exe" or name="z3.exe"' get processid`
            } else if (State.isLinux) {
                command = 'pgrep -x -l ng; pgrep -x -l z3; pgrep -x -l java; pgrep -x -l Boogie'
            } else {
                command = 'pgrep -x -l ng; pgrep -x -l z3; pgrep -x -l java; pgrep -x -l Boogie'
            }
            let processesFound = false;
            let pgrep = Common.executer(command);
            pgrep.stdout.on('data', data => {
                let stringData = <string>data;
                if (/^.*?(\d+).*$/.test(stringData)) {
                    processesFound = true;
                }
            });
            pgrep.on('exit', data => {
                if (!processesFound) {
                    done();
                }
            });
        }, 1000);
    });
});

function openFile(context, fileName): Thenable<vscode.TextDocument> {
    return new Promise((resolve, reject) => {
        let filePath = path.join(context.DATA_ROOT, fileName);
        console.log("UNIT TEST: open " + filePath);
        vscode.workspace.openTextDocument(filePath).then(document => {
            vscode.window.showTextDocument(document).then((editor) => {
                resolve(document);
            });
        });
    });
}

class TestContext {

    private PROJECT_ROOT = path.join(__dirname, '../../');

    public DATA_ROOT = path.join(this.PROJECT_ROOT, "src", "test", "data");

    public subscriptions: any[] = [];
    public asAbsolutePath(relativePath: string): string {
        //return path.join(vscode.workspace.rootPath, relativePath);
        return path.join(this.PROJECT_ROOT, relativePath);
    }

    public dispose() {
        myExtension.deactivate();
        this.subscriptions.forEach(disposable => {
            disposable.dispose();
        });
    }
}