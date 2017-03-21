'use strict';

import fs = require('fs');
import * as pathHelper from 'path';
import { Log } from './Log';
import { Versions, PlatformDependentURL, PlatformDependentPath, SettingsErrorType, SettingsError, NailgunSettings, Commands, Success, ViperSettings, Stage, Backend, LogLevel } from './ViperProtocol';
import { Server } from './ServerClass';
const os = require('os');
var portfinder = require('portfinder');


export interface ResolvedPath {
    path: string,
    exists: boolean,
    error?: string
}

export class Settings {
    public static settings: ViperSettings;
    public static isWin = /^win/.test(process.platform);
    public static isLinux = /^linux/.test(process.platform);
    public static isMac = /^darwin/.test(process.platform);
    public static workspace;
    public static VERIFY = "verify";
    public static selectedBackend: string;

    private static _valid: boolean = false;
    private static _errors: SettingsError[];

    private static home = os.homedir();

    public static getStage(backend: Backend, name: string): Stage {
        if (!name) return null;
        for (let i = 0; i < backend.stages.length; i++) {
            let stage = backend.stages[i];
            if (stage.name === name) return stage;
        }
        return null;
    }

    public static getStageFromSuccess(backend: Backend, stage: Stage, success: Success): Stage {
        switch (success) {
            case Success.ParsingFailed:
                return this.getStage(backend, stage.onParsingError);
            case Success.VerificationFailed:
                return this.getStage(backend, stage.onVerificationError);
            case Success.TypecheckingFailed:
                return this.getStage(backend, stage.onTypeCheckingError);
            case Success.Success:
                return this.getStage(backend, stage.onSuccess);
        }
        return null;
    }

    public static backendEquals(a: Backend, b: Backend) {
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

    private static stageEquals(a: Stage, b: Stage): boolean {
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

    public static nailgunEquals(newSettings: NailgunSettings, oldSettings: NailgunSettings): boolean {
        let same = oldSettings.clientExecutable == newSettings.clientExecutable;
        same = same && oldSettings.port == newSettings.port;
        same = same && oldSettings.serverJar == newSettings.serverJar;
        same = same && oldSettings.timeout == newSettings.timeout;
        return same;
    }

    static expandCustomArguments(program: string, stage: Stage, fileToVerify: string, backend: Backend): string {
        let args = program + " " + stage.mainMethod + " " + (backend.useNailgun ? "--nailgun-port $nailgunPort$ " : "") + stage.customArguments;
        if (!args || args.length == 0) return "";
        args = args.replace(/\s+/g, ' '); //remove multiple spaces
        args = args.replace(/\$z3Exe\$/g, '"' + this.settings.paths.z3Executable + '"');
        args = args.replace(/\$boogieExe\$/g, '"' + this.settings.paths.boogieExecutable + '"');
        args = args.replace(/\$mainMethod\$/g, stage.mainMethod);
        args = args.replace(/\$nailgunPort\$/g, this.settings.nailgunSettings.port);
        args = args.replace(/\$fileToVerify\$/g, '"' + fileToVerify + '"');
        args = args.replace(/\$backendPaths\$/g, Settings.backendJars(backend))
        return args;
    }

    static expandViperToolsPath(path: string): string {
        if (!path) return path;
        if (typeof Settings.settings.paths.viperToolsPath !== "string") {
            return path;
        }
        path = path.replace(/\$viperTools\$/g, <string>Settings.settings.paths.viperToolsPath);
        return path;
    }

    public static selectBackend(settings: ViperSettings, selectedBackend: string): Backend {
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

    public static getBackendNames(settings: ViperSettings): string[] {
        let backendNames = [];
        settings.verificationBackends.forEach((backend) => {
            backendNames.push(backend.name);
        })
        return backendNames;
    }

    public static valid(): boolean {
        Server.sendSettingsCheckedNotification({ ok: this._valid, errors: this._errors, settings: this.settings });
        return this._valid;
    }

    public static setNailgunPort(nailgunSettings: NailgunSettings): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (!nailgunSettings.port || nailgunSettings.port == "*") {
                //use a random port
                portfinder.getPort(function (err, port) {
                    Log.log("nailgun port is chosen as: " + port, LogLevel.Debug);
                    nailgunSettings.port = port;
                    resolve(true);
                });
            } else {
                resolve(true);
            }
        });
    }

