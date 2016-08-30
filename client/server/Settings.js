'use strict';
const fs = require('fs');
const pathHelper = require('path');
var commandExists = require('command-exists');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
class Settings {
    static getStage(backend, name) {
        if (!name)
            return null;
        for (let i = 0; i < backend.stages.length; i++) {
            let stage = backend.stages[i];
            if (stage.name === name)
                return stage;
        }
        return null;
    }
    static getStageFromSuccess(backend, stage, success) {
        switch (success) {
            case ViperProtocol_1.Success.ParsingFailed:
                return this.getStage(backend, stage.onParsingError);
            case ViperProtocol_1.Success.VerificationFailed:
                return this.getStage(backend, stage.onVerificationError);
            case ViperProtocol_1.Success.TypecheckingFailed:
                return this.getStage(backend, stage.onTypeCheckingError);
            case ViperProtocol_1.Success.Success:
                return this.getStage(backend, stage.onSuccess);
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
        same = same && a.name == b.name;
        same = same && a.isVerification == b.isVerification;
        same = same && a.onParsingError == b.onParsingError;
        same = same && a.onTypeCheckingError == b.onTypeCheckingError;
        same = same && a.onVerificationError == b.onVerificationError;
        same = same && a.onSuccess == b.onSuccess;
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
    static valid() {
        if (!this.valid)
            ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.InvalidSettings, this._error);
        return this._valid;
    }
    static checkSettings(settings) {
        try {
            this._valid = false;
            Log_1.Log.log("Checking Backends...", ViperProtocol_1.LogLevel.Debug);
            this._error = Settings.areBackendsValid(settings.verificationBackends);
            if (!this._error) {
                if (!settings.nailgunPort) {
                    this._error = "NailgunPort is missing";
                }
                else if (!/\d+/.test(settings.nailgunPort)) {
                    this._error = "Invalid NailgunPort: " + settings.nailgunPort;
                }
                Log_1.Log.log("Checking Other Settings...", ViperProtocol_1.LogLevel.Debug);
                if (!settings.nailgunServerJar || settings.nailgunServerJar.length == 0) {
                    this._error = "Path to nailgun server jar is missing";
                }
                else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunServerJar);
                    if (!resolvedPath.exists) {
                        this._error = "No nailgun server jar file found at path: " + resolvedPath.path;
                    }
                    settings.nailgunServerJar = resolvedPath.path;
                }
            }
            if (!this._error) {
                if (!settings.nailgunClient || settings.nailgunClient.length == 0) {
                    this._error = "Path to nailgun client executable is missing";
                }
                else {
                    let resolvedPath = Settings.resolvePath(settings.nailgunClient);
                    if (!resolvedPath.exists) {
                        this._error = "No nailgun client executable file found at path: " + resolvedPath.path;
                    }
                    else {
                        settings.nailgunClient = resolvedPath.path;
                    }
                }
            }
            if (!this._error) {
                if (!settings.z3Executable || settings.z3Executable.length == 0) {
                    this._error = "Path to z3 executable is missing";
                }
                else {
                    let resolvedPath = Settings.resolvePath(settings.z3Executable);
                    if (!resolvedPath.exists) {
                        this._error = "No z3 executable file found at path: " + resolvedPath.path;
                    }
                    else {
                        settings.z3Executable = resolvedPath.path;
                    }
                }
            }
            this._valid = !this._error;
            if (this._valid) {
                Log_1.Log.log("The settings are ok", ViperProtocol_1.LogLevel.Info);
            }
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
                if (!stage.name || stage.name.length == 0)
                    return "Every stage needs a name.";
                if (stages.has(stage.name))
                    return "Dublicated stage name: " + backend.name + ":" + stage.name;
                stages.add(stage.name);
                if (!stage.mainMethod || stage.mainMethod.length == 0)
                    return "Stage: " + stage.name + "is missing a mainMethod";
            }
            for (let i = 0; i < backend.stages.length; i++) {
                let stage = backend.stages[i];
                if (stage.onParsingError && stage.onParsingError.length > 0 && !stages.has(stage.onParsingError))
                    return "Cannot find stage " + stage.name + "'s onParsingError stage";
                if (stage.onTypeCheckingError && stage.onTypeCheckingError.length > 0 && !stages.has(stage.onTypeCheckingError))
                    return "Cannot find stage " + stage.name + "'s onTypeCheckingError stage";
                if (stage.onVerificationError && stage.onVerificationError.length > 0 && !stages.has(stage.onVerificationError))
                    return "Cannot find stage " + stage.name + "'s onVerificationError stage";
                if (stage.onSuccess && stage.onSuccess.length > 0 && !stages.has(stage.onSuccess))
                    return "Cannot find stage " + stage.name + "'s onSuccess stage";
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
Settings._valid = false;
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixnQ0FBeUUsaUJBQWlCLENBQUMsQ0FBQTtBQUMzRiw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFPckM7SUFVSSxPQUFjLFFBQVEsQ0FBQyxPQUFnQixFQUFFLElBQVk7UUFDakQsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ3ZCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQztZQUM3QyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDO2dCQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDMUMsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELE9BQWMsbUJBQW1CLENBQUMsT0FBZ0IsRUFBRSxLQUFZLEVBQUUsT0FBZ0I7UUFDOUUsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNkLEtBQUssdUJBQU8sQ0FBQyxhQUFhO2dCQUN0QixNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLGNB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