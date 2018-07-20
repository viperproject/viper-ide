import { DebuggerError } from "../Errors";
import { Term } from "./Term";


export interface HeapChunk {}

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

            return new PredicateChunk(obj.predicate, obj.args.map(Term.from), Term.from(obj.snap), Term.from(obj.perm));
        }

        if (obj.type === 'basic_field_chunk') {
            mustHave(obj, ['field', 'receiver', 'snap', 'perm']);

            return new FieldChunk(obj.field, Term.from(obj.receiver), Term.from(obj.snap), Term.from(obj.perm));
        }

        if (obj.type === 'basic_magic_wand_chunk') {
            mustHave(obj, ['args', 'snap', 'perm']);

            return new MagicWandChunk(obj.args.map(Term.from), Term.from(obj.snap), Term.from(obj.perm));
        }

        if (obj.type === 'quantified_field_chunk') {
            mustHave(obj, ['field', 'field_value_function', 'perm', 'invs', 'cond', 'receiver', 'hints']);

            return new QuantifiedFieldChunk(
                obj.field,
                Term.from(obj.field_value_function),
                Term.from(obj.perm),
                obj.invs !== null ? obj.invs : undefined,
                obj.cond !== null ? Term.from(obj.cond) : undefined,
                obj.receiver !== null ? Term.from(obj.receiver) : undefined,
                obj.hints !== null ? obj.hints.map(Term.from) : []
            );
        }

        if (obj.type === 'quantified_predicate_chunk') {
            mustHave(obj, ['predicate', 'vars', 'predicate_snap_function', 'perm', 'invs', 'cond', 'singleton_args', 'hints']);

            return new QuantifiedPredicateChunk(
                obj.predicate,
                obj.vars.map(Term.from),
                Term.from(obj.predicate_snap_function),
                Term.from(obj.perm),
                obj.invs !== null ? obj.invs : undefined,
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
                obj.invs !== null ? obj.invs : undefined,
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
        readonly receiver: Term,
        readonly snap: Term,
        readonly perm: Term
    ) {}
}

export class PredicateChunk implements HeapChunk {
    constructor(
        readonly receiver: string,
        readonly args: Term[],
        readonly snap: Term,
        readonly perm: Term
    ) {}
}

export class MagicWandChunk implements HeapChunk {
    constructor(
        readonly args: Term[],
        readonly snap: Term,
        readonly perm: Term
    ) {}
}

export class QuantifiedFieldChunk implements HeapChunk {
    constructor(
        readonly field: string,
        readonly fieldValueFunction: Term,
        readonly perm: Term,
        readonly invertibles: string | undefined,
        readonly cond: Term | undefined,
        readonly receiver: Term | undefined,
        readonly hints: Term[]
    ) {}
}

export class QuantifiedPredicateChunk implements HeapChunk {
    constructor(
        readonly predicate: string,
        readonly vars: Term[],
        readonly predicateSnapFunction: Term,
        readonly perm: Term,
        readonly invertibles: string[],
        readonly cond: Term | undefined,
        readonly singletonArgs: Term[],
        readonly hints: Term[]
    ) {}
}

export class QuantifiedMagicWandChunk implements HeapChunk {
    constructor(
        readonly predicate: string,
        readonly vars: Term[],
        readonly wandSnapFunction: Term,
        readonly perm: Term,
        readonly invertibles: string[],
        readonly cond: Term | undefined,
        readonly singletonArgs: Term[],
        readonly hints: Term[]
    ) {}
}
