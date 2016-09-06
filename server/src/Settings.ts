'use strict';

import fs = require('fs');
import * as pathHelper from 'path';
var commandExists = require('command-exists');
import {Log} from './Log';
import {Commands, Success, ViperSettings, Stage, Backend, LogLevel} from './ViperProtocol';
import {Server} from './ServerClass';

export interface ResolvedPath {
    path: string,
    exists: boolean
}

export class Settings {
    public static settings: ViperSettings;
    public static isWin = /^win/.test(process.platform);
    public static workspace;
    public static VERIFY = "verify";
    public static selectedBackend: string;

    private static _valid: boolean = false;
    private static _error: string;

    public static getStage(backend: Backend, name: string): Stage {
        if (!name) return null;
        for (let i = 0; i < backend.stages.length; i++) {
            let stage = backend.stages[i];
            if (stage.name === name) return stage;
        }
        return null;
    }

    public static getStageFromSuccess(backend: Backend, stage: Stage, success: Success) {
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

    public static backendEquals(a: Backend, b: Backend) {
        if (!a || !b) {
            return false;
        }
        let same = a.stages.length === b.stages.length;
        same = same && a.name === b.name;
        a.stages.forEach((element, i) => {
            same = same && this.stageEquals(element, b.stages[i]);
        });
        same = same && a.paths.length === b.paths.length;
        for (let i = 0; i < a.paths.length; i++) {
            same = same && a.paths[i] === b.paths[i];
        }
        return same;
    }

    private static stageEquals(a: Stage, b: Stage): boolean {
        let same = a.customArguments == b.customArguments;
        same = same && a.mainMethod == b.mainMethod;
        same = same && a.name == b.name;
        same = same && a.isVerification == b.isVerification;
        same = same && a.onParsingError == b.onParsingError;
        same = same && a.onTypeCheckingError == b.onTypeCheckingError;
        same = same && a.onVerificationError == b.onVerificationError;
        same = same && a.onSuccess == b.onSuccess;
        return same;
    }

    static completeNGArguments(stage: Stage, fileToVerify: string): string {
        let args = stage.customArguments;
        if (!args || args.length == 0) return "";
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.z3Executable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$nailgunPort\$/g, this.settings.nailgunPort);
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        return args;
    }

    public static autoselectBackend(settings: ViperSettings) {
        if (!settings || !settings.verificationBackends || settings.verificationBackends.length == 0) {
            Log.error("No backend, even though the setting check succeeded.");
            return;
        }
        if (this.selectedBackend) {
            for (let i = 0; i < settings.verificationBackends.length; i++) {
                let backend = settings.verificationBackends[i];
                if (backend.name === this.selectedBackend) {
                    return backend;
                }
            }
        }
        this.selectedBackend = settings.verificationBackends[0].name;
        return settings.verificationBackends[0];
    }

