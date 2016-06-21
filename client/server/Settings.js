'use strict';
const fs = require('fs');
const pathHelper = require('path');
var commandExists = require('command-exists');
const Log_1 = require('./Log');
class Settings {
    static getBackendNames(settings) {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        });
        return backendNames;
    }
    static checkSettings(settings) {
        settings.valid = false;
        Log_1.Log.log("Checking Backends...");
        let error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            Log_1.Log.log("Checking Other Settings...");
            if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                error = "Path to nailgun server jar is missing";
            }
            else {
                let envVar = Settings.extractEnvVar(settings.nailgunServerJar);
                if (!envVar) {
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
                error = "Path to nailgun client executable is missing";
            }
            else {
                let envVar = Settings.extractEnvVar(settings.nailgunClient);
                if (!envVar) {
                    error = "No nailgunClient file found at path, in %ENV_VAR%, or in the environment PATH: " + settings.nailgunServerJar;
                }
                else if (!Settings.exists(envVar, true)) {
                    error = "No file found at path: " + envVar;
                }
                else {
                    settings.nailgunClient = envVar;
                }
            }
        }
        if (!error) {
            if (!settings.z3Executable || settings.z3Executable.length == 0) {
                error = "Path to z3 executable is missing";
            }
            else {
                let envVar = Settings.extractEnvVar(settings.z3Executable);
                if (!envVar) {
                    error = "No z3 Executable found at path, in %ENV_VAR%, or in the environment PATH: " + settings.nailgunServerJar;
                }
                else if (!Settings.exists(envVar, true)) {
                    error = "No file found at path: " + envVar;
                }
                else {
                    settings.z3Executable = envVar;
                }
            }
        }
        settings.valid = !error;
        Log_1.Log.log("Settings error: " + (settings ? settings : ""));
        return error;
    }
    static exists(path, isExecutable) {
        if (!path) {
            return false;
        }
        ;
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
            let pathEnvVar = process.env.PATH;
            let pathList;
            if (Settings.isWin) {
                pathList = pathEnvVar.split(";");
                if (isExecutable && path.indexOf(".") < 0) {
                    path = path + ".exe";
                }
            }
            else {
                pathList = pathEnvVar.split(":");
            }
            return pathList.some((element) => {
                if (fs.existsSync(pathHelper.join(element, path))) {
                    return true;
                }
                else {
                    return false;
                }
            });
        }
    }
    static areBackendsValid(backends) {
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
        }
        return null;
    }
    static backendJars(backend) {
        let backendJars = "";
        let concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(path => {
            if (isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + path;
            }
            else {
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
        function isJar(file) {
            return file.endsWith(".jar");
        }
    }
    static extractEnvVar(path) {
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
Settings.isWin = /^win/.test(process.platform);
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQWlCMUI7SUFRSSxPQUFjLGVBQWUsQ0FBQyxRQUFxQjtRQUMvQyxJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7UUFDdEIsUUFBUSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU87WUFDMUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUE7UUFDRixNQUFNLENBQUMsWUFBWSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxPQUFjLGFBQWEsQ0FBQyxRQUFxQjtRQUM3QyxRQUFRLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUN2QixTQUFHLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDaEMsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3JFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLEtBQUssR0FBRyx1Q0FBdUMsQ0FBQTtZQUNuRCxDQUFD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