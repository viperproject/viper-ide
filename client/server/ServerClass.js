/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const ViperServerService_1 = require("./ViperServerService");
const vscode_languageserver_1 = require("vscode-languageserver");
const ViperProtocol_1 = require("./ViperProtocol");
const Log_1 = require("./Log");
const Settings_1 = require("./Settings");
const pathHelper = require("path");
const fs = require("fs");
const http = require("http");
const os = require('os');
const globToRexep = require('glob-to-regexp');
let mkdirp = require('mkdirp');
var DecompressZip = require('decompress-zip');
class Server {
    static stage() {
        if (this.executedStages && this.executedStages.length > 0) {
            return this.executedStages[this.executedStages.length - 1];
        }
        else
            return null;
    }
    static refreshEndings() {
        return new Promise((resolve, reject) => {
            Server.connection.sendRequest(ViperProtocol_1.Commands.GetViperFileEndings).then((endings) => {
                this.viperFileEndings = endings;
                resolve(true);
            }, err => {
                Log_1.Log.error("GetViperFileEndings request was rejected by the client: " + err);
            });
        });
    }
    static isViperSourceFile(uri, firstTry = true) {
        return new Promise((resolve, reject) => {
            if (!this.viperFileEndings) {
                if (firstTry) {
                    Log_1.Log.log("Refresh the viper file endings.", ViperProtocol_1.LogLevel.Debug);
                    this.refreshEndings().then(() => {
                        this.isViperSourceFile(uri, false).then(success => {
                            resolve(success);
                        });
                    });
                }
                else {
                    resolve(false);
                }
            }
            else {
                resolve(this.viperFileEndings.some(globPattern => {
                    let regex = globToRexep(globPattern);
                    return regex.test(uri);
                }));
            }
        });
    }
    static showHeap(task, clientIndex, isHeapNeeded) {
        Server.connection.sendRequest(ViperProtocol_1.Commands.HeapGraph, task.getHeapGraphDescription(clientIndex, isHeapNeeded));
    }
    //Communication requests and notifications sent to language client
    static sendStateChangeNotification(params, task) {
        if (task) {
            task.state = params.newState;
        }
        this.connection.sendNotification(ViperProtocol_1.Commands.StateChange, params);
    }
    static sendBackendReadyNotification(params) {
        this.connection.sendNotification(ViperProtocol_1.Commands.BackendReady, params);
    }
    static sendStopDebuggingNotification() {
        this.connection.sendNotification(ViperProtocol_1.Commands.StopDebugging);
    }
    // static sendBackendChangeNotification(name: string) {
    //     this.connection.sendNotification(Commands.BackendChange, name);
    // }
    static sendSettingsCheckedNotification(errors) {
        this.connection.sendNotification(ViperProtocol_1.Commands.SettingsChecked, errors);
    }
    static sendDiagnostics(params) {
        this.connection.sendDiagnostics(params);
    }
    static sendStepsAsDecorationOptions(decorations) {
        Log_1.Log.log("Update the decoration options (" + decorations.decorationOptions.length + ")", ViperProtocol_1.LogLevel.Debug);
        this.connection.sendNotification(ViperProtocol_1.Commands.StepsAsDecorationOptions, decorations);
    }
    static sendVerificationNotStartedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.VerificationNotStarted, uri);
    }
    static sendFileOpenedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.FileOpened, uri);
    }
    static sendFileClosedNotification(uri) {
        this.connection.sendNotification(ViperProtocol_1.Commands.FileClosed, uri);
    }
    static sendLogMessage(command, params) {
        this.connection.sendNotification(command, params);
    }
    static sendProgressMessage(params) {
        this.connection.sendNotification(ViperProtocol_1.Commands.Progress, params);
    }
    static sendStartBackendMessage(backend, forceRestart, isViperServer) {
        this.connection.sendNotification(ViperProtocol_1.Commands.StartBackend, { backend: backend, forceRestart: forceRestart, isViperServer: isViperServer });
    }
    static containsNumber(s) {
        if (!s || s.length == 0)
            return false;
        let pattern = new RegExp(/(\d+)\.(\d+)?/g);
        let match = pattern.exec(s);
        return (match && match[1] && match[2]) ? true : false;
    }
    //regex helper methods
    static extractNumber(s) {
        try {
            let match = /^.*?(\d+)([\.,](\d+))?.*$/.exec(s);
            if (match && match[1] && match[3]) {
                return Number.parseFloat(match[1] + "." + match[3]);
            }
            else if (match && match[1]) {
                return Number.parseInt(match[1]);
            }
            Log_1.Log.error(`Error extracting number from  "${s}"`);
            return 0;
        }
        catch (e) {
            Log_1.Log.error(`Error extracting number from  "${s}": ${e}`);
        }
    }
    static extractPosition(s) {
        let before = "";
        let after = "";
        if (!s)
            return { before: before, pos: null, range: null, after: after };
        let pos;
        let range;
        try {
            if (s) {
                //parse position:
                let regex = /^(.*?)(\(?[^ ]*?@(\d+)\.(\d+)\)?|(\d+):(\d+)|<un.*>):?(.*)$/.exec(s);
                if (regex && regex[3] && regex[4]) {
                    //subtract 1 to confirm with VS Codes 0-based numbering
                    let lineNr = Math.max(0, +regex[3] - 1);
                    let charNr = Math.max(0, +regex[4] - 1);
                    pos = { line: lineNr, character: charNr };
                }
                else if (regex && regex[5] && regex[6]) {
                    //subtract 1 to confirm with VS Codes 0-based numbering
                    let lineNr = Math.max(0, +regex[5] - 1);
                    let charNr = Math.max(0, +regex[6] - 1);
                    pos = { line: lineNr, character: charNr };
                }
                if (regex && regex[1]) {
                    before = regex[1].trim();
                }
                if (regex && regex[7]) {
                    after = regex[7].trim();
                }
                //parse range
                regex = /@\[(\d+)[.:](\d+)-(\d+)[.:](\d+)]/.exec(s);
                if (regex && regex[1] && regex[2] && regex[3] && regex[4]) {
                    range = {
                        start: {
                            line: Math.max(0, +regex[1] - 1),
                            character: Math.max(0, +regex[2] - 1)
                        },
                        end: {
                            line: Math.max(0, +regex[3] - 1),
                            character: Math.max(0, +regex[4] - 1)
                        }
                    };
                    if (pos) {
                        if (pos.line != range.start.line || pos.character != range.start.character) {
                            Log_1.Log.log("Warning: parsed message has contradicting position information", ViperProtocol_1.LogLevel.Debug);
                        }
                    }
                    else {
                        pos = range.start;
                    }
                }
            }
        }
        catch (e) {
            Log_1.Log.error("Error extracting number out of: " + s);
        }
        return { before: before, pos: pos, range: range, after: after };
    }
    static extractRange(startString, endString) {
        let start = Server.extractPosition(startString).pos;
        let end = Server.extractPosition(endString).pos;
        //handle uncomplete positions
        if (!end && start) {
            end = start;
        }
        else if (!start && end) {
            start = end;
        }
        else if (!start && !end) {
            start = { line: 0, character: 0 };
            end = start;
        }
        return { start: start, end: end };
    }
    //file system helper methods
    static getUser() {
        if (Settings_1.Settings.isLinux) {
            return process.env["USER"];
        }
        else if (Settings_1.Settings.isMac) {
            return process.env["USER"];
        }
        else {
            Log_1.Log.error("getUser is unimplemented for Windows"); //TODO: implement
            return;
        }
    }
    static makeSureFileExistsAndCheckForWritePermission(filePath, firstTry = true) {
        return new Promise((resolve, reject) => {
            try {
                let folder = pathHelper.dirname(filePath);
                mkdirp(folder, (err) => {
                    if (err && err.code != 'EEXIST') {
                        resolve(err.code + ": Error creating " + folder + " " + err.message);
                    }
                    else {
                        fs.open(filePath, 'a', (err, file) => {
                            if (err) {
                                resolve(err.code + ": Error opening " + filePath + " " + err.message);
                            }
                            else {
                                fs.close(file, err => {
                                    if (err) {
                                        resolve(err.code + ": Error closing " + filePath + " " + err.message);
                                    }
                                    else {
                                        fs.access(filePath, 2, (e) => {
                                            if (e) {
                                                resolve(e.code + ": Error accessing " + filePath + " " + e.message);
                                            }
                                            else {
                                                resolve(null);
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
            catch (e) {
                resolve(e);
            }
        });
    }
    static download(url, filePath) {
        return new Promise((resolve, reject) => {
            try {
                Log_1.Log.startProgress();
                let file = fs.createWriteStream(filePath);
                let request = http.get(url, function (response) {
                    response.pipe(file);
                    //download progress 
                    // WTF, why is it a union type? No answer here: 
                    // https://nodejs.org/api/http.html#http_class_http_incomingmessage
                    let resp_head = response.headers['content-length'];
                    let len = typeof resp_head === 'string'
                        ? parseInt(resp_head, 10)
                        : parseInt(resp_head[0], 10);
                    let cur = 0;
                    response.on("data", function (chunk) {
                        cur += chunk.length;
                        Log_1.Log.progress("Download Viper Tools", cur, len, ViperProtocol_1.LogLevel.Debug);
                    });
                    file.on('finish', function () {
                        file.close();
                        resolve(true);
                    });
                    request.on('error', function (err) {
                        Log_1.Log.error("Error downloading viper tools: " + err.message);
                        fs.unlink(filePath, (e) => {
                            Log_1.Log.error(" (things got really nasty: the newly created files cannot be deleted.)");
                        });
                        resolve(false);
                    });
                });
            }
            catch (e) {
                Log_1.Log.error("Error downloading viper tools: " + e);
            }
        });
    }
    ;
    static extract(filePath) {
        return new Promise((resolve, reject) => {
            try {
                //extract files
                Log_1.Log.log("Extracting files...", ViperProtocol_1.LogLevel.Info);
                Log_1.Log.startProgress();
                let unzipper = new DecompressZip(filePath);
                unzipper.on('progress', function (fileIndex, fileCount) {
                    Log_1.Log.progress("Extracting Viper Tools", fileIndex + 1, fileCount, ViperProtocol_1.LogLevel.Debug);
                });
                unzipper.on('error', function (e) {
                    if (e.code && e.code == 'ENOENT') {
                        Log_1.Log.error("Error updating the Viper Tools, missing create file permission in the viper tools directory: " + e);
                    }
                    else if (e.code && e.code == 'EACCES') {
                        Log_1.Log.error("Error extracting " + filePath + ": " + e + " | " + e.message);
                    }
                    else {
                        Log_1.Log.error("Error extracting " + filePath + ": " + e);
                    }
                    resolve(false);
                });
                unzipper.on('extract', function (log) {
                    resolve(true);
                });
                unzipper.extract({
                    path: pathHelper.dirname(filePath),
                    filter: function (file) {
                        return file.type !== "SymbolicLink";
                    }
                });
            }
            catch (e) {
                Log_1.Log.error("Error extracting viper tools: " + e);
                resolve(false);
            }
        });
    }
    static getParentDir(fileOrFolderPath) {
        if (!fileOrFolderPath)
            return null;
        let obj = pathHelper.parse(fileOrFolderPath);
        if (obj.base) {
            return obj.dir;
        }
        let folderPath = obj.dir;
        let match = folderPath.match(/(^.*)[\/\\].+$/); //the regex retrieves the parent directory
        if (match) {
            if (match[1] == fileOrFolderPath) {
                Log_1.Log.error("getParentDir has a fixpoint at " + fileOrFolderPath);
                return null;
            }
            return match[1];
        }
        else {
            return null;
        }
    }
    static updateViperTools(askForPermission) {
        try {
            if (!Settings_1.Settings.upToDate()) {
                Log_1.Log.hint("The settings are not up to date, refresh them before updating the Viper Tools. ", true);
                Server.connection.sendNotification(ViperProtocol_1.Commands.ViperUpdateComplete, false); //update failed
                return;
            }
            Log_1.Log.log("Updating Viper Tools ...", ViperProtocol_1.LogLevel.Default);
            let filename;
            if (Settings_1.Settings.isWin) {
                filename = "ViperToolsWin.zip";
            }
            else {
                filename = Settings_1.Settings.isLinux ? "ViperToolsLinux.zip" : "ViperToolsMac.zip";
            }
            //check access to download location
            let dir = Settings_1.Settings.settings.paths.viperToolsPath;
            let viperToolsPath = pathHelper.join(dir, filename);
            // In case the update is started automatically, always ask for permission. 
            // If it was requested by the user, only ask when sudo permission needed.
            let prepareFolderPromise;
            if (askForPermission) {
                prepareFolderPromise = Server.sudoMakeSureFileExistsAndSetOwner(dir);
            }
            else {
                prepareFolderPromise = Server.makeSureFileExistsAndCheckForWritePermission(viperToolsPath).then(error => {
                    if (error && !Settings_1.Settings.isWin && error.startsWith("EACCES")) {
                        //change the owner of the location 
                        Log_1.Log.log("Try to change the ownership of " + dir, ViperProtocol_1.LogLevel.Debug);
                        return Server.sudoMakeSureFileExistsAndSetOwner(dir);
                    }
                    else {
                        return error;
                    }
                });
            }
            prepareFolderPromise.then(error => {
                if (error) {
                    throw ("The Viper Tools Update failed, change the ViperTools directory to a folder in which you have permission to create files. " + error);
                }
                //download Viper Tools
                let url = Settings_1.Settings.settings.preferences.viperToolsProvider;
                Log_1.Log.log("Downloading ViperTools from " + url + " ...", ViperProtocol_1.LogLevel.Default);
                return Server.download(url, viperToolsPath);
            }).then(success => {
                if (success) {
                    return Server.extract(viperToolsPath);
                }
                else {
                    throw ("Downloading viper tools unsuccessful.");
                }
            }).then(success => {
                if (success) {
                    Log_1.Log.log("Extracting ViperTools finished " + (success ? "" : "un") + "successfully", ViperProtocol_1.LogLevel.Info);
                    if (success) {
                        //chmod to allow the execution of boogie and z3 files
                        if (Settings_1.Settings.isLinux || Settings_1.Settings.isMac) {
                            fs.chmodSync(pathHelper.join(dir, "z3", "bin", "z3"), '755'); //755 is for (read, write, execute)
                            fs.chmodSync(pathHelper.join(dir, "boogie", "Binaries", "Boogie.exe"), '755');
                            fs.chmodSync(pathHelper.join(dir, "boogie", "Binaries", "Boogie"), '755');
                        }
                        //delete archive
                        fs.unlink(viperToolsPath, (err) => {
                            if (err) {
                                Log_1.Log.error("Error deleting archive after ViperToolsUpdate: " + err);
                            }
                            Log_1.Log.log("ViperTools Update completed", ViperProtocol_1.LogLevel.Default);
                            Server.connection.sendNotification(ViperProtocol_1.Commands.ViperUpdateComplete, true); //success
                        });
                        //trigger a restart of the backend
                        Settings_1.Settings.initiateBackendRestartIfNeeded(null, null, true);
                    }
                }
                else {
                    throw ("Extracting viper tools unsuccessful.");
                }
            }).catch(e => {
                Log_1.Log.error(e);
                Server.connection.sendNotification(ViperProtocol_1.Commands.ViperUpdateComplete, false); //update failed
            });
        }
        catch (e) {
            Log_1.Log.error("Error updating viper tools: " + e);
            Server.connection.sendNotification(ViperProtocol_1.Commands.ViperUpdateComplete, false); //update failed
        }
    }
    static sudoMakeSureFileExistsAndSetOwner(filePath) {
        return new Promise((resolve, reject) => {
            let command;
            if (Settings_1.Settings.isWin) {
                command = 'mkdir "' + filePath + '" && takeown /f "' + filePath + '" /r /d y && icacls "' + filePath + '" /grant %USERNAME%:F /t /q';
            }
            else if (Settings_1.Settings.isLinux) {
                let user = Server.getUser();
                command = `sh -c "mkdir -p '` + filePath + `'; chown -R ` + user + `:` + user + ` '` + filePath + `'"`;
            }
            else {
                let user = Server.getUser();
                command = `sh -c "mkdir -p '` + filePath + `'; chown -R ` + user + `:staff '` + filePath + `'"`;
            }
            ViperProtocol_1.Common.sudoExecuter(command, "ViperTools Installer", () => {
                resolve();
            });
        });
    }
    //unused
    static checkForCreateAndWriteAccess(folderPath) {
        return new Promise((resolve, reject) => {
            if (!folderPath) {
                resolve("No access");
            }
            fs.stat((folderPath), (err, stats) => {
                if (err) {
                    if (err.code == 'ENOENT') {
                        //no such file or directory
                        this.checkForCreateAndWriteAccess(this.getParentDir(folderPath)).then(err => {
                            //pass along the error
                            resolve(err);
                        });
                    }
                    else if (err.code == 'EACCES') {
                        resolve("No read permission");
                    }
                    else {
                        resolve(err.message);
                    }
                }
                let writePermissions = stats.mode & 0x92;
                if (writePermissions) {
                    resolve(null);
                }
                else {
                    resolve("No write permission");
                }
            });
        });
    }
}
Server.tempDirectory = pathHelper.join(os.tmpdir(), ".vscode");
Server.backendOutputDirectory = os.tmpdir();
Server.documents = new vscode_languageserver_1.TextDocuments();
Server.verificationTasks = new Map();
Server.backendService = new ViperServerService_1.ViperServerService();
Server.startingOrRestarting = false;
exports.Server = Server;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2VydmVyQ2xhc3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NlcnZlckNsYXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQTs7QUFDWiw2REFBMEQ7QUFFMUQsaUVBQTZGO0FBQzdGLG1EQUErTjtBQUcvTiwrQkFBNEI7QUFDNUIseUNBQXNDO0FBQ3RDLG1DQUFtQztBQUNuQyx5QkFBeUI7QUFDekIsNkJBQTZCO0FBQzdCLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN6QixNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztBQUM5QyxJQUFJLE1BQU0sR0FBRyxPQUFPLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDL0IsSUFBSSxhQUFhLEdBQUcsT0FBTyxDQUFDLGdCQUFnQixDQUFDLENBQUM7QUFFOUMsTUFBYSxNQUFNO0lBYWYsTUFBTSxDQUFDLEtBQUs7UUFDUixJQUFJLElBQUksQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1lBQ3ZELE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztTQUM5RDs7WUFDSSxPQUFPLElBQUksQ0FBQztJQUNyQixDQUFDO0lBRUQsTUFBTSxDQUFDLGNBQWM7UUFDakIsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtZQUNuQyxNQUFNLENBQUMsVUFBVSxDQUFDLFdBQVcsQ0FBQyx3QkFBUSxDQUFDLG1CQUFtQixDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBaUIsRUFBRSxFQUFFO2dCQUNuRixJQUFJLENBQUMsZ0JBQWdCLEdBQUcsT0FBTyxDQUFDO2dCQUNoQyxPQUFPLENBQUMsSUFBSSxDQUFD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