'use strict';

import { Verifiable } from './model/Verifiable';
import { Record } from './model/Statement';
import { Logger } from './logger';
import * as vscode from 'vscode';


/** Events that can be listened on. */
export type SessionEvent = 'StateChange';


export type StateUpdate = {
    current: Record,
    hasNext: boolean,
    hasPrevious: boolean,
    hasParent: boolean,
    hasChild: boolean
};
// TODO: Make sure the API makes sense and the Debugger session has the right
//       capabilities / responsibilities
export class DebuggerSession {

    private observers: ((states: StateUpdate) => void)[];
    private currentStatement: Record;
    private currentVerifiable: Verifiable;

    constructor(readonly debuggedFile: vscode.Uri, readonly verifiables: Verifiable[]) {
        this.observers = [];
        // TODO: Put a check for not verifiables?
        this.currentVerifiable = this.verifiables[0];
        this.currentStatement = this.currentVerifiable.statements[0];
    }

    public onStateChange(callback: (states: StateUpdate) => void) {
        this.observers.push(callback);
    }

    public notifyStateChange() {
        if (this.currentStatement) {
            // TODO: Fix with proper logic for next and prev
            const states: StateUpdate = {
                current: this.currentStatement,
                hasNext: this.findNextState() !== undefined,
                hasPrevious: this.findPrevState() !== undefined,
                hasParent: this.currentStatement.parent !== undefined,
                hasChild: this.currentStatement.children.length > 0
            };
            this.observers.forEach((callback) => callback(states));
        }
    }

    public removeListeners() {
        this.observers = [];
    }

    public selectVerifiable(name: string) {
        const verifiable = this.verifiables.find(v => v.name === name);
        if (!verifiable) {
            Logger.error(`Could not find verifiable '${name}'`);
            return;
        } 

        this.currentVerifiable = verifiable;
        this.currentStatement = verifiable.statements[0];
        this.notifyStateChange();
    }

    public getCurrentState(): Record {
        return this.currentStatement;
    }

    public goToState(state: Record) {
        this.currentStatement = state;
        this.notifyStateChange();
    }

    public goToNextState() {
        let nextState = this.findNextState();
        if (nextState) {
            this.currentStatement = nextState;
            this.notifyStateChange();
        }
    }

    public goToPrevState() {
        let prevState = this.findPrevState();
        if (prevState) {
            this.currentStatement = prevState;
            this.notifyStateChange();
        }
    }

    public goToChildState() {
        if (this.currentStatement.children.length > 0) {
            this.currentStatement = this.currentStatement.children[0];
            this.notifyStateChange();
        }
    }

    public goToParentState() {
        if (this.currentStatement.parent) {
            this.currentStatement = this.currentStatement.parent;
            this.notifyStateChange();
        }
    }

    // TODO: Implement this? Is it needed?
    public nextErrorState() {
        this.notifyStateChange();
    }

    public topLevelStates(): Record[] {
        return this.currentVerifiable.statements;
    }

    private findNextState(): Record | undefined {
        if (this.currentStatement.next) {
            return this.currentStatement.next;            
        } 

        let parent = this.currentStatement.parent;
        while (parent) {
            if (parent.next) {
                return parent.next;
            }
            parent = parent.parent;
        }

        return undefined;
    }

    private findPrevState(): Record | undefined {
        if (this.currentStatement.previous) {
            return this.currentStatement.previous;
        } 
        
        let parent = this.currentStatement.parent;
        while (parent) {
            if (parent.previous) {
                return parent.previous;
            }
            parent = parent.parent;
        }
    }
}