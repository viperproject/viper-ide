'use strict';

import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';
import {Variable, Statement, NameType, ValueType, PermissionType, ConditionType, HeapChunk} from './Statement';
import {Server} from './ServerClass';
import {Settings} from './Settings';
let graphviz = require("graphviz");

let NULL = "Null";
let TRUE = "True";
let FALSE = "False";

export class HeapVisualizer {

    private static addCluster(graph, label: string, style: string): any {
        let cluster = graph.addCluster("cluster_" + label);
        cluster.set("style", style);
        cluster.set("label", label);
        return cluster;
    }

    private static createEmptyGraph(): any {
        let emptyGraph = graphviz.digraph("G");
        emptyGraph.setNodeAttribut("shape", "record");
        emptyGraph.set("rankdir", "LR");
        this.setGraphColors(emptyGraph, this.getBgColor(), this.getForegroundColor());
        return emptyGraph;
    }

    private static getBgColor(): string {
        if (Settings.settings.darkGraphs) {
            return "#272822";
        } else {
            return "white";
        }
    }
    private static getForegroundColor(): string {
        if (Settings.settings.darkGraphs) {
            return "white";
        } else {
            return "black";
        }
    }

    // //TODO: show execution Tree Around State
    // public static executionTreeAroundStateToDot(state: Statement) {
    //     let graph = this.createEmptyGraph();
    // }

