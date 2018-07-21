import { DebuggerError } from "../Errors";
import { TranslationEnv } from "./AlloyTranslator";

function sanitize(name: string) {
    return name.replace(/@/g, "_");
}

export interface Term {
    toAlloy(env: TranslationEnv): string | undefined;
    toString(): string;
}

export interface WithSort {
    sort: string;
}

export function hasSort(object: any): object is WithSort {
    return 'sort' in object;
}

export function getSort(term: Term): string | undefined {
    if (hasSort(term)) {
        return term.sort;
    }
    
    if (term instanceof Binary) {
        return getSort(term.lhs) || getSort(term.rhs);
    }

    return undefined;
}

export class Binary implements Term {
    constructor(readonly op: string, readonly lhs: Term, readonly rhs: Term) {}

    toAlloy(env: TranslationEnv): string | undefined {
        const alloyOp = this.op.replace("==", "=");
        const left = this.lhs.toAlloy(env);
        const right = this.rhs.toAlloy(env);

        if (left === undefined || right === undefined) {
            return undefined;
        }

        return alloyOp === 'Combine' ? `${this.op}(${left}, ${right})` : `(${left} ${alloyOp} ${right})`;
    }

    toString() {
        if (this.op === 'Combine') {
            return `${this.op}(${this.lhs}, ${this.rhs})`;
        } else {
            return `(${this.lhs} ${this.op} ${this.rhs})`;
        }
    }
}

export class Unary implements Term {
    constructor(readonly op: string, readonly p: Term) {}

    toAlloy(env: TranslationEnv): string | undefined {
        const term  = this.p.toAlloy(env);
        return term !== undefined ? `${this.op}(${term})` : undefined;
    }

    toString() {
        return `${this.op}(${this.p})`;
    }
}

export class VariableTerm implements Term, WithSort {
    constructor(readonly id: string, readonly sort: string) {}

    toAlloyWithType(): string {
        // TODO: Retrieve the actual type from some env object?
        if (this.sort === "Ref") {
            return `${sanitize(this.id)}: Object`;
        }
        return `${sanitize(this.id)}: ${this.sort}`;
    }

    toAlloy(env: TranslationEnv): string | undefined {
        const resolved = env.resolve(this.id);
        return resolved !== undefined ? sanitize(resolved) :  undefined;
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

    public toAlloy(env: TranslationEnv): string | undefined {
        const tVars = this.vars.map(v => v.toAlloyWithType());

        // Inside quantifiers, the quantified variables are defined as well
        let tBody: string | undefined = undefined;
        env.withQuantifiedVariables(new Set(this.vars.map(v => v.id)), () => {
            tBody = this.body.toAlloy(env);
        });

        let mult;
        if (this.quantifier === 'QA') {
            mult = 'all';
        } else if (this.quantifier === 'QE') {
            mult = 'some';
        } else {
            throw new DebuggerError(`Unexpected quantifier '${this.quantifier}'`);
        }

        if (tBody !== undefined) {
            return `${mult} ${tVars.join(", ")} | ${tBody}`;
        }

        return undefined;
    }

    public toString() {
        return `${this.quantifier} ${this.vars.join(", ")} :: ${this.body}`;
    }
}

export class Application implements Term, WithSort {

    constructor(readonly applicable: string, readonly args: Term[], readonly sort: string) {}

    public toAlloy(env: TranslationEnv): string | undefined {
        const applicableSanitized = sanitize(this.applicable);
        const args = this.args.map(a => a.toAlloy(env));

        // Translating some of the arguments has failed.
        if (args.some(a => a === undefined)) {
            return undefined;
        }

        // We save INV functions in a sapearate namespace
        if (this.applicable.match(/inv@\d+@\d+/)) {
            env.recordFunction('INV', applicableSanitized);

            return `INV.${applicableSanitized}[${args.join(", ")}]`;
        } else {
            return `Fun.${applicableSanitized}(${args.join(", ")})`;
        }
    }

