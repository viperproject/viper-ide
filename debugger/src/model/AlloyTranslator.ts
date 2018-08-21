import { AlloyModelBuilder } from "./AlloyModel";
import { State } from "./Record";
import { FieldChunk, QuantifiedFieldChunk, PredicateChunk, HeapChunk } from "./Heap";
import { Logger } from "../logger";
import { VariableTerm, Unary, Term, Application, Literal, LogicalWrapper, BooleanWrapper } from "./Term";
import { getSort, Sort } from './Sort';
import { Verifiable } from "./Verifiable";
import { TranslationEnv } from "./TranslationEnv";
import { TermTranslatorVisitor, sanitize, TranslationRes } from "./TermTranslator";
import * as fs from 'fs';
import { getAbsolutePath } from "../extension";
import { mkString } from "../util";


export class AlloyTranslator {

    // Signature name definitions, it makes it easier to change them all at once later.
    public static Ref = 'Ref';
    public static Null = 'NULL';
    public static Int = 'Int';
    public static Bool = 'Bool';
    public static Snap = 'Snap';
    public static Unit = 'Unit';
    public static Perm = 'Perm';
    public static WritePerm = 'W';
    public static NoPerm = 'Z';
    public static SigSeq = 'Seq';
    public static SigSet = 'Set';
    public static Multiset = 'Multiset';

    public static Heap = 'Heap';
    public static Store = 'Store';

    public static Combine = 'Combine';
    public static Function = 'Fun';
    public static PermFun = 'PermFun';
    public static Lookup = 'Lookup';
    public static PredLookup = 'PredLookup';

    private mb: AlloyModelBuilder;
    private termTranslator: TermTranslatorVisitor;

    public constructor(readonly verifiable: Verifiable,
                       readonly axioms: Term[],
                       readonly macros: Map<Application, Term>,
                       readonly state: State,
                       readonly env: TranslationEnv) {
        this.mb = new AlloyModelBuilder();
        this.termTranslator = new TermTranslatorVisitor(this.env);
    }

    public translate(): string {
        this.emitPrelude();

        this.env.recordInterestingFunctions = true;
        this.encodeRefSignature();
        this.translateStore();
        this.translateHeap(this.state.heap);
        this.encodePermissions(this.state.heap);

        this.env.recordInterestingFunctions = false;
        this.translateAxioms();
        this.env.recordInterestingFunctions = true;

        if (this.state.pathConditions.length > 0) {
            this.mb.comment("Path Conditions");
            this.state.pathConditions.forEach(pc => this.termToFact(pc));
            this.mb.blank();
        }
        this.env.recordInterestingFunctions = false;

        // Translate values and types that have been gathered during translation
        this.encodeGatheredFacts();
        this.encodeMacros();
        this.encodeReachabilityConstraints();
        this.encodeFailedSMTFact();
        this.encodeSignatureRestrictions();

        // TODO: Devise a formula for this
        const baseCount = 5 + this.env.storeVariables.size + this.env.functions.size + this.env.predicates.size + 3;
        const countPerInstance = new Map([
            // [AlloyTranslator.Combine, env.totalCombines],
            ['int', 4]
        ]);
            
        return this.mb.build(baseCount, countPerInstance);
    }

    /** Emits the definitions that never change in the model. */
    private emitPrelude() {
        const files = [
            ["Preamble", 'resources/preamble.als'],
            ["Perms", 'resources/perms.als'],
            ["Sets", 'resources/set_fun.als'],
            ["Seqs", 'resources/seq.als']
        ];

        files.forEach(p => {
            const [name, filename] = p;
            const path = getAbsolutePath(filename);
            this.mb.comment('='.repeat(5) + ` ${name} (${filename}) ` + '='.repeat(5));
            const lines = fs.readFileSync(path)
                            .toString()
                            .split('\n')
                            .filter(l => !l.trim().startsWith('--'))
                            .filter(l => l.trim() !== '');
            this.mb.text(lines.join('\n'));
        });
    }

