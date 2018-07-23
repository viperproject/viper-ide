import { AlloyModelBuilder } from "./AlloyModel";
import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk } from "./Heap";
import { Logger } from "../logger";
import { VariableTerm, Literal, Unary } from "./Term";
import { getSort, Sort } from './Sort';
import { DebuggerError } from "../Errors";
import { Verifiable } from "./Verifiable";
import { TermTranslator } from "./TermTranslator";


export class TranslationEnv {
    private refTypedVariables: Set<string>;
    /** Maps symbolic values to the variable name used in the model. */
    private symbolicToVarNames: Map<string, string>;
    private quantifiedVariables: Set<string> | undefined;
    public functions: Map<string, Set<string>>;

    constructor(readonly state: State) {
        this.symbolicToVarNames = new Map();
        this.refTypedVariables = new Set();

        state.store.forEach(v => {
            if (v.sort === 'Ref' || v.sort === 'Set[Ref]') {
                this.refTypedVariables.add(v.name);
                this.symbolicToVarNames.set(v.value.toString(), `Store.${v.name}`);
            }
        });

        state.heap.forEach(heapChunk => {
            if (heapChunk instanceof FieldChunk) {
                // Field receivers that are not in the store, for example from (variable.next.next)
                let receiver = this.resolve(heapChunk.receiver.toString());
                if (receiver === undefined) {
                    throw new DebuggerError(`Could not retrive receiver for field '${heapChunk}'`);
                }

                if (heapChunk.snap instanceof VariableTerm) {
                    // Update references map now, it could save us some search later
                    this.symbolicToVarNames.set(heapChunk.snap.toString(), receiver + '.' + heapChunk.field);
                } else if (!(heapChunk.snap instanceof Literal)){
                    Logger.debug(`Non-literal field value '${heapChunk.snap}'`);
                }
            }
        });

        this.functions = new Map();
    }

    public resolve(symbValue: string): string | undefined {
        let v = this.symbolicToVarNames.get(symbValue);
        if (v !== undefined) {
            return v;
        }

        if (this.quantifiedVariables !== undefined && this.quantifiedVariables.has(symbValue)) {
            return symbValue;
        }

        let fieldRef: FieldChunk | undefined = undefined;
        for (const heapChunk of this.state.heap) {
            if (heapChunk instanceof FieldChunk && heapChunk.snap.toString() === symbValue)  {
                fieldRef = heapChunk;
            }
        }

        if (fieldRef !== undefined) {
            let rec = this.resolve(fieldRef.receiver.toString());
            if (rec !== undefined) {
                const val = rec + '.' + fieldRef.field;
                this.symbolicToVarNames.set(symbValue, val);
                return val;
            }
        }

        // Only log non-temp variables
        if (!symbValue.startsWith("$t")) {
            Logger.warn(`Name resolution undefined for '${symbValue}'`);
        }
        return undefined;
    }

    evaluateWithQuantifiedVariables<T>(vars: string[], f: () => T) {
        this.quantifiedVariables = new Set(vars);
        const res = f();
        this.quantifiedVariables = undefined;
        return res;
    }

    // TODO: We need to record the type of functions
    public recordFunction(namespace: string, name: string) {
        if (!this.functions.has(namespace)) {
            this.functions.set(namespace, new Set([name]));
        } else {
            this.functions.get(namespace)!.add(name);
        }
    }
}

export class AlloyTranslator {

    private env: TranslationEnv;

    constructor(readonly verifiable: Verifiable, readonly state: State) {
        this.env = new TranslationEnv(state);
    }

    // TODO: Seqs? Multisets?
    private static isRefLikeSort(sort: Sort): boolean {
        return sort.id === "Ref" ||
            (sort.id === "Set" && sort.elementsSort !== undefined && this.isRefLikeSort(sort.elementsSort));
    }

    private sortToSignature(sort: Sort) {
        if (sort.id === "Ref") {
            return "Object";
        }
        if (sort.id === "Set" && sort.elementsSort && sort.elementsSort.id === "Ref") {
            return "set Object";
        }
        if (sort.id === "Int") {
            return "Int";
        }
        throw new DebuggerError(`Unexpected sort '${sort}'`);
    }

