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
class DotAttribute {
    constructor(name, value) {
        this.name = name.trim();
        this.value = value.trim();
    }
    pretty() {
        if (this.name == "rankdir" || this.name == "shape") {
            return this.name + " = " + this.value;
        }
        else {
            return this.name + ' = "' + this.value + '"';
        }
    }
}
class DotGraph {
    constructor(name, bgColor, color, rankdir, shape) {
        this.graphAttributes = [];
        this.nodeAttributes = [];
        this.edgeAttributes = [];
        this.count = 0;
        this.clusters = [];
        this.edges = [];
        if (name.indexOf("_") > 0)
            Log_1.Log.error("The graph name cannot contain _");
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
    toDot() {
        try {
            return `digraph ${this.name} {
compound = true
graph [${DotGraph.combine(this.graphAttributes, ", ")}];
node [${DotGraph.combine(this.nodeAttributes, ", ")}];
edge [${DotGraph.combine(this.edgeAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combine(this.edges, "\n")}
}`;
        }
        catch (e) {
            Log_1.Log.error("Error converting graph to dot" + e);
        }
    }
    addCluster(name, style, label) {
        if (name.indexOf("_") > 0)
            Log_1.Log.error("cluster names cannot contain _");
        //ensure uniqueness
        name = this.name + "_" + (this.count++) + "_" + name.trim();
        let cluster = new DotCluster(this, name, style, label);
        this.clusters.push(cluster);
        return cluster;
    }
    static combine(dotElements, separator) {
        if (!dotElements || dotElements.length == 0) {
            return "";
        }
        return dotElements.map(elem => elem.pretty()).reduce((a, b) => a + separator + b);
    }
    static combineNodes(dotNodes, separator) {
        let temp = [];
        dotNodes.forEach((value, key) => {
            temp.push(value);
        });
        return this.combine(temp, separator);
    }
}
exports.DotGraph = DotGraph;
class DotCluster {
    constructor(graph, name, style, label) {
        this.clusterAttributes = [];
        this.nodes = new Map();
        this.clusters = [];
        this.graph = graph;
        this.name = name;
        //clusterAttributes
        this.clusterAttributes.push(new DotAttribute("style", style));
        this.clusterAttributes.push(new DotAttribute("label", label));
    }
    addEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style) {
        this.doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style);
    }
    addDashedEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField) {
        this.doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, "dashed");
    }
    addEdgeFromCluster(sourceCluster, destinationCluster, destination, label, sourceField, destinationField, style) {
        this.doAddEdge(sourceCluster, null, destinationCluster, destination, label, sourceField, destinationField, style, sourceCluster.name);
    }
    doAddEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField, style, ltail) {
        if ((!source || sourceCluster.nodes.has(source)) && destinationCluster.nodes.has(destination)) {
            let sourceNode;
            if (source) {
                sourceNode = sourceCluster.nodes.get(source);
            }
            else {
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
    addNode(name, label, invisible = false, style) {
        //ensure uniqueness between nodes from different clusters
        name = name.trim();
        let node;
        if (this.nodes.has(name)) {
            node = this.nodes.get(name);
            if (label) {
                node.label = label;
            }
        }
        else {
            node = new DotNode(this, name, label, invisible, style);
            this.nodes.set(name, node);
        }
        return node;
    }
    addCluster(name, style, label) {
        if (name.indexOf("_") > 0)
            Log_1.Log.error("cluster names cannot contain _");
        //ensure uniqueness
        name = this.name + "_" + (this.graph.count++) + "_" + name.trim();
        let cluster = new DotCluster(this.graph, name, style, label);
        this.clusters.push(cluster);
        return cluster;
    }
    pretty() {
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
exports.DotCluster = DotCluster;
class DotNode {
    constructor(cluster, name, label, invisible = false, style) {
        this.hasOutEdge = false;
        this.cluster = cluster;
        this.name = name;
        this.invisible = invisible;
        this.style = style;
        this.label = label;
    }
    static escapeLabel(label) {
        if (!label)
            return label;
        return label.replace(/([<>\{\}|])/g, "\\$1");
    }
    pretty() {
        let color = this.invisible ? ', color = "' + this.cluster.graph.bgColor + '", fontcolor = "' + this.cluster.graph.bgColor + '"' : '';
        return `"${this.cluster.name}_${this.name}" [ label = "${(this.label || "")}"${color}${(this.style ? ' style="' + this.style + '"' : "")}];`;
    }
}
exports.DotNode = DotNode;
class DotEdge {
    constructor(sourceCluster, sourceNode, destinationCluster, destinationNode, label, sourceField, destinationField, style, ltail) {
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
    pretty() {
        let style = this.style ? ', style = "' + this.style + '"' : '';
        let ltail = this.ltail ? ', ltail = "cluster_' + this.ltail + '"' : '';
        return `"${this.sourceCluster.name}_${this.sourceNode.name}"${this.sourceField ? ":" + this.sourceField : ""} -> "${this.destinationCluster.name}_${this.destinationNode.name}"${this.destinationField ? ":" + this.destinationField : ""} [ label = "${(this.label || "")}"${style}${ltail}];`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRG90R3JhcGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RvdEdyYXBoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7SUFNSTtBQUVKLFlBQVksQ0FBQzs7QUFFYiwrQkFBMEI7QUFHMUIsTUFBTSxZQUFZO0lBR2QsWUFBWSxJQUFZLEVBQUUsS0FBYTtRQUNuQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUN4QixJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUM5QixDQUFDO0lBQ0QsTUFBTTtRQUNGLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxTQUFTLElBQUksSUFBSSxDQUFDLElBQUksSUFBSSxPQUFPLEVBQUU7WUFDaEQsT0FBTyxJQUFJLENBQUMsSUFBSSxHQUFHLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDO1NBQ3pDO2FBQU07WUFDSCxPQUFPLElBQUksQ0FBQyxJQUFJLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO1NBQ2hEO0lBQ0wsQ0FBQztDQUNKO0FBRUQsTUFBYSxRQUFRO0lBV2pCLFlBQVksSUFBWSxFQUFFLE9BQWUsRUFBRSxLQUFhLEVBQUUsT0FBZSxFQUFFLEtBQWE7UUFUeEYsb0JBQWUsR0FBbUIsRUFBRSxDQUFDO1FBQ3JDLG1CQUFjLEdBQW1CLEVBQUUsQ0FBQztRQUNwQyxtQkFBYyxHQUFtQixFQUFFLENBQUM7UUFLcEMsVUFBSyxHQUFXLENBQUMsQ0FBQztRQW1CbEIsYUFBUSxHQUFpQixFQUFFLENBQUM7UUFDNUIsVUFBSyxHQUFjLEVBQUUsQ0FBQztRQWpCbEIsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7WUFBRSxTQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFD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