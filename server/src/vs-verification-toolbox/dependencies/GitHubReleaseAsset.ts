import { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

/**
 * Class containing helper functions to facilitate retrieving assets from GitHub releases
 */
export class GitHubReleaseAsset {

    /**
     * Retrieves the URL to a particular asset in the latest release.
     * Note that the accept header has to be set to "application/octet-stream" to download the asset.
     * If you want to use the token for the download as well, you have to add the following header: "Authorization: token <token>".
     * @param owner The GitHub repo owner, e.g. "viperproject"
     * @param repo The GitHub repo, e.g. "vs-verification-toolbox"
     * @param assetName The name of the asset (as shown in the GitHub UI for the release)
     * @param includePrereleases Flag to indicate whether prereleases should be considered as well (by default only non-prereleases will be considered)
     * @param token optional GitHub token to authenticate the request and therefore increase the rate limit from 60 request per hour and IP address
     */
    public static async getLatestAssetUrl(
        owner: string,
        repo: string,
        assetName: string,
        includePrereleases: boolean = false,
        token?: string
    ): Promise<string> {
        const octokit = this.buildOctokit(token);
        let latestRelease: Release;
        if (includePrereleases) {
            // get the first release which corresponds to the latest pre- or non-pre-release.
            // note that draft releases do not show up for unauthenticated users
            // see https://octokit.github.io/rest.js/v18#repos-list-releases
            let listReleasesParams: RestEndpointMethodTypes["repos"]["listReleases"]["parameters"] = {
                owner: owner,
                repo: repo,
            }
            if (token == null) {
                listReleasesParams.per_page = 1;
                listReleasesParams.page = 1;
            }
            const { data: releases } = await octokit.repos.listReleases(listReleasesParams);
            const nonDraftReleases = releases
                .filter(release => !release.draft);
            if (nonDraftReleases.length >= 1) {
                latestRelease = nonDraftReleases[0];
            } else {
                return Promise.reject("list releases did not return any release");
            }
        } else {
            // see https://octokit.github.io/rest.js/v18#repos-get-latest-release
            const releaseResponse = await octokit.repos.getLatestRelease({
                owner,
                repo,
            });
            latestRelease = releaseResponse.data;
        }
        return this.getAssetUrlFromRelease(latestRelease, assetName);
    }

    /**
     * Retrieves the URL to a particular asset in a release specified by its tag.
     * Note that the accept header has to be set to "application/octet-stream" to download the asset.
     * If you want to use the token for the download as well, you have to add the following header: "Authorization: token <token>".
     * @param owner The GitHub repo owner, e.g. "viperproject"
     * @param repo The GitHub repo, e.g. "vs-verification-toolbox"
     * @param assetName The name of the asset (as shown in the GitHub UI for the release)
     * @param tag Name of the git tag
     * @param token optional GitHub token to authenticate the request and therefore increase the rate limit from 60 request per hour and IP address
     */
    public static async getTaggedAssetUrl(
        owner: string,
        repo: string,
        assetName: string,
        tag: string,
        token?: string
    ): Promise<string> {
        const octokit = this.buildOctokit(token);
        // see https://octokit.github.io/rest.js/v18#repos-get-release-by-tag
        const releaseResponse = await octokit.repos.getReleaseByTag({
            owner,
            repo,
            tag
        });
        const taggedRelease = releaseResponse.data;
        return this.getAssetUrlFromRelease(taggedRelease, assetName);
    }

    /**
     * Returns an octokit instance that optionally uses the token for authentiction
     * @param token personal access token, OAuth token, installation access token, or JSON Web Token for GitHub App authentication
     */
    private static buildOctokit(token?: string): Octokit {
        if (token) {
            return new Octokit({
                auth: token,
            });
        } else {
            return new Octokit();
        }
    }

    private static getAssetUrlFromRelease(release: Release, assetName: string): Promise<string> {
        const asset = release.assets.find(asset => asset.name === assetName);
        if (asset) {
            return Promise.resolve(asset.url);
        }
        return Promise.reject(`Asset named '${assetName}' not found`);
    }
}

interface Release {
    draft: boolean;
    assets: Asset[];
}

interface Asset {
    name: string;
    url: string;
}
