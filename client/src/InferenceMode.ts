import * as vscode from "vscode";
import { InferenceResult, InferenceResultParams, LogLevel } from "./ViperProtocol";
import { Log } from "./Log";
import { AwaitTimer } from "./AwaitTimer";
import { State } from './ExtensionState';
import { Task, TaskType } from "./VerificationController";
import { Settings } from "./Settings";

/**
 * Represents an edit that is pending user acceptance or rejection, along with its associated decoration and method context.
 */
interface PendingEdit {
    originalEdit: InferenceResult;
    decoration: vscode.TextEditorDecorationType;
    range: vscode.Range;
    method: string;
}

/**
 * Represents a method in the source code, identified by its name and the range it occupies in the document. Used for associating inference edits with their containing methods.
 */
interface MethodRange {
    name: string;
    range: vscode.Range;
}

/**
 * Provides code lenses for inference results, allowing users to accept or reject individual edits or all edits associated with a method. Manages the creation, sorting, and refreshing of code lenses based on the current inference state and document changes.
 */
export class InferenceResultsCodeLensProvider implements vscode.CodeLensProvider {
    private editCodeLenses: vscode.CodeLens[] = [];
    private methodCodeLenses: vscode.CodeLens[] = [];
    private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
    public onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

    /**
     * Sets code lenses for a given inference edit, allowing the user to accept or reject the edit. The code lenses are created based on the provided range and are associated with commands that handle acceptance or rejection of the edit.
     * @param edit The inference result edit for which to create code lenses.
     * @param range The range in the document where the edit applies.
     */
    public setEditCodeLenses(edit: InferenceResult, range: vscode.Range): void {
        Log.log(`Setting code lens for edit at ${edit.file_uri} from (${edit.start_line}, ${edit.start_col}) to (${edit.end_line}, ${edit.end_col}) with text: ${edit.edit}`, LogLevel.Debug);
        this.editCodeLenses.push(
            this.createCodeLens(range, "Accept", "viper.acceptInferenceEdit", edit),
            this.createCodeLens(range, "Reject", "viper.rejectInferenceEdit", edit)
        );
        this.sortCodeLenses(this.editCodeLenses);
    }

    /**
     * Sets code lenses for a given method, allowing the user to accept or reject all edits associated with the method.
     * The code lenses are created based on the provided MethodRange and are associated with commands that handle
     * acceptance or rejection of all edits for the method.
     * @param methods The methods for which to create code lenses.
     */
    public setMethodEditCodeLenses(methods: MethodRange[]): void {
        for (const method of methods) {
            Log.log(`Setting method edit code lenses for method ${method.name} at range ${method.range.start.line}:${method.range.start.character}-${method.range.end.line}:${method.range.end.character}`, LogLevel.Debug);
            this.methodCodeLenses.push(
                this.createCodeLens(method.range, "Accept All", "viper.acceptAllInferenceEdits", method.name),
                this.createCodeLens(method.range, "Reject All", "viper.rejectAllInferenceEdits", method.name)
            );
        }
        this.sortCodeLenses(this.methodCodeLenses);
    }

    /**
     * Sets code lenses for inferring specifications for a given method. The code lenses are created based on the
     * provided MethodRange and are associated with a command that triggers inference for the method.
     * @param methods The methods for which to create inference code lenses.
     */
    public setMethodInferCodeLenses(methods: MethodRange[]): void {
        for (const method of methods) {
            Log.log(`Setting method infer code lenses for method ${method.name} at range ${method.range.start.line}:${method.range.start.character}-${method.range.end.line}:${method.range.end.character}`, LogLevel.Debug);
            this.methodCodeLenses.push(
                this.createCodeLens(method.range, "Infer Specifications", "viper.infer", `method:${method.name}`)
            );
        }
        this.methodCodeLenses.sort((a, b) => b.range.start.line - a.range.start.line);
    }

    public provideCodeLenses(_document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
        return this.editCodeLenses.concat(this.methodCodeLenses); 
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, _token: vscode.CancellationToken): vscode.CodeLens {
        return codeLens;
    }

