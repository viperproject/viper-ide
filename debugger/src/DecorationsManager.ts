import * as vscode from 'vscode';
import { SessionObserver } from "./Debugger";
import { DebuggerSession, StateUpdate } from "./DebuggerSession";
import { TextEditorDecorationType } from "vscode";
import { stat } from 'fs';
import { DebuggerError } from './Errors';


export class DecorationsManager implements SessionObserver {

    private textEditor: vscode.TextEditor;
    private session: DebuggerSession | undefined;
    private decorations: TextEditorDecorationType[];
    private currentStateDecoration: TextEditorDecorationType;
    private topStateDecoration: TextEditorDecorationType;

    constructor(textEditor: vscode.TextEditor) {
        this.textEditor = textEditor;
        this.decorations = [];
        this.currentStateDecoration = DecorationsManager.getCurrentStateDecorationType();
        this.topStateDecoration = DecorationsManager.getTopStateDecorationType();
        this.decorations.push(this.currentStateDecoration);
    }

    setSession(session: DebuggerSession): void {
        this.session = session;

        const textEditor = vscode.window.visibleTextEditors.find(editor => {
            // Not sure why, but we need to compare with paths, because the URI objects are different...
            return editor.document.uri.fsPath === session.debuggedFile.fsPath;
        });
        if (!textEditor) {
            // TODO: can it be that the editor was hidden?
            throw new DebuggerError(`Could not find active text editor for '${session.debuggedFile}'`);
        }
        this.textEditor = textEditor;
        this.session.onStateChange( (states) => this.updateDecorations(states) );
    }

    private disposeDecorations() {
        this.decorations.forEach(d => d.dispose());
        this.decorations = [];
    }

    private createNewDecorations() {
        this.disposeDecorations();

        this.currentStateDecoration = DecorationsManager.getCurrentStateDecorationType();
        this.decorations.push(this.currentStateDecoration);

        this.topStateDecoration = DecorationsManager.getTopStateDecorationType();
        this.decorations.push(this.topStateDecoration);
    }

    private static getCurrentStateDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            // borderStyle: 'dotted',
            border: '4px solid #3c6d3f',
            borderRadius: '2px',
            backgroundColor:'#3c6d3f',
            cursor: 'pointer'
        });
    }

    private static getTopStateDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            borderColor: '#444444;',
            borderWidth: '0 0 2px 0',  // top right bottom left
            borderStyle: 'dotted',
            cursor: 'pointer'
        });
    }

    private updateDecorations(states: StateUpdate) {
        this.createNewDecorations();

        // TODO: Don't like this mess...
        const currentStartPos = new vscode.Position(Math.max(0, states.current.position.line - 1),
                                                    Math.max(0, states.current.position.character - 1));
        const currentEndPos = new vscode.Position(Math.max(0, currentStartPos.line),
                                                  Math.max(0, currentStartPos.character + states.current.formula.length));

        this.textEditor.setDecorations(this.currentStateDecoration, [new vscode.Range(currentStartPos, currentEndPos)]);

        let decorationOptions: vscode.DecorationOptions[] = [];
        this.session!.topLevelStates().forEach((state) => {
            if (state !== states.current && state.formula) {
                // TODO: ... same as with the other mess
                const startPos = new vscode.Position(Math.max(0, state.position.line - 1),
                                                     Math.max(0, state.position.character - 1));
                const endPos = new vscode.Position(Math.max(0, startPos.line),
                                                   Math.max(0, startPos.character + state.formula.length));

                // FIXME: This is a nasty hack, we don't like nasty hacks
                if (startPos.line === currentStartPos.line) {
                    return;
                }

                let opts: vscode.DecorationOptions = {
                    range: new vscode.Range(startPos, endPos)
                };

                if (state.type) {
                    opts.hoverMessage = state.type;
                } else if (state.kind) {
                    opts.hoverMessage = state.kind;
                }

                decorationOptions.push(opts);
            }
        });
        this.textEditor.setDecorations(this.topStateDecoration, decorationOptions);

        vscode.languages.registerHoverProvider('viper', {
            provideHover(document, position) {
                let s = new vscode.MarkdownString("[stop](command:viper-debugger.stopDebugger)\n" +
                                                  "[2](command:viper-debugger.stopDebugger)\n" +
                                                  "[3!](command:viper-debugger.stopDebugger)");
                s.isTrusted = true;
                return new vscode.Hover(s);
            }
        })
        // if (states.previous) {
        //     const startPos = new vscode.Position(states.previous.position.line - 1,
        //                                          states.previous.position.character - 1);
        //     const endPos = new vscode.Position(startPos.line,
        //                                        startPos.character + states.previous.formula.length);

        //     editor.setDecorations(this.previousDecoration, [new vscode.Range(startPos, endPos)]);
        // }
    }

    public dispose() {
        this.disposeDecorations();
    }
}