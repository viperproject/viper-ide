import { AlloyModelBuilder } from "./AlloyModel";
import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, MagicWandChunk, HeapChunk } from "./Heap";
import { Logger } from "../logger";
import { VariableTerm, Unary, Literal, Term } from "./Term";
import { getSort, Sort } from './Sort';
import { DebuggerError } from "../Errors";
import { Verifiable } from "./Verifiable";
import { TermTranslator } from "./TermTranslator";
import { StoreVariable } from "./StoreVariable";


function sanitizeName(name: string) {
    return name.replace(/@/g, '_').replace(/\$/g, '');
}


export class TranslationEnv {

    public fields: string[];
    public predicates: Map<string, PredicateChunk[]>;

    // TODO: These two should be factored out somehow
    public heapChunks: string[];
    public heapConstraints: string[];

    private quantifiedVariables: Set<string>;
    private storeVariables: Set<string>;
    public heapVariables: Set<string>;
    public tempVariables: Map<string, string>;
    public inverseFunctions: Map<string, Sort[]>;
    public functions: Map<string, Sort[]>;
    public totalCombines: number;
    public introduceMissingTempVars: boolean = true;
    public userSorts: string[];

    constructor(readonly state: State) {
        this.fields = [];
        this.predicates = new Map();

        this.heapChunks = [];
        this.heapConstraints = [];

        this.storeVariables = new Set();
        this.heapVariables = new Set();
        this.quantifiedVariables = new Set();
        this.tempVariables = new Map();
        this.userSorts = [];

        state.store.forEach(v => {
            // We save the names of symbolic value for store variables
            if (v.value instanceof VariableTerm) {
                this.storeVariables.add(v.value.id);
            }

            if (!(v.value instanceof Literal || v.value instanceof VariableTerm)) {
                Logger.error("Unexpected store variable type: " + v.toString());
            }
        });

        state.heap.forEach(hc => {
            if (hc instanceof FieldChunk || hc instanceof PredicateChunk || hc instanceof MagicWandChunk) {
                if (hc.snap instanceof VariableTerm) {
                    this.heapVariables.add(hc.snap.id);
                }
            }
        });

        this.inverseFunctions = new Map();
        this.functions = new Map();
        this.totalCombines = 0;
    }

    public resolve(variable: VariableTerm): string | undefined {
        if (this.quantifiedVariables.has(variable.id)) {
            return variable.id;
        }

        if (this.storeVariables.has(variable.id)) {
            return 'Store.' + sanitizeName(variable.id);
        }

        if (this.heapVariables.has(variable.id)) {
            return 'Heap.' + sanitizeName(variable.id);
        }

        if (variable.id.startsWith("$t") && this.introduceMissingTempVars) {
            const sanitized = sanitizeName(variable.id);
            this.tempVariables.set(sanitized, this.sortToSignature(variable.sort));
            return 'Temp.' + sanitized;
        }

        return undefined;
    }

    public sortToSignature(sort: Sort) {
        if (sort.id === "Ref") {
            return "Object";
        }
        if (sort.id === "Set" && sort.elementsSort && sort.elementsSort.id === "Ref") {
            return "set Object";
        }
        if (sort.id === "Int") {
            return "Integer";
        }

        // TODO: sanititze names
        if (sort.id === "UserSort" && sort.elementsSort) {
            return sort.elementsSort.id;
        }
        if (sort.id === "Snap") {
            return "Snap";
        }
        // TODO: this is wrong
        if (sort.id === "Bool") {
            return "Bool";
        }

        throw new DebuggerError(`Unexpected sort '${sort}'`);
    }


    evaluateWithQuantifiedVariables<T>(vars: string[], f: () => T) {
        this.quantifiedVariables = new Set(vars);
        const res = f();
        this.quantifiedVariables = new Set();
        return res;
    }

    public recordInverseFunction(name: string, sorts: Sort[]) {
        if (!this.inverseFunctions.has(name)) {
            this.functions.set(name, sorts);
        }
    }

    public recordFunction(name: string, sorts: Sort[]) {
        if (!this.functions.has(name)) {
            this.functions.set(name, sorts);
        }
    }

    public recordCombine() {
        this.totalCombines += 1;
    }
    
    public recordUserSort(userSort: string) {
        this.userSorts.push(userSort);
    }

    public recordField(field: string) {
        this.fields.push(field);
    }
}

export class AlloyTranslator {

