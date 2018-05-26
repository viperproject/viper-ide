import * as vscode from 'vscode';
import { SessionObserver } from "./Debugger";
import { DebuggerSession, StateUpdate } from "./DebuggerSession";
import { TextEditorDecorationType } from "vscode";
import { stat } from 'fs';
import { DebuggerError } from './Errors';
import { Statement } from './states/Statement';


type StateLocationEntry = { range: vscode.Range, state: Statement };

export class DecorationsManager implements SessionObserver {

    private shouldListenForClicks: boolean;
    private textEditor: vscode.TextEditor;
    private session: DebuggerSession | undefined;
    private decorations: TextEditorDecorationType[];
    private currentStateDecoration: TextEditorDecorationType;
    private topStateDecoration: TextEditorDecorationType;
    private childrenDecoration: TextEditorDecorationType;
    private stateLocations: StateLocationEntry[];

    constructor(textEditor: vscode.TextEditor) {
        this.shouldListenForClicks = false;
        this.textEditor = textEditor;
        this.decorations = [];
        this.currentStateDecoration = DecorationsManager.getCurrentStateDecorationType();
        this.topStateDecoration = DecorationsManager.getTopStateDecorationType();
        this.childrenDecoration = DecorationsManager.getChildrenDecorationType();
        this.decorations.push(this.currentStateDecoration);
        this.decorations.push(this.topStateDecoration);
        this.decorations.push(this.childrenDecoration);
        this.stateLocations = [];

        // Setup a listener for changes in cursor position, so we can detect clicks on decorations and change to the
        // correponding state
        vscode.window.onDidChangeTextEditorSelection((e) => {
            // We have not setup the decorations yet, ignore the clicks
            if (!this.shouldListenForClicks) {
                return;
            }
            // Ignore everything that was not a click
            if (e.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
                return;
            }

            // Ignore multiple selections and no selections
            if (e.selections.length !== 1) {
                return;
            }

            let selection = e.selections[0];
            // Ignore actual selections, we only care about clicks
            if (selection.start.character !== selection.end.character) {
                return;
            }

            // Click was not in document being debugged
            if (e.textEditor.document.uri.fsPath !== this.session!.debuggedFile.fsPath) {
                return;
            }

            let states = this.stateLocations.filter(e => e.range.intersection(selection) !== undefined)
                                            .map(e => e.state);

            if (states.length > 1) {
                let items = states.map(s => {
                    return {
                        label: (s.type || s.kind || "Unknown Action"),
                        description: `${s.children.length} children, ${s.store.length} store elements, ` +
                                     `${s.heap.length} heap chunks, ${s.pathConditions.length} path conditions`,
                        details: s.formula,
                        state: s
                    };
                });
                vscode.window
                    .showQuickPick(items)
                    .then((value) => {
                        if (value) {
                            this.session!.goToState(value.state);
                        }
                    });
            } else if (states.length === 1) {
                this.session!.goToState(states[0]);
            } 
        });
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

        this.childrenDecoration = DecorationsManager.getChildrenDecorationType();
        this.decorations.push(this.childrenDecoration);

        this.topStateDecoration = DecorationsManager.getTopStateDecorationType();
        this.decorations.push(this.topStateDecoration);
    }

    private static getCurrentStateDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            // borderStyle: 'dotted',
            backgroundColor:'rgba(44, 93, 48, 0.2)',
        });
    }

    private static getTopStateDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            borderColor: '#2c406d',
            borderWidth: '0 0 2px 0',  // top right bottom left
            borderStyle: 'dotted',
            cursor: 'pointer'
        });
    }

    private static getChildrenDecorationType() {
        return vscode.window.createTextEditorDecorationType({
            border: '2px solid #2c6d30',
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer'
        });
    }

    private updateDecorations(states: StateUpdate) {
        this.createNewDecorations();
        this.stateLocations = [];

        // TODO: Don't like this mess...
        const currentStartPos = new vscode.Position(Math.max(0, states.current.position.line - 1),
                                                    Math.max(0, states.current.position.character - 1));
        const currentEndPos = new vscode.Position(Math.max(0, currentStartPos.line),
                                                  Math.max(0, currentStartPos.character + states.current.formula.length));
        const currentRange = new vscode.Range(currentStartPos, currentEndPos);

        this.textEditor.setDecorations(this.currentStateDecoration, [currentRange]);

        let childrenDecorations: vscode.DecorationOptions[] = [];
        states.current.children.forEach(state => {
            const startPos = new vscode.Position(Math.max(0, state.position.line - 1),
                                                 Math.max(0, state.position.character - 1));
            const endPos = new vscode.Position(Math.max(0, startPos.line),
                                               Math.max(0, startPos.character + state.formula.length));
            let range = new vscode.Range(startPos, endPos);

            let opts: vscode.DecorationOptions = {
                range: new vscode.Range(startPos, endPos)
            };

            if (state.type) {
                opts.hoverMessage = "Child: " + state.type;
            } else if (state.kind) {
                opts.hoverMessage = "Child: " + state.kind;
            }

            childrenDecorations.push(opts);

            // Update the list of location-state mappings
            this.stateLocations.push({ range: range, state: state });
        });
        this.textEditor.setDecorations(this.childrenDecoration, childrenDecorations);

        let decorationOptions: vscode.DecorationOptions[] = [];
        this.session!.topLevelStates().forEach((state) => {
            if (state !== states.current && state.formula) {
                // TODO: ... same as with the other mess
                const startPos = new vscode.Position(Math.max(0, state.position.line - 1),
                                                     Math.max(0, state.position.character - 1));
                const endPos = new vscode.Position(Math.max(0, startPos.line),
                                                   Math.max(0, startPos.character + state.formula.length));
                let range = new vscode.Range(startPos, endPos);

                // Don't draw other states that intersect with the current one (there shouldn't be any, still)
                if (range.intersection(currentRange)) {
                    return;
                }

                // The message shows the type of action the state corresponds to
                let message = "";
                if (state.type) {
                    message = state.type;
                } else if (state.kind) {
                    message = state.kind;
                }

                // If there are other states in the same or overlapping locations, collapse the decorations
                let opts = decorationOptions.find(e => e.range.intersection(range) !== undefined);
                if (opts) {
                    // TODO: This can be cleaned up, and is probably not even fast
                    if (!opts.hoverMessage!.toString().startsWith("Multiple States") &&
                            opts.hoverMessage!.toString().split(",").length > 4) {
                        opts.hoverMessage = "Multiple States";
                    } else {
                        opts.hoverMessage += ", " + message;
                    }
                } else {
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

                // Update the list of location-state mappings
                this.stateLocations.push({ range: range, state: state });
            }
        });

        this.textEditor.setDecorations(this.topStateDecoration, decorationOptions);

        // Now that we know to which state the locations correspond, start listening for clicks.
        this.shouldListenForClicks = true;
    }

    public dispose() {
        this.disposeDecorations();
    }
}