    public static heapToDot(state: Statement, showSymbolicValues: boolean, showConcreteValues: boolean, model: Model): string {
        let count = 0;
        try {
            let g = this.createEmptyGraph();

            let store = this.addCluster(g, "Store", "dotted");
            let heap = this.addCluster(g, "Heap", "dotted");

            let heapEmpty = true;

            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map<string, HeapChunk[]>();
            state.heap.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name), LogLevel.Debug);
                }
                else if (heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                    let receiver = heapChunk.name.receiver;
                    if (!heapChunkFields.has(receiver)) {
                        heapChunkFields.set(receiver, []);
                    }
                    heapChunkFields.get(receiver).push(heapChunk);
                }
            })

            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields: HeapChunk[], receiver: string) => {
                heapEmpty = false;
                let label = "<name>|";
                fields.forEach(chunk => {
                    label += this.getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) + "\\l";
                });
                //add heapChunk node
                let heapChunkNode = heap.addNode(receiver);
                heapChunkNode.set("label", label);
            });

            //populate the store and add pointers from store to heap
            let vars: Map<string, any> = new Map<string, any>();
            if (state.store.length == 0) {
                let dummyNode = store.addNode("store_dummy");
                dummyNode.set("color", this.getBgColor());
                dummyNode.set("fontcolor", this.getBgColor());
            } else {
                state.store.forEach(variable => {
                    //add variable node
                    let variableNode = store.addNode(variable.name);
                    vars.set(variable.name, variableNode);
                    let variableLabel = this.getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state);
                    variableNode.set("label", variableLabel);
                    //add pointer from local vars to heap if the heap chunk exists
                    if (heapChunkFields.has(variable.value)) {
                        g.addEdge(variable.name, variable.value)
                    }
                });
            }

            //add pointers inside heap
            //build Predicate nodes
            //build FunctionApplication nodes
            state.heap.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heapChunk.name.receiver, heapChunk.value.raw);
                        edge.set("label", heapChunk.name.field);
                    }
                }
                else if (heapChunk.name.type == NameType.PredicateName || heapChunk.name.type == NameType.FunctionApplicationName) {
                    heapEmpty = false;
                    //add predicate subgraph
                    let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver + "_" + (++count));
                    predicateCluster.set("style", "bold");
                    let label = heapChunk.name.type == NameType.PredicateName ? "Predicate" : "Function call";
                    predicateCluster.set("label", label + " " + heapChunk.name.receiver)
                    //add parameters into predicate cluster
                    for (let i = 0; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        let negated;
                        if (parameter.startsWith("!")) {
                            //parameter is a negated boolean
                            negated = "not";
                            parameter = parameter.substring(1, parameter.length);
                        }
                        let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i}`);
                        if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
                            //if its a scalar value, add it directly into the Predicate
                            argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`)
                        } else {
                            argumentNode.set("label", `arg ${i}`)
                            if (heapChunkFields.has(parameter)) {
                                this.addPredicateEdge(heap, parameter, argumentNode, negated);
                            } else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        this.addPredicateEdge(heap, vars.get(element.name), argumentNode, negated);
                                    }
                                });
                                //try to add edge from field to predicate argument
                                state.heap.forEach(chunk => {
                                    if (chunk.name.type == NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        this.addPredicateEdge(heap, chunk.name.receiver, argumentNode, (negated ? "!" : "") + chunk.name.field);
                                    }
                                });
                            }
                        }
                    }
                    //add edge from Function Application to result
                    if (heapChunk.name.type == NameType.FunctionApplicationName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                        let resultNode = predicateCluster.addNode(`predicate_${count}_result`)
                        resultNode.set("label", "Result");
                        if (!heapChunkFields.has(heapChunk.value.raw)) {
                            let resultValueNode = heap.addNode(heapChunk.value.raw);
                            resultValueNode.set("label", "<name>|");
                        }
                        let resultEdge = heap.addEdge(resultNode, heapChunk.value.raw);
                        if (heapChunk.name.field) {
                            resultEdge.set("label", heapChunk.name.field);
                        }
                    }
                }
            })

            //make the empty heap is shown
            if (heapEmpty) {
                let dummyNode = heap.addNode("heap_dummy");
                dummyNode.set("color", this.getBgColor());
                dummyNode.set("fontcolor", this.getBgColor());
            }

            return g.to_dot();
        } catch (e) {
            Log.error("Graphviz Error: " + e);
        }
    }

    private static addPredicateEdge(cluster, lhs, rhs, label: string) {
        let edge = cluster.addEdge(lhs, rhs);
        edge.set("style", "dashed");
        if (label) {
            edge.set("label", label);
        }
    }

    private static getVariableLabel(variable: Variable, showSymbolicValues: boolean, showConcreteValues: boolean, model: Model, state: Statement): string {
        return this.getLabel(variable.name, variable.value, variable.concreteValue, showSymbolicValues, showConcreteValues, model, state);
    }

    private static getHeapChunkLabel(chunk: HeapChunk, showSymbolicValues: boolean, showConcreteValues: boolean, model: Model, state: Statement): string {
        return this.getLabel(chunk.name.field, chunk.value.raw, chunk.value.concreteValue, showSymbolicValues, showConcreteValues, model, state);
    }

    //the label consists of name and symbolic and concrete values if requested
    private static getLabel(name: string, symbolicValue: string, concreteValue: string, showSymbolicValues: boolean, showConcreteValues: boolean, model: Model, state: Statement): string {
        let result = name;
        //add symbolic and concrete values;
        let isValueNull = this.isKnownToBeNull(symbolicValue, state, showConcreteValues, model);
        if (symbolicValue && (showSymbolicValues || isValueNull)) {
            result += " = " + (isValueNull ? NULL : symbolicValue);
            if (showConcreteValues && concreteValue) {
                result += "(=" + concreteValue + ")";
            }
        }
        return result;
    }

    private static setGraphColors(graph, background: string, foreground: string) {
        graph.set("bgcolor", background);
        graph.set("color", foreground);
        graph.set("fontcolor", foreground);
        graph.setNodeAttribut("color", foreground);
        graph.setNodeAttribut("fontcolor", foreground);
        graph.setEdgeAttribut("color", foreground);
        graph.setEdgeAttribut("fontcolor", foreground);
    }

    //TODO: could be optimized if needed using a hash map storing all variables with value null
    private static isKnownToBeNull(symbolicValue: string, state: Statement, showConcreteValues: boolean, model: Model): boolean {
        if (symbolicValue === NULL) return true;
        for (let i = 0; i < state.pcs.length; i++) {
            let cond = state.pcs[i];
            if (cond.type == ConditionType.NullityCondition && cond.value && cond.lhs === symbolicValue) {
                return true;
            }
        };
        if (showConcreteValues) {
            if (model.values.has(symbolicValue)) {
                let concreteValue = model.values.get(symbolicValue);
                return concreteValue.toLowerCase() === NULL;
            }
        }
        return false;
    }
}





