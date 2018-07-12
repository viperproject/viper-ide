import { DebuggerError } from "../Errors";

export interface Term {}

export class Binary implements Term {
    constructor(readonly op: string, readonly lhs: Term, readonly rhs: Term) {}
}

export class Unary implements Term {
    constructor(readonly op: string, readonly p: Term) {}
}

export class VariableTerm implements Term {
    constructor(readonly id: string, readonly sort: string) {}
}

export class Quantification implements Term {
    constructor(readonly quantifier: string,
                readonly vars: Term[],
                readonly body: Term,
                readonly name: string | null) {}
}

export class Application implements Term {
    constructor(readonly applicable: string, args: Term[]) {}
}

export class Lookup implements Term {
    constructor(readonly field: string, readonly fieldValueFunction: Term, readonly receiver: Term) {}
}

export class PredicateLookup implements Term {
    constructor(readonly predicate: string, readonly predicateSnapFunction: Term, readonly args: Term[]) {}
}

export class And implements Term {
    constructor(readonly terms: Term[]) {}
}

export class Or implements Term {
    constructor(readonly terms: Term[]) {}
}

export class Distinct implements Term {
    constructor(readonly terms: Term[]) {}
}

export class Ite implements Term {
    constructor(readonly condition: Term, readonly thenBranch: Term, readonly elseBranch: Term) {}
}

export class Let implements Term {
    constructor(readonly bindings: Term[], readonly body: Term) {}
}

export class Literal implements Term {
    constructor(readonly sort: string, readonly value: string) {}
}

export class SeqRanged implements Term {
    constructor(readonly lhs: Term, readonly rhs: Term) {}
}

export class SeqSingleton implements Term {
    constructor(readonly value: Term) {}
}

export class SeqUpdate implements Term {
    constructor(readonly seq: Term, readonly index: Term, readonly value: Term) {}
}

export class SetSingleton implements Term {
    constructor(readonly value: Term) {}
}

export class MultisetSingleton implements Term {
    constructor(readonly value: Term) {}
}

export namespace Term {

    function mustHave(obj: any, entries: string[]) {
        entries.forEach(key => {
            if (!obj.hasOwnProperty(key)) {
                throw new DebuggerError(`A '${obj.type}' term must have a '${key}' entry: '${obj}'`);
            }
        });
    }

    export function from(obj: any): Term {
        if (obj.type === undefined || typeof obj.type !== 'string') {
            throw new DebuggerError(`Path condition terms must have a 'type' entry of type 'string': '${obj}'`);
        }

        if (obj.type === 'binary') {
            mustHave(obj, ['op', 'lhs', 'rhs']);

            return new Binary(obj.op as string, Term.from(obj.lhs), Term.from(obj.rhs));
        }
        
        if (obj.type === 'unary') {
            mustHave(obj, ['op', 'p']);

            return new Unary(obj.op, Term.from(obj.p));
        }

        if (obj.type === 'variable') {
            mustHave(obj, ['id', 'sort']);

            return new VariableTerm(obj.id, obj.sort);
        }

        if (obj.type === 'quantification') {
            mustHave(obj, ['quantifier', 'vars', 'body', 'name']);

            return new Quantification(
                obj.quantifier,
                obj.vars.map(Term.from),
                Term.from(obj.body),
                obj.name
            );
        }

        if (obj.type === 'application') {
            mustHave(obj, ['applicable', 'args']);
            
            return new Application(obj.applicable as string, obj.args.map(Term.from));
        }

        if (obj.type === 'lookup') {
            mustHave(obj, ['field', 'fieldValueFunction', 'receiver']);

            return new Lookup(obj.field as string, Term.from(obj.fieldValueFunction), Term.from(obj.receiver));
        }

        if (obj.type === 'predicateLookup') {
            mustHave(obj, ['predicate', 'predicateSnapFunction', 'args']);

            return new PredicateLookup(
                obj.predicate as string,
                Term.from(obj.predicateSnapFunction),
                obj.args.map(Term.from)
            );
        }

        if (obj.type === 'and') {
            mustHave(obj, ['terms']);

            return new And(obj.terms.map(Term.from));
        }

        if (obj.type === 'or') {
            mustHave(obj, ['terms']);

            return new Or(obj.terms.map(Term.from));
        }

        if (obj.type === 'distinct') {
            mustHave(obj, ['terms']);

            return new Distinct(obj.term.map(Term.from));
        }

        if (obj.type === 'ite') {
            mustHave(obj, ['cond', 'thenBranch', 'elseBranch']);

            return new Ite(Term.from(obj.cond), Term.from(obj.thenBranch), Term.from(obj.elseBranch));
        }

        if (obj.type === 'let') {
            mustHave(obj, ['bindings', 'body']);

            return new Let(obj.bindings.map(Term.from), Term.from(obj.body));
        }

        if (obj.type === 'literal') {
            mustHave(obj, ['sort', 'value']);

            return new Literal(obj.sort as string, obj.value as string);
        }

        if (obj.type === 'seqRanged') {
            mustHave(obj, ['lhs', 'rhs']);

            return new SeqRanged(Term.from(obj.lhs), Term.from(obj.rhs));
        }

        if (obj.type === 'seqSingleton') {
            mustHave(obj, ['value']);

            return new SeqSingleton(Term.from(obj.value));
        }

        if (obj.type === 'seqUpdate') {
            mustHave(obj, ['seq', 'index', 'value']);

            return new SeqUpdate(Term.from(obj.seq), Term.from(obj.index), Term.from(obj.value));
        }

        if (obj.type === 'singletonSet') {
            mustHave(obj, ['value']);

            return new SetSingleton(Term.from(obj.value));
        }

        if (obj.type === 'singletonMultiset') {
            mustHave(obj, ['value']);

            return new MultisetSingleton(Term.from(obj.value));
        }

        throw new DebuggerError(`Unexpected path condition: ${obj}`);
    }
}