    private encodeRefSignature() {

        const objectMembers: string[] = [];
        const successors: string[] = [];
        this.env.fields.forEach((sort, field) => {
            const sig = this.env.translate(sort);
            objectMembers.push(`${field}: lone ${sig}`);
            if (sig === AlloyTranslator.Ref) {
                successors.push(field);
            }
        });

        // Constraint on successors of objects
        objectMembers.push("refTypedFields': set " + AlloyTranslator.Ref);
        const fieldsConstraint = "refTypedFields' = " + ((successors.length < 1) ? 'none' : successors.join(" + "));

        this.mb.signature(AlloyTranslator.Ref)
            .withMembers(objectMembers)
            .withConstraint(fieldsConstraint);
        this.mb.blank();

        this.mb.oneSignature(AlloyTranslator.Null).extends(AlloyTranslator.Ref);

        const nullConstraints = [`${AlloyTranslator.Null}.refTypedFields' = none`];
        if (this.env.fields.size > 0) {
            for (const field of this.env.fields.keys()) {
                nullConstraints.push(`no ${AlloyTranslator.Null}.${field}`);
            }
        }
        this.mb.fact(nullConstraints.join(' && '));
        this.mb.blank();
    }

    private translateStore() {
        const refTypedStoreVariables: string[] = [];
        const store = this.mb.oneSignature(AlloyTranslator.Store);

        this.env.storeVariables.forEach((variable, rawName) => {
            const name = sanitize(rawName);
            const sig = this.env.translate(variable.sort);
            store.withMember(`${name}: one ${sig}`);

            // TODO: Do this via termToFact?
            let value: TranslationRes;
            if (variable.sort.is(Sort.Bool)) {
                value = new BooleanWrapper(variable.value).accept(this.termTranslator);
            } else {
                value = variable.value.accept(this.termTranslator);
            }
            if (value.res) {
                this.encodeFreshVariables();

                let fact = value.additionalFacts
                                .concat(`${AlloyTranslator.Store}.${name} = ${value.res}`)
                                .join(" && \n       ");
                this.mb.fact(fact);
            } else {
                Logger.error(`Could not translate store value for ${name}: ` + value.leftovers);
            }

            if (sig === AlloyTranslator.Ref) {
                refTypedStoreVariables.push(name);
            }
        });

        // Add a helper relation to keep track of all the objects that are reachable from the store
        store.withMember(`refTypedVars': set ${AlloyTranslator.Ref}`);
        store.withConstraint("refTypedVars' = " + (refTypedStoreVariables.length > 0
                                                           ? refTypedStoreVariables.join(" + ")
                                                           : 'none'));
        this.mb.blank();
    }

    private translateHeap(chunks: HeapChunk[]) {
        const heapChunks: Set<string> = new Set();
        const constraints: string[] = [];

        chunks.forEach(hc => {
            if (hc instanceof FieldChunk) {
                if (hc.snap instanceof VariableTerm) {
                    heapChunks.add(`${sanitize(hc.snap.id)}: lone ${this.env.translate(hc.snap.sort)}`);
                    const rec = hc.receiver.accept(this.termTranslator);
                    if (rec.res) {
                        constraints.push(rec.res + '.' + hc.field + ' = ' + this.env.resolve(hc.snap));
                    } else {
                        Logger.warn("Could not translate field receiver: " + rec.leftovers.join("\n"));
                    }
                } else if (hc.snap instanceof Literal) {
                    
                    const rec = hc.receiver.accept(this.termTranslator);
                    const lit = hc.snap.accept(this.termTranslator);

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
                    heapChunks.add(`${sanitize(hc.snap.id)}: lone ${this.env.translate(hc.snap.sort)}`);
                }
            } else if (hc instanceof QuantifiedFieldChunk) {
                hc.invAxioms.forEach(axiom => this.termToFact(axiom));
            } else {
                Logger.error(`Heap chunk translation not implemented yet: '${hc}'`);
            }
        });

        this.mb.oneSignature(AlloyTranslator.Heap).withMembers([...heapChunks.keys()]);
        constraints.forEach(c => this.mb.fact(c));
        this.mb.blank();

        Array.from(this.env.predicates.keys()).forEach(id => {
            const name = "pred_" + id;
            let preds = <PredicateChunk[]> this.env.predicates.get(id);
            let first = preds[0];
            const vars = first.args.map((value, index) => `arg${index}: one ${this.env.translate(getSort(value))}`);

            this.mb.signature(name).withMembers(vars);
            preds.forEach(p => {
                const args: string[] = [];
                p.args.forEach(a => {
                    const translated = a.accept(this.termTranslator);
                    if (translated.res) {
                        args.push(translated.res);
                    } else {
                        Logger.warn(translated.leftovers.join(',\n'));
                    }
                });
                this.mb.fact(`one p': ${name} | ` + args.map((v, idx) => `${v} = p'.arg${idx}`));
                // this.mb.fact(`one p': ${name} | ` + args.join(' -> ') + " in p'.args");
            });
            this.mb.fact(`#${name} = ${preds.length}`);
            this.mb.blank();
        });
    }

