import { Record } from './model/Record';
import { AlloyInstance } from './external';
import { AlloyTranslator } from './model/AlloyTranslator';
import { TranslationEnv } from './model/TranslationEnv';
import { VariableTerm, Literal, Lookup, Application } from './model/Term';
import { Logger } from './logger';
import { Sort } from './model/Sort';
import { mkString } from './util';
import { DebuggerError } from './Errors';


export function clean(name: string) {
    if (name === 'NULL$0') {
        return 'NULL';
    }

    if (name === 'boolean/True$0') {
        return 'true';
    }
    if (name === 'boolean/False$0') {
        return 'false';
    }

    return name.replace(/^\$/g, "")
               .replace(/[@[\]$]/g, "_");
}


export interface DotElem {
    readonly id: string;
    toDotString(): string;
}

class Label {
    public parts: string[];
    constructor(readonly label?: string) {
        this.parts = [];
        if (label !== undefined) {
            this.parts.push(label);
        } else {
            this.parts.push('');
        }
    }

    public toString() {
        if (this.parts.length > 1) {
            // const rows = this.parts.map(p => `<tr>${p}</tr>`).join('');
            // return `< <table border="0" cellborder="1" cellspacing="0">${rows}</table> >`;
            return this.parts.join(' | ');
        }
        return this.parts[0];
    }
}



class Node implements DotElem {
    private attributes: string[];
    constructor(readonly id: string, readonly label: Label) {
        this.attributes = [];
    }

    public attr(key: string, value: string) {
        this.attributes.push(key + '=' + value);
    }

    public toString(): string {
        return this.toDotString();
    }

    public toDotString() {
        const attrs = this.attributes.concat([`label="${this.label.toString()}"`]);
        return `${this.id} [${attrs.join(', ')}]`;
    }
}

class FunCall implements DotElem {
    public args: string[];
    private res: string | undefined;

    constructor (readonly id: string, readonly name: string) {
        this.args = [];
        this.res = undefined;
    }

    public arg(value: string) {
        this.args.push(value);
    }

    public result(value: string) {
        this.res = value;
    }

    public toDotString() {
        let call = new DotGraph('cluster' + this.id.replace(/_/, ''), true);
        call.attr('label', `< Fun Call <i>${this.name}</i> >`);
        call.attr('style', 'bold');

        const argsLabelParts: string[] = this.args.map((value, index) => {
            return `<arg${index}> ${value}`;
        });

        // this.args.forEach((value, key) => {
        //     const id = this.id + '_arg_' + key;
        //     call.add(new Node(id, new Label(`arg${key} == ${value}`)));
        // });

        if (this.res) {
            argsLabelParts.push(`<res> ${this.res}`);
        }

        // if (this.res !== '') {
        //     const id = this.id + '_res';
        //     call.add(new Node(id, new Label(`result == ${this.res}`)));
        // }
        
        const callNode = new Node(this.id, new Label(`{${argsLabelParts.join('|')}}`));
        call.add(callNode);

        return call.toDotString();

        // const argStrings = Array.from(this.args.keys()).sort().map(k => this.args.get(k));
        // let s = this.id + ' [label="' + this.name + mkString(argStrings, '(', ', ', ')') + '"]';
        // if (this.ret !== '') {
        //     s += ' == ' + this.ret;
        // }
        // return s;
    }
}

class Rel {

    constructor(readonly from: string, readonly to: string, readonly attributes?: string[]) {}

    public static info(from: string,  to: string, label: string) {
        return new Rel(from, to, [`label="${label}"`,
                                  'arrowhead=vee', 'style=dashed',
                                  'color="#777777"', 'fontcolor="#777777"']);
    }

    public static in(from: string,  to: string, label: string) {
        return new Rel(from, to, [`label="${label}"`,
                                  'arrowtail=vee', 'arrowhead=none', 'style=dashed', 'dir=back',
                                  'color="#777777"', 'fontcolor="#777777"']);
    }

    toDotString() {
        if (this.attributes) {
            return `${this.from} -> ${this.to} ` + mkString(this.attributes, '[', ', ', ']');
        } else {
            return `${this.from} -> ${this.to}`;
        }
    }
}

class SetViz {
    public elems: string[];
    constructor(readonly id: string) {
        this.elems = [];
    }
}

class SeqViz {
    public elems: Map<string, string>;
    constructor(readonly id: string) {
        this.elems = new Map();
    }
}

class MultisetViz {
    public elems: Map<string, string>;
    constructor(readonly id: string) {
        this.elems = new Map();
    }
}

class RefNode {
    private fields: Map<string, [string, Sort]>;
    constructor(readonly id: string) {
        this.fields = new Map();
    }

