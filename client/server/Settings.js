'use strict';
const fs = require('fs');
const pathHelper = require('path');
var commandExists = require('command-exists');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
const os = require('os');
class Settings {
    static computeDefaultViperToolsPath() {
        try {
            if (this.isWin) {
                return pathHelper.join(this.extractEnvVars("%ProgramFiles%").path, "Viper\\");
            }
            else {
                return "/usr/local/Viper/";
            }
        }
        catch (e) {
            Log_1.Log.error("Error computing default viper tools path");
        }
    }
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
        same = same && a.timeout === b.timeout;
        same = same && a.useNailgun === b.useNailgun;
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
    static nailgunEquals(a, b) {
        let same = a.clientExecutable == b.clientExecutable;
        same = same && a.port == b.port;
        same = same && a.serverJar == b.serverJar;
        same = same && a.timeout == b.timeout;
        return same;
    }
    static expandCustomArguments(stage, fileToVerify, backend) {
        let args = stage.customArguments;
        if (!args || args.length == 0)
            return "";
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.z3Executable + '"');
        args = args.replace(/\$boogieExe\$/g, '"' + this.settings.boogieExecutable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$nailgunPort\$/g, this.settings.nailgunSettings.port);
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        args = args.replace(/\$backendPaths\$/g, Settings.backendJars(backend));
        return args;
    }
    static expandViperToolsPath(path) {
        if (!path)
            return path;
        path = path.replace(/\$defaultViperToolsPath\$/g, this.defaultViperToolsPath);
        path = path.replace(/\$viperTools\$/g, Settings.settings.viperToolsPath);
        return path;
    }
    static autoselectBackend(settings) {
        if (!settings || !settings.verificationBackends || settings.verificationBackends.length == 0) {
            this.selectedBackend = null;
            return null;
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
        if (!this._valid)
            ServerClass_1.Server.sendInvalidSettingsNotification(this._errors);
        return this._valid;
    }
    static checkNailgunSettings(nailgunSettings) {
        if (!nailgunSettings) {
            this.addError("viperSettings.nailgunSettings is missing");
            return;
        }
        //check nailgun port
        if (!nailgunSettings.port) {
            this.addError("NailgunPort is missing");
        }
        else if (!/\d+/.test(nailgunSettings.port)) {
            this.addError("Invalid NailgunPort: " + nailgunSettings.port);
        }
        else {
            try {
                let port = Number.parseInt(nailgunSettings.port);
                if (port < 1024 || port > 65535) {
                    this.addError("Invalid NailgunPort: please use a port in the range of 1024 - 65535");
                }
            }
            catch (e) {
                this.addError("viperSettings.nailgunSettings.port needs to be an integer");
            }
        }
        //check nailgun jar
        if (!nailgunSettings.serverJar || nailgunSettings.serverJar.length == 0) {
            this.addError("Path to nailgun server jar is missing");
        }
        else {
            nailgunSettings.serverJar = Settings.checkPath(nailgunSettings.serverJar, "Nailgun Server:", false).path;
        }
        //check nailgun client
        if (!nailgunSettings.clientExecutable || nailgunSettings.clientExecutable.length == 0) {
            return "Path to nailgun client executable is missing";
        }
        else {
            nailgunSettings.clientExecutable = Settings.checkPath(nailgunSettings.clientExecutable, "Nailgun Client:", true).path;
        }
        //check nailgun timeout
        if (!nailgunSettings.timeout || (nailgunSettings.timeout && nailgunSettings.timeout <= 0)) {
            nailgunSettings.timeout = null;
        }
        return null;
    }
    static addError(msg) {
        this._errors.push({ type: ViperProtocol_1.SettingsErrorType.Error, msg: msg });
    }
    static addWarning(msg) {
        this._errors.push({ type: ViperProtocol_1.SettingsErrorType.Warning, msg: msg });
    }
    static checkSettings() {
        try {
            //Attempt for typechecking
            // for (let p in settings) {
            //     Log.log("Settings property " + p);
            // }
            // let temp = new ViperSettings();
            // for (let p in temp) {
            //     Log.log("Interface property " + p);
            // }
            this._valid = false;
            this._errors = [];
            let settings = Settings.settings;
            this.defaultViperToolsPath = Settings.computeDefaultViperToolsPath();
            //check viperToolsPath
            if (!settings.viperToolsPath || settings.viperToolsPath.length == 0) {
                //its ok to have none
                this.addWarning("No ViperToolsPath is specified, use the default one");
                settings.viperToolsPath = this.defaultViperToolsPath;
            }
            else {
                //if there is one check it
                let resolvedPath = this.checkPath(settings.viperToolsPath, "Path to Viper Tools:", false);
                settings.viperToolsPath = resolvedPath.path;
                if (!resolvedPath.exists)
                    return;
            }
            //check backends
            Settings.checkBackends(settings.verificationBackends);
            //check nailgun settings
            let useNailgun = settings.verificationBackends.some(elem => elem.useNailgun);
            if (useNailgun) {
                Log_1.Log.log("Checking nailgun settings...", ViperProtocol_1.LogLevel.Debug);
                this.checkNailgunSettings(settings.nailgunSettings);
            }
            //check z3 executable
            Log_1.Log.log("Checking other settings...", ViperProtocol_1.LogLevel.Debug);
            if (!settings.z3Executable || settings.z3Executable.length == 0) {
                this.addError("Path to z3 executable is missing");
            }
            else {
                settings.z3Executable = this.checkPath(settings.z3Executable, "z3 Executable:", true).path;
            }
            //check boogie executable
            if (settings.boogieExecutable && settings.z3Executable.length > 0) {
                settings.boogieExecutable = this.checkPath(settings.boogieExecutable, `Boogie Executable: (If you don't need boogie, set it to "")`, true).path;
            }
            this._valid = !this._errors.some(error => error.type == ViperProtocol_1.SettingsErrorType.Error); //if there is no error -> valid
            if (this._valid) {
                Log_1.Log.log("The settings are ok", ViperProtocol_1.LogLevel.Info);
            }
        }
        catch (e) {
            Log_1.Log.error("Error checking settings: " + e);
        }
    }
    static checkPath(path, prefix, executable) {
        if (!path || path.length == 0) {
            this.addError(prefix + " path is missing");
            return { path: path, exists: false };
        }
        let resolvedPath = Settings.resolvePath(path, executable);
        if (!resolvedPath.exists) {
            this.addError(prefix + ' path not found: "' + path + '"' + (resolvedPath.path != path ? ' which expands to "' + resolvedPath.path + '"' : "") + (" " + resolvedPath.error || ""));
        }
        return resolvedPath;
    }
    static checkBackends(backends) {
        Log_1.Log.log("Checking backends...", ViperProtocol_1.LogLevel.Debug);
        if (!backends || backends.length == 0) {
            this.addError("No backend detected, specify at least one backend");
            return;
        }
        let backendNames = new Set();
        for (let i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend) {
                this.addError("Empty backend detected");
            }
            else if (!backend.name || backend.name.length == 0) {
                this.addError("Every backend setting needs a name.");
            }
            else {
                let backendName = "Backend " + backend.name + ":";
                //check for dublicate backends
                if (backendNames.has(backend.name))
                    this.addError("Dublicated backend name: " + backend.name);
                backendNames.add(backend.name);
                //check stages
                if (!backend.stages || backend.stages.length == 0) {
                    this.addError(backendName + " The backend setting needs at least one stage");
                    continue;
                }
                let stages = new Set();
                let verifyStageFound = false;
                for (let i = 0; i < backend.stages.length; i++) {
                    let stage = backend.stages[i];
                    if (!stage) {
                        this.addError(backendName + " Empty stage detected");
                    }
                    else if (!stage.name || stage.name.length == 0) {
                        this.addError(backendName + " Every stage needs a name.");
                    }
                    else {
                        let backendAndStage = backendName + " Stage: " + stage.name + ":";
                        //check for duplicated stage names
                        if (stages.has(stage.name))
                            this.addError(backendName + " Duplicated stage name: " + stage.name);
                        stages.add(stage.name);
                        //check mainMethod
                        if (!stage.mainMethod || stage.mainMethod.length == 0)
                            this.addError(backendAndStage + " Missing mainMethod");
                        //check customArguments
                        if (!stage.customArguments) {
                            this.addError(backendAndStage + " Missing customArguments, try the default arguments");
                        }
                        if (!backend.useNailgun && stage.customArguments.indexOf("nailgun") >= 0) {
                            this.addWarning(backendAndStage + " customArguments should not contain nailgun arguments if useNailgun is false");
                        }
                    }
                }
                for (let i = 0; i < backend.stages.length; i++) {
                    let stage = backend.stages[i];
                    let BackendMissingStage = backendName + ": Cannot find stage " + stage.name;
                    if (stage.onParsingError && stage.onParsingError.length > 0 && !stages.has(stage.onParsingError))
                        this.addError(BackendMissingStage + "'s onParsingError stage " + stage.onParsingError);
                    if (stage.onTypeCheckingError && stage.onTypeCheckingError.length > 0 && !stages.has(stage.onTypeCheckingError))
                        this.addError(BackendMissingStage + "'s onTypeCheckingError stage " + stage.onTypeCheckingError);
                    if (stage.onVerificationError && stage.onVerificationError.length > 0 && !stages.has(stage.onVerificationError))
                        this.addError(BackendMissingStage + "'s onVerificationError stage " + stage.onVerificationError);
                    if (stage.onSuccess && stage.onSuccess.length > 0 && !stages.has(stage.onSuccess))
                        this.addError(BackendMissingStage + "'s onSuccess stage " + stage.onSuccess);
                }
                //check paths
                if (!backend.paths || backend.paths.length == 0) {
                    this.addError(backendName + " The backend setting needs at least one path");
                }
                else {
                    for (let i = 0; i < backend.paths.length; i++) {
                        //extract environment variable or leave unchanged
                        backend.paths[i] = Settings.checkPath(backend.paths[i], backendName, false).path;
                    }
                }
                //check verification timeout
                if (!backend.timeout || (backend.timeout && backend.timeout <= 0)) {
                    if (backend.timeout && backend.timeout < 0) {
                        this.addWarning(backendName + " The timeout of " + backend.timeout + " is interpreted as no timeout.");
                    }
                    backend.timeout = null;
                }
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
                backendJars = backendJars + concatenationSymbol + '"' + path + '"';
            }
            else {
                //its a folder
                let files = fs.readdirSync(path);
                files.forEach(file => {
                    if (this.isJar(file)) {
                        backendJars = backendJars + concatenationSymbol + '"' + pathHelper.join(path, file) + '"';
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
                    return { path: path, exists: false, error: "unbalanced % in path: " + path };
                }
                let envName = path.substring(start + 1, end);
                let envValue = process.env[envName];
                if (!envValue) {
                    return { path: path, exists: false, error: "environment variable " + envName + " used in path " + path + " is not set" };
                }
                if (envValue.indexOf("%") >= 0) {
                    return { path: path, exists: false, error: "environment variable: " + envName + " must not contain %: " + envValue };
                }
                path = path.substring(0, start - 1) + envValue + path.substring(end + 1, path.length);
            }
        }
        return { path: path, exists: true };
    }
    static resolvePath(path, executable) {
        try {
            if (!path) {
                return { path: path, exists: false };
            }
            path = path.trim();
            //expand internal variables
            let resolvedPath = this.expandViperToolsPath(path);
            //handle env Vars
            let envVarsExtracted = this.extractEnvVars(resolvedPath);
            if (!envVarsExtracted.exists)
                return envVarsExtracted;
            resolvedPath = envVarsExtracted.path;
            //handle files in Path env var
            if (resolvedPath.indexOf("/") < 0 && resolvedPath.indexOf("\\") < 0) {
                //its only a filename, try to find it in the path
                let pathEnvVar = process.env.PATH;
                if (pathEnvVar) {
                    let pathList = pathEnvVar.split(Settings.isWin ? ";" : ":");
                    for (let i = 0; i < pathList.length; i++) {
                        let pathElement = pathList[i];
                        let combinedPath = this.toAbsolute(pathHelper.join(pathElement, resolvedPath));
                        let exists = this.exists(combinedPath, executable);
                        if (exists.exists)
                            return exists;
                    }
                }
            }
            else {
                //handle absolute and relative paths
                if (this.home) {
                    resolvedPath = resolvedPath.replace(/^~($|\/|\\)/, `${this.home}$1`);
                }
                resolvedPath = this.toAbsolute(resolvedPath);
                return this.exists(resolvedPath, executable);
            }
            return { path: resolvedPath, exists: false };
        }
        catch (e) {
            Log_1.Log.error("Error resolving path: " + e);
        }
    }
    static exists(path, executable) {
        try {
            fs.accessSync(path);
            return { path: path, exists: true };
        }
        catch (e) { }
        if (executable && this.isWin && !path.toLowerCase().endsWith(".exe")) {
            path += ".exe";
            //only one recursion at most, because the ending is checked
            return this.exists(path, executable);
        }
        return { path: path, exists: false };
    }
    static toAbsolute(path) {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}
Settings.isWin = /^win/.test(process.platform);
Settings.VERIFY = "verify";
Settings._valid = false;
Settings.home = os.homedir();
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLElBQUksYUFBYSxHQUFHLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixnQ0FBNEgsaUJBQWlCLENBQUMsQ0FBQTtBQUM5SSw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBUXpCO0lBYUksT0FBZSw0QkFBNEI7UUFDdkMsSUFBSSxDQUFDO1lBQ0QsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ2IsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNsRixDQUFDO1lBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ0osTUFBTSxDQUFDLG1CQUFtQixDQUFBO1lBQzlCLENBQUM7UUFDTCxDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztRQUMxRCxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWMsUUFBUSxDQUFDLE9BQWdCLEVBQUUsSUFBWTtRQUNqRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDdkIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMs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