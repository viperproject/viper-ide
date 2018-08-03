import { AlloyModelBuilder } from "./AlloyModel";
import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, HeapChunk } from "./Heap";
import { Logger } from "../logger";
import { VariableTerm, Unary, Term, Application, Binary, Quantification, Literal } from "./Term";
import { getSort, Sort } from './Sort';
import { Verifiable } from "./Verifiable";
import { TermTranslator, sanitize } from "./TermTranslator";
import { TranslationEnv } from "./TranslationEnv";


export namespace AlloyTranslator {

    // Signature name definitions, it makes it easier to change them all at once later.
    export const Ref = 'Ref';
    export const Null = 'NULL';
    export const Int = 'Int';
    export const Bool = 'Bool';
    export const Snap = 'Snap';
    export const Unit = 'Unit';
    export const SymbVal = 'SymbVal';
    export const Perm = 'Perm';
    export const WritePerm = 'W';
    export const NoPerm = 'Z';

    export const Heap = 'Heap';
    export const Store = 'Store';

    export const Combine = 'Combine';
    export const Function = 'Fun';
    export const PermFun = 'PermFun';

    export function translate(verifiable: Verifiable, axioms: Term[], state: State, env: TranslationEnv): string {

        // The translation environment keeps track of the known variable names and the signature they belong to
        const mb = new AlloyModelBuilder();
        const termTranslator = new TermTranslator(env);

        emitPrelude(mb);

        encodeRefSignature(env, mb);
        translateStore(env, mb, termTranslator);
        translateHeap(env, mb, termTranslator, state.heap);
        encodePermissions(state.heap, env, mb, termTranslator);

        mb.comment("Domain Axioms");
        axioms.forEach(a => {
            termToFact(a, mb, termTranslator);
            env.clearFreshNames();  // Not sure if this is needed
        });
        mb.blank();

        mb.comment("Path Conditions");
        state.pathConditions.forEach(pc => {
            termToFact(pc, mb, termTranslator);
            env.clearFreshNames();
        });
        mb.blank();

        // Translate values and types that have been gathered during translation
        encodeGatheredFacts(env, mb);

        encodeReachabilityConstraints(env, mb);
        encodeFailedSMTFact(verifiable, env, mb, termTranslator);

        // TODO: Devise a formula for this
        const baseCount = 5 + env.storeVariables.size + env.functions.size + env.predicates.size + 3;
        const countPerInstance = new Map([
            // [AlloyTranslator.Combine, env.totalCombines],
            ['int', 4]
        ]);
            
        return mb.build(baseCount, countPerInstance);
    }

    /** Emits the definitions that never change in the model. */
    function emitPrelude(mb: AlloyModelBuilder) {
        mb.text('open util/boolean');
        mb.abstractSignature(SymbVal);
        mb.signature(Snap).extends(SymbVal);
        mb.oneSignature(Unit).extends(Snap);
        mb.abstractSignature(Perm).extends(SymbVal).withMembers(['num: one Int', 'denom: one Int']).withConstraints([
            'num >= 0',
            'denom > 0',
            'num <= denom',
        ]);
        mb.oneSignature(WritePerm).in(Perm).withConstraints(['num = 1', 'denom = 1']);
        mb.oneSignature(NoPerm).in(Perm).withConstraints(['num = 0', 'denom = 1']);
        mb.blank();
    }

    function encodeRefSignature(env: TranslationEnv, mb: AlloyModelBuilder) {

        const objectMembers: string[] = [];
        const successors: string[] = [];
        env.fields.forEach((chunk, field) => {
            objectMembers.push(`${field}: lone ${env.translate(chunk.sort)}`);
            if (chunk.sort.isRefLike()) {
                successors.push(field);
            }
        });

        // Constraint on successors of objects
        objectMembers.push("refTypedFields': set " + Ref);
        const fieldsConstraint = "refTypedFields' = " + ((successors.length < 1) ? 'none' : successors.join(" + "));

        mb.signature(Ref).extends(SymbVal)
            .withMembers(objectMembers)
            .withConstraint(fieldsConstraint);
        mb.blank();

        if (env.fields.size > 0) {
            const permFuns: string[] = [];
            mb.comment("Constraints on field permission/existence");
            for (const field of env.fields.keys()) {
                const funName = `${Function}.${PermFun}_${field}`;
                permFuns.push(funName + `[${Ref}]`);
                mb.fact(`all o: ${Ref} | one o.${field} <=> ${Function}.${PermFun}_${field}[o].num > 0`);
                // mb.fact(`${funName}[${Null}] = none`);
            }

            // All permissions either come from the permission function or are zero.
            // Prevent Alloy from adding instances of permission that are not used for anything
            mb.fact(`${Perm} = ${permFuns.concat(NoPerm).join(' + ')}`);
            mb.blank();
        }

        // The null reference
        mb.loneSignature(Null).extends(Ref).withConstraint("refTypedFields' = none");
        mb.blank();
    }

