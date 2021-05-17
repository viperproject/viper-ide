// // 
// // Note: This example test is leveraging the Mocha test framework.
// // Please refer to their documentation on https://mochajs.org/ for help.
// //

// // The module 'assert' provides assertion methods from node
// import * as assert from 'assert';
// import * as path from 'path';

// // You can import and use all API from the 'vscode' module
// // as well as import your extension to test it
// import * as vscode from 'vscode';
// import * as myExtension from '../extension';
// import { Common } from '../ViperProtocol';
// import { State } from '../ExtensionState';
// import { Helper } from '../Helper';
// import { Log } from '../Log';

// console.log("extension.test.ts");

// let ready = false;
// //let verified = false;


// //Initialize
// State.unitTest = new UnitTestCallback();

// //TestOpeningWorkspace();

// //first test
// StartViperIdeTests();

// //Main tests
// ViperToolsUpdateTest();
// ViperIdeTests();
// ViperIdeStressTests();
// TestVerificationOfAllFilesInWorkspace();

// //last test
// FinishViperIdeTests();

// function log(msg: string) {
//     console.log("[UnitTest " + Log.prettyUptime() + "] " + msg);
// }

// function waitForBackendStarted(backend?: string): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.backendStarted = (b) => {
//             log("Backend " + b + " started");
//             if (!backend || b === backend) {
//                 ready = true;
//                 resolve(true);
//             }
//         }
//     });
// }

// function waitForVerification(fileName: string, backend?: string): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.verificationComplete = (b, f) => {
//             log("Verification Completed: file: " + f + ", backend: " + b);
//             if ((!backend || b === backend) && f === fileName) {
//                 resolve(true);
//             }
//         }
//     });
// }

// function waitForVerificationStart(fileName: string, backend?: string): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.verificationStarted = (b, f) => {
//             log("Verification Started: file: " + f + ", backend: " + b);
//             if ((!backend || b === backend) && f === fileName) {
//                 resolve(true);
//             }
//         }
//     });
// }

// function waitForVerificationOfAllFilesInWorkspace(): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.allFilesVerified = (res) => {
//             resolve(res);
//         }
//     });
// }

// function waitForViperToolsUpdate(): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.viperUpdateComplete = () => { resolve(true); }
//         State.unitTest.viperUpdateFailed = () => { resolve(false); }
//     });
// }

// function waitForAbort(): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.verificationStopped = () => {
//             log("verification stopped");
//             resolve(true);
//         }
//     });
// }

// function waitForLogFile(): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.logFileOpened = () => { resolve(true); }
//     });
// }

// function waitForIdle(): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.ideIsIdle = () => {
//             resolve(true);
//         }
//     });
// }

// function waitForActivated(): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         State.unitTest.activated = () => {
//             resolve(true);
//         }
//     });
// }

// function waitForTimeout(timeout, event: Promise<any>): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         setTimeout(() => {
//             resolve(true);
//         }, timeout)
//         event.then(() => {
//             resolve(false);
//         })
//     });
// }

// function wait(timeout): Promise<boolean> {
//     return new Promise((resolve, reject) => {
//         setTimeout(function () {
//             resolve(true);
//         }, timeout);
//     });
// }

// function StartViperIdeTests() {
//     
// }

// function ViperToolsUpdateTest() {
//     
// }

// function ViperIdeTests() {
//     // Defines a Mocha test suite to group tests of similar kind together
//     describe("ViperIDE tests:", function () {

//      
//         
//     });
// }

// function executeCommand(command: string, args?) {
//     log(command + (args ? ' ' + args : ''));
//     return vscode.commands.executeCommand(command, args);
// }

// function verify() {
//     executeCommand('viper.verify');
// }

// function stopVerification() {
//     executeCommand('viper.stopVerification');
// }

// function selectBackend(backend) {
//     executeCommand('viper.selectBackend', backend);
// }

// function closeAllEditors() {
//     executeCommand('workbench.action.closeAllEditors');
// }

