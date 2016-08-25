'use strict';
const fs = require('fs');
const pathHelper = require('path');
var commandExists = require('command-exists');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
class Settings {
    static getVerifyStage(backend) {
        return this.getStage(backend, this.VERIFY);
    }
    static getStage(backend, type) {
        for (let i = 0; i < backend.stages.length; i++) {
            let stage = backend.stages[i];
            if (stage.type === type)
                return stage;
        }
        return null;
    }
    static backendEquals(a, b) {
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
    static stageEquals(a, b) {
        let same = a.customArguments == b.customArguments;
        same = same && a.mainMethod == b.mainMethod;
        same = same && a.type == b.type;
        same = same && a.onError == b.onError;
        return same;
    }
    static autoselectBackend(settings) {
        if (!settings || !settings.verificationBackends || settings.verificationBackends.length == 0) {
            Log_1.Log.error("No backend, even though the setting check succeeded.");
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
    static getBackendNames(settings) {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        });
        return backendNames;
    }
    static checkSettings(settings) {
        try {
            settings.valid = false;
            Log_1.Log.log("Checking Backends...", ViperProtocol_1.LogLevel.Debug);
            let error = Settings.areBackendsValid(settings.verificationBackends);
            if (!error) {
                if (!settings.nailgunPort) {
                    error = "NailgunPort is missing";
                }
                else if (!/\d+/.test(settings.nailgunPort)) {
                    error = "Invalid NailgunPort: " + settings.nailgunPort;
                }
                Log_1.Log.log("Checking Other Settings...", ViperProtocol_1.LogLevel.Debug);
                if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                    error = "Path to nailgun server jar is missing";
                }
                else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunServerJar);
                    if (!resolvedPath.exists) {
                        error = "No nailgun server jar file found at path: " + resolvedPath.path;
                    }
                    settings.nailgunServerJar = resolvedPath.path;
                }
            }
            if (!error) {
                if (!settings.nailgunClient || settings.nailgunClient.length == 0) {
                    error = "Path to nailgun client executable is missing";
                }
                else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunClient);
                    if (!resolvedPath.exists) {
                        error = "No nailgun client executable file found at path: " + resolvedPath.path;
                    }
                    else {
                        settings.nailgunClient = resolvedPath.path;
                    }
                }
            }
            if (!error) {
                if (!settings.z3Executable || settings.z3Executable.length == 0) {
                    error = "Path to z3 executable is missing";
                }
                else {
                    let resolvedPath = Settings.resolvePath(settings.z3Executable);
                    if (!resolvedPath.exists) {
                        error = "No z3 executable file found at path: " + resolvedPath.path;
                    }
                    else {
                        settings.z3Executable = resolvedPath.path;
                    }
                }
            }
            settings.valid = !error;
            return error;
        }
        catch (e) {
            Log_1.Log.error("Error checking settings: " + e);
        }
    }
    static areBackendsValid(backends) {
        if (!backends || backends.length == 0) {
            return "No backend detected, specify at least one backend";
        }
        let backendNames = new Set();
        for (let i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend)
                return "Empty backend detected";
            //name there?
            if (!backend.name || backend.name.length == 0)
                return "Every backend setting needs a name.";
            //check for dublicate backends
            if (backendNames.has(backend.name))
                return "Dublicated backend name: " + backend.name;
            backendNames.add(backend.name);
            //check stages
            if (!backend.stages || backend.stages.length == 0)
                return backend.name + ": The backend setting needs at least one stage";
            let stages = new Set();
            let verifyStageFound = false;
            for (let i = 0; i < backend.stages.length; i++) {
                let stage = backend.stages[i];
                if (!stage)
                    return "Empty stage detected";
                if (!stage.type || stage.type.length == 0)
                    return "Every stage needs a type.";
                if (stages.has(stage.type))
                    return "Dublicated stage type: " + backend.name + ":" + stage.type;
                stages.add(stage.type);
                if (stage.type && stage.type == "verify") {
                    if (verifyStageFound)
                        return "You can only have one stage with type verify";
                    verifyStageFound = true;
                }
                if (!stage.mainMethod || stage.mainMethod.length == 0)
                    return "Stage: " + stage.type + "is missing a mainMethod";
            }
            if (!verifyStageFound)
                return "You must have exactly one stage with type verify";
            for (let i = 0; i < backend.stages.length; i++) {
                let stage = backend.stages[i];
                if (stage.onError && stage.onError.length > 0 && !stages.has(stage.onError))
                    return "Cannot find stage " + stage.type + "'s onError stage";
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
        }
        return null;
    }
    static backendJars(backend) {
        let backendJars = "";
        let concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(path => {
            if (this.isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + path;
            }
            else {
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
    static isJar(file) {
        return file ? file.trim().endsWith(".jar") : false;
    }
    static extractEnvVars(path) {
        if (path && path.length > 2) {
            while (path.indexOf("%") >= 0) {
                let start = path.indexOf("%");
                let end = path.indexOf("%", start + 1);
                if (end < 0) {
                    Log_1.Log.error("unbalanced % in path: " + path, ViperProtocol_1.LogLevel.Info);
                    return null;
                }
                let envName = path.substring(start + 1, end);
                let envValue = process.env[envName];
                if (!envValue) {
                    Log_1.Log.error("environment variable : " + envName + " is not set", ViperProtocol_1.LogLevel.Info);
                    return null;
                }
                if (envValue.indexOf("%") >= 0) {
                    Log_1.Log.error("environment variable: " + envName + " must not contain %: " + envValue, ViperProtocol_1.LogLevel.Info);
                    return null;
                }
                path = path.substring(0, start - 1) + envValue + path.substring(end + 1, path.length);
            }
        }
        return path;
    }
    static resolvePath(path) {
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
        let resolvedPath;
        //handle files in Path env var
        if (path.indexOf("/") < 0 && path.indexOf("\\") < 0) {
            //its only a filename, try to find it in the path
            let pathEnvVar = process.env.PATH;
            if (pathEnvVar) {
                let pathList = pathEnvVar.split(Settings.isWin ? ";" : ":");
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
        }
        else {
            //handle absolute and relative paths
            resolvedPath = this.toAbsolute(path);
            if (fs.existsSync(resolvedPath)) {
                return { path: resolvedPath, exists: true };
            }
        }
        return { path: resolvedPath, exists: false };
    }
    static toAbsolute(path) {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}
Settings.isWin = /^win/.test(process.platform);
Settings.VERIFY = "verify";
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixnQ0FBc0QsaUJBQWlCLENBQUMsQ0FBQTtBQVV4RTtJQVdJLE9BQWMsY0FBYyxDQUFDLE9BQWdCO1FBQ3pDLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELE9BQWMsUUFBUSxDQUFDLE9BQWdCLEVBQUUsSUFBWTtRQUNqRCxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDN0MsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQztnQkFBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQzFDLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxPQUFjLGFBQWEsQ0FBQyxDQUFVLEVBQUUsQ0FBVTtRQUM5QyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDWCxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ2pCLENBQUM7UUFDRCxJQUFJLElBQUksR0FBRyxDQUFD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