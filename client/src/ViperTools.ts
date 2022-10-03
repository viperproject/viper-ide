/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2022 ETH Zurich.
  */

 import * as fs from 'fs';
import * as vscode from 'vscode';
import { ConfirmResult, Dependency, DependencyInstaller, GitHubReleaseAsset, GitHubZipExtractor, InstallResult, LocalReference, Location, RemoteZipExtractor, Success, withProgressInWindow } from "vs-verification-toolbox";
import { Log } from './Log';
import { LogLevel } from './ViperProtocol';
import { BuildChannel, Settings } from './Settings';
import { Helper } from './Helper';

const buildChannelSubfolderName = "ViperTools";

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
            const boogiePath = await Settings.getBoogiePath(location);
            const z3Path = await Settings.getZ3Path(location);
            fs.chmodSync(z3Path, '755');
            fs.chmodSync(boogiePath, '755');
        }
        return location;
    }
    
    return locateOnly()
        .catch(err => install(err))
        .then(setPermissions);
}

export async function updateViperTools(context: vscode.ExtensionContext): Promise<Location> {
    async function confirm(): Promise<ConfirmResult> {
        return ConfirmResult.Continue;
    }
    
    
    const selectedChannel = Settings.getBuildChannel();
    const dependency = await getDependency(context);
    Log.log(`Updating dependencies for build channel ${selectedChannel}`, LogLevel.Debug);
    const { result: installationResult } = await withProgressInWindow(
        Texts.updatingViperTools,
        listener => dependency.install(selectedChannel, true, listener, confirm));
    if (!(installationResult instanceof Success)) {
        throw new Error(Texts.viperToolsInstallationDenied);
    }
    return installationResult.value;
}

async function getDependency(context: vscode.ExtensionContext): Promise<Dependency<BuildChannel>> {
    const buildChannelStrings = Object.keys(BuildChannel);
    const buildChannels = buildChannelStrings.map(c =>
        // Convert string to enum. See https://stackoverflow.com/a/17381004/2491528
        BuildChannel[c as keyof typeof BuildChannel]);
    
    // note that `installDestination` is only used if tools actually have to be downloaded and installed there, i.e. it is 
    // not used for build channel "Local":
    const installDestination = Helper.getGlobalStoragePath(context);
    const installers = await Promise.all(buildChannels
        .map<Promise<[BuildChannel, DependencyInstaller]>>(async c => 
            [c, await getDependencyInstaller(c)])
        );
    return new Dependency<BuildChannel>(
        installDestination,
        ...installers
    );
}

function getDependencyInstaller(buildChannel: BuildChannel): Promise<DependencyInstaller> {
    if (buildChannel == BuildChannel.Local) {
        return getLocalDependencyInstaller();
    } else {
        return getRemoteDependencyInstaller(buildChannel);
    }
}

async function getLocalDependencyInstaller(): Promise<DependencyInstaller> {
    const toolsPath = await Settings.getLocalViperToolsPath(true);
    return new LocalReference(toolsPath);
}

async function getRemoteDependencyInstaller(buildChannel: BuildChannel): Promise<DependencyInstaller> {
    const viperToolsRawProviderUrl = await Settings.getViperToolsProvider(buildChannel);
    // note that `viperToolsProvider` might be one of the "special" URLs as specified in the README (i.e. to a GitHub releases asset):
    const viperToolsProvider = parseGitHubAssetURL(viperToolsRawProviderUrl);

    const folderName = buildChannelSubfolderName; // folder name to which ZIP will be unzipped to
    if (viperToolsProvider.isGitHubAsset) {
        // provider is a GitHub release
        const token = Helper.getGitHubToken();
        return new GitHubZipExtractor(viperToolsProvider.getUrl, folderName, token);
    } else {
        // provider is a regular resource on the Internet
        const url = await viperToolsProvider.getUrl();
        return new RemoteZipExtractor(url, folderName);
    }
}

/**
 * Takes an url as input and checks whether it's a special URL to a GitHub release asset.
 * This function returns an object that indicates with the `isGitHubAsset` flag whether it is a GitHub asset or not. In addition, the `getUrl` function can
 * be called to lazily construct the URL for downloading the asset.
 */
function parseGitHubAssetURL(url: string): {isGitHubAsset: boolean, getUrl: () => Promise<string>} {
    const token = Helper.getGitHubToken();
    const latestRe = /^github.com\/([^/]+)\/([^/]+)\/releases\/latest\?asset-name=([^/?&]+)(&include-prereleases|)$/;
    const tagRe = /^github.com\/([^/]+)\/([^/]+)\/releases\/tags\/([^/?]+)\?asset-name=([^/?&]+)$/;
    const latestReMatches = url.match(latestRe);
    if (latestReMatches != null) {
        // match was found
        const owner = latestReMatches[1];
        const repo = latestReMatches[2];
        const assetName = latestReMatches[3];
        const includePrereleases = latestReMatches[4] === "&include-prereleases";
        const resolveGitHubUrl: () => Promise<string> = () => GitHubReleaseAsset.getLatestAssetUrl(owner, repo, assetName, includePrereleases, token)
            .catch(Helper.rethrow(`Retrieving asset URL of latest GitHub release has failed `
                + `(owner: '${owner}', repo: '${repo}', asset-name: '${assetName}', include-prereleases: ${includePrereleases})`));
        return {
            isGitHubAsset: true,
            getUrl: resolveGitHubUrl,
        };
    }
    const tagReMatches = url.match(tagRe);
    if (tagReMatches != null) {
        // match was found
        const owner = tagReMatches[1];
        const repo = tagReMatches[2];
        const tag = tagReMatches[3];
        const assetName = tagReMatches[4];
        const resolveGitHubUrl: () => Promise<string> = () => GitHubReleaseAsset.getTaggedAssetUrl(owner, repo, assetName, tag, token)
            .catch(Helper.rethrow(`Retrieving asset URL of a tagged GitHub release has failed `
                + `(owner: '${owner}', repo: '${repo}', tag: '${tag}', asset-name: '${assetName}')`));
        return {
            isGitHubAsset: true,
            getUrl: resolveGitHubUrl,
        };
    }
    // no match, return unmodified input URL:
    return {
        isGitHubAsset: false,
        getUrl: () => Promise.resolve(url),
    };
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