    //tries to restart backend, 
    public static initiateBackendRestartIfNeeded(oldSettings?: ViperSettings, selectedBackend?: string, viperToolsUpdated: boolean = false) {
        Settings.checkSettings(viperToolsUpdated).then(() => {
            if (Settings.valid()) {
                let newBackend = Settings.selectBackend(Settings.settings, selectedBackend);
                if (newBackend) {
                    //only restart the backend after settings changed if the active backend was affected
                    let restartBackend = !Server.nailgunService.isReady() //backend is not ready -> restart
                        || !Settings.backendEquals(Server.backend, newBackend) //change in backend
                        || (oldSettings && (newBackend.useNailgun && (!Settings.nailgunEquals(Settings.settings.nailgunSettings, oldSettings.nailgunSettings)))) //backend needs nailgun and nailgun settings changed
                        || viperToolsUpdated; //Viper Tools Update might have modified the binaries
                    if (restartBackend) {
                        Log.log(`Change Backend: from ${Server.backend ? Server.backend.name : "No Backend"} to ${newBackend ? newBackend.name : "No Backend"}`, LogLevel.Info);
                        Server.backend = newBackend;
                        Server.verificationTasks.forEach(task => task.resetLastSuccess());
                        Server.sendStartBackendMessage(Server.backend.name);
                        //Server.nailgunService.startOrRestartNailgunServer(Server.backend, true);
                    } else {
                        //In case the backend does not need to be restarted, retain the port
                        if (oldSettings) { Settings.settings.nailgunSettings.port = oldSettings.nailgunSettings.port; }
                        Log.log("No need to restart backend. It is still the same", LogLevel.Debug)
                        Server.backend = newBackend;
                        Server.sendBackendReadyNotification({ name: Server.backend.name, restarted: false });
                    }
                } else {
                    Log.error("No backend, even though the setting check succeeded.");
                }
            } else {
                Server.nailgunService.stopNailgunServer();
            }
        });
    }

    private static checkNailgunSettings(nailgunSettings: NailgunSettings): string {
        //check nailgun port
        if (!/^(\*|\d+)$/.test(nailgunSettings.port)) {
            this.addError("Invalid NailgunPort: " + nailgunSettings.port);
        } else {
            try {
                let port = Number.parseInt(nailgunSettings.port);
                if (port < 1024 || port > 65535) {
                    this.addError("Invalid NailgunPort: please use a port in the range of 1024 - 65535");
                }
            } catch (e) {
                this.addError("viperSettings.nailgunSettings.port needs to be an integer or *");
            }
        }
        //check nailgun jar
        if (!nailgunSettings.serverJar || nailgunSettings.serverJar.length == 0) {
            this.addError("Path to nailgun server jar is missing");
        } else {
            nailgunSettings.serverJar = Settings.checkPath(nailgunSettings.serverJar, "Nailgun Server:", false, false).path
        }

        //check nailgun client
        nailgunSettings.clientExecutable = Settings.checkPath(nailgunSettings.clientExecutable, "Nailgun Client:", true, true).path

        //check nailgun timeout
        if (!nailgunSettings.timeout || (nailgunSettings.timeout && nailgunSettings.timeout <= 0)) {
            nailgunSettings.timeout = null;
        }
        return null;
    }

    private static addError(msg: string) {
        this._errors.push({ type: SettingsErrorType.Error, msg: msg });
    }
    private static addWarning(msg: string) {
        this._errors.push({ type: SettingsErrorType.Warning, msg: msg });
    }

    public static checkSettings(viperToolsUpdated: boolean): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                this._valid = false;
                this._errors = [];

