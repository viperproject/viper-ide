'use strict';

import fs = require('fs');
import * as pathHelper from 'path';
var commandExists = require('command-exists');
import {Log} from './Log';
import {ViperSettings, Stage, Backend, LogLevel} from './ViperProtocol';

// These are the example settings we defined in the client's package.json
// file

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

    public static getVerifyStage(backend: Backend) {
        return this.getStage(backend, this.VERIFY);
    }

    public static getStage(backend: Backend, type: string): Stage {
        for (let i = 0; i < backend.stages.length; i++) {
            let stage = backend.stages[i];
            if (stage.type === type) return stage;
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

    public static stageEquals(a: Stage, b: Stage): boolean {
        let same = a.customArguments == b.customArguments;
        same = same && a.mainMethod == b.mainMethod;
        same = same && a.type == b.type;
        same = same && a.onError == b.onError;
        return same;
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

    public static checkSettings(settings: ViperSettings): string {
        try {
            settings.valid = false;
            Log.log("Checking Backends...", LogLevel.Debug);
            let error = Settings.areBackendsValid(settings.verificationBackends);
            if (!error) {

                if (!settings.nailgunPort) {
                    error = "NailgunPort is missing";
                } else if (!/\d+/.test(settings.nailgunPort)) {
                    error = "Invalid NailgunPort: " + settings.nailgunPort;
                }

                Log.log("Checking Other Settings...", LogLevel.Debug);
                if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                    error = "Path to nailgun server jar is missing"
                } else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunServerJar)
                    if (!resolvedPath.exists) {
                        error = "No nailgun server jar file found at path: " + resolvedPath.path;
                    }
                    settings.nailgunServerJar = resolvedPath.path;
                }
            }
            if (!error) {
                if (!settings.nailgunClient || settings.nailgunClient.length == 0) {
                    error = "Path to nailgun client executable is missing"
                } else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunClient)
                    if (!resolvedPath.exists) {
                        error = "No nailgun client executable file found at path: " + resolvedPath.path;
                    } else {
                        settings.nailgunClient = resolvedPath.path;
                    }
                }
            }
            if (!error) {
                if (!settings.z3Executable || settings.z3Executable.length == 0) {
                    error = "Path to z3 executable is missing"
                } else {
                    let resolvedPath = Settings.resolvePath(settings.z3Executable)
                    if (!resolvedPath.exists) {
                        error = "No z3 executable file found at path: " + resolvedPath.path;
                    } else {
                        settings.z3Executable = resolvedPath.path;
                    }
                }
            }
            settings.valid = !error;
            return error;
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
                if (!stage) return "Empty stage detected";
                if (!stage.type || stage.type.length == 0) return "Every stage needs a type.";
                if (stages.has(stage.type)) return "Dublicated stage type: " + backend.name + ":" + stage.type
                stages.add(stage.type);
                if (stage.type && stage.type == "verify") {
                    if (verifyStageFound) return "You can only have one stage with type verify";
                    verifyStageFound = true;
                }
                if (!stage.mainMethod || stage.mainMethod.length == 0) return "Stage: " + stage.type + "is missing a mainMethod";
                //TODO: check mainMethods:
            }
            if (!verifyStageFound) return "You must have exactly one stage with type verify";

            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
                if (stage.onError && stage.onError.length > 0 && !stages.has(stage.onError)) return "Cannot find stage " + stage.type + "'s onError stage";
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

    public static resolvePath(path: string): ResolvedPath {
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
            if (fs.existsSync(resolvedPath)) {
                return { path: resolvedPath, exists: true };
            }
        }
        return { path: resolvedPath, exists: false };
    }

    private static toAbsolute(path: string): string {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}