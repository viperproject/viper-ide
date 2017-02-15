'use strict';
const fs = require('fs');
const pathHelper = require('path');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const ServerClass_1 = require('./ServerClass');
const os = require('os');
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
                    //check dot executable
                    // if (Settings.settings.advancedFeatures.enabled) {
                    //     settings.paths.dotExecutable = this.checkPath(settings.paths.dotExecutable, "dot executable:", true, true).path;
                    // }
                    //check backends
                    Settings.checkBackends(settings.verificationBackends);
                    //check nailgun settings
                    let useNailgun = settings.verificationBackends.some(elem => elem.useNailgun);
                    if (useNailgun) {
                        this.checkNailgunSettings(settings.nailgunSettings);
                    }
                    //no need to check preferences
                    //check java settings
                    if (!settings.javaSettings.customArguments) {
                        this.addError("The customArguments are missing in the java settings");
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
    static checkBackends(backends) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzFCLE1BQVksVUFBVSxXQUFNLE1BQU0sQ0FBQyxDQUFBO0FBQ25DLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixnQ0FBNkosaUJBQWlCLENBQUMsQ0FBQTtBQUMvSyw4QkFBcUIsZUFBZSxDQUFDLENBQUE7QUFDckMsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBUXpCO0lBY0ksT0FBYyxRQUFRLENBQUMsT0FBZ0IsRUFBRSxJQUFZO1FBQ2pELEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUN2QixHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDN0MsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM5QixFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQztnQkFBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQzFDLENBQUM7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxPQUFjLG1CQUFtQixDQUFDLE9BQWdCLEVBQUUsS0FBWSxFQUFFLE9BQWdCO1FBQzlFLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDZCxLQUFLLHVCQUFPLENBQUMsYUFBYTtnQkFDdEIsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxjQUFj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