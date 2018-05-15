'use strict';

import * as d from './debugger';
import { Verifiable } from './states/Verifiable';


/** State change events that can be listened on.
 * 
 *  When the active state is changed (e.g. via a keyboard event or via the gui),
 *  the session is updated and every object that is listening on a relevant
 *  event is notified.
 */
export type StateChangeEvent = 'Next' | 'Prev' | 'Child' | 'Parent' | 'Error';


// TODO: Make sure the API makes sense and the Debugger session has the right
//       capabilities / responsibilities
export class DebuggerSession {

    private observers: ((event: StateChangeEvent) => void)[];

    constructor(readonly verifiables: Verifiable[]) {
        this.observers = [];
    }

    public onStateChange(callback: (event: StateChangeEvent) => void) {
        this.observers.push(callback);
    }

    private notify(event: StateChangeEvent) {
        this.observers.forEach((callback) => callback(event));
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