    private encodePermissions(chunks: HeapChunk[]) {
        // const chunksPerField: Map<string, HeapChunk[]> = new Map();
        // chunks.forEach(c => {
        //     if (c instanceof FieldChunk || c instanceof QuantifiedFieldChunk) {
        //         const chunks = chunksPerField.get(c.field);
        //         if (chunks !== undefined) {
        //             chunks.push(c);
        //         } else {
        //             chunksPerField.set(c.field, [c]);
        //         }
        //     }
        // });

        // chunksPerField.forEach((chunks, name) => {
        //     if ((chunks[0] instanceof FieldChunk && chunks.some(c => !(c instanceof FieldChunk))) ||
        //         (chunks[0] instanceof QuantifiedFieldChunk && chunks.some(c => !(c instanceof QuantifiedFieldChunk))) )
        //     {
        //         Logger.error(`Expected all chunks to be of the same type for field '${name}`);
        //     }

        //     if (chunks[0] instanceof FieldChunk) {
                
        //     } else if (chunks[0] instanceof QuantifiedFieldChunk) {


        //     }
        // });

        chunks.forEach(chunk => {
            // TODO: this should probably be unified per field
            if (chunk instanceof FieldChunk) {
                const functionName = `${AlloyTranslator.PermFun}.${chunk.field}`;
                this.env.recordPermFunction(chunk.field, getSort(chunk.snap));
                const rec = chunk.receiver.accept(this.termTranslator);
                const perm = chunk.perm.accept(this.termTranslator);
                const snap = chunk.snap.accept(this.termTranslator);

                if (rec.res && perm.res && snap.res) {
                    this.encodeFreshVariables();

                    const facts = rec.additionalFacts
                                     .concat(perm.additionalFacts)
                                     .concat(`${functionName}[${rec.res}, ${snap.res}] = ${perm.res}`)
                                     .join(" && \n       ");
                    this.mb.fact(facts);
                }

            } else if (chunk instanceof QuantifiedFieldChunk) {
                this.env.recordPermFunction(chunk.field, getSort(chunk.fieldValueFunction));
                const r = new VariableTerm('r', new Sort('Ref'));

                const perm = this.env.evaluateWithAdditionalVariables(
                    [r.id],
                    () => {
                        this.env.quantifierVariables = [r];
                        const perm = chunk.perm.accept(this.termTranslator);

                        if (!perm.res) {
                        }

                        this.env.quantifierVariables = undefined;
                        return perm;
                    });

                const fvf = chunk.fieldValueFunction.accept(this.termTranslator);
                if (perm.res && fvf.res) {
                    this.encodeFreshVariables();

                    const args = ['r', fvf.res];
                    const functionName = AlloyTranslator.PermFun + "." + chunk.field ;
                    const facts = perm.additionalFacts
                                     .concat(fvf.additionalFacts)
                                     .concat(`${perm.res} in ${functionName}` + mkString(args, '[', ', ', ']'))
                                     .join(" && \n       ");
                    this.mb.fact(`all r: ${this.env.translate(Sort.Ref)} | ${facts}`);
                }
                // this.termToFact(quant);
            }
        });
        this.mb.blank();
    }

