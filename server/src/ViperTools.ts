import * as fs from "fs";
import * as path from 'path';
import { Log } from "./Log";
import { Settings } from "./Settings";
import { LogLevel } from "./ViperProtocol";
import { Dependency, DependencyInstaller, GitHubReleaseAsset, GitHubZipExtractor, LocalReference, Location, ProgressListener, RemoteZipExtractor } from "./vs-verification-toolbox";

export default class ViperTools {
    /**
     * This is a temporary solution to compute the installation path based on the build channel without calling `update`
     */
    public static getInstalledViperToolsPath(context: ViperToolsContext): string {
        const selectedChannel = Helper.getBuildChannel(context);
        if (selectedChannel === BuildChannel.Local) {
            return context.localViperToolsPath;
        } else {
            return path.join(Settings.globalStoragePath, selectedChannel, this.buildChannelSubfolderName);
        }
    }

    /**
     * Checks, downloads, and installs Viper tools
     * @param shouldUpdate indicates whether tools should be updated even though they are already installed
     * @param notificationText optional string describing cause of this update. This string will be shown as 
     *                          a popup in case tools have been downloaded and installed
     */
     public static async update(context: ViperToolsContext, shouldUpdate: boolean, notificationText?: string): Promise<Location> {
        async function confirm(): Promise<void> {
            if (shouldUpdate || Helper.assumeYes()) {
                // do not ask user
                return;
            } else {
                const confirmation = await context.confirm();
                if (!confirmation) {
                    // user has dismissed message without confirming
                    return Promise.reject(Texts.viperToolsInstallationDenied);
                }
            }
        }

        const selectedChannel = Helper.getBuildChannel(context);
        const dependency = await this.getDependency(context, shouldUpdate);
        Log.log(`Installing dependencies for build channel ${selectedChannel}`, LogLevel.Debug);
        const location: Location = await dependency.install(selectedChannel, shouldUpdate, context.progressListener, confirm)
            .catch(Helper.rethrow(`Downloading and unzipping the Viper Tools has failed`));

        if (Settings.isLinux || Settings.isMac) {
            const boogiePath = Helper.getBoogiePath(context, location);
            const z3Path = Helper.getZ3Path(context, location);
            fs.chmodSync(z3Path, '755');
            fs.chmodSync(boogiePath, '755');
        }

        // no information popups (via `Log.hint`) are created here as the client takes care of that itself.

        return location;
    }

    private static async getDependency(context: ViperToolsContext, shouldUpdate: boolean): Promise<Dependency<BuildChannel>> {
        const buildChannelStrings = Object.keys(BuildChannel);
        const buildChannels = buildChannelStrings.map(c =>
            // Convert string to enum. See https://stackoverflow.com/a/17381004/2491528
            BuildChannel[c as keyof typeof BuildChannel]);
        
        // note that `installDestination` is only used if tools actually have to be downloaded and installed there, i.e. it is 
        // not used for build channel "Local":
        const installDestination = Settings.globalStoragePath;
        const installers = await Promise.all(buildChannels
            .map<Promise<[BuildChannel, DependencyInstaller]>>(async c => 
                [c, await this.getDependencyInstaller(context, c)])
            );
        return new Dependency<BuildChannel>(
            installDestination,
            ...installers
        );
    }

    private static getDependencyInstaller(context: ViperToolsContext, buildChannel: BuildChannel): Promise<DependencyInstaller> {
        if (buildChannel == BuildChannel.Local) {
            return this.getLocalDependencyInstaller(context);
        } else {
            return this.getRemoteDependencyInstaller(context, buildChannel);
        }
    }

    private static async getLocalDependencyInstaller(context: ViperToolsContext): Promise<DependencyInstaller> {
        return new LocalReference(Helper.getLocalViperToolsPath(context));
    }

    private static get buildChannelSubfolderName(): string {
        return "ViperTools";
    }

    private static async getRemoteDependencyInstaller(context: ViperToolsContext, buildChannel: BuildChannel): Promise<DependencyInstaller> {
        const viperToolsRawProviderUrl = Helper.getViperToolsProvider(context, buildChannel);
        // note that `viperToolsProvider` might be one of the "special" URLs as specified in the README (i.e. to a GitHub releases asset):
        const viperToolsProvider = this.parseGitHubAssetURL(viperToolsRawProviderUrl);

        const folderName = this.buildChannelSubfolderName; // folder name to which ZIP will be unzipped to
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
    private static parseGitHubAssetURL(url: string): {isGitHubAsset: boolean, getUrl: () => Promise<string>} {
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
            const resolveGitHubUrl = () => GitHubReleaseAsset.getLatestAssetUrl(owner, repo, assetName, includePrereleases, token)
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
            const resolveGitHubUrl = () => GitHubReleaseAsset.getTaggedAssetUrl(owner, repo, assetName, tag, token)
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
}

export class ViperToolsContext {
    buildVersion: "Stable" | "Nightly" | "Local";
    localViperToolsPath: string; // path to location at which Viper tools have been manually installed (only used for build version "Local")
    getViperToolsProviderUrl: (channel: BuildChannel) => string;
    getBoogiePath: (unzippedPath: string) => string; // only used on macOS and Linux
    getZ3Path: (unzippedPath: string) => string; // only used on macOS and Linux
    confirm: () => Promise<boolean>; // called when a confirmation dialog should be present to the user. Promise should be resolved to true if it's okay to install ViperTools
    progressListener: ProgressListener;
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

class Helper {
    public static getBuildChannel(context: ViperToolsContext): BuildChannel {
        if (context.buildVersion === "Nightly") {
            return BuildChannel.Nightly;
        } else if (context.buildVersion === "Local") {
            return BuildChannel.Local
        }
        return BuildChannel.Stable;
    }

    /**
     * Gets Viper Tools Provider URL as stored in the settings.
     * Note that the returned URL might be invalid or correspond to one of the "special" URLs as specified in the README (e.g. to download a GitHub release asset)
     */
    public static getViperToolsProvider(context: ViperToolsContext, channel: BuildChannel): string {
        return context.getViperToolsProviderUrl(channel);
    }

    public static getGitHubToken(): string {
        return process.env["GITHUB_TOKEN"];
    }

    /**
     * Returns true if Viper IDE runs in a non-interactive environment and confirmations should automatically be accepted.
     */
     public static assumeYes(): boolean {
        const value = process.env["VIPER_IDE_ASSUME_YES"];
        return value != null && 
            (value == "1" || value.toUpperCase() === "TRUE");
    }

    /**
     * Get path to location at which Viper tools have been manually installed (only used for build version "Local").
     */
     public static getLocalViperToolsPath(context: ViperToolsContext): string {
        return context.localViperToolsPath;
    }

    public static getBoogiePath(context: ViperToolsContext, location: Location): string {
        return context.getBoogiePath(location.basePath);
    }

    public static getZ3Path(context: ViperToolsContext, location: Location): string {
        return context.getZ3Path(location.basePath);
    }

    public static rethrow(msg: string): (originalReason: any) => PromiseLike<never> {
        return (originalReason: any) => {
            Log.log(originalReason, LogLevel.Info);
            throw new Error(`${msg} (reason: '${originalReason}')`);
        }
    }
}

export enum BuildChannel {
    Stable = "Stable",
    Nightly = "Nightly",
    Local = "Local"
}
