/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const pathHelper = require("path");
const Log_1 = require("./Log");
const ViperProtocol_1 = require("./ViperProtocol");
const ServerClass_1 = require("./ServerClass");
const ViperServerService_1 = require("./ViperServerService");
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
        same = same && a.type === b.type;
        same = same && a.timeout === b.timeout;
        same = same && this.resolveEngine(a.engine) === this.resolveEngine(b.engine);
        a.stages.forEach((element, i) => {
            same = same && this.stageEquals(element, b.stages[i]);
        });
        same = same && a.paths.length === b.paths.length;
        for (let i = 0; i < a.paths.length; i++) {
            same = same && a.paths[i] === b.paths[i];
        }
        return same;
    }
    static resolveEngine(engine) {
        if (engine && (engine.toLowerCase() == "viperserver")) {
            return engine;
        }
        else {
            return "none";
        }
    }
    static useViperServer(backend) {
        if (!backend || !backend.engine)
            return false;
        return backend.engine.toLowerCase() == "viperserver";
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
    static expandCustomArguments(args, stage, fileToVerify, backend) {
        //Log.log("Command before expanding: " + args,LogLevel.LowLevelDebug);
        args = args.replace(/\s+/g, ' '); //remove multiple spaces
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.paths.z3Executable + '"');
        args = args.replace(/\$boogieExe\$/g, '"' + this.settings.paths.boogieExecutable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$backendPaths\$/g, Settings.backendJars(backend));
        args = args.replace(/\$disableCaching\$/g, (Settings.settings.viperServerSettings.disableCaching === true ? "--disableCaching" : ""));
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        args = args.replace(/\s+/g, ' '); //remove multiple spaces
        //Log.log("Command after expanding: " + args.trim(),LogLevel.LowLevelDebug);
        return args.trim();
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
    static selectBackend(settings, selectedBackend) {
        if (selectedBackend) {
            Settings.selectedBackend = selectedBackend;
        }
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
    static getBackend(backendName) {
        return Settings.settings.verificationBackends.find(b => { return b.name == backendName; });
    }
    static valid() {
        ServerClass_1.Server.sendSettingsCheckedNotification({ ok: this._valid, errors: this._errors, settings: this.settings });
        return this._valid;
    }
    static upToDate() {
        return this._upToDate;
    }
    static viperServerRelatedSettingsChanged(oldSettings) {
        if (!oldSettings)
            return true;
        if (oldSettings.viperServerSettings.serverJars.length != this.settings.viperServerSettings.serverJars.length)
            return true;
        oldSettings.viperServerSettings.serverJars.forEach((path, index) => {
            if (path != this.settings.viperServerSettings.serverJars[index]) {
                return true;
            }
        });
        if (oldSettings.viperServerSettings.backendSpecificCache != this.settings.viperServerSettings.backendSpecificCache
            || oldSettings.viperServerSettings.customArguments != this.settings.viperServerSettings.customArguments
            //|| oldSettings.viperServerSettings.disableCaching != this.settings.viperServerSettings.disableCaching //no need to restart the ViperServer if only that changes
            || oldSettings.viperServerSettings.timeout != this.settings.viperServerSettings.timeout) {
            return true;
        }
        Log_1.Log.log("ViperServer settings did not change", ViperProtocol_1.LogLevel.LowLevelDebug);
        return false;
    }
    //tries to restart backend, 
    static initiateBackendRestartIfNeeded(oldSettings, selectedBackend, viperToolsUpdated = false) {
        Settings.checkSettings(viperToolsUpdated).then(() => {
            if (Settings.valid()) {
                let newBackend = Settings.selectBackend(Settings.settings, selectedBackend);
                if (newBackend) {
                    //only restart the backend after settings changed if the active backend was affected
                    Log_1.Log.log("check if restart needed", ViperProtocol_1.LogLevel.LowLevelDebug);
                    let backendChanged = !Settings.backendEquals(ServerClass_1.Server.backend, newBackend); //change in backend
                    let mustRestartBackend = !ServerClass_1.Server.backendService.isReady() //backend is not ready -> restart
                        || viperToolsUpdated //Viper Tools Update might have modified the binaries
                        || (ServerClass_1.Server.backendService.isViperServerService != this.useViperServer(newBackend)) //the new backend requires another engine type
                        || (Settings.useViperServer(newBackend) && this.viperServerRelatedSettingsChanged(oldSettings)); // the viperServerSettings changed
                    if (mustRestartBackend || backendChanged) {
                        Log_1.Log.log(`Change Backend: from ${ServerClass_1.Server.backend ? ServerClass_1.Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, ViperProtocol_1.LogLevel.Info);
                        ServerClass_1.Server.backend = newBackend;
                        ServerClass_1.Server.verificationTasks.forEach(task => task.resetLastSuccess());
                        ServerClass_1.Server.sendStartBackendMessage(ServerClass_1.Server.backend.name, mustRestartBackend, Settings.useViperServer(newBackend));
                    }
                    else {
                        Log_1.Log.log("No need to restart backend. It is still the same", ViperProtocol_1.LogLevel.Debug);
                        ServerClass_1.Server.backend = newBackend;
                        ServerClass_1.Server.sendBackendReadyNotification({
                            name: ServerClass_1.Server.backend.name,
                            restarted: false,
                            isViperServer: Settings.useViperServer(newBackend)
                        });
                    }
                }
                else {
                    Log_1.Log.error("No backend, even though the setting check succeeded.");
                }
            }
            else {
                ServerClass_1.Server.backendService.stop();
            }
        });
    }
    static addError(msg) {
        this._errors.push({ type: ViperProtocol_1.SettingsErrorType.Error, msg: msg });
    }
    static addErrors(errors) {
        this._errors = this._errors.concat(errors);
    }
    static addWarning(msg) {
        this._errors.push({ type: ViperProtocol_1.SettingsErrorType.Warning, msg: msg });
    }
    static checkSettingsVersion(settings, requiredVersions) {
        let oldSettings = [];
        //check the settings versions
        if (!requiredVersions) {
            Log_1.Log.error("Getting required version failed.");
        }
        else {
            if (Version.createFromVersion(requiredVersions.advancedFeaturesVersion).compare(Version.createFromHash(settings.advancedFeatures.v)) > 0) {
                oldSettings.push("advancedFeatures");
            }
            if (Version.createFromVersion(requiredVersions.javaSettingsVersion).compare(Version.createFromHash(settings.javaSettings.v)) > 0) {
                oldSettings.push("javaSettings");
            }
            if (Version.createFromVersion(requiredVersions.viperServerSettingsVersion).compare(Version.createFromHash(settings.viperServerSettings.v)) > 0) {
                oldSettings.push("viperServerSettings");
            }
            if (Version.createFromVersion(requiredVersions.pathSettingsVersion).compare(Version.createFromHash(settings.paths.v)) > 0) {
                oldSettings.push("paths");
            }
            if (Version.createFromVersion(requiredVersions.userPreferencesVersion).compare(Version.createFromHash(settings.preferences.v)) > 0) {
                oldSettings.push("preferences");
            }
            let requiredBackendVersion = Version.createFromVersion(requiredVersions.backendSettingsVersion);
            settings.verificationBackends.forEach(backend => {
                if (requiredBackendVersion.compare(Version.createFromHash(backend.v)) > 0) {
                    oldSettings.push("backend " + backend.name);
                }
            });
        }
        return oldSettings;
    }
    static checkSettings(viperToolsUpdated) {
        return new Promise((resolve, reject) => {
            try {
                this._valid = false;
                this._errors = [];
                this._upToDate = false;
                ServerClass_1.Server.connection.sendRequest(ViperProtocol_1.Commands.CheckIfSettingsVersionsSpecified).then((errors) => {
                    if (errors) {
                        this.addErrors(errors);
                        return null;
                    }
                    else {
                        //check settings versions
                        return ServerClass_1.Server.connection.sendRequest(ViperProtocol_1.Commands.RequestRequiredVersion);
                    }
                }).then((requiredVersions) => {
                    if (!requiredVersions) {
                        resolve(false);
                        return;
                    }
                    if (this.firstSettingsCheck) {
                        Log_1.Log.log("Extension Version: " + requiredVersions.extensionVersion + " - " + Version.hash(requiredVersions.extensionVersion), ViperProtocol_1.LogLevel.LowLevelDebug);
                        this.firstSettingsCheck = false;
                    }
                    let settings = Settings.settings;
                    let oldSettings = this.checkSettingsVersion(settings, requiredVersions);
                    let defaultSettings = requiredVersions.defaultSettings;
                    if (oldSettings.length > 0) {
                        let affectedSettings = oldSettings.length < 10 ? "(" + oldSettings.join(", ") + ")" : "(" + oldSettings.length + ")";
                        this.addError("Old viper settings detected: " + affectedSettings + " please replace the old settings with the new default settings.");
                        resolve(false);
                        return;
                    }
                    this._upToDate = true;
                    //Check viperToolsProvider
                    settings.preferences.viperToolsProvider = this.checkPlatformDependentUrl(settings.preferences.viperToolsProvider);
                    //Check Paths
                    //check viperToolsPath
                    let resolvedPath = this.checkPath(settings.paths.viperToolsPath, "Path to Viper Tools:", false, true, true);
                    settings.paths.viperToolsPath = resolvedPath.path;
                    if (!resolvedPath.exists) {
                        if (!viperToolsUpdated) {
                            //Automatically install the Viper tools
                            ServerClass_1.Server.updateViperTools(true);
                            reject(); // in this case we do not want to continue restarting the backend,
                            //the backend will be restarted after the update
                        }
                        else {
                            resolve(false);
                        }
                        return;
                    }
                    //check z3 Executable
                    settings.paths.z3Executable = this.checkPath(settings.paths.z3Executable, "z3 Executable:", true, true, true).path;
                    //check boogie executable
                    settings.paths.boogieExecutable = this.checkPath(settings.paths.boogieExecutable, `Boogie Executable: (If you don't need boogie, set it to "")`, true, true, true).path;
                    //check backends
                    if (!settings.verificationBackends || settings.verificationBackends.length == 0) {
                        settings.verificationBackends = defaultSettings["viperSettings.verificationBackends"].default;
                    }
                    else {
                        defaultSettings["viperSettings.verificationBackends"].default.forEach(defaultBackend => {
                            let customBackend = settings.verificationBackends.filter(backend => backend.name == defaultBackend.name)[0];
                            if (customBackend) {
                                //Merge the backend with the default backend
                                this.mergeBackend(customBackend, defaultBackend);
                            }
                            else {
                                //Add the default backend if there is none with the same name
                                settings.verificationBackends.push(defaultBackend);
                            }
                        });
                    }
                    Settings.checkBackends(settings.verificationBackends);
                    //check ViperServer related settings
                    let viperServerRequired = settings.verificationBackends.some(elem => this.useViperServer(elem));
                    if (viperServerRequired) {
                        //check viperServer path
                        settings.viperServerSettings.serverJars = this.checkPaths(settings.viperServerSettings.serverJars, "viperServerPath:");
                        if (this.viperServerJars().trim().length == 0) {
                            this.addError("Missing viper server jars at paths: " + JSON.stringify(settings.viperServerSettings.serverJars));
                        }
                        //check viperServerTimeout
                        settings.viperServerSettings.timeout = this.checkTimeout(settings.viperServerSettings.timeout, "viperServerSettings:");
                        //check the customArguments
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
    static mergeBackend(custom, def) {
        if (!custom || !def || custom.name != def.name)
            return;
        if (!custom.paths)
            custom.paths = def.paths;
        if (!custom.stages)
            custom.stages = def.stages;
        else
            this.mergeStages(custom.stages, def.stages);
        if (!custom.timeout)
            custom.timeout = def.timeout;
        if (!custom.engine || custom.engine.length == 0)
            custom.engine = def.engine;
        if (!custom.type || custom.type.length == 0)
            custom.type = def.type;
    }
    static mergeStages(custom, defaultStages) {
        defaultStages.forEach(def => {
            let cus = custom.filter(stage => stage.name == def.name)[0];
            if (cus) {
                //merge
                if (cus.customArguments === undefined)
                    cus.customArguments = def.customArguments;
                if (!cus.mainMethod)
                    cus.mainMethod = def.mainMethod;
                if (cus.isVerification === undefined)
                    cus.isVerification = def.isVerification;
            }
            else {
                custom.push(def);
            }
        });
    }
    static checkPlatformDependentUrl(url) {
        let stringURL = null;
        if (url) {
            if (typeof url === "string") {
                stringURL = url;
            }
            else {
                if (Settings.isLinux) {
                    stringURL = url.linux;
                }
                else if (Settings.isMac) {
                    stringURL = url.mac;
                }
                else if (Settings.isWin) {
                    stringURL = url.windows;
                }
                else {
                    Log_1.Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
                }
            }
        }
        if (!stringURL || stringURL.length == 0) {
            this.addError("The viperToolsProvider is missing in the preferences");
        }
        //TODO: check url format
        return stringURL;
    }
    static checkPaths(paths, prefix) {
        //Log.log("checkPaths(" + JSON.stringify(paths) + ")", LogLevel.LowLevelDebug);
        let result = [];
        let stringPaths = [];
        if (!paths) {
            this.addError(prefix + " paths are missing");
        }
        else if (typeof paths === "string") {
            stringPaths.push(paths);
        }
        else if (paths instanceof Array) {
            paths.forEach(path => {
                if (typeof path === "string") {
                    stringPaths.push(path);
                }
            });
        }
        else {
            let platformDependentPath = paths;
            if (Settings.isLinux) {
                return this.checkPaths(platformDependentPath.linux, prefix);
            }
            else if (Settings.isMac) {
                return this.checkPaths(platformDependentPath.mac, prefix);
            }
            else if (Settings.isWin) {
                return this.checkPaths(platformDependentPath.windows, prefix);
            }
            else {
                Log_1.Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
            }
            return result;
        }
        if (stringPaths.length == 0) {
            this.addError(prefix + ' path has wrong type: expected: string | string[] | {windows:(string|string[]), mac:(string|string[]), linux:(string|string[])}, found: ' + typeof paths + " at path: " + JSON.stringify(paths));
        }
        //resolve the paths
        stringPaths = stringPaths.map(stringPath => {
            let resolvedPath = Settings.resolvePath(stringPath, false);
            if (!resolvedPath.exists) {
                this.addError(prefix + ' path not found: "' + stringPath + '"' + (resolvedPath.path != stringPath ? ' which expands to "' + resolvedPath.path + '"' : "") + (" " + (resolvedPath.error || "")));
            }
            return resolvedPath.path;
        });
        if (stringPaths.length == 0) {
            this.addError(prefix + ' no file found at at path: ' + JSON.stringify(paths));
        }
        //Log.log("checkPaths result: (" + JSON.stringify(stringPaths) + ")", LogLevel.LowLevelDebug);
        return stringPaths;
    }
    static checkPath(path, prefix, executable, allowPlatformDependentPath, allowStringPath = true, allowMissingPath = false) {
        if (!path) {
            if (!allowMissingPath)
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
            if (!allowMissingPath) {
                this.addError(prefix + ' path has wrong type: expected: string' + (executable ? ' or {windows:string, mac:string, linux:string}' : "") + ', found: ' + typeof path + " at path: " + JSON.stringify(path));
            }
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
            else if (!backend.name || backend.name.length == 0) { //name there?
                this.addWarning("Every backend setting should have a name.");
                backend.name = "backend" + (i + 1);
            }
            let backendName = "Backend " + backend.name + ":";
            //check for duplicate backends
            if (backendNames.has(backend.name))
                this.addError("Dublicated backend name: " + backend.name);
            backendNames.add(backend.name);
            //check stages
            if (!backend.stages || backend.stages.length == 0) {
                this.addError(backendName + " The backend setting needs at least one stage");
                continue;
            }
            backend.engine = this.resolveEngine(backend.engine);
            //check engine and type
            if (this.useViperServer(backend) && !ViperServerService_1.ViperServerService.isSupportedType(backend.type)) {
                this.addError(backendName + "the backend type " + backend.type + " is not supported, try one of these: " + ViperServerService_1.ViperServerService.supportedTypes);
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
                if (!this.useViperServer(backend))
                    this.addError(backendName + " The backend setting needs at least one path");
            }
            else {
                if (typeof backend.paths == 'string') {
                    let temp = backend.paths;
                    backend.paths = [temp];
                }
                for (let i = 0; i < backend.paths.length; i++) {
                    //extract environment variable or leave unchanged
                    backend.paths[i] = Settings.checkPath(backend.paths[i], backendName, false, false).path;
                }
            }
            //check verification timeout
            backend.timeout = this.checkTimeout(backend.timeout, "Backend " + backendName + ":");
        }
        return null;
    }
    static checkTimeout(timeout, prefix) {
        if (!timeout || (timeout && timeout <= 0)) {
            if (timeout && timeout < 0) {
                this.addWarning(prefix + " The timeout of " + timeout + " is interpreted as no timeout.");
            }
            return null;
        }
        return timeout;
    }
    static backendJars(backend) {
        let jarFiles = this.getAllJarsInPaths(backend.paths, false);
        return this.buildDependencyString(jarFiles);
    }
    static viperServerJars() {
        let jarFiles = this.getAllJarsInPaths(this.settings.viperServerSettings.serverJars, false);
        return this.buildDependencyString(jarFiles);
    }
    static buildDependencyString(jarFiles) {
        let dependencies = "";
        let concatenationSymbol = Settings.isWin ? ";" : ":";
        if (jarFiles.length > 0) {
            dependencies = dependencies + concatenationSymbol + '"' + jarFiles.join('"' + concatenationSymbol + '"') + '"';
        }
        return dependencies;
    }
    static getAllJarsInPaths(paths, recursive) {
        let result = [];
        try {
            paths.forEach(path => {
                if (fs.lstatSync(path).isDirectory()) {
                    let files = fs.readdirSync(path);
                    let folders = [];
                    files.forEach(child => {
                        child = pathHelper.join(path, child);
                        if (!fs.lstatSync(child).isDirectory()) {
                            //child is a file
                            if (this.isJar(child)) {
                                //child is a jar file
                                result.push(child);
                            }
                        }
                        else {
                            folders.push(child);
                        }
                    });
                    if (recursive) {
                        result.push(...this.getAllJarsInPaths(folders, recursive));
                    }
                }
                else {
                    if (this.isJar(path)) {
                        result.push(path);
                    }
                }
            });
        }
        catch (e) {
            Log_1.Log.error("Error getting all Jars in Paths: " + e);
        }
        return result;
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
Settings.firstSettingsCheck = true;
Settings._valid = false;
Settings._upToDate = false;
Settings.home = os.homedir();
exports.Settings = Settings;
class Version {
    constructor(versionNumbers) {
        this.versionNumbers = [0, 0, 0];
        if (versionNumbers) {
            this.versionNumbers = versionNumbers;
        }
    }
    static createFromVersion(version) {
        try {
            if (version) {
                if (/\d+(\.\d+)+/.test(version)) {
                    return new Version(version.split(".").map(x => Number.parseInt(x)));
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error creating version from Version: " + e);
        }
        return new Version();
    }
    static createFromHash(hash) {
        try {
            if (hash) {
                let version = this.decrypt(hash, Version.Key);
                //Log.log("hash: " + hash + " decrypted version: " + version, LogLevel.LowLevelDebug);
                return this.createFromVersion(version);
            }
        }
        catch (e) {
            Log_1.Log.error("Error creating version from hash: " + e);
        }
        return new Version();
    }
    static encrypt(msg, key) {
        let res = "";
        let parity = 0;
        for (let i = 0; i < msg.length; i++) {
            let keyChar = key.charCodeAt(i % key.length);
            //Log.log("keyChar " + key.charAt(i % key.length),LogLevel.LowLevelDebug);
            let char = msg.charCodeAt(i);
            //Log.log("char " + msg.charAt(i) + " charCode: " + char,LogLevel.LowLevelDebug);
            let cypher = (char ^ keyChar);
            parity = (parity + cypher % (16 * 16)) % (16 * 16);
            //Log.log("cypher " + (char ^ keyChar).toString() + " hex: "+ cypher,LogLevel.LowLevelDebug);
            res += this.pad(cypher);
        }
        return res + this.pad(parity);
    }
    static pad(n) {
        let s = n.toString(16);
        return (s.length == 1 ? "0" : "") + s;
    }
    static decrypt(cypher, key) {
        //Log.log("decrypt",LogLevel.LowLevelDebug);
        let res = "";
        let parity = 0;
        if (!cypher || cypher.length < 2 || cypher.length % 2 != 0) {
            return "";
        }
        for (let i = 0; i < cypher.length - 2; i += 2) {
            let keyChar = key.charCodeAt((i / 2) % key.length);
            //Log.log("keyChar " + key.charAt(i % key.length),LogLevel.LowLevelDebug);
            let char = (16 * parseInt(cypher.charAt(i), 16)) + parseInt(cypher.charAt(i + 1), 16);
            parity = (parity + char % (16 * 16)) % (16 * 16);
            //Log.log("char " + char,LogLevel.LowLevelDebug);
            //Log.log("encChar " + String.fromCharCode(char ^ keyChar) + " charCode: "+(char ^ keyChar),LogLevel.LowLevelDebug);
            res += String.fromCharCode(char ^ keyChar);
        }
        if (parity != (16 * parseInt(cypher.charAt(cypher.length - 2), 16)) + parseInt(cypher.charAt(cypher.length - 1), 16)) {
            return "";
        }
        else {
            return res;
        }
    }
    toString() {
        return this.versionNumbers.join(".");
    }
    static testhash() {
        let s = "1.0.0";
        let en = this.encrypt(s, Version.Key);
        let de = this.decrypt(en, Version.Key);
        Log_1.Log.log("Hash Test: " + s + " -> " + en + " -> " + de, ViperProtocol_1.LogLevel.LowLevelDebug);
    }
    static hash(version) {
        let hash = this.encrypt(version, Version.Key);
        //Log.log("version: " + version + " hash: " + hash, LogLevel.LowLevelDebug);
        return hash;
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
Version.Key = "VdafSZVOWpe";
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFFYix5QkFBMEI7QUFDMUIsbUNBQW1DO0FBQ25DLCtCQUE0QjtBQUM1QixtREFBb047QUFDcE4sK0NBQXVDO0FBRXZDLDZEQUEwRDtBQUMxRCxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDekIsSUFBSSxVQUFVLEdBQUcsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBUXZDLE1BQWEsUUFBUTtJQWlCVixNQUFNLENBQUMsUUFBUSxDQUFDLE9BQWdCLEVBQUUsSUFBWTtRQUNqRCxJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQ3ZCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUM1QyxJQUFJLEtBQUssR0FBRyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzlCLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxJQUFJO2dCQUFFLE9BQU8sS0FBSyxDQUFDO1NBQ3pDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVNLE1BQU0sQ0FBQyxtQkFBbUIsQ0FBQyxPQUFnQixFQUFFLEtBQVksRUFBRSxPQUFnQjtRQUM5RSxRQUFRLE9BQU8sRUFBRTtZQUNiLEtBQUssdUJBQU8sQ0FBQyxhQUFhO2dCQUN0QixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUN4RCxLQUFLLHVCQUFPLENBQUMsa0JBQWtCO2dCQUMzQixPQUFPLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxFQUFFLEtBQUss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