// function checkForInternalErrorBefore(done) {
//     if (internalErrorDetected) {
//         throw new Error("Internal error detected");
//     } else {
//         done();
//     }
// }

// function ViperIdeStressTests() {
//     describe("ViperIDE Stress Tests:", function () {
//         it("1. multiple fast verification requests", function (done) {
//             log("1. multiple fast verification requests");
//             this.timeout(11000);

//             internalErrorDetected = false;
//             let verificationDone = false;

//             let timer = setTimeout(() => {
//                 //the file should be verified exactly once
//                 //no internal error must happen
//                 if (!verificationDone) {
//                     throw new Error("No verification completed");
//                 } else {
//                     checkForInternalErrorBefore(done);
//                 }
//             }, 9000);

//             //submit 10 verification requests
//             for (let i = 0; i < 10; i++) {
//                 verify();
//             }

//             waitForVerification(SIMPLE).then(() => {
//                 verificationDone = true;
//                 return waitForVerification(SIMPLE);
//             }).then(() => {
//                 throw new Error("multiple verifications seen");
//             });
//         });

//         it("2. quickly change backends", function (done) {
//             log("2. quickly change backends");
//             this.timeout(50000);

//             internalErrorDetected = false;

//             selectBackend(CARBON);

//             //submit 10 verification requests
//             for (let i = 0; i < 10; i++) {
//                 selectBackend(SILICON);
//                 selectBackend(CARBON);
//             }

//             wait(500).then(() => {
//                 selectBackend(SILICON);
//                 return waitForVerification(SIMPLE, SILICON);
//             }).then(() => {
//                 checkForInternalErrorBefore(done);
//             });
//         });

//         it("3. quickly start, stop, and restart verification", function (done) {
//             log("3. quickly start, stop, and restart verification");
//             this.timeout(15000);

//             internalErrorDetected = false;

//             verify()
//             stopVerification()
//             verify()
//             waitForVerification(SIMPLE).then(() => {
//                 checkForInternalErrorBefore(done);
//             });
//         });

//         it("4. closing all files right after starting verificaiton", function (done) {
//             log("4. closing all files right after starting verificaiton");
//             this.timeout(6000);

//             internalErrorDetected = false;

//             let timer = setTimeout(() => {
//                 checkForInternalErrorBefore(done);
//             }, 5000);

//             verify()
//             executeCommand('workbench.action.closeAllEditors');
//         });

//         it("Test simple verification with carbon", function (done) {
//             log("Test simple verification with carbon");
//             this.timeout(35000);

//             openFile(SIMPLE).then(() => {
//                 //change backend to carbon
//                 selectBackend(CARBON);
//                 //backend ready
//                 return waitForVerification(SIMPLE, CARBON);
//             }).then(() => {
//                 //verified
//                 selectBackend(SILICON);
//                 //backend ready
//                 return waitForVerification(SIMPLE, SILICON);
//             }).then(() => {
//                 done();
//             })
//         });
//     })
// }

// function TestVerificationOfAllFilesInWorkspace() {
//     describe("Workspace tests:", function () {
//         it("Test Verification of all files in folder", function (done) {
//             log("Test Verification of all files in folder");
//             this.timeout(200000);

//             executeCommand('workbench.action.closeAllEditors');
//             waitForIdle().then(() => {
//                 executeCommand('viper.verifyAllFilesInWorkspace', Helper.uriToString(TestContext.DATA_ROOT));
//                 return waitForVerificationOfAllFilesInWorkspace();
//             }).then((result: any) => {
//                 if (result.verified == result.total) {
//                     done();
//                 } else {
//                     throw new Error("partially verified workspace: (" + result.verified + "/" + result.total + ")");
//                 }
//             })
//         });
//     })
// }

// function TestOpeningWorkspace() {
//     describe("Folder Tests:", function () {
//         it("Test opening a folder", function (done) {
//             log("Test opening a folder");
//             this.timeout(100000);

