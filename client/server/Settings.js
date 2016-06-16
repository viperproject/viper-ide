'use strict';
var fs = require('fs');
var pathHelper = require('path');
var commandExists = require('command-exists');
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
        if (!error) {
            if (!settings.z3Executable || settings.z3Executable.length == 0) {
                error = "Path to z3 executable is missing";
            }
            else {
                var envVar = Settings.extractEnvVar(settings.z3Executable);
                if (!Settings.exists(envVar, true)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLElBQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLElBQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBZ0I5QztJQUFBO0lBMkxBLENBQUM7SUFuTGlCLHdCQUFlLEdBQTdCLFVBQThCLFFBQW9CO1FBQzlDLElBQUksWUFBWSxHQUFHLEVBQUUsQ0FBQztRQUN0QixRQUFRLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLFVBQUMsT0FBTztZQUMxQyxZQUFZLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUNwQyxDQUFDLENBQUMsQ0FBQTtRQUNGLE1BQU0sQ0FBQyxZQUFZLENBQUM7SUFDeEIsQ0FBQztJQUVhLGlCQUFRLEdBQXRCO1FBQ0ksTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7SUFDMUIsQ0FBQztJQUVhLHNCQUFhLEdBQTNCLFVBQTRCLFFBQXFCO1FBQzdDLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNyRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDVCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsSUFBSSxRQUFRLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RFLEtBQUssR0FBRyx1Q0FBdUMsQ0FBQTtZQUNuRCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQTtnQkFDOUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ2xDLEtBQUssR0FBRyx5QkFBeUIsR0FBRyxNQUFNLENBQUM7Z0JBQy9DLENBQUM7Z0JBQ0QsUUFBUSxDQUFDLGdCQUFnQixHQUFHLE1BQU0sQ0FBQztZQUN2QyxDQUFDO1FBQ0wsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNULEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGFBQWEsSUFBSSxRQUFRLENBQUMsYUFBYSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNoRSxLQUFLLEdBQUcsOENBQThDLENBQUE7WUFDMUQsQ0FBQztZQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNKLElBQUksTUFBTSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxDQUFBO2dCQUMzRCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDakMsS0FBSyxHQUFHLHlCQUF5QixHQUFHLE1BQU0sQ0FBQztnQkFDL0MsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixRQUFRLENBQUMsYUFBYSxHQUFHLE1BQU0sQ0FBQztnQkFDcEMsQ0FBQztZQUNMLENBQUM7UUFDTCxDQUFDO1FBQ0QsRUFBRSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ1QsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsWUFBWSxJQUFJLFFBQVEsQ0FBQyxZQUFZLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlELEtBQUssR0FBRyxrQ0FBa0MsQ0FBQTtZQUM5QyxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osSUFBSSxNQUFNLEdBQUcsUUFBUSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLENBQUE7Z0JBQzFELEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNqQyxLQUFLLEdBQUcseUJBQXlCLEdBQUcsTUFBTSxDQUFDO2dCQUMvQyxDQUFDO2dCQUFDLElBQUksQ0FBQyxDQUFDO29CQUNKLFFBQVEsQ0FBQyxZQUFZLEdBQUcsTUFBTSxDQUFDO2dCQUNuQyxDQUFDO1lBQ0wsQ0FBQztRQUNMLENBQUM7UUFDRCxRQUFRLENBQUMsS0FBSyxHQUFHLENBQUMsS0FBSyxDQUFDO1FBQ3hCLE1BQU0sQ0FBQyxLQUFLLENBQUM7SUFDakIsQ0FBQztJQUVjLGVBQU0sR0FBckIsVUFBc0IsSUFBWSxFQUFFLFlBQXFCO1FBQ3JELEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDaEIsQ0FBQztRQUNELEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNsRCwyREFBMkQ7WUFFM0Qsc0RBQXNEO1lBQ3RELDJCQUEyQjtZQUMzQix1QkFBdUI7WUFDdkIsUUFBUTtZQUNSLGFBQWE7WUFDYix3QkFBd0I7WUFDeEIsUUFBUTtZQUNSLE1BQU07WUFFTixJQUFJLFVBQVUsR0FBVyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQztZQUMxQyxJQUFJLFFBQVEsU0FBVSxDQUFDO1lBQ3ZCLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO2dCQUNqQixRQUFRLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDakMsRUFBRSxDQUFDLENBQUMsWUFBWSxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDeEMsSUFBSSxHQUFHLElBQUksR0FBRyxNQUFNLENBQUM7Z0JBQ3pCLENBQUM7WUFDTCxDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osUUFBUSxHQUFHLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDckMsQ0FBQztZQUVELE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLFVBQUMsT0FBTztnQkFDekIsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDaEQsTUFBTSxDQUFDLElBQUksQ0FBQztnQkFDaEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDSixNQUFNLENBQUMsS0FBSyxDQUFDO2dCQUNqQixDQUFDO1lBQ0wsQ0FBQyxDQUFDLENBQUM7UUFDUCxDQUFDO0lBQ0wsQ0FBQztJQUVjLHlCQUFnQixHQUEvQixVQUFnQyxRQUFtQjtRQUMvQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEMsTUFBTSxDQUFDLG1EQUFtRCxDQUFDO1FBQy9ELENBQUM7UUFFRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUN2QyxJQUFJLE9BQU8sR0FBRyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDMUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO2dCQUNYLE1BQU0sQ0FBQyx3QkFBd0IsQ0FBQztZQUNwQyxDQUFDO1lBQ0QsYUFBYTtZQUNiLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM1QyxNQUFNLENBQUMscUNBQXFDLENBQUM7WUFDakQsQ0FBQztZQUNELGFBQWE7WUFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLElBQUksT0FBTyxDQUFDLEtBQUssQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDOUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsK0NBQStDLENBQUM7WUFDMUUsQ0FBQztZQUNELG1CQUFtQjtZQUNuQixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLElBQUksT0FBTyxDQUFDLFVBQVUsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsK0NBQStDLENBQUM7WUFDMUUsQ0FBQztZQUVELGFBQWE7WUFDYixHQUFHLENBQUMsQ0FBQyxJQUFJLEdBQUMsR0FBRyxDQUFDLEVBQUUsR0FBQyxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLEdBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQzVDLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBQyxDQUFDLENBQUM7Z0JBRTVCLGlEQUFpRDtnQkFDakQsSUFBSSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztvQkFDUixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyx5QkFBeUIsR0FBRyxJQUFJLEdBQUcsY0FBYyxDQUFDO2dCQUM1RSxDQUFDO2dCQUNELDJDQUEyQztnQkFDM0MsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFDLENBQUMsR0FBRyxJQUFJLENBQUM7Z0JBQ3hCLGtCQUFrQjtnQkFDbEIsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7b0JBQ2pCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDeEIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsc0RBQXNELENBQUM7b0JBQ2pGLENBQUM7Z0JBQ0wsQ0FBQztnQkFFRCw0QkFBNEI7Z0JBQzVCLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQ3ZCLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLGdDQUFnQyxHQUFHLElBQUksR0FBRyxHQUFHLENBQUM7Z0JBQ3hFLENBQUM7WUFDTCxDQUFDO1FBS0wsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVhLG9CQUFXLEdBQXpCLFVBQTBCLE9BQWdCO1FBQ3RDLElBQUksV0FBVyxHQUFHLEVBQUUsQ0FBQztRQUVyQixJQUFJLG1CQUFtQixHQUFHLFFBQVEsQ0FBQyxLQUFLLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztRQUNyRCxPQUFPLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFBLElBQUk7WUFDdEIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDZCxnQkFBZ0I7Z0JBQ2hCLFdBQVcsR0FBRyxXQUFXLEdBQUcsbUJBQW1CLEdBQUcsSUFBSSxDQUFDO1lBQzNELENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixjQUFjO2dCQUNkLElBQUksS0FBSyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ2pDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBQSxJQUFJO29CQUNkLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ2QsV0FBVyxHQUFHLFdBQVcsR0FBRyxtQkFBbUIsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksRUFBQyxJQUFJLENBQUMsQ0FBQztvQkFDakYsQ0FBQztnQkFDTCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUNILE1BQU0sQ0FBQyxXQUFXLENBQUM7UUFFbkIsZUFBZSxJQUFZO1lBQ3ZCLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2pDLENBQUM7SUFDTCxDQUFDO0lBRWEsc0JBQWEsR0FBM0IsVUFBNEIsSUFBWTtRQUNwQyxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzdDLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQzlDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBQ3BDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxnREFBZ0Q7WUFDckUsQ0FBQztRQUNMLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUF2TGEsY0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBRXJDLGNBQUssR0FBWSxLQUFLLENBQUM7SUFzTDFDLGVBQUM7QUFBRCxDQUFDLEFBM0xELElBMkxDO0FBM0xZLGdCQUFRLFdBMkxwQixDQUFBIn0=