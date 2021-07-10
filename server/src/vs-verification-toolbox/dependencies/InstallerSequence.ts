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

	public async install(location: Location, shouldUpdate: boolean, progressListener: ProgressListener, confirm:() => Promise<void>): Promise<Location> {
		let index = 0;
		let askedForConfirmation = false;
		const total = this.installers.length;
		for (const installer of this.installers) {
			function intermediateListener(fraction: number, message: string) {
				progressListener(
					(index + fraction) / total,
					`${message} (step ${index + 1} of ${total})`
				);
			}
			function intermediateConfirm(): Promise<void> {
				// only ask once
				if (askedForConfirmation) {
					return Promise.resolve();
				} else {
					askedForConfirmation = true;
					return confirm();
				}
			}

			location = await installer.install(location, shouldUpdate, intermediateListener, intermediateConfirm);
			index++;
		}
		return location;
	}
}
