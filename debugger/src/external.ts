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