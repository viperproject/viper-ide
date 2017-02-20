'use strict';
const fs = require('fs');
const pathHelper = require('path');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
const os = require('os');
var portfinder = require('portfinder');
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
    static expandCustomArguments(program, stage, fileToVerify, backend) {
        let args = program + " " + stage.mainMethod + " " + (backend.useNailgun ? "--nailgun-port $nailgunPort$ " : "") + stage.customArguments;
        if (!args || args.length == 0)
            return "";
        args = args.replace(/\s+/g, ' '); //remove multiple spaces
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.paths.z3Executable + '"');
        args = args.replace(/\$boogieExe\$/g, '"' + this.settings.paths.boogieExecutable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$nailgunPort\$/g, this.settings.nailgunSettings.port);
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        args = args.replace(/\$backendPaths\$/g, Settings.backendJars(backend));
        return args;
    }
    // static splitArguments(str: string): string[] {
    //     //reduce multiple spaces
    //     str = str.replace(/\s+/g, ' ');
    //     var args = [];
    //     var readingPart = false;
    //     var part = '';
    //     for (var i = 0; i < str.length; i++) {
    //         if (str.charAt(i) === ' ' && !readingPart) {
    //             args.push(part);
    //             part = '';
    //         } else {
    //             if (str.charAt(i) === '\"') {
    //                 readingPart = !readingPart;
    //             } else {
    //                 part += str.charAt(i);
    //             }
    //         }
    //     }
    //     args.push(part);
    //     return args;
    // }
    // static expandCustomArgumentsForSpawn(args: string[], stage: Stage, fileToVerify: string, backend: Backend): string[] {
    //     args.push(stage.mainMethod);
    //     if (backend.useNailgun) {
    //         args.push("--nailgun-port");
    //         args.push("$nailgunPort$");
    //     }
    //     Settings.splitArguments(stage.customArguments).forEach(arg => { args.push(arg) });//TODO: what if the argument contains spaces?
    //     for (let i = 0; i < args.length; i++) {
    //         args[i] = args[i].replace(/\$z3Exe\$/g, '"' + this.settings.paths.z3Executable + '"');
    //         args[i] = args[i].replace(/\$boogieExe\$/g, '"' + this.settings.paths.boogieExecutable + '"');
    //         args[i] = args[i].replace(/\$mainMethod\$/g, stage.mainMethod);
    //         args[i] = args[i].replace(/\$nailgunPort\$/g, this.settings.nailgunSettings.port);
    //         args[i] = args[i].replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
    //         args[i] = args[i].replace(/\$backendPaths\$/g, Settings.backendJars(backend))
    //     }
    //     return args;
    // }
    static expandViperToolsPath(path) {
        if (!path)
            return path;
        if (typeof Settings.settings.paths.viperToolsPath !== "string") {
            return path;
        }
        path = path.replace(/\$viperTools\$/g, Settings.settings.paths.viperToolsPath);
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
        ServerClass_1.Server.sendSettingsCheckedNotification({ ok: this._valid, errors: this._errors, settings: this.settings });
        return this._valid;
    }
    static checkNailgunSettings(nailgunSettings) {
        /*if (!nailgunSettings) {
            this.addError("viperSettings.nailgunSettings is missing");
            return;
        }*/
        //check nailgun port
        if (!nailgunSettings.port || nailgunSettings.port == "*") {
            //use a random port
            portfinder.getPort(function (err, port) {
                Log_1.Log.log("nailgun port is chosen as: " + port);
                nailgunSettings.port = port;
            });
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
            nailgunSettings.serverJar = Settings.checkPath(nailgunSettings.serverJar, "Nailgun Server:", false, false).path;
        }
        //check nailgun client
        nailgunSettings.clientExecutable = Settings.checkPath(nailgunSettings.clientExecutable, "Nailgun Client:", true, true).path;
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
        return new Promise((resolve, reject) => {
            try {
                this._valid = false;
                this._errors = [];
                //check settings versions
                ServerClass_1.Server.connection.sendRequest(ViperProtocol_1.Commands.RequestRequiredVersion).then((requiredVersions) => {
                    let settings = Settings.settings;
                    let oldSettings = [];
                    let defaultSettings = requiredVersions.defaultSettings;
                    //check the settings versions
                    if (!requiredVersions) {
                        Log_1.Log.error("Getting required version failed.");
                    }
                    else {
                        if (new Version(requiredVersions.advancedFeaturesVersion).compare(new Version(settings.advancedFeatures.v)) > 0) {
                            oldSettings.push("advancedFeatures");
                        }
                        if (new Version(requiredVersions.javaSettingsVersion).compare(new Version(settings.javaSettings.v)) > 0) {
                            oldSettings.push("javaSettings");
                        }
                        if (new Version(requiredVersions.nailgunSettingsVersion).compare(new Version(settings.nailgunSettings.v)) > 0) {
                            oldSettings.push("nailgunSettings");
                        }
                        if (new Version(requiredVersions.pathSettingsVersion).compare(new Version(settings.paths.v)) > 0) {
                            oldSettings.push("paths");
                        }
                        if (new Version(requiredVersions.userPreferencesVersion).compare(new Version(settings.preferences.v)) > 0) {
                            oldSettings.push("preferences");
                        }
                        let requiredBackendVersion = new Version(requiredVersions.backendSettingsVersion);
                        settings.verificationBackends.forEach(backend => {
                            if (requiredBackendVersion.compare(new Version(backend.v)) > 0) {
                                oldSettings.push("backend " + backend.name);
                            }
                        });
                    }
                    if (oldSettings.length > 0) {
                        let affectedSettings = oldSettings.length < 4 ? "(" + oldSettings.join(", ") + ")" : "(" + oldSettings.length + ")";
                        this.addError("Old viper settings detected: " + affectedSettings + " please replace the old settings with the new default settings.");
                        resolve(false);
                        return;
                    }
                    //Check Paths
                    //check viperToolsPath
                    let resolvedPath = this.checkPath(settings.paths.viperToolsPath, "Path to Viper Tools:", false, true, true);
                    settings.paths.viperToolsPath = resolvedPath.path;
                    if (!resolvedPath.exists) {
                        resolve(false);
                        return;
                    }
                    //check z3 Executable
                    settings.paths.z3Executable = this.checkPath(settings.paths.z3Executable, "z3 Executable:", true, true).path;
                    //check boogie executable
                    settings.paths.boogieExecutable = this.checkPath(settings.paths.boogieExecutable, `Boogie Executable: (If you don't need boogie, set it to "")`, true, true).path;
                    //check backends
                    if (!settings.verificationBackends || settings.verificationBackends.length == 0) {
                        settings.verificationBackends = defaultSettings["viperSettings.verificationBackends"].default;
                    }
                    Settings.checkBackends(defaultSettings["viperSettings.verificationBackends"].default, settings.verificationBackends);
                    //check nailgun settings
                    let useNailgun = settings.verificationBackends.some(elem => elem.useNailgun);
                    if (useNailgun) {
                        this.checkNailgunSettings(settings.nailgunSettings);
                    }
                    //no need to check preferences
                    //check java settings
                    if (!settings.javaSettings.customArguments) {
                        settings.javaSettings.customArguments = defaultSettings["viperSettings.javaSettings"].default.customArguments;
                        if (!settings.javaSettings.customArguments) {
                            this.addError("The customArguments are missing in the java settings");
                        }
                    }
                    //checks done
                    this._valid = !this._errors.some(error => error.type == ViperProtocol_1.SettingsErrorType.Error); //if there is no error -> valid
                    if (this._valid) {
                        Log_1.Log.log("The settings are ok", ViperProtocol_1.LogLevel.Info);
                        resolve(true);
                    }
                    else {
                        resolve(false);
                    }
                });
            }
            catch (e) {
                Log_1.Log.error("Error checking settings: " + e);
                resolve(false);
            }
        });
    }
    static checkPath(path, prefix, executable, allowPlatformDependentPath, allowStringPath = true) {
        if (!path) {
            this.addError(prefix + " path is missing");
            return { path: null, exists: false };
        }
        let stringPath;
        if (typeof path === "string") {
            if (!allowStringPath) {
                this.addError(prefix + ' path has wrong type: expected: {windows:string, mac:string, linux:string}, found: ' + typeof path);
                return { path: stringPath, exists: false };
            }
            stringPath = path;
        }
        else {
            if (!allowPlatformDependentPath) {
                this.addError(prefix + ' path has wrong type: expected: string, found: ' + typeof path + " at path: " + JSON.stringify(path));
                return { path: null, exists: false };
            }
            let platformDependentPath = path;
            if (Settings.isLinux) {
                stringPath = platformDependentPath.linux;
            }
            else if (Settings.isMac) {
                stringPath = platformDependentPath.mac;
            }
            else if (Settings.isWin) {
                stringPath = platformDependentPath.windows;
            }
            else {
                Log_1.Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
            }
        }
        if (!stringPath || stringPath.length == 0) {
            this.addError(prefix + ' path has wrong type: expected: string' + (executable ? ' or {windows:string, mac:string, linux:string}' : "") + ', found: ' + typeof path + " at path: " + JSON.stringify(path));
            return { path: stringPath, exists: false };
        }
        let resolvedPath = Settings.resolvePath(stringPath, executable);
        if (!resolvedPath.exists) {
            this.addError(prefix + ' path not found: "' + stringPath + '"' + (resolvedPath.path != stringPath ? ' which expands to "' + resolvedPath.path + '"' : "") + (" " + (resolvedPath.error || "")));
        }
        return resolvedPath;
    }
    static checkBackends(defaultBackends, backends) {
        //Log.log("Checking backends...", LogLevel.Debug);
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
                this.addWarning("Every backend setting should have a name.");
                backend.name = "backend" + (i + 1);
            }
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
                        this.addError(backendAndStage + " Missing customArguments");
                        continue;
                    }
                    //check customArguments for compliance with advancedFeatures
                    let hasIdeModeAdvanced = stage.customArguments.indexOf("--ideModeAdvanced") >= 0;
                    let hasIdeMode = stage.customArguments.indexOf("--ideMode ") >= 0;
                    if (hasIdeModeAdvanced && !hasIdeMode) {
                        this.addError(backendAndStage + " the --ideModeAdvanced depends on --ideMode, for the Advanced Mode you need to specify both.");
                    }
                    if (Settings.settings.advancedFeatures && hasIdeMode && !hasIdeModeAdvanced) {
                        this.addWarning(backendAndStage + " the advanced features only work when --ideModeAdvanced is specified.");
                    }
                    if (!Settings.settings.advancedFeatures && hasIdeModeAdvanced) {
                        this.addWarning(backendAndStage + " when the advanced features are disabled, you can speed up the verification by removing the --ideModeAdvanced flag from the customArguments.");
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
                    backend.paths[i] = Settings.checkPath(backend.paths[i], backendName, false, false).path;
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
Settings.isLinux = /^linux/.test(process.platform);
Settings.isMac = /^darwin/.test(process.platform);
Settings.VERIFY = "verify";
Settings._valid = false;
Settings.home = os.homedir();
exports.Settings = Settings;
class Version {
    constructor(version) {
        try {
            if (!version) {
                this.versionNumbers = [0, 0, 0];
            }
            else {
                this.versionNumbers = version.split(".").map(x => Number.parseInt(x));
            }
        }
        catch (e) {
            Log_1.Log.error("Error parsing version: " + e);
        }
    }
    toString() {
        return this.versionNumbers.join(".");
    }
    //1: this is larger, -1 other is larger
    compare(other) {
        for (let i = 0; i < this.versionNumbers.length; i++) {
            if (i >= other.versionNumbers.length)
                return 1;
            if (this.versionNumbers[i] > other.versionNumbers[i])
                return 1;
            if (this.versionNumbers[i] < other.versionNumbers[i])
                return -1;
        }
        return this.versionNumbers.length < other.versionNumbers.length ? -1 : 0;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLHNCQUFvQixPQUFPLENBQUMsQ0FBQTtBQUM1QixnQ0FBK0osaUJBQWlCLENBQUMsQ0FBQTtBQUNqTCw4QkFBdUIsZUFBZSxDQUFDLENBQUE7QUFDdkMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3pCLElBQUksVUFBVSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUMsQ0FBQztBQVN2QztJQWNJLE9BQWMsUUFBUSxDQUFDLE9BQWdCLEVBQUUsSUFBWTtRQUNqRCxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztZQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDdkIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQzdDLElBQUksS0FBSyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDOUIsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUM7Z0JBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUMxQyxDQUFDO1FBQ0QsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNoQixDQUFDO0lBRUQsT0FBYyxtQkFBbUIsQ0FBQyxPQUFnQixFQUFFLEtBQVksRUFBRSxPQUFnQjtRQUM5RSxNQUFNLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ2QsS0FBSyx1QkFBTyxDQUFDLGFBQWE7Z0JBQ3RCLE1BQU0sQ0FB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