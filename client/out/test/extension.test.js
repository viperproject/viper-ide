// 
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//
"use strict";
const path = require('path');
// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
const vscode = require('vscode');
const myExtension = require('../extension');
let ready = false;
let verified = false;
let executionStates = [];
// Defines a Mocha test suite to group tests of similar kind together
suite("Viper IDE Tests", () => {
    test("Client Server Connection Test", (done) => {
        let context = new TestContext();
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
    constructor() {
        this.PROJECT_ROOT = path.join(__dirname, '../../');
        this.DATA_ROOT = path.join(this.PROJECT_ROOT, "src", "test", "data");
        this.subscriptions = [];
    }
    asAbsolutePath(relativePath) {
        //return path.join(vscode.workspace.rootPath, relativePath);
        return path.join(this.PROJECT_ROOT, relativePath);
    }
    dispose() {
        this.subscriptions.forEach(disposable => {
            disposable.dispose();
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdGVzdC9leHRlbnNpb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxHQUFHO0FBQ0gsa0VBQWtFO0FBQ2xFLHdFQUF3RTtBQUN4RSxFQUFFOztBQUlGLE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBRTdCLDBEQUEwRDtBQUMxRCw4Q0FBOEM7QUFDOUMsTUFBWSxNQUFNLFdBQU0sUUFBUSxDQUFDLENBQUE7QUFDakMsTUFBWSxXQUFXLFdBQU0sY0FBYyxDQUFDLENBQUE7QUFJNUMsSUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBQ2xCLElBQUksUUFBUSxHQUFHLEtBQUssQ0FBQztBQUVyQixJQUFJLGVBQWUsR0FBYSxFQUFFLENBQUM7QUFFbkMscUVBQXFFO0FBQ3JFLEtBQUssQ0FBQyxpQkFBaUIsRUFBRTtJQUNyQixJQUFJLENBQUMsK0JBQStCLEVBQUUsQ0FBQyxJQUFJO1FBQ3ZDLElBQUksT0FBTyxHQUFRLElBQUksV0FBVyxFQUFFLENBQUM7UUFDckMsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsU0FBUyxFQUFFLFlBQVksQ0FBQyxDQUFDO1FBQzNELFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLEtBQUs7WUFDakMsZUFBZSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM1QixFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssSUFBSSxLQUFLLElBQUksY0FBYyxDQUFDLENBQUMsQ0FBQztnQkFDcEMsS0FBSyxHQUFHLElBQUksQ0FBQztnQkFDWixJQUFJLEVBQUUsQ0FBQztnQkFDUCxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdkIsQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLFFBQVEsSUFBSSxLQUFLLElBQUksdUJBQXVCLENBQUMsQ0FBQyxDQUFDO2dCQUN6RCxRQUFRLEdBQUcsSUFBSSxDQUFDO2dCQUNoQixJQUFJLEVBQUUsQ0FBQztnQkFDUCxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdEIsQ0FBQztZQUNELG1CQUFtQjtZQUNuQixVQUFVO1FBQ2QsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNKLFdBQVc7UUFDWCxNQUFNLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRO1lBQ3RELE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDN0MsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDLENBQUMsQ0FBQztJQUVILHFDQUFxQztJQUNyQyxxQkFBcUI7SUFDckIsY0FBYztJQUNkLE1BQU07SUFDTixtQ0FBbUM7SUFDbkMsc0JBQXNCO0lBQ3RCLGNBQWM7SUFDZCxNQUFNO0lBR04sZ0JBQWdCO0lBQ2hCLDBCQUEwQjtJQUMxQixpREFBaUQ7SUFFakQscURBQXFEO0lBRXJELHlCQUF5QjtJQUN6QixpQ0FBaUM7SUFDakMsc0NBQXNDO0lBQ3RDLG1DQUFtQztJQUNuQyxRQUFRO0lBQ1IsT0FBTztJQUVQLHdDQUF3QztJQUV4QyxxREFBcUQ7SUFDckQsMEJBQTBCO0lBRTFCLHlCQUF5QjtJQUN6QixpQ0FBaUM7SUFDakMseURBQXlEO0lBQ3pELDhEQUE4RDtJQUM5RCxRQUFRO0lBQ1IsT0FBTztJQUNQLE1BQU07QUFDVixDQUFDLENBQUMsQ0FBQztBQUVIO0lBQUE7UUFFWSxpQkFBWSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRS9DLGNBQVMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxZQUFZLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztRQUVoRSxrQkFBYSxHQUFVLEVBQUUsQ0FBQztJQVdyQyxDQUFDO0lBVlUsY0FBYyxDQUFDLFlBQW9CO1FBQ3RDLDREQUE0RDtRQUM1RCxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFTSxPQUFPO1FBQ1YsSUFBSSxDQUFDLGFBQWEsQ0FBQyxPQUFPLENBQUMsVUFBVTtZQUNqQyxVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDekIsQ0FBQyxDQUFDLENBQUE7SUFDTixDQUFDO0FBQ0wsQ0FBQztBQUFBIn0=