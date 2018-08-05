import { Verifiable } from './model/Verifiable';
import { Record } from './model/Record';
import { Logger } from './logger';
import * as vscode from 'vscode';
import { Program } from './model/Program';


/** Events that can be listened on. */
export type SessionEvent = 'StateChange';


export type StateUpdate = {
    verifiable: Verifiable,
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
    private currentRecord: Record;
    private currentVerifiable: Verifiable;

    constructor(readonly debuggedFile: vscode.Uri, readonly program: Program) {
        this.observers = [];
        // TODO: Put a check for not verifiables?
        this.currentVerifiable = this.program.verifiables[0];
        this.currentRecord = this.currentVerifiable.records[0];
    }

    public onStateChange(callback: (states: StateUpdate) => void) {
        this.observers.push(callback);
    }

    public notifyStateChange() {
        if (this.currentRecord) {
            // TODO: Fix with proper logic for next and prev
            const states: StateUpdate = {
                verifiable: this.currentVerifiable,
                current: this.currentRecord,
                hasNext: this.findNextState() !== undefined,
                hasPrevious: this.findPrevState() !== undefined,
                hasParent: this.currentRecord.parent !== undefined,
                hasChild: this.currentRecord.children.length > 0
            };
            this.observers.forEach((callback) => callback(states));
        }
    }

    public removeListeners() {
        this.observers = [];
    }

    public selectVerifiable(name: string) {
        const verifiable = this.program.verifiables.find(v => v.name === name);
        if (!verifiable) {
            Logger.error(`Could not find verifiable '${name}'`);
            return;
        } 

        this.currentVerifiable = verifiable;
        this.currentRecord = verifiable.records[0];
        this.notifyStateChange();
    }

    public getCurrentState(): Record {
        return this.currentRecord;
    }

    public goToState(state: Record) {
        this.currentRecord = state;
        this.notifyStateChange();
    }

    public goToNextState() {
        let nextState = this.findNextState();
        if (nextState) {
            this.currentRecord = nextState;
            this.notifyStateChange();
        }
    }

    public goToPrevState() {
        let prevState = this.findPrevState();
        if (prevState) {
            this.currentRecord = prevState;
            this.notifyStateChange();
        }
    }

    public goToChildState() {
        if (this.currentRecord.children.length > 0) {
            this.currentRecord = this.currentRecord.children[0];
            this.notifyStateChange();
        }
    }

    public goToParentState() {
        if (this.currentRecord.parent) {
            this.currentRecord = this.currentRecord.parent;
            this.notifyStateChange();
        }
    }

    // TODO: Implement this? Is it needed?
    public nextErrorState() {
        this.notifyStateChange();
    }

    public topLevelStates(): Record[] {
        return this.currentVerifiable.records;
    }

    private findNextState(): Record | undefined {
        if (this.currentRecord.next) {
            return this.currentRecord.next;            
        } 

        let parent = this.currentRecord.parent;
        while (parent) {
            if (parent.next) {
                return parent.next;
            }
            parent = parent.parent;
        }

        return undefined;
    }

    private findPrevState(): Record | undefined {
        if (this.currentRecord.previous) {
            return this.currentRecord.previous;
        } 
        
        let parent = this.currentRecord.parent;
        while (parent) {
            if (parent.previous) {
                return parent.previous;
            }
            parent = parent.parent;
        }
        return undefined;
    }
}