    /**
     * Refreshes the code lenses by firing the onDidChangeCodeLenses event, prompting VS Code to call provideCodeLenses
     * again and update the displayed code lenses based on the current state of editCodeLenses and methodCodeLenses.
     */
    public refresh(): void {
        this.onDidChangeCodeLensesEmitter.fire();
    }
    
    /**
     * Clears all code lenses from both editCodeLenses and methodCodeLenses, and fires the onDidChangeCodeLenses event
     * to update the UI accordingly.
     */
    public clear(): void {
        this.editCodeLenses = [];
        this.methodCodeLenses = [];
        this.onDidChangeCodeLensesEmitter.fire();
    }

    /**
     * Creates a code lens with the specified range, title, command, and argument. The code lens is associated with a
     * command that will be executed when the user clicks on the code lens in the editor.
     * @param range The range in the document where the code lens should be displayed.
     * @param title The title of the code lens, which will be displayed in the editor.
     * @param command The command to be executed when the code lens is clicked.
     * @param argument The argument to be passed to the command when it is executed.
     * @returns A vscode.CodeLens instance configured with the specified parameters.
     */
    private createCodeLens(range: vscode.Range, title: string, command: string, argument: InferenceResult | string): vscode.CodeLens {
        return new vscode.CodeLens(range, {
            title,
            command,
            arguments: [argument]
        });
    }

    /**
     * Sorts the provided array of code lenses first by their starting line in descending order, and then by their
     * command title in ascending order. This ensures that code lenses are displayed in a consistent and logical order in
     * the editor, with those appearing later in the document shown first, and grouped by their associated commands.
     * @param codeLenses The array of vscode.CodeLens instances to be sorted.
     */
    private sortCodeLenses(codeLenses: vscode.CodeLens[]): void {
        codeLenses.sort((a, b) => b.range.start.line - a.range.start.line || a.command.title.localeCompare(b.command.title));
    }
}
/**
 * Manages the inference mode of the Viper IDE, handling the lifecycle of inference requests, results, and user
 * interactions for accepting or rejecting inferred edits. The InferenceController coordinates with the
 * InferenceResultsCodeLensProvider to display code lenses for pending edits and methods, and processes user actions to
 * apply or discard inferred changes in the source code. It also manages the state of ongoing inference operations and
 * updates the UI accordingly based on document changes and inference progress.
 */
export class InferenceController{
    private inferring = false;
    private requestUpdate = true;
    private disableCodeLenses = false;
    private codeLensProvider: InferenceResultsCodeLensProvider;
    private controller: AwaitTimer;
    private pendingEdits: PendingEdit[] = [];
    private includeMethods: string[] = [];
    private documentChanges: vscode.TextDocumentContentChangeEvent[] = [];
    private inferenceResults: InferenceResult[] = [];
    private inferenceRequests: string[] = [];
    private acceptedEdits: InferenceResult[] = [];
    private rejectedEdits: InferenceResult[] = [];

    /**
     * Initializes the InferenceController by setting up the code lens provider and a timer to process inference results
     * and requests. If method inference is not enabled in the settings, the constructor returns early, effectively
     * disabling the inference controller functionality. Otherwise, it registers the code lens provider for Viper files
     * and starts a timer that ticks every 100 milliseconds to handle inference-related updates.
     * @returns An instance of InferenceController if method inference is enabled, or undefined if it is not enabled in
     * the settings.
     */
    constructor(){
        if(!Settings.isMethodInferenceEnabled())
            return undefined;

        this.codeLensProvider = new InferenceResultsCodeLensProvider();
        this.controller = new AwaitTimer(() => this.processTimerTick(), 100);
        State.context.subscriptions.push(vscode.languages.registerCodeLensProvider({language: 'viper'}, this.codeLensProvider));
        State.context.subscriptions.push(this.controller);
    }
    
    /**
     * Adds document changes to the inference controller's internal list of changes. These changes are used to update the
     * UI and adjust pending edit decorations accordingly when the document is modified. The changes are expected to be
     * sorted by their position in the document to ensure correct processing of line shifts and decoration updates.
     * @param changes The list of document changes to be added.
     */
    public addDocumentChanges(changes: readonly vscode.TextDocumentContentChangeEvent[]): void {
        this.documentChanges.push(...changes);
    }

