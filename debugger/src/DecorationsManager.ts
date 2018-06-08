import * as vscode from 'vscode';
import { SessionObserver } from "./Debugger";
import { DebuggerSession, StateUpdate } from "./DebuggerSession";
import { TextEditorDecorationType } from "vscode";
import { stat } from 'fs';
import { DebuggerError } from './Errors';
import { Statement } from './states/Statement';


/** Creates and disposes the various decoration styles. */
namespace DecorationStyles {
    let decorations: TextEditorDecorationType[] = [];

    export function disposeDecorations() {
        decorations.forEach(d => d.dispose());
        decorations = [];
    }

    function newDecoration(opts: vscode.DecorationRenderOptions) {
        let decoration = vscode.window.createTextEditorDecorationType(opts);
        decorations.push(decoration);
        return decoration;
    }

    export function currentState() {
        return newDecoration({
            // borderStyle: 'dotted',
            //backgroundColor:'rgba(44, 93, 48, 0.2)',
            backgroundColor: '#114215',
            color: '#eeeeee',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    export function topState() {
        return newDecoration({
            border: '2px dotted #606060',
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    export function childState() {
        return newDecoration({
            border: '2px solid #2cad30',
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }

    export function siblingState() {
        return newDecoration({
            border: '2px solid #2c2cad',
            //border: '2px solid #6d2c6d',
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
    }
}


type StateLocationEntry = { range: vscode.Range, state: Statement };


/** Responsible for drawing decorations on the editor during debugging.
 * 
 *  Whenever the debugging session is changed or updated (there is a state change), the manager disposes the old
 *  decorations and creates new ones.
 */
export class DecorationsManager implements SessionObserver {

    /** Keeps track of whether clicks can trigger state changes. */
    private shouldListenForClicks: boolean;
    /** The editor we are adding decorations to. */
    private textEditor: vscode.TextEditor;
    /** The current debugging session. */
    private session: DebuggerSession | undefined;
    /** Locations for each of the states being visualized. */
    private stateLocations: StateLocationEntry[];
    /** Objects to dispose of when the decorations manager is killed. */
    private disposables: vscode.Disposable[];

    constructor(textEditor: vscode.TextEditor) {
        this.shouldListenForClicks = false;
        this.textEditor = textEditor;
        this.stateLocations = [];
        this.disposables = [];

        // Setup a listener for changes in cursor position, so we can detect clicks on decorations and change to the
        // correponding state
        let d = vscode.window.onDidChangeTextEditorSelection((e) => this.handleTextEditorSelectionChange(e));
        this.disposables.push(d);
    }

    private handleTextEditorSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
        // We have not setup the decorations yet, ignore the clicks
        if (!this.shouldListenForClicks) {
            return;
        }
        // Ignore everything that was not a click
        if (event.kind !== vscode.TextEditorSelectionChangeKind.Mouse) {
            return;
        }

        // Ignore multiple selections and no selections
        if (event.selections.length !== 1) {
            return;
        }

        let selection = event.selections[0];
        // Ignore actual selections, we only care about clicks
        if (selection.start.character !== selection.end.character) {
            return;
        }

        // Click was not in document being debugged
        if (event.textEditor.document.uri.fsPath !== this.session!.debuggedFile.fsPath) {
            return;
        }

        let states = this.stateLocations.filter(e => e.range.intersection(selection) !== undefined)
                                        .map(e => e.state);

        // No states where the user clicked
        if (states.length < 1) {
            return;
        }

        if (states.length === 1) {
            this.session!.goToState(states[0]);
            return;
        }

        // There are multiple states in the location being clicked, then show a dialog to allo chosing between them.
        // We build the items to display in the notification. Note that we keep track of the state on the object,
        // so we can retrieve it when a choice is made
        let items = states.map(s => {
            return {
                label: (s.type || s.kind || "Unknown Action"),
                description: (s.children.length === 1 ? "1 child, " : `${s.children.length} children, `) + 
                                (s.store.length === 1 ? "1 store element, " : `${s.store.length} store elements, `) +
                                (s.heap.length === 1 ? "1 heap chunk, " : `${s.heap.length} heap chunks, `) +
                                (s.pathConditions.length === 1 ? "1 path condition, " : `${s.pathConditions.length} path conditions`),
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
    }

    public setSession(session: DebuggerSession): void {
        this.session = session;

        // Find the text editor where the file being debugged is
        const textEditor = vscode.window.visibleTextEditors.find(editor => {
            // Not sure why, but we need to compare with paths, because the URI objects are different...
            return editor.document.uri.fsPath === session.debuggedFile.fsPath;
        });

        if (!textEditor) {
            throw new DebuggerError(`Could not find active text editor for file '${session.debuggedFile}'`);
        }

        this.textEditor = textEditor;
        this.session.onStateChange(states => this.updateDecorations(states));
    }

    public clearSession() {
        this.session = undefined;
        DecorationStyles.disposeDecorations();
    }

    private updateDecorations(states: StateUpdate) {
        DecorationStyles.disposeDecorations();
        this.stateLocations = [];

        const currentRange = states.current.range();
        this.textEditor.setDecorations(DecorationStyles.currentState(), [currentRange]);

        let childrenDecorations: vscode.DecorationOptions[] = [];
        states.current.children.forEach(state => {
            let range = state.range();

            let opts: vscode.DecorationOptions = {
                range: range
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
        this.textEditor.setDecorations(DecorationStyles.childState(), childrenDecorations);

        let siblingsDecorationOptions: vscode.DecorationOptions[] = [];
        if (states.current.parent) {
            let siblings = states.current.parent.children;

            siblings.forEach(state => {
                if (state === states.current || !state.formula) {
                    return;
                }

                let range = state.range();

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
                let opts = siblingsDecorationOptions.find(e => e.range.intersection(range) !== undefined);
                if (opts) {
                    // TODO: This can be cleaned up, and is probably not even fast
                    if (!opts.hoverMessage!.toString().startsWith("Multiple states")) {
                        if (opts.hoverMessage!.toString().split(",").length > 4) {
                            opts.hoverMessage = "Multiple states...";
                        }
                    } else {
                        opts.hoverMessage = opts.hoverMessage!.toString().replace("Sibling", "Siblings");
                        opts.hoverMessage += ", " + message;
                    }
                } else {
                    let opts: vscode.DecorationOptions = {
                        range: range,
                        hoverMessage: "Sibling: " + message
                    };

                    siblingsDecorationOptions.push(opts);
                }

                // Update the list of location-state mappings
                this.stateLocations.push({ range: range, state: state });
            });
            this.textEditor.setDecorations(DecorationStyles.siblingState(), siblingsDecorationOptions);
        }

        let topLevelsAreSiblings = states.current.parent === undefined;
        let decorationOptions: vscode.DecorationOptions[] = [];
        this.session!.topLevelStates().forEach((state) => {
            if (state !== states.current && state.formula) {
                let range = state.range();

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
                    let multipleStates = opts.hoverMessage!.toString().indexOf("Multiple states") > 0;
                    if (!multipleStates && opts.hoverMessage!.toString().split(",").length > 4) {
                        opts.hoverMessage = "Top Level: Multiple states...";
                    } else if (!multipleStates) {
                        opts.hoverMessage += ", " + message;
                    }
                } else {
                    let opts: vscode.DecorationOptions = {
                        range: range,
                        hoverMessage: (topLevelsAreSiblings ? "Top Level / Sibling: " : "Top Level: ") + message
                    };

                    decorationOptions.push(opts);
                }

                // Update the list of location-state mappings
                this.stateLocations.push({ range: range, state: state });
            }
        });
        // Top-level states are highlihgted as siblings, if the current state is a top-level state.
        if (topLevelsAreSiblings) {
            this.textEditor.setDecorations(DecorationStyles.siblingState(), decorationOptions);
        } else {
            this.textEditor.setDecorations(DecorationStyles.topState(), decorationOptions);
        }

        // Now that we know to which state the locations correspond, start listening for clicks.
        this.shouldListenForClicks = true;
    }

    public dispose() {
        DecorationStyles.disposeDecorations();
        this.disposables.forEach(e => e.dispose());
    }
}