    function translateStore(env: TranslationEnv, mb: AlloyModelBuilder, translator: TermTranslator) {
        const refTypedStoreVariables: string[] = [];
        const store = mb.oneSignature(Store);
        const constraints: string[] = [];

        env.storeVariables.forEach((variable, n) => {
            const name = `${n}'`;
            store.withMember(name + ': ' + env.declarationSignature(variable.sort));

            const value = translator.toAlloy(variable.value);
            if (value.res) {
                constraints.push(`${Store}.${name} = ${value.res}`);
            } else {
                Logger.error(`Could not translate store value for ${name}: ` + value.leftovers);
            }

            if (variable.sort.isRefLike()) {
                refTypedStoreVariables.push(name);
            }
        });

        // Add a helper relation to keep track of all the objects that are reachable from the store
        store.withMember(`refTypedVars': set ${SymbVal}`);
        store.withConstraint("refTypedVars' = " + (refTypedStoreVariables.length > 0
                                                           ? refTypedStoreVariables.join(" + ")
                                                           : 'none'));
        constraints.forEach(c => mb.fact(c));
        mb.blank();
    }

    function translateHeap(env: TranslationEnv, mb: AlloyModelBuilder, termTranslator: TermTranslator, chunks: HeapChunk[]) {
        const heapChunks: Set<string> = new Set();
        const constraints: string[] = [];

        chunks.forEach(hc => {
            if (hc instanceof FieldChunk) {
                if (hc.snap instanceof VariableTerm) {
                    heapChunks.add(`${sanitize(hc.snap.id)}: one ${env.translate(hc.snap.sort)}`);
                    const rec = termTranslator.toAlloy(hc.receiver);
                    if (rec.res) {
                        constraints.push(rec.res + '.' + hc.field + ' = ' + env.resolve(hc.snap));
                    } else {
                        Logger.warn("Could not translate field receiver: " + rec.leftovers.join("\n"));
                    }
                } else if (hc.snap instanceof Literal) {
                    
                    const rec = termTranslator.toAlloy(hc.receiver);
                    const lit = termTranslator.toAlloy(hc.snap);

                    if (!rec.res) {
                        Logger.error("Could not translate field receiver: " + rec.leftovers.join("\n"));
                        return;
                    }
                    if (!lit.res) {
                        Logger.error("Could not translate field literal: " + lit.leftovers.join("\n"));
                        return;
                    }
                    constraints.push(rec.res + "." + hc.field + " = " + lit.res);
                }
            } else if (hc instanceof PredicateChunk) {
                if (hc.snap instanceof VariableTerm) {
                    heapChunks.add(`${sanitize(hc.snap.id)}: one ${env.translate(hc.snap.sort)}`);
                }
            } else if (hc instanceof QuantifiedFieldChunk) {
                hc.invAxioms.forEach(axiom => termToFact(axiom, mb, termTranslator));
            } else {
                Logger.error(`Heap chunk translation not implemented yet: '${hc}'`);
            }
        });

        mb.oneSignature(Heap).withMembers([...heapChunks.keys()]);
        constraints.forEach(c => mb.fact(c));
        mb.blank();

        Array.from(env.predicates.keys()).forEach(id => {
            const name = "pred_" + id;
            let preds = <PredicateChunk[]> env.predicates.get(id);
            let first = preds[0];
            const vars = 'args: ' + first.args.map(a => env.translate(getSort(a))).join(' one -> one ');

            mb.signature(name).withMembers([vars]);
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

    function encodePermissions(chunks: HeapChunk[],
                               env: TranslationEnv,
                               mb: AlloyModelBuilder,
                               termTranslator: TermTranslator) {
        chunks.forEach(chunk => {
            if (chunk instanceof FieldChunk) {
                const functionName = PermFun + "_" + chunk.field;
                const permFun = new Binary('==', 
                                           new Application(functionName, [chunk.receiver], new Sort('Perm')),
                                           chunk.perm);

                termToFact(permFun, mb, termTranslator);

            } else if (chunk instanceof QuantifiedFieldChunk) {
                const r = new VariableTerm('r', new Sort('Ref'));
                const functionName = PermFun + "_" + chunk.field;
                const permFun = new Binary('==',
                                            new Application(functionName, [r], new Sort('Perm')),
                                            chunk.perm);
                const quant = new Quantification('QA', [r], permFun, null);

                termToFact(quant, mb, termTranslator);
            }
        });
        mb.blank();
    }

    function termToFact(pc: Term, mb: AlloyModelBuilder, termTranslator: TermTranslator) {
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
            // mb.comment(pc.toString());
            mb.fact(body.quantifiedVariables.concat(facts).join(" | "));
        } else {
            // mb.comment(pc.toString());
            mb.fact(facts);
        }
    }

    // NOTE: Inverse function, functions and temp variables are added to the Alloy model "at the bottom" because
    // we gather them mostly when traversing the path conditions. Alloy does not care for where the variables are
    // declared as long as they are.
    function encodeGatheredFacts(env: TranslationEnv, mb: AlloyModelBuilder) {

        if (env.functions.size > 0) {
            mb.comment("Functions");
            const members: string[] = [];
            for (let [name, sorts] of env.functions) {
                // Add multiplicity of 'lone' to return type of function
                const tSorts = sorts.map(s => env.translate(s));
                tSorts[tSorts.length - 1] = 'lone ' + tSorts[tSorts.length - 1];

                members.push(name + ': (' + tSorts.join(' -> ') + ')');
            }
            mb.oneSignature(Function).withMembers(members);
            mb.blank();
        }

        // Add signature for Combines only if we have found some in the path conditions and constrain its cardinality to
        // be at most the number we have found.
        mb.comment("Combine operations");
        mb.abstractSignature(Combine).extends(Snap).withMembers(
                ['left: one ' + SymbVal, 'right: one ' + SymbVal]);
        mb.blank();

        if (env.userSorts.size > 0) {
            mb.comment("User sorts");
            env.userSorts.forEach(s => mb.signature(s));  
            mb.blank();
        } 

        if (env.tempVariables.size > 0) {
            mb.comment("Temp variables");
            for(const [name, sort] of env.tempVariables) {
                mb.oneSignature(name).in(sort);
            }
            mb.blank();
        }
    }

    function encodeReachabilityConstraints(env: TranslationEnv, mb: AlloyModelBuilder) {
        const reachable = [ Store + ".refTypedVars'.*refTypedFields'" ];
        
        reachable.push(`(${Combine}.left :> ${Ref})`);
        reachable.push(`(${Combine}.right :> ${Ref})`);

        // If there are functions that return reference-like object, they have to be accounted in the constraint as
        // well, otherwise we may prevent Alloy from generating any Object.
        for (const [name, sorts] of env.functions) {
            if (sorts[sorts.length - 1].isRefLike()) { 
                const params = sorts.slice(0, -1).map(s => env.translate(s)).join(', ');
                reachable.push(Function + '.' + name + `[${params}]`);
            }
        }

        mb.comment("No object unreachable from the Store");
        mb.fact(Ref + " = " +  reachable.join(' + '));
        mb.blank();
    }

    function encodeFailedSMTFact(verifiable: Verifiable,
                                       env: TranslationEnv,
                                       mb: AlloyModelBuilder,
                                       termTranslator: TermTranslator) {
        // Note that the translation of this fact may not be posssible in statements earlier than the failing one. For
        // example, when the failing query refers to a variable that did not exist yet.
        if (verifiable.lastSMTQuery) {
            env.introduceMissingTempVars = false;
            let constraint: Term = verifiable.lastSMTQuery;
            if (constraint instanceof Unary && constraint.op === '!') {
                constraint = constraint.p;
            } else {
                constraint = new Unary('!', constraint);
            }
            const failedQuery = termTranslator.toAlloy(constraint);
            if (failedQuery.res) {
                mb.comment("Constraint from last non-proved smt query");
                mb.fact(failedQuery.res);
                mb.blank();
            } else {
                Logger.debug('Could not translate last SMT query: ' + failedQuery.leftovers.join("\n"));
            }
        }
    }
}