    // TODO: Seqs? Multisets?
    private static isRefLikeSort(sort: Sort): boolean {
        return sort.id === "Ref" ||
            (sort.id === "Seq" && sort.elementsSort !== undefined && this.isRefLikeSort(sort.elementsSort)) ||
            (sort.id === "Set" && sort.elementsSort !== undefined && this.isRefLikeSort(sort.elementsSort)) ||
            (sort.id === "Multiset" && sort.elementsSort !== undefined && this.isRefLikeSort(sort.elementsSort));
    }

    private static translateStore(vars: StoreVariable[], env: TranslationEnv, mb: AlloyModelBuilder) {
        const refTypedStoreVariables: string[] = [];
        const storeDecls: string[] = [];
        vars.forEach(v => {

            if (v.value instanceof Literal) {
                Logger.debug(`Ignoring literal store variable '${v.toString()}`);
                return;
            }

            if (v.value instanceof VariableTerm) {
                const name = sanitizeName(v.value.id);
                if (v.sort.id === 'Ref' && v.sort.elementsSort === undefined) {
                    storeDecls.push(`${name}: one Object`);
                } else if (v.sort.id === 'Set' && v.sort.elementsSort && v.sort.elementsSort.id === 'Ref') {
                    storeDecls.push(`${name}: set Object`);
                } else if (v.sort.id === 'Int') {
                    storeDecls.push(`${name}: one Integer`);
                } else if (v.sort.id === 'UserSort' && v.sort.elementsSort) {
                    const userSort = v.sort.elementsSort.id;
                    env.recordUserSort(userSort);
                    storeDecls.push(`${name}: one ${userSort}`);
                } else {
                    Logger.error(`Store variables of type '${v.sort}' are not implemented yet.`);
                }

                if (AlloyTranslator.isRefLikeSort(v.sort)) {
                    refTypedStoreVariables.push(name);
                }
            } else {
                Logger.error(`Unexpected store value type '${v.toString()}'`);
            }
        });

        // Add the 'variables' helper relation to keep track of all the objects that are reachable from the store
        storeDecls.push("variables': set SymbVal");
        const variablesConstraint = "variables' = " + (refTypedStoreVariables.length > 0
                                                           ? refTypedStoreVariables.join(" + ")
                                                           : 'none');

        mb.sig('one', 'Store', storeDecls, [variablesConstraint]);
        mb.blank();
    }

    private static emitPrelude(mb: AlloyModelBuilder) {
        mb.sig('abstract', 'SymbVal');
        mb.sig('', "Snap extends SymbVal");
        mb.sig('', "Integer extends SymbVal", ['v: one Int']);

        mb.sig('abstract', "Perm");
        mb.sig('one', "W, R, Z extends Perm");
        mb.blank();
    }

    private static encodeRefSignature(chunks: HeapChunk[], env: TranslationEnv, mb: AlloyModelBuilder, termTranslator: TermTranslator) {
        const objectMembers: string[] = [];
        const successors: Set<string> = new Set();

        chunks.forEach(hc => {
            if (hc instanceof FieldChunk) {
                env.recordField(hc.field);
                if (AlloyTranslator.isRefLikeSort(hc.sort)) {
                    successors.add(hc.field);
                }

                objectMembers.push(`${hc.field}: lone ${env.sortToSignature(hc.sort)}`);
                if (hc.snap instanceof VariableTerm) {
                    env.heapChunks.push(`${sanitizeName(hc.snap.id)}: one ${env.sortToSignature(hc.snap.sort)}`);
                    const rec = termTranslator.toAlloy(hc.receiver);
                    if (rec.res) {
                        env.heapConstraints.push(rec.res + '.' + hc.field + ' = ' + env.resolve(hc.snap));
                    } else {
                        Logger.warn("Could not translate field receiver: " + rec.leftovers.join("\n"));
                    }
                }
            } else if (hc instanceof QuantifiedFieldChunk) {
                env.recordField(hc.field);
                if (AlloyTranslator.isRefLikeSort(hc.sort)) {
                    successors.add(hc.field);
                }

                objectMembers.push(`${hc.field}: lone ${env.sortToSignature(hc.sort)}`);
            } else if (hc instanceof PredicateChunk) {
                if (hc.snap instanceof VariableTerm) {
                    env.heapChunks.push(`${sanitizeName(hc.snap.id)}: one ${env.sortToSignature(hc.snap.sort)}`);
                }
                // We store all predicates chunk in a map, based on their id
                const ps = env.predicates.get(hc.id);
                if (ps) {
                    ps.push(hc);
                } else {
                    env.predicates.set(hc.id, [hc]);
                }
            } else {
                Logger.error(`Heap chunk translation not implemented yet: '${hc}'`);
            }
        });
        objectMembers.push("successors': set Object");

        // Constraint on successors of objects
        const fieldsConstraint = "successors' = " + ((successors.size < 1) ? 'none' : [...successors].join(" + "));

        mb.sig('', 'Object extends SymbVal', objectMembers, [fieldsConstraint]);
        mb.blank();

        mb.sig('one', "PermF", env.fields.map(f => `${f}: (Object -> one Perm)`));
        if (env.fields.length > 0) {
            mb.comment("Constraints on field permission/existence");
            env.fields.forEach(field => {
                mb.fact(`all o: Object | one o.${field} <=> PermF.${field}[o] in (W + R)`);
            });
            mb.blank();
        }

        // The null reference
        mb.sig('lone', 'NULL in Object', [], ["successors' = none"]);
        mb.blank();
    }

