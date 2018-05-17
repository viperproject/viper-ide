'use strict';

import * as d from './Debugger';
import { Verifiable } from './states/Verifiable';
import { Statement, StatementView } from './states/Statement';
import { Logger } from './logger';


/** Events that can be listened on. */
export type SessionEvent = 'StateChange';


export type StateUpdate = { current: StatementView };
// TODO: Make sure the API makes sense and the Debugger session has the right
//       capabilities / responsibilities
export class DebuggerSession {

    private observers: ((states: StateUpdate) => void)[];
    private currentStatement: Statement;

    constructor(readonly verifiables: Verifiable[]) {
        this.observers = [];
        // TODO: Put a check for not verifiables?
        this.currentStatement = this.verifiables[0].statements[0];
    }

    public onStateChange(callback: (states: StateUpdate) => void) {
        this.observers.push(callback);
    }

    public notifyStateChange() {
        if (this.currentStatement) {
            const states: StateUpdate = {
                current: StatementView.from(this.currentStatement)
            };
            this.observers.forEach((callback) => callback(states));
        }
    }

    public selectVerifiable(name: string) {
        const verifiable = this.verifiables.find(v => v.name === name);
        if (!verifiable) {
            Logger.error(`Could not find verifiable '${name}'`);
            return;
        } 

        this.currentStatement = verifiable.statements[0];
        this.notifyStateChange();
    }

    public nextState() {
        if (this.currentStatement.next) {
            this.currentStatement = this.currentStatement.next;
            this.notifyStateChange();
            return;
        } 

        let parent = this.currentStatement.parent;
        while (parent) {
            if (parent.next) {
                this.currentStatement = parent.next;
                this.notifyStateChange();
                return;
            }
            parent = parent.parent;
        }
    }

    public prevState() {
        if (this.currentStatement.previous) {
            this.currentStatement = this.currentStatement.previous;
            this.notifyStateChange();
            return;
        } 
        
        let parent = this.currentStatement.parent;
        while (parent) {
            if (parent.previous) {
                this.currentStatement = parent.previous;
                this.notifyStateChange();
                return;
            }
            parent = parent.parent;
        }
    }

    public childState() {
        if (this.currentStatement.children.length > 0) {
            this.currentStatement = this.currentStatement.children[0];
            this.notifyStateChange();
        }
    }

    public parentState() {
        if (this.currentStatement.parent) {
            this.currentStatement = this.currentStatement.parent;
            this.notifyStateChange();
        }
    }

    public nextErrorState() {
        this.notifyStateChange();
    }
}