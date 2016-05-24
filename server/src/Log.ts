'use strict';

import {IConnection} from 'vscode-languageserver';

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
} 