import * as vscode from 'vscode';


export namespace ViperApi {
    export enum VerificationSuccess {
        //Used for initialization
        None = 0,
        Success = 1,
        ParsingFailed = 2,
        TypecheckingFailed = 3,
        VerificationFailed = 4,
        // Manually aborted verification
        Aborted = 5,
        //Caused by internal error
        Error = 6,
        //Caused by veification taking too long
        Timeout = 7
    }


    export interface VerificationTerminatedEvent {
        status: VerificationSuccess;
        filename: vscode.Uri;
        message: string; 
    }
}

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
        store: SymbExLogStoreVariable[];
        heap: string[];
        oldHeap: string[];
        pcs: any[];
}

export interface SymbExLogStoreVariable {
    name: string;
    value: any;
    sort: any[];
}