                //check settings versions
                Server.connection.sendRequest(Commands.RequestRequiredVersion).then((requiredVersions: Versions) => {
                    let settings = Settings.settings;
                    let oldSettings: string[] = [];

                    let defaultSettings = requiredVersions.defaultSettings;

                    //check the settings versions
                    if (!requiredVersions) {
                        Log.error("Getting required version failed.");
                    } else {
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
                        resolve(false); return;
                    }

                    //Check viperToolsProvider
                    settings.preferences.viperToolsProvider = this.checkPlatformDependentUrl(settings.preferences.viperToolsProvider);

                    //Check Paths
                    //check viperToolsPath
                    let resolvedPath: ResolvedPath = this.checkPath(settings.paths.viperToolsPath, "Path to Viper Tools:", false, true, true);
                    settings.paths.viperToolsPath = resolvedPath.path;
                    if (!resolvedPath.exists) {
                        if (!viperToolsUpdated) {
                            //Automatically install the Viper tools
                            Server.updateViperTools(true);
                            reject(); // in this case we do not want to continue restarting the backend,
                            //the backend will be restarted after the update
                        } else {
                            resolve(false);
                        }
                        return;
                    }
                    //check z3 Executable
                    settings.paths.z3Executable = this.checkPath(settings.paths.z3Executable, "z3 Executable:", true, true).path;
                    //check boogie executable
                    settings.paths.boogieExecutable = this.checkPath(settings.paths.boogieExecutable, `Boogie Executable: (If you don't need boogie, set it to "")`, true, true).path;

                    //check backends
                    if (!settings.verificationBackends || settings.verificationBackends.length == 0) {
                        settings.verificationBackends = defaultSettings["viperSettings.verificationBackends"].default;
                    } else {
                        defaultSettings["viperSettings.verificationBackends"].default.forEach(defaultBackend => {
                            let customBackend = settings.verificationBackends.filter(backend => backend.name == defaultBackend.name)[0];
                            if (customBackend) {
                                //Merge the backend with the default backend
                                this.mergeBackend(customBackend, defaultBackend);
                            } else {
                                //Add the default backend if there is none with the same name
                                settings.verificationBackends.push(defaultBackend);
                            }
                        })
                    }
                    Settings.checkBackends(settings.verificationBackends);
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
                    this._valid = !this._errors.some(error => error.type == SettingsErrorType.Error); //if there is no error -> valid
                    if (this._valid) {
                        Log.log("The settings are ok", LogLevel.Info);
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                });
            } catch (e) {
                Log.error("Error checking settings: " + e);
                resolve(false);
            }
        });
    }

    private static mergeBackend(custom: Backend, def: Backend) {
        if (!custom || !def || custom.name != def.name) return;
        if (!custom.paths || custom.paths.length == 0) custom.paths = def.paths;
        if (!custom.stages) custom.stages = def.stages
        else this.mergeStages(custom.stages, def.stages);
        if (!custom.timeout) custom.timeout = def.timeout;
        if (custom.useNailgun === undefined) custom.useNailgun = def.useNailgun;
    }

    private static mergeStages(custom: Stage[], defaultStages: Stage[]) {
        defaultStages.forEach(def => {
            let cus = custom.filter(stage => stage.name == def.name)[0];
            if (cus) {
                //merge
                if(cus.customArguments === undefined) cus.customArguments = def.customArguments;
                if(!cus.mainMethod) cus.mainMethod = def.mainMethod;
                if(cus.isVerification === undefined) cus.isVerification = def.isVerification;
            } else {
                custom.push(def);
            }
        });
    }

    private static checkPlatformDependentUrl(url: string | PlatformDependentURL): string {
        let stringURL = null;
        if (url) {
            if (typeof url === "string") {
                stringURL = url;
            } else {
                if (Settings.isLinux) {
                    stringURL = url.linux;
                } else if (Settings.isMac) {
                    stringURL = url.mac;
                } else if (Settings.isWin) {
                    stringURL = url.windows;
                } else {
                    Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
                }
            }
        }
        if (!stringURL || stringURL.length == 0) {
            this.addError("The viperToolsProvider is missing in the preferences");
        }
        //TODO: check url format
        return stringURL;
    }

    private static checkPath(path: (string | PlatformDependentPath), prefix: string, executable: boolean, allowPlatformDependentPath: boolean, allowStringPath: boolean = true): ResolvedPath {
        if (!path) {
            this.addError(prefix + " path is missing");
            return { path: null, exists: false };
        }
        let stringPath: string;
        if (typeof path === "string") {
            if (!allowStringPath) {
                this.addError(prefix + ' path has wrong type: expected: {windows:string, mac:string, linux:string}, found: ' + typeof path);
                return { path: stringPath, exists: false };
            }
            stringPath = <string>path;
        } else {
            if (!allowPlatformDependentPath) {
                this.addError(prefix + ' path has wrong type: expected: string, found: ' + typeof path + " at path: " + JSON.stringify(path));
                return { path: null, exists: false };
            }
            let platformDependentPath: PlatformDependentPath = <PlatformDependentPath>path;
            if (Settings.isLinux) {
                stringPath = platformDependentPath.linux;
            } else if (Settings.isMac) {
                stringPath = platformDependentPath.mac;
            } else if (Settings.isWin) {
                stringPath = platformDependentPath.windows;
            } else {
                Log.error("Operation System detection failed, Its not Mac, Windows or Linux");
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

    private static checkBackends(backends: Backend[]) {
        //Log.log("Checking backends...", LogLevel.Debug);
        if (!backends || backends.length == 0) {
            this.addError("No backend detected, specify at least one backend");
            return;
        }

        let backendNames: Set<string> = new Set<string>();

        for (let i = 0; i < backends.length; i++) {
            let backend = backends[i];
            if (!backend) {
                this.addError("Empty backend detected");
            }
            else if (!backend.name || backend.name.length == 0) {//name there?
                this.addWarning("Every backend setting should have a name.");
                backend.name = "backend" + (i + 1);
            }
            let backendName = "Backend " + backend.name + ":";
            //check for dublicate backends
            if (backendNames.has(backend.name)) this.addError("Dublicated backend name: " + backend.name);
            backendNames.add(backend.name);

            //check stages
            if (!backend.stages || backend.stages.length == 0) {
                this.addError(backendName + " The backend setting needs at least one stage");
                continue;
            }
            let stages: Set<string> = new Set<string>();
            let verifyStageFound = false;
            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
                if (!stage) {
                    this.addError(backendName + " Empty stage detected");
                }
                else if (!stage.name || stage.name.length == 0) {
                    this.addError(backendName + " Every stage needs a name.");
                } else {
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
                    if (Settings.settings.advancedFeatures.enabled && hasIdeMode && !hasIdeModeAdvanced) {
                        this.addWarning(backendAndStage + " the advanced features only work when --ideModeAdvanced is specified.");
                    }
                    if (!Settings.settings.advancedFeatures.enabled && hasIdeModeAdvanced) {
                        this.addWarning(backendAndStage + " when the advanced features are disabled, you can speed up the verification by removing the --ideModeAdvanced flag from the customArguments.");
                    }
                }
            }
            for (let i = 0; i < backend.stages.length; i++) {
                let stage: Stage = backend.stages[i];
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
            } else {
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

    public static backendJars(backend: Backend): string {
        let backendJars = "";

        let concatenationSymbol = Settings.isWin ? ";" : ":";
        backend.paths.forEach(path => {
            if (this.isJar(path)) {
                //its a jar file
                backendJars = backendJars + concatenationSymbol + '"' + path + '"';
            } else {
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

    private static isJar(file: string): boolean {
        return file ? file.trim().endsWith(".jar") : false;
    }

    private static extractEnvVars(path: string): ResolvedPath {
        if (path && path.length > 2) {
            while (path.indexOf("%") >= 0) {
                let start = path.indexOf("%")
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

    private static resolvePath(path: string, executable: boolean): ResolvedPath {
        try {
            if (!path) {
                return { path: path, exists: false };
            }
            path = path.trim();

            //expand internal variables
            let resolvedPath = this.expandViperToolsPath(path);
            //handle env Vars
            let envVarsExtracted = this.extractEnvVars(resolvedPath);
            if (!envVarsExtracted.exists) return envVarsExtracted;
            resolvedPath = envVarsExtracted.path;

            //handle files in Path env var
            if (resolvedPath.indexOf("/") < 0 && resolvedPath.indexOf("\\") < 0) {
                //its only a filename, try to find it in the path
                let pathEnvVar: string = process.env.PATH;
                if (pathEnvVar) {
                    let pathList: string[] = pathEnvVar.split(Settings.isWin ? ";" : ":");
                    for (let i = 0; i < pathList.length; i++) {
                        let pathElement = pathList[i];
                        let combinedPath = this.toAbsolute(pathHelper.join(pathElement, resolvedPath));
                        let exists = this.exists(combinedPath, executable);
                        if (exists.exists) return exists;
                    }
                }
            } else {
                //handle absolute and relative paths
                if (this.home) {
                    resolvedPath = resolvedPath.replace(/^~($|\/|\\)/, `${this.home}$1`);
                }
                resolvedPath = this.toAbsolute(resolvedPath);
                return this.exists(resolvedPath, executable);
            }
            return { path: resolvedPath, exists: false };
        } catch (e) {
            Log.error("Error resolving path: " + e);
        }
    }

    private static exists(path: string, executable: boolean): ResolvedPath {
        try {
            fs.accessSync(path);
            return { path: path, exists: true };
        } catch (e) { }
        if (executable && this.isWin && !path.toLowerCase().endsWith(".exe")) {
            path += ".exe";
            //only one recursion at most, because the ending is checked
            return this.exists(path, executable);
        }
        return { path: path, exists: false }
    }

    private static toAbsolute(path: string): string {
        return pathHelper.resolve(pathHelper.normalize(path));
    }
}

class Version {
    versionNumbers: number[];
    constructor(version: string) {
        try {
            if (!version) {
                this.versionNumbers = [0, 0, 0];
            } else {
                this.versionNumbers = version.split(".").map(x => Number.parseInt(x));
            }
        } catch (e) {
            Log.error("Error parsing version: " + e);
        }
    }
    toString(): string {
        return this.versionNumbers.join(".");
    }

    //1: this is larger, -1 other is larger
    compare(other: Version): number {
        for (let i = 0; i < this.versionNumbers.length; i++) {
            if (i >= other.versionNumbers.length) return 1;
            if (this.versionNumbers[i] > other.versionNumbers[i]) return 1;
            if (this.versionNumbers[i] < other.versionNumbers[i]) return -1;
        }
        return this.versionNumbers.length < other.versionNumbers.length ? -1 : 0;
    }
}