    private static translateHeap(env: TranslationEnv, mb: AlloyModelBuilder, termTranslator: TermTranslator) {
        mb.sig('one', 'Heap', env.heapChunks);
        env.heapConstraints.forEach(c => mb.fact(c));
        mb.blank();

        Array.from(env.predicates.keys()).forEach(id => {
            const name = "pred_" + id;
            let preds = <PredicateChunk[]> env.predicates.get(id);
            let first = preds[0];
            const vars = 'args: ' + first.args.map(a => env.sortToSignature(getSort(a)!)).join(' one -> one ');

            mb.sig('', name, [vars]);
            preds.forEach(p => {
                const args: string[] = [];
                p.args.forEach(a => {
                    const translated = termTranslator.toAlloy(a);
                    if (translated.res) {
                        args.push(translated.res);
                    } else {
                        Logger.warn(translated.leftovers.join(',\n'));
                    }
                });
                mb.fact(`one p': ${name} | ` + args.join(' -> ') + " in p'.args");
            });
            mb.fact(`#${name} = ${preds.length}`);
            mb.blank();
        });
    }

    private static encodePermissions(chunks: HeapChunk[],
                                     env: TranslationEnv,
                                     mb: AlloyModelBuilder,
                                     termTranslator: TermTranslator) {
        chunks.forEach(chunk => {
            if (chunk instanceof FieldChunk) {
                const receiver = termTranslator.toAlloy(chunk.receiver);
                const perm = termTranslator.toAlloy(chunk.perm);

                if (perm.res && receiver.res) {
                    mb.fact(`PermF.${chunk.field}[${receiver.res}] = ${perm.res}`);
                } else {
                    mb.comment("!!! Non-translated permission");
                    perm.leftovers.forEach(l => {
                        mb.comment(l.toString());
                        Logger.warn(l.toStringWithChildren());
                    });
                }

            } else if (chunk instanceof QuantifiedFieldChunk) {
                env.evaluateWithQuantifiedVariables(['r'], () => {
                    const perm = termTranslator.toAlloy(chunk.perm);
                    if (!perm.res) {
                        mb.comment("!!! Non-translated permission");
                        perm.leftovers.forEach(l => {
                            mb.comment(l.toString());
                            Logger.warn(l.toStringWithChildren());
                        });
                    } else {
                        mb.fact(`all r: Object | PermF.${chunk.field}[r] = ${perm.res}`);
                    }
                });
            }
        });
        mb.blank();
    }

    private static translatePathConditions(pathConditions: Term[], mb: AlloyModelBuilder, termTranslator: TermTranslator) {
        pathConditions.forEach(pc => {
            let body = termTranslator.toAlloy(pc);
            if (!body.res) {
                mb.comment("!!! Non-translated fact: ");
                body.leftovers.forEach(l => {
                    mb.comment(l.reason + ": " + l.leftover.toString());
                    Logger.warn(l.toStringWithChildren());
                });
                mb.blank();
                return;
            }

            mb.comment(pc.toString());
            let fact = body.quantifiedVariables.concat([body.res]).join(" | ");
            fact = [fact].concat(body.additionalFacts).join(" && ");
            mb.fact(fact);
            mb.blank();
        });
    }

    private static translateInverseFunctions(env: TranslationEnv, mb: AlloyModelBuilder) {
        // NOTE: Inverse function, functions and temp variables are added to the Alloy model "at the bottom" because
        // we gather them mostly when traversing the path conditions. Alloy does not care for where the variables are
        // declared as long as they are.
        if (env.inverseFunctions.size > 0) {
            const invMembers: string[] = [];
            for (let [name, sorts] of env.inverseFunctions) {
                invMembers.push(name + ': (' + sorts.map(s => env.sortToSignature(s)).join(' -> ') + ')');
            }
            mb.sig('one', 'Inv', invMembers);
            mb.blank();
        }
    }

