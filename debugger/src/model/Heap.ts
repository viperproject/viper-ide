import { DebuggerError } from "../Errors";
import { Term, Application, VariableTerm, SortWrapper } from "./Term";
import { getSort, Sort } from './Sort';


export interface HeapChunk {
    toString(): string;
}


export namespace HeapChunk {

    /** Helper function to check that an object has all the needed keys. */
    function mustHave(obj: any, entries: string[]) {
        entries.forEach(key => {
            if (!obj.hasOwnProperty(key)) {
                throw new DebuggerError(`A '${obj.type}' chunk must have a '${key}' entry: '${obj}'`);
            }
        });
    }

    export function from(obj: any) {
        if (obj.type === undefined || typeof obj.type !== 'string') {
            throw new DebuggerError(`Heap chunks must have a 'type' entry of type 'string': '${obj}'`);
        }

        if (obj.type === 'basic_predicate_chunk') {
            mustHave(obj, ['predicate', 'args', 'snap', 'perm']);

            const snap = Term.from(obj.snap);
            return new PredicateChunk(obj.predicate, obj.args.map(Term.from), snap, Term.from(obj.perm));
        }

        if (obj.type === 'basic_field_chunk') {
            mustHave(obj, ['field', 'receiver', 'snap', 'perm']);

            const snap = Term.from(obj.snap);
            const sort = getSort(snap);
            return new FieldChunk(obj.field, sort, Term.from(obj.receiver), snap, Term.from(obj.perm));
        }

        if (obj.type === 'basic_magic_wand_chunk') {
            mustHave(obj, ['args', 'snap', 'perm']);

            return new MagicWandChunk(obj.args.map(Term.from), Term.from(obj.snap), Term.from(obj.perm));
        }

        if (obj.type === 'quantified_field_chunk') {
            mustHave(obj, ['field', 'field_value_function', 'perm', 'invs', 'cond', 'receiver', 'hints']);

            const fvf = Term.from(obj.field_value_function);
            if (!(fvf instanceof Application || fvf instanceof VariableTerm)) {
                throw new DebuggerError(`Expected field value function to have a sort, but it was '${fvf}'`);
            }
            
            if (fvf.sort.id !== 'FVF') {
                throw new DebuggerError(`Expected sort to be of the form 'FVF[...]', but it was '${fvf.sort}'`);
            }

            return new QuantifiedFieldChunk(
                obj.field,
                fvf.sort,
                fvf,
                Term.from(obj.perm),
                obj.invs !== null ? obj.invs.map(Term.from) : [],
                obj.cond !== null ? Term.from(obj.cond) : undefined,
                obj.receiver !== null ? Term.from(obj.receiver) : undefined,
                obj.hints !== null ? obj.hints.map(Term.from) : []
            );
        }

        if (obj.type === 'quantified_predicate_chunk') {
            mustHave(obj, ['predicate', 'vars', 'predicate_snap_function', 'perm', 'invs', 'cond', 'singleton_args', 'hints']);

            const psf = Term.from(obj.predicate_snap_function);
            if (!(psf instanceof Application || psf instanceof VariableTerm || psf instanceof SortWrapper)) {
                throw new DebuggerError(`Expected predicate snap function to have a sort, but it was '${psf}'`);
            }
            
            if (psf.sort.id !== 'PSF') {
                throw new DebuggerError(`Expected sort to be of the form 'PSF[...]', but it was '${psf.sort}'`);
            }

            return new QuantifiedPredicateChunk(
                obj.predicate,
                obj.vars.map(Term.from),
                psf.sort,
                psf,
                Term.from(obj.perm),
                obj.invs !== null ? obj.invs.map(Term.from) : [],
                obj.cond !== null ? Term.from(obj.cond) : undefined,
                obj.singleton_args !== null ? obj.singleton_args.map(Term.from) : [],
                obj.hints !== null ? obj.hints.map(Term.from) : []
            );
        }

        if (obj.type === 'quantified_magic_wand_chunk') {
            mustHave(obj, ['vars', 'predicate', 'wand_snap_function', 'perm', 'invs', 'cond', 'singleton_args', 'hints']);

            return new QuantifiedMagicWandChunk(
                obj.predicate,
                obj.vars.map(Term.from),
                Term.from(obj.wand_snap_function),
                Term.from(obj.perm),
                obj.invs !== null ? obj.invs.map(Term.from) : [],
                obj.cond !== null ? Term.from(obj.cond) : undefined,
                obj.singleton_args !== null ? obj.singleton_args.map(Term.from) : [],
                obj.hints !== null ? obj.hints.map(Term.from) : []
            );
        }

        throw new DebuggerError(`Unexpected heap chunk: ${JSON.stringify(obj)}`);
    }
}

export class FieldChunk implements HeapChunk {
    constructor(
        readonly field: string,
        readonly sort: Sort,
        readonly receiver: Term,
        readonly snap: Term,
        readonly perm: Term
    ) {}

    toString() {
        return `${this.receiver}.${this.field}: ${this.sort} -> ${this.snap} # ${this.perm}`;
    }
}

export class PredicateChunk implements HeapChunk {
    constructor(
        readonly id: string,
        readonly args: Term[],
        readonly snap: Term,
        readonly perm: Term
    ) {}

    toString() {
        return `${this.id}(${this.snap}; ${this.args.join(", ")}) # ${this.perm}`;
    }
}

export class MagicWandChunk implements HeapChunk {
    constructor(
        readonly args: Term[],
        readonly snap: Term,
        readonly perm: Term
    ) {}

    toString() {
        return `wand[${this.snap}; ${this.args.join(", ")}]`;
    }
}

export class QuantifiedFieldChunk implements HeapChunk {
    constructor(
        readonly field: string,
        readonly sort: Sort,
        readonly fieldValueFunction: Term,
        readonly perm: Term,
        readonly invAxioms: Term[],
        readonly cond: Term | undefined,
        readonly receiver: Term | undefined,
        readonly hints: Term[]
    ) {}

    toString() {
        return `QA r :: r.${this.field}: ${this.sort} -> ${this.fieldValueFunction} # ${this.perm}`;
    }
}

export class QuantifiedPredicateChunk implements HeapChunk {
    constructor(
        readonly predicate: string,
        readonly vars: Term[],
        readonly sort: Sort,
        readonly predicateSnapFunction: Term,
        readonly perm: Term,
        readonly invAxioms: Term[],
        readonly cond: Term | undefined,
        readonly singletonArgs: Term[],
        readonly hints: Term[]
    ) {}

    toString() {
        const vs = this.vars.join(', ');
        return `QA ${vs} :: ${this.predicate}(${vs}): ${this.sort} -> ${this.predicateSnapFunction} # ${this.perm}`;
    }
}

export class QuantifiedMagicWandChunk implements HeapChunk {
    constructor(
        readonly predicate: string,
        readonly vars: Term[],
        readonly wandSnapFunction: Term,
        readonly perm: Term,
        readonly invAxioms: Term[],
        readonly cond: Term | undefined,
        readonly singletonArgs: Term[],
        readonly hints: Term[]
    ) {}

    toString() {
        const vs = this.vars.join(', ');
        return `QA ${vs} :: ${this.predicate}(${vs}) -> ${this.wandSnapFunction} # ${this.perm}`;
    }
}