    /**
     * Adds requested inference for the specified methods and file URI. If there are no ongoing inference requests and
     * pending edits, the method adds the requested methods to the inference request queue and adds a verification task
     * to the worklist.
     * @param methods The list of methods for which inference is requested.
     * @param fileUri The URI of the file for which inference is requested.
     */
    public addRequestedInference(methods: string[], fileUri: vscode.Uri): void {
        if(this.inferenceRequests.length + this.pendingEdits.length === 0){
            this.inferenceRequests.push(...methods);
            State.isInferring = true;
            State.addToWorklist(new Task({ type: TaskType.Verify, uri: fileUri, manuallyTriggered: true, methods: methods }));
        }
    }

    /**
     * Adds inference results to the controller's internal list of inference results. This method is called when new inference results are received from the
     * server, and it triggers the processing of these results in the next timer tick, which will handle the application
     * of edits and updating of the UI based on the received inference results.
     * @param params The parameters containing the inference results to be added.
     */
    public addInferenceResults(params: InferenceResultParams): void {
        this.inferenceResults.push(...params.inferenceResults);
    }

    /**
     * Adds an accepted inference edit to the controller's internal list of accepted edits. This method is called when
     * the user accepts an inferred edit through the code lens UI, and the accepted edit will be processed in the next
     * timer tick to apply the changes to the document and update the UI accordingly.
     * @param edit The inference result representing the accepted edit.
     */
    public addAcceptedEdit(edit: InferenceResult): void {
        this.acceptedEdits.push(edit);
    }

    /**
     * Adds a rejected inference edit to the controller's internal list of rejected edits. This method is called when
     * the user rejects an inferred edit through the code lens UI, and the rejected edit will be processed in the next
     * timer tick to discard the changes and update the UI accordingly.
     * @param edit The inference result representing the rejected edit.
     */
    public addRejectedEdit(edit: InferenceResult): void {
        this.rejectedEdits.push(edit);
    }
    
    /**
     * Queues all pending edits associated with the specified method for acceptance. This method is called when the user
     * chooses to accept all edits for a method through the code lens UI, and it processes each pending edit for the method
     * by adding it to the accepted edits queue, which will be handled in the next timer tick to apply the changes to the
     * document and update the UI accordingly.
     * @param method The name of the method for which all pending edits should be accepted.
     */
    public addMethodAcceptedEdits(method: string): void {
        this.queueMethodEdits(method, edit => this.addAcceptedEdit(edit));
    }

    /**
     * Queues all pending edits associated with the specified method for rejection. This method is called when the user
     * chooses to reject all edits for a method through the code lens UI, and it processes each pending edit for the method
     * by adding it to the rejected edits queue, which will be handled in the next timer tick to discard the changes and
     * update the UI accordingly.
     * @param method The name of the method for which all pending edits should be rejected.
     */
    public addMethodRejectedEdits(method: string): void {
        this.queueMethodEdits(method, edit => this.addRejectedEdit(edit));
    }

    /**
     * Starts the inference process for the specified methods by clearing any existing pending edits and their associated
     * decorations, clearing the code lenses, and setting the includeMethods list to either the provided methods or all
     * methods found in the active document if no specific methods are provided. This method is called when a new
     * inference request is initiated, and it prepares the controller to receive and process new inference results for
     * the specified methods.
     * @param methods The list of methods for which inference should be started. If empty, inference will be started for
     * all methods in the active document.
     * @returns A promise that resolves when the setup for the new inference process is complete.
     */
    private async startInference(methods: string[]): Promise<void> {
        this.clearPendingEdits();
        this.codeLensProvider.clear();
        this.includeMethods = methods.length === 0
            ? (await InferenceHelper.findViperMethods(vscode.window.activeTextEditor.document)).map(method => method.name)
            : methods;
    }
    
    /**
     * Handles the application of inference results by decorating the pending edits in the editor and applying the
     * inferred changes. This method is called when new inference results are received, and it ensures that the pending
     * edits are properly displayed and applied in the editor.
     * @param edits The list of inference results to be processed.
     * @returns A promise that resolves when the inference results have been handled.
     */
    private async handleInferenceResults(edits: InferenceResult[]): Promise<void> {
        if(this.pendingEdits.length > 0) {
            return;
        }

        this.inferring = true;
        const editor = vscode.window.activeTextEditor;
        await this.decoratePendingEdits(editor, edits);
        await this.applyInferenceEdits(edits);
        this.inferring = false;
    }

