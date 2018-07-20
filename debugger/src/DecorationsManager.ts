import * as vscode from 'vscode';
import { SessionObserver } from "./Debugger";
import { DebuggerSession, StateUpdate } from "./DebuggerSession";
import { TextEditorDecorationType } from "vscode";
import { DebuggerError } from './Errors';
import { Record } from './model/Statement';


/** Creates and disposes the various decoration styles. */
namespace DecorationStyles {
    let decorations: TextEditorDecorationType[] = [];
    let currentStateDecoration: TextEditorDecorationType | undefined;
    let currentStateBackgroundColor = getValidColor('currentStateBackgroundColor');
    let currentStateForegroundColor = getValidColor('currentStateForegroundColor');
    let topLevelStateUnderlineColor = getValidColor('topLevelStateUnderlineColor');
    let childStateUnderlineColor = getValidColor('childStateUnderlineColor');
    let siblingStateUnderlineColor = getValidColor('siblingStateUnderlineColor');

    export function disposeDecorations(keepCurrent: boolean = false) {
        decorations.forEach(d => d.dispose());
        decorations = [];

        if (!keepCurrent && currentStateDecoration !== undefined) {
            currentStateDecoration.dispose();
        }
    }
    
    function getValidColor(key: string) {
        let highlightingSettings = vscode.workspace.getConfiguration("viperDebuggerSettings.highlighting");
        let colorString = (<string> highlightingSettings.get(key)).trim();

        // TODO: This is not realy a 100% safe check, but we probably don't care that much
        let valid = colorString.match(/^#[a-fA-F\d]{6}$/) ||
                    colorString.match(/^#[a-fA-F\d]{3}$/) ||
                    colorString.match(/^rgb\(\s*\d,\s*\d,\s*\d\s*\)$/);

        if (valid) {
            return colorString;
        } else {
            let message = `Invalid color value for '${key}' setting, falling back to default value.`;
            vscode.window.showErrorMessage(message, "Open User Settings")
                         .then((item) => {
                             if (item) {
                                vscode.commands.executeCommand("workbench.action.openGlobalSettings");
                             }
                         });
            let inspection = highlightingSettings.inspect(key);
            return inspection!.defaultValue;
        }
    }

    export function currentState() {
        currentStateDecoration = vscode.window.createTextEditorDecorationType({
            // borderStyle: 'dotted',
            //backgroundColor:'rgba(44, 93, 48, 0.2)',
            backgroundColor: currentStateBackgroundColor,
            color: currentStateForegroundColor,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        return currentStateDecoration;
    }

    export function topState() {
        let decoration = vscode.window.createTextEditorDecorationType({
            border: '2px dotted ' + topLevelStateUnderlineColor,
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        decorations.push(decoration);
        return decoration;
    }

    export function childState() {
        let decoration = vscode.window.createTextEditorDecorationType({
            border: '2px solid ' + childStateUnderlineColor,
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        decorations.push(decoration);
        return decoration;
    }

    export function siblingState() {
        let decoration = vscode.window.createTextEditorDecorationType({
            border: '2px solid ' + siblingStateUnderlineColor,
            //border: '2px solid #6d2c6d',
            borderWidth: '0 0 2px 0',  // top right bottom left
            cursor: 'pointer',
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        decorations.push(decoration);
        return decoration;
    }
}


type StateLocationEntry = { range: vscode.Range, state: Record };


/** Responsible for drawing decorations on the editor during debugging.
 * 
 *  Whenever the debugging session is changed or updated (there is a state change), the manager disposes the old
 *  decorations and creates new ones.
 */
export class DecorationsManager implements SessionObserver {

    /** Keeps track of whether clicks can trigger state changes. */
    private decorationsAreSetup: boolean;
    /** Flag to enable/disable click navigation. */
    private mouseNavigationEnabled: boolean;
    /** The editor we are adding decorations to. */
    private textEditor: vscode.TextEditor;
    /** The current debugging session. */
    private session: DebuggerSession | undefined;
    /** Locations for each of the states being visualized. */
    private stateLocations: StateLocationEntry[];
    /** Keeps track of the states in the current session. */
    private currentStates: StateUpdate | undefined;
    /** Objects to dispose of when the decorations manager is killed. */
    private disposables: vscode.Disposable[];

    constructor(textEditor: vscode.TextEditor) {
        this.decorationsAreSetup = false;
        this.mouseNavigationEnabled = true;
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
        if (!this.decorationsAreSetup) {
            return;
        }

        // Mouse navigation has been explicitely disabled
        if (!this.mouseNavigationEnabled) {
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

        let records = this.stateLocations.filter(e => e.range.intersection(selection) !== undefined)
                                        .map(e => e.state);

        // No states where the user clicked
        if (records.length < 1) {
            return;
        }

        if (records.length === 1) {
            this.session!.goToState(records[0]);
            return;
        }

        // There are multiple states in the location being clicked, then show a dialog to allo chosing between them.
        // We build the items to display in the notification. Note that we keep track of the state on the object,
        // so we can retrieve it when a choice is made
        let items = records.map(r => {
            let desc = (r.children.length === 1 ? "1 child, " : `${r.children.length} children, `);
            if (r.prestate !== undefined) {
                let state = r.prestate;
                desc += (state.store.length === 1 ? "1 store element, " : `${state.store.length} store elements, `) +
                        (state.heap.length === 1 ? "1 heap chunk, " : `${state.heap.length} heap chunks, `) +
                        (state.pathConditions.length === 1 ? "1 path condition, " : `${state.pathConditions.length} path conditions`);
            }
            return {
                label: `(${r.index}) ${r.type}: ${r.formula}`,
                description: desc,
                state: r
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
        this.session.onStateChange(states => {
            this.currentStates = states;
            this.updateDecorations(states);

            // Scroll to selected state if outside viewport
            let currentPos = states.current.position;
            this.textEditor.revealRange(new vscode.Range(currentPos, currentPos), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        });
    }

    public clearSession() {
        this.session = undefined;
        DecorationStyles.disposeDecorations();
    }

    public setMouseNavigation(enabled: boolean) {
        this.mouseNavigationEnabled = enabled;
        if (!enabled) {
            DecorationStyles.disposeDecorations(true);
        } else {
            if (this.currentStates) {
                this.updateDecorations(this.currentStates);
            }
        }
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
                opts.hoverMessage = `(${state.index}) Child: ${state.type}`;
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
                    message = `(${state.index}) ${state.type}`;
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
                    message = `(${state.index}) ${state.type}`;
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
        this.decorationsAreSetup = true;
    }

    public dispose() {
        DecorationStyles.disposeDecorations();
        this.disposables.forEach(e => e.dispose());
    }
}