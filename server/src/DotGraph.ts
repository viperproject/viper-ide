/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
 
'use strict';

import {Log} from './Log';
import {LogLevel} from './ViperProtocol';

class DotAttribute {
    name: string;
    value: string;
    constructor(name: string, value: string) {
        this.name = name.trim();
        this.value = value.trim();
    }
    pretty(): string {
        if (this.name == "rankdir" || this.name == "shape") {
            return this.name + " = " + this.value;
        } else {
            return this.name + ' = "' + this.value + '"';
        }
    }
}

export class DotGraph {
    name: string
    graphAttributes: DotAttribute[] = [];
    nodeAttributes: DotAttribute[] = [];
    edgeAttributes: DotAttribute[] = [];

    //used for invisible nodes
    bgColor: string;

    count: number = 0;

    constructor(name: string, bgColor: string, color: string, rankdir: string, shape: string) {
        if (name.indexOf("_") > 0) Log.error("The graph name cannot contain _");
        this.name = name;
        //graphAttributes
        this.graphAttributes.push(new DotAttribute("rankdir", rankdir));
        this.graphAttributes.push(new DotAttribute("bgcolor", bgColor));
        this.bgColor = bgColor;
        this.graphAttributes.push(new DotAttribute("color", color));
        this.graphAttributes.push(new DotAttribute("fontcolor", color));
        //nodeAttributes
        this.nodeAttributes.push(new DotAttribute("shape", shape));
        this.nodeAttributes.push(new DotAttribute("color", color));
        this.nodeAttributes.push(new DotAttribute("fontcolor", color));
        //edgeAttributes
        this.edgeAttributes.push(new DotAttribute("color", color));
        this.edgeAttributes.push(new DotAttribute("fontcolor", color));
    }
    clusters: DotCluster[] = [];
    edges: DotEdge[] = [];

    toDot(): string {
        try {
            return `digraph ${this.name} {
compound = true
graph [${DotGraph.combine(this.graphAttributes, ", ")}];
node [${DotGraph.combine(this.nodeAttributes, ", ")}];
edge [${DotGraph.combine(this.edgeAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combine(this.edges, "\n")}
}`;
        } catch (e) {
            Log.error("Error converting graph to dot" + e);
        }
    }

    addCluster(name: string, style: string, label?: string): DotCluster {
        if (name.indexOf("_") > 0) Log.error("cluster names cannot contain _");
        //ensure uniqueness
        name = this.name + "_" + (this.count++) + "_" + name.trim();
        let cluster = new DotCluster(this, name, style, label);
        this.clusters.push(cluster);
        return cluster;
    }

    static combine(dotElements: any[], separator): string {
        if (!dotElements || dotElements.length == 0) {
            return "";
        }
        return dotElements.map(elem => elem.pretty()).reduce((a, b) => a + separator + b);
    }
    static combineNodes(dotNodes: Map<string, DotNode>, separator): string {
        let temp: DotNode[] = [];
        dotNodes.forEach((value, key) => {
            temp.push(value);
        });
        return this.combine(temp, separator);
    }
}

export class DotCluster {
    name: string;
    graph: DotGraph;
    clusterAttributes: DotAttribute[] = [];
    nodes: Map<string, DotNode> = new Map<string, DotNode>();
    clusters: DotCluster[] = [];

    constructor(graph: DotGraph, name: string, style: string, label: string) {
        this.graph = graph;
        this.name = name;
        //clusterAttributes
        this.clusterAttributes.push(new DotAttribute("style", style));
        this.clusterAttributes.push(new DotAttribute("label", label));
    }