    /**
     * Handles the acceptance of a single inference result by applying the inferred changes to the editor. If the edit is
     * a deletion, the corresponding line is removed from the document, and any pending edits that come after the removed
     * line are shifted accordingly. After processing the accepted edit, it is removed from the list of pending edits and
     * its associated decorations are disposed of.
     * @param edit The inference result to be accepted.
     * @returns A promise that resolves when the acceptance process is complete.
     */
    private async handleInferenceAccept(edit: InferenceResult): Promise<void> {
        const pendingEdit = this.pendingEdits.find(candidate => candidate.originalEdit === edit);
        if(!pendingEdit) {
            Log.log(`Accept: could not find pending edit for ${edit.file_uri} line ${edit.start_line}`, LogLevel.Info);
            return;
        }
        if(this.isDeletionEdit(edit)) {
            const removedLine = pendingEdit.range.start.line;
            await this.removeLineAt(removedLine);
            this.shiftPendingEditsAfterLineRemoval(removedLine);
        }
        await this.removePendingEdit(edit);
    }

    /**
     * Handles the rejection of a single inference result by removing the inferred changes from the editor. If the edit is
     * an insertion, the corresponding line is removed from the document, and any pending edits that come after the removed
     * line are shifted accordingly. After processing the rejected edit, it is removed from the list of pending edits and
     * its associated decorations are disposed of.
     * @param edit The inference result to be rejected.
     * @returns A promise that resolves when the rejection process is complete.
     */
    private async handleInferenceReject(edit: InferenceResult): Promise<void> {
        const pendingEdit = this.pendingEdits.find(candidate => candidate.originalEdit === edit);
        if(!pendingEdit) {
            Log.log(`Reject: could not find pending edit for ${edit.file_uri} line ${edit.start_line}`, LogLevel.Info);
            return;
        }
        if(this.isInsertionEdit(edit)) {
            const removedLine = pendingEdit.range.start.line;
            await this.removeLineAt(removedLine);
            this.shiftPendingEditsAfterLineRemoval(removedLine);
        }
        await this.removePendingEdit(edit);
    }

    /**
     * Removes a pending edit from the list of pending edits and disposes of its associated decorations. If the edit is
     * not found in the list of pending edits, a log message is generated indicating that the edit could not be found.
     * After removing the pending edit, if there are no more pending edits for the associated method, the method is
     * removed from the includeMethods list.
     * @param edit The inference result to be removed.
     * @returns A promise that resolves when the removal process is complete.
     */
    private async removePendingEdit(edit: InferenceResult): Promise<void> {
        const pendingEditIndex = this.pendingEdits.findIndex(pendingEdit => pendingEdit.originalEdit === edit);
        if(pendingEditIndex === -1) {
            Log.log(`Could not find pending edit for edit at ${edit.file_uri} from (${edit.start_line}, ${edit.start_col}) to (${edit.end_line}, ${edit.end_col}) with text: ${edit.edit}`, LogLevel.Info);
            return;
        }

        const pendingEdit = this.pendingEdits[pendingEditIndex];

        pendingEdit.decoration.dispose();
        this.pendingEdits.splice(pendingEditIndex, 1);
        if(this.pendingEdits.find(pe => pe.method === pendingEdit.method) === undefined) {
            this.includeMethods = this.includeMethods.filter(method => method !== pendingEdit.method);
        }
    }

    /**
     * Retrieves the name of the method that contains the specified range. If no method contains the range, an empty
     * string is returned.
     * @param range The range to check for method containment.
     * @returns A promise that resolves to the name of the method containing the range, or an empty string if no method
     * contains the range.
     */
    private async getMethod(range: vscode.Range): Promise<string> {
        const methods = await InferenceHelper.findViperMethods(vscode.window.activeTextEditor.document);
        return methods.find(method => method.range.contains(range))?.name ?? "";
    }

