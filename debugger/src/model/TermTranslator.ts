import { Binary, Unary, VariableTerm, Quantification, Application, Lookup, PredicateLookup, And, Or, Distinct, Ite, Let, Literal, SeqRanged, SeqSingleton, SeqUpdate, SetSingleton, MultisetSingleton, SortWrapper, Term, BinaryOp, LogicalWrapper, BooleanWrapper, UnaryOp } from "./Term";
import { TranslationEnv } from "./TranslationEnv";
import { Logger } from "../logger";
import { getSort, Sort } from "./Sort";
import { DebuggerError } from "../Errors";
import { mkString } from "../util";
import { AlloyTranslator } from "./AlloyTranslator";


export interface TermVisitor<T> {
    visitBinary(binary: Binary): T;
    visitUnary(unary: Unary): T;
    visitSortWrapper(sortWrapper: SortWrapper): T;
    visitVariableTerm(variable: VariableTerm): T;
    visitQuantification(quantification: Quantification): T;
    visitApplication(application: Application): T;
    visitLookup(lookup: Lookup): T;
    visitPredicateLookup(lookup: PredicateLookup): T;
    visitAnd(and: And): T;
    visitOr(or: Or): T;
    visitDistinct(distinct: Distinct): T;
    visitIte(ite: Ite): T;
    visitLet(term: Let): T;
    visitLiteral(literal: Literal): T;
    visitSeqRanged(seqRanged: SeqRanged): T;
    visitSeqSingleton(seqSingleton: SeqSingleton): T;
    visitSeqUpdate(seqUpdate: SeqUpdate): T;
    visitSetSingleton(setSingleton: SetSingleton): T;
    visitMultiSetSingleton(multiSetSingleton: MultisetSingleton): T;

    visitLogicalWrapper(logicalWrapper: LogicalWrapper): T;
    visitBooleanWrapper(boolWrapper: BooleanWrapper): T;
}