    toString() {
        return `${this.applicable}(${this.args.join(", ")})`;
    }
}

export class Lookup implements Term {
    constructor(readonly field: string, readonly fieldValueFunction: Term, readonly receiver: Term) {}
    public toAlloy(env: TranslationEnv): string { 
        // TODO: Do we need lookups?
        // return `Lookup(${this.field}, ${this.fieldValueFunction.toAlloy(env)}, ${this.receiver.toAlloy(env)})`;
        return this.receiver.toAlloy(env) + "." + this.field;
    }

    toString() {
        return `Lookup(${this.field}, ${this.fieldValueFunction}, ${this.receiver})`;
    }
}

export class PredicateLookup implements Term {

    constructor(readonly predicate: string, readonly predicateSnapFunction: Term, readonly args: Term[]) {}

    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    toString() {
        return `Lookup(${this.predicate}, ${this.predicateSnapFunction}, ${this.args})`;
    }
}

export class And implements Term {
    constructor(readonly terms: Term[]) {}
    public toAlloy(env: TranslationEnv): string {
        return "(" + this.terms.map(t => t.toAlloy(env)).join(" && ") + ")";
    }

    toString() {
        return this.terms.join(' && ');
    }
}

export class Or implements Term {
    constructor(readonly terms: Term[]) {}
    public toAlloy(env: TranslationEnv): string {
        return "(" + this.terms.map(t => t.toAlloy(env)).join(" || ") + ")";
    }

    toString() {
        return this.terms.join(' || ');
    }
}

export class Distinct implements Term {
    constructor(readonly terms: Term[]) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }
    toString() {
        return `distinct(${this.terms.join(", ")})`;
    }
}

export class Ite implements Term {
    constructor(readonly condition: Term, readonly thenBranch: Term, readonly elseBranch: Term) {}
    public toAlloy(env: TranslationEnv): string {
        return `(${this.condition.toAlloy(env)} implies ${this.thenBranch.toAlloy(env)} else ${this.elseBranch.toAlloy(env)})`;
    }

    toString () {
        return `${this.condition} ? ${this.thenBranch} : ${this.elseBranch}`;
    }
}

export class Let implements Term {
    constructor(readonly bindings: Term[], readonly body: Term) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    toString () {
        return `let ${this.bindings.toString} in ${this.body}`;
    }
}

export class Literal implements Term, WithSort {
    constructor(readonly sort: string, readonly value: string) {}
    public toAlloy(env: TranslationEnv): string {
        if (this.sort === 'Ref' && this.value === "Null") {
            return "NULL";
        }

        return this.value;
    }

    toString() {
        return this.value;
    }
}

export class SeqRanged implements Term {
    constructor(readonly lhs: Term, readonly rhs: Term) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    public toString() {
        return `[${this.lhs}..${this.rhs}]`;
    }
}

export class SeqSingleton implements Term {
    constructor(readonly value: Term) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    public toString() {
        return `[${this.value}]`;
    }
}

export class SeqUpdate implements Term {
    constructor(readonly seq: Term, readonly index: Term, readonly value: Term) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    public toString() {
        return `${this.seq}[${this.index}] := ${this.value}`;
    }
}

export class SetSingleton implements Term {
    constructor(readonly value: Term) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    public toString() {
        return `{${this.value}}`;
    }
}

export class MultisetSingleton implements Term {
    constructor(readonly value: Term) {}
    public toAlloy(env: TranslationEnv): string { return JSON.stringify(this); }

    public toString() {
        return `{${this.value}}`;
    }
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
            mustHave(obj, ['applicable', 'args', 'sort']);
            
            return new Application(obj.applicable as string, obj.args.map(Term.from), obj.sort);
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

        throw new DebuggerError(`Unexpected path condition: ${JSON.stringify(obj)}`);
    }
}