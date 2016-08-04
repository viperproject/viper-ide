'use strict';

import {Log} from './Log';
import {Model} from './Model';
import {Position, LogLevel} from './ViperProtocol';
import {Statement, NameType, ValueType, PermissionType, ConditionType, HeapChunk} from './Statement';
import {Server} from './Server';
import {Settings} from './Settings';
let graphviz = require("graphviz");

let NULL = "Null";
let TRUE = "True";
let FALSE = "False";

export class HeapVisualizer {

    public static heapToDot(state: Statement, showSymbolicValues: boolean, showConcreteValues: boolean): string {
        let count = 0;
        try {
            let g = graphviz.digraph("G");
            g.setNodeAttribut("shape", "record");
            g.set("rankdir", "LR");
            if(Settings.settings.darkGraphs){
                g.set("bgcolor","#272822");
                g.set("color","white");
                g.set("fontcolor","white");
                g.setNodeAttribut("color","white");
                g.setNodeAttribut("fontcolor","white");
                g.setEdgeAttribut("color","white");
                g.setEdgeAttribut("fontcolor","white");
            }
            let store = g.addCluster("cluster_store");
            store.set("style", "dotted");
            store.set("label", "Store");
            let heap = g.addCluster("cluster_heap");
            heap.set("style", "dotted");
            heap.set("label", "Heap");

            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map<string, HeapChunk[]>();
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
                        heapChunkFields.get(receiver).push(heapChunk);

                        //let edge = heap.addEdge(heapChunk.name.receiver + ":" + heapChunk.name.field, heapChunk.value.raw);
                        //Log.log("Draw edge from " + heapChunk.name.receiver + ":" + heapChunk.name.field + " to " + heapChunk.value.raw, LogLevel.Debug);
                    }
                }
            })

            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields: HeapChunk[], receiver: string) => {
                let heapChunkNode = heap.addNode(receiver);
                let label = "<name>";
                fields.forEach(chunk => {
                    label += `|<${chunk.name.field}>${chunk.name.field}`;
                    let isValueNull = this.isKnownToBeNull(chunk.value.raw, state, showConcreteValues);
                    if (chunk.value.type != ValueType.NoValue && (showSymbolicValues || isValueNull)) {
                        label += " = " + (isValueNull ? NULL : chunk.value.raw);
                        if (showConcreteValues && chunk.value.concreteValue) {
                            label += "(=" + chunk.value.concreteValue + ")";
                        }
                    }
                });
                heapChunkNode.set("label", label);
            });

            //populate the store and add pointers from store to heap
            let vars: Map<string, any> = new Map<string, any>();
            state.store.forEach(variable => {
                let variableNode = store.addNode(variable.name);
                vars.set(variable.name, variableNode);
                //set variable value
                let variableValue = variable.name;
                //add symbolic and concrete values;
                let isValueNull = this.isKnownToBeNull(variable.value, state, showConcreteValues);
                if (variable.value && (showSymbolicValues || isValueNull)) {
                    variableValue += " = " + (isValueNull ? NULL : variable.value);
                    if (showConcreteValues && variable.concreteValue) {
                        variableValue += "(=" + variable.concreteValue + ")";
                    }
                }
                variableNode.set("label", variableValue);
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
                        if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i} = ${negated ? "!" : ""}${parameter}`);
                            argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`)
                        } else {
                            let argumentNode = predicateCluster.addNode(`predicate_${count}_arg ${i}`);
                            argumentNode.set("label", `arg ${i}`)
                            if (heapChunkFields.has(parameter)) {
                                let edge = heap.addEdge(parameter, argumentNode)
                                this.configureEdge(edge, negated, "dashed");
                            } else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        let edge = heap.addEdge(vars.get(element.name), argumentNode);
                                        this.configureEdge(edge, negated, "dashed");
                                    }
                                });
                                //try to add edge from field to predicate argument
                                state.heap.forEach(chunk => {
                                    if (chunk.name.type == NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        let edge = heap.addEdge(chunk.name.receiver, argumentNode);
                                        this.configureEdge(edge, (negated ? "!" : "") + chunk.name.field, "dashed");
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

    //TODO: could be optimized if needed using a hash map storing all variables with value null
    private static isKnownToBeNull(symbolicValue: string, state: Statement, showConcreteValues: boolean): boolean {
        if (symbolicValue === NULL) return true;
        for (let i = 0; i < state.conditions.length; i++) {
            let cond = state.conditions[i];
            if (cond.type == ConditionType.NullityCondition && cond.value && cond.lhs === symbolicValue) {
                return true;
            }
        };
        if (showConcreteValues) {
            //TODO: use counterexample model to determine more nullity conditions 
        }
        return false;
    }

    private static configureEdge(edge, label?: string, style?: string) {
        if (style) {
            edge.set("style", style);
        }
        if (label) {
            edge.set("label", label);
        }
    }
}





