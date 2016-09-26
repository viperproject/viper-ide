'use strict';

//import {Position} from 'vscode';
import {Log} from './Log';
import {Model} from './Model';
import {SymbExLogEntry, StatementType, Position, LogLevel} from './ViperProtocol';
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

    constructor(index: number, data: SymbExLogEntry, task: VerificationTask) {
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
}

export enum VerifiableType { Method, Predicate, Function, UNKNOWN };