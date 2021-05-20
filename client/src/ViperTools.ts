import * as vscode from 'vscode';
import * as fs from 'fs';
import { Dependency, DependencyInstaller, GitHubReleaseAsset, GitHubZipExtractor, Location, RemoteZipExtractor, withProgressInWindow } from "vs-verification-toolbox";
import { BuildChannel, Helper, Texts } from "./Helper";

export default class ViperTools {
    /**
     * Checks, downloads, and installs Viper tools
     * @param shouldUpdate indicates whether tools should be updated even though they are already installed
     * @param notificationText optional string describing cause of this update. This string will be shown as 
     *                          a popup in case tools have been downloaded and installed
     */
    public static async update(context: vscode.ExtensionContext, shouldUpdate: boolean, notificationText?: string): Promise<Location> {
        const selectedChannel = Helper.getBuildChannel();
        const dependency = await this.getDependency(context, shouldUpdate);
        const { result: location, didReportProgress } = await withProgressInWindow(
            shouldUpdate ? Texts.updatingViperTools : Texts.ensuringViperTools,
            listener => dependency.install(selectedChannel, shouldUpdate, listener)
          ).catch(Helper.rethrow(`Downloading and unzipping the Viper Tools has failed`));

        if (Helper.isLinux || Helper.isMac) {
            const boogiePath = Helper.getBoogiePath(location);
            const z3Path = Helper.getZ3Path(location);
            fs.chmodSync(z3Path, '755');
            fs.chmodSync(boogiePath, '755');
        }
        if (didReportProgress) {
            if (notificationText) {
                vscode.window.showInformationMessage(notificationText);
            } else if (shouldUpdate) {
                vscode.window.showInformationMessage(Texts.successfulUpdatingViperTools);
            } else {
                vscode.window.showInformationMessage(Texts.successfulEnsuringViperTools);
            }
        }
        return location;
    }

    private static async getDependency(context: vscode.ExtensionContext, shouldUpdate: boolean): Promise<Dependency<BuildChannel>> {
        const buildChannelStrings = Object.keys(BuildChannel);
        const buildChannels = buildChannelStrings.map(c =>
            // Convert string to enum. See https://stackoverflow.com/a/17381004/2491528
            BuildChannel[c as keyof typeof BuildChannel]);
        
        const viperToolsPath = Helper.getViperToolsPath(context);
        // make sure that this path exists:
        if (!fs.existsSync(viperToolsPath)) {
            fs.mkdirSync(viperToolsPath);
            // ask user for consent to install Viper Tools on first launch:
            if (!shouldUpdate && !Helper.assumeYes()) {
              const confirmation = await vscode.window.showInformationMessage(
                Texts.installingViperToolsConfirmationMessage,
                Texts.installingViperToolsConfirmationYesButton,
                Texts.installingViperToolsConfirmationNoButton);
              if (confirmation != Texts.installingViperToolsConfirmationYesButton) {
                // user has dismissed message without confirming
                return Promise.reject(Texts.viperToolsInstallationDenied);
              }
            }
     
            fs.mkdirSync(viperToolsPath, { recursive: true });
        }

        const installers = await Promise.all(buildChannels
            .map<Promise<[BuildChannel, DependencyInstaller]>>(async c => 
                [c, await this.getDependencyInstaller(c)])
            );
        return new Dependency<BuildChannel>(
            viperToolsPath,
            ...installers
        );
    }

    private static async getDependencyInstaller(buildChannel: BuildChannel): Promise<DependencyInstaller> {
        const viperToolsRawProviderUrl = Helper.getViperToolsProvider(buildChannel);
        // note that `viperToolsProvider` might be one of the "special" URLs as specified in the README (i.e. to a GitHub releases asset):
        const viperToolsProvider = this.parseGitHubAssetURL(viperToolsRawProviderUrl);

        const folderName = "ViperTools"; // folder name to which ZIP will be unzipped to
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
