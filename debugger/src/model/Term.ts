import { DebuggerError } from "../Errors";
import { TermVisitor } from "./TermTranslator";
import { Sort } from "./Sort";


export function mustHave(type: string, obj: any, entries: string[]) {
    entries.forEach(key => {
        if (!obj.hasOwnProperty(key)) {
            throw new DebuggerError(`A '${type}' object must have a '${key}' entry: '${obj}'`);
        }
    });
}

export interface Term {
    toString(): string;
    accept<T>(visitor: TermVisitor<T>): T;
}

export class LogicalWrapper implements Term {
    constructor(readonly term: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitLogicalWrapper(this);
    }

    toString(): string {
        return `ToRelation(${this.term.toString()})`;
    }
}

export class Binary implements Term {
    constructor(readonly op: string, readonly lhs: Term, readonly rhs: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitBinary(this);
    }

    toString() {
        if (this.op === 'Combine') {
            return `${this.op}(${this.lhs}, ${this.rhs})`;
        } else {
            return `(${this.lhs} ${this.op} ${this.rhs})`;
        }
    }
}

export namespace BinaryOp {
    export const Equals = '==';
    export const Iff = '<=>';
    export const Implies = '==>';

    export const Minus = '-';
    export const Plus = '+';
    export const Times = '*';
    export const Div = '/';
    export const Mod = '%';

    export const Less = '<';
    export const AtMost = '<=';
    export const AtLeast = '>=';
    export const Greater = '>';

    export const SetAdd = '+';
    export const SetDifference = '\\';
    export const SetIntersection = '∩';
    export const SetUnion = '∪';
    export const SetIn = 'in';
    export const SetSubset = '⊂';
    export const SetDisjoint = 'disj';

    export const Combine = "Combine";
}

export namespace UnaryOp {
    export const Not = '!';
    export const SeqLength = 'SeqLength:';
    export const SetCardinality = 'SetCardinality:';
    export const MultiSetCardinality = 'MultiSetCardinality:';
}

export class Unary implements Term {
    constructor(readonly op: string, readonly p: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitUnary(this);
    }

    toString() {
        return `${this.op}(${this.p})`;
    }
}

export class SortWrapper implements Term {
    constructor(readonly term: Term, readonly sort: Sort) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitSortWrapper(this);
    }

    toString() {
        return `SortWrapper(${this.term.toString()}, ${this.sort.toString()})`;
    }
}

export class VariableTerm implements Term {
    constructor(readonly id: string, readonly sort: Sort) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitVariableTerm(this);
    }

    toString(): string {
        return this.id;
    }
}

export class Quantification implements Term {
    constructor(readonly quantifier: string,
                readonly vars: VariableTerm[],
                readonly body: Term,
                readonly name: string | null) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitQuantification(this);
    }

    public toString() {
        return `${this.quantifier} ${this.vars.join(", ")} :: ${this.body}`;
    }
}

export class Application implements Term {
    constructor(readonly applicable: string, readonly args: Term[], readonly sort: Sort) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitApplication(this);
    }

    toString() {
        return `${this.applicable}(${this.args.join(", ")})`;
    }
}

export class Lookup implements Term {
    constructor(readonly field: string, readonly fieldValueFunction: Term, readonly receiver: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitLookup(this);
    }

    toString() {
        return `Lookup(${this.field}, ${this.fieldValueFunction}, ${this.receiver})`;
    }
}

export class PredicateLookup implements Term {
    constructor(readonly predicate: string, readonly predicateSnapFunction: Term, readonly args: Term[]) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitPredicateLookup(this);
    }

    toString() {
        return `Lookup(${this.predicate}, ${this.predicateSnapFunction}, ${this.args})`;
    }
}

export class And implements Term {
    constructor(readonly terms: Term[]) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitAnd(this);
    }

    toString() {
        return this.terms.join(' && ');
    }
}

export class Or implements Term {
    constructor(readonly terms: Term[]) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitOr(this);
    }

    toString() {
        return this.terms.join(' || ');
    }
}

export class Distinct implements Term {
    constructor(readonly symbols: string[]) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitDistinct(this);
    }

    toString() {
        return `distinct(${this.symbols.join(", ")})`;
    }
}

export class Ite implements Term {
    constructor(readonly condition: Term, readonly thenBranch: Term, readonly elseBranch: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitIte(this);
    }

    toString () {
        return `${this.condition} ? ${this.thenBranch} : ${this.elseBranch}`;
    }
}

export class Let implements Term {
    constructor(readonly bindings: [VariableTerm, Term][], readonly body: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitLet(this);
    }

    toString () {
        return `let ${this.bindings.toString} in ${this.body}`;
    }
}

export class Literal implements Term {
    constructor(readonly sort: Sort, readonly value: string) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitLiteral(this);
    }

    toString() {
        return this.value;
    }
}

export class SeqRanged implements Term {
    constructor(readonly lhs: Term, readonly rhs: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitSeqRanged(this);
    }

    public toString() {
        return `[${this.lhs}..${this.rhs}]`;
    }
}

export class SeqSingleton implements Term {
    constructor(readonly value: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitSeqSingleton(this);
    }

