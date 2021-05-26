import * as fs from 'fs-extra';
import { platform } from 'os';
import * as path from 'path';

/**
 * A simple representation of a folder in the file system, with some convenient methods for navigating through the hierarchy.
 * 
 * This class provides a way to access files for a dependency once it's been downloaded and installed.
 * Also useful for passing around file system locations between `DependencyInstaller`s.
 */
export class Location {
    constructor(
        readonly basePath: string
    ) {
        this.basePath = path.normalize(this.basePath);
    }

    /** Returns the parent location of this one. */
    public get enclosingFolder(): Location {
        return new Location(path.dirname(this.basePath));
    }

    /** Returns a path within this location with the given path components. */
    public path(...components: string[]): string {
        return path.join(this.basePath, ...components);
    }

    /** Returns the path to an executable with the given name, appending .exe on windows. */
    public executable(name: string): string {
        return this.path(platform() === "win32" ? `${name}.exe` : name);
    }

    /** Returns a child location within this one with the given path components. */
    public child(...components: string[]): Location {
        return new Location(this.path(...components));
    }

    /** Returns whether or not the folder this location represents currently exists on the file system. */
    public exists(): Promise<boolean> {
        return fs.pathExists(this.basePath);
    }

    /** Makes sure the folder this location represents exists, creating an empty one if it doesn't yet. */
    public mkdir(): Promise<void> {
        return fs.ensureDir(this.basePath);
    }

    /**
     * Remove a path, retrying a few times after a delay in case of error.
     * If the path does not exist, silently does nothing.
     */
    public async remove(maxRetries = 3, retryDelayMs = 1000): Promise<void> {
        let currRetryNumber = 0;
        while (true) {
            if (currRetryNumber >= maxRetries) {
                // Don't catch errors
                await fs.remove(this.basePath);
            } else {
                // Try again in a few seconds in case of errors
                try {
                    await fs.remove(this.basePath);
                } catch {
                    currRetryNumber += 1;
                    await new Promise(
                        (resolve) => setTimeout(resolve, retryDelayMs)
                    );
                    continue;
                }
            }
            // Jump out of the `while true`
            return;
        };
    }

    public toString(): string {
        return `Location(${this.basePath})`;
    }
}
