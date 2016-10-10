// 
// PLEASE DO NOT MODIFY / DELETE UNLESS YOU KNOW WHAT YOU ARE DOING  
//
// This file is providing the test runner to use when running extension tests.
// By default the test runner in use is Mocha based.
// 
// You can provide your own test runner if you want to override it by exporting
// a function run(testRoot: string, clb: (error:Error) => void) that the extension
// host can call to run the tests. The test runner is expected to use console.log
// to report the results back to the caller. When the tests are finished, return
// a possible error to the callback or null if none.
var testRunner = require('vscode/lib/testrunner');
// You can directly control Mocha options by uncommenting the following lines
// See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options for more info
testRunner.configure({
    ui: 'tdd',
    useColors: true // colored output from test results
});
module.exports = testRunner;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvdGVzdC9pbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxHQUFHO0FBQ0gscUVBQXFFO0FBQ3JFLEVBQUU7QUFDRiw4RUFBOEU7QUFDOUUsb0RBQW9EO0FBQ3BELEdBQUc7QUFDSCwrRUFBK0U7QUFDL0Usa0ZBQWtGO0FBQ2xGLGlGQUFpRjtBQUNqRixnRkFBZ0Y7QUFDaEYsb0RBQW9EO0FBRXBELElBQUksVUFBVSxHQUFHLE9BQU8sQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBRWxELDZFQUE2RTtBQUM3RSxtR0FBbUc7QUFDbkcsVUFBVSxDQUFDLFNBQVMsQ0FBQztJQUNwQixFQUFFLEVBQUUsS0FBSztJQUNULFNBQVMsRUFBRSxJQUFJLENBQUMsbUNBQW1DO0NBQ25ELENBQUMsQ0FBQztBQUVILE1BQU0sQ0FBQyxPQUFPLEdBQUcsVUFBVSxDQUFDIn0=