    public toString() {
        return `[${this.value}]`;
    }
}

export class SeqUpdate implements Term {
    constructor(readonly seq: Term, readonly index: Term, readonly value: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitSeqUpdate(this);
    }

    public toString() {
        return `${this.seq}[${this.index}] := ${this.value}`;
    }
}

export class SetSingleton implements Term {
    constructor(readonly value: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitSetSingleton(this);
    }

    public toString() {
        return `{${this.value}}`;
    }
}

export class MultisetSingleton implements Term {
    constructor(readonly value: Term) {}

    accept<T>(visitor: TermVisitor<T>): T {
        return visitor.visitMultiSetSingleton(this);
    }

    public toString() {
        return `{${this.value}}`;
    }
}

export namespace Term {

    export function from(obj: any): Term {
        if (obj.type === undefined || typeof obj.type !== 'string') {
            throw new DebuggerError(`Path condition terms must have a 'type' entry of type 'string': '${obj}'`);
        }

        if (obj.type === 'binary') {
            mustHave(obj.type, obj, ['op', 'lhs', 'rhs']);

            return new Binary(obj.op as string, Term.from(obj.lhs), Term.from(obj.rhs));
        }
        
        if (obj.type === 'unary') {
            mustHave(obj.type, obj, ['op', 'p']);

            return new Unary(obj.op, Term.from(obj.p));
        }

        if (obj.type === 'variable') {
            mustHave(obj.type, obj, ['id', 'sort']);

            return new VariableTerm(obj.id, Sort.from(obj.sort));
        }

        if (obj.type === 'sortWrapper') {
            mustHave(obj.type, obj, ['term', 'sort']);

            return new SortWrapper(Term.from(obj.term), Sort.from(obj.sort));
        }

        if (obj.type === 'quantification') {
            mustHave(obj.type, obj, ['quantifier', 'vars', 'body', 'name']);

            return new Quantification(
                obj.quantifier,
                obj.vars.map(Term.from),
                Term.from(obj.body),
                obj.name
            );
        }

        if (obj.type === 'application') {
            mustHave(obj.type, obj, ['applicable', 'args', 'sort']);
            
            return new Application(obj.applicable as string, obj.args.map(Term.from), Sort.from(obj.sort));
        }

        if (obj.type === 'lookup') {
            mustHave(obj.type, obj, ['field', 'fieldValueFunction', 'receiver']);

            return new Lookup(obj.field as string, Term.from(obj.fieldValueFunction), Term.from(obj.receiver));
        }

        if (obj.type === 'predicateLookup') {
            mustHave(obj.type, obj, ['predicate', 'predicateSnapFunction', 'args']);

            return new PredicateLookup(
                obj.predicate as string,
                Term.from(obj.predicateSnapFunction),
                obj.args.map(Term.from)
            );
        }

        if (obj.type === 'and') {
            mustHave(obj.type, obj, ['terms']);

            return new And(obj.terms.map(Term.from));
        }

        if (obj.type === 'or') {
            mustHave(obj.type, obj, ['terms']);

            return new Or(obj.terms.map(Term.from));
        }

        if (obj.type === 'distinct') {
            mustHave(obj.type, obj, ['symbols']);

            return new Distinct(<string[]> obj.symbols);
        }

        if (obj.type === 'ite') {
            mustHave(obj.type, obj, ['cond', 'thenBranch', 'elseBranch']);

            return new Ite(Term.from(obj.cond), Term.from(obj.thenBranch), Term.from(obj.elseBranch));
        }

        if (obj.type === 'let') {
            mustHave(obj.type, obj, ['bindings', 'body']);

            const bindings = obj.bindings.map((b: any) => {
                mustHave('binding', b, ['var', 'value']);
                return [<VariableTerm> Term.from(b.var), Term.from(b.value)];
            });
            return new Let(bindings, Term.from(obj.body));
        }

        if (obj.type === 'literal') {
            mustHave(obj.type, obj, ['sort', 'value']);

            return new Literal(Sort.from(obj.sort), obj.value as string);
        }

        if (obj.type === 'seqRanged') {
            mustHave(obj.type, obj, ['lhs', 'rhs']);

            return new SeqRanged(Term.from(obj.lhs), Term.from(obj.rhs));
        }

        if (obj.type === 'seqSingleton') {
            mustHave(obj.type, obj, ['value']);

            return new SeqSingleton(Term.from(obj.value));
        }

        if (obj.type === 'seqUpdate') {
            mustHave(obj.type, obj, ['seq', 'index', 'value']);

            return new SeqUpdate(Term.from(obj.seq), Term.from(obj.index), Term.from(obj.value));
        }

        if (obj.type === 'singletonSet') {
            mustHave(obj.type, obj, ['value']);

            return new SetSingleton(Term.from(obj.value));
        }

        if (obj.type === 'singletonMultiset') {
            mustHave(obj.type, obj, ['value']);

            return new MultisetSingleton(Term.from(obj.value));
        }

        throw new DebuggerError(`Unexpected term: ${JSON.stringify(obj)}`);
    }
}