    addEdge(sourceCluster: DotCluster, source: string, destinationCluster: DotCluster, destination: string, label?: string, sourceField?: string, destinationField?: string, style?: string) {
        this.doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style);
    }

    addDashedEdge(sourceCluster: DotCluster, source: string, destinationCluster: DotCluster, destination: string, label: string, sourceField?: string, destinationField?: string) {
        this.doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, "dashed");
    }

    addEdgeFromCluster(sourceCluster: DotCluster, destinationCluster: DotCluster, destination: string, label?: string, sourceField?: string, destinationField?: string, style?: string) {
        this.doAddEdge(sourceCluster, null, destinationCluster, destination, label, sourceField, destinationField, style, sourceCluster.name);
    }

    private doAddEdge(sourceCluster: DotCluster, source: string, destinationCluster: DotCluster, destination: string, label: string, sourceField?: string, destinationField?: string, style?: string, ltail?: string) {
        if ((!source || sourceCluster.nodes.has(source)) && destinationCluster.nodes.has(destination)) {
            let sourceNode: DotNode;
            if (source) {
                sourceNode = sourceCluster.nodes.get(source);
            } else {
                //addEdgeFromCluster
                sourceNode = sourceCluster.nodes.values().next().value;
                if (!sourceNode) {
                    sourceNode = sourceCluster.addNode("dummy", "", true);
                }
            }
            let destinationNode = destinationCluster.nodes.get(destination);
            sourceNode.hasOutEdge = true;
            this.graph.edges.push(new DotEdge(sourceCluster, sourceNode, destinationCluster, destinationNode, label, sourceField, destinationField, style, ltail));
        }
    }

    addNode(name: string, label?: string, invisible: boolean = false, style?: string): DotNode {
        //ensure uniqueness between nodes from different clusters
        name = name.trim();
        let node: DotNode;
        if (this.nodes.has(name)) {
            node = this.nodes.get(name);
            if (label) {
                node.label = label;
            }
        } else {
            node = new DotNode(this, name, label, invisible, style);
            this.nodes.set(name, node);
        }
        return node;
    }

    addCluster(name: string, style: string, label?: string): DotCluster {
        if (name.indexOf("_") > 0) Log.error("cluster names cannot contain _");
        //ensure uniqueness
        name = this.name + "_" + (this.graph.count++) + "_" + name.trim();
        let cluster = new DotCluster(this.graph, name, style, label);
        this.clusters.push(cluster);
        return cluster;
    }

    pretty(): string {
        if (this.nodes.size == 0 && this.clusters.length == 0) {
            this.addNode("dummy", "", true);
        }
        return `subgraph cluster_${this.name} {
graph [${DotGraph.combine(this.clusterAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combineNodes(this.nodes, "\n")}
}`;
    }
}

export class DotNode {
    cluster: DotCluster;
    name: string;
    label: string;
    private invisible: boolean;
    private style: string;
    hasOutEdge = false;

    constructor(cluster: DotCluster, name: string, label?: string, invisible: boolean = false, style?: string) {
        this.cluster = cluster;
        this.name = name;
        this.invisible = invisible;
        this.style = style;
        this.label = label;
    }

    public static escapeLabel(label: string): string {
        if (!label) return label;
        return label.replace(/([<>\{\}|])/g, "\\$1");
    }

    pretty(): string {
        let color = this.invisible ? ', color = "' + this.cluster.graph.bgColor + '", fontcolor = "' + this.cluster.graph.bgColor + '"' : '';
        return `"${this.cluster.name}_${this.name}" [ label = "${(this.label || "")}"${color}${(this.style ? ' style="' + this.style + '"' : "")}];`;
    }
}

class DotEdge {
    sourceCluster: DotCluster;
    sourceNode: DotNode;
    sourceField: string;
    destinationCluster: DotCluster;
    destinationNode: DotNode;
    destinationField: string;
    label: string;
    style: string;
    ltail: string;
    constructor(sourceCluster: DotCluster, sourceNode: DotNode, destinationCluster: DotCluster, destinationNode: DotNode, label?: string, sourceField?: string, destinationField?: string, style?: string, ltail?: string) {
        this.sourceCluster = sourceCluster;
        this.sourceNode = sourceNode;
        this.sourceField = sourceField;
        this.destinationCluster = destinationCluster;
        this.destinationNode = destinationNode;
        this.destinationField = destinationField;
        this.label = label;
        this.style = style;
        this.ltail = ltail;
    }

    pretty(): string {
        let style = this.style ? ', style = "' + this.style + '"' : '';
        let ltail = this.ltail ? ', ltail = "cluster_' + this.ltail + '"' : '';
        return `"${this.sourceCluster.name}_${this.sourceNode.name}"${this.sourceField ? ":" + this.sourceField : ""} -> "${this.destinationCluster.name}_${this.destinationNode.name}"${this.destinationField ? ":" + this.destinationField : ""} [ label = "${(this.label || "")}"${style}${ltail}];`;
    }
}