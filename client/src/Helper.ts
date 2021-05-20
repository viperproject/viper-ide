/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 
'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { Log } from './Log';
import * as path from 'path';
import * as locate_java_home from 'locate-java-home';
import * as child_process from 'child_process';
import { AdvancedFeatureSettings, LogLevel, PlatformDependentPath, ViperSettings } from './ViperProtocol';
import { GitHubReleaseAsset } from 'vs-verification-toolbox';
import { IJavaHomeInfo } from 'locate-java-home/js/es5/lib/interfaces';
const globToRexep = require('glob-to-regexp');

export class Helper {

    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);

    public static viperFileEndings: string[];

    public static loadViperFileExtensions() {
        this.viperFileEndings = ["*.vpr", "*.sil"];
        let fileAssociations = vscode.workspace.getConfiguration("files").get("associations", []);
        for (var pattern in fileAssociations) {
            let language = fileAssociations[pattern];
            if (language == 'viper') {
                Log.log("Additional file associations detected: " + language + " -> " + pattern, LogLevel.Debug);
                this.viperFileEndings.push(pattern);
            }
        }
    }

    public static isNightly(): boolean {
        return Helper.getViperSettings().buildVersion == "nightly";
    }

    private static getPlatformPath(paths: string | PlatformDependentPath): string {
        if (typeof paths === "string") return paths;
        if (Helper.isWin && paths.windows) return paths.windows;
        if (Helper.isLinux && paths.linux) return paths.linux;
        if (Helper.isMac && paths.mac) return paths.mac;
        return null;
    }
    /*
    private static getPlatformPaths(paths: string | string[] | PlatformDependentPath | PlatformDependentListOfPaths): string[] {
        if (typeof paths === "string") return [paths];
        if (Array.isArray(paths)) return paths;
        let platformSpecificPaths: string | string[] = null;
        if (Helper.isWin && paths.windows) {
            platformSpecificPaths = paths.windows;
        } else if (Helper.isLinux && paths.linux) {
            platformSpecificPaths = paths.linux;
        } else if (Helper.isMac && paths.mac) {
            platformSpecificPaths = paths.mac;
        }
        if (platformSpecificPaths != null) {
            if (Array.isArray(platformSpecificPaths)) {
                return platformSpecificPaths;
            } else {
                return [platformSpecificPaths];
            }
        }
        return null;
    }
    */
    /**
     * Specifies the Path added by the zip extractor.
     */
    private static extractionAddition(): string {
        return Helper.isWin ? "\\ViperTools" : "/ViperTools"
    }

    private static getJavaHome(): Promise<IJavaHomeInfo> {
        return new Promise((resolve, reject) => {
            try {
                const options = {
                    version: ">=1.8",
                    mustBe64Bit: true,
                    mustBeJDK: true // we currently disallow JREs
                };
                Helper.log("Searching for Java home...");
                locate_java_home.default(options, (err, javaHomes) => {
                    if (err) {
                        Helper.log(err.message);
                        reject(err.message);
                    } else {
                        if (!Array.isArray(javaHomes) || javaHomes.length === 0) {
                            const msg = "Could not find a 64-bit JDK with at least version 1.8. "
                                + "Please install one and/or manually specify it in the Viper settings.";
                            Helper.log(msg);
                            vscode.window.showErrorMessage(msg);
                            reject(msg);
                        } else {
                            const javaHome = javaHomes[0];
                            Helper.log(`Using Java home ${JSON.stringify(javaHome, null, 2)}`);
                            resolve(javaHome);
                        }
                    }
                });
            } catch (err) {
                Helper.log(err.message);
                reject(err.message);
            }
        });
    }

    /**
     * Helper functions to get Paths of the dependencies.
     */
    private static getViperSettings(): ViperSettings {
        let viperSettings: unknown = vscode.workspace.getConfiguration("viperSettings");
        return <ViperSettings> viperSettings;
    }

    public static getAdvancedFeatureSettings(): AdvancedFeatureSettings {
        return Helper.getViperSettings().advancedFeatures;
    }

    public static areAdvancedFeaturesEnabled(): boolean {
        return Helper.getAdvancedFeatureSettings().enabled;
    }
    
    public static async getJavaPath(): Promise<string> {
        const configuredJavaBinary = Helper.getViperSettings().javaSettings.javaBinary;
        if (configuredJavaBinary == null || configuredJavaBinary == "") {
            // no java binary configured, search for it:
            const javaHome = await Helper.getJavaHome();
            return javaHome.executables.java;
        } else {
            return configuredJavaBinary;
        }
    }
    
    public static getServerProcessArgs(serverBinary: string): string[] {
        const configuredArgString = Helper.getViperSettings().javaSettings.customArguments
            .replace("$serverBinary$", serverBinary);
        return configuredArgString.split(" ");
    }

    /**
     * Gets Viper Tools Provider URL as stored in the settings.
     * Note that the returned URL might be invalid or correspond to one of the "special" URLs as specified in the README (e.g. to download a GitHub release asset)
     */
    public static getViperToolsProvider(nightly: boolean = false): string {
        const preferences = Helper.getViperSettings().preferences;
        return Helper.getPlatformPath(nightly ? preferences.nightlyViperToolsProvider : preferences.stableViperToolsProvider);
    }

    public static getLogLevelSettings(): number {
        const preferences = Helper.getViperSettings().preferences;
        return preferences.logLevel;
    }

    public static getShowProgressSettings(): boolean {
        const preferences = Helper.getViperSettings().preferences;
        return preferences.showProgress;
    }

    public static getAutoVerifyAfterBackendChangeSettings(): boolean {
        const preferences = Helper.getViperSettings().preferences;
        return preferences.autoVerifyAfterBackendChange;
    }

    public static getAutoSaveSettings(): boolean {
        const preferences = Helper.getViperSettings().preferences;
        return preferences.autoSave;
    }

    /**
     * Takes an url as input and checks whether it's a special URL to a GitHub release asset.
     * This function returns an object that indicates with the `isGitHubAsset` flag whether it is a GitHub asset or not. In addition, the `getUrl` function can
     * be called to lazily construct the URL for downloading the asset.
     */
    public static parseGitHubAssetURL(url: string): {isGitHubAsset: boolean, getUrl: () => Promise<string>} {
        const token = this.getGitHubToken();
        const latestRe = /^github.com\/([^/]+)\/([^/]+)\/releases\/latest\?asset-name=([^/?&]+)(&include-prereleases|)$/;
        const tagRe = /^github.com\/([^/]+)\/([^/]+)\/releases\/tags\/([^/?]+)\?asset-name=([^/?&]+)$/;
        const latestReMatches = url.match(latestRe);
        if (latestReMatches != null) {
            // match was found
            const owner = latestReMatches[1];
            const repo = latestReMatches[2];
            const assetName = latestReMatches[3];
            const includePrereleases = latestReMatches[4] === "&include-prereleases";
            const resolveGitHubUrl = () => GitHubReleaseAsset.getLatestAssetUrl(owner, repo, assetName, includePrereleases, token)
                .catch(Helper.rethrow(`Retrieving asset URL of latest GitHub release has failed `
                    + `(owner: '${owner}', repo: '${repo}', asset-name: '${assetName}', include-prereleases: ${includePrereleases})`));
            return {
                isGitHubAsset: true,
                getUrl: resolveGitHubUrl,
            };
        }
        const tagReMatches = url.match(tagRe);
        if (tagReMatches != null) {
            // match was found
            const owner = tagReMatches[1];
            const repo = tagReMatches[2];
            const tag = tagReMatches[3];
            const assetName = tagReMatches[4];
            const resolveGitHubUrl = () => GitHubReleaseAsset.getTaggedAssetUrl(owner, repo, assetName, tag, token)
                .catch(Helper.rethrow(`Retrieving asset URL of a tagged GitHub release has failed `
                    + `(owner: '${owner}', repo: '${repo}', tag: '${tag}', asset-name: '${assetName}')`));
            return {
                isGitHubAsset: true,
                getUrl: resolveGitHubUrl,
            };
        }
        // no match, return unmodified input URL:
        return {
            isGitHubAsset: false,
            getUrl: () => Promise.resolve(url),
        };
    }

    public static getGitHubToken(): string {
        return process.env["GITHUB_TOKEN"];
    }

    /**
     * Get Location where Gobra Tools will be installed.
     */
    public static getViperToolsPath(): string {
        const viperToolsPaths = Helper.getViperSettings().paths.viperToolsPath;
        return Helper.getPlatformPath(viperToolsPaths);
    }

    public static getServerJarPath(nightly: boolean = false): string {
        const serverJarPaths = Helper.getViperSettings().viperServerSettings.serverJar;
        const platformServerJarPath = Helper.getPlatformPath(serverJarPaths);
        if (platformServerJarPath != null) {
            return platformServerJarPath.replace("$viperTools$", Helper.getViperToolsPath() + Helper.extractionAddition());
        }
        return null;
    }

    public static getBoogiePath(nightly: boolean = false): string {
        const boogiePaths = Helper.getViperSettings().paths.boogieExecutable;
        const platformBoogiePath = Helper.getPlatformPath(boogiePaths);
        if (platformBoogiePath != null) {
            return platformBoogiePath.replace("$viperTools$", Helper.getViperToolsPath() + Helper.extractionAddition());
        }
        return null;
    }

    public static getZ3Path(nightly: boolean = false): string {
        const z3Paths = Helper.getViperSettings().paths.z3Executable;
        const platformZ3Path = Helper.getPlatformPath(z3Paths)
        if (platformZ3Path != null) {
            return platformZ3Path.replace("$viperTools$", Helper.getViperToolsPath() + Helper.extractionAddition());
        }
        return null;
    }

    public static attachToViperServer(): boolean {
        return Helper.getViperSettings().viperServerSettings.viperServerPolicy === "attach";
    }

    public static getViperServerAddress(): string { 
        return Helper.getViperSettings().viperServerSettings.viperServerAddress;
    }

    public static getViperServerPort(): number {
        return Helper.getViperSettings().viperServerSettings.viperServerPort;
    }

    //unused
    public static makeSureFileExists(fileName: string) {
        try {
            if (!fs.existsSync(fileName)) {
                fs.createWriteStream(fileName).close();
            }
            fs.accessSync(fileName);
        } catch (e) {
            Log.error("Error making sure " + fileName + " exists. Are you missing access permission? " + e);
        }
    }

    public static isViperSourceFile(uri: string | vscode.Uri): boolean {
        if (!uri) return false;
        let uriString = this.uriToString(uri);
        return this.viperFileEndings.some(globPattern => {
            let regex = globToRexep(globPattern);
            return regex.test(uriString);
        });
    }

    public static uriEquals(a: string | vscode.Uri, b: string | vscode.Uri) {
        if (!a || !b) return false;
        return this.uriToString(a) == this.uriToString(b);
    }

    public static uriToString(uri: string | vscode.Uri): string {
        if (!uri) return null;
        if (typeof uri === "string") {
            return uri;
        } else {
            return uri.toString();
        }
    }

    public static uriToObject(uri: string | vscode.Uri): vscode.Uri {
        if (!uri) return null;
        if (typeof uri === "string") {
            return vscode.Uri.parse(uri);
        } else {
            return uri;
        }
    }

    ///might be null
    public static getActiveFileUri(): vscode.Uri {
        if (vscode.window.activeTextEditor) {
            return vscode.window.activeTextEditor.document.uri;
        } else {
            return null;
        }
    }

    public static formatSeconds(time: number): string {
        if (!time) return "0 seconds";
        return time.toFixed(1) + " seconds";
    }

    public static formatProgress(progress: number): string {
        if (progress <= 0) return "0%";
        return progress.toFixed(0) + "%";
    }

    public static spawn(
        cmd: string, 
        args?: string[] | undefined, 
        options?: child_process.SpawnOptionsWithoutStdio | undefined
    ): Promise<Output> {
        Helper.log(`Viper-IDE: Running '${cmd} ${args ? args.join(' ') : ''}'`);
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
    
            const proc = child_process.spawn(cmd, args, options);
    
            proc.stdout.on('data', (data) => stdout += data);
            proc.stderr.on('data', (data) => stderr += data);
            proc.on('close', (code) => {
                Helper.log("┌──── Begin stdout ────┐");
                Helper.log(stdout);
                Helper.log("└──── End stdout ──────┘");
                Helper.log("┌──── Begin stderr ────┐");
                Helper.log(stderr);
                Helper.log("└──── End stderr ──────┘");
                resolve({ stdout, stderr, code });
            });
            proc.on('error', (err) => {
                Helper.log("┌──── Begin stdout ────┐");
                Helper.log(stdout);
                Helper.log("└──── End stdout ──────┘");
                Helper.log("┌──── Begin stderr ────┐");
                Helper.log(stderr);
                Helper.log("└──── End stderr ──────┘");
                Helper.log(`Error: ${err}`);
                reject(err);
            });
        });
    }

    public static rethrow(msg: string): (originalReason: any) => PromiseLike<never> {
        return (originalReason: any) => {
            Helper.log(originalReason);
            throw new Error(`${msg} (reason: '${originalReason}')`);
        }
    }

    private static _channel: vscode.OutputChannel;
    public static log(msg: string): void {
        console.log(`[Viper-IDE] ${msg}`);
        if (!this._channel) {
            this._channel = vscode.window.createOutputChannel("Viper-IDE");
        }
        this._channel.appendLine(msg);
    }

    private static _serverChannel: vscode.OutputChannel;
    public static logServer(msg: string): void {
        console.log(`[Viper-IDE - Server] ${msg}`);
        if (!this._serverChannel) {
            this._serverChannel = vscode.window.createOutputChannel("Viper-IDE - Server");
        }
        this._serverChannel.appendLine(msg);
    }
}

export interface Output {
    stdout: string;
    stderr: string;
    code: number;
}
