import * as os from 'os';

export enum Platform {
    Linux,
    Windows,
    Mac,
}

export const currentPlatform: Platform | null = (() => {
    const platform = os.platform();
    switch (platform) {
        case "linux":
            return Platform.Linux;
        case "win32":
            return Platform.Windows;
        case "darwin":
            return Platform.Mac;
        default:
            console.log(`Unsupported platform: ${platform}`);
            return null;
    }
})();
