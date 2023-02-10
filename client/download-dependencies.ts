/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2023 ETH Zurich.
  */

import * as fs from 'fs-extra';
import * as path from 'path';
import { Dependency, FileDownloader, GitHubZipExtractor, InstallerSequence, RemoteZipExtractor, withProgressInWindow, ZipExtractor } from 'vs-verification-toolbox';
import * as yargs from 'yargs';
import * as rimraf from 'rimraf';
import * as assert from 'assert';

const templateDownloadUrl = 'https://github.com/viperproject/viper-ide-deps/zipball/master/';
const templateOutputDir = path.resolve(__dirname, 'dependencies/ViperTools');

const boogieVersionFile = 'boogie-version';
const boogieOutputDir = path.resolve(__dirname, 'dependencies/ViperTools/boogie');
const boogieLinuxDownloadUrl = (version: string) => `https://github.com/viperproject/boogie-builder/releases/download/${version}/boogie-linux.zip`;
const boogieWindowsDownloadUrl = (version: string) => `https://github.com/viperproject/boogie-builder/releases/download/${version}/boogie-win.zip`;
const boogieMacDownloadUrl = (version: string) => `https://github.com/viperproject/boogie-builder/releases/download/${version}/boogie-osx.zip`;

const viperServerVersionFile = 'viperserver-version';
const viperServerOutputDir = path.resolve(__dirname, 'dependencies/ViperTools/backends');
const viperServerDownloadUrl = (version: string) => `https://github.com/viperproject/viperserver/releases/download/${version}/viperserver.jar`;

const z3VersionFile = 'z3-version';
const z3OutputDir = path.resolve(__dirname, 'dependencies/ViperTools/z3');
const z3LinuxDownloadUrl = (version: string) => `https://github.com/Z3Prover/z3/releases/download/z3-${version}/z3-${version}-x64-ubuntu-16.04.zip`;
const z3WindowsDownloadUrl = (version: string) => `https://github.com/Z3Prover/z3/releases/download/z3-${version}/z3-${version}-x64-win.zip`;
const z3MacDownloadUrl = (version: string) => `https://github.com/Z3Prover/z3/releases/download/z3-${version}/z3-${version}-x64-osx-10.14.6.zip`;

const tmpFolder = path.resolve(__dirname, 'tmp');


const LinuxOption = 'linux';
const MacOption = 'mac';
const WindowsOption = 'windows';
type Platform = 'linux' | 'mac' | 'windows';

async function main() {
    const argv = await yargs
      .option('platform', {
        alias: 'p',
        describe: 'Platform for which dependencies should be downloaded',
        choices: [LinuxOption, MacOption, WindowsOption],
        default: () => {
          const isWindows = /^win/.test(process.platform);
          const isLinux = /^linux/.test(process.platform);
          const isMac = /^darwin/.test(process.platform);
          if (isLinux) {
            return LinuxOption;
          } else if (isMac) {
            return MacOption;
          } else if (isWindows) {
            return WindowsOption;
          } else {
            return undefined;
          }
        }
      })
      .help()
      .argv;

    if (!argv.platform) {
      throw new Error(`No platform detected or specified`);
    }

    await new Promise<void>((resolve, reject) => rimraf(templateOutputDir, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    }));

    const boogieVersion = (await fs.readFile(boogieVersionFile)).toString().trim();
    const viperServerVersion = (await fs.readFile(viperServerVersionFile)).toString().trim();
    const z3Version = (await fs.readFile(z3VersionFile)).toString().trim();


    // download template
    const template = new Dependency<"">(
      tmpFolder,
      ["", new GitHubZipExtractor(() => Promise.resolve(templateDownloadUrl), "template", getToken())]);
    await template.install("", true, undefined);
    // content is in tmp/template/viper..../
    const templateDestination = path.resolve(tmpFolder, "template");
    const templateSubfolders = await fs.readdir(templateDestination);
    assert(templateSubfolders.length === 1);
    await fs.move(
      path.resolve(templateDestination, templateSubfolders[0]),
      templateOutputDir);
    await fs.rmdir(templateDestination);


    // download Boogie
    const boogieUrl = getBoogieUrl(argv.platform, boogieVersion);
    const boogieFoldername = "boogie"
    const boogie = new Dependency<"">(
      tmpFolder,
      ["", new GitHubZipExtractor(() => Promise.resolve(boogieUrl), boogieFoldername, getToken())]);
    await boogie.install("", true, undefined);
    const boogieDestination = path.resolve(tmpFolder, boogieFoldername);
    // content is in tmp/boogie/binaries.../
    const boogieSubfolders = await fs.readdir(boogieDestination);
    assert(boogieSubfolders.length === 1);
    await fs.rename(
      path.resolve(boogieDestination, boogieSubfolders[0]),
      path.resolve(boogieOutputDir, "Binaries"));
    await fs.rmdir(boogieDestination);


    // download viperserver
    const viperServerUrl = viperServerDownloadUrl(viperServerVersion);
    const headers: Record<string, string | string[] | undefined> = {
      "Accept": "application/octet-stream"
    };
    const token = getToken();
    if (token) {
      headers["Authorization"] = `token ${token}`;
    }
    const viperServerFilename = "viperserver.jar";
    const viperserver = new Dependency<"">(
      tmpFolder,
      ["", new FileDownloader(viperServerUrl, headers, viperServerFilename)]);
    await viperserver.install("", true, undefined);
    await fs.move(
      path.resolve(tmpFolder, viperServerFilename),
      path.resolve(viperServerOutputDir, viperServerFilename));


    // download z3
    const z3Url = getZ3Url(argv.platform, z3Version);
    const z3Foldername = "z3"
    const z3 = new Dependency<"">(
      tmpFolder,
      ["", new GitHubZipExtractor(() => Promise.resolve(z3Url), z3Foldername, getToken())]);
    await z3.install("", true, undefined);
    const z3Destination = path.resolve(tmpFolder, z3Foldername);
    // content is tmp/z3/binaries.../bin/z3 or tmp/z3/binaries.../bin/z3.exe
    const z3Subfolders = await fs.readdir(z3Destination);
    assert(z3Subfolders.length === 1);
    const z3BinName = argv.platform == WindowsOption ? "z3.exe" : "z3";
    await fs.move(
      path.resolve(z3Destination, z3Subfolders[0], "bin", z3BinName),
      path.resolve(z3OutputDir, "bin", z3BinName));
    await fs.remove(z3Destination);
}

function getToken() {
    return process.env["GITHUB_TOKEN"];
}

function getBoogieUrl(platform: Platform, version: string): string {
  switch (platform) {
    case LinuxOption:
      return boogieLinuxDownloadUrl(version);
    case MacOption:
      return boogieMacDownloadUrl(version);
    case WindowsOption:
      return boogieWindowsDownloadUrl(version);
  }
}

function getZ3Url(platform: Platform, version: string): string {
  switch (platform) {
    case LinuxOption:
      return z3LinuxDownloadUrl(version);
    case MacOption:
      return z3MacDownloadUrl(version);
    case WindowsOption:
      return z3WindowsDownloadUrl(version);
  }
}

main().catch((err) => {
	console.error(`downloading dependencies has ended with an error: ${err}`);
	process.exit(1);
});