    public setField(fieldName: string, value: string, sort: Sort) {
        this.fields.set(fieldName, [value, sort]);
    }

    public toDotString() {
        if (this.fields.size > 0) {
            const relations: string[] = [];
            const labelParts: string[] = [];
            this.fields.forEach(([value, sort], field) => {
                if (sort.is(Sort.Ref)) {
                    if (value === 'NULL') {
                        labelParts.push(`<f${field}> ${field} == null`);
                    } else {
                        relations.push(`${this.id}:f${field}:e -> ${value}`);
                        labelParts.push(`<f${field}> ${field}`);
                    }
                } else {
                    labelParts.push(`<f${field}> ${field}: ${sort} == ${value}`);
                }
            });

            return [`${this.id} [label="${labelParts.join(' | ')}";]`].concat(relations).join('\n');
        } 

        return `${this.id} [label="";]`;
    }
}

class PredNode {
    private args: Map<string, string>;
    constructor(readonly id: string, readonly name: string) {
        this.args = new Map();
    }

    public setArg(arg: string, to: string) {
        this.args.set(arg, to);
    }

    public toDotString() {
        let call = new DotGraph('cluster' + this.id.replace(/_/, ''), true);
        call.attr('label', `< Pred <i>${this.name}</i> >`);
        call.attr('style', 'bold');

        const rels: Rel[] = [];
        this.args.forEach((value, key) => {
            const id = this.id + '_arg_' + key;
            if (value !== 'NULL') {
                call.add(new Node(id, new Label(`${key} == ${value}`)));
                rels.push(new Rel(value, id, ['style=dashed']));
            } else {
                call.add(new Node(id, new Label(`${key} == null`)));
            }
        });

        return call.toDotString() + rels.map(r => r.toDotString()).join('\n');
    }
}

export class DotGraph {
    private graphAttributes: string[];
    private nodeAttributes: string[];
    private edgeAttributes: string[];
    private elems: DotElem[];
    private relations: Rel[];

    constructor(readonly id: string, readonly subgraph: boolean = false) {
        this.graphAttributes = [];
        this.nodeAttributes = [];
        this.edgeAttributes = [];
        this.elems = [];
        this.relations = [];
    }

    attr(key: string, value: string) {
        this.graphAttributes.push(`${key}=${value}`);
    }

    nodeAttr(key: string, value: string) {
        this.nodeAttributes.push(`${key}=${value}`);
    }

    edgeAttr(key: string, value: string) {
        this.edgeAttributes.push(`${key}=${value}`);
    }

    hasNode(id: string) {
        return this.elems.some(e => e.id === id);
    }

    add(elem: DotElem) {
        this.elems.push(elem);
    }

    addRelation(rel: Rel) {
        this.relations.push(rel);
    }

    toString(): string {
        return this.toDotString();
    }

    toDotString(): string {
        return `${this.subgraph ? 'subgraph' : 'digraph'} ${this.id} {\n` +
            'compound = true;\n' +
            `graph [${this.graphAttributes.join(', ')}];\n` +
            `node [${this.nodeAttributes.join(', ')}];\n` +
            `edge [${this.edgeAttributes.join(', ')}];\n` +
            this.elems.map(e => e.toDotString()).join(';\n') +
            this.relations.map(e => e.toDotString()).join(';\n') +
            '}';
    }

