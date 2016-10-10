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
import {VerificationState} from '../ViperProtocol';

let ready = false;
let verified = false;

let executionStates: string[] = [];

// Defines a Mocha test suite to group tests of similar kind together
suite("Viper IDE Tests", () => {
    test("Client Server Connection Test", (done) => {
        let context: any = new TestContext();
        let viperFile = path.join(context.DATA_ROOT, "simple.sil");
        myExtension.initializeUnitTest((state => {
            executionStates.push(state);
            if (!ready && state == "BackendReady") {
                ready = true;
                 done();
                 context.dispose();
            }
            if (ready && !verified && state == "VerificationCompleted") {
                verified = true;
                done();
                context.dispose();
            }
            // assert(success);
            // done();
        }));
        //open file
        vscode.workspace.openTextDocument(viperFile).then(document => {
            vscode.window.showTextDocument(document);
        });
    });

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
}