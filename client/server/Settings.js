'use strict';
var fs = require('fs');
var Settings = (function () {
    function Settings() {
    }
    Settings.valid = function (backends) {
        if (!backends || backends.length == 0) {
            return "No backend detected, specify at least one backend";
        }
        for (var i = 0; i < backends.length; i++) {
            var backend = backends[i];
            //name there?
            if (!backend.name || backend.name.length == 0) {
                return "Every backend setting needs a name.";
            }
            //path there?
            if (!backend.path || backend.path.length == 0) {
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
            var envVarValue = Settings.extractEnvVar(backend.path);
            if (!envVarValue) {
                return backend.name + ": Environment varaible " + backend.path + " is not set.";
            }
            //-> set path to environment variable value
            backend.path = envVarValue;
            //is absolute path
            if (backend.path.indexOf(":") < 0) {
                return backend.name + ": The path to the backend jar-file must be absolute.";
            }
            //does path point to a .jar file
            if (!backend.path.endsWith(".jar")) {
                return backend.name + ": The backend path must point ot the backend's jar-file.";
            }
            //does file exist?
            if (!fs.existsSync(backend.path)) {
                return backend.name + ": File not found: " + backend.path + " ";
            }
        }
        return null;
    };
    Settings.extractEnvVar = function (path) {
        if (path.startsWith("%") && path.endsWith("%")) {
            var envName = path.substr(1, path.length - 2);
            var envValue = process.env[envName];
            //is environment variable set?
            if (!envValue) {
                return null;
            }
            return envValue;
        }
        else
            return path;
    };
    return Settings;
}());
exports.Settings = Settings;
//# sourceMappingURL=Settings.js.map