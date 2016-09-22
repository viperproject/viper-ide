'use strict';
const Log_1 = require('./Log');
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
        //nodes: DotNode[] = [];
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
        this.graph.edges.push(new DotEdge(sourceCluster.name + "_" + source.trim(), destinationCluster.name + "_" + destination.trim(), label, sourceField, destinationField, style));
    }
    addDashedEdge(sourceCluster, source, destinationCluster, destination, label, sourceField, destinationField) {
        this.graph.edges.push(new DotEdge(sourceCluster.name + "_" + source.trim(), destinationCluster.name + "_" + destination.trim(), label, sourceField, destinationField, "dashed"));
    }
    addNode(name, label, invisible = false) {
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
            node = new DotNode(this, name, label, invisible);
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
        return `subgraph cluster_${this.name} {
graph [${DotGraph.combine(this.clusterAttributes, ", ")}];
${DotGraph.combine(this.clusters, "\n")}
${DotGraph.combineNodes(this.nodes, "\n")}
}`;
    }
}
exports.DotCluster = DotCluster;
class DotNode {
    constructor(cluster, name, label, invisible = false) {
        this.cluster = cluster;
        this.name = name;
        this.label = label;
        this.invisible = invisible;
    }
    pretty() {
        let color = this.invisible ? ', color = "' + this.cluster.graph.bgColor + '", fontcolor = "' + this.cluster.graph.bgColor + '"' : '';
        return `"${this.cluster.name}_${this.name}" [ label = "${(this.label || "")}"${color}];`;
    }
}
exports.DotNode = DotNode;
class DotEdge {
    constructor(source, destination, label, sourceField, destinationField, style) {
        this.source = source;
        this.sourceField = sourceField;
        this.destination = destination;
        this.destinationField = destinationField;
        this.label = label;
        this.style = style;
    }
    pretty() {
        let style = this.style ? ', style = "' + this.style + '"' : '';
        return `"${this.source}"${this.sourceField ? ":" + this.sourceField : ""} -> "${this.destination}"${this.destinationField ? ":" + this.destinationField : ""} [ label = "${(this.label || "")}"${style}];`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRG90R3JhcGguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0RvdEdyYXBoLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQU8xQjtJQUdJLFlBQVksSUFBWSxFQUFFLEtBQWE7UUFDbkMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDOUIsQ0FBQztJQUNELE1BQU07UUFDRixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLFNBQVMsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDakQsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsS0FBSyxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUM7UUFDMUMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLEdBQUcsR0FBRyxDQUFDO1FBQ2pELENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQUVEO0lBV0ksWUFBWSxJQUFZLEVBQUUsT0FBZSxFQUFFLEtBQWEsRUFBRSxPQUFlLEVBQUUsS0FBYTtRQVR4RixvQkFBZSxHQUFtQixFQUFFLENBQUM7UUFDckMsbUJBQWMsR0FBbUIsRUFBRSxDQUFDO1FBQ3BDLG1CQUFjLEdBQW1CLEVBQUUsQ0FBQztRQUtwQyxVQUFLLEdBQVcsQ0FBQyxDQUFDO1FBbUJsQixhQUFRLEdBQWlCLEVBQUUsQ0FBQztRQUM1Qix3QkFBd0I7UUFDeEIsVUFBSyxHQUFjLEVBQUUsQ0FBQztRQWxCbEIsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFBQyxTQUFHLENBQUMsS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDeEUsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsaUJBQWlCO1FBQ2pCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQzVELElBQUksQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksWUFBWSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2hFLGdCQUFnQjtRQUNoQixJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMzRCxJQUFJLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLFlBQVksQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUMvRCxnQkFBZ0I7UUFDaEIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDM0QsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxZQUFZLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFDbkUsQ0FBQztJQUtELEtBQUs7UUFDRCxJQUFJLENBQUM7WUFDRCxNQUFNLENBQUMsV0FBVyxJQUFJLENBQUMsSUFBSTtTQUM5QixRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDO1FBQzdDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxJQUFJLENBQUM7UUFDM0MsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQztFQUNqRCxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDO0VBQ3JDLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUM7RUFDbEMsQ0FBQztRQUNLLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQywrQkFBK0IsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNuRCxDQUFDO0lBQ0wsQ0FBQztJQUVELFVBQVUsQ0FBQyxJQUFZLEVBQUUsS0FBYSxFQUFFLEtBQWM7UUFDbEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFBQyxTQUFHLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFDdkUsbUJBQW1CO1FBQ25CLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDNUQsSUFBSSxPQUFPLEdBQUcsSUFBSSxVQUFVLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdkQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDNUIsTUFBTSxDQUFDLE9BQU8sQ0FBQztJQUNuQixDQUFDO0lBRUQsT0FBTyxPQUFPLENBQUMsV0FBa0IsRUFBRSxTQUFTO1FBQ3hDLEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxJQUFJLFdBQVcsQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMxQyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBQ2QsQ0FBQztRQUNELE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsR0FBRyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUNELE9BQU8sWUFBWSxDQUFDLFFBQThCLEVBQUUsU0FBUztRQUN6RCxJQUFJLElBQUksR0FBYyxFQUFFLENBQUM7UUFDekIsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxHQUFHO1lBQ3hCLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckIsQ0FBQyxDQUFDLENBQUM7UUFDSCxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7SUFDekMsQ0FBQztBQUNMLENBQUM7QUFwRVksZ0JBQVEsV0FvRXBCLENBQUE7QUFFRDtJQU9JLFlBQVksS0FBZSxFQUFFLElBQVksRUFBRSxLQUFhLEVBQUUsS0FBYTtRQUp2RSxzQkFBaUIsR0FBbUIsRUFBRSxDQUFDO1FBQ3ZDLFVBQUssR0FBeUIsSUFBSSxHQUFHLEVBQW1CLENBQUM7UUFDekQsYUFBUSxHQUFpQixFQUFFLENBQUM7UUFHeEIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsbUJBQW1CO1FBQ25CLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDOUQsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNsRSxDQUFDO0lBRUQsT0FBTyxDQUFDLGFBQXlCLEVBQUUsTUFBYyxFQUFFLGtCQUE4QixFQUFFLFdBQW1CLEVBQUUsS0FBYyxFQUFFLFdBQW9CLEVBQUUsZ0JBQXlCLEVBQUUsS0FBYztRQUNuTCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxPQUFPLENBQUMsYUFBYSxDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSxFQUFFLGtCQUFrQixDQUFDLElBQUksR0FBRyxHQUFHLEdBQUcsV0FBVyxDQUFDLElBQUksRUFBRSxFQUFFLEtBQUssRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUNsTCxDQUFDO0lBRUQsYUFBYSxDQUFDLGFBQXlCLEVBQUUsTUFBYyxFQUFFLGtCQUFrQixFQUFFLFdBQW1CLEVBQUUsS0FBYSxFQUFFLFdBQW9CLEVBQUUsZ0JBQXlCO1FBQzVKLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLE9BQU8sQ0FBQyxhQUFhLENBQUMsSUFBSSxHQUFHLEdBQUcsR0FBRyxNQUFNLENBQUMsSUFBSSxFQUFFLEVBQUUsa0JBQWtCLENBQUMsSUFBSSxHQUFHLEdBQUcsR0FBRyxXQUFXLENBQUMsSUFBSSxFQUFFLEVBQUUsS0FBSyxFQUFFLFdBQVcsRUFBRSxnQkFBZ0IsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0lBQ3JMLENBQUM7SUFFRCxPQUFPLENBQUMsSUFBWSxFQUFFLEtBQWMsRUFBRSxTQUFTLEdBQVksS0FBSztRQUM1RCx5REFBeUQ7UUFDekQsSUFBSSxHQUFHLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUNuQixJQUFJLElBQWEsQ0FBQztRQUNsQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkIsSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQzVCLEVBQUUsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7Z0JBQ1IsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUE7WUFDdEIsQ0FBQztRQUNMLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNqRCxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDL0IsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELFVBQVUsQ0FBQyxJQUFZLEVBQUUsS0FBYSxFQUFFLEtBQWM7UUFDbEQsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7WUFBQyxTQUFHLENBQUMsS0FBSyxDQUFDLGdDQUFnQyxDQUFDLENBQUM7UUFDdkUsbUJBQW1CO1FBQ25CLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxHQUFHLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2xFLElBQUksT0FBTyxHQUFHLElBQUksVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1QixNQUFNLENBQUMsT0FBTyxDQUFDO0lBQ25CLENBQUM7SUFFRCxNQUFNO1FBQ0YsTUFBTSxDQUFDLG9CQUFvQixJQUFJLENBQUMsSUFBSTtTQUNuQyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxJQUFJLENBQUM7RUFDckQsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQztFQUNyQyxRQUFRLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDO0VBQ3ZDLENBQUM7SUFDQyxDQUFDO0FBQ0wsQ0FBQztBQXZEWSxrQkFBVSxhQXVEdEIsQ0FBQTtBQUVEO0lBS0ksWUFBWSxPQUFtQixFQUFFLElBQVksRUFBRSxLQUFjLEVBQUUsU0FBUyxHQUFZLEtBQUs7UUFDckYsSUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDdkIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7UUFDakIsSUFBSSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbkIsSUFBSSxDQUFDLFNBQVMsR0FBRyxTQUFTLENBQUM7SUFDL0IsQ0FBQztJQUVELE1BQU07UUFDRixJQUFJLEtBQUssR0FBRyxJQUFJLENBQUMsU0FBUyxHQUFHLGFBQWEsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxPQUFPLEdBQUcsa0JBQWtCLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7UUFDckksTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQztJQUM3RixDQUFDO0FBQ0wsQ0FBQztBQWhCWSxlQUFPLFVBZ0JuQixDQUFBO0FBRUQ7SUFPSSxZQUFZLE1BQWMsRUFBRSxXQUFtQixFQUFFLEtBQWMsRUFBRSxXQUFvQixFQUFFLGdCQUF5QixFQUFFLEtBQWM7UUFDNUgsSUFBSSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7UUFDckIsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDL0IsSUFBSSxDQUFDLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDL0IsSUFBSSxDQUFDLGdCQUFnQixHQUFHLGdCQUFnQixDQUFDO1FBQ3pDLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO1FBQ25CLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxNQUFNO1FBQ0YsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxhQUFhLEdBQUcsSUFBSSxDQUFDLEtBQUssR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO1FBQy9ELE1BQU0sQ0FBQyxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLFdBQVcsR0FBRyxHQUFHLEdBQUcsSUFBSSxDQUFDLFdBQVcsR0FBRyxFQUFFLFFBQVEsSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsR0FBRyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxFQUFFLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDO0lBQy9NLENBQUM7QUFDTCxDQUFDO0FBQUEifQ==