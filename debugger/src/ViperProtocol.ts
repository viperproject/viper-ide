
export interface SymbExLogEntry {
    value: string;
    type?: string;
    kind?: string;
    open: boolean;
    pos?: string;
    prestate?: {
        store: SymbExLogStore[],
        heap: string[],
        oldHeap: string[],
        pcs: string[]
    };
    children?: SymbExLogEntry[];
}

export interface SymbExLogStore {
    value: string;
    type: string;
}
