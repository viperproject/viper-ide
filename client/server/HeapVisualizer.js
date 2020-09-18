/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const Log_1 = require("./Log");
const ViperProtocol_1 = require("./ViperProtocol");
const Statement_1 = require("./Statement");
const DotGraph_1 = require("./DotGraph");
const Settings_1 = require("./Settings");
let NULL = "Null";
let TRUE = "True";
let FALSE = "False";
class HeapVisualizer {
    static getBgColor() {
        if (Settings_1.Settings.settings.advancedFeatures.darkGraphs) {
            return "#272822";
        }
        else {
            return "white";
        }
    }
    static getForegroundColor() {
        if (Settings_1.Settings.settings.advancedFeatures.darkGraphs) {
            return "white";
        }
        else {
            return "black";
        }
    }
    static executionTreeAroundStateToDot(state) {
        try {
            let graph = new DotGraph_1.DotGraph("G", this.getBgColor(), this.getForegroundColor(), "TB", "record");
            let cluster = graph.addCluster("executionTree", "invis", "Partial Execution Trace");
            //add current node
            let parent;
            if (state.parent) {
                parent = state.getClientParent();
                if (!parent) {
                    parent = state.verifiable.root;
                }
            }
            if (!parent) {
                parent = state;
            }
            this.addChildToExecutionTree(state.index, cluster, parent);
            return graph.toDot();
        }
        catch (e) {
            Log_1.Log.error("Graphviz Error building ExecutionTree: " + e);
        }
    }
    static addChildToExecutionTree(currentState, cluster, state, parentNode, showChildren = true) {
        if (!state)
            return;
        if (state.kind == "WellformednessCheck" || state.isTrivialState)
            return;
        //add node
        let currentLabel = state.toDotLabel();
        let currentNodeName = state.index + " " + currentLabel;
        let isCurrentState = currentState == state.index;
        let currentNode = cluster.addNode(currentNodeName, currentLabel, false, (isCurrentState ? "bold" : (state.canBeShownAsDecoration ? null : "dotted")));
        //addEdge
        if (parentNode) {
            cluster.addEdge(cluster, parentNode.name, cluster, currentNode.name);
        }
        //add children
        if (state.children && state.children.length > 0 && (!state.canBeShownAsDecoration || showChildren || isCurrentState)) {
            let firstChild = state.children[0];
            let lastChild = state.children[state.children.length - 1];
            if (firstChild.index > currentState || lastChild.index < currentState) {
                //only show firstChild
                this.addChildToExecutionTree(currentState, cluster, firstChild, currentNode, false);
                //add all structural nodes
                for (let i = 1; i < state.children.length; i++) {
                    let child = state.children[i];
                    if (!child.canBeShownAsDecoration) {
                        this.addChildToExecutionTree(currentState, cluster, child, currentNode, false);
                    }
                }
            }
            else {
                let currentStateIndex = -1;
                state.children.forEach((state, index) => {
                    if (state.index == currentState) {
                        currentStateIndex = index;
                    }
                });
                if (currentStateIndex >= 0) {
                    //current state is in children list
                    this.addChildToExecutionTree(currentState, cluster, state.children[currentStateIndex - 1], currentNode, false);
                    this.addChildToExecutionTree(currentState, cluster, state.children[currentStateIndex], currentNode, false);
                    this.addChildToExecutionTree(currentState, cluster, state.children[currentStateIndex + 1], currentNode, false);
                }
                else {
                    //show all children 
                    state.children.forEach(child => {
                        this.addChildToExecutionTree(currentState, cluster, child, currentNode, false);
                    });
                }
            }
        }
    }
    static heapToDotUsingOwnDotGraph(state, useOldHeap, showSymbolicValues, showConcreteValues, model) {
        let count = 0;
        try {
            //either select heap or oldHeap
            let heapChunks = useOldHeap ? state.oldHeap : state.heap;
            let graph = new DotGraph_1.DotGraph("G", this.getBgColor(), this.getForegroundColor(), "LR", "record");
            let store = graph.addCluster("store", "dotted", "Store");
            let heap = graph.addCluster("heap", "dotted", "Heap");
            let heapEmpty = true;
            let allNodes = [];
            //read all heap Chunks to find out all existing nodes in the heap,
            //gather information about fields
            let heapChunkFields = new Map();
            heapChunks.forEach(heapChunk => {
                if (!heapChunk.parsed) {
                    Log_1.Log.log("Warning, I don't know how to visualize the heap chunk " + JSON.stringify(heapChunk), ViperProtocol_1.LogLevel.Debug);
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
                if (Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                    heap.addNode(receiver);
                }
                else {
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
            let vars = new Map();
            if (state.store.length > 0) {
                state.store.forEach((variable) => {
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
                if (heapChunk.parsed && heapChunk.name.type == Statement_1.NameType.FieldReferenceName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                    //add the adge only if the value is known to exist
                    if (heapChunkFields.has(heapChunk.value.raw)) {
                        let edge = heap.addEdge(heap, heapChunk.name.receiver, heap, heapChunk.value.raw, heapChunk.name.field, "fields");
                    }
                }
                else if (heapChunk.name.type == Statement_1.NameType.PredicateName || heapChunk.name.type == Statement_1.NameType.FunctionApplicationName) {
                    heapEmpty = false;
                    //add predicate subgraph
                    let label = heapChunk.name.type == Statement_1.NameType.PredicateName ? "Predicate" : "";
                    let cluster;
                    if (heapChunk.name.type == Statement_1.NameType.PredicateName) {
                        cluster = heap.addCluster(heapChunk.name.receiver, "bold", "Predicate " + heapChunk.name.receiver);
                    }
                    else {
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
                        if (parameter && (parameter.toLowerCase() === FALSE.toLowerCase() || parameter.toLowerCase() === TRUE.toLowerCase() || parameter === NULL.toLowerCase() || /^\d+(\.\d+)?$/.test(parameter))) {
                            //if its a scalar value, add it directly into the Predicate
                            let argumentNode = cluster.addNode(`arg${i}`, `arg${i} = ${negated ? "!" : ""}${parameter}`);
                        }
                        else {
                            let argumentNode = cluster.addNode(`arg${i}`, `arg ${i}`);
                            if (heapChunkFields.has(parameter)) {
                                heap.addDashedEdge(heap, parameter, cluster, argumentNode.name, negated);
                            }
                            else {
                                //try to add edge from variable to predicate argument;
                                state.store.forEach(element => {
                                    if (element.value === parameter) {
                                        store.addDashedEdge(store, vars.get(element.name).name, cluster, argumentNode.name, negated);
                                    }
                                });
                                //try to add edge from field to predicate argument
                                heapChunks.forEach(chunk => {
                                    if (chunk.name.type == Statement_1.NameType.FieldReferenceName && chunk.value.raw === parameter) {
                                        store.addDashedEdge(heap, chunk.name.receiver, cluster, argumentNode.name, (negated ? "!" : "") + chunk.name.field, "fields");
                                    }
                                });
                            }
                        }
                    }
                    //add edge from Function Application to result
                    if (heapChunk.name.type == Statement_1.NameType.FunctionApplicationName && heapChunk.value.type == Statement_1.ValueType.ObjectReferenceOrScalarValue) {
                        //let resultNode = cluster.addNode('result', "Result")
                        if (!heapChunkFields.has(heapChunk.value.raw)) {
                            let resultNode;
                            if (Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                                resultNode = heap.addNode(heapChunk.value.raw, "");
                            }
                            else {
                                resultNode = heap.addNode(heapChunk.value.raw, "<name>|<fields>" + (heapChunk.name.field || ""));
                            }
                        }
                        let resultEdge = heap.addEdgeFromCluster(cluster, heap, heapChunk.value.raw, null, "name", null, null);
                    }
                }
            });
            //add pointers from the store to the heap
            if (state.store.length > 0) {
                state.store.forEach((variable) => {
                    //add pointer from local vars to heap if the heap chunk exists
                    store.addEdge(store, variable.name, heap, variable.value, "", null, "name");
                });
            }
            if (!Settings_1.Settings.settings.advancedFeatures.simpleMode) {
                //add types for nodes with no outgoing arrows and no values
                allNodes.forEach((value, key) => {
                    if (!value.node.hasOutEdge && value.node.label.indexOf("=") < 0) {
                        value.node.label += value.variable.type ? ": " + value.variable.type : "";
                    }
                });
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
        if (Settings_1.Settings.settings.advancedFeatures.simpleMode)
            return result;
        //add symbolic and concrete values;
        let isValueNull = this.isKnownToBeNull(symbolicValue, state, showConcreteValues, model);
        let isPrimitiveValue = symbolicValue && (symbolicValue.toLowerCase() === FALSE.toLowerCase() || symbolicValue.toLowerCase() === TRUE.toLowerCase() || symbolicValue === NULL.toLowerCase() || /^\d+(\.\d+)?$/.test(symbolicValue));
        if (symbolicValue && (showSymbolicValues || isPrimitiveValue || isValueNull)) {
            result += " = " + (isValueNull ? NULL : symbolicValue);
            if (showConcreteValues && showSymbolicValues && concreteValue) {
                result += "(=" + concreteValue + ")";
            }
        }
        return result;
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVhcFZpc3VhbGl6ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0hlYXBWaXN1YWxpemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFFYiwrQkFBNEI7QUFFNUIsbURBQTBEO0FBQzFELDJDQUFpRztBQUNqRyx5Q0FBMkQ7QUFDM0QseUNBQXNDO0FBRXRDLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQztBQUNsQixJQUFJLElBQUksR0FBRyxNQUFNLENBQUM7QUFDbEIsSUFBSSxLQUFLLEdBQUcsT0FBTyxDQUFDO0FBRXBCLE1BQWEsY0FBYztJQUVmLE1BQU0sQ0FBQyxVQUFVO1FBQ3JCLElBQUksbUJBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFO1lBQy9DLE9BQU8sU0FBUyxDQUFDO1NBQ3BCO2FBQU07WUFDSCxPQUFPLE9BQU8sQ0FBQztTQUNsQjtJQUNMLENBQUM7SUFDTyxNQUFNLENBQUMsa0JBQWtCO1FBQzdCLElBQUksbUJBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxFQUFFO1lBQy9DLE9BQU8sT0FBTyxDQUFDO1NBQ2xCO2FBQU07WUFDSCxPQUFPLE9BQU8sQ0FBQztTQUNsQjtJQUNMLENBQUM7SUFFTSxNQUFNLENBQUMsNkJBQTZCLENBQUMsS0FBZ0I7UUFDeEQsSUFBSTtZQUNBLElBQUksS0FBSyxHQUFHLElBQUksbUJBQVEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM1RixJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLGVBQWUsRUFBRSxPQUFPLEVBQUUseUJBQXlCLENBQUMsQ0FBQztZQUNwRixrQkFBa0I7WUFDbEIsSUFBSSxNQUFpQixDQUFDO1lB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