    static from(state: Record, alloyInstance: AlloyInstance, env: TranslationEnv) {
        let graph = new DotGraph('G');
        graph.attr('bgcolor', 'none');
        graph.attr('rankdir', 'LR');
        graph.attr('color', '"#ffffff"');
        graph.attr('fontcolor', '"#ffffff"');
        graph.attr('fontname', '"Arial, Helvetica"');
        // graph.attr('newrank', 'true');
        graph.nodeAttr('shape', 'record');
        graph.nodeAttr('fontname', '"Arial, Helvetica"');
        graph.nodeAttr('fontsize', '11');
        graph.edgeAttr('color', '"#ffffff"');
        graph.edgeAttr('fontcolor', '"#ffffff"');
        graph.edgeAttr('fontname', '"Arial, Helvetica"');
        graph.edgeAttr('fontsize', '9');

        let storeGraph = new DotGraph('clusterStore', true);
        storeGraph.attr('label', '< <u>Store</u> >');
        storeGraph.attr('style', 'dotted');
        storeGraph.attr('nodesep', '0.1');
        storeGraph.nodeAttr('color', '"#ffffff"');
        storeGraph.nodeAttr('fontcolor', '"#ffffff"');
        storeGraph.edgeAttr('color', '"#ffffff"');
        storeGraph.edgeAttr('fontcolor', '"#ffffff"');

        let relations: Rel[] = [];

        const storeRelations: Map<string, string> = new Map();
        const funCalls: Map<string, FunCall> = new Map();
        const signatureToAtom: Map<string, string> = new Map();

        const references: Map<string, RefNode> = new Map();
        const predicates: Map<string, PredNode> = new Map();

        let nullInHeap = false;

        const sets: Map<string, SetViz> = new Map();
        const seqs: Map<string, SeqViz> = new Map();
        const multisets: Map<string, SeqViz> = new Map();

        alloyInstance.signatures.forEach(sig => {
            sig.atoms.forEach(a => signatureToAtom.set(clean(sig.label).replace(/this\//, ''), clean(a)));

            if (sig.label === 'this/' + AlloyTranslator.Store) { 
                sig.fields.forEach(field => {
                    if (field.name !== "refTypedVars'") {
                        // Each field in the store has cardinality one and the first (zeroeth)
                        // element of the atom is the store itself
                        const val = field.atoms[0][1];
                        storeRelations.set(clean(field.name.replace(/'$/, '')), clean(val));
                    }
                });
            
            } else if (sig.label === 'this/' + AlloyTranslator.Ref) {
                sig.fields.forEach((field) => {
                    if (field.name === "refTypedFields'") { return; }

                    const fieldSort = env.fields.get(field.name);
                    if (fieldSort === undefined) {
                        Logger.error("Could not determine field sort when producing graph.");
                        throw new DebuggerError("Could not determine field sort when producing graph.");
                    }

                    field.atoms.forEach((rel) => {
                        const from = clean(rel[0]);
                        const to = clean(rel[1]);
                        let ref = references.get(from);
                        if (ref === undefined) {
                            ref = new RefNode(from);
                            references.set(from, ref);
                        }
                        ref.setField(field.name, to, fieldSort);
                    });
                });

                sig.atoms.forEach(a => {
                    const name = clean(a);
                    if (name !== 'NULL' && !references.has(name)) {
                        references.set(name, new RefNode(name));
                    }
                });
            
            } else if (sig.label === 'this/Fun') {
                sig.fields.forEach((fun) => {
                    if (fun.name.startsWith('inv_')) {
                        return;
                    }

                    const funObj = env.functions.get(fun.name);

                    fun.atoms.forEach((tuple, index) => {
                        const args = tuple.slice(1, -1);
                        const result = clean(tuple.slice(-1)[0]);
                        const nodeId = fun.name + '_' + index;
                        const displayName = fun.name;

                        let call = funCalls.get(nodeId);
                        if (call === undefined) {
                            call = new FunCall(nodeId, displayName);
                            funCalls.set(nodeId, call);
                        }
                        args.forEach(a => call!.arg(clean(a)));
                        call.result(result);

                        if (funObj && funObj[1].is(Sort.Ref) && result !== 'NULL') {
                            relations.push(new Rel(nodeId, result));
                        }
                    });
                });



            } else if (sig.label.startsWith('this/pred_')) {
                sig.fields.forEach((field) => {
                    const argName = field.name;
                    field.atoms.forEach(atom => {
                        const predId = clean(atom[0]);
                        const predName = clean(atom[0].replace(/\$\d$/, '').replace(/^pred_/, ''));

                        let pred = predicates.get(predId);
                        if (pred === undefined) {
                            pred = new PredNode(predId, predName);
                            predicates.set(predId, pred);
                        }

                        pred.setArg(argName, clean(atom[1]));
                    });
                });


            } else if (sig.label === 'this/Set') {
                sig.atoms.forEach(a => {
                    const id = clean(a);
                    sets.set(id, new SetViz(id));
                });
                const elems = sig.fields.find(f => f.name === 'set_elems')!;
                elems.atoms.forEach(a => {
                    const id = clean(a[0]);
                    const to = clean(a[1]);
                    let set = sets.get(id)!;

                    if (to === 'NULL') {
                        nullInHeap = true;
                    }
                    set.elems.push(to);
                });

            } else if (sig.label === 'this/Seq') {
                const elems = sig.fields.find(f => f.name === 'seq_rel')!;
                sig.atoms.forEach(a => {
                    const id = clean(a);
                    seqs.set(id, new SeqViz(id));
                });
                elems.atoms.forEach(a => {
                    const id = clean(a[0]);
                    const index = clean(a[1]);
                    const to = clean(a[2]);
                    let seq = seqs.get(id)!;

                    if (to === 'NULL') {
                        nullInHeap = true;
                    }
                    seq.elems.set(index, to);
                });

            } else if (sig.label === 'this/Multiset') {
                const elems = sig.fields.find(f => f.name === 'ms_elems')!;
                sig.atoms.forEach(a => {
                    const id = clean(a);
                    multisets.set(id, new MultisetViz(id));
                });
                elems.atoms.forEach(a => {
                    const id = clean(a[0]);
                    const elem = clean(a[1]);
                    const count = clean(a[2]);
                    let ms = multisets.get(id)!;

                    if (elem === 'NULL') {
                        nullInHeap = true;
                    }
                    ms.elems.set(count, elem);
                });
            }
        });

        // const funResult = (callName: string) => {
        //     const funSigName = 'this/' + callName.replace(/call/, 'fun').replace(/_\d$/, '');
        //     const funSig = alloyInstance.signatures.find(s => s.label === funSigName);
        //     if (funSig) {
        //         const atom = funSig.fields.find(f => f.name === 'ret')!.atoms.find(a => clean(a[0].replace(/\$\d$/, '')) === callName);
        //         return atom![1];
        //     }
        // };

        const neededHeapNodes: Set<string> = new Set();

        if (state.prestate) {
            state.prestate.store.forEach(v => {
                const nodeId = 'store_' + clean(v.name);
                if (v.value instanceof VariableTerm && v.sort.is(Sort.Ref)) {
                    const atom = signatureToAtom.get(clean(v.value.id));
                    if (atom === "NULL") {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}: Ref == null`)));
                    } else if (atom !== undefined) {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}`)));
                        relations.push(new Rel(nodeId, atom));
                        neededHeapNodes.add(atom);
                    } else {
                        Logger.error("Atom was undefined");
                    }

                } else if (v.value instanceof VariableTerm) {
                    const value = storeRelations.get(v.name);

                    if (!value) {
                        Logger.error(`Could not find store value for '${v.name}' during graph generation.`);
                        return;
                    }

                    if (v.sort.is('Set') && v.sort.elementsSort!.is(Sort.Ref)) {
                        const setViz = sets.get(value);
                        if (!setViz) {
                            Logger.error(`Could not find set with id '${value}'`);
                            return;
                        }

                        storeGraph.add(new Node(nodeId, new Label(`${v.name}: ${v.sort}`)));
                    } else {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}: ${v.sort} == ${value}`)));
                    }

                } else if (v.value instanceof Literal) {
                    const label = new Label(`${v.name}: ${v.sort} == ${v.value.toString()}\\l`);
                    storeGraph.add(new Node(clean(v.name), label));

                } else if (v.value instanceof Application && v.sort.is(Sort.Ref)) {
                    const to = storeRelations.get(clean(v.name))!;
                    if (to === 'NULL') {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name} == NULL`)));
                    } else {
                        relations.push(new Rel(nodeId, to));
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}`)));
                    }

                
                // } else if (v.value instanceof Application && v.sort.is(Sort.Ref)) {
                //     // const callName = env.applicableToName.get(v.value);
                //     const res = funResult(callName!)!;
                //     const nodeId = clean(v.name);
                //     if (clean(res) !== 'NULL') {
                //         storeGraph.add(new Node(nodeId, new Label(v.name)));
                //         relations.push(new Rel(nodeId, clean(res)));
                //     } else {
                //         storeGraph.add(new Node(nodeId, new Label(`${v.name}: Ref == null`)));
                //     }
                //     relations.push(new Rel(nodeId, callName + "_res", ['style=dashed']));

                // } else if (v.value instanceof Application) {
                //     // const callName = env.applicableToName.get(v.value);
                //     const nodeId = clean(v.name);
                //     const label = new Label(`${v.name}: ${v.sort} == ${funResult(callName!)}`);
                //     storeGraph.add(new Node(nodeId, label));
                //     relations.push(new Rel(nodeId, callName + "_res", ['style=dashed']));

                } else if (v.value instanceof Lookup) {
                    // storeGraph.add(new Node(v.name +"_lookup_" + clean(v.value.field), new Label(`${v.name}: ${v.sort} (lookup)\\l`)));
                    const rel = storeRelations.get(v.name)!;
                    const nodeId = v.name +"_lookup_" + clean(v.value.field);

                    if (v.value.receiver instanceof VariableTerm) {
                        const ref = signatureToAtom.get(clean(v.value.receiver.id));
                        if (ref !== undefined) {
                            const field = v.value.field;
                            storeGraph.add(new Node(nodeId, new Label(`${v.name} == ${rel}\\l`)));
                            relations.push(Rel.info(nodeId, `${ref}:<f${field}>`, '.' + field));
                        } else {
                            storeGraph.add(new Node(nodeId, new Label(`${v.name}: (lookup) == ${rel}\\l`)));
                        }
                    } else {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}: (lookup) == ${rel}\\l`)));
                    }

                } else {
                    storeGraph.add(new Node(nodeId, new Label(`${v.name}: ${v.sort}\\l`)));
                }
            });
        }

        funCalls.forEach(f => {
            f.args.forEach((value, index) => {
                if (references.has(value)) {
                    const argId = f.id + ':arg' + index;

                    relations.push(Rel.info(argId, value, ''));
                }
            });
            storeGraph.add(f);
        });

        const refType = `{this/${AlloyTranslator.Ref}}`;
        let heapNodes: Set<Node> = new Set();
        alloyInstance.atoms.forEach(atom => {
            const name = clean(atom.name);
            if (atom.type === refType && relations.some(r => r.to === name)) {
                heapNodes.add(new Node(name, new Label()));
            }
        });


        let heapGraph = new DotGraph('clusterHeap', true);
        heapGraph.attr('label', '< <u>Heap</u> >');
        // heapGraph.attr('labeljust', 'l');
        heapGraph.attr('style', 'dotted');
        // heapGraph.attr('nodesep', '0.1');
        heapGraph.nodeAttr('color', '"#ffffff"');
        heapGraph.nodeAttr('fontcolor', '"#ffffff"');
        heapGraph.nodeAttr('shape', 'record');
        heapGraph.edgeAttr('color', '"#ffffff"');
        heapGraph.edgeAttr('fontcolor', '"#ffffff"');
        
        // TODO: also consider predicates
        if (references.size < 1) {
            const emtpyNode = new Node('heapEmpty', new Label(""));
            emtpyNode.attr('style', 'invis');
            heapGraph.add(emtpyNode);
        } else {
            references.forEach((refNode, _) => {
                heapGraph.add(refNode);
            });
        }
        if (nullInHeap) {
            const nullNode = new Node('NULL', new Label('NULL'));
            nullNode.attr('style', 'dashed');
            heapGraph.add(nullNode);
        }

        sets.forEach((setViz) => {
            // Find variables in the store the set elements belong to
            let targets: string[] = [];
            storeRelations.forEach((value, key) => {
                if (value === setViz.id) {
                    targets.push("store_" + key);
                }
            });
            // There are no varibles in the store that hold this set, it must be "stand-alone"
            if (targets.length === 0) {
                targets.push(setViz.id);
            }

            setViz.elems.forEach(e => {
                targets.forEach(t => relations.push(Rel.in(t, e, '∈')));
                if (!storeGraph.hasNode(e) && !heapGraph.hasNode(e)) {
                    storeGraph.add(new Node(e, new Label(e)));
                }
            });
            if (targets[0] === setViz.id) {
                const node = new Node(setViz.id, new Label(`${setViz.id}`));
                node.attr('style', 'bold');
                storeGraph.add(node);
            }
        });

        seqs.forEach((seqViz) => {
            let targets: string[] = [];
            storeRelations.forEach((value, key) => {
                if (value === seqViz.id) {
                    targets.push("store_" + key);
                }
            });
            if (targets.length === 0) {
                targets.push(seqViz.id);
            }

            seqViz.elems.forEach((e, index) => {
                targets.forEach(t => relations.push(Rel.in(t, e, `[${index}]`)));
                if (!storeGraph.hasNode(e) && !heapGraph.hasNode(e)) {
                    storeGraph.add(new Node(e, new Label(e)));
                }
            });
            if (targets[0] === seqViz.id) {
                const node = new Node(seqViz.id, new Label(`${seqViz.id}`));
                node.attr('style', 'bold');
                storeGraph.add(node);
            }
        });

        multisets.forEach((multisetViz) => {
            let targets: string[] = [];
            storeRelations.forEach((value, key) => {
                if (value === multisetViz.id) {
                    targets.push("store_" + key);
                }
            });

            multisetViz.elems.forEach((e, count) => {
                targets.forEach(t => relations.push(Rel.in(t, e, `#${count}`)));
                if (!storeGraph.hasNode(e) && !heapGraph.hasNode(e)) {
                    storeGraph.add(new Node(e, new Label(e)));
                }
            });
            if (targets[0] === multisetViz.id) {
                const node = new Node(multisetViz.id, new Label(`${multisetViz.id}`));
                node.attr('style', 'bold');
                storeGraph.add(node);
            }
        });

        predicates.forEach((predNode, _) => heapGraph.add(predNode));

        graph.add(storeGraph);
        graph.add(heapGraph);

        relations.forEach(rel => graph.addRelation(rel));

        return graph;
    }
}