'use strict';
const fs = require('fs');
const path = require('path');
var commandExists = require('command-exists');
class Settings {
    static areSettingsValid(settings) {
        let error = Settings.areBackendsValid(settings.verificationBackends);
        if (!error) {
            if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                error = "Path to nailgun server jar is missing";
            }
            else {
                let envVar = Settings.extractEnvVar(settings.nailgunServerJar);
                if (!Settings.exists(envVar)) {
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
                if (!Settings.exists(envVar)) {
                    error = "No file found at path: " + envVar;
                }
                settings.nailgunClient = envVar;
            }
        }
        return error;
    }
    static exists(filePath) {
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
            let pathEnvVar = process.env.PATH;
            let paths;
            if (Settings.isWin) {
                paths = pathEnvVar.split(";");
            }
            else {
                paths = pathEnvVar.split(":");
            }
            return paths.some((element) => {
                if (fs.existsSync(path.join(element, filePath))) {
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
        }
        return null;
    }
    static backendJars(settings) {
        let backendJars = "";
        settings.verificationBackends.forEach(backend => {
            if (Settings.isWin) {
                backendJars = backendJars + ";" + backend.filePath;
            }
            else {
                backendJars = backendJars + ":" + backend.filePath;
            }
        });
        return backendJars;
    }
    static extractEnvVar(filePath) {
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
Settings.isWin = /^win/.test(process.platform);
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksSUFBSSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQzdCLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBZ0I5QztJQUtJLE9BQWMsZ0JBQWdCLENBQUMsUUFBcUI7UUFDaEQsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3JFLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUNULEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLGdCQUFnQixJQUFJLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEUsS0FBSyxHQUFHLHVDQUF1QyxDQUFBO1lBQ25ELENBQUM7WUFBQyxJQUFJLENBQUMsQ0FBQztnQkFDSixJQUFJLE1BQU0sR0FBRyxRQUFRLENBQUMsYUFBYSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFBO2dCQUM5RCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMzQixLQUFLLEdBQUcseUJBQXlCLEdBQUcsTUFBTSxDQUFDO2dCQUMvQyxDQUFDO2dCQUNELFFBQVEsQ0FBQyxnQkFBZ0IsR0FBRyxNQUFNLENBQUM7WUFDdkMsQ0FBQztRQUNMLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7WUFDVCxFQUFFLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxhQUFhLElBQUks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