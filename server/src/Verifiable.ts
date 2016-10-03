'use strict';

import {Log} from './Log';
import {SymbExLogEntry, LogLevel} from './ViperProtocol';
import {Statement} from './Statement';
import {VerificationTask} from './VerificationTask';

export class Verifiable {
    name: string;
    type: VerifiableType;
    //The statements are stored in a tree fashion, but can also be accessed in an array fashion
    startIndex: number;
    endIndex: number;
    root: Statement;
    index: number;
    allSteps: Statement[];

    constructor(steps: Statement[], index: number, data: SymbExLogEntry, task: VerificationTask) {
        this.allSteps = steps;
        this.index = index;
        this.type = this.parseVerifiableType(data.kind);
        this.name = data.value;
        this.startIndex = task.steps.length;
        this.root = Statement.CreateFromSymbExLog(0, null, data, this, task, false);
        this.endIndex = task.steps.length - 1;
    }

    private parseVerifiableType(type: string): VerifiableType {
        if (!type) return VerifiableType.UNKNOWN;
        type = type.toLowerCase().trim();
        if (type === "method") return VerifiableType.Method;
        if (type === "predicate") return VerifiableType.Predicate;
        if (type === "function") return VerifiableType.Function;
    }

    typeString(): string {
        return VerifiableType[this.type];
    }

    forAllExpansionStatesWithDecoration(state: Statement, task: (state: Statement) => void) {
        state.children.forEach(element => {
            if (element.canBeShownAsDecoration) {
                task(element);
            } else {
                this.forAllExpansionStatesWithDecoration(element, task);
            }
        });
    }

    getTopLevelStatesWithDecoration(): Statement[] {
        let result: Statement[] = [];
        for (let i = this.startIndex; i <= this.endIndex; i++) {
            let state = this.allSteps[i];
            if (state.depthLevel() == 0 && state.canBeShownAsDecoration) {
                result.push(state);
            }
        }
        return result;
    }
}

export enum VerifiableType { Method, Predicate, Function, UNKNOWN };