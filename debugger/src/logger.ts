

// TODO: Implement proper logging
export class Logger {

    public static info(message: string): void {
        console.log(message);
    }

    public static debug(message: string): void {
        console.log(message);
    }

    public static error(message: string): void {
        console.error(message);
    }

    public static warn(message: string): void {
        console.log('WARN! ' + message);
    }
}