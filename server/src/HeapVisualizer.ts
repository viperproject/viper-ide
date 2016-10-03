'use strict';

import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';
import {Variable, Statement, NameType, ValueType, PermissionType, ConditionType, HeapChunk} from './Statement';
import {Server} from './ServerClass';
import {DotNode, DotCluster, DotGraph} from './DotGraph';
import {Settings} from './Settings';
let graphviz = require("graphviz");

let NULL = "Null";
let TRUE = "True";
let FALSE = "False";

export class HeapVisualizer {

    private static getBgColor(): string {
        if (Settings.settings.advancedFeatures.darkGraphs) {
            return "#272822";
        } else {
            return "white";
        }
    }
    private static getForegroundColor(): string {
        if (Settings.settings.advancedFeatures.darkGraphs) {
            return "white";
        } else {
            return "black";
        }
    }

    // //TODO: show execution Tree Around State
    // public static executionTreeAroundStateToDot(state: Statement) {
    //     let graph = this.createEmptyGraph();
    // }

    public static heapToDotUsingOwnDotGraph(state: Statement, useOldHeap: boolean, showSymbolicValues: boolean, showConcreteValues: boolean, model: Model): string {
        let count = 0;
        try {
            //either select heap or oldHeap
            let heapChunks: HeapChunk[] = useOldHeap ? state.oldHeap : state.heap;

            let graph = new DotGraph("G", this.getBgColor(), this.getForegroundColor(), "LR", "record");

            let store = graph.addCluster("store", "dotted", "Store");
            let heap = graph.addCluster("heap", "dotted", "Heap");

            let heapEmpty = true;

            let allNodes: { variable: Variable, node: DotNode }[] = []

            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map<string, HeapChunk[]>();
            heapChunks.forEach(heapChunk => {
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
                if (Settings.settings.advancedFeatures.simpleMode) {
                    heap.addNode(receiver);
                } else {
                    heapEmpty = false;
                    let label = "<name>|<fields>";
                    fields.forEach(chunk => {
                        label += this.getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) + "\\l";
                    });
                    //add heapChunk node
                    heap.addNode(receiver, label);
                }
            });

            //populate the store
            let vars: Map<string, DotNode> = new Map<string, DotNode>();
            if (state.store.length > 0) {
                state.store.forEach((variable: Variable) => {
                    //add variable node
                    let variableLabel = this.getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state);
                    let variableNode = store.addNode(variable.name, variableLabel);
                    vars.set(variable.name, variableNode);
                    allNodes.push({ variable: variable, node: variableNode });
                });
            }

            //add pointers inside heap
            //build Predicate nodes
            //build FunctionApplication nodes
            heapChunks.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heap, heapChunk.name.receiver, heap, heapChunk.value.raw, heapChunk.name.field, "fields");
                    }
                }
                else if (heapChunk.name.type == NameType.PredicateName || heapChunk.name.type == NameType.FunctionApplicationName) {
                    heapEmpty = false;
                    //add predicate subgraph
                    let label = heapChunk.name.type == NameType.PredicateName ? "Predicate" : "";

                    let cluster: DotCluster;
                    if (heapChunk.name.type == NameType.PredicateName) {
                        cluster = heap.addCluster(heapChunk.name.receiver, "bold", "Predicate " + heapChunk.name.receiver);
                    } else {
                        cluster = store.addCluster(heapChunk.name.receiver, "bold", "Function call " + heapChunk.name.receiver);
                    }
                    //add parameters into predicate cluster
                    for (let i = 0; i < heapChunk.name.arguments.length; i++) {
                        let parameter = heapChunk.name.arguments[i];
                        let negated;
                        if (parameter.startsWith("!")) {
                            //parameter is a negated boolean
                            negated = "not";
                            parameter = parameter.substring(1, parameter.length);
                        }

                        if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
                            //if its a scalar value, add it directly into the Predicate
                            let argumentNode = cluster.addNode(`arg${i}`, `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        } else {
                            let argumentNode = cluster.addNode(`arg${i}`, `arg ${i}`);
                            if (heapChunkFields.has(parameter)) {
                                heap.addDashedEdge(heap, parameter, cluster, argumentNode.name, negated);
                            } else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        store.addDashedEdge(store, vars.get(element.name).name, cluster, argumentNode.name, negated);
                                    }
                                });
                                //try to add edge from field to predicate argument
                                heapChunks.forEach(chunk => {
                                    if (chunk.name.type == NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        store.addDashedEdge(heap, chunk.name.receiver, cluster, argumentNode.name, (negated ? "!" : "") + chunk.name.field, "fields");
                                    }
                                });
                            }
                        }
                    }
                    //add edge from Function Application to result
                    if (heapChunk.name.type == NameType.FunctionApplicationName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
                        //let resultNode = cluster.addNode('result', "Result")
                        if (!heapChunkFields.has(heapChunk.value.raw)) {
                            let resultNode: DotNode;
                            if (Settings.settings.advancedFeatures.simpleMode) {
                                resultNode = heap.addNode(heapChunk.value.raw, "");
                            } else {
                                resultNode = heap.addNode(heapChunk.value.raw, "<name>|<fields>" + (heapChunk.name.field || ""));
                            }

                        }
                        let resultEdge = heap.addEdgeFromCluster(cluster, heap, heapChunk.value.raw, null, "name", null, null);
                    }
                }
            })

            //add pointers from the store to the heap
            if (state.store.length > 0) {
                state.store.forEach((variable: Variable) => {
                    //add pointer from local vars to heap if the heap chunk exists
                    store.addEdge(store, variable.name, heap, variable.value, "", null, "name");
                });
            }

            if (!Settings.settings.advancedFeatures.simpleMode) {
                //add types for nodes with no outgoing arrows and no values
                allNodes.forEach((value: { variable: Variable, node: DotNode }, key) => {
                    if (!value.node.hasOutEdge && value.node.label.indexOf("=") < 0) {
                        value.node.label += value.variable.type ? ": " + value.variable.type : "";
                    }
                });
            }
            return graph.toDot();
        } catch (e) {
            Log.error("Graphviz Error: " + e);
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
        if (Settings.settings.advancedFeatures.simpleMode) return result;
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