    /**
     * Updates the user interface to reflect the current state of pending edits and included methods. If changes are
     * provided, the method will attempt to adjust the pending edit decorations based on the document changes to ensure
     * they remain correctly positioned. The code lenses are then updated to reflect the current pending edits and
     * included methods, and the UI is refreshed to display the changes.
     * @param changes The document changes to consider when updating the UI.
     */
    private async updateUI(changes: readonly vscode.TextDocumentContentChangeEvent[] = undefined): Promise<void> {
        this.codeLensProvider.clear();
        this.codeLensProvider.refresh();
        const changesCopySorted = changes ? [...changes].sort((a, b) => a.range.start.line - b.range.start.line) : undefined;
        const methods = await InferenceHelper.findViperMethods(vscode.window.activeTextEditor.document);
        if(this.pendingEdits.length > 0) {
            const edits = this.pendingEdits;
            if(changesCopySorted !== undefined) {
                for (const edit of edits) {
                    changesCopySorted.reduce((delta, change) => {
                        if(change.range.end.line < edit.range.start.line) {
                            const innerDelta = change.text.split('\n').length - 1 - change.range.end.line + change.range.start.line;
                            edit.range = InferenceHelper.shiftRange(edit.range, innerDelta);
                            return delta + innerDelta;
                        }
                        return delta;
                    }, 0);
                    this.codeLensProvider.setEditCodeLenses(edit.originalEdit, edit.range);
                }
            }
            else {
                for (const edit of edits) {
                    this.codeLensProvider.setEditCodeLenses(edit.originalEdit, edit.range);
                }
            }
            this.codeLensProvider.setMethodEditCodeLenses(methods.filter(method => this.includeMethods.includes(method.name)))
        } else {
            this.codeLensProvider.setMethodInferCodeLenses(methods)
        }
        this.codeLensProvider.refresh();
    }

    /**
     * Processes a timer tick, handling inference requests, results, and queued edits. Updates the UI if necessary. If
     * the controller is not ready or is currently processing inference, the method returns early. Otherwise, it
     * processes any pending inference requests and results, applies accepted edits, discards rejected edits, and updates
     * the UI based on any inference state and document changes that have occurred.
     * @returns A promise that resolves when the timer tick processing is complete.
     */
    private async processTimerTick(): Promise<void> {
        if(!State.isReady() || this.inferring) {
            return;
        }

        if(!this.disableCodeLenses && (State.isVerifying || State.isInferring)) {
            this.codeLensProvider.clear();
            this.disableCodeLenses = true;
        } else if(this.disableCodeLenses && !State.isVerifying && !State.isInferring) {
            this.requestUpdate = true;
            this.disableCodeLenses = false;
        }

        await this.processInferenceRequests();
        await this.processInferenceResults();
        await this.processQueuedEdits(this.acceptedEdits, edit => this.handleInferenceAccept(edit));
        await this.processQueuedEdits(this.rejectedEdits, edit => this.handleInferenceReject(edit));

        if(!this.disableCodeLenses) {
            if(this.requestUpdate){
                this.requestUpdate = false;
                await this.updateUI()
                    .catch(error => Log.log(`Error updating UI in inference controller timer: ${error}`, LogLevel.Info));
            } else if(this.documentChanges.length > 0) {
                const changes = [...this.documentChanges];
                this.documentChanges = this.documentChanges.filter(change => !changes.includes(change));
                await this.updateUI(changes)
                    .catch(error => Log.log(`Error updating UI in inference controller timer: ${error}`, LogLevel.Info));
            }
        }
    }

    /**
     * Processes any pending inference requests. If there are no pending requests, the method returns early. Otherwise,
     * it starts the inference process for the requested methods and clears the inference request queue.
     * @returns A promise that resolves when the inference requests have been processed.
     */
    private async processInferenceRequests(): Promise<void> {
        if(this.inferenceRequests.length === 0) {
            return;
        }

        await this.startInference(this.inferenceRequests);
        this.inferenceRequests = [];
        this.requestUpdate = true;
    }

    /**
     * Processes any pending inference results. If there are no pending results, the method returns early. Otherwise,
     * it handles the inference results and clears the inference results queue.
     * @returns A promise that resolves when the inference results have been processed.
     */
    private async processInferenceResults(): Promise<void> {
        if(this.inferenceResults.length === 0) {
            return;
        }

        await this.handleInferenceResults(this.inferenceResults);
        this.inferenceResults = [];
        this.requestUpdate = true;
    }

