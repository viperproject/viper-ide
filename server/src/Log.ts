'use strict';

import {IConnection} from 'vscode-languageserver';

export class Log {
    static connection: IConnection;
    static verificationStart = { method: "VerificationStart" }
    static verificationEnd = { method: "VerificationEnd" }
    static verificationProgress = { method: "VerificationProgress" }

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
        this.connection.sendNotification({ method: "Hint" }, message);
    }

    static sendNotification(method: string) {
        this.connection.sendNotification({ method: method });
    }


} 