    private translateAxioms() {
        if (this.axioms.length > 0) {
            this.mb.comment("Domain Axioms");
            this.axioms.forEach(a => this.termToFact(a));
            this.mb.blank();
        }
    }

    private termToFact(t: Term) {
        let body = new LogicalWrapper(t).accept(this.termTranslator);
        if (!body.res) {
            this.mb.comment("!!! Non-translated fact: ");
            this.mb.comment(body.leftovers.map(l => "    " + l.toString()).join("\n"));
            this.mb.blank();
            return;
        }

        this.mb.comment(t.toString());
        this.encodeFreshVariables();
        // The translation of a fact might have introduces some variables and facts to constrain them.
        let facts = body.additionalFacts
                        .concat(body.res)
                        .join(" && \n       ");
        // let facts = [body.res].concat(body.additionalFacts).join(" && ");
        if (body.quantifiedVariables.length > 0) {
            this.mb.fact(body.quantifiedVariables.concat(facts).join(" | "));
        } else {
            this.mb.fact(facts);
        }
    }

    private encodeFreshVariables() {
        this.env.variablesToDeclare.forEach((sort, name) => this.mb.oneSignature(name).in(this.env.translate(sort)));
        this.env.variablesToDeclare.clear();

        // Wrapped in an if to avoid increasing the counter when not needed
        if (this.env.recordedSignatures.size > 0) {
            this.env.recordedSignatures.forEach((sig, _) => this.mb.addSignature(sig));
            this.env.quantifiedSignatureCount += 1;
            this.env.recordedSignatures.clear();
        }
    }

