'use strict';
var fs = require('fs');
var path = require('path');
var commandExists = require('command-exists');
var Settings = (function () {
    function Settings() {
    }
    Settings.areValid = function () {
        return Settings.valid;
    };
    Settings.checkSettings = function (settings) {
        var error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                error = "Path to nailgun server jar is missing";
            }
            else {
                var envVar = Settings.extractEnvVar(settings.nailgunServerJar);
                if (!Settings.exists(envVar, false)) {
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
                if (!Settings.exists(envVar, true)) {
                    error = "No file found at path: " + envVar;
                }
                else {
                    settings.nailgunClient = envVar;
                }
            }
        }
        Settings.valid = !error;
        return error;
    };
    Settings.exists = function (filePath, isExecutable) {
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
            var pathEnvVar = process.env.PATH;
            var paths = void 0;
            if (Settings.isWin) {
                paths = pathEnvVar.split(";");
                if (isExecutable && filePath.indexOf(".") < 0) {
                    filePath = filePath + ".exe";
                }
            }
            else {
                paths = pathEnvVar.split(":");
            }
            return paths.some(function (element) {
                if (fs.existsSync(path.join(element, filePath))) {
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
            var envVarValue = Settings.extractEnvVar(backend.filePath);
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
        }
        return null;
    };
    Settings.backendJars = function (settings) {
        var backendJars = "";
        settings.verificationBackends.forEach(function (backend) {
            if (Settings.isWin) {
                backendJars = backendJars + ";" + backend.filePath;
            }
            else {
                backendJars = backendJars + ":" + backend.filePath;
            }
        });
        return backendJars;
    };
    Settings.extractEnvVar = function (filePath) {
        if (filePath && filePath.length > 2) {
            if (filePath.startsWith("%") && filePath.endsWith("%")) {
                var envName = filePath.substr(1, filePath.length - 2);
                var envValue = process.env[envName];
                //is environment variable set?
                if (!envValue) {
                    return null;
                }
                return envValue;
            }
        }
        return filePath;
    };
    Settings.isWin = /^win/.test(process.platform);
    Settings.valid = false;
    return Settings;
}());
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLElBQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLElBQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBZ0I5QztJQUFBO0lBZ0tBLENBQUM7SUF6SmlCLGlCQUFRLEdBQXRCO1FBQ0ksTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7SUFDMUIsQ0FBQztJQUVhLHNCQUFhLEdBQTNCLFVBQTRCLFFBQXFCO1FBQzdDLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNyRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDVCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLEtBQUssR0FBRyx1Q0FBdUMsQ0FBQTtZQUNuRCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtnQkFDOUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xDLEtBQUssR0FBRyx5QkFBeUIsR0FBRyxNQUFNLENBQUM7Z0JBQy9DLENBQUM7Z0JBQ0QsUUFBUSxDQUFDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQztZQUN2QyxDQUFDO1FBQ0wsQ0FB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