export function sanitize(name: string) {
    return name.replace(/^\$/g, "")
               .replace(/[@[\]$]/g, "_");
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

export class TranslationRes {
    constructor(readonly res: string | undefined,
                readonly leftovers: Leftover[],
                readonly additionalFacts: string[]) {}

    public withAdditionalFacts(additionalFacts: string[]) {
        additionalFacts.forEach(f => this.additionalFacts.push(f));
        return this;
    }
}
function translatedFrom(res: string, others: TranslationRes[]) {
    let leftovers = others.reduce((acc, curr) => acc.concat(curr.leftovers), [] as Leftover[]);
    let additionalFacts = others.reduce((acc, curr) => acc.concat(curr.additionalFacts), [] as string[]);

    return new TranslationRes(res, leftovers, additionalFacts);
}

function leftover(leftover: Term, reason: string, other: Leftover[]) {
    return new TranslationRes(undefined, [new Leftover(leftover, reason, other)], []);
}

export class TermTranslatorVisitor implements TermVisitor<TranslationRes> {

    constructor(readonly env: TranslationEnv) {}

    private pred_call(name: string, sort: Sort, args: Term[]): TranslationRes {
        const freshName = this.env.getFreshVariable('temp', sort);

        const tArgs: TranslationRes[] = [];
        args.forEach(a => {
            const res = a.accept(this);
            if (res.res === undefined) {
                Logger.error("Could not translate argument: " + res);
                return leftover(a, "Could not translate argument", []);
            }
            tArgs.push(res);
        });
        
        const call = name + mkString(tArgs.map(a => a.res).concat(freshName), '[', ", ", ']');
        return translatedFrom(freshName, tArgs)
                .withAdditionalFacts([call]);
    }

    private int_call(name: string, args: Term[]): TranslationRes {
        const tArgs: TranslationRes[] = [];
        args.forEach(a => {
            const translated = a.accept(this);
            if (translated.res === undefined) {
                return leftover(a, "Could not translate one of the arguments", translated.leftovers);
            }
            tArgs.push(translated);
        });

        return translatedFrom(name + mkString(tArgs.map(a => a.res + '.value'), '[', ", ", ']'), tArgs);
    }

    private int_op(op: string, binary: Binary): TranslationRes {
        const left = binary.lhs.accept(this);
        if (left.res === undefined) {
            return leftover(binary, "Left-hand side operand not translated", left.leftovers);
        }

        const right = binary.rhs.accept(this);
        if (right.res === undefined) {
            return leftover(binary, "Right-hand side operand not translated", right.leftovers);
        }
        
        if (!(op === '>' || op === '>=' || op === '<' || op === '<=' || op === '=')) {
            const msg = `Unexpected operaton in int_op: '${op}'`;
            Logger.error(msg);
            throw new DebuggerError(msg);
        }

        const leftString = binary.lhs instanceof Literal ? left.res : left.res + '.value';
        const rightString = binary.rhs instanceof Literal ? right.res : right.res + '.value';

        return translatedFrom(`(${leftString} ${op} ${rightString})`, [left, right]);
    }

    private call(name: string, args: Term[]): TranslationRes {
        const tArgs: TranslationRes[] = [];
        args.forEach(a => {
            const sort = getSort(a);
            let translated: TranslationRes;
            if (sort.is(Sort.Logical)) {
                translated = new BooleanWrapper(a).accept(this);
            } else {
                translated = a.accept(this);
            }
            if (translated.res === undefined) {
                return leftover(a, "Could not translate one of the arguments", translated.leftovers);
            }
            tArgs.push(translated);
        });

        return translatedFrom(name + mkString(tArgs.map(a => a.res), '[', ", ", ']'), tArgs);
    }

    visitBinary(binary: Binary): TranslationRes {
        if (binary.op === "Combine") {
            return this.pred_call("combine", Sort.Snap, [binary.lhs, binary.rhs]);
        }

        const leftSort = getSort(binary.lhs);
        const rightSort = getSort(binary.rhs);

        if (leftSort.is('Set') || rightSort.is('Set')) {
            switch (binary.op) {
                case BinaryOp.SetAdd: return this.pred_call('set_add', leftSort, [binary.lhs, binary.rhs]);
                case BinaryOp.SetDifference: return this.pred_call('set_difference', leftSort, [binary.lhs, binary.rhs]);
                case BinaryOp.SetIntersection: return this.pred_call('set_intersection', leftSort, [binary.lhs, binary.rhs]);
                case BinaryOp.SetUnion: return this.pred_call('set_union', leftSort, [binary.lhs, binary.rhs]);

                // case BinaryOp.CustomEquals: return this.call('set_equals', [binary.lhs, binary.rhs]);
                case BinaryOp.SetIn: return this.call('set_in', [binary.lhs, binary.rhs]);
                case BinaryOp.SetSubset: return this.call('set_subset', [binary.lhs, binary.rhs]);
                // TODO: This either is not in the grammar os never used
                case BinaryOp.SetDisjoint: return this.call('set_disjoint', [binary.lhs, binary.rhs]);
            }
        }

        if (leftSort.is('Seq') || rightSort.is('Seq')) {
            const sort = leftSort.is('Seq') ? leftSort : rightSort;
            switch (binary.op) {
                case BinaryOp.SeqAppend: return this.pred_call('seq_append', sort, [binary.lhs, binary.rhs]);
                case BinaryOp.SeqAt: return this.call('seq_at', [binary.lhs, binary.rhs]);
                case BinaryOp.SeqTake: return this.pred_call('seq_take', sort, [binary.lhs, binary.rhs]);
                case BinaryOp.SeqDrop: return this.pred_call('seq_drop', sort, [binary.lhs, binary.rhs]);

                // case BinaryOp.CustomEquals: return this.call('set_equals', [binary.lhs, binary.rhs]);
                case BinaryOp.SeqIn: return this.call('seq_in', [binary.lhs, binary.rhs]);
            }
        }

        if (leftSort.is('Multiset') || rightSort.is('Multiset')) {
            const sort = leftSort.is('Multiset') ? leftSort : rightSort;

            switch (binary.op) {
                case BinaryOp.MultisetAdd: return this.pred_call('multiset_add', sort, [binary.lhs, binary.rhs]);
                case BinaryOp.MultisetDifference: return this.pred_call('multiset_difference', sort, [binary.lhs, binary.rhs]);
                case BinaryOp.MultisetIntersection: return this.pred_call('multiset_intersection', sort, [binary.lhs, binary.rhs]);
                case BinaryOp.MultisetUnion: return this.pred_call('multiset_union', sort, [binary.lhs, binary.rhs]);
                case BinaryOp.MultisetCount: return this.pred_call('multiset_count', Sort.Int, [binary.lhs, binary.rhs]);

                case BinaryOp.MultisetSubset: return this.call('multiset_subset', [binary.lhs, binary.rhs]);
            }
        }

        // Alloy operators only have one equal sign, but are otherwise the same as the Viper ones.
        let alloyOp = binary.op.replace('===', '=').replace("==", "=");

        if (leftSort.is(Sort.Logical) && rightSort.is(Sort.Logical) && binary.op === BinaryOp.Equals) {
            alloyOp = '<=>';
            const left = binary.lhs.accept(this);
            if (left.res === undefined) {
                return leftover(binary, "Left-hand side operand not translated", left.leftovers);
            }
            const right = binary.rhs.accept(this);
            if (right.res === undefined) {
                return leftover(binary, "Right-hand side operand not translated", right.leftovers);
            }

            return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
        }

        // If both operands are boolean, then translating to alloy equality is fine. In all other cases we need to wrap
        // at least one of the two operands.
        if (leftSort.is(Sort.Bool) && rightSort.is(Sort.Bool) && binary.op === BinaryOp.Equals) {
            const left = binary.lhs.accept(this);
            if (left.res === undefined) {
                return leftover(binary, "Left-hand side operand not translated", left.leftovers);
            }
            const right = binary.rhs.accept(this);
            if (right.res === undefined) {
                return leftover(binary, "Right-hand side operand not translated", right.leftovers);
            }

            return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
        }

        // If any of the operands are Bools and this is a "logical" operatino, we need to wrap them
        if (leftSort.is(Sort.Bool) || rightSort.is(Sort.Bool)) {
            if (binary.op === '==>' || binary.op === 'implies' || binary.op === '==' || binary.op === '<==>') {

                // If one of the operands has logical type, then equality must be turned into a iff
                if (binary.op === BinaryOp.Equals) {
                    alloyOp = '<=>';
                }

                const left = leftSort.is(Sort.Bool) ? new LogicalWrapper(binary.lhs).accept(this)
                                                       : binary.lhs.accept(this);
                if (left.res === undefined) {
                    return leftover(binary, "Left-hand side operand not translated", left.leftovers);
                }

                const right = rightSort.is(Sort.Bool) ? new LogicalWrapper(binary.rhs).accept(this)
                                                         : binary.rhs.accept(this);
                if (right.res === undefined) {
                    return leftover(binary, "Right-hand side operand not translated", right.leftovers);
                }
                return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
            } else {
                Logger.error("Unexpected operator for operands of type Bool :" + binary);
                throw new DebuggerError("Unexpected operator for operands of type Bool :" + binary);
            }
        }

        if (leftSort.is(Sort.Int) || rightSort.is(Sort.Int)) {
            switch (binary.op) {
                case '-': return this.int_call('minus', [binary.lhs, binary.rhs]);
                case '+': return this.int_call('plus', [binary.lhs, binary.rhs]);
                case '*': return this.int_call('mul', [binary.lhs, binary.rhs]);
                case '/': return this.int_call('div', [binary.lhs, binary.rhs]);
                case '%': return this.int_call('rem', [binary.lhs, binary.rhs]);
            }

            return this.int_op(alloyOp, binary);
        }

        // TODO: IntPermTimes, IntPermDIv, PermMin, 
        // Operations on permissions are translated to predicate calls
        if (leftSort.is(Sort.Perm) || rightSort.is(Sort.Perm)) {
            switch (binary.op) {
                // Perm comparison
                case '<': return this.call('perm_less', [binary.lhs, binary.rhs]);
                case '<=': return this.call('perm_at_most', [binary.lhs, binary.rhs]);
                case '>=': return this.call('perm_at_least', [binary.lhs, binary.rhs]);
                case '>': return this.call('perm_greater', [binary.lhs, binary.rhs]);
                // Perm arithmetic
                case '+': return this.pred_call('perm_plus', leftSort, [binary.lhs, binary.rhs]);
                case '-': return this.pred_call('perm_minus', leftSort, [binary.lhs, binary.rhs]);
                // Int-Perm multiplication always has the integer on the left in Silicon
                case '*': return leftSort.is(Sort.Int) ? this.pred_call('int_perm_mul', rightSort, [binary.lhs, binary.rhs])
                                                       : this.pred_call('perm_mul', leftSort, [binary.lhs, binary.rhs]);
                // Int-Perm division always has the integer on the left in Silicon
                case '/': return this.pred_call('int_perm_div', rightSort, [binary.lhs, binary.rhs]);
                case 'PermMin': return this.pred_call('perm_min', leftSort, [binary.lhs, binary.rhs]);
                case '==': return this.call('perm_equals', [binary.lhs, binary.rhs]);
                // case '==': return translatedFrom(`(${left.res} = ${right.res})`, [left, right]);
                default: Logger.error(`Unexpected perm operator: ${binary.op}`);
            }
        }

        const left = leftSort.is(Sort.Bool) ? new LogicalWrapper(binary.lhs).accept(this) : binary.lhs.accept(this);
        if (left.res === undefined) {
            return leftover(binary, "Left-hand side operand not translated", left.leftovers);
        }

        const right = rightSort.is(Sort.Bool) ? new LogicalWrapper(binary.rhs).accept(this) : binary.rhs.accept(this);
        if (right.res === undefined) {
            return leftover(binary, "Right-hand side operand not translated", right.leftovers);
        }

        // If we are not dealing with a combine, then return a "regular" binary expression
        return translatedFrom(`(${left.res} ${alloyOp} ${right.res})`, [left, right]);
    }

    visitUnary(unary: Unary): TranslationRes {
        const termSort = getSort(unary.p);

        if (unary.op === UnaryOp.SetCardinality && termSort.is('Set')) {
            return this.call('set_cardinality', [unary.p]);
        }

        if (unary.op === UnaryOp.SeqLength && termSort.is('Seq')) {
            return this.call('seq_length', [unary.p]);
        }

        if (unary.op === UnaryOp.MultiSetCardinality && termSort.is('Multiset')) {
            return this.pred_call('multiset_cardinality', Sort.Int, [unary.p]);
        }

        const operand  = unary.p.accept(this); 
        if (!operand.res) {
            return leftover(unary, "Operand not translated", operand.leftovers);
        }

        if ((unary.p instanceof VariableTerm || unary.p instanceof Application || unary.p instanceof Lookup)
                && termSort.is(Sort.Bool)) {
            if (unary.op === "!") {
                return translatedFrom(`isFalse[${operand.res}]`, [operand]);
            }
        }

        if (unary.p instanceof Quantification && unary.p.quantifier === 'QE') {
            const eq = unary.p;
            const uq = new Quantification('QA', eq.vars, new Unary('!', eq.body), null);
            return uq.accept(this);
        }

        return translatedFrom(`${unary.op}(${operand.res})`, [operand]);
    }

    visitSortWrapper(sortWrapper: SortWrapper): TranslationRes {
        return this.pred_call('sortwrapper_new', Sort.Snap, [sortWrapper.term]);
    }

    visitVariableTerm(variable: VariableTerm): TranslationRes {
        const resolved = this.env.resolve(variable);
        if (resolved) {
            return translatedFrom(sanitize(resolved), []);
        }
        return leftover(variable, `Could not retrieve variable '${variable.toString()}'`, []);
    }

    visitQuantification(quantification: Quantification): TranslationRes {
        let mult: string;
        if (quantification.quantifier === 'QA') {
            mult = 'all';
        } else if (quantification.quantifier === 'QE') {
            mult = 'some';
        } else {
            throw new DebuggerError(`Unexpected quantifier '${quantification.quantifier}'`);
        }

        // Inside quantifiers, the quantified variables are defined as well
        return this.env.evaluateWithAdditionalVariables(
            quantification.vars.map(v => v.id),
            () => {
                this.env.quantifierVariables = quantification.vars;
                // Make sure the body of a quantifier has logical sort
                const tBody = new LogicalWrapper(quantification.body).accept(this);

                if (!tBody.res) {
                    return leftover(quantification, "Could not translate quantified variables", tBody!.leftovers);
                }

                this.env.quantifierVariables = undefined;
                const vars = quantification.vars.map(v => `${sanitize(v.id)}: ${this.env.translate(v.sort)}`);
                const body = tBody.additionalFacts.concat(tBody.res).join(' && ');
                if (this.env.addToQuantifier) {
                    const toAdd = this.env.addToQuantifier;
                    this.env.addToQuantifier = undefined;
                    return translatedFrom(`(${mult} ${vars.join(', ')} | ${toAdd} ${body})`, []);
                } else {
                    return translatedFrom(`(${mult} ${vars.join(', ')} | ${body})`, []);
                }
            });

    }

    visitApplication(application: Application): TranslationRes {
        let applicableSanitized = sanitize(application.applicable);
        if (applicableSanitized.endsWith('%limited')) {
            applicableSanitized = applicableSanitized.replace(/%limited$/, '');
        }

        if (applicableSanitized.endsWith('trigger')) {
            return leftover(application, "Explicitely ignoring trigger applications", []);
        }

        if (applicableSanitized.startsWith("sm") && (application.sort.is('FVF') || application.sort.is('PSF'))) {
            const snapshotMapVar = new VariableTerm(applicableSanitized, application.sort);
            if (this.env.introduceMissingTempVars) {
                this.env.recordTempVariable(snapshotMapVar);
                return snapshotMapVar.accept(this);
            } else {
                // Check that the variable has been recorded before
                if (this.env.resolve(snapshotMapVar) !== undefined) {
                    return snapshotMapVar.accept(this);
                }

                return leftover(application, "Not introducing new variable for snapshot map", []);
            }
        }

        if (applicableSanitized.startsWith("pTaken")) {
            this.env.recordNeededMacro(applicableSanitized);
            return this.call('PTAKEN.' + applicableSanitized, application.args);
        }

        if (this.env.failOnMissingFunctions && !this.env.functions.has(applicableSanitized)) {
            return leftover(application, "Not introducing missing functions", []);
        }

        const callName = `${AlloyTranslator.Function}.${applicableSanitized}`;
        const translated = this.call(callName, application.args);
        if (translated.res === undefined) {
            return leftover(application, "Could not translate call", translated.leftovers);
        }

        const sorts = application.args.map(a => {
            const s = getSort(a);
            if (s.is(Sort.Logical)) {
                return Sort.Bool;
            } else {
                return s;
            }
        });
        this.env.recordFunction(applicableSanitized, sorts, application.sort);
        return translated;
    }

    visitLookup(lookup: Lookup): TranslationRes {
        const receiver = lookup.receiver.accept(this);
        if (!receiver.res) {
            return leftover(lookup, "Could not translate receiver", receiver.leftovers);
        }

        const returnSort = getSort(lookup.fieldValueFunction);
        if (!(returnSort.is('FVF') && returnSort.elementsSort !== undefined)) {
            Logger.error(`Expected sort to be a FVF, but was '${returnSort}': ` + lookup);
            throw new DebuggerError(`Expected sort to be a FVF, but was '${returnSort}': ` + lookup);
        }

        this.env.lookupFunctions.push([returnSort, lookup.field]);

        const callName = `${AlloyTranslator.Lookup}.${sanitize(lookup.field)}`;
        const translated = this.call(callName, [lookup.fieldValueFunction, lookup.receiver]);
        if (translated.res === undefined) {
            return leftover(lookup, "Could not translate lookup call", translated.leftovers);
        }

        return translated; 
    }

    visitPredicateLookup(lookup: PredicateLookup): TranslationRes {
        const argSorts = lookup.args.map(a => getSort(a));

        const returnSort = getSort(lookup.predicateSnapFunction);
        if (!(returnSort.is('PSF')) && returnSort.elementsSort !== undefined) {
            Logger.error(`Expected sort to be PSF, but was '${returnSort}': ` + lookup);
            throw new DebuggerError(`Expected sort to be PSF, but was '${returnSort}': ` + lookup);
        }

        this.env.predLookupFunctions.push([lookup.predicate, [returnSort].concat(argSorts)]);

        const callName = `${AlloyTranslator.PredLookup}.${lookup.predicate}`;
        const translated = this.call(callName, [lookup.predicateSnapFunction].concat(lookup.args));
        if (translated.res === undefined) {
            return leftover(lookup, "Could not translate predicate lookup call", translated.leftovers);
        }

        return translated;
    }

    visitAnd(and: And): TranslationRes {
        const terms = and.terms.map(t => new LogicalWrapper(t).accept(this));

        // Collect the leftovers from the translation of all terms
        const leftovers = terms.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (terms.some(a => a.res === undefined)) {
            return leftover(and, "Could not translate some of the terms", leftovers);
        }

        return translatedFrom("(" + terms.map(t => t.res).join(" && ") + ")", terms);
    }

    visitOr(or: Or): TranslationRes {
        const terms = or.terms.map(t => new LogicalWrapper(t).accept(this));

        // Collect the leftovers from the translation of all terms
        const leftovers = terms.reduce(
            (acc, current) => acc.concat(current.leftovers),
            <Leftover[]>[]
        );

        // Translating some of the arguments has failed.
        if (terms.some(a => a.res === undefined)) {
            return leftover(or, "Could not translate some of the terms", leftovers);
        }

        return translatedFrom("(" + terms.map(t => t.res).join(" && ") + ")", terms);
    }

    // TODO: Implement this
    visitDistinct(distinct: Distinct): TranslationRes {
        return leftover(distinct, "'Distinct' term is not implemented", []);
    }

    visitIte(ite: Ite): TranslationRes {
        const conditionSort = getSort(ite.condition);
        const cond = conditionSort.is(Sort.Bool) ? new LogicalWrapper(ite.condition).accept(this)
                                                 : ite.condition.accept(this);
        const iteSort = getSort(ite);
        const thenBranch = iteSort.is(Sort.Logical) ? new LogicalWrapper(ite.thenBranch).accept(this)
                                                    : ite.thenBranch.accept(this);
        const elseBranch = iteSort.is(Sort.Logical) ? new LogicalWrapper(ite.elseBranch).accept(this)
                                                    : ite.elseBranch.accept(this);

        const leftovers = cond.leftovers.concat(thenBranch.leftovers).concat(elseBranch.leftovers);
        if (!cond.res || !thenBranch.res || !elseBranch.res) {
            return leftover(ite, "Could not translate 'Ite'", leftovers);
        }

        const res = `(${cond.res} implies ${thenBranch.res} else ${elseBranch.res})`;
        return translatedFrom(res, [cond, thenBranch, elseBranch]);
    }

    visitLet(term: Let): TranslationRes {
        const names: string[] = [];
        const bindings: string[] = [];
        for (const [name, value] of term.bindings) {
            names.push(name.id);
            const translatedValue = value.accept(this);
            if (translatedValue.res) {
                bindings.push(`${sanitize(name.id)} = ${translatedValue.res}`);
            } else {
                return leftover(term, `Could not translate let binding '${value}'`, translatedValue.leftovers);
            }
        }

        return this.env.evaluateWithAdditionalVariables(
            names,
            () => {
                const translatedBody = term.body.accept(this);

                if (!translatedBody.res) {
                    return leftover(term, `Could not translate let body '${term.body}'`, translatedBody.leftovers);
                }

                // We declare the additional facts here, since they might refer to variables in the bindings
                const body = translatedBody.additionalFacts.concat(translatedBody.res).join(' && ');
                return translatedFrom('let ' + bindings.join(', ') + ' | ' + body, []);
            }
        );
    }

    visitLiteral(literal: Literal): TranslationRes {
        // TODO: Check bounds with env
        if (literal.sort.is(Sort.Int)) {
            return translatedFrom(literal.value, []);
        }
        if (literal.sort.is(Sort.Snap) && literal.value === '_') {
            return translatedFrom(AlloyTranslator.Unit, []);
        }
        if (literal.sort.is(Sort.Bool) && (literal.value === "True" || literal.value === "False")) {
            return translatedFrom(literal.value, []);
        }
        if (literal.sort.is(Sort.Ref) && literal.value === "Null") {
            return translatedFrom("NULL", []);
        }
        if (literal.sort.is('Seq') && literal.value === "Nil") {
            return leftover(literal, "Empty seq not implemented", []);
        }
        if (literal.sort.is('Set') && literal.value === 'Ø') {
            return this.pred_call("empty_set", literal.sort, []);
        }
        if (literal.sort.is('Multiset') && literal.value === 'Ø') {
            return this.pred_call("empty_multiset", literal.sort, []);
        }
        if (literal.sort.is(Sort.Perm)) {
            if (literal.value === AlloyTranslator.WritePerm) {
                return translatedFrom(AlloyTranslator.WritePerm, []);
            } else if (literal.value === AlloyTranslator.NoPerm) {
                return translatedFrom(AlloyTranslator.NoPerm, []);
            }

            const freshName = this.env.getFreshVariable('perm', Sort.Perm);
            const parts = literal.value.split('/');
            parts.push(freshName);

            const call = "perm_new" + mkString(parts, '[', ", ", ']');
            return translatedFrom(freshName, [])
                    .withAdditionalFacts([call]);
        }

        Logger.error("Unexpected literal: " + literal);
        return leftover(literal, "Unexpected literal: " + literal, []);
    }

    visitSeqRanged(seqRanged: SeqRanged): TranslationRes {
        return this.pred_call('seq_ranged', getSort(seqRanged), [seqRanged.lhs, seqRanged.rhs]);
    }

    visitSeqSingleton(seqSingleton: SeqSingleton): TranslationRes {
        return this.pred_call('seq_singleton', getSort(seqSingleton), [seqSingleton.value]);
    }

    visitSeqUpdate(seqUpdate: SeqUpdate): TranslationRes {
        return this.pred_call('seq_update', getSort(seqUpdate), [seqUpdate.seq, seqUpdate.index, seqUpdate.value]);
    }

    visitSetSingleton(setSingleton: SetSingleton): TranslationRes {
        return this.pred_call("set_singleton", getSort(setSingleton), [setSingleton.value]);
    }

    visitMultiSetSingleton(multiSetSingleton: MultisetSingleton): TranslationRes {
        return this.pred_call("multiset_singleton", getSort(multiSetSingleton), [multiSetSingleton.value]);
    }

    visitLogicalWrapper(wrapper: LogicalWrapper): TranslationRes {
        const sort = getSort(wrapper.term);
        if (sort.is(Sort.Bool)) {
            const wrapped = wrapper.term.accept(this);
            if (wrapped.res) {
                return translatedFrom(`isTrue[${wrapped.res}]`, [wrapped]);
            } else {
                return leftover(wrapper, "Could not translate wrapped boolean term", wrapped.leftovers);
            }
        } else if (sort.is(Sort.Logical)) {
            return wrapper.term.accept(this);
        }

        return leftover(wrapper, "Unexpected sort in logical wrapper: " + sort, []);
    }

    visitBooleanWrapper(wrapper: BooleanWrapper): TranslationRes {
        const sort = getSort(wrapper.term);
        if (sort.is(Sort.Logical)) {
            const wrapped = wrapper.term.accept(this);
            if (wrapped.res) {
                return translatedFrom(`(${wrapped.res} => True else False)`, [wrapped]);
            } else {
                return leftover(wrapper, "Could not translate wrapped boolean term", wrapped.leftovers);
            }
        } else if (sort.is(Sort.Bool)) {
            return wrapper.term.accept(this);
        }

        return leftover(wrapper, "Unexpected sort in boolean wrapper: " + sort, []);
    }
}