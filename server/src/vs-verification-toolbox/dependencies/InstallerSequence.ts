import { DependencyInstaller, Location, ProgressListener } from '..';

export class InstallerSequence {
	constructor(readonly installers: DependencyInstaller[]) {
		// flatten nested sequences
		this.installers = installers.reduce((list: DependencyInstaller[], installer) => {
			if (installer instanceof InstallerSequence) {
				list.push(...installer.installers);
			} else {
				list.push(installer);
			}
			return list;
		}, []);
	}

	public async install(location: Location, shouldUpdate: boolean, progressListener: ProgressListener): Promise<Location> {
		let index = 0;
		const total = this.installers.length;
		for (const installer of this.installers) {
			location = await installer.install(location, shouldUpdate, (fraction, message) => {
				progressListener(
					(index + fraction) / total,
					`${message} (step ${index + 1} of ${total})`
				);
			});
			index++;
		}
		return location;
	}
}
