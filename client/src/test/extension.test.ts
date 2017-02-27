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
let simpleSiliconVerifiedCallback;
let abortCallback;
let longSiliconVerifiedCallback;
let carbonVerifiedCallback;


// Defines a Mocha test suite to group tests of similar kind together
describe("Viper IDE Tests", function () {
    this.timeout(30000);

    before(() => {
        context = new TestContext();
        myExtension.initializeUnitTest(function (state) {
            executionStates.push(state);
            if (state.event == "BackendReady") {
                backendReadyCallback();
                ready = true;
            }
            else if (ready && state.event == "VerificationComplete") {
                if (state.backend == "silicon") {
                    if (state.fileName == "simple.sil") {
                        simpleSiliconVerifiedCallback();
                    } else if (state.fileName == "longDuration.vpr") {
                        longSiliconVerifiedCallback();
                    }
                } else if (state.backend = "carbon" && state.fileName == "simple.sil") {
                    carbonVerifiedCallback();
                }
                console.log("UnitTest: " + state.fileName + " verified with " + state.backend);
            }
            else if (state.event == 'VerificationStopped') {
                abortCallback();
            }
        });
    });


    it("Language Detection and Backend Ready Test", function (done) {
        //1. Open simple.sil
        openViperFile(context, "simple.sil").then(document => {
            if (document.languageId != 'viper') {
                throw new Error("The language of simple.sil was not detected correctly: should: viper, is: " + document.languageId);
            }
        });
        //2. the backend shoud start up
        backendReadyCallback = () => {
            backendReadyCallback = () => { };
            console.log("UnitTest: BackendReady");
            done();
        }
    });

    it("Test simple verification with silicon", function (done) {
        //3. simple.sil should verify with silicon 
        simpleSiliconVerifiedCallback = () => {
            console.log("UnitTest: silicon verification complete");
            done();
        };
    });

    it("Test Abort", function (done) {
        //4. open a file that takes longer
        openViperFile(context, "longDuration.vpr");
        //5. stop the verification after 1000ms
        setTimeout(() => {
            vscode.commands.executeCommand('extension.stopVerification');
        }, 1000)

        abortCallback = () => {
            abortCallback = () => { };
            //reverify longDuration.vpr
            vscode.commands.executeCommand('extension.verify');
            //the verification should succeed
            longSiliconVerifiedCallback = () => {
                done();
            }
        }
    });

    it("Test simple verification with carbon", function (done) {
        //reopen simple silicon file
        openViperFile(context, "simple.sil");
        //change backend to carbon
        vscode.commands.executeCommand('extension.selectBackend', 'carbon');

        carbonVerifiedCallback = () => {
            console.log("UnitTest: carbon verification complete");
            done();
        };
    });

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

    /*test("Verification Test", (done) => {
        let context: any = new TestContext();
        let unitTestPromise = myExtension.initializeUnitTest(state => {
            executionStates.push(state);
            if (!ready && state == "BackendReady") {
                ready = true;
            }
            if (ready && !verified && state == "VerificationCompleted") {
                verified = true;
                done();
                context.dispose();
            }
        });
    });
    */



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

function openViperFile(context, fileName): Thenable<vscode.TextDocument> {
    return new Promise((resolve, reject) => {
        let viperFile = path.join(context.DATA_ROOT, fileName);
        vscode.workspace.openTextDocument(viperFile).then(document => {
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