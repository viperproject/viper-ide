import * as fs from 'fs-extra';
import * as path from 'path';
import got, { Headers, Options, Progress } from 'got';
import * as stream from 'stream';
import { promisify } from 'util';

import { DependencyInstaller, Location, ProgressListener } from '..';


const pipeline = promisify(stream.pipeline);

export class FileDownloader implements DependencyInstaller {
	/**
	 * 
	 * @param remoteUrl URL from which the file should be downloaded
	 * @param headers header fields that should be used for the request. This can be used to for example set the Accept header: `{ "Accept": "application/octet-stream" }`
	 * @param filename optional filename to store the downloaded file (default: `path.basename(remoteUrl)`, i.e. the last component of the URL)
	 */
	constructor(
		readonly remoteUrl: string,
		readonly headers: Headers = {},
		readonly filename: string = path.basename(remoteUrl)
	) { }

	public async install(location: Location, shouldUpdate: boolean, progressListener: ProgressListener): Promise<Location> {
		const target = location.child(this.filename);

		if (!shouldUpdate && await target.exists()) { return target; }

		await location.mkdir();
		const temp = location.child(`.${this.filename}.download`);
		await temp.remove();
		const tempFile = fs.createWriteStream(temp.basePath);

		try {
			const options = {
				headers: this.headers
			};
			progressListener(0, "Downloading…");
			// if a redirect occurs, downloadProgress will immediately jump to 1 as the progress is reported per request.
			// progressListener ignores lower progress than previously reported.
			// as a work around, simply ignore the next progress report after a redirect has occurred. This works fairly
			// well in practice as a redirect response is small and progress jumps from 0 to 1 (without intermediate progress).
			let skipNextProgress: boolean = false;
			await pipeline(
				got
					.stream(this.remoteUrl, options)
					.on('redirect', () => skipNextProgress = true)
					.on('downloadProgress', (prog: Progress) => { 
						if (skipNextProgress) { 
							skipNextProgress = false; 
						} else { 
							progressListener(prog.percent, "Downloading…"); 
						}
					}),
				tempFile
			);
	
			await target.remove();
			await fs.move(temp.basePath, target.basePath);

			return target;
		} catch (e) {
			await temp.remove();
			throw e;
		}
	}
}
