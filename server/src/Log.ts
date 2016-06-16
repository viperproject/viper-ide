'use strict';

import {IConnection} from 'vscode-languageserver';
import {Commands} from './ViperProtocol';

export class Log {
    static connection: IConnection;

    static log(message: string) {
        this.connection.console.log("S: " + message);
    }

    static error(message: string) {
        this.connection.console.error("S: " + message);
    }

    static logWithOrigin(origin: string, message: string) {
        this.connection.console.log(origin + ": " + message);
    }

    static hint(message: string) {
        this.connection.sendNotification(Commands.Hint, message);
    }
} 