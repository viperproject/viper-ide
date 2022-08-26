/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2020 ETH Zurich.
  */
 
'use strict';

import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as globToRexep from 'glob-to-regexp';
import * as path from 'path';
import * as os from 'os';
import { Location } from 'vs-verification-toolbox';
import * as locate_java_home from '@viperproject/locate-java-home';
import { IJavaHomeInfo } from '@viperproject/locate-java-home/js/es5/lib/interfaces';
import { Log } from './Log';
import { LogLevel, PlatformDependentListOfPaths, PlatformDependentPath } from './ViperProtocol';

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

    public static getConfiguration(setting: string): any {
        return vscode.workspace.getConfiguration("viperSettings").get(setting);
    }


    public static areAdvancedFeaturesEnabled(): boolean {
        return (Helper.getConfiguration("advancedFeatures").enabled === true);
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

    public static getBuildChannel(): BuildChannel {
        const buildVersion = Helper.getConfiguration("buildVersion");
        if (buildVersion === "Nightly") {
            return BuildChannel.Nightly;
        } else if (buildVersion === "Local") {
            return BuildChannel.Local;
        }
        return BuildChannel.Stable;
    }

    /**
     * Returns the path to the global storage location provided by VSCode to the extension
     */
    public static getGlobalStoragePath(context: vscode.ExtensionContext): string {
        return context.globalStorageUri.fsPath;
    }

    /**
    * Gets Viper Tools Provider URL as stored in the settings.
    * Note that the returned URL might be invalid or correspond to one of the "special" URLs as specified in the README (e.g. to download a GitHub release asset)
    */
    public static getViperToolsProvider(buildChannel: BuildChannel): string {
        const preferences = Helper.getConfiguration("preferences");
        return Helper.getPlatformPath(buildChannel == BuildChannel.Nightly ? preferences.nightlyViperToolsProvider : preferences.stableViperToolsProvider);
    }

    /**
     * Get path to location at which Viper tools have been manually installed (only used for build version "Local").
     */
     public static getLocalViperToolsPath(): string {
        return Helper.getPlatformPath(Helper.getConfiguration("paths").viperToolsPath);
    }

    /**
     * Returns the directory in which log files should be stored.
     * The directory will be created if it does not exist yet
     */
     public static getLogDir(): string {
        // check if a particular dir has been passed as an environment variable.
        // this is mainly used for CI purposes:
        let logDir = process.env["VIPER_IDE_LOG_DIR"];
        if (logDir == null || logDir === "") {
            logDir = path.join(os.tmpdir(), ".vscode");
        }
        //create logfile's directory if it wasn't created before
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        return logDir;
    }

    private static getPlatformPath(p: PlatformDependentPath): string {
        if (Helper.isWin && p.windows) return p.windows;
        if (Helper.isLinux && p.linux) return p.linux;
        if (Helper.isMac && p.mac) return p.mac;
        return "";
    }

    private static getPlatformPaths(paths: PlatformDependentListOfPaths): string[] {
        if (Helper.isWin && paths.windows) return paths.windows;
        if (Helper.isLinux && paths.linux) return paths.linux;
        if (Helper.isMac && paths.mac) return paths.mac;
        return [];
    }

    private static getJavaHome(): Promise<IJavaHomeInfo> {
        return new Promise((resolve, reject) => {
            try {
                const options = {
                    version: ">=11",
                    mustBe64Bit: true,
                    mustBeJDK: true // we currently disallow JREs
                };
                Log.log("Searching for Java home...", LogLevel.Verbose);
                locate_java_home.default(options, (err, javaHomes) => {
                    if (err) {
                        Log.log(err.message, LogLevel.Info);
                        reject(err.message);
                    } else {
                        if (!Array.isArray(javaHomes) || javaHomes.length === 0) {
                            const msg = "Could not find a 64-bit JDK with at least version 1.8. "
                                + "Please install one and/or manually specify it in the Gobra settings.";
                            Log.log(msg, LogLevel.Info);
                            vscode.window.showErrorMessage(msg);
                            reject(msg);
                        } else {
                            const javaHome = javaHomes[0];
                            Log.log(`Using Java home ${JSON.stringify(javaHome, null, 2)}`, LogLevel.Verbose);
                            resolve(javaHome);
                        }
                    }
                });
            } catch (err: any) {
                Log.log(err.message, LogLevel.Info);
                reject(err.message);
            }
        });
    }
    
    public static async getJavaPath(): Promise<string> {
        const configuredJavaBinary = Helper.getConfiguration("javaSettings").javaBinary;
        if (configuredJavaBinary == null || configuredJavaBinary == "") {
            // no java binary configured, search for it:
            const javaHome = await Helper.getJavaHome();
            return javaHome.executables.java;
        } else {
            return configuredJavaBinary;
        }
    }
    
    public static async getJavaCwd(): Promise<string> {
        const configuredCwd = Helper.getConfiguration("javaSettings").cwd;
        if (configuredCwd == null || configuredCwd === "") {
            const roots = vscode.workspace.workspaceFolders;
            if (roots == null || roots.length !== 1) {
                // if no workspace is available, simply use the OS' temp folder:
                Log.log(`no unique workspace folder was found, the operating system's temp ` + 
                    `folder will be used as ViperServer's current working directory. ` +
                    `This behavior can be changed by explicitly specifying a working directory in ` +
                    `the settings as 'viperSettings.javaSettings.cwd'.`, LogLevel.Info);
                return os.tmpdir();
            }
          return roots[0].uri.fsPath;
        }
        return configuredCwd;
    }
    
    public static async getServerProcessArgs(location: Location, mainMethod: string): Promise<string> {
        const configuredArgString = Helper.getConfiguration("javaSettings").customArguments;
        const serverJars = await Helper.viperServerJars(location); // `viperServerJars()` already returns an escaped string
        const useBackendSpecificCache = Helper.getConfiguration("viperServerSettings").backendSpecificCache === true;
        return configuredArgString
            .replace("$backendPaths$", serverJars)
            .replace("$backendSpecificCache$", useBackendSpecificCache ? "--backendSpecificCache" : "")
            .replace("$mainMethod$", mainMethod);
    }

    public static getServerPolicy(): ServerPolicy {
        const serverSettings = Helper.getConfiguration("viperServerSettings");
        if (serverSettings.viperServerPolicy === "attach") {
            return {create: false, address: serverSettings.viperServerAddress, port: serverSettings.viperServerPort};
        } else {
            return {create: true};
        }
    }

    /* returns an escaped string */
    private static async viperServerJars(location: Location): Promise<string> {
        let paths: string[];
        if (Helper.getBuildChannel() == BuildChannel.Local) {
            const serverJarPaths = Helper.getConfiguration("viperServerSettings").serverJars;
            const platformPaths = Helper.getPlatformPaths(serverJarPaths);
            paths = await Promise.all(platformPaths.map(p => Helper.extractEnvVars(p.replace("$viperTools$", location.basePath))));
        } else {
            // ignore `gobraToolsPaths`:
            paths = [await Helper.extractEnvVars(path.join(location.basePath, "backends"))];
        }

        const jarFiles = await Helper.getAllJarsInPaths(paths, false);
        return Helper.buildDependencyString(jarFiles);
    }

    private static async getAllJarsInPaths(paths: string[], recursive: boolean): Promise<string[]> {
        let result: string[] = [];
        try {
            paths.forEach(async p => {
                if (fs.lstatSync(p).isDirectory()) {
                    let files = fs.readdirSync(p);
                    let folders = []
                    files.forEach(child => {
                        child = path.join(p, child)
                        if (!fs.lstatSync(child).isDirectory()) {
                            //child is a file
                            if (Helper.isJar(child)) {
                                //child is a jar file
                                result.push(child);
                            }
                        } else {
                            folders.push(child);
                        }
                    })
                    if (recursive) {
                        const rec = await Helper.getAllJarsInPaths(folders, recursive);
                        result.push(...rec);
                    }
                } else {
                    if (Helper.isJar(p)) {
                        result.push(p)
                    }
                }
            });
        } catch (e) {
            throw new Error(`Error getting all Jars in Paths: ${e}`);
        }
        return result;
    }

    private static isJar(file: string): boolean {
        return file ? file.trim().endsWith(".jar") : false;
    }

    /** all paths get escaped */
    private static buildDependencyString(jarFiles: string[]): string {
        let dependencies = "";
        const concatenationSymbol = Helper.isWin ? ";" : ":";
        if (jarFiles.length > 0) {
            dependencies = dependencies + concatenationSymbol + '"' + jarFiles.join('"' + concatenationSymbol + '"') + '"'
        }
        return dependencies;
    }

    public static getBoogiePath(location: Location): Promise<string> {
        if (Helper.getBuildChannel() == BuildChannel.Local) {
            const boogiePaths = Helper.getConfiguration("paths").boogieExecutable;
            return Helper.extractEnvVars(Helper.getPlatformPath(boogiePaths).replace("$viperTools$", location.basePath));
        } else {
            // ignore `paths`:
            const binaryName = Helper.isWin ? "Boogie.exe" : "Boogie";
            return Helper.extractEnvVars(path.join(location.basePath, "boogie", "Binaries", binaryName));
        }
    }

    public static getZ3Path(location: Location): Promise<string> {
        if (Helper.getBuildChannel() == BuildChannel.Local) {
            const z3Paths = Helper.getConfiguration("paths").z3Executable;
            return Helper.extractEnvVars(Helper.getPlatformPath(z3Paths).replace("$viperTools$", location.basePath));
        } else {
            // ignore `paths`:
            const binaryName = Helper.isWin ? "z3.exe" : "z3";
            return Helper.extractEnvVars(path.join(location.basePath, "z3", "bin", binaryName));
        }
    }

    public static getGitHubToken(): string {
        return process.env["GITHUB_TOKEN"];
    }

    /**
     * Returns true if `getGobraToolsPath` should be wiped after activating the extension to ensure a clean system state.
     */
    public static cleanInstall(): boolean {
        const value = process.env["VIPER_IDE_CLEAN_INSTALL"];
        return value != null &&
            (value == "1" || value.toUpperCase() == "TRUE");
    }

    /**
     * Returns true if Viper-IDE runs in a non-interactive environment and confirmations should automatically be accepted.
     */
    public static assumeYes(): boolean {
        const value = process.env["VIPER_IDE_ASSUME_YES"];
        return value != null && 
            (value == "1" || value.toUpperCase() == "TRUE");
    }

    private static async extractEnvVars(path: string): Promise<string> {
        if (path && path.length > 2) {
            while (Helper.isWin && path.indexOf("%") >= 0) {
                const start = path.indexOf("%")
                const end = path.indexOf("%", start + 1);
                if (end < 0) {
                    throw new Error(`unbalanced % in path: ${path}`);
                }
                const envName = path.substring(start + 1, end);
                const envValue = process.env[envName];
                if (!envValue) {
                    throw new Error(`environment variable ${envName} used in path ${path} is not set`);
                }
                if (envValue.indexOf("%") >= 0) {
                    throw new Error(`environment variable ${envName} must not contain '%': ${envValue}`);
                }
                path = path.substring(0, start) + envValue + path.substring(end + 1, path.length);
            }
            while (!Helper.isWin && path.indexOf("$") >= 0) {
                const index_of_dollar = path.indexOf("$")
                let index_of_closing_slash = path.indexOf("/", index_of_dollar + 1)
                if (index_of_closing_slash < 0) {
                    index_of_closing_slash = path.length
                }
                const envName = path.substring(index_of_dollar + 1, index_of_closing_slash)
                const envValue = process.env[envName]
                if (!envValue) {
                    throw new Error(`environment variable ${envName} used in path ${path} is not set`);
                }
                if (envValue.indexOf("$") >= 0) {
                    throw new Error(`environment variable ${envName} must not contain '$': ${envValue}`);
                }
                path = path.substring(0, index_of_dollar) + envValue + path.substring(index_of_closing_slash, path.length)
            }
        }
        if (fs.existsSync(path)) {
            return path;
        } else {
            throw new Error(`Expected path ${path} does not exist`);
        }
    }

    public static spawn(
        cmd: string, 
        args?: string[] | undefined, 
        options?: child_process.SpawnOptionsWithoutStdio | undefined
    ): Promise<Output> {
        Log.log(`Viper-IDE: Running '${cmd} ${args ? args.join(' ') : ''}'`, LogLevel.Verbose);
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
    
            const proc = child_process.spawn(cmd, args, options);
    
            proc.stdout.on('data', (data) => stdout += data);
            proc.stderr.on('data', (data) => stderr += data);
            proc.on('close', (code) => {
                Log.log("┌──── Begin stdout ────┐", LogLevel.Verbose);
                Log.log(stdout, LogLevel.Verbose);
                Log.log("└──── End stdout ──────┘", LogLevel.Verbose);
                Log.log("┌──── Begin stderr ────┐", LogLevel.Verbose);
                Log.log(stderr, LogLevel.Verbose);
                Log.log("└──── End stderr ──────┘", LogLevel.Verbose);
                resolve({ stdout, stderr, code });
            });
            proc.on('error', (err) => {
                Log.log("┌──── Begin stdout ────┐", LogLevel.Info);
                Log.log(stdout, LogLevel.Info);
                Log.log("└──── End stdout ──────┘", LogLevel.Info);
                Log.log("┌──── Begin stderr ────┐", LogLevel.Info);
                Log.log(stderr, LogLevel.Info);
                Log.log("└──── End stderr ──────┘", LogLevel.Info);
                Log.log(`Error: ${err}`, LogLevel.Info);
                reject(err);
            });
        });
    }

    public static rethrow(msg: string): (originalReason: any) => PromiseLike<never> {
        return (originalReason: any) => {
            Log.log(originalReason, LogLevel.Info);
            throw new Error(`${msg} (reason: '${originalReason}')`);
        }
    }
}

export interface Output {
    stdout: string;
    stderr: string;
    code: number | null;
}

export enum BuildChannel {
    Stable = "Stable",
    Nightly = "Nightly",
    Local = "Local"
}

export interface ResolvedPath {
    path: string,
    error?: string
}

export interface ResolvedPaths {
    paths: string[],
    error?: string
}

export interface ServerPolicy {
    create: boolean
    address?: string
    port?: number
}
