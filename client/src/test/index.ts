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

import { assert } from 'console';
import * as fs from 'fs';
import * as glob from 'glob';
import * as Mocha from 'mocha';
import * as path from 'path';

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const TESTS_ROOT = __dirname;
const DATA_ROOT = path.join(PROJECT_ROOT, "src", "test", "data");

export async function run(): Promise<void> {
    // iterate over different settings and execute the test suite for each
    // settings file.

    console.info("Reading list of settings...");
	const settings_list = fs.readdirSync(path.join(DATA_ROOT, "settings")).sort();
	assert(settings_list.length > 0, "There are no settings to test");

    let firstIteration: boolean = true;
    for (const settings_file of settings_list) {
		console.info(`Testing with settings '${settings_file}'...`);
        // first settings file gets copied by `runTest`
        if (!firstIteration) {
            // shutting down and activating the extension is done by TestHelper.ts
            const settings_path = path.join(DATA_ROOT, "settings", settings_file);
            const workspace_path = process.env["VIPER_IDE_WORKSPACE_PATH"];
            const workspace_vscode_path = path.join(workspace_path, ".vscode");
	        const workspace_settings_path = path.join(workspace_vscode_path, "settings.json");
            fs.copyFileSync(settings_path, workspace_settings_path);
            console.log(`settings file copied from ${settings_path} to ${workspace_settings_path}`);
        }
        firstIteration = false;

        await runTests();
	}
}

async function runTests(): Promise<void> {
    // Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		// Installing and starting Viper might take some minutes
        timeout: 600_000, // ms
        color: true,
	});

    const filenames = await getTestSuiteFilenames();
    filenames.forEach(filename => mocha.addFile(path.resolve(TESTS_ROOT, filename)));

    const failures: number = await new Promise(resolve => mocha.run(resolve));

    mocha.dispose();

    if (failures > 0) {
        throw new Error(`${failures} tests failed.`);
    }
}

async function getTestSuiteFilenames(): Promise<string[]> {
	return new Promise((resolve, reject) =>
        glob(
            "**/*.test.js",
            {
                cwd: TESTS_ROOT,
            },
            (err, result) => {
                if (err) reject(err)
                else resolve(result)
            }
        )
    );
}