    /**
     * Processes any queued edits using the provided handler function. If the queue is empty, the method returns early.
     * Otherwise, it iterates through the queued edits and applies the handler function to each edit sequentially. After
     * processing all edits, the queue is cleared.
     * @param queue The queue of edits to be processed.
     * @param handler The handler function to apply to each edit.
     * @returns A promise that resolves when all queued edits have been processed.
     */
    private async processQueuedEdits(queue: InferenceResult[], handler: (edit: InferenceResult) => Promise<void>): Promise<void> {
        if(queue.length === 0) {
            return;
        }

        for(const edit of queue) {
            await handler(edit);
        }
        queue.length = 0;
        this.requestUpdate = true;
    }

    /**
     * Queues the edits for a specific method and applies the provided enqueue function to each edit. The edits are
     * sorted by their current range position in descending order to ensure that edits are processed from bottom to top,
     * which prevents line removals from shifting the positions of edits that still need to be processed.
     * @param method The method for which edits are being queued.
     * @param enqueue The function to apply to each queued edit.
     */
    private queueMethodEdits(method: string, enqueue: (edit: InferenceResult) => void): void {
        const edits = this.pendingEdits
            .filter(pendingEdit => pendingEdit.method === method)
            .sort((a, b) => b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character)
            .map(pendingEdit => pendingEdit.originalEdit);

        for (const edit of edits) {
            enqueue(edit);
        }
    }

    /**
     * Shifts the ranges of pending edits after a line has been removed. If a pending edit starts below the removed line,
     * its range is shifted up by one line.
     * @param removedLine The line number that was removed.
     */
    private shiftPendingEditsAfterLineRemoval(removedLine: number): void {
        for(const pe of this.pendingEdits) {
            if(pe.range.start.line > removedLine) {
                pe.range = InferenceHelper.shiftRange(pe.range, -1);
            }
        }
    }

    /**
     * Clears all pending edits and disposes their associated decorations.
     */
    private clearPendingEdits(): void {
        this.pendingEdits.forEach(edit => edit.decoration.dispose());
        this.pendingEdits = [];
    }

    private async decoratePendingEdits(editor: vscode.TextEditor, edits: InferenceResult[]): Promise<void> {
        for(const edit of edits) {
            const decoration = this.createDecoration(edit);
            editor.setDecorations(decoration, [InferenceHelper.toRange(edit, 0, true)]);

            const range = InferenceHelper.toRange(edit);
            const method = await this.getMethod(range);
            if(method !== "" && this.includeMethods.includes(method)) {
                this.pendingEdits.push({ originalEdit: edit, decoration, range, method });
            } else {
                // Dispose decorations not tracked as pending edits to avoid orphaned highlights
                decoration.dispose();
            }
        }
    }

