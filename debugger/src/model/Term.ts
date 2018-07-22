import { DebuggerError } from "../Errors";
import { TranslationEnv } from "./AlloyTranslator";
import { Logger } from "../logger";

function sanitize(name: string) {
    return name.replace(/@/g, "_");
}

function mustHave(type: string, obj: any, entries: string[]) {
    entries.forEach(key => {
        if (!obj.hasOwnProperty(key)) {
            throw new DebuggerError(`A '${type}' object must have a '${key}' entry: '${obj}'`);
        }
    });
}

export interface Term {
    toAlloy(env: TranslationEnv): TranslationRes;
    toString(): string;
}

export class Sort {
    constructor(readonly id: string, readonly elementsSort?: Sort) {}

    public static from(obj: any): Sort {
        mustHave('sort', obj, ['id']);

        if (!('elementsSort' in obj)) {
            return new Sort(obj.id);
        } else {
            return new Sort(obj.id, Sort.from(obj.elementsSort));
        }
    }

    public toString(): string {
        if (this.elementsSort) {
            return `${this.id}[${this.elementsSort.toString()}]`;
        } else {
            return this.id;
        }
    }
}

export interface WithSort {
    sort: Sort;
}

export function hasSort(object: any): object is WithSort {
    return 'sort' in object;
}

export function getSort(term: Term): Sort | undefined {
    if (hasSort(term)) {
        return term.sort;
    }
    
    if (term instanceof Binary) {
        return getSort(term.lhs) || getSort(term.rhs);
    }

    return undefined;
}


export class Leftover {
    constructor(readonly leftover: Term, readonly reason: string, readonly other: Leftover[]) {}

    toString() {
        return this.reason + ": " + this.leftover.toString();
    }

    toStringWithChildren(indent = 0): string {
        return this.reason + ": " + this.leftover.toString() + "\n" +
            this.other.map(o => o.toStringWithChildren(indent + 1));
    }
}

function translated(res: string, leftovers: Leftover[]) {
    return new TranslationRes(res, leftovers);
}

function leftover(leftover: Term, reason: string, other: Leftover[]) {
    return new TranslationRes(undefined, [new Leftover(leftover, reason, other)]);
}

class TranslationRes {
    constructor(readonly res: string | undefined, readonly leftovers: Leftover[]) {}
}


export class Binary implements Term {
    constructor(readonly op: string, readonly lhs: Term, readonly rhs: Term) {}

    toAlloy(env: TranslationEnv): TranslationRes {
        const left = this.lhs.toAlloy(env);
        const right = this.rhs.toAlloy(env);

        if (!left.res) {
            return leftover(this, "Left-hand side operand not translated", left.leftovers);
        }

        if (!right.res) {
            return leftover(this, "Right-hand side operand not translated", right.leftovers);
        }

        const alloyOp = this.op.replace("==", "=");
        if (alloyOp === 'Combine') {
            return leftover(this, "Combines not translated", left.leftovers.concat(right.leftovers));
        }

        return translated(`(${left.res} ${alloyOp} ${right.res})`, left.leftovers.concat(right.leftovers));
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

    toAlloy(env: TranslationEnv): TranslationRes {
        const term  = this.p.toAlloy(env);

        if (!term.res) {
            return leftover(this, "Operand not translated", term.leftovers);
        }

        return translated(`${this.op}(${term.res})`, term.leftovers);
    }

    toString() {
        return `${this.op}(${this.p})`;
    }
}

export class SortWrapper implements Term, WithSort {
    constructor(readonly term: Term, readonly sort: Sort) {}

    toAlloy(env: TranslationEnv): TranslationRes {
        Logger.debug(this.toString());
        // TODO: Fix this
        return this.term.toAlloy(env);
    }

    toString() {
        return `SortWrapper(${this.term.toString()}, ${this.sort.toString()})`;
    }
}

export class VariableTerm implements Term, WithSort {
    constructor(readonly id: string, readonly sort: Sort) {}

    toAlloyWithType(): string {
        // TODO: Retrieve the actual type from some env object?
        if (this.sort.id === "Ref") {
            return `${sanitize(this.id)}: Object`;
        }
        return `${sanitize(this.id)}: ${this.sort}`;
    }

    toAlloy(env: TranslationEnv): TranslationRes {
        const resolved = env.resolve(this.id);
        if (!resolved) {
            return leftover(this, `Could not resolve name '${this.id}'`, []);
        }

        return translated(sanitize(resolved), []);
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

    public toAlloy(env: TranslationEnv): TranslationRes {
        const tVars = this.vars.map(v => v.toAlloyWithType());

        let mult: string;
        if (this.quantifier === 'QA') {
            mult = 'all';
        } else if (this.quantifier === 'QE') {
            mult = 'some';
        } else {
            throw new DebuggerError(`Unexpected quantifier '${this.quantifier}'`);
        }

        // Inside quantifiers, the quantified variables are defined as well
        return env.evaluateWithQuantifiedVariables(
            this.vars.map(v => v.id),
            () => {
                const tBody = this.body.toAlloy(env);

                if (!tBody!.res) {
                    return leftover(this, "Could not translate quantified variables", tBody!.leftovers);
                }

                return translated(`${mult} ${tVars.join(", ")} | ${tBody.res}`, tBody.leftovers);
            });
    }

    public toString() {
        return `${this.quantifier} ${this.vars.join(", ")} :: ${this.body}`;
    }
}

export class Application implements Term, WithSort {