    private static translateFunctions(env: TranslationEnv, mb: AlloyModelBuilder) {
        if (env.functions.size > 0) {
            const funMembers: string[] = [];
            for (let [name, sorts] of env.functions) {
                funMembers.push(name + ': (' + sorts.map(s => env.sortToSignature(s)).join(' -> ') + ')');
            }
            mb.sig('one', 'Fun', funMembers);
            mb.blank();
        }
    }

    private static translateCombines(env: TranslationEnv, mb: AlloyModelBuilder) {
        // Add signature for Combines only if we have found some in the path conditions and constrain its cardinality to
        // be at most the number we have found.
        if (env.totalCombines > 0) {
            mb.sig('abstract', 'Combine extends Snap', ['left: one SymbVal', 'right: one SymbVal']);
            mb.fact('#Combine <= ' + env.totalCombines);
            mb.blank();
        }
    }

    private static translateUserSorts(env: TranslationEnv, mb: AlloyModelBuilder) {
        if (env.userSorts.length > 0) {
            env.userSorts.forEach(s => mb.sig('', s));  
            mb.blank();
        } 
    }

    private static translateTempVariables(env: TranslationEnv, mb: AlloyModelBuilder) {
        if (env.tempVariables.size > 0) {
            const members: string[] = [];
            for(const [name, sort] of env.tempVariables) {
                members.push(name + ': one ' + sort);
            }
            mb.sig('one', 'Temp', members);
            mb.blank();
        }
    }

    private static encodeReachabilityConstraints(env: TranslationEnv, mb: AlloyModelBuilder) {
        const refTypedFunctions: string[] = [];
        for (const [name, sorts] of env.functions) {
            if (AlloyTranslator.isRefLikeSort(sorts[sorts.length - 1])) {
                const params = sorts.slice(0, -1).map(s => env.sortToSignature(s)).join(', ');
                refTypedFunctions.push(`Fun.${name}[${params}]`);
            }
        }

        mb.comment("No object unreachable from the Store");
        if (refTypedFunctions.length > 0) {
            // If there are functions that return reference-like object, they have to be accounted in the constraint as
            // well, otherwise we may prevent Alloy from generating any Object.
            mb.fact("Object = Store.variables'.*successors' + " + refTypedFunctions.join(' + '));
        } else {
            // Restrict Object atoms to those reachable from the store
            mb.fact("Object = Store.variables'.*successors'");
        }
        mb.blank();
    }

    private static encodeFailedSMTFact(verifiable: Verifiable,
                                       env: TranslationEnv,
                                       mb: AlloyModelBuilder,
                                       termTranslator: TermTranslator) {
        // Note that the translation of this fact may not be posssible in statements earlier than the failing one. For
        // example, when the failing query refers to a variable that did not exist yet.
        if (verifiable.lastSMTQuery) {
            env.introduceMissingTempVars = false;
            const failedQuery = termTranslator.toAlloy(new Unary('!', verifiable.lastSMTQuery));
            if (failedQuery.res) {
                mb.comment("Last non-proved smt query");
                mb.fact(failedQuery.res);
                mb.blank();
            } else {
                Logger.debug('Could not translate last SMT query: ' + failedQuery.leftovers.join("\n"));
            }
        }
    }

    public static translate(verifiable: Verifiable, state: State): string {

        // The translation environment keeps track of the known variable names and the signature they belong to
        const env = new TranslationEnv(state);
        const mb = new AlloyModelBuilder();
        const termTranslator = new TermTranslator(env);

        this.emitPrelude(mb);
        AlloyTranslator.encodeRefSignature(state.heap, env, mb, termTranslator);
        AlloyTranslator.translateStore(state.store, env, mb);
        AlloyTranslator.translateHeap(env, mb, termTranslator);
        AlloyTranslator.encodePermissions(state.heap, env, mb, termTranslator);
        AlloyTranslator.translatePathConditions(state.pathConditions, mb, termTranslator);
        AlloyTranslator.translateInverseFunctions(env, mb);
        AlloyTranslator.translateFunctions(env, mb);
        AlloyTranslator.translateCombines(env, mb);
        AlloyTranslator.translateUserSorts(env, mb);
        AlloyTranslator.translateTempVariables(env, mb);
        AlloyTranslator.encodeReachabilityConstraints(env, mb);
        AlloyTranslator.encodeFailedSMTFact(verifiable, env, mb, termTranslator);

        return mb.build();
    }
}