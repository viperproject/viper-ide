import { AlloyModelBuilder } from "./AlloyModel";
import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, MagicWandChunk, HeapChunk } from "./Heap";
import { Logger } from "../logger";
import { VariableTerm, Unary, Literal, Term, Application, Binary } from "./Term";
import { getSort, Sort } from './Sort';
import { DebuggerError } from "../Errors";
import { Verifiable } from "./Verifiable";
import { TermTranslator } from "./TermTranslator";
import { StoreVariable } from "./StoreVariable";


export namespace Sig {
    export const Ref = 'Object';
    export const Int = 'Integer';
    export const Bool = 'Bool';
    export const Snap = 'Snap';

    export const Heap = 'Heap';
    export const Store = 'Store';
    export const Temp = 'Temp';

    export const SymbVal = 'SymbVal';
    export const Perm = 'Perm';
    export const WritePerm = 'W';
    export const ReadPerm = 'R';
    export const NoPerm = 'Z';
    export const Combine = 'Combine';
    export const Function = 'Fun';
    export const Inverse = 'Inv';
    export const PermFun = 'PermFun';
}

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
            return Sig.Store + '.' + sanitizeName(variable.id);
        }

        if (this.heapVariables.has(variable.id)) {
            return Sig.Heap + '.' + sanitizeName(variable.id);
        }

        if (variable.id.startsWith("$t") && this.introduceMissingTempVars) {
            const sanitized = sanitizeName(variable.id);
            this.tempVariables.set(sanitized, this.translate(variable.sort));
            return Sig.Temp + '.' + sanitized;
        }

        return undefined;
    }

    public declarationSignature(sort: Sort) {
        // TODO: Complete this
        if (sort.id === Sort.Int ||
                sort.id === Sort.Ref ||
                sort.id === Sort.Bool ||
                sort.id === Sort.Snap ||
                sort.id === Sort.UserSort) {
            return 'one ' + this.translate(sort);
        }
        if (sort.id === 'Set') {
            return 'set ' + this.translate(sort);
        }

        throw new DebuggerError(`Unexpected sort '${sort}'`);
    }

    public translate(sort: Sort) {
        if (sort.isRefLike()) {
            return Sig.Ref;
        }
        if (sort.id === Sort.Int) {
            return Sig.Int;
        }
        if (sort.id === Sort.Snap) {
            return Sig.Snap;
        }
        if (sort.id === Sort.Bool) {
            return Sig.Bool;
        }
        if (sort.id === Sort.Perm) {
            return Sig.Perm;
        }

        // TODO: sanititze names
        if (sort.id === "UserSort" && sort.elementsSort) {
            const userSort = sort.elementsSort.id;
            this.recordUserSort(userSort);
            return sort.elementsSort.id;
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

        mb.comment("Path Conditions");
        state.pathConditions.forEach(pc => AlloyTranslator.translatePathCondition(pc, mb, termTranslator));
        mb.blank();

        // Translate values and types that have been gathered during translation
        AlloyTranslator.encodeGatheredFacts(env, mb);

        AlloyTranslator.encodeReachabilityConstraints(env, mb);
        AlloyTranslator.encodeFailedSMTFact(verifiable, env, mb, termTranslator);

        return mb.build();
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
                storeDecls.push(name + ': ' + env.declarationSignature(v.sort));

                if (v.sort.isRefLike()) {
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

        mb.sig('one', Sig.Store, storeDecls, [variablesConstraint]);
        mb.blank();
    }

    private static emitPrelude(mb: AlloyModelBuilder) {
        mb.sig('abstract', Sig.SymbVal);
        mb.sig('', Sig.Snap + " extends " + Sig.SymbVal);
        mb.sig('', Sig.Int + " extends " + Sig.SymbVal, ['v: one Int']);

        mb.sig('abstract', Sig.Perm, [`num: one Int`, `denom: one Int`]);
        mb.sig('one', Sig.WritePerm + " extends " + Sig.Perm, [], [`num = 1`, `denom = 1`]);
        mb.sig('one', Sig.ReadPerm + " extends " + Sig.Perm, [], ['num > 0', 'num <= 1', 'num < denom']);
        mb.sig('one', Sig.NoPerm + " extends " + Sig.Perm, [], [`num = 0`, `denom = 1`]);
        mb.blank();

        // const perms = [Sig.WritePerm, Sig.ReadPerm, Sig.NoPerm];
        // mb.sig('one', perms.join(', ') + " extends " + Sig.Perm);
        // mb.blank();
    }

    private static encodeRefSignature(chunks: HeapChunk[], env: TranslationEnv, mb: AlloyModelBuilder, termTranslator: TermTranslator) {
        const objectMembers: string[] = [];
        const successors: Set<string> = new Set();

        chunks.forEach(hc => {
            if (hc instanceof FieldChunk) {
                env.recordField(hc.field);
                if (hc.sort.isRefLike()) {
                    successors.add(hc.field);
                }

                objectMembers.push(`${hc.field}: lone ${env.translate(hc.sort)}`);
                if (hc.snap instanceof VariableTerm) {
                    env.heapChunks.push(`${sanitizeName(hc.snap.id)}: one ${env.translate(hc.snap.sort)}`);
                    const rec = termTranslator.toAlloy(hc.receiver);
                    if (rec.res) {
                        env.heapConstraints.push(rec.res + '.' + hc.field + ' = ' + env.resolve(hc.snap));
                    } else {
                        Logger.warn("Could not translate field receiver: " + rec.leftovers.join("\n"));
                    }
                }
            } else if (hc instanceof QuantifiedFieldChunk) {
                env.recordField(hc.field);
                if (hc.sort.isRefLike()) {
                    successors.add(hc.field);
                }

                objectMembers.push(`${hc.field}: lone ${env.translate(hc.sort)}`);
            } else if (hc instanceof PredicateChunk) {
                if (hc.snap instanceof VariableTerm) {
                    env.heapChunks.push(`${sanitizeName(hc.snap.id)}: one ${env.translate(hc.snap.sort)}`);
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
        objectMembers.push("successors': set " + Sig.Ref);

        // Constraint on successors of objects
        const fieldsConstraint = "successors' = " + ((successors.size < 1) ? 'none' : [...successors].join(" + "));

        mb.sig('', 'Object extends SymbVal', objectMembers, [fieldsConstraint]);
        mb.blank();

        // mb.sig('one', Sig.PermFun, env.fields.map(f => `${f}: (Object -> one Perm)`));
        if (env.fields.length > 0) {
            mb.comment("Constraints on field permission/existence");
            env.fields.forEach(field => {
                mb.fact(`all o: Object | one o.${field} <=> ${Sig.Function}.${Sig.PermFun}_${field}[o] in (W + R)`);
            });
            mb.blank();
        }

        // The null reference
        mb.sig('lone', 'NULL in Object', [], ["successors' = none"]);
        mb.blank();
    }

    private static translateHeap(env: TranslationEnv, mb: AlloyModelBuilder, termTranslator: TermTranslator) {
        mb.sig('one', Sig.Heap, env.heapChunks);
        env.heapConstraints.forEach(c => mb.fact(c));
        mb.blank();

        Array.from(env.predicates.keys()).forEach(id => {
            const name = "pred_" + id;
            let preds = <PredicateChunk[]> env.predicates.get(id);
            let first = preds[0];
            const vars = 'args: ' + first.args.map(a => env.translate(getSort(a)!)).join(' one -> one ');

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
                const functionName = Sig.PermFun + "_" + chunk.field;
                const permFun = new Binary('==', 
                                           new Application(functionName, [chunk.receiver], new Sort('Perm')),
                                           chunk.perm);

                this.translatePathCondition(permFun, mb, termTranslator);

                // if (permFun.res) {
                //     mb.fact(permFun.res);
                // } else {
                //     mb.comment("!!! Non-translated permission");
                //     permFun.leftovers.forEach(l => {
                //         mb.comment(l.toString());
                //         Logger.warn(l.toStringWithChildren());
                //     });
                // }

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

    private static translatePathCondition(pc: Term, mb: AlloyModelBuilder, termTranslator: TermTranslator) {
        let body = termTranslator.toAlloy(pc);
        if (!body.res) {
            mb.comment("!!! Non-translated fact: ");
            mb.comment(body.leftovers.map(l => "    " + l.toString()).join("\n"));
            mb.blank();
            return;
        }

        // The translation of a fact might have introduces some variables and facts to constrain them.

        let facts = [body.res].concat(body.additionalFacts).join(" && ");
        if (body.quantifiedVariables.length > 0) {
            let vars = body.quantifiedVariables.join(", ");

            mb.comment(pc.toString());
            mb.fact(vars + " | " + facts);
        } else {
            mb.comment(pc.toString());
            mb.fact(facts);
        }

    }

    private static encodeGatheredFacts(env: TranslationEnv, mb: AlloyModelBuilder) {

        // NOTE: Inverse function, functions and temp variables are added to the Alloy model "at the bottom" because
        // we gather them mostly when traversing the path conditions. Alloy does not care for where the variables are
        // declared as long as they are.
        if (env.inverseFunctions.size > 0) {
            mb.comment("Inverse Functions");
            const members: string[] = [];
            for (let [name, sorts] of env.inverseFunctions) {
                members.push(name + ': (' + sorts.map(s => env.translate(s)).join(' -> ') + ')');
            }
            mb.sig('one', Sig.Inverse, members);
            mb.blank();
        }

        if (env.functions.size > 0) {
            mb.comment("Functions");
            const members: string[] = [];
            for (let [name, sorts] of env.functions) {
                members.push(name + ': (' + sorts.map(s => env.translate(s)).join(' -> ') + ')');
            }
            mb.sig('one', Sig.Function, members);
            mb.blank();
        }

        // Add signature for Combines only if we have found some in the path conditions and constrain its cardinality to
        // be at most the number we have found.
        if (env.totalCombines > 0) {
            mb.comment("Combine operations");
            mb.sig('abstract', Sig.Combine + ' extends ' + Sig.Snap,
                   ['left: one ' + Sig.SymbVal, 'right: one ' + Sig.SymbVal]);
            mb.fact(`#${Sig.Combine} <= ` + env.totalCombines);
            mb.blank();
        }

        if (env.userSorts.length > 0) {
            mb.comment("User sorts");
            env.userSorts.forEach(s => mb.sig('', s));  
            mb.blank();
        } 

        if (env.tempVariables.size > 0) {
            mb.comment("Temporary variables");
            const members: string[] = [];
            for(const [name, sort] of env.tempVariables) {
                members.push(name + ': one ' + sort);
            }
            mb.sig('one', Sig.Temp, members);
            mb.blank();
        }
    }

    private static encodeReachabilityConstraints(env: TranslationEnv, mb: AlloyModelBuilder) {
        const reachable = [Sig.Store + ".variables'.*successors'"];

        // If there are functions that return reference-like object, they have to be accounted in the constraint as
        // well, otherwise we may prevent Alloy from generating any Object.
        for (const [name, sorts] of env.functions) {
            if (sorts[sorts.length - 1].isRefLike()) { 
                const params = sorts.slice(0, -1).map(s => env.translate(s)).join(', ');
                reachable.push(Sig.Function + '.' + name + `[${params}]`);
            }
        }

        mb.comment("No object unreachable from the Store");
        mb.fact(Sig.Ref + " = " +  reachable.join(' + '));
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
}