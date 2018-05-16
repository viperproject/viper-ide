'use strict';

import * as d from './Debugger';
import { Verifiable } from './states/Verifiable';
import { Statement, StatementView } from './states/Statement';


/** Events that can be listened on. */
export type SessionEvent = 'StateChange';


export type StateUpdate = { current: StatementView, previous: StatementView | undefined };
// TODO: Make sure the API makes sense and the Debugger session has the right
//       capabilities / responsibilities
export class DebuggerSession {

    private observers: ((states: StateUpdate) => void)[];
    private currentStatement: Statement;
    private previousStatement: Statement | undefined;

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
                current: StatementView.from(this.currentStatement),
                previous: this.previousStatement ? StatementView.from(this.previousStatement) : undefined
            };
            this.observers.forEach((callback) => callback(states));
        }
    }

    public nextState() {
        if (this.currentStatement.next) {
            this.previousStatement = this.currentStatement;
            this.currentStatement = this.currentStatement.next;
            this.notifyStateChange();
        }
    }

    public prevState() {
        if (this.currentStatement.previous) {
            const previous = this.currentStatement.previous;
            this.previousStatement = this.currentStatement;
            if (previous.children.length > 0) {
                this.currentStatement = previous.children[previous.children.length - 1];
            } else {
                this.currentStatement = previous;
            }
            this.notifyStateChange();
        }
    }

    public childState() {
        if (this.currentStatement.children.length > 0) {
            this.previousStatement = this.currentStatement;
            this.currentStatement = this.currentStatement.children[0];
            this.notifyStateChange();
        }
    }

    public parentState() {
        if (this.currentStatement.parent) {
            this.previousStatement = this.currentStatement;
            this.currentStatement = this.currentStatement.parent;
            this.notifyStateChange();
        }
    }

    public nextErrorState() {
        this.notifyStateChange();
    }
}