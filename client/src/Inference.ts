import * as vscode from 'vscode';
import { InferenceResultsParams } from './ViperProtocol';
import { Settings } from './Settings';

export class InferenceProvider implements vscode.CodeActionProvider, vscode.CodeLensProvider {
    
    private static inferenceResults: Map<string, InferenceResultsParams> = new Map<string, InferenceResultsParams>();
    
    onDidChangeCodeLenses?: vscode.Event<void>;

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] | Thenable<vscode.CodeAction[]> | undefined {
        if(!Settings.isInferenceOnVerificationErrorEnabled()) {return undefined;}
        const inferenceAction = new vscode.CodeAction(
            'Viper Quickfix action',
            vscode.CodeActionKind.QuickFix
        );/*
        inferenceAction.command = {
            command: 'viper.quickfix',
            title: 'Viper Quickfix'
        };*/
        return [inferenceAction];
    }
    
    provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens[]> {
        throw new Error('Method not implemented.');
    }
    resolveCodeLens?(
        codeLens: vscode.CodeLens,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.CodeLens> {
        throw new Error('Method not implemented.');
    }
}