    // NOTE: Inverse function, functions and temp variables are added to the Alloy model "at the bottom" because
    // we gather them mostly when traversing the path conditions. Alloy does not care for where the variables are
    // declared as long as they are.
    private encodeGatheredFacts() {

        if (this.env.permFunctions.size > 0) {

            const members: string[] = [];
            const fieldExistenceFacts: string[] = [];
            this.env.permFunctions.forEach((snapSort, field) => {
                const typeSigs = [
                    this.env.translate(Sort.Ref),
                    this.env.translate(snapSort),
                ];

                // Record function so it can be constrained later
                const funName = `${AlloyTranslator.PermFun}.${field}`;
                this.env.recordInstance(Sort.Perm, funName + mkString(typeSigs, '[', ', ', ']'));

                // Record the member
                typeSigs.push('set ' + this.env.translate(Sort.Perm));
                members.push(field + ': ' + mkString(typeSigs, '(', ' -> ', ')'));
                const f = `all fvf: ${this.env.translate(snapSort)}, r: Ref | { some p: PermFun.${field}[r, fvf] | p.num > 0 } => (one r.${field})`;
                fieldExistenceFacts.push(f);
            });

            this.mb.comment("Permission functions");
            this.mb.oneSignature(AlloyTranslator.PermFun).withMembers(members);
            fieldExistenceFacts.forEach(f => this.mb.fact(f));
            this.mb.blank();
        }

        if (this.env.functions.size > 0) {
            const members: string[] = [];
            this.mb.comment("Functions");
            for (let [name, [argSorts, retSort]] of this.env.functions) {
                // Add multiplicity of 'lone' to return type of function
                const tSorts = argSorts.map(s => this.env.translate(s));
                tSorts.push('lone ' + this.env.translate(retSort));

                members.push(name + ': (' + tSorts.join(' -> ') + ')');
            }
            this.mb.oneSignature(AlloyTranslator.Function).withMembers(members);
            this.mb.blank();
        }

        if (this.env.lookupFunctions.length > 0) {

            const fvfFacts = new Set<string>();
            const members = new Set<string>();
            this.env.lookupFunctions.forEach(([fvfSort, field]) => {
                const sorts = [fvfSort, Sort.Ref].map(s => this.env.translate(s));
                sorts.push('lone ' + this.env.translate(fvfSort.elementsSort!));
                members.add(`${field}: (${sorts.join(' -> ')})`);
                const funName = AlloyTranslator.Lookup + '.' + field;
                // const f = `all fvf: ${this.env.translate(fvfSort)}, r: Ref | r in mid[${funName}] && PermFun.${field}[r].num > 0 => ${funName}[fvf, r] = r.${field}`;
                // TODO: Should this be a double implication?
                const f = `all fvf: ${this.env.translate(fvfSort)}, r: Ref | { some p: PermFun.${field}[r, fvf] | p.num > 0 } => (one r.${field} && ${funName}[fvf, r] = r.${field})`;
                if (!fvfFacts.has(f)) {
                    fvfFacts.add(f);
                }
            });

            this.mb.comment("Lookup functions");
            this.mb.oneSignature(AlloyTranslator.Lookup)
                .withMembers(Array.from(members.values()));
            fvfFacts.forEach(f => this.mb.fact(f));
        }

        if (this.env.predLookupFunctions.length > 0) {
            const members = new Set<string>();
            this.env.predLookupFunctions.forEach(([pred, sorts]) => {

                const sigSorts = sorts.map(s => this.env.translate(s));
                // sigSorts.push('lone ' + this.env.translate(sorts[0].elementsSort!));
                sigSorts.push('lone ' + this.env.translate(sorts[0].elementsSort!));
                members.add(pred + ': ' + mkString(sigSorts, '(', ' -> ', ')'));
            });

            this.mb.comment("Predicate Lookup Functions");
            this.mb.oneSignature(AlloyTranslator.PredLookup)
                .withMembers(Array.from(members));
        }

        this.env.sortWrappers.forEach((sorts, name) => {
            const from = this.env.translate(sorts.from);
            const to = this.env.translate(sorts.to);
            this.mb.abstractSignature(name).extends(to)
                .withMember('v: lone ' + from);
            this.mb.fun(`pred ${name.toLowerCase()} [ from: ${from}, s: ${to} ] {
    s.v = from
}`);
        });
        this.mb.blank();

        if (this.env.userSorts.size > 0) {
            this.mb.comment("User sorts");
            this.env.userSorts.forEach(s => this.mb.signature(s));  
            this.mb.blank();
        } 

        if (this.env.sorts.size > 0) {
            this.mb.comment("Other sorts");
            this.env.sorts.forEach(([_, base, constraint], name) => {
                const sigName = base ? `${name} extends ${base}` : name;
                if (constraint !== undefined) {
                    this.mb.signature(sigName).withConstraint(constraint);
                } else {
                    this.mb.signature(sigName);
                }
            });
            this.mb.blank();
        }
    }

    private encodeMacros() {
        if (this.macros.size > 0 && this.env.neededMacros.size > 0) {
            this.mb.comment("Macros");
            this.macros.forEach((body, app) => {
                const sanitizedName = sanitize(app.applicable);

                // Only emit needed mactros
                if (!this.env.neededMacros.has(sanitizedName)) {
                    return;
                }

                const params = app.args.map(a => {
                    const translated = a.accept(this.termTranslator);
                    if (!translated.res) {
                        Logger.error("Could not translate macro argument: " + a);
                    }
                    return `${a}: ${this.env.translate(getSort(a))}`;
                });

                this.env.evaluateWithAdditionalVariables(
                    app.args.map(t => t.toString()),
                    () => {
                const tBody = body.accept(this.termTranslator);
                if (!tBody.res) {
                    Logger.error("Could not translate macro body: " + body);
                }

                this.encodeFreshVariables();
                this.mb.fact(tBody.additionalFacts.join(" && \n       "));
                const retSort = this.env.translate(app.sort);
        this.mb.fun(`fun ${sanitizedName} [ ${params.join(', ')} ]: ${retSort} {
    ${tBody.res}
}`);
                    });
                }
            );
        }
    }