    public static getBackendNames(settings: ViperSettings): string[] {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        })
        return backendNames;
    }

    public static valid(): boolean {
        if (!this._valid)
            Server.sendInvalidSettingsNotification(this._error);
        return this._valid;
    }

    public static checkSettings(settings: ViperSettings) {
        try {
            this._valid = false;
            Log.log("Checking Backends...", LogLevel.Debug);
            this._error = Settings.areBackendsValid(settings.verificationBackends);
            if (!this._error) {

                if (!settings.nailgunPort) {
                    this._error = "NailgunPort is missing";
                } else if (!/\d+/.test(settings.nailgunPort)) {
                    this._error = "Invalid NailgunPort: " + settings.nailgunPort;
                }

                Log.log("Checking Other Settings...", LogLevel.Debug);
                if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                    this._error = "Path to nailgun server jar is missing"
                } else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunServerJar)
                    if (!resolvedPath.exists) {
                        this._error = "No nailgun server jar file found at path: " + resolvedPath.path;
                    }
                    settings.nailgunServerJar = resolvedPath.path;
                }
            }
            if (!this._error) {
                if (!settings.nailgunClient || settings.nailgunClient.length == 0) {
                    this._error = "Path to nailgun client executable is missing"
                } else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunClient)
                    if (!resolvedPath.exists) {
                        this._error = "No nailgun client executable file found at path: " + resolvedPath.path;
                    } else {
                        settings.nailgunClient = resolvedPath.path;
                    }
                }
            }
            if (!this._error) {
                if (!settings.z3Executable || settings.z3Executable.length == 0) {
                    this._error = "Path to z3 executable is missing"
                } else {
                    let resolvedPath = Settings.resolvePath(settings.z3Executable)
                    if (!resolvedPath.exists) {
                        this._error = "No z3 executable file found at path: " + resolvedPath.path;
                    } else {
                        settings.z3Executable = resolvedPath.path;
                    }
                }
            }
            this._valid = !this._error;
            if (this._valid) {
                Log.log("The settings are ok", LogLevel.Info);
            }
        } catch (e) {
            Log.error("Error checking settings: " + e);
        }
    }

    private static areBackendsValid(backends: Backend[]): string {
        if (!backends || backends.length == 0) {
            return "No backend detected, specify at least one backend";
        }

        let backendNames: Set<string> = new Set<string>();

        for (let i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend) return "Empty backend detected";
            //name there?
            if (!backend.name || backend.name.length == 0) return "Every backend setting needs a name.";

            //check for dublicate backends
            if (backendNames.has(backend.name)) return "Dublicated backend name: " + backend.name
            backendNames.add(backend.name);

            //check stages
            if (!backend.stages || backend.stages.length == 0) return backend.name + ": The backend setting needs at least one stage";
            let stages: Set<string> = new Set<string>();
            let verifyStageFound = false;
            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
                if (!stage) return backend.name + ": Empty stage detected";
                if (!stage.name || stage.name.length == 0) return backend.name + ": Every stage needs a name.";
                if (stages.has(stage.name)) return backend.name + ": Dublicated stage name: " + backend.name + ":" + stage.name
                stages.add(stage.name);
                if (!stage.mainMethod || stage.mainMethod.length == 0) return backend.name + ": Stage: " + stage.name + "is missing a mainMethod";
                //TODO: check mainMethods:
            }
            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
                if (stage.onParsingError && stage.onParsingError.length > 0 && !stages.has(stage.onParsingError)) return backend.name + ": Cannot find stage " + stage.name + "'s onParsingError stage " + stage.onParsingErrors;
                if (stage.onTypeCheckingError && stage.onTypeCheckingError.length > 0 && !stages.has(stage.onTypeCheckingError)) return backend.name + ": Cannot find stage " + stage.name + "'s onTypeCheckingError stage " + stage.onTypeCheckingError;
                if (stage.onVerificationError && stage.onVerificationError.length > 0 && !stages.has(stage.onVerificationError)) return backend.name + ": Cannot find stage " + stage.name + "'s onVerificationError stage " + stage.onVerificationError;
                if (stage.onSuccess && stage.onSuccess.length > 0 && !stages.has(stage.onSuccess)) return backend.name + ": Cannot find stage " + stage.name + "'s onSuccess stage " + stage.onSuccess;
            }

            //check paths
            if (!backend.paths || backend.paths.length == 0) {
                return backend.name + ": The backend setting needs at least one path";
            }
            for (let i = 0; i < backend.paths.length; i++) {
                let path = backend.paths[i];

                //extract environment variable or leave unchanged
                let resolvedPath = Settings.resolvePath(path);
                if (!resolvedPath.exists) {
                    return backend.name + ": Cannot resolve path: " + path;
                }
                path = resolvedPath.path;
                //-> set path to environment variable value
                backend.paths[i] = path;
            }
            //-> the settings seem right
        }
        return null;
    }

    public static backendJars(backend: Backend): string {
        let backendJars = "";

        let concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(path => {
            if (this.isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + path;
            } else {
                //its a folder
                let files = fs.readdirSync(path);
                files.forEach(file => {
                    if (this.isJar(file)) {
                        backendJars = backendJars + concatenationSymbol + pathHelper.join(path, file);
                    }
                });
            }
        });
        return backendJars;
    }

    private static isJar(file: string): boolean {
        return file ? file.trim().endsWith(".jar") : false;
    }

    private static extractEnvVars(path: string) {
        if (path && path.length > 2) {
            while (path.indexOf("%") >= 0) {
                let start = path.indexOf("%")
                let end = path.indexOf("%", start + 1);
                if (end < 0) {
                    Log.error("unbalanced % in path: " + path, LogLevel.Info);
                    return null;
                }
                let envName = path.substring(start + 1, end);
                let envValue = process.env[envName];
                if (!envValue) {
                    Log.error("environment variable : " + envName + " is not set", LogLevel.Info);
                    return null;
                }
                if (envValue.indexOf("%") >= 0) {
                    Log.error("environment variable: " + envName + " must not contain %: " + envValue, LogLevel.Info);
                    return null;
                }
                path = path.substring(0, start - 1) + envValue + path.substring(end + 1, path.length);
            }
        }
        return path;
    }

    private static resolvePath(path: string): ResolvedPath {
        try {
            if (!path) {
                return { path: path, exists: false };
            }
            path = path.trim();
            //handle env Vars
            let envVar = this.extractEnvVars(path);
            if (!envVar) {
                return { path: path, exists: false };
            }
            path = envVar;
            let resolvedPath: string;
            //handle files in Path env var
            if (path.indexOf("/") < 0 && path.indexOf("\\") < 0) {
                //its only a filename, try to find it in the path
                let pathEnvVar: string = process.env.PATH;
                if (pathEnvVar) {
                    let pathList: string[] = pathEnvVar.split(Settings.isWin ? ";" : ":");
                    for (let i = 0; i < pathList.length; i++) {
                        let pathElement = pathList[i];
                        if (Settings.isWin && path.indexOf(".") < 0) {
                            resolvedPath = this.toAbsolute(pathHelper.join(pathElement, path + ".exe"));
                            if (fs.existsSync(resolvedPath)) {
                                return { path: resolvedPath, exists: true };
                            }
                        }
                        resolvedPath = this.toAbsolute(pathHelper.join(pathElement, path));
                        if (fs.existsSync(resolvedPath)) {
                            return { path: resolvedPath, exists: true };
                        }
                    }
                }
            } else {
                //handle absolute and relative paths
                resolvedPath = this.toAbsolute(path);
                try {
                    fs.accessSync(resolvedPath);
                    return { path: resolvedPath, exists: true };
                } catch (e) { }
            }
            return { path: resolvedPath, exists: false };
        } catch (e) {
            Log.error("Error resolving path: " + e);
        }
    }

    private static toAbsolute(path: string): string {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}