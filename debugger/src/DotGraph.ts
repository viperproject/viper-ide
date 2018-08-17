import { Record } from './model/Record';
import { AlloyInstance } from './external';
import { AlloyTranslator } from './model/AlloyTranslator';
import { TranslationEnv } from './model/TranslationEnv';
import { VariableTerm, Literal, Lookup, Application } from './model/Term';
import { Logger } from './logger';
import { sanitize } from './model/TermTranslator';
import { Sort } from './model/Sort';
import { mkString } from './util';


function clean(s: string) {
    return sanitize(s.replace(/'$/, '').replace(/\$\d$/, ''));
}


export interface DotElem {
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
    constructor(readonly name: string, readonly label: Label) {
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
        return `${this.name} [${attrs.join(', ')}]`;
    }
}

class FunCall implements DotElem {
    public args: Map<number, string>;
    private res: string;

    constructor (readonly id: string, readonly name: string) {
        this.args = new Map();
        this.res = '';
    }

    public arg(index: number, value: string) {
        this.args.set(index, value);
    }

    public result(value: string) {
        this.res = value;
    }

    public toDotString() {
        let call = new DotGraph('cluster' + this.id.replace(/_/, ''), true);
        call.attr('label', `< <u>Function Call ${this.name}</u> >`);
        call.attr('style', 'solid');

        this.args.forEach((value, key) => {
            const id = this.id + '_arg_' + key;
            call.add(new Node(id, new Label(`arg${key} == ${value}`)));
        });

        if (this.res !== '') {
            const id = this.id + '_res';
            call.add(new Node(id, new Label(`result == ${this.res}`)));
        }

        return call.toDotString();

        // const argStrings = Array.from(this.args.keys()).sort().map(k => this.args.get(k));
        // let s = this.id + ' [label="' + this.name + mkString(argStrings, '(', ', ', ')') + '"]';
        // if (this.ret !== '') {
        //     s += ' == ' + this.ret;
        // }
        // return s;
    }
}

class Rel implements DotElem {

    constructor(readonly from: string, readonly to: string, readonly attributes?: string[]) {}

    toDotString() {
        if (this.attributes) {
            return `${this.from} -> ${this.to} ` + mkString(this.attributes, '[', ', ', ']');
        } else {
            return `${this.from} -> ${this.to}`;
        }
    }
}

export class DotGraph {
    private graphAttributes: string[];
    private nodeAttributes: string[];
    private edgeAttributes: string[];
    private elems: DotElem[];

    constructor(readonly name: string, readonly subgraph: boolean = false) {
        this.graphAttributes = [];
        this.nodeAttributes = [];
        this.edgeAttributes = [];
        this.elems = [];
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

    add(elem: DotElem) {
        this.elems.push(elem);
    }

    toString(): string {
        return this.toDotString();
    }

    toDotString(): string {
        return `${this.subgraph ? 'subgraph' : 'digraph'} ${this.name} {\n` +
            'compound = true;\n' +
            `graph [${this.graphAttributes.join(', ')}];\n` +
            `node [${this.nodeAttributes.join(', ')}];\n` +
            `edge [${this.edgeAttributes.join(', ')}];\n` +
            this.elems.map(e => e.toDotString()).join(';\n') +
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
        // graph.edgeAttr('fontsize', '11');

        let storeGraph = new DotGraph('clusterStore', true);
        storeGraph.attr('label', '< <u>Store</u> >');
        storeGraph.attr('labeljust', 'l');
        storeGraph.attr('style', 'dashed');
        storeGraph.attr('nodesep', '0.1');
        storeGraph.nodeAttr('color', '"#ffffff"');
        storeGraph.nodeAttr('fontcolor', '"#ffffff"');
        // storeGraph.nodeAttr('shape', 'none');
        storeGraph.edgeAttr('color', '"#ffffff"');
        storeGraph.edgeAttr('fontcolor', '"#ffffff"');

        let relations: Rel[] = [];

        const storeLabel = 'this/' + AlloyTranslator.Store;

        const storeRelations: Map<string, string> = new Map();
        const funCalls: Map<string, FunCall> = new Map();
        const signatureToAtom: Map<string, string> = new Map();
        const references: Set<string> = new Set();
        alloyInstance.atoms.forEach(atom => {
            if (atom.type === '{this/Ref}') {
                references.add(sanitize(atom.name));
            }
        });

        alloyInstance.signatures.forEach(sig => {
            sig.atoms.forEach(a => signatureToAtom.set(sanitize(sig.label).replace(/this\//, ''), sanitize(a)));

            if (sig.label === storeLabel) { 
                sig.fields.forEach(field => {
                    if (field.name !== "refTypedVars'") {
                        // Each field in the store has cardinality one and the first (zeroeth)
                        // element of the atom is the store itself
                        const val = field.atoms[0][1];
                        storeRelations.set(sanitize(field.name), sanitize(val));
                    }
                });
            } else if (sig.label.startsWith('this/fun_')) {
                sig.fields.forEach(field => {
                    const argName = field.name;
                    const isArg = argName.startsWith('a');
                    field.atoms.forEach(atom => {
                        const callName = clean(atom[0]);
                        const displayName = callName.replace(/^call_/, '').replace(/_\d$/, '');
                        const argValue = sanitize(atom[1]);

                        let call = funCalls.get(callName);
                        if (call === undefined) {
                            call = new FunCall(callName, displayName);
                            funCalls.set(callName, call);
                        }
                        if (isArg) {
                            call.arg(parseInt(argName.slice(1)), argValue);
                        } else {
                            call.result(argValue);
                        }
                    });
                });
            }
        });

        const funResult = (callName: string) => {
            const funSigName = 'this/' + callName.replace(/call/, 'fun').replace(/_\d$/, '');
            const funSig = alloyInstance.signatures.find(s => s.label === funSigName);
            if (funSig) {
                const atom = funSig.fields.find(f => f.name === 'ret')!.atoms.find(a => clean(a[0]) === callName);
                return atom![1];
            }
        };



        const neededHeapNodes: Set<string> = new Set();

        if (state.prestate) {
            state.prestate.store.forEach(v => {
                if (v.value instanceof VariableTerm && v.sort.is(Sort.Ref)) {
                    const atom = signatureToAtom.get(sanitize(v.value.id));
                    const nodeId = sanitize(v.name);
                    if (atom === "NULL_0") {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}: Ref == null`)));
                    } else if (atom !== undefined) {
                        storeGraph.add(new Node(nodeId, new Label(`${v.name}`)));
                        relations.push(new Rel(nodeId, atom));
                        neededHeapNodes.add(atom);
                    } else {
                        Logger.error("Atom was undefined");
                    }

                } else if (v.value instanceof VariableTerm) {
                    const nodeId = sanitize(v.value.id);
                    const value = storeRelations.get(nodeId);
                    storeGraph.add(new Node(nodeId, new Label(`${v.name}: ${v.sort} == ${value}`)));

                } else if (v.value instanceof Literal) {
                    const label = new Label(`${v.name}: ${v.sort} == ${v.value.toString()}`);
                    storeGraph.add(new Node(sanitize(v.name), label));

                // } else if (v.value instanceof Application && v.sort.is(Sort.Ref)) {
                //     // const callName = env.applicableToName.get(v.value);
                //     const res = funResult(callName!)!;
                //     const nodeId = sanitize(v.name);
                //     if (clean(res) !== 'NULL') {
                //         storeGraph.add(new Node(nodeId, new Label(v.name)));
                //         relations.push(new Rel(nodeId, sanitize(res)));
                //     } else {
                //         storeGraph.add(new Node(nodeId, new Label(`${v.name}: Ref == null`)));
                //     }
                //     relations.push(new Rel(nodeId, callName + "_res", ['style=dashed']));

                // } else if (v.value instanceof Application) {
                //     // const callName = env.applicableToName.get(v.value);
                //     const nodeId = sanitize(v.name);
                //     const label = new Label(`${v.name}: ${v.sort} == ${funResult(callName!)}`);
                //     storeGraph.add(new Node(nodeId, label));
                //     relations.push(new Rel(nodeId, callName + "_res", ['style=dashed']));

                } else if (v.value instanceof Lookup) {
                    storeGraph.add(new Node("lookup" + sanitize(v.value.field), new Label(`${v.name}: ${v.sort} (lookup)\\l`)));

                } else {
                    Logger.error(`Unexpected value type in store: ${v.value}`);
                }
            });
        }

        const fieldRelations: Set<string> = new Set();

        // const references: Set<string> = new Set();
        // alloyInstance.atoms.forEach(atom => {
        //     if (atom.type === '{this/NULL}' || atom.type === '{this/Ref}') {
        //         references.add(sanitize(atom.name));
        //     }
        // });

        // alloyInstance.signatures.forEach(sig => {
        //     if (sig.label === 'this/' + AlloyTranslator.Ref) {
        //         sig.fields.forEach(f => {
        //             if (f.name !== "refTypedFields'") {
        //                 f.atoms.forEach(rel => {
        //                     const from = sanitize(rel[0]);
        //                     const to = sanitize(rel[1]);
        //                     // const label = `<td port="${f.name}">${f.name}</td>`;
        //                     // const label = `<${f.name}> ${f.name}`;
        //                     fieldRelations.add(from);
        //                     fieldRelations.add(to);
        //                     // heapNodes.get(from)!.label.parts.push(label);
        //                     // relations.push(`${from}:${f.name} -> ${to}`);
        //                     relations.push(new Rel(from, to));
        //                 });
        //             }
        //         });
        //     } 
        // });

        funCalls.forEach(f => {
            f.args.forEach((value, key) => {
                if (references.has(value)) {
                    const argId = f.id + '_arg_' + key;
                    relations.push(new Rel(argId, value));
                }
            });
            storeGraph.add(f);
        });

        const refType = `{this/${AlloyTranslator.Ref}}`;
        let heapNodes: Set<Node> = new Set();
        alloyInstance.atoms.forEach(atom => {
            const name = sanitize(atom.name);
            // if (atom.type === refType && fieldRelations.has(name)) {
            if (atom.type === refType) {
                heapNodes.add(new Node(name, new Label()));
                // heapNodes.set(sanitize(atom.name), `[label="\\l"]`);
            // } else if (atom.type === nullType && fieldRelations.has(name)) {
            }
        });


        let heapGraph = new DotGraph('clusterHeap', true);
        heapGraph.attr('label', '< <u>Heap</u> >');
        // heapGraph.attr('labeljust', 'l');
        heapGraph.attr('style', 'dashed');
        // heapGraph.attr('nodesep', '0.1');
        heapGraph.nodeAttr('color', '"#ffffff"');
        heapGraph.nodeAttr('fontcolor', '"#ffffff"');
        heapGraph.nodeAttr('shape', 'record');
        heapGraph.edgeAttr('color', '"#ffffff"');
        heapGraph.edgeAttr('fontcolor', '"#ffffff"');
        
        if (heapNodes.size < 1) {
            const emtpyNode = new Node('heapEmpty', new Label(""));
            emtpyNode.attr('style', 'none');
            heapGraph.add(emtpyNode);
        } else {
            heapNodes.forEach((node, key) => {
                heapGraph.add(node);
                // heapGraph.add(`${key} [label="${node.label.toString()}"]`);
            });
        }

        graph.add(storeGraph);
        graph.add(heapGraph);

        relations.forEach(rel => graph.add(rel));

        return graph;
    }
}