    public translate(): string {
        const builder = new AlloyModelBuilder();

        let allVariables: string[] = [];
        let storeDecls: string[] = [];
        this.state.store.forEach(v => {
            // TODO: Do they ever appear in the path conditions?
            // Skip additional variables introduced by Silicon
            if (v.name.match(/v@\d+@\d+/)) {
                return;
            }

            if (v.sort === 'Ref') {
                storeDecls.push(`${v.name}: one Object`);
            } else if (v.sort === 'Set[Ref]') {
                storeDecls.push(`${v.name}: set Object`);
            } else {
                Logger.error(`Store variables of type '${v.sort} are not implemented yet.`);
                return;
            }
            allVariables.push(v.name);
        });
        storeDecls.push("variables': set Object");

        // TODO: Check if there are no variables?
        const variablesConstraint = "variables' = " + allVariables.join(" + ");

        builder.sig('one', 'Store', storeDecls, [variablesConstraint]);
        builder.blank();

        let allFields: Set<string> = new Set();
        let successors: Set<string> = new Set();

        const objectRelations: Set<string> = new Set();
        const predicates: Map<string, PredicateChunk[]> = new Map();

        this.state.heap.forEach(hc => {
            if (hc instanceof FieldChunk) {
                allFields.add(hc.field);
                if (AlloyTranslator.isRefLikeSort(hc.sort)) {
                    successors.add(hc.field);
                }

                objectRelations.add(`${hc.field}: lone ${this.sortToSignature(hc.sort)}`);
            } else if (hc instanceof QuantifiedFieldChunk) {
                allFields.add(hc.field);
                if (AlloyTranslator.isRefLikeSort(hc.sort)) {
                    successors.add(hc.field);
                }

                objectRelations.add(`${hc.field}: lone ${this.sortToSignature(hc.sort)}`);
            } else if (hc instanceof PredicateChunk) {
                // We store all predicates chunk in a map, based on their id
                const ps = predicates.get(hc.id);
                if (ps) {
                    ps.push(hc);
                } else {
                    predicates.set(hc.id, [hc]);
                }
            } else {
                Logger.error(`Heap chunk translation not implemented yet: '${hc}'`);
            }
        });
        objectRelations.add("successors': set Object");

        // Constraint on successors of objects
        const fieldsConstraint = "successors' = " + ((successors.size < 1) ? 'none' : [...successors].join(" + "));

        builder.sig('', 'Object', [...objectRelations], [fieldsConstraint]);
        builder.blank();

        // The null reference
        builder.sig('lone', 'NULL in Object', [], ["successors' = none"]);
        builder.blank();

        const termTranslator = new TermTranslator(this.env);

        Array.from(predicates.keys()).forEach(id => {
            const name = "pred_" + id;
            let preds = <PredicateChunk[]> predicates.get(id);
            let first = preds[0];
            const vars = 'args: ' + first.args.map(a => this.sortToSignature(getSort(a)!)).join(' one -> one');

            builder.sig('', name, [vars], []);
            preds.forEach(p => {
                builder.fact(`one p': ${name} | ` + p.args.map(termTranslator.toAlloy).join(' -> ') + " in p'.args");
            });
            builder.fact(`#${name} = ${preds.length}`);
            builder.blank();
        });

        // Restrict Object atoms to those reachable from the store
        builder.comment("No object unreachable from the Store");
        builder.fact("Object = Store.variables'.*successors'");
        builder.blank();

        builder.sig('one', "PermF", [...allFields].map(f => `${f}: (Object -> one Perm)`), []);
        builder.sig('abstract', "Perm", [], []);
        builder.sig('one', "W extends Perm", [], []);
        builder.sig('one', "R extends Perm", [], []);
        builder.sig('one', "Z extends Perm", [], []);
        builder.blank();

        if (allFields.size > 0) {
            builder.comment("Constraints on field permission/existence");
            allFields.forEach(field => {
                builder.fact(`all o: Object | one o.${field} <=> PermF.${field}[o] in (W + R)`);
            });
            builder.blank();
        }

        this.state.heap.forEach(chunk => {
            if (chunk instanceof FieldChunk) {
                const receiver = this.env.resolve((chunk.receiver as VariableTerm).id);
                const perm = termTranslator.toAlloy(chunk.perm);

                if (!perm.res) {
                    builder.comment("!!! Non-translated permission");
                    perm.leftovers.forEach(l => {
                        builder.comment(l.toString());
                        Logger.warn(l.toStringWithChildren());
                    });
                } else {
                    builder.fact(`PermF.${chunk.field}[${receiver}] = ${perm.res}`);
                }

            } else if (chunk instanceof QuantifiedFieldChunk) {
                this.env.evaluateWithQuantifiedVariables(['r'], () => {
                    const perm = termTranslator.toAlloy(chunk.perm);
                    if (!perm.res) {
                        builder.comment("!!! Non-translated permission");
                        perm.leftovers.forEach(l => {
                            builder.comment(l.toString());
                            Logger.warn(l.toStringWithChildren());
                        });
                    } else {
                        builder.fact(`all r: Object | PermF.${chunk.field}[r] = ${perm.res}`);
                    }
                });
            }
        });
        builder.blank();

        this.state.pathConditions.forEach(pc => {
            let body = termTranslator.toAlloy(pc);
            if (body.res) {
                builder.comment(pc.toString());
                builder.fact(body.res);
            } else {
                builder.comment("!!! Non-translated fact: ");
                body.leftovers.forEach(l => {
                    builder.comment(l.reason + ": " + l.leftover.toString());
                    Logger.warn(l.toStringWithChildren());
                });
            }
            builder.blank();
        });

        for (let [namespace, names] of this.env.functions) {
            builder.sig('one', namespace, [...names].map(n => `${n}: (Object one -> one Object)`), []);
        }
        builder.blank();

        // Note that the translation of this fact may not be posssible in statements earlier than the failing one. For
        // example, when the failing query refers to a variable that did not exist yet.
        if (this.verifiable.lastSMTQuery) {
            const failedQuery = termTranslator.toAlloy(new Unary('!', this.verifiable.lastSMTQuery));
            if (failedQuery.res) {
                builder.comment("Last non-proved smt query");
                builder.fact(failedQuery.res);
                builder.blank();
            }
        }

        return builder.build();
    }
}