'use strict';
var fs = require('fs');
var pathHelper = require('path');
var commandExists = require('command-exists');
var Log_1 = require('./Log');
var Settings = (function () {
    function Settings() {
    }
    Settings.getBackendNames = function (settings) {
        var backendNames = [];
        settings.verificationBackends.forEach(function (backend) {
            backendNames.push(backend.name);
        });
        return backendNames;
    };
    Settings.areValid = function () {
        return Settings.valid;
    };
    Settings.checkSettings = function (settings) {
        Log_1.Log.log("Checking Backends...");
        var error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            Log_1.Log.log("Checking Other Settings...");
            if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                error = "Path to nailgun server jar is missing";
            }
            else {
                var envVar = Settings.extractEnvVar(settings.nailgunServerJar);
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
                var envVar = Settings.extractEnvVar(settings.nailgunClient);
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
                var envVar = Settings.extractEnvVar(settings.z3Executable);
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
        Settings.valid = !error;
        return error;
    };
    Settings.exists = function (path, isExecutable) {
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
            var pathEnvVar = process.env.PATH;
            var pathList = void 0;
            if (Settings.isWin) {
                pathList = pathEnvVar.split(";");
                if (isExecutable && path.indexOf(".") < 0) {
                    path = path + ".exe";
                }
            }
            else {
                pathList = pathEnvVar.split(":");
            }
            return pathList.some(function (element) {
                if (fs.existsSync(pathHelper.join(element, path))) {
                    return true;
                }
                else {
                    return false;
                }
            });
        }
    };
    Settings.areBackendsValid = function (backends) {
        if (!backends || backends.length == 0) {
            return "No backend detected, specify at least one backend";
        }
        for (var i = 0; i < backends.length; i++) {
            var backend = backends[i];
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
            for (var i_1 = 0; i_1 < backend.paths.length; i_1++) {
                var path = backend.paths[i_1];
                //extract environment variable or leave unchanged
                path = Settings.extractEnvVar(path);
                if (!path) {
                    return backend.name + ": Environment varaible " + path + " is not set.";
                }
                //-> set path to environment variable value
                backend.paths[i_1] = path;
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
    };
    Settings.backendJars = function (backend) {
        var backendJars = "";
        var concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(function (path) {
            if (isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + path;
            }
            else {
                //its a folder
                var files = fs.readdirSync(path);
                files.forEach(function (file) {
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
    };
    Settings.extractEnvVar = function (path) {
        if (path && path.length > 2) {
            if (path.startsWith("%") && path.endsWith("%")) {
                var envName = path.substr(1, path.length - 2);
                var envValue = process.env[envName];
                return envValue; //null means the Environment Variable is not set
            }
        }
        return path;
    };
    Settings.isWin = /^win/.test(process.platform);
    Settings.valid = false;
    return Settings;
}());
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLElBQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLElBQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlDLG9CQUFrQixPQUFPLENBQUMsQ0FBQTtBQWdCMUI7SUFBQTtJQXVNQSxDQUFDO0lBL0xpQix3QkFBZSxHQUE3QixVQUE4QixRQUFxQjtRQUMvQyxJQUFJLFlBQVksR0FBRyxFQUFFLENBQUM7UUFDdEIsUUFBUSxDQUFDLG9CQUFvQixDQUFDLE9BQU8sQ0FBQyxVQUFDLE9BQU87WUFDMUMsWUFBWSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEMsQ0FBQyxDQUFDLENBQUE7UUFDRixNQUFNLENBQUMsWUFBWSxDQUFDO0lBQ3hCLENBQUM7SUFFYSxpQkFBUSxHQUF0QjtRQUNJLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDO0lBQzFCLENBQUM7SUFFYSxzQkFBYSxHQUEzQixVQUE0QixRQUFxQjtRQUM3QyxTQUFHLENBQUMsR0FBRyxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDaEMsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3JFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxHQUFHLENBQUMsNEJBQTRCLENBQUMsQ0FBQztZQUN0QyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FB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