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
import { VerificationState } from '../ViperProtocol';
import { Event } from 'typescript.events';
import { State } from '../ExtensionState';
import * as child_process from 'child_process';

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

function waitForBackendReady(): Thenable<boolean> {
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
describe("Viper IDE Tests", function () {
    before(() => {
        context = new TestContext();
        myExtension.initializeUnitTest(function (state) {
            executionStates.push(state);
            if (state.event == "BackendReady") {
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


    it("Language Detection and Backend Ready Test", function (done) {
        this.timeout(10000);

        openFile(context, SIMPLE).then(document => {
            if (document.languageId != 'viper') {
                throw new Error("The language of viper file was not detected correctly: should: viper, is: " + document.languageId);
            }
            return waitForBackendReady();
        }).then(() => {
            console.log("UnitTest: BackendReady");
            done();
        });
    });

    it("Test simple verification with silicon", function (done) {
        this.timeout(10000);
        //3. viper file should verify with silicon 
        waitForVerification(SILICON, SIMPLE).then(() => {
            //verified
            console.log("UnitTest: silicon verification complete");
            done();
        });
    });

/*
    it("Test Abort", function (done) {
        this.timeout(10000);

        //open a file that takes longer
        openFile(context, LONG);
        //stop the verification after 1000ms
        setTimeout(() => {
            vscode.commands.executeCommand('extension.stopVerification');
        }, 1000)

        waitForAbort().then(() => {
            //aborted
            //wait before reverifying
            return wait(500);
        }).then(() => {
            //reverify longDuration viper file
            vscode.commands.executeCommand('extension.verify');
            return waitForVerification(SILICON, LONG);
        }).then(() => {
            //verified
            done();
        })
    });

    it("Test not verifying verified files", function (done) {

        this.timeout(10000);

        let timer;
        let simpleAlreadyOpen = path.basename(vscode.window.activeTextEditor.document.fileName) == SIMPLE

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
            timer = setTimeout(() => {
                done();
            }, 5000);

            return waitForVerification(SILICON, SIMPLE);
        }).then(() => {
            //verified
            clearTimeout(timer);
        });
    });


    it("Test Viper Tools Update", function (done) {
        this.timeout(40000);
        vscode.commands.executeCommand('extension.updateViperTools');
        //wait until viper tools update done
        waitForViperToolsUpdate().then(() => {
            //viper tools update done
            return waitForBackendReady();
        }).then(() => {
            //backend ready
            return waitForVerification(SILICON, SIMPLE);
        }).then(() => {
            //verified
            done();
        });
    });

    it("Test simple verification with carbon", function (done) {
        this.timeout(10000);
        //change backend to carbon
        vscode.commands.executeCommand('extension.selectBackend', 'carbon');

        waitForBackendReady().then(() => {
            //backend ready
            return waitForVerification(CARBON, SIMPLE);
        }).then(() => {
            //verified
            done();
        })
    });
*/
    after(() => {
        context.dispose();
    })

    // //last test
    // it("Dispose test"), function (done) {
    //     //dispose the extension
    //     context.dispose();
    //     //wait 1000ms and look for deamon processes
    //     setTimeout(() => {
    //         //kill all ng z3 and java processes, make sure none are found
    //         return new Promise((resolve, reject) => {
    //             let killCommand: string;
    //             if (State.isWin) {
    //                 killCommand = "taskkill /F /T /im ng.exe & taskkill /F /T /im z3.exe";
    //             } else if (State.isLinux) {
    //                 killCommand = "pkill -c ng; pkill -c z3";
    //             } else {
    //                 killCommand = "pkill ng; pkill z3";
    //             }
    //             child_process.exec(killCommand).on("exit", (data) => {
    //                 console.log(data);
    //             });
    //         });
    //     }, 1000)
    // }

    // test("Tautology Test", (done) => {
    //     assert (true);
    //     done();
    // });
    // test("Failing Test", (done) => {
    //     assert (false);
    //     done();
    // });


    //debugger tests
    // suite('launch', () => {
    // 	test('should run program to the end', () => {

    // 		const PROGRAM = path.join(DATA_ROOT, 'test.md');

    // 		return Promise.all([
    // 			dc.configurationSequence(),
    // 			dc.launch({ program: PROGRAM }),
    // 			dc.waitForEvent('terminated')
    // 		]);
    // 	});

    // 	test('should stop on entry', () => {

    // 		const PROGRAM = Path.join(DATA_ROOT, 'test.md');
    // 		const ENTRY_LINE = 1;

    // 		return Promise.all([
    // 			dc.configurationSequence(),
    // 			dc.launch({ program: PROGRAM, stopOnEntry: true }),
    // 			dc.assertStoppedLocation('entry', { line: ENTRY_LINE } )
    // 		]);
    // 	});
    // });
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
        this.subscriptions.forEach(disposable => {
            disposable.dispose();
        })
    }

    public static eventEmitter = new Event();
}