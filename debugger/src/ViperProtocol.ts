
export interface SymbExLogEntry {
    value: string;
    type?: string;
    kind?: string;
    // open: boolean;
    pos?: string;
    prestate?: SymbExLogState;
    lastSMTQuery?: string;
    children?: SymbExLogEntry[];
}

export interface SymbExLogState {
        store: SymbExLogStore[];
        heap: string[];
        oldHeap: string[];
        pcs: any[];
}

export interface SymbExLogStore {
    value: string;
    type: string;
}