    /**
     * Applies the given inference edits to the workspace. Inserts or replaces text based on the edit type. For insertion
     * edits, the offset is updated to account for the added lines, ensuring that subsequent edits are applied to the
     * correct positions in the document.
     * @param edits The inference edits to apply.
     */
    private async applyInferenceEdits(edits: InferenceResult[]): Promise<void> {
        let offset = 0;
        for(const edit of edits) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            if(this.isInsertionEdit(edit)) {
                workspaceEdit.insert(vscode.Uri.parse(edit.file_uri), InferenceHelper.toRange(edit, offset).start, edit.edit);
                offset += edit.edit.split('\n').length - 1;
            }
            await vscode.workspace.applyEdit(workspaceEdit);
        }
    }

    /**
     * Creates a decoration for the given inference edit. The decoration's background color indicates whether the edit is
     * an insertion or deletion.
     * @param edit The inference edit for which to create a decoration.
     * @returns A TextEditorDecorationType representing the decoration for the edit.
     */
    private createDecoration(edit: InferenceResult): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: this.isInsertionEdit(edit) ? "rgba(0, 255, 0, 0.3)" : "rgba(255, 0, 0, 0.3)",
            isWholeLine: true
        });
    }

    /**
     * Removes the line at the specified line number. This method is used to handle the removal of lines in the
     * document when rejecting insertion edits or accepting deletion edits. 
     * @param line The line number to remove.
     */
    private async removeLineAt(line: number): Promise<void> {
        const document = vscode.window.activeTextEditor.document;
        const lineRange = document.lineAt(line).rangeIncludingLineBreak;
        const workspaceEdit = new vscode.WorkspaceEdit();
        workspaceEdit.replace(document.uri, lineRange, "");
        await vscode.workspace.applyEdit(workspaceEdit);
    }

    /**
     * Determines whether the given inference edit is an insertion edit. An insertion edit is characterized by having
     * non-empty text to be inserted, while a deletion edit would have an empty edit string and indicate the removal of
     * existing text.
     * @param edit The inference edit to check.
     * @returns True if the edit is an insertion edit, false otherwise.
     */
    private isInsertionEdit(edit: InferenceResult): boolean {
        return edit.edit.trim().length > 0;
    }

    /**
     * Determines whether the given inference edit is a deletion edit. A deletion edit is characterized by having an
     * empty edit string and indicating the removal of existing text, while an insertion edit would have non-empty text.
     * @param edit The inference edit to check.
     * @returns True if the edit is a deletion edit, false otherwise.
     */
    private isDeletionEdit(edit: InferenceResult): boolean {
        return !this.isInsertionEdit(edit);
    }
}

/**
 * Provides helper functions for working with inference results, including converting inference edits to VS Code ranges,
 * shifting ranges based on document changes, and finding method symbols in the active document to associate edits with
 * their containing methods. The InferenceHelper class serves as a utility for the InferenceController to manage the
 * positioning and association of inference edits within the source code.
 */
class InferenceHelper {
    private static latestMethods: MethodRange[] = [];

    /**
     * Converts an inference edit to a VS Code range, optionally applying a line delta and restricting to line-only ranges.
     * The method calculates the start and end positions of the range based on the line and column information from the
     * inference edit, adjusting for zero-based indexing and applying the specified line delta. If lineOnly is true, the
     * range will be adjusted to cover entire lines, starting from the first column of the start line and ending at the
     * last column of the end line.
     * @param edit The inference edit to convert.
     * @param delta The number of lines to shift the range by. By default, this is 0.
     * @param lineOnly Whether to restrict the range to whole lines only. By default, this is false.
     * @returns A VS Code range representing the inference edit.
     */
    public static toRange(edit: InferenceResult, delta: number = 0, lineOnly: boolean = false): vscode.Range {
        return new vscode.Range(
                            new vscode.Position(edit.start_line - 1 + delta, lineOnly ? 0 : edit.start_col - 1),
                            new vscode.Position(edit.end_line - 1 + delta, lineOnly ? 0 : edit.end_col - 1)
                        );
    }

    /**
     * Shifts a VS Code range by a specified number of lines. This method is used to adjust the position of ranges in
     * response to document changes that may have added or removed lines.
     * @param range The VS Code range to shift.
     * @param lineDelta The number of lines to shift the range by.
     * @returns A new VS Code range shifted by the specified number of lines.
     */
    public static shiftRange(range: vscode.Range, lineDelta: number): vscode.Range {
        return new vscode.Range(
            new vscode.Position(range.start.line + lineDelta, range.start.character),
            new vscode.Position(range.end.line + lineDelta, range.end.character)
        );
    }

    /**
     * Finds all Viper methods in the given document. This method uses the VS Code Document Symbol Provider to retrieve
     * the symbols in the document, filters for those that are methods, and maps them to a list of MethodRange objects
     * containing the method name and its range in the document. The latest found methods are cached in a static variable
     * for potential reuse if no new symbols are found.
     * @param document The VS Code text document to search for Viper methods.
     * @returns A promise that resolves to an array of MethodRange objects representing the Viper methods in the document.
     */
    public static async findViperMethods(document: vscode.TextDocument): Promise<MethodRange[]> {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if(symbols !== undefined) {
            this.latestMethods = symbols
                .filter(symbol => symbol.kind === vscode.SymbolKind.Method)
                .map(methodSymbol => ({
                    name: methodSymbol.name,
                    range: methodSymbol.range
                }));
        }

        return this.latestMethods;
    }
}