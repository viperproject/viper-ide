
import 'd3-selection'

declare class GraphViz {
    dot(src: string, callback: () => void = undefined): GraphViz;
    render(callback: () => void = undefined): GraphViz;
}

declare module 'd3-selection' {
    export interface Selection<GElement extends BaseType, Datum, PElement extends BaseType, PDatum> {
        graphviz(options: boolean | Object = undefined): GraphViz;
    }
}