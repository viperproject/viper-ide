'use strict';

import fs = require('fs');
import * as pathHelper from 'path';
var commandExists = require('command-exists');
import {Log} from './Log';

export interface IveSettings {
    verificationBackends: [Backend];
    nailgunServerJar: string;
    nailgunClient: string;
    z3Executable: string;
    valid: boolean;
}
// These are the example settings we defined in the client's package.json
// file
export interface Backend {
    name: string;
    paths: [string];
    mainMethod: string;
}

export class Settings {
    public static iveSettings: IveSettings;

    public static isWin = /^win/.test(process.platform);

    public static getBackendNames(settings: IveSettings): string[] {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        })
        return backendNames;
    }

    public static checkSettings(settings: IveSettings): string {
        settings.valid = false;
        Log.log("Checking Backends...");
        let error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            Log.log("Checking Other Settings...");
            if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                error = "Path to nailgun server jar is missing"
            } else {
                let envVar = Settings.extractEnvVar(settings.nailgunServerJar)
                if(!envVar){
                    error = "No nailgunServerJar file found at path or in %ENV_VAR%: " + settings.nailgunServerJar;
                }
                else if (!Settings.exists(envVar, false)) {
                    error = "No file found at path: " + envVar;
                }
                settings.nailgunServerJar = envVar;
            }
        }
        if (!error) {
            if (!settings.nailgunClient || settings.nailgunClient.length == 0) {
                error = "Path to nailgun client executable is missing"
            } else {
                let envVar = Settings.extractEnvVar(settings.nailgunClient)
                if(!envVar){
                    error = "No nailgunClient file found at path, in %ENV_VAR%, or in the environment PATH: " + settings.nailgunServerJar;
                }
                else if (!Settings.exists(envVar, true)) {
                    error = "No file found at path: " + envVar;
                } else {
                    settings.nailgunClient = envVar;
                }
            }
        }
        if (!error) {
            if (!settings.z3Executable || settings.z3Executable.length == 0) {
                error = "Path to z3 executable is missing"
            } else {
                let envVar = Settings.extractEnvVar(settings.z3Executable)
                if(!envVar){
                    error = "No z3 Executable found at path, in %ENV_VAR%, or in the environment PATH: " + settings.nailgunServerJar;
                }
                else if (!Settings.exists(envVar, true)) {
                    error = "No file found at path: " + envVar;
                } else {
                    settings.z3Executable = envVar;
                }
            }
        }
        settings.valid = !error;
        return error;
    }

    private static exists(path: string, isExecutable: boolean): boolean {
        if (!path) { return false };
        if (fs.existsSync(path)) {
            return true;
        }
        if (path.indexOf("/") < 0 && path.indexOf("\\") < 0) {
            //check if the pointed file is accessible via path variable

            // commandExists(path, function (err, commandExists) {
            //     if (commandExists) {
            //         return true;
            //     }
            //     else {
            //         return false;
            //     }
            // });

            let pathEnvVar: string = process.env.PATH;
            let pathList: string[];
            if (Settings.isWin) {
                pathList = pathEnvVar.split(";");
                if (isExecutable && path.indexOf(".") < 0) {
                    path = path + ".exe";
                }
            } else {
                pathList = pathEnvVar.split(":");
            }

            return pathList.some((element) => {
                if (fs.existsSync(pathHelper.join(element, path))) {
                    return true;
                } else {
                    return false;
                }
            });
        }
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
                path = Settings.extractEnvVar(path);
                if (!path) {
                    return backend.name + ": Environment varaible " + path + " is not set.";
                }
                //-> set path to environment variable value
                backend.paths[i] = path;
                //is absolute path
                if (Settings.isWin) {
                    if (path.indexOf(":") < 0) {
                        return backend.name + ": The path to the backend jar-file must be absolute.";
                    }
                }

                //does file or folder exist?
                if (!fs.existsSync(path)) {
                    return backend.name + ": No File/Folder found there: " + path + " ";
                }
            }
            //-> the paths seem right

            //check mainMethod:
            //TODO: 
        }
        return null;
    }

    public static backendJars(backend: Backend): string {
        let backendJars = "";

        let concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(path => {
            if (isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + path;
            } else {
                //its a folder
                let files = fs.readdirSync(path);
                files.forEach(file => {
                    if (isJar(file)) {
                        backendJars = backendJars + concatenationSymbol + pathHelper.join(path, file);
                    }
                });
            }
        });
        return backendJars;

        function isJar(file: string): boolean {
            return file.endsWith(".jar");
        }
    }

    public static extractEnvVar(path: string): string {
        if (path && path.length > 2) {
            if (path.startsWith("%") && path.endsWith("%")) {
                let envName = path.substr(1, path.length - 2);
                let envValue = process.env[envName];
                return envValue; //null means the Environment Variable is not set
            }
        }
        return path;
    }
}