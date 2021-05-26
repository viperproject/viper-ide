import * as path from 'path';

import { Location, ProgressListener } from '..';

/**
 * Manages the installation for a dependency, maintaining separate installations for each source (in a folder using their name).
 */
export class Dependency<SourceName extends string> {
	public sources: Map<SourceName, DependencyInstaller>;

	constructor(
		readonly basePath: string,
		...sources: [SourceName, DependencyInstaller][]
	) {
		this.sources = new Map(sources);
	}

	/**
	 * Ensures that the dependency from the given source is currently installed.
	 * If it's not yet installed, this method will install it, otherwise it won't do anything (except provide a way to access it).
	 */
	public ensureInstalled(sourceName: SourceName, progressListener?: ProgressListener): Promise<Location> {
		return this.install(sourceName, false, progressListener);
	}

	/**
	 * Forces an update from the given source, replacing the current installation in the process.
	 */
	public async update(sourceName: SourceName, progressListener?: ProgressListener): Promise<Location> {
		return this.install(sourceName, true, progressListener);
	}

	/**
	 * Ensures that the dependency from the given source is currently installed.
	 * This method is the combination of `ensureInstalled` and `update`, switching between the two based on `shouldUpdate`.
	 */
	public async install(sourceName: SourceName, shouldUpdate: boolean, progressListener?: ProgressListener): Promise<Location> {
		const source = this.sources.get(sourceName);
		if (source === undefined) {
			throw new Error(`Dependency ${this.basePath} has no source named ${sourceName}`);
		}
		const local = this.localDependency(sourceName);

		local.mkdir();

		return source.install(
			local, shouldUpdate,
			progressListener ?? ((_fraction, _step) => { /* do nothing */ })
		);
	}

	private localDependency(sourceName: SourceName): Location {
		return new Location(path.join(this.basePath, sourceName));
	}
}

export interface DependencyInstaller {
	/**
	 * Installs the dependency using the given location, returning a reference to the final location.
	 * 
	 * @param location a suggested place to install to.
	 * @param shouldUpdate whether or not to rerun the installation process even if it is already installed, effectively updating.
	 * @param progressListener a callback to report installation progress to, for e.g. a progress bar.
	 */
	install(location: Location, shouldUpdate: boolean, progressListener: ProgressListener): Promise<Location>;
}
