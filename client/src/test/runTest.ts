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

import * as fs from "fs";
import * as tmp from "tmp";
import * as path from 'path';
import * as yargs from 'yargs';
import { runTests } from 'vscode-test';
import { assert } from "console";

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const DATA_ROOT = path.join(PROJECT_ROOT, "src", "test", "data");

async function main() {
	const argv = yargs
		.option('server', {
			description: 'Path to the ViperServer JAR file that should be used instead of the one specified in the settings',
            type: 'string',
		})
		.option('ignoreServerBackwardCompatibility', {
			description: 'If set, skips the test cases that use the ViperServer JAR from the latest nightly or stable release',
			type: 'boolean',
		})
        .help() // show help if `--help` is used
        .argv;

	// The folder containing the Extension Manifest package.json
	// Passed to `--extensionDevelopmentPath`
	const extensionDevelopmentPath = PROJECT_ROOT;

	// The path to the extension test script
	// Passed to --extensionTestsPath
	const extensionTestsPath = path.resolve(__dirname, 'index');

	// Download VS Code, unzip it and run the integration test
	console.info("Reading VS Code version...");
	const vscode_version = fs.readFileSync(path.join(DATA_ROOT, "vscode-version")).toString().trim();
	console.info(`Tests will use VS Code version '${vscode_version}'`);
	console.info("Reading list of settings...");
	const settings_list = fs.readdirSync(path.join(DATA_ROOT, "settings")).sort();
	assert(settings_list.length > 0, "There are no settings to test");
	
	for (const settings_file of settings_list) {
		const additionalSettings: Map<string, string>[] = [];
		if (!argv.ignoreServerBackwardCompatibility) {
			additionalSettings.push(new Map());
		}
		if (argv.server) {
			const serverSettings = new Map([
				["viperSettings.viperServerSettings.serverJars.windows", argv.server],
				["viperSettings.viperServerSettings.serverJars.linux", argv.server],
				["viperSettings.viperServerSettings.serverJars.mac", argv.server]]
			);
			additionalSettings.push(serverSettings);
		}
		
		for (const addSettings of additionalSettings) {
			console.info(`Testing with settings '${settings_file}' and additional settings ${mapToString(addSettings)}...`);
			const tmpWorkspace = tmp.dirSync({ unsafeCleanup: true });
			try {
				// Prepare the workspace with the settings
				const settings_path = path.join(DATA_ROOT, "settings", settings_file);
				const workspace_vscode_path = path.join(tmpWorkspace.name, ".vscode");
				const workspace_settings_path = path.join(workspace_vscode_path, "settings.json");
				fs.mkdirSync(workspace_vscode_path);
				fs.copyFileSync(settings_path, workspace_settings_path);
				// modify settings file:
				addOptionsToSettingsFile(workspace_settings_path, addSettings);

				// get environment variables
				const env: NodeJS.ProcessEnv = process.env;
				// add additional environment variables to
				// - auto accept confirmation messages of Viper-IDE
				// - wipe global storage path to force install Viper Tools after each activation
				env.VIPER_IDE_ASSUME_YES = "1";
				env.VIPER_IDE_CLEAN_INSTALL = "1";
				
				// Run the tests in the workspace
				await runTests({
					version: vscode_version,
					extensionDevelopmentPath,
					extensionTestsPath,
					// note that passing environment variables seems to only work when invoking the tests via CLI
					extensionTestsEnv: env,
					// Disable any other extension
					launchArgs: ["--disable-extensions", tmpWorkspace.name],
				});
			} finally {
				try {
					tmpWorkspace.removeCallback();
				} catch (e) {
					console.warn(`cleaning temporary directory has failed with error ${e}`);
				}
			}
		}
	}
}

function addOptionsToSettingsFile(filepath: string, additionalOptions: Map<string, string>) {
	if (additionalOptions.size == 0) {
		return;	
	}

	const fileContent = fs.readFileSync(filepath).toString();
	try {
		const json = JSON.parse(fileContent);
		additionalOptions.forEach((value, key) => json[key] = value);
		const newContent = JSON.stringify(json);
		fs.writeFileSync(filepath, newContent);
	} catch(e) {
		console.error(`parsing settings ${filepath} has failed`, e);
	}
}

function mapToString<K, V>(map: Map<K, V>) {
	const entries = map.entries();
	return Array
	  .from(entries, ([k, v]) => `\n  ${k}: ${v}`)
	  .join("") + "\n";
  }

main().catch((err) => {
	console.error(`main function has ended with an error: ${err}`);
	process.exit(1);
});
