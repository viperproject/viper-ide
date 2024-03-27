/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2022 ETH Zurich.
  */

 import * as fs from 'fs';
import * as vscode from 'vscode';
import { ConfirmResult, Dependency, DependencyInstaller, InstallResult, LocalReference, Location, Success, withProgressInWindow } from "vs-verification-toolbox";
import { Log } from './Log';
import { LogLevel } from './ViperProtocol';
import { BuildChannel, Settings } from './Settings';
import { Helper } from './Helper';
import { transformRight } from './Either';
import * as path from 'path';


export async function locateViperTools(context: vscode.ExtensionContext): Promise<Location> {
    const selectedChannel = Settings.getBuildChannel();
    const dependency = await getDependency(context);
    Log.log(`Locating dependencies for build channel ${selectedChannel}`, LogLevel.Debug);

    // we first try to locate it without installing anything and in case we do not find the Viper tools,
    // we ask the user for confirmation

    async function locateOnly(): Promise<Location> {
        const confirm: () => Promise<ConfirmResult> = () => Promise.resolve(ConfirmResult.Cancel); // always cancel if installation would be necessary
        const installationResult: InstallResult<Location> = await dependency.install(selectedChannel, false, () => {}, confirm)
            .catch(Helper.rethrow(`Locating the Viper tools was unsuccessful`));
        if (!(installationResult instanceof Success)) {
            throw new Error(`Locating the Viper tools was unsuccessful`);
        }
        return installationResult.value;
    }
    
    async function install(locateError: Error): Promise<Location> {
        async function confirm(): Promise<ConfirmResult> {
            if (Helper.assumeYes()) {
                // do not ask user
                return ConfirmResult.Continue;
            } else {
                const confirmation = await vscode.window.showInformationMessage(
                    Texts.installingViperToolsConfirmationMessage,
                    Texts.installingViperToolsConfirmationYesButton,
                    Texts.installingViperToolsConfirmationNoButton);
                if (confirmation === Texts.installingViperToolsConfirmationYesButton) {
                    return ConfirmResult.Continue;
                } else {
                    // user has dismissed message without confirming
                    return ConfirmResult.Cancel;
                }
            }
        }

        Log.log(`Viper tools have not been found, thus they get installed now (locating them resulted in '${locateError}')`, LogLevel.Info);
        const { result: installationResult } = await withProgressInWindow(
            Texts.updatingViperTools,
            listener => dependency.install(selectedChannel, true, listener, confirm));
        if (!(installationResult instanceof Success)) {
            throw new Error(Texts.viperToolsInstallationDenied);
        }
        Log.log(`Viper tools have been successfully installed`, LogLevel.Info);
        return installationResult.value;
    }

    async function setPermissions(location: Location): Promise<Location> {
        if (Settings.isLinux || Settings.isMac) {
            const z3Path = await Settings.getZ3Path(location);
            fs.chmodSync(z3Path, '755');

            const boogiePath = await Settings.getBoogiePath(location);
            // `boogiePath` will be left when the user provided e.g. an empty path.
            // ignored the error here and only change permissions if it's a valid path
            transformRight(boogiePath, path => {
                fs.chmodSync(path, '755');
            });
        }
        return location;
    }
    
    return locateOnly()
        .catch(err => install(err))
        .then(setPermissions);
}

async function getDependency(context: vscode.ExtensionContext): Promise<Dependency<BuildChannel>> {
    const buildChannelStrings = Object.keys(BuildChannel);
    const buildChannels = buildChannelStrings.map(c =>
        // Convert string to enum. See https://stackoverflow.com/a/17381004/2491528
        BuildChannel[c as keyof typeof BuildChannel]);
    
    // note that `installDestination` is only used when remote dependencies have to be downloaded, which is no longer the case
    const installDestination = Helper.getGlobalStoragePath(context);
    const installers = await Promise.all(buildChannels
        .map<Promise<[BuildChannel, DependencyInstaller]>>(async c => 
            [c, await getDependencyInstaller(c, context)])
        );
    return new Dependency<BuildChannel>(
        installDestination,
        ...installers
    );
}

function getDependencyInstaller(buildChannel: BuildChannel, context: vscode.ExtensionContext): Promise<DependencyInstaller> {
    if (buildChannel == BuildChannel.External) {
        return getExternalDependencyInstaller();
    } else {
        return getBuiltInDependencyInstaller(context);
    }
}

async function getExternalDependencyInstaller(): Promise<DependencyInstaller> {
    const toolsPath = await Settings.getLocalViperToolsPath(true);
    return new LocalReference(toolsPath);
}

async function getBuiltInDependencyInstaller(context: vscode.ExtensionContext): Promise<DependencyInstaller> {
    return new LocalReference(path.resolve(context.extension.extensionPath, "dependencies", "ViperTools"));
}

class Texts {
    public static installingViperToolsConfirmationMessage = "Viper IDE requires the Viper tools. Do you want to install them?";
    public static installingViperToolsConfirmationYesButton = "Yes";
    public static installingViperToolsConfirmationNoButton = "No";
    public static viperToolsInstallationDenied = "Installation of the required Viper tools has been denied. Restart Visual Studio Code and allow their installation.";
    public static updatingViperTools = "Updating Viper tools";
    public static installingViperTools = "Installing Viper tools";
    public static successfulUpdatingViperTools = "Successfully updated Viper tools. Please restart the IDE.";
    public static successfulInstallingViperTools = "Successfully installed Viper tools.";
    public static changedBuildChannel = "Changed the build channel of Viper tools. Please restart the IDE.";
}
