'use strict';

import fs = require('fs');
import * as path from 'path';
var commandExists = require('command-exists');

export interface IveSettings {
    verificationBackends: [Backend];
    nailgunServerJar: string;
    nailgunClient: string;
}
// These are the example settings we defined in the client's package.json
// file
export interface Backend {
    name: string;
    filePath: string;
    mainMethod: string;
    command: string;
}

export class Settings {
    public static iveSettings: IveSettings;

    public static isWin = /^win/.test(process.platform);

    private static valid: boolean = false;

    public static areValid(): boolean {
        return Settings.valid;
    }

    public static checkSettings(settings: IveSettings): string {
        let error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                error = "Path to nailgun server jar is missing"
            } else {
                let envVar = Settings.extractEnvVar(settings.nailgunServerJar)
                if (!Settings.exists(envVar, false)) {
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
                if (!Settings.exists(envVar, true)) {
                    error = "No file found at path: " + envVar;
                } else {
                    settings.nailgunClient = envVar;
                }
            }
        }
        Settings.valid = !error;
        return error;
    }

    private static exists(filePath: string, isExecutable: boolean): boolean {
        if (fs.existsSync(filePath)) {
            return true;
        }
        if (filePath.indexOf("/") < 0 && filePath.indexOf("\\") < 0) {
            //check if the pointed file is accessible via path variable

            // commandExists(filePath, function (err, commandExists) {
            //     if (commandExists) {
            //         return true;
            //     }
            //     else {
            //         return false;
            //     }
            // });

            let pathEnvVar: string = process.env.PATH;
            let paths: string[];
            if (Settings.isWin) {
                paths = pathEnvVar.split(";");
                if (isExecutable && filePath.indexOf(".") < 0) {
                    filePath = filePath + ".exe";
                }
            } else {
                paths = pathEnvVar.split(":");
            }

            return paths.some((element) => {
                if (fs.existsSync(path.join(element, filePath))) {
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

        for (var i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend) {
                return "Empty backend detected";
            }
            //name there?
            if (!backend.name || backend.name.length == 0) {
                return "Every backend setting needs a name.";
            }
            //filePath there?
            if (!backend.filePath || backend.filePath.length == 0) {
                return backend.name + ": The backend setting is missing a path";
            }
            //mainMethod there?
            if (!backend.mainMethod || backend.mainMethod.length == 0) {
                return backend.name + ": The backend setting is missing a mainMethod";
            }
            //command there?
            if (!backend.command || backend.command.length == 0) {
                return backend.name + ": The backend setting is missing the command";
            }
            //check path
            //is path environment variable
            let envVarValue = Settings.extractEnvVar(backend.filePath);
            if (!envVarValue) {
                return backend.name + ": Environment varaible " + backend.filePath + " is not set.";
            }
            //-> set filePath to environment variable value
            backend.filePath = envVarValue;
            //is absolute filePath
            if (Settings.isWin) {
                if (backend.filePath.indexOf(":") < 0) {
                    return backend.name + ": The path to the backend jar-file must be absolute.";
                }
            }
            //does path point to a .jar file
            if (!backend.filePath.endsWith(".jar")) {
                return backend.name + ": The backend path must point ot the backend's jar-file.";
            }
            //does file exist?
            if (!fs.existsSync(backend.filePath)) {
                return backend.name + ": File not found: " + backend.filePath + " ";
            }
            //-> the filePaths seem right

            //check mainMethod:
            //TODO: 
        }
        return null;
    }

    public static backendJars(settings: IveSettings): string {
        let backendJars = "";
        settings.verificationBackends.forEach(backend => {
            if (Settings.isWin) {
                backendJars = backendJars + ";" + backend.filePath;
            } else {
                backendJars = backendJars + ":" + backend.filePath;
            }
        });
        return backendJars;
    }

    public static extractEnvVar(filePath: string): string {
        if (filePath && filePath.length > 2) {
            if (filePath.startsWith("%") && filePath.endsWith("%")) {
                let envName = filePath.substr(1, filePath.length - 2);
                let envValue = process.env[envName];
                //is environment variable set?
                if (!envValue) {
                    return null;
                }
                return envValue;
            }
        }
        return filePath;
    }

}