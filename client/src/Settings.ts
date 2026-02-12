/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2025 ETH Zurich.
  */

import * as fs from 'fs';
import * as os from 'os';
import * as pathHelper from 'path';
import * as vscode from 'vscode';
import { Location } from 'vs-verification-toolbox';
import * as locate_java_home from '@viperproject/locate-java-home';
import { IJavaHomeInfo } from '@viperproject/locate-java-home/js/es5/lib/interfaces';
import { Log } from './Log';
import { Versions, PlatformDependentURL, PlatformDependentPath, PlatformDependentListOfPaths, Success, Stage, Backend, LogLevel, Common, ViperServerSettings, JavaSettings, AdvancedFeatureSettings, UserPreferences, PathSettings } from './ViperProtocol';
import { combineMessages, Either, flatMap, flatMapAsync, flatten, fold, isRight, Level, Messages, newEitherError, newEitherWarning, newLeft, newRight, toRight, transformRight } from './Either';
import { readdir } from 'fs/promises';
import { Helper } from './Helper';
import { State } from './ExtensionState';
import { Color } from './StatusBar';


export class Settings {

    private static ownPackageJson = vscode.extensions.getExtension("viper-admin.viper").packageJSON;
    private static defaultConfiguration = this.initDefaultSettings(Settings.ownPackageJson.contributes.configuration.properties);
    private static lastVersionWithSettingsChange: Versions = {
        viperServerSettingsVersion: "1.0.4",
        verificationBackendsVersion: "1.0.2",
        pathsVersion: "1.0.1",
        preferencesVersion: "0.6.1",
        javaSettingsVersion: "0.6.1",
        advancedFeaturesVersion: "0.6.1",
        defaultSettings: Settings.defaultConfiguration,
        extensionVersion: Settings.ownPackageJson.version
    };

    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);
    public static isArm = process.arch === 'arm64';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static initDefaultSettings(properties: any): object {
        // Need to turn an object such as `{ "a.b": { "foo": 10 }, "a": { "c": 10 }, ... }`
        // Into an object such as `{ "a": { "b": { "foo": 10 }, "c": 10 }, ... }`
        const defaultSettings = {};
        for (const key in properties) {
            const parts = key.split(".");
            let obj = defaultSettings;
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                if (!obj[part]) {
                    obj[part] = {};
                }
                obj = obj[part];
            }
            obj[parts[parts.length - 1]] = properties[key].default;
        }
        return defaultSettings;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static getConfiguration(setting: string): any {
        return vscode.workspace.getConfiguration("viper").get(setting);
    }

    public static async checkAndGetSettings(location: Location): Promise<Either<Messages, unknown>> {
        const checks = [
            Settings.checkAndGetViperServerSettings(location),
            Settings.checkAndGetVerificationBackends(location),
            Settings.checkAndGetPaths(location),
            Settings.checkAndGetPreferences(location),
            Settings.checkAndGetJavaSettings(location),
            Settings.checkAndGetAdvancedFeatures(location),
            Settings.checkBuildVersion(location),
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res)? newRight({}) : res);
    }

    private static async checkAndGetViperServerSettings(location: Location): Promise<Either<Messages, ViperServerSettings>> {
        const settingName = "viperServer";
        const settings = Settings.getConfiguration(settingName);
        const checks: Promise<Either<Messages, unknown>>[] = [
            // check viperServer path
            Settings.checkViperServerJars(location),
            // check viperServerTimeout
            Settings.checkTimeout(settings.timeout, `${settingName}.timeout`)
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res) ? newRight(settings) : res);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private static builtinBackendToBackend(builtinBackend: BuiltinBackend, type: string): Backend {
        const preVerificationStages: Stage[] = builtinBackend.preVerificationStages;
        const verificationStage: Stage = {
            name: "verify",
            isVerification: true,
            mainMethod: builtinBackend.verificationStage.mainMethod,
            customArguments: builtinBackend.verificationStage.customArguments,
            onParsingError: builtinBackend.verificationStage.onParsingError,
            onTypeCheckingError: builtinBackend.verificationStage.onTypeCheckingError,
            onVerificationError: builtinBackend.verificationStage.onVerificationError,
            onSuccess: builtinBackend.verificationStage.onSuccess,
        };
        const postVerificationStages: Stage[] = builtinBackend.postVerificationStages;
        const backend: Backend = {
            name: builtinBackend.name,
            type,
            paths: builtinBackend.paths,
            engine: builtinBackend.engine,
            timeout: builtinBackend.timeout,
            stoppingTimeout: builtinBackend.stoppingTimeout,
            stages: preVerificationStages.concat(verificationStage).concat(postVerificationStages),
        };
        return backend;
    }
    private static async checkAndGetVerificationBackends(location: Location): Promise<Either<Messages, Backend[]>> {
        const settingName = "verificationBackends";
        let settings = Settings.getConfiguration(settingName);
        const defaultSettings = Settings.lastVersionWithSettingsChange.defaultSettings.viper[settingName];
        const backends: Backend[] = [];
        if (!settings || !settings.symbolicExecution || !settings.verificationConditionGeneration) {
            settings = defaultSettings;
        }
        // Add the built-in backends
        const se = this.builtinBackendToBackend(settings.symbolicExecution, "silicon");
        backends.push(se);
        const vcg = this.builtinBackendToBackend(settings.verificationConditionGeneration, "carbon");
        backends.push(vcg);

        // Add the user-defined other backends
        const defaultSe = this.builtinBackendToBackend(defaultSettings.symbolicExecution, "silicon");
        const defaultVcg = this.builtinBackendToBackend(defaultSettings.verificationConditionGeneration, "carbon");
        const others: Backend[] = settings.others
        others.forEach(other => {
            if (other.type === defaultSe.type) {
                // merge the backend with the default backend
                backends.push(Settings.mergeBackend(other, defaultSe));
            } else if (other.type === defaultVcg.type) {
                // merge the backend with the default backend
                backends.push(Settings.mergeBackend(other, defaultVcg));
            } else {
                // add the default backend if there is none with the same name
                backends.push(other);
            }
        });

        const checks: Promise<Either<Messages, unknown>>[] = [
            // check backends
            Settings.checkBackends(location, backends),
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res) ? newRight(backends) : res);
    }

    private static async checkAndGetPaths(location: Location): Promise<Either<Messages, PathSettings>> {
        const settingName = "paths";
        const settings = Settings.getConfiguration(settingName);
        const checks: Promise<Either<Messages, unknown>>[] = [
            Settings.checkViperToolsPath(location, Settings.getBuildChannel()),
            Settings.checkZ3Path(location, true),
            Settings.checkBoogiePath(location, true),
            Settings.checkSfxPath(location),
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res) ? newRight(settings) : res);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private static async checkAndGetPreferences(location: Location): Promise<Either<Messages, UserPreferences>> {
        const settingName = "preferences";
        const settings = Settings.getConfiguration(settingName);
        const checks: Promise<Either<Messages, unknown>>[] = [
            // no checks
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res) ? newRight(settings) : res);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private static async checkAndGetJavaSettings(location: Location): Promise<Either<Messages, JavaSettings>> {
        const settingName = "javaSettings";
        const settings = Settings.getConfiguration(settingName);
        const checks: Promise<Either<Messages, unknown>>[] = [
            Settings.checkJavaPath(location),
            Settings.checkJavaCustomArgs(settings),
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res) ? newRight(settings) : res);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private static async checkAndGetAdvancedFeatures(location: Location): Promise<Either<Messages, AdvancedFeatureSettings>> {
        const settingName = "advancedFeatures";
        const settings = Settings.getConfiguration(settingName);
        const checks: Promise<Either<Messages, unknown>>[] = [
            // no checks
        ];
        return Promise.all(checks)
            .then(combineMessages)
            .then(res => isRight(res) ? newRight(settings) : res);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private static async checkBuildVersion(location: Location): Promise<Either<Messages, BuildChannel>> {
        const buildChannel = Settings.getBuildChannel();
        return newRight(buildChannel);
    }

    public static getExtensionVersion(): string {
        return Settings.ownPackageJson.version;
    }

    public static getBuildChannel(): BuildChannel {
        const buildVersion = Settings.getConfiguration("buildVersion");
        if (buildVersion === "External") {
            return BuildChannel.External;
        }
        return BuildChannel.BuiltIn;
    }

    public static disableServerVersionCheck(): boolean {
        return Settings.getConfiguration("disableServerVersionCheck") === true;
    }

    public static areAdvancedFeaturesEnabled(): boolean {
        return (Settings.getConfiguration("advancedFeatures").enabled === true);
    }

    public static isCompareStatesEnabled(): boolean {
        return (Settings.getConfiguration("advancedFeatures").compareStates === true);
    }

    public static areDarkGraphsEnabled(): boolean {
        return (Settings.getConfiguration("advancedFeatures").darkGraphs === true);
    }

    public static isSimpleModeEnabled(): boolean {
        return (Settings.getConfiguration("advancedFeatures").simpleMode === true);
    }

    public static isShowOldStateEnabled(): boolean {
        return (Settings.getConfiguration("advancedFeatures").showOldState === true);
    }

    public static isShowPartialExecutionTreeeEnabled(): boolean {
        return (Settings.getConfiguration("advancedFeatures").showPartialExecutionTree === true);
    }

    public static isAutoVerifyAfterBackendChangeEnabled(): boolean {
        return (Settings.getConfiguration('preferences').autoVerifyAfterBackendChange === true);
    }

    public static showProgress(): boolean {
        return (Settings.getConfiguration('preferences').showProgress === true);
    }

    public static getLogLevel(): LogLevel {
        return Settings.getConfiguration("preferences").logLevel || LogLevel.Default;
    }

    /** 
     * `location` is only needed if build channel is different from 'External'.
     * In the case that the build channel is 'External', `null` can be passed.
     * Note that the provided `buildChannel` is used to perform all checks, we
     * can be independent of the user configued build channel.
     * if `allowMissingPath` is set to false, the promise will be resolved even if the path does
     * not (yet) exist
     */
    private static async checkViperToolsPath(location: Location | null, buildChannel: BuildChannel, allowMissingPath: boolean = false): Promise<Either<Messages, string>> {
        const settingName = "paths";
        const isBuildChannelExternal = (buildChannel === BuildChannel.External);
        let resolvedPath: Either<Messages, ResolvedPath>;
        if (isBuildChannelExternal) {
            const configuredPath = Settings.getConfiguration(settingName).viperToolsPath;
            resolvedPath = await Settings.checkPath(location, configuredPath, `${settingName}.viperToolsPath`, false, true, true, allowMissingPath);
        } else {
            const path = location.basePath;
            resolvedPath = await Settings.checkPath(location, path, `ViperTools for build channel ${buildChannel}:`, false, true, true, allowMissingPath);
        }
        // note that `checkPath` already makes sure that the path exists
        return transformRight(resolvedPath, p => p.path);
    }

    /**
     * Get path to location at which Viper tools should be / have been manually installed (build channel "External").
     * `allowMissingPath` configures whether promise should be resolved even if the path does not exist.
     */
    public static async getLocalViperToolsPath(allowMissingPath: boolean = false): Promise<string> {
        const resolvedPath = await Settings.checkViperToolsPath(null, BuildChannel.External, allowMissingPath);
        return toRight(resolvedPath);
    }

    /**
     * Get path to location at which Viper tools have been either manually provided (build channel "External") or are built-in.
     */
     public static async getViperToolsPath(location: Location): Promise<string> {
        const viperTools = await Settings.checkViperToolsPath(location, Settings.getBuildChannel());
        return toRight(viperTools);
    }

    /* returns an escaped string */
    private static async checkViperServerJars(location: Location): Promise<Either<Messages, string>> {
        const settingName = "viperServer";
        const isBuildChannelLocal = (Settings.getBuildChannel() === BuildChannel.External);
        let resolvedPaths: Either<Messages, string[]>;
        if (isBuildChannelLocal) {
            const configuredServerJars = Settings.getConfiguration(settingName).serverJars;
            resolvedPaths = await Settings.checkPaths(location, configuredServerJars, `${settingName}.serverJars`);
        } else {
            const paths = [pathHelper.join(location.basePath, "backends")];
            resolvedPaths = await Settings.checkPaths(location, paths, `ViperServer JARs for build channel ${Settings.getBuildChannel()}:`);
        }
        
        return fold<Messages, string[], Promise<Either<Messages, string>>>(resolvedPaths, async msgs => newLeft(msgs), async paths => {
            const jarFiles = await Settings.getAllJarsInPaths(paths, false);
            const s = Settings.buildDependencyString(jarFiles);
            if (s.trim().length === 0) {
                return newEitherError(`zero JAR files for ViperServer found`);
            }
            return newRight(s.trim());
        });
    }

    /* returns an escaped string */
    private static async getViperServerJars(location: Location): Promise<string> {
        const resolvedJars = await Settings.checkViperServerJars(location);
        return toRight(resolvedJars);
    }

    /**
     * Resolves the path to the Boogie binary based on `buildVersion`, checks whether the file exists, and (optionally)
     * tries to execute the binary.
     * In case the user uses `buildVersion` `External` and specifies an empty Boogie path, checks are skipped and `Right("")` is returned.
     */
    public static async checkBoogiePath(location: Location, execute: boolean = false): Promise<Either<Messages, string>> {
        const settingName = "paths";
        let resolvedPath: Either<Messages, ResolvedPath>;
        if (Settings.getBuildChannel() == BuildChannel.External) {
            const boogiePaths = Settings.getConfiguration(settingName).boogieExecutable;
            // note that the path does not have to exist (4th argument is set to true)
            // we check afterwards that the path exists if the path is non-empty
            const checkPathRes = await Settings.checkPath(location, boogiePaths, `Boogie Executable (if you don't need Boogie, set '${settingName}.boogieExecutable' to ""):`, true, true, true, true);
            resolvedPath = flatMap(checkPathRes, res => {
                // note that the empty path does not have to exist. This allows users to specify an empty path when they want to skip these checks:
                if (!res.exists && res.path && res.path.length !== 0) {
                    return newEitherError<ResolvedPath>(`Boogie Executable at path '${res.path}' does not exist`);
                } else {
                    return newRight(res);
                }
            });

            if (isRight(resolvedPath) && (!resolvedPath.right.path || resolvedPath.right.path.length === 0)) {
                // this is a special case, namely we allow users to skip Boogie checks (e.g. when Boogie is not needed) by specifying an empty path
                return newRight("");
            }
        } else {
            // ignore `paths`:
            const path = pathHelper.join(location.basePath, "boogie", "Binaries", "Boogie");
            resolvedPath = await Settings.checkPath(location, path, `Boogie Executable for build channel ${Settings.getBuildChannel()}:`, true, true, true);
        }

        if (isRight(resolvedPath) && execute) {
            const boogiePath = resolvedPath.right.path;
            try {
                await Common.spawn(boogiePath, ["-version"]);
            } catch (e) {
                return newEitherError(`Executing Boogie '${boogiePath}' with '-version' has failed: ${e}.`);
            }
        }

        return transformRight(resolvedPath, p => p.path);
    }

    /**
     * Returns the path to the Boogie executable. If the user provided an empty string (to skip the checks), an
     * error will be returned.
     */
    public static async getBoogiePath(location: Location): Promise<Either<Messages, string>> {
        const res = await Settings.checkBoogiePath(location);
        return flatMap(res, path =>
            path.length === 0 ?
                newEitherError<string>("Path to the Boogie binary is set to the empty path although the path is passed as an argument to a verification backend.") :
                newRight(path));
    }

    public static async checkZ3Path(location: Location, execute: boolean = false): Promise<Either<Messages, string>> {
        const settingName = "paths";
        let resolvedPath: Either<Messages, ResolvedPath>
        if (Settings.getBuildChannel() == BuildChannel.External) {
            const z3Paths = Settings.getConfiguration(settingName).z3Executable;
            resolvedPath = await Settings.checkPath(location, z3Paths, `Z3 Executable (from '${settingName}.z3Executable'):`, true, true, true);
        } else {
            // ignore `paths`:
            const path = pathHelper.join(location.basePath, "z3", "bin", "z3");
            resolvedPath = await Settings.checkPath(location, path, `Z3 Executable for build channel ${Settings.getBuildChannel()}:`, true, true, true);
        }

        if (isRight(resolvedPath) && execute) {
            const z3Path = resolvedPath.right.path;
            try {
                await Common.spawn(z3Path, ["--version"]);
            } catch (e) {
                return newEitherError(`Executing Z3 '${z3Path}' with '--version' has failed: ${e}.`);
            }
        }

        return transformRight(resolvedPath, p => p.path);
    }

    public static async getZ3Path(location: Location): Promise<string> {
        const res = await Settings.checkZ3Path(location);
        return toRight(res);
    }

    private static async checkSfxPath(location: Location): Promise<Either<Messages, string>> {
        const settingName = "paths";
        let resolvedPath: Either<Messages, ResolvedPath>
        if (Settings.getBuildChannel() == BuildChannel.External) {
            const sfxPrefix = Settings.getConfiguration(settingName).sfxPrefix;
            resolvedPath = await Settings.checkPath(location, sfxPrefix, `The sound effect resources (if you don't want sounds, set '${settingName}.sfxPrefix' to ""):`, false, true, true, true);
        } else {
            // ignore `paths`:
            const path = pathHelper.join(location.basePath, "resources", "sfx");
            resolvedPath = await Settings.checkPath(location, path, `The sound effect resources for build channel ${Settings.getBuildChannel()}:`, false, true, true, true);
        }

        return transformRight(resolvedPath, p => p.path);
    }

    private static async getSfxPath(location: Location): Promise<string> {
        const res = await Settings.checkSfxPath(location);
        return toRight(res);
    }

    public static getStage(backend: Backend, name: string): Stage {
        if (!name) return null;
        for (let i = 0; i < backend.stages.length; i++) {
            const stage = backend.stages[i];
            if (stage.name === name) return stage;
        }
        return null;
    }

    public static getStageFromSuccess(backend: Backend, stage: Stage, success: Success): Stage {
        switch (success) {
            case Success.ParsingFailed:
                return this.getStage(backend, stage.onParsingError);
            case Success.VerificationFailed:
                return this.getStage(backend, stage.onVerificationError);
            case Success.TypecheckingFailed:
                return this.getStage(backend, stage.onTypeCheckingError);
            case Success.Success:
                return this.getStage(backend, stage.onSuccess);
        }
        return null;
    }

    private static resolveEngine(engine: string): string {
        if (engine && (engine.toLowerCase() == "viperserver")) {
            return engine;
        } else {
            return "none";
        }
    }

    public static useViperServer(backend: Backend): boolean {
        if (!backend || !backend.engine) return false;
        return backend.engine.toLowerCase() === "viperserver";
    }

    private static mergeBackend(custom: Backend, def: Backend): Backend {
        if (!custom || !def || custom.type != def.type) return custom;
        if (!custom.paths) custom.paths = def.paths;
        if (!custom.stages) custom.stages = def.stages
        else {
            custom.stages = Settings.mergeStages(custom.stages, def.stages);
        }
        if (!custom.timeout) custom.timeout = def.timeout;
        if (!custom.engine || custom.engine.length == 0) custom.engine = def.engine;
        if (!custom.type || custom.type.length == 0) custom.type = def.type;
        return custom;
    }

    private static mergeStages(custom: Stage[], defaultStages: Stage[]): Stage[] {
        defaultStages.forEach(def => {
            const cus = custom.filter(stage => stage.name == def.name)[0];
            if (cus) {
                // merge
                if (cus.customArguments === undefined) cus.customArguments = def.customArguments;
                if (!cus.mainMethod) cus.mainMethod = def.mainMethod;
                if (cus.isVerification === undefined) cus.isVerification = def.isVerification;
            } else {
                custom.push(def);
            }
        });
        return custom;
    }

    private static async checkPlatformDependentUrl(key: string, url: string | PlatformDependentURL): Promise<Either<Messages, string>> {
        let stringURL = null;
        if (url) {
            if (typeof url === "string") {
                stringURL = url;
            } else {
                if (Settings.isLinux) {
                    stringURL = url.linux;
                } else if (Settings.isMac) {
                    stringURL = Settings.isArm ? url.mac_arm : url.mac;
                } else if (Settings.isWin) {
                    stringURL = url.windows;
                } else {
                    return newEitherError(`Operation System detection failed, Its not Mac, Windows or Linux`);
                }
            }
        }
        if (!stringURL || stringURL.length == 0) {
            return newEitherError(`The ${key} is missing in the preferences`)
        }
        // TODO: check url format
        return newRight(stringURL);
    }

    /** the returned paths are guaranteed to exist */
    private static async checkPaths(location: Location, paths: (string | string[] | PlatformDependentPath | PlatformDependentListOfPaths), prefix: string): Promise<Either<Messages, string[]>> {
        const stringPaths: string[] = []
        if (!paths) {
            return newEitherError(`${prefix} paths are missing`);
        } else if (typeof paths === "string") {
            stringPaths.push(paths)
        } else if (paths instanceof Array) {
            paths.forEach(path => {
                if (typeof path === "string") {
                    stringPaths.push(path)
                }
            })
        } else {
            const platformDependentPath: PlatformDependentPath = <PlatformDependentPath>paths;
            if (Settings.isLinux) {
                return Settings.checkPaths(location, platformDependentPath.linux, prefix);
            } else if (Settings.isMac) {
                return Settings.checkPaths(location, platformDependentPath.mac, prefix);
            } else if (Settings.isWin) {
                return Settings.checkPaths(location, platformDependentPath.windows, prefix);
            } else {
                return newEitherError(`Operation System detection failed, Its not Mac, Windows or Linux`);
            }
        }

        if (stringPaths.length == 0) {
            return newEitherError(`${prefix} path has wrong type: expected: string | string[] | {windows:(string|string[]), mac:(string|string[]), linux:(string|string[])}, found: ${typeof paths} at path: ${JSON.stringify(paths)}`);
        }

        // resolve the paths
        const resolvePromises = stringPaths.map(async stringPath => {
            const resolvedPath = await Settings.resolvePath(location, stringPath, false);
            if (!resolvedPath.exists) {
                return newEitherError<string>(`${prefix} path not found: '${stringPath}' ${(resolvedPath.path != stringPath ? " which expands to '${resolvedPath.path}'" : "")}`);
            }
            return newRight(resolvedPath.path);
        });
        const resolutionRes = await Promise.all(resolvePromises)
            .then(combineMessages);
        if (isRight(resolutionRes) && resolutionRes.right.length === 0) {
            return newEitherError(`${prefix} no file found at at path: ${JSON.stringify(paths)}`);
        }
        return resolutionRes;
    }

    /** `allowMissingPath` set to false (the default) makes this function fail if the path does not exist */
    private static async checkPath(location: Location,
                             path: (string | PlatformDependentPath), 
                             prefix: string, 
                             executable: boolean, 
                             allowPlatformDependentPath: boolean, 
                             allowStringPath: boolean = true, 
                             allowMissingPath = false): Promise<Either<Messages, ResolvedPath>> {
        if (!path) {
            if (!allowMissingPath) {
                return newEitherError(`${prefix} path is missing`);
            }
            return newRight({ path: null, exists: false });
        }
        let stringPath: string;
        if (typeof path === "string") {
            if (!allowStringPath) {
                return newEitherError(`${prefix} path has wrong type: expected: {windows:string, mac:string, linux:string}, found: ${typeof path}`);
            }
            stringPath = path;
        } else {
            if (!allowPlatformDependentPath) {
                return newEitherError(`${prefix} path has wrong type: expected: string, found: ${typeof path} at path: ${JSON.stringify(path)}`);
            }
            if (Settings.isLinux) {
                stringPath = path.linux;
            } else if (Settings.isMac) {
                stringPath = path.mac;
            } else if (Settings.isWin) {
                stringPath = path.windows;
            } else {
                return newEitherError(`Operation System detection failed, it's not Mac, Windows, or Linux`);
            }
        }

        if (!stringPath || stringPath.length == 0) {
            if (!allowMissingPath) {
                return newEitherError(`${prefix} path has wrong type: expected: string ${(executable ? " or {windows:string, mac:string, linux:string}" : "")}, but found: ${typeof path} at path: ${JSON.stringify(path)}`);
            }
            return newRight({ path: stringPath, exists: false });
        }
        const resolvedPath = await Settings.resolvePath(location, stringPath, executable);
        if (!resolvedPath.exists && !allowMissingPath) {
            return newEitherError(`${prefix} path not found: '${stringPath}' ${(resolvedPath.path != stringPath ? ` which expands to '${resolvedPath.path}'` : "")}`);
        }
        return newRight(resolvedPath);
    }

    private static async checkBackends(location: Location, backends: Backend[]): Promise<Either<Messages, Backend[]>> {
        Log.log("Checking backends...", LogLevel.LowLevelDebug);
        if (!backends || backends.length == 0) {
            return newEitherError(`No backend detected, specify at least one backend`);
        }

        const backendNames: Set<string> = new Set<string>();
        const retrievedBackends: Backend[] = [];
        for (let i = 0; i < backends.length; i++) {
            const backend = backends[i];
            if (!backend) {
                return newEitherError(`Empty backend detected`);
            }
            if (!backend.name || backend.name.length == 0) { // name there?
                return newEitherError(`Every backend setting has to have a name.`);
            }
            const backendName = "Backend " + backend.name + ":";
            // check for duplicate backends
            if (backendNames.has(backend.name)) {
                return newEitherError(`Duplicated backend name: ${backend.name}`);
            }
            backendNames.add(backend.name);

            // check stages
            if (!backend.stages || backend.stages.length == 0) {
                return newEitherError(`${backendName} The backend setting needs at least one stage`);
            }

            backend.engine = Settings.resolveEngine(backend.engine);
            // check engine and type
            if (Settings.useViperServer(backend) && !backend.type) {
                return newEitherError(`${backendName} the backend type cannot be empty. It must either be 'silicon', 'carbon', or the class name of the custom backend you are using.`);
            }

            const stages: Set<string> = new Set<string>();
            for (let i = 0; i < backend.stages.length; i++) {
                const stage: Stage = backend.stages[i];
                if (!stage) {
                    return newEitherError(`${backendName} Empty stage detected`);
                }
                else if (!stage.name || stage.name.length == 0) {
                    return newEitherError(`${backendName} Every stage needs a name.`);
                } else {
                    const backendAndStage = `${backendName} Stage: ${stage.name}:`;
                    // check for duplicated stage names
                    if (stages.has(stage.name)) {
                        return newEitherError(`${backendName} Duplicated stage name: ${stage.name}`);
                    }
                    stages.add(stage.name);
                    // check mainMethod
                    if (!stage.mainMethod || stage.mainMethod.length == 0) {
                        return newEitherError(`${backendAndStage} Missing mainMethod`);
                    }
                    // check customArguments
                    if (!stage.customArguments) {
                        return newEitherError(`${backendAndStage} Missing customArguments`);
                    }
                }
            }
            for (let i = 0; i < backend.stages.length; i++) {
                const stage: Stage = backend.stages[i];
                const backendMissingStage = `${backendName}: Cannot find stage ${stage.name}`;
                if (stage.onParsingError && stage.onParsingError.length > 0 && !stages.has(stage.onParsingError))
                    return newEitherError(`${backendMissingStage}'s onParsingError stage ${stage.onParsingError}`);
                if (stage.onTypeCheckingError && stage.onTypeCheckingError.length > 0 && !stages.has(stage.onTypeCheckingError))
                    return newEitherError(`${backendMissingStage}'s onTypeCheckingError stage ${stage.onTypeCheckingError}`);
                if (stage.onVerificationError && stage.onVerificationError.length > 0 && !stages.has(stage.onVerificationError))
                    return newEitherError(`${backendMissingStage}'s onVerificationError stage ${stage.onVerificationError}}`);
                if (stage.onSuccess && stage.onSuccess.length > 0 && !stages.has(stage.onSuccess))
                    return newEitherError(`${backendMissingStage}'s onSuccess stage ${stage.onSuccess}`);
            }
            // there has to be exactly 1 isVerification stage:
            const verificationStages = backend.stages.filter(stage => stage.isVerification);
            if (verificationStages.length != 1) {
                return newEitherError(`There has to be exactly one stage with 'isVerification' set to true for backend ${backend.name}`);
            }

            // check paths
            if (!backend.paths || backend.paths.length == 0) {
                if (!this.useViperServer(backend)) {
                    return newEitherError(`${backendName} The backend setting needs at least one path`);
                }
            } else {
                if (typeof backend.paths == 'string') {
                    const temp = backend.paths;
                    backend.paths = [temp];
                }
                for (let i = 0; i < backend.paths.length; i++) {
                    // extract environment variable or leave unchanged
                    const resolvedPath = await Settings.checkPath(location, backend.paths[i], backendName, false, false);
                    if (isRight(resolvedPath)) {
                        backend.paths[i] = resolvedPath.right.path;
                    } else {
                        return resolvedPath;
                    }
                }
            }

            // check verification timeout
            const resolvedTimeout = await Settings.checkTimeout(backend.timeout, `Backend ${backendName}:`);
            if (isRight(resolvedTimeout)) {
                backend.timeout = resolvedTimeout.right;
            } else {
                return resolvedTimeout;
            }

            retrievedBackends.push(backend);
        }
        return newRight(retrievedBackends);
    }

    public static async getVerificationBackends(location: Location): Promise<Backend[]> {
        const res = await Settings.checkAndGetVerificationBackends(location);
        return toRight(res);
    }

    public static async getCustomArgsForBackend(location: Location, backend: Backend, fileUri: vscode.Uri): Promise<Either<Messages, string>> {
        // while checking the stages, we make sure that there is exactly one stage with `isVerification` set to true:
        const verificationStage = backend.stages.filter(stage => stage.isVerification)[0];
        const z3Path = await Settings.getZ3Path(location);
        const disableCaching = Settings.getConfiguration("viperServer").disableCaching === true;
        const partiallyReplacedString = verificationStage.customArguments
            // note that we use functions as 2nd argument since we do not want that
            // the special replacement patterns kick in
            .replace("$z3Exe$", () => `"${z3Path}"`) // escape path
            .replace("$disableCaching$", () => disableCaching ? "--disableCaching" : "")
            .replace("$fileToVerify$", () => `"${fileUri.fsPath}"`); // escape path (not used since v3)

        // Note that we need to passes over the string because `replace` does not allow async replace functions.
        // Thus, we use `replace` to search for occurrences of `"$boogieExe$"` (ensuring we use the same match
        // algorithm under the hood) and await the Boogie path only in the case we need it.
        let containsBoogieExe = false;
        partiallyReplacedString
            .replace("$boogieExe$", () => {
                containsBoogieExe = true;
                return ""; // doesn't matter what we return because we ignore the replaced string anyway
            });
        if (containsBoogieExe) {
            const boogiePathRes = await Settings.getBoogiePath(location);
            return transformRight(boogiePathRes, boogiePath =>
                partiallyReplacedString
                    .replace("$boogieExe$", () => `"${boogiePath}"`) // escape path
            );
        } else {
            return newRight(partiallyReplacedString);
        }
    }

    private static async checkTimeout(timeout: number, prefix: string): Promise<Either<Messages, number | null>> {
        if (!timeout || (timeout && timeout <= 0)) {
            if (timeout && timeout < 0) {
                return newEitherWarning(`${prefix} the timeout of ${timeout} is interpreted as no timeout.`);
            }
            return newRight(null);
        }
        return newRight(timeout);
    }

    /**
     * Processes the `javaSettings.javaBinary` by either locating a Java installation on the machine or
     * by potentially substituting environment variables in the provided path.
     * Afterwards, `<resolved java path> -version` is executed as an additional check (unless `skipExecution` is set to true).
     * In case multiple Java installation have been located, this function produces a warning message (unless `ignoreWarnings` is set to true).
     */
    private static async checkJavaPath(location: Location, ignoreWarnings: boolean = false, skipExecution: boolean = false): Promise<Either<Messages, string>> {
        const settingName = "javaSettings";
        const configuredJavaBinary = Settings.getConfiguration(settingName).javaBinary;
        const searchForJavaHome = configuredJavaBinary == null || configuredJavaBinary == "";
        let javaPath: Either<Messages, string>;
        if (searchForJavaHome) {
            // no java binary configured, search for it:
            const javaHomes = await Settings.getJavaHomes();
            javaPath = newRight(javaHomes[0].executables.java);
            Log.log(`Java was successfully located at ${javaPath.right}`, LogLevel.Debug);
            if (javaHomes.length !== 1 && !ignoreWarnings) {
                javaPath = newEitherWarning(`Multiple Java installations have been discovered. '${javaHomes[0].executables.java}' will be used. ` +
                    `You can manually provide a path to a Java installation by specifying ` +
                    `'"viper.javaSettings.javaBinary": "<path>"' in your settings file.`);
            }
        } else {
            const resolvedPath = await Settings.checkPath(location, configuredJavaBinary, `Java binary (if you want Viper-IDE to locate one for you, set '${settingName}.javaBinary' to ""):`, true, true, true);
            javaPath = transformRight(resolvedPath, res => {
                Log.log(`The Java home found in settings (${configuredJavaBinary}) has been resolved to ${res.path}`, LogLevel.Debug);
                return res.path;
            });
        }

        if (skipExecution) {
            return javaPath;
        } else {
            return await flatMapAsync(javaPath, async path => {
                try {
                    // try to execute `java -version`:
                    const javaVersionOutput = await Common.spawn(path, ["-version"]);
                    const javaVersion = javaVersionOutput.stdout.concat(javaVersionOutput.stderr);
                    Log.log(`Java home found: ${path}. It's version is: ${javaVersion}`, LogLevel.Verbose);
                    return newRight(path);
                } catch (err) {
                    let errorMsg: string
                    const configuredJavaBinary = Settings.getConfiguration("javaSettings").javaBinary;
                    const searchForJavaHome = configuredJavaBinary == null || configuredJavaBinary == "";
                    if (searchForJavaHome) {
                        errorMsg = `A Java home was found at '${path}' but executing it with '-version' has failed: ${err}.`;
                    } else {
                        errorMsg = `The Java home is in the settings configured to be '${path}' but executing it with '-version' has failed: ${err}.`;
                    }
                    return newEitherError(errorMsg);
                }
            });
        }
    }

    /**
     * Returns the path to the java binary. Ignores warnings and rejects the promise only if `checkJavaPath` returns errors.
     * To catch warnings and propagate errors & warnings to the user, `checkJavaPath` should be invoked first.
     */
    public static async getJavaPath(location: Location): Promise<string> {
        // skip warnings & checks as `checkJavaPath` has been called during startup to inform the user
        // about any issues
        return toRight(await Settings.checkJavaPath(location, true, true));
    }

    private static async checkJavaCustomArgs(settings: JavaSettings): Promise<Either<Messages, string>> {
        if (!settings.customArguments) {
            return newEitherError(`The customArguments are missing in the java settings`);
        }
        return newRight(settings.customArguments);
    }

    /**
     * Searches for Java homes. Promise is rejected with an error message (as string) in case something went wrong
     */
    private static getJavaHomes(): Promise<IJavaHomeInfo[]> {
        return new Promise((resolve, reject) => {
          try {
            const minJavaVersion = 11
            const options = {
              version: `>=${minJavaVersion}`,
              mustBe64Bit: true
            };
            locate_java_home.default(options, (err, javaHomes) => {
              if (err) {
                reject(err.message);
              } else {
                if (!Array.isArray(javaHomes) || javaHomes.length === 0) {
                  const msg = `Could not find a 64-bit Java installation with at least version ${minJavaVersion}. `
                    + "Please install one and/or manually specify it in the Viper-IDE settings.";
                  reject(msg);
                } else {
                  resolve(javaHomes);
                }
              }
            });
          } catch (err) {
            reject(err.message);
          }
        });
    }

    public static async getJavaCwd(): Promise<string> {
        const configuredCwd = Settings.getConfiguration("javaSettings").cwd;
        if (configuredCwd == null || configuredCwd === "") {
            const roots = vscode.workspace.workspaceFolders;
            if (roots == null || roots.length !== 1) {
                // if no workspace is available, simply use the OS' temp folder:
                Log.log(`no unique workspace folder was found, the operating system's temp ` + 
                    `folder will be used as ViperServer's current working directory. ` +
                    `This behavior can be changed by explicitly specifying a working directory in ` +
                    `the settings as 'viper.javaSettings.cwd'.`, LogLevel.Info);
                return os.tmpdir();
            }
          return roots[0].uri.fsPath;
        }
        return configuredCwd;
    }

    public static async getServerJavaArgs(location: Location, mainMethod: string): Promise<string> {
        const configuredArgString = Settings.getConfiguration("javaSettings").customArguments;
        const serverJars = await Settings.getViperServerJars(location); // `viperServerJars()` already returns an escaped string
        return configuredArgString
            // note that we use functions as 2nd argument since we do not want that
            // the special replacement patterns kick in
            .replace("$backendPaths$", () => serverJars)
            .replace("$mainMethod$", () => mainMethod);
    }

    public static getServerPolicy(): ServerPolicy {
        const serverSettings = Settings.getConfiguration("viperServer");
        if (serverSettings.viperServerPolicy === "attach") {
            return {create: false, address: serverSettings.viperServerAddress, port: serverSettings.viperServerPort};
        } else {
            return {create: true};
        }
    }

    public static async getServerArgs(logLevel: LogLevel, logFile: string): Promise<string> {
        function convertLogLevel(logLevel: LogLevel): string {
            // translate LogLevel to the command-line parameter that ViperServer understands:
            switch(logLevel) { // we use `Log.logLevel` here as that one might differ from the one in the settings during unit tests
                case LogLevel.None:
                    return "OFF";
                case LogLevel.Default:
                    return "ERROR";
                case LogLevel.Info:
                    return "INFO";
                case LogLevel.Verbose:
                    return "DEBUG";
                case LogLevel.Debug:
                    return "TRACE";
                case LogLevel.LowLevelDebug:
                    return "ALL";
            }
        }

        const configuredArgString = Settings.getConfiguration("viperServer").customArguments;
        const useBackendSpecificCache = Settings.getConfiguration("viperServer").backendSpecificCache === true;
        const beginnerMode = Settings.getConfiguration("viperServer").beginnerMode === true;
        return configuredArgString
            .replace("$backendSpecificCache$", useBackendSpecificCache ? "--backendSpecificCache" : "")
            .replace("$beginnerMode$", beginnerMode ? "--beginnerMode" : "")
            .replace("$logLevel$", convertLogLevel(logLevel))
            // note that we use functions as 2nd argument since we do not want that
            // the special replacement patterns kick in
            .replace("$logFile$", () => `"${logFile}"`); // escape logFile
    }

    /** all paths get escaped */
    private static buildDependencyString(jarFiles: string[]): string {
        let dependencies = "";
        const concatenationSymbol = Settings.isWin ? ";" : ":";
        if (jarFiles.length > 0) {
            dependencies = dependencies + concatenationSymbol + '"' + jarFiles.join('"' + concatenationSymbol + '"') + '"'
        }
        return dependencies;
    }

    private static async getAllJarsInPaths(paths: string[], recursive: boolean): Promise<string[]> {
        const resultPromises = paths.map(async p => {
            if (fs.lstatSync(p).isDirectory()) {
                const children = await readdir(p);
                const childPaths = children.map(child => pathHelper.join(p, child));
                const promises = childPaths.map(async childPath => {
                    if (fs.lstatSync(childPath).isDirectory()) {
                        if (recursive) {
                            return Settings.getAllJarsInPaths([childPath], recursive);
                        }
                    } else if (Settings.isJar(childPath)) {
                        return [childPath];
                    }
                    return [];
                });
                return Promise.all(promises).then(flatten);
            } else {
                if (Settings.isJar(p)) {
                    return [p];
                }
            }
        });
        return Promise.all(resultPromises)
            .then(flatten)
            .catch(Helper.rethrow(`Error getting all Jars in paths`));
    }

    private static isJar(file: string): boolean {
        return file ? file.trim().endsWith(".jar") : false;
    }

    private static async resolvePath(location: Location, path: string, executable: boolean): Promise<ResolvedPath> {
        if (!path) {
            return { path: path, exists: false };
        }
        path = path.trim();

        // expand internal variables
        const expandedPath = await Settings.expandViperToolsPath(location, path);
        // expand environmental variables
        const resolvedPath = await Settings.extractEnvVars(expandedPath);

        // handle files in Path env var
        if (resolvedPath.indexOf("/") < 0 && resolvedPath.indexOf("\\") < 0) {
            // its only a filename, try to find it in the path
            const pathEnvVar: string = process.env.PATH;
            if (pathEnvVar) {
                const pathList: string[] = pathEnvVar.split(Settings.isWin ? ";" : ":");
                for (let i = 0; i < pathList.length; i++) {
                    const pathElement = pathList[i];
                    const combinedPath = Settings.toAbsolute(pathHelper.join(pathElement, resolvedPath));
                    const exists = Settings.exists(combinedPath, executable);
                    if (exists.exists) return exists;
                }
            }
            return { path: resolvedPath, exists: false };
        } else {
            // handle absolute and relative paths
            let homeExpandedPath = resolvedPath;
            const home = os.homedir();
            if (home) {
                homeExpandedPath = resolvedPath.replace(/^~($|\/|\\)/, `${home}$1`);
            }
            const absolutePath = Settings.toAbsolute(homeExpandedPath);
            return Settings.exists(absolutePath, executable);
        }
    }

    private static async expandViperToolsPath(location: Location, path: string): Promise<string> {
        if (!path) return path;

        const regex = /\$viperTools\$/g
        const matches = path.match(regex);
        if (matches == null) {
            // no matches
            return path;
        }

        // note that we invoke `getViperToolsPath` only if there is at least
        // one match. Ptherwise, calling `getViperToolsPath` in all cases
        // results in endless recursion.
        const toolsPath = await Settings.getViperToolsPath(location);
        return path.replace(/\$viperTools\$/g, toolsPath);    
    }

    // does not check whether the extracted path exists or not
    private static async extractEnvVars(path: string): Promise<string> {
        if (path && path.length > 2) {
            while (Settings.isWin && path.indexOf("%") >= 0) {
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
            while (!Settings.isWin && path.indexOf("$") >= 0) {
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
        return path;
    }

    private static exists(path: string, executable: boolean): ResolvedPath {
        try {
            fs.accessSync(path);
            return { path: path, exists: true };
        } catch (_) {
            // intentially empty as it simply means that the file does not exist
        }
        if (executable && this.isWin && !path.toLowerCase().endsWith(".exe")) {
            path += ".exe";
            //only one recursion at most, because the ending is checked
            return this.exists(path, false);
        }
        return { path: path, exists: false }
    }

    private static toAbsolute(path: string): string {
        return pathHelper.resolve(pathHelper.normalize(path));
    }

    public static async handleSettingsCheckResult<R>(res: Either<Messages, R>): Promise<void> {
        if (isRight(res)) {
            return; // success, i.e. no warnings and no errors
        }
    
        const msgs = res.left;
        let nofErrors = 0;
        let nofWarnings = 0;
        let message = "";
        msgs.forEach(msg => {
            switch (msg.level) {
                case Level.Error:
                    nofErrors++;
                    Log.error(`Settings Error: ${msg.msg}`);
                    break;
                case Level.Warning:
                    nofWarnings++;
                    Log.log(`Settings Warning: ${msg.msg}`, LogLevel.Info);
                    break;
                default:
                    nofErrors++; // we simply count it as an error
                    Log.log(`Settings Warning or Error with unknown level '${msg.level}': ${msg.msg}`, LogLevel.Info);
                    break;
            }
            message = msg.msg;
        })
    
        const countDescription = ((nofErrors > 0 ? ("" + nofErrors + " Error" + (nofErrors > 1 ? "s" : "")) : "") + (nofWarnings > 0 ? (" " + nofWarnings + " Warning" + (nofWarnings > 1 ? "s" : "")) : "")).trim();
    
        // update status bar
        Log.log(`${countDescription} detected.`, LogLevel.Info);
        if (nofErrors > 0) {
            State.statusBarItem.update(countDescription, Color.ERROR);
        } else if (nofWarnings > 0) {
            State.statusBarItem.update(countDescription, Color.WARNING);
        }
    
        // we can display one message, if there are more we redirect users to the output view:
        if (nofErrors + nofWarnings > 1) {
            message = "see View->Output->Viper";
        }
        Log.hint(`${countDescription}: ${message}`, `Viper Settings`, true);
        if (nofErrors > 0) {
            // abort only in the case of errors
            throw new Error(`Problems in Viper Settings detected`);
        }
    }
}

export interface BuiltinBackend {
    name: string;
    paths: string[];
    engine: string;
    timeout: number;
    stoppingTimeout: number;
    preVerificationStages: Stage[];
    verificationStage: VerificationStage;
    postVerificationStages: Stage[];
}

export interface VerificationStage {
    mainMethod: string;
    customArguments: string;
    onParsingError: string;
    onTypeCheckingError: string;
    onVerificationError: string;
    onSuccess: string;
}

export interface ResolvedPath {
    path: string,
    exists: boolean
}

export enum BuildChannel {
    BuiltIn = "BuiltIn",
    External = "External"
}

export interface ServerPolicy {
    create: boolean
    address?: string
    port?: number
}
