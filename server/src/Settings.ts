'use strict';

import fs = require('fs');
import * as pathHelper from 'path';
var commandExists = require('command-exists');
import {Log} from './Log';
import {ViperSettings,Backend} from './ViperProtocol';

// These are the example settings we defined in the client's package.json
// file

export interface ResolvedPath {
    path: string,
    exists: boolean
}

export class Settings {
    public static viperSettings: ViperSettings;

    public static isWin = /^win/.test(process.platform);

    public static getBackendNames(settings: ViperSettings): string[] {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        })
        return backendNames;
    }

    public static checkSettings(settings: ViperSettings): string {
        settings.valid = false;
        Log.log("Checking Backends...");
        let error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            Log.log("Checking Other Settings...");
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
    }

    private static areBackendsValid(backends: [Backend]): string {
        if (!backends || backends.length == 0) {
            return "No backend detected, specify at least one backend";
        }

        for (let i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend) {
                return "Empty backend detected";
            }
            //name there?
            if (!backend.name || backend.name.length == 0) {
                return "Every backend setting needs a name.";
            }
            //path there?
            if (!backend.paths || backend.paths.length == 0) {
                return backend.name + ": The backend setting needs at least one path";
            }
            //mainMethod there?
            if (!backend.mainMethod || backend.mainMethod.length == 0) {
                return backend.name + ": The backend setting is missing a mainMethod";
            }

            //check paths
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
            //Log.log(backend.getTrace ? "getTrace" : "don't get trace");
            //-> the paths seem right
        }

        //check mainMethod:
        //TODO: 
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
                    Log.error("unbalanced % in path: " + path);
                    return null;
                }
                let envName = path.substring(start + 1, end);
                let envValue = process.env[envName];
                if (!envValue) {
                    Log.error("environment variable : " + envName + " is not set");
                    return null;
                }
                if (envValue.indexOf("%") >= 0) {
                    Log.error("environment variable: " + envName + " must not contain %: " + envValue);
                    return null;
                }
                path = path.substring(0, start - 1) + envValue + path.substring(end + 1, path.length);
            }
        }
        return path;
    }

    public static resolvePath(path: string): ResolvedPath {
        //Log.log("resolve path: " + path);

        if (!path) {
            return { path: path, exists: false };
        }
        path = path.trim();
        //handle env Vatrs
        let envVar = this.extractEnvVars(path);
        if (!envVar) {
            return { path: path, exists: false };
        }
        path = envVar;

        //Log.log("after envVar extraction: " + path);

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
                            //Log.log("windows exe in path found: " + resolvedPath);
                            return { path: resolvedPath, exists: true };
                        }
                    }
                    resolvedPath = this.toAbsolute(pathHelper.join(pathElement, path));
                    if (fs.existsSync(resolvedPath)) {
                        //Log.log("file in path found: " + resolvedPath);
                        return { path: resolvedPath, exists: true };
                    }
                }
            }
        } else {
            //Log.log("deal with absolute or relative path: " + path);
            //handle absolute and relative paths
            resolvedPath = this.toAbsolute(path);
            //Log.log("after toAbsolute path: " + resolvedPath);
            if (fs.existsSync(resolvedPath)) {
                //Log.log("file found: " + resolvedPath);
                return { path: resolvedPath, exists: true };
            }
        }
        return { path: resolvedPath, exists: false };
    }

    private static toAbsolute(path: string): string {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}