//             executeCommand('vscode.openFolder', Helper.uriToObject(Common.pathToUri(TestContext.DATA_ROOT))).then(() => {
//                 State.unitTest = new UnitTestCallback();
//                 return wait(10000);
//             }).then(() => {
//                 return waitForBackendStarted();
//             }).then(() => {
//                 done();
//             })
//         });
//     })
// }

// function FinishViperIdeTests() {
//     
// }

// function checkForRunningProcesses(checkJava: boolean, checkBoogie: boolean, checkZ3: boolean): Thenable<boolean> {
//     return new Promise((resolve, reject) => {
//         let command: string;
//         if (State.isWin) {
//             let terms = [];
//             if (checkJava) {
//                 let term = `(CommandLine like "%Viper%" and (`;
//                 let innerTerms = [];
//                 if (checkJava) innerTerms.push('name="java.exe"');
//                 term += innerTerms.join(' or ');
//                 term += '))'
//                 terms.push(term);
//             }
//             if (checkBoogie) terms.push('name="Boogie.exe"');  // TODO use platform-independent binary names
//             if (checkZ3) terms.push('name="z3.exe"');   // TODO use platform-independent binary names
//             command = `wmic process where '` + terms.join(' or ') + `' get ParentProcessId,ProcessId,Name,CommandLine`
//         } else if (State.isMac) {
//             let terms = [];
//             if (checkZ3) terms.push('pgrep -x -l -u "$UID" z3')
//             if (checkJava) terms.push('pgrep -l -u "$UID" -f java.*Viper')
//             if (checkBoogie) terms.push('pgrep -x -l -u "$UID" Boogie');
//             command = terms.join('; ');
//         }
//         else {
//             let terms = [];
//             if (checkZ3) terms.push('pgrep -x -l -u "$(whoami)" z3')
//             if (checkJava) terms.push('pgrep -l -u "$(whoami)" -f java.*Viper')
//             if (checkBoogie) terms.push('pgrep -x -l -u "$(whoami)" Boogie');
//             command = terms.join('; ');
//         }
//         let pgrep = Common.executer(command);
//         pgrep.stdout.on('data', data => {
//             log("Process found: " + data);
//             let stringData = (<string>data).replace(/[\n\r]/g, " ");
//             if (/^.*?(\d+).*/.test(stringData)) {
//                 resolve(false);

//                 throw new Error("Process found");
//             }
//         });
//         pgrep.on('exit', data => {
//             resolve(true);
//         });
//     })
// }

// function checkAssert(seen, expected, message: string) {
//     assert(expected === seen, message + ": Expected: " + expected + " Seen: " + seen);
// }

// function openFile(fileName): Promise<vscode.TextDocument> {
//     return new Promise((resolve, reject) => {
//         let filePath = path.join(TestContext.DATA_ROOT, fileName);
//         log("open " + filePath);
//         vscode.workspace.openTextDocument(filePath).then(document => {
//             vscode.window.showTextDocument(document).then((editor) => {
//                 resolve(document);
//             });
//         });
//     });
// }

// function closeFile(): Thenable<{}> {
//     let filePath = path.join(TestContext.DATA_ROOT, vscode.window.activeTextEditor.document.fileName);
//     log("close " + filePath);
//     return vscode.commands.executeCommand("workbench.action.closeActiveEditor");
// }

// class TestContext {

//     private static PROJECT_ROOT = path.join(__dirname, '../../');

//     public static DATA_ROOT = path.join(TestContext.PROJECT_ROOT, "src", "test", "data");

//     public static subscriptions: any[] = [];
//     public static asAbsolutePath(relativePath: string): string {
//         //return path.join(vscode.workspace.rootPath, relativePath);
//         return path.join(TestContext.PROJECT_ROOT, relativePath);
//     }

//     public static dispose() {
//         myExtension.deactivate();
//         this.subscriptions.forEach(disposable => {
//             disposable.dispose();
//         });
//     }
// }