    constructor(readonly applicable: string, readonly args: Term[], readonly sort: Sort) {}

    public toAlloy(env: TranslationEnv): TranslationRes {
        const applicableSanitized = sanitize(this.applicable);
        const args = this.args.map(a => a.toAlloy(env));

        // Collect the leftovers from the translation of all arguments
        const leftovers = args.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (args.some(a => a.res === undefined)) {
            return leftover(this, "Could not translate some of the arguments", leftovers);
        }

        // We save INV functions in a sapearate namespace
        if (this.applicable.match(/inv@\d+@\d+/)) {
            env.recordFunction('INV', applicableSanitized);

            return translated(`INV.${applicableSanitized}[${args.map(a => a.res).join(", ")}]`, leftovers);
        } else {
            return translated(`Fun.${applicableSanitized}(${args.map(a => a.res).join(", ")})`, leftovers);
        }
    }

    toString() {
        return `${this.applicable}(${this.args.join(", ")})`;
    }
}

export class Lookup implements Term {
    constructor(readonly field: string, readonly fieldValueFunction: Term, readonly receiver: Term) {}

    // TODO: Do we need proper lookups?
    public toAlloy(env: TranslationEnv): TranslationRes { 
        const receiver = this.receiver.toAlloy(env);
        if (!receiver.res) {
            return leftover(this, "Could not translate receiver", receiver.leftovers);
        }

        return translated(receiver.res + "." + this.field, receiver.leftovers);
    }

    toString() {
        return `Lookup(${this.field}, ${this.fieldValueFunction}, ${this.receiver})`;
    }
}

export class PredicateLookup implements Term {

    constructor(readonly predicate: string, readonly predicateSnapFunction: Term, readonly args: Term[]) {}

    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "Predicate Lookups not implemented", []);
    }

    toString() {
        return `Lookup(${this.predicate}, ${this.predicateSnapFunction}, ${this.args})`;
    }
}

export class And implements Term {
    constructor(readonly terms: Term[]) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        const terms = this.terms.map(t => t.toAlloy(env));

        // Collect the leftovers from the translation of all terms
        const leftovers = terms.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (terms.some(a => a.res === undefined)) {
            return leftover(this, "Could not translate some of the terms", leftovers);
        }

        return translated("(" + terms.map(t => t.res).join(" && ") + ")", leftovers);
    }

    toString() {
        return this.terms.join(' && ');
    }
}

export class Or implements Term {
    constructor(readonly terms: Term[]) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        const terms = this.terms.map(t => t.toAlloy(env));

        // Collect the leftovers from the translation of all terms
        const leftovers = terms.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (terms.some(a => a.res === undefined)) {
            return leftover(this, "Could not translate some of the terms", leftovers);
        }

        return translated("(" + terms.map(t => t.res).join(" || ") + ")", leftovers);
    }

    toString() {
        return this.terms.join(' || ');
    }
}

export class Distinct implements Term {
    constructor(readonly symbols: string[]) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "'Distinct' term is not implemented", []);
    }
    toString() {
        return `distinct(${this.symbols.join(", ")})`;
    }
}

export class Ite implements Term {
    constructor(readonly condition: Term, readonly thenBranch: Term, readonly elseBranch: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        const cond = this.condition.toAlloy(env);
        const thenBranch = this.thenBranch.toAlloy(env);
        const elseBranch = this.elseBranch.toAlloy(env);

        const leftovers = cond.leftovers.concat(thenBranch.leftovers).concat(elseBranch.leftovers);
        if (!cond.res || !thenBranch.res || !elseBranch.res) {
            return leftover(this, "Could not translate 'Ite'", leftovers);
        }

        return translated(`(${cond.res} implies ${thenBranch.res} else ${elseBranch.res})`, leftovers);
    }

    toString () {
        return `${this.condition} ? ${this.thenBranch} : ${this.elseBranch}`;
    }
}

export class Let implements Term {
    constructor(readonly bindings: [VariableTerm, Term][], readonly body: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "Let translation not implemented", []);
    }

    toString () {
        return `let ${this.bindings.toString} in ${this.body}`;
    }
}

export class Literal implements Term, WithSort {
    constructor(readonly sort: Sort, readonly value: string) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        if (this.sort.id === 'Ref' && this.value === "Null") {
            return translated("NULL", []);
        }

        return translated(this.value, []);
    }

    toString() {
        return this.value;
    }
}

export class SeqRanged implements Term {
    constructor(readonly lhs: Term, readonly rhs: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "SeqRanged translation not implemented", []);
    }

    public toString() {
        return `[${this.lhs}..${this.rhs}]`;
    }
}

export class SeqSingleton implements Term {
    constructor(readonly value: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "SeqSingleton translation not implemented", []);
    }

    public toString() {
        return `[${this.value}]`;
    }
}

export class SeqUpdate implements Term {
    constructor(readonly seq: Term, readonly index: Term, readonly value: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "SeqUpdate translation not implemented", []);
    }

    public toString() {
        return `${this.seq}[${this.index}] := ${this.value}`;
    }
}

export class SetSingleton implements Term {
    constructor(readonly value: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "SetSingleton translation not implemented", []);
    }

    public toString() {
        return `{${this.value}}`;
    }
}

export class MultisetSingleton implements Term {
    constructor(readonly value: Term) {}
    public toAlloy(env: TranslationEnv): TranslationRes {
        return leftover(this, "MultiSetSingleton translation not implemented", []);
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