'use strict';

import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';
import {Statement, NameType, ValueType, PermissionType} from './Statement'
let graphviz = require("graphviz");

export class HeapVisualizer {

    public static heapToDot(state: Statement): string {
        let count = 0;
        try {
            let g = graphviz.digraph("G");
            g.setNodeAttribut("shape", "record");
            g.set("rankdir", "LR");
            let store = g.addCluster("cluster_store");
            store.set("style", "dotted");
            store.set("label", "Store");
            let heap = g.addCluster("cluster_heap");
            heap.set("style", "dotted");
            heap.set("label", "Heap");

            //read all heap Chunks to find out all existing nodes in the heap
            let heapChunkFields = new Map<string, string[]>();
            state.heap.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name));
                }
                else {
                    if (heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                        let receiver = heapChunk.name.receiver;
                        if (!heapChunkFields.has(receiver)) {
                            heapChunkFields.set(receiver, []);
                        }
                        heapChunkFields.get(receiver).push(heapChunk.name.field);

                        //let edge = heap.addEdge(heapChunk.name.receiver + ":" + heapChunk.name.field, heapChunk.value.raw);
                        //Log.log("Draw edge from " + heapChunk.name.receiver + ":" + heapChunk.name.field + " to " + heapChunk.value.raw, LogLevel.Debug);
                    }
                }
            })

            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields: string[], receiver: string) => {
                let heapChunkNode = heap.addNode(receiver);
                let label = "<name>";
                fields.forEach(element => {
                    label += `|<${element}>${element}`;
                });
                heapChunkNode.set("label", label);
            });

            //populate the store and add pointers from store to heap
            let vars: Map<string, any> = new Map<string, any>();
            state.store.forEach(variable => {
                let variableNode = store.addNode(variable.name);
                vars.set(variable.name, variableNode);
                //set variable value
                variableNode.set("label", variable.name + " = " + variable.value);
                if (heapChunkFields.has(variable.value)) {
                    g.addEdge(variable.name, variable.value)
                }
            });

            //add pointers inside heap
            //also build Predicate nodes
            state.heap.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heapChunk.name.receiver, heapChunk.value.raw);
                        edge.set("label", heapChunk.name.field);
                    }
                }
                else if (heapChunk.name.type == NameType.PredicateName) {
                    //add predicate subgraph
                    let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver + "_" + (++count));
                    predicateCluster.set("style", "bold");
                    predicateCluster.set("label", "Predicate " + heapChunk.name.receiver)
                    //skip the fist argument (it's the snapshot argument)
                    for (let i = 1; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        let negated;
                        if (parameter.startsWith("!")) {
                            //we have a negated boolean
                            negated = "not";
                            parameter = parameter.substring(1, parameter.length);
                        }
                        if (parameter === "False" || parameter === "True" || /^\d+(\.\d+)$/.test(parameter)) {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i} = ${negated?"!":""}${parameter}`);
                            argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`)
                        } else {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg ${i}`);
                            argumentNode.set("label", `arg ${i}`)
                            if (heapChunkFields.has(parameter)) {
                                let edge = heap.addEdge(parameter, argumentNode)
                                this.configureEdge(edge,negated,"dashed");
                            } else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        let edge = heap.addEdge(vars.get(element.name), argumentNode);
                                        this.configureEdge(edge,negated,"dashed");
                                    }
                                });
                                //try to add edge from field to predicate argument
                                state.heap.forEach(chunk => {
                                    if (chunk.name.type == NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        let edge = heap.addEdge(chunk.name.receiver, argumentNode);
                                        this.configureEdge(edge,(negated?"!":"")+ chunk.name.field,"dashed");
                                    }
                                });
                            }
                        }
                    }
                }
            })

            return g.to_dot();
        } catch (e) {
            Log.error("Graphviz Error: " + e);
        }
    }

    private static configureEdge(edge, label?: string, style?: string) {
        if (style) {
            edge.set("style", style);
        }
        if (label) {
            edge.set("label", label);
        }
    }
    //   public static buildGraphVizExampleGraph() {
    //     try {
    //         let g = graphviz.digraph("G");
    //         let n1 = g.addNode("Hello", { "color": "blue" });
    //         n1.set("style", "filled");
    //         let e = g.addEdge(n1, "World");
    //         e.set("color", "red");
    //         g.addNode("World");
    //         g.addEdge(n1, "World");
    //         Log.log(g.to_dot(), LogLevel.Debug);
    //         g.setGraphVizPath("C:\\");
    //         g.output("png", "graphvizTest.png");
    //     } catch (e) {
    //         Log.error("Graphviz Error: " + e);
    //     }
    // }

    //     getHeapChunkVisualization(): string {
    //         let header = `digraph heap {
    // rankdir=LR
    // node [shape = record];

    // subgraph cluster_local {
    // graph[style=dotted]
    // label="Local"\n`;

    //         let intermediate = `}

    // subgraph cluster_heap{
    // graph[style=dotted]
    // label="heap"\n`;

    //         let footer: string = "}\n}\n";

    //         let localVars = "";
    //         this.store.forEach(variable => {
    //             localVars += `${variable.name} [label = "${variable.name}\nval: ${variable.value}""]\n`;

    //         });

    //         let heapChunks: string = "";
    //         this.heap.forEach(heapChunk => {
    //             if (heapChunk.parsed) {
    //                 heapChunks += `${heapChunk.name.raw} [label = "<name>${heapChunk.name.raw}|<next>next${heapChunk.value.raw ? "\nval: " + heapChunk.value.raw : ""}\n(${heapChunk.permission.raw})"]\n`;
    //                 if (heapChunk.value.raw) {
    //                     heapChunks += `${heapChunk.name.raw} -> ${heapChunk.value.raw}`;
    //                 }
    //             }
    //         });
    //         if (localVars != "" || heapChunks != "") {
    //             return header + localVars + intermediate + heapChunks + footer;
    //         } else {
    //             return null;
    //         }
    //     }

    //   n4 [label = "n4\nval: n4@24"]
    //   n [label = "node($t@34;$t@33)"]

    // 	n4_24 [label = "<name>$Ref!val!0|<next>next\nval: $t@27\n(W)"]
    // 	t_27 [label = "<name>$Ref!val!1|<next>next\nval: $t@29\n(W)"]
    // 	t_29 [label = "<name>$Ref!val!1|<next>next\nval: $t@31\n(W)"]
    // 	t_31 [label = "<name>$Ref!val!1|<next>next\n(W)"]
    // 	t_33 [label = "<name>$t@33\nval: $Ref!val!1|<next>next"]
    // 	t_34 [label = "<name>$t@34\nval: $Ref!val!1|<next>next"]

    // 	temp [label= "<name>|(W)"]

    // 	n -> temp:name
}





