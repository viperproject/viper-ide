// this file is taken from the helloworld-test-sample from https://github.com/microsoft/vscode-extension-samples

// Copyright (c) Microsoft Corporation
//
// All rights reserved. 
//
// MIT License
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation 
// files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy,
// modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software 
// is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
// OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS 
// BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT 
// OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import {glob} from 'glob';
import Mocha from 'mocha';
import * as path from 'path';

const TESTS_ROOT = __dirname;

/** 
 * executes all test suites in the current workspace. It is assumed that 
 * the workspace has been prepared (e.g. by placing a certain settings file)
 */
export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        // Installing and starting Viper might take some minutes
        timeout: 300_000, // ms
        color: true,
    });

    const filenames = await getTestSuiteFilenames();
    
    // Due to how setup works, we have to do the tests in order.
    // Glob is not consistent in the ordering, so we sort ourselves.
    filenames.sort();

    filenames.forEach(filename => mocha.addFile(path.resolve(TESTS_ROOT, filename)));

    const failures: number = await new Promise(resolve => mocha.run(resolve));

    mocha.dispose();

    if (failures > 0) {
        throw new Error(`${failures} tests failed.`);
    }
}

async function getTestSuiteFilenames(): Promise<string[]> {
    return glob(
        "**/*.test.js",
        {
            cwd: TESTS_ROOT,
        }
    )
}
