import * as vscode from 'vscode';
import { SessionObserver } from "./Debugger";
import { DebuggerSession, StateUpdate } from "./DebuggerSession";
import { TextEditorDecorationType } from "vscode";
import { stat } from 'fs';


export class DecorationsManager implements SessionObserver {

    private textEditor: vscode.TextEditor;
    private session: DebuggerSession | undefined;
    private currentDecoration: TextEditorDecorationType;

    constructor(textEditor: vscode.TextEditor) {
        this.textEditor = textEditor;
        this.currentDecoration = vscode.window.createTextEditorDecorationType({
            borderColor: 'green',
            borderStyle: 'solid',
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer'
        });
    }

    setSession(session: DebuggerSession): void {
        this.session = session;

        this.session.onStateChange( (states) => this.updateDecorations(states) );
    }

    private updateDecorations(states: StateUpdate) {
        const startPos = new vscode.Position(states.current.position.line - 1,
                                             states.current.position.character - 1);
        const endPos = new vscode.Position(startPos.line,
                                           startPos.character + states.current.formula.length);

        this.textEditor.setDecorations(this.currentDecoration, [new vscode.Range(startPos, endPos)]);

        // if (states.previous) {
        //     const startPos = new vscode.Position(states.previous.position.line - 1,
        //                                          states.previous.position.character - 1);
        //     const endPos = new vscode.Position(startPos.line,
        //                                        startPos.character + states.previous.formula.length);

        //     editor.setDecorations(this.previousDecoration, [new vscode.Range(startPos, endPos)]);
        // }
    }
}