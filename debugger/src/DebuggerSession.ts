'use strict';

import * as d from './debugger';
import { Verifiable } from './states/Verifiable';


export type StateChangeEvent = 'Next' | 'Prev' | 'Child' | 'Parent' | 'Error';


// TODO: Make sure the API makes sense and the Debugger session has the right
//       capabilities / responsibilities
export class DebuggerSession {

    private observers: Map<StateChangeEvent, (() => void)[]>;

    constructor(readonly verifiables: Verifiable[]) {
        this.observers = new Map();
    }

    public onStateChange(event: StateChangeEvent, callback: () => void) {
        if (!this.observers.get(event)) {
            this.observers.set(event, []);
        }

        this.observers.get(event)!.push(callback);
    }

    private notify(event: StateChangeEvent) {
        const callbacks = this.observers.get(event);

        if (callbacks) {
            callbacks.forEach(cb => cb());
        }
    }

    public nextState() {
        this.notify('Next');
    }

    public prevState() {
        this.notify('Prev');
    }

    public childState() {
        this.notify('Child');
    }

    public parentState() {
        this.notify('Parent');
    }

    public nextErrorState() {
        this.notify('Error');
    }
}