import * as path from 'path';

import { DependencyInstaller, Location, ProgressListener, InstallerSequence, FileDownloader, ZipExtractor } from '..';

export class RemoteZipExtractor implements DependencyInstaller {
    private readonly sequence: InstallerSequence;

    constructor(
        readonly remoteUrl: string,
        readonly folderName: string = path.basename(remoteUrl, path.extname(remoteUrl))
    ) {
        this.sequence = new InstallerSequence([
            new FileDownloader(this.remoteUrl),
            new ZipExtractor(this.folderName, true),
        ]);
    }

    public async install(location: Location, shouldUpdate: boolean, progressListener: ProgressListener): Promise<Location> {
        const target = location.child(this.folderName);

        if (!shouldUpdate && await target.exists()) { return target; }

        return this.sequence.install(location, shouldUpdate, progressListener);
    }
}
