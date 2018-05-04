import { Z_UNKNOWN } from "zlib";


export enum ViperApiEvent {
    VerificationTerminated = 'VerificationTerminated',
    SomethingElse = 'SomethingElse'
}


export class ViperApi {
    private static knownEvents = ['VerificationTerminated'];
    private callbacks: Map<string, Array<any>> = new Map();

    public registerApiCallback(event: string, callback: any) {
        if (!ViperApi.knownEvents.some(e => e === event)) {
            let events = ViperApi.knownEvents.join(", ");
            throw new Error(`Unknown ViperApi event key '${event}'. Events are: ${events}`);
        }

        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, []);
        }

        this.callbacks.get(event).push(callback);
    }

    public notify(event: ViperApiEvent, value: any) {
        let callbacks = this.callbacks.get(event.toString());
        if (callbacks) {
            callbacks.forEach((callback, index, array) => callback(value));
        }
    }
}