    private encodeReachabilityConstraints() {
        const reachable = [ AlloyTranslator.Store + ".refTypedVars'.*refTypedFields'", AlloyTranslator.Null ]; 

        this.env.sortWrappers.forEach((sorts, name) => {
            if (sorts.from.is(Sort.Ref)) {
                reachable.push(`${name}.v`);
            }
        });

        // TODO: Account for other containers and nested containers
        this.env.sorts.forEach(([sort, base, constraint], name) => {
            if (sort.is('Set') && sort.elementsSort && sort.elementsSort.is(Sort.Ref)) {
                reachable.push(`${name}.elems`);
            }
        });

        // If there are functions that return reference-like object, they have to be accounted in the constraint as
        // well, otherwise we may prevent Alloy from generating any Object.
        for (const [name, [argSorts, retSort]] of this.env.functions) {
            // Inverse functions should not limit references
            if (name.startsWith('inv')) {
                continue;
            }
            const returnSig = this.env.translate(retSort);
            if (returnSig === AlloyTranslator.Ref) { 
                const params = argSorts.map(s => this.env.translate(s)).join(', ');
                reachable.push(AlloyTranslator.Function + '.' + name + `[${params}]`);
            }
        }

        this.mb.comment("No object unreachable from the Store");
        this.mb.fact(AlloyTranslator.Ref + " = " +  reachable.join(' + '));
        this.mb.blank();
    }

    private encodeFailedSMTFact() {
        // Note that the translation of this fact may not be posssible in statements earlier than the failing one. For
        // example, when the failing query refers to a variable that did not exist yet.
        if (this.verifiable.lastSMTQuery) {
            this.env.introduceMissingTempVars = false;
            let constraint: Term = this.verifiable.lastSMTQuery;
            if (constraint instanceof Unary && constraint.op === '!') {
                constraint = new LogicalWrapper(constraint.p);
            } else {
                constraint = new Unary('!', new LogicalWrapper(constraint));
            }
            const failedQuery = constraint.accept(this.termTranslator);
            if (failedQuery.res) {
                this.mb.comment("Constraint from last non-proved smt query");
                this.encodeFreshVariables();
                let facts = failedQuery.additionalFacts
                                       .concat(failedQuery.res)
                                       .join(" && \n       ");
                this.mb.fact(facts);
                this.mb.blank();
            } else {
                Logger.debug('Could not translate last SMT query: ' + failedQuery.leftovers.join("\n"));
            }
        }
    }

    private encodeSignatureRestrictions() {
        if (this.env.recordedInstances.size > 0) {
            this.mb.comment("Signarure Restrictions");

            this.env.recordInstance(Sort.Ref, AlloyTranslator.Null);
            this.env.recordInstance(Sort.Snap, AlloyTranslator.Unit);
            this.env.recordInstance(Sort.Perm, AlloyTranslator.WritePerm);
            this.env.recordInstance(Sort.Perm, AlloyTranslator.NoPerm);

            this.env.recordedInstances.forEach((names, sigName) => {
                if (sigName !== AlloyTranslator.Int && sigName !== AlloyTranslator.Bool && sigName !== AlloyTranslator.Ref) {
                    this.mb.fact(`${sigName} = ${names.join(" + ")}`);
                }
            });

            // TODO: Should account for empty sets.
            // TODO: Multiset
            const sort_sigs = [AlloyTranslator.SigSeq, AlloyTranslator.SigSet, AlloyTranslator.Perm, AlloyTranslator.Snap];
            sort_sigs.forEach(sigName => {
                if (!this.env.recordedInstances.has(sigName)) {
                    this.mb.fact(`${sigName} = none`);
                }
            });
            this.mb.blank();
        }
    }
}