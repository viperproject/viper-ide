'use strict';
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const Statement_1 = require('./Statement');
const DotGraph_1 = require('./DotGraph');
const Settings_1 = require('./Settings');
let graphviz = require("graphviz");
let NULL = "Null";
let TRUE = "True";
let FALSE = "False";
class HeapVisualizer {
    // private static addCluster(graph, label: string, style: string): any {
    //     let cluster = graph.addCluster("cluster_" + label);
    //     cluster.set("style", style);
    //     cluster.set("label", label);
    //     return cluster;
    // }
    // private static createEmptyGraph(): any {
    //     let emptyGraph = graphviz.digraph("G");
    //     emptyGraph.setNodeAttribut("shape", "record");
    //     emptyGraph.set("rankdir", "LR");
    //     this.setGraphColors(emptyGraph, this.getBgColor(), this.getForegroundColor());
    //     return emptyGraph;
    // }
    static getBgColor() {
        if (Settings_1.Settings.settings.darkGraphs) {
            return "#272822";
        }
        else {
            return "white";
        }
    }
    static getForegroundColor() {
        if (Settings_1.Settings.settings.darkGraphs) {
            return "white";
        }
        else {
            return "black";
        }
    }
    // //TODO: show execution Tree Around State
    // public static executionTreeAroundStateToDot(state: Statement) {
    //     let graph = this.createEmptyGraph();
    // }
    // public static heapToDot(state: Statement, showSymbolicValues: boolean, showConcreteValues: boolean, model: Model): string {
    //     let count = 0;
    //     try {
    //         let g = this.createEmptyGraph();
    //         let store = this.addCluster(g, "Store", "dotted");
    //         let heap = this.addCluster(g, "Heap", "dotted");
    //         let heapEmpty = true;
    //         //read all heap Chunks to find out all existing nodes in the heap,
    //         //gather information about fields
    //         let heapChunkFields = new Map<string, HeapChunk[]>();
    //         state.heap.forEach(heapChunk => {
    //             if (!heapChunk.parsed) {
    //                 Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name), LogLevel.Debug);
    //             }
    //             else if (heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
    //                 let receiver = heapChunk.name.receiver;
    //                 if (!heapChunkFields.has(receiver)) {
    //                     heapChunkFields.set(receiver, []);
    //                 }
    //                 heapChunkFields.get(receiver).push(heapChunk);
    //             }
    //         })
    //         //add all nodes with the appropriate fields to the heap
    //         heapChunkFields.forEach((fields: HeapChunk[], receiver: string) => {
    //             heapEmpty = false;
    //             let label = "<name>|";
    //             fields.forEach(chunk => {
    //                 label += this.getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) + "\\l";
    //             });
    //             //add heapChunk node
    //             let heapChunkNode = heap.addNode(receiver);
    //             heapChunkNode.set("label", label);
    //         });
    //         //populate the store and add pointers from store to heap
    //         let vars: Map<string, any> = new Map<string, any>();
    //         if (state.store.length == 0) {
    //             let dummyNode = store.addNode("store_dummy");
    //             dummyNode.set("color", this.getBgColor());
    //             dummyNode.set("fontcolor", this.getBgColor());
    //         } else {
    //             state.store.forEach(variable => {
    //                 //add variable node
    //                 let variableNode = store.addNode(variable.name);
    //                 vars.set(variable.name, variableNode);
    //                 let variableLabel = this.getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state);
    //                 variableNode.set("label", variableLabel);
    //                 //add pointer from local vars to heap if the heap chunk exists
    //                 if (heapChunkFields.has(variable.value)) {
    //                     g.addEdge(variable.name, variable.value)
    //                 }
    //             });
    //         }
    //         //add pointers inside heap
    //         //build Predicate nodes
    //         //build FunctionApplication nodes
    //         state.heap.forEach(heapChunk => {
    //             if (heapChunk.parsed && heapChunk.name.type == NameType.FieldReferenceName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
    //                 //add the adge only if the value is known to exist
    //                 if (heapChunkFields.has(heapChunk.value.raw)) {
    //                     let edge = heap.addEdge(heapChunk.name.receiver, heapChunk.value.raw);
    //                     edge.set("label", heapChunk.name.field);
    //                 }
    //             }
    //             else if (heapChunk.name.type == NameType.PredicateName || heapChunk.name.type == NameType.FunctionApplicationName) {
    //                 heapEmpty = false;
    //                 //add predicate subgraph
    //                 let predicateCluster = heap.addCluster("cluster_" + heapChunk.name.receiver + "_" + (++count));
    //                 predicateCluster.set("style", "bold");
    //                 let label = heapChunk.name.type == NameType.PredicateName ? "Predicate" : "Function call";
    //                 predicateCluster.set("label", label + " " + heapChunk.name.receiver)
    //                 //add parameters into predicate cluster
    //                 for (let i = 0; i < heapChunk.name.arguments.length; i++) {
    //                     let parameter = heapChunk.name.arguments[i];
    //                     let negated;
    //                     if (parameter.startsWith("!")) {
    //                         //parameter is a negated boolean
    //                         negated = "not";
    //                         parameter = parameter.substring(1, parameter.length);
    //                     }
    //                     let argumentNode = predicateCluster.addNode(`predicate_${count}_arg${i}`);
    //                     if (parameter === FALSE || parameter === TRUE || /^\d+(\.\d+)$/.test(parameter)) {
    //                         //if its a scalar value, add it directly into the Predicate
    //                         argumentNode.set("label", `arg${i} = ${negated ? "!" : ""}${parameter}`)
    //                     } else {
    //                         argumentNode.set("label", `arg ${i}`)
    //                         if (heapChunkFields.has(parameter)) {
    //                             this.addPredicateEdge(heap, parameter, argumentNode, negated);
    //                         } else {
    //                             //try to add edge from variable to predicate argument;
    //                             state.store.forEach(element => {
    //                                 if (element.value === parameter) {
    //                                     this.addPredicateEdge(heap, vars.get(element.name), argumentNode, negated);
    //                                 }
    //                             });
    //                             //try to add edge from field to predicate argument
    //                             state.heap.forEach(chunk => {
    //                                 if (chunk.name.type == NameType.FieldReferenceName && chunk.value.raw === parameter) {
    //                                     this.addPredicateEdge(heap, chunk.name.receiver, argumentNode, (negated ? "!" : "") + chunk.name.field);
    //                                 }
    //                             });
    //                         }
    //                     }
    //                 }
    //                 //add edge from Function Application to result
    //                 if (heapChunk.name.type == NameType.FunctionApplicationName && heapChunk.value.type == ValueType.ObjectReferenceOrScalarValue) {
    //                     let resultNode = predicateCluster.addNode(`predicate_${count}_result`)
    //                     resultNode.set("label", "Result");
    //                     if (!heapChunkFields.has(heapChunk.value.raw)) {
    //                         let resultValueNode = heap.addNode(heapChunk.value.raw);
    //                         resultValueNode.set("label", "<name>|");
    //                     }
    //                     let resultEdge = heap.addEdge(resultNode, heapChunk.value.raw);
    //                     if (heapChunk.name.field) {
    //                         resultEdge.set("label", heapChunk.name.field);
    //                     }
    //                 }
    //             }
    //         })
    //         //make the empty heap is shown
    //         if (heapEmpty) {
    //             let dummyNode = heap.addNode("heap_dummy");
    //             dummyNode.set("color", this.getBgColor());
    //             dummyNode.set("fontcolor", this.getBgColor());
    //         }
    //         return g.to_dot();
    //     } catch (e) {
    //         Log.error("Graphviz Error: " + e);
    //     }
    // }
    static heapToDotUsingOwnDotGraph(state, showSymbolicValues, showConcreteValues, model) {
        let count = 0;
        try {
            let graph = new DotGraph_1.DotGraph("G", this.getBgColor(), this.getForegroundColor(), "LR", "record");
            let store = graph.addCluster("store", "dotted", "Store");
            let heap = graph.addCluster("heap", "dotted", "Heap");
            let heapEmpty = true;
            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map();
            state.heap.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log_1.Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk.name), ViperProtocol_1.LogLevel.Debug);
                }
                else if (heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    let receiver = heapChunk.name.receiver;
                    if (!heapChunkFields.has(receiver)) {
                        heapChunkFields.set(receiver, []);
                    }
                    heapChunkFields.get(receiver).push(heapChunk);
                }
            });
            //add all nodes with the appropriate fields to the heap
            heapChunkFields.forEach((fields, receiver) => {
                heapEmpty = false;
                let label = "<name>|<fields>";
                fields.forEach(chunk => {
                    label += this.getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) + "\\l";
                });
                //add heapChunk node
                heap.addNode(receiver, label);
            });
            //populate the store and add pointers from store to heap
            let vars = new Map();
            if (state.store.length == 0) {
                let dummyNode = store.addNode("dummy", "", true);
            }
            else {
                state.store.forEach(variable => {
                    //add variable node
                    let variableLabel = this.getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state);
                    let variableNode = store.addNode(variable.name, variableLabel);
                    vars.set(variable.name, variableNode);
                    //add pointer from local vars to heap if the heap chunk exists
                    if (heapChunkFields.has(variable.value)) {
                        store.addEdge(store, variable.name, heap, variable.value, "", null, "name");
                    }
                });
            }
            //add pointers inside heap
            //build Predicate nodes
            //build FunctionApplication nodes
            state.heap.forEach(heapChunk => {
                if (heapChunk.parsed && heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heap, heapChunk.name.receiver, heap, heapChunk.value.raw, heapChunk.name.field, "fields");
                    }
                }
                else if (heapChunk.name.type == Statement_1.NameType.PredicateName || heapChunk.name.type == Statement_1.NameType.FunctionApplicationName) {
                    heapEmpty = false;
                    //add predicate subgraph
                    let label = heapChunk.name.type == Statement_1.NameType.PredicateName ? "Predicate" : "Function call";
                    let predicateCluster = heap.addCluster(heapChunk.name.receiver, "bold", label + " " + heapChunk.name.receiver);
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
                            let argumentNode = predicateCluster.addNode(`arg${i}`, `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        }
                        else {
                            let argumentNode = predicateCluster.addNode(`arg${i}`, `arg ${i}`);
                            if (heapChunkFields.has(parameter)) {
                                heap.addDashedEdge(heap, parameter, predicateCluster, argumentNode.name, negated);
                            }
                            else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        store.addDashedEdge(store, vars.get(element.name).name, predicateCluster, argumentNode.name, negated);
                                    }
                                });
                                //try to add edge from field to predicate argument
                                state.heap.forEach(chunk => {
                                    if (chunk.name.type == Statement_1.NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        store.addDashedEdge(heap, chunk.name.receiver, predicateCluster, argumentNode.name, (negated ? "!" : "") + chunk.name.field, "fields");
                                    }
                                });
                            }
                        }
                    }
                    //add edge from Function Application to result
                    if (heapChunk.name.type == Statement_1.NameType.FunctionApplicationName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                        let resultNode = predicateCluster.addNode('result', "Result");
                        if (!heapChunkFields.has(heapChunk.value.raw)) {
                            let resultValueNode = heap.addNode(heapChunk.value.raw, "<name>|<fields>");
                        }
                        let resultEdge = heap.addEdge(predicateCluster, resultNode.name, heap, heapChunk.value.raw, heapChunk.name.field, "name");
                    }
                }
            });
            //make the empty heap is shown
            if (heapEmpty) {
                let dummyNode = heap.addNode("heap_dummy", "", true);
            }
            return graph.toDot();
        }
        catch (e) {
            Log_1.Log.error("Graphviz Error: " + e);
        }
    }
    static getVariableLabel(variable, showSymbolicValues, showConcreteValues, model, state) {
        return this.getLabel(variable.name, variable.value, variable.concreteValue, showSymbolicValues, showConcreteValues, model, state);
    }
    static getHeapChunkLabel(chunk, showSymbolicValues, showConcreteValues, model, state) {
        return this.getLabel(chunk.name.field, chunk.value.raw, chunk.value.concreteValue, showSymbolicValues, showConcreteValues, model, state);
    }
    //the label consists of name and symbolic and concrete values if requested
    static getLabel(name, symbolicValue, concreteValue, showSymbolicValues, showConcreteValues, model, state) {
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
    // private static setGraphColors(graph, background: string, foreground: string) {
    //     graph.set("bgcolor", background);
    //     graph.set("color", foreground);
    //     graph.set("fontcolor", foreground);
    //     graph.setNodeAttribut("color", foreground);
    //     graph.setNodeAttribut("fontcolor", foreground);
    //     graph.setEdgeAttribut("color", foreground);
    //     graph.setEdgeAttribut("fontcolor", foreground);
    // }
    //TODO: could be optimized if needed using a hash map storing all variables with value null
    static isKnownToBeNull(symbolicValue, state, showConcreteValues, model) {
        if (symbolicValue === NULL)
            return true;
        for (let i = 0; i < state.pcs.length; i++) {
            let cond = state.pcs[i];
            if (cond.type == Statement_1.ConditionType.NullityCondition && cond.value && cond.lhs === symbolicValue) {
                return true;
            }
        }
        ;
        if (showConcreteValues) {
            if (model.values.has(symbolicValue)) {
                let concreteValue = model.values.get(symbolicValue);
                return concreteValue.toLowerCase() === NULL;
            }
        }
        return false;
    }
}
exports.HeapVisualizer = HeapVisualizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUUxQixnQ0FBaUMsaUJBQWlCLENBQUMsQ0FBQTtBQUNuRCw0QkFBaUcsYUFBYSxDQUFDLENBQUE7QUFFL0csMkJBQTRDLFlBQVksQ0FBQyxDQUFBO0FBQ3pELDJCQUF1QixZQUFZLENBQUMsQ0FBQTtBQUNwQyxJQUFJLFFBQVEsR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUM7QUFFbkMsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDO0FBQ2xCLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQztBQUNsQixJQUFJLEtBQUssR0FBRyxPQUFPLENBQUM7QUFFcEI7SUFFSSx3RUFBd0U7SUFDeEUsMERBQTBEO0lBQzFELG1DQUFtQztJQUNuQyxtQ0FBbUM7SUFDbkMsc0JBQXNCO0lBQ3RCLElBQUk7SUFFSiwyQ0FBMkM7SUFDM0MsOENBQThDO0lBQzlDLHFEQUFxRDtJQUNyRCx1Q0FBdUM7SUFDdkMscUZBQXFGO0lBQ3JGLHlCQUF5QjtJQUN6QixJQUFJO0lBRUosT0FBZSxVQUFVO1FBQ3JCLEVBQUUsQ0FBQyxDQUFDLG1CQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7WUFDL0IsTUFBTSxDQUFDLFNBQVMsQ0FBQztRQUNyQixDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ25CLENBQUM7SUFDTCxDQUFDO0lBQ0QsT0FBZSxrQkFBa0I7UUFDN0IsRUFBRSxDQUFDLENBQUMsbUJBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztZQUMvQixNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ25CLENBQUM7UUFBQyxJQUFJLENB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