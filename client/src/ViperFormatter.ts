'use-strict'

import * as vscode from 'vscode';
import {MyDecorationOptions, StateVisualizer} from './StateVisualizer';
import {Log} from './Log';
import {LogLevel} from './ViperProtocol'
import * as fs from 'fs';

export class ViperFormatter {
	public formatOpenDoc() {
		let indent = "\t";

		let openDoc = vscode.window.activeTextEditor.document;
		let content = openDoc.getText();
		let edit = new vscode.WorkspaceEdit();
		let indentLevel = 0;
		let start = 0;
		let newLineCount = 0;
		let minNewLineCount = 0;
		for (let i = 0; i < content.length; i++) {
			let curr = content[i];
			if (!this.isWhiteSpace(curr)) {
				let doReplace = true;
				if (content[start] === '{') {
					if (curr != '}') {
						indentLevel++;
						minNewLineCount = 1;
					} else {
						newLineCount = 0;
						minNewLineCount = 0;
					}
				}
				else if (curr === "}") {
					indentLevel--;
					minNewLineCount = 1;
				}
				else if (curr === '{' || content[start] === '}') {
					minNewLineCount = 1;
				}
				else if (newLineCount > 0 || this.isWhiteSpace(content[start])) {
					minNewLineCount = 0;
				} else {
					doReplace = false;
				}

				if (doReplace) {
					newLineCount = Math.max(minNewLineCount, newLineCount);
					let range = new vscode.Range(openDoc.positionAt(start + 1), openDoc.positionAt(i));
					let replacement = ("\r\n".repeat(newLineCount)) + ("\t".repeat(indentLevel));
					edit.replace(openDoc.uri, range, replacement);
				}
				//add a new line?
				start = i;
				newLineCount = 0;
			} else {
				if (curr == "\n") {
					newLineCount++;
				}
			}
		}
		vscode.workspace.applyEdit(edit).then(params => {
			openDoc.save();
		});
	}

	public static containsSpecialCharacters(s: string): boolean {
		return s.indexOf('⦿') >= 0
	}

	private isWhiteSpace(char) {
		return char === " " || char === "\t" || char == "\r" || char == "\n";
	}

	// public provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
	// 	return document.save().then(() => {
	// 		return new Promise((resolve, reject) => {
	// 			try {
	// 				let indent = "\t";
	// 				if (options.insertSpaces) {
	// 					indent = " ".repeat(options.tabSize);
	// 				}
	// 				let edits: vscode.TextEdit[] = [];
	// 				let index = document.getText().indexOf("()");
	// 				if(index >=0){
	// 					let start =document.positionAt(index);
	// 					edits.push(vscode.TextEdit.insert(start,"test"));
	// 				}
	// 				resolve(edits);
	// 			} catch (e) {
	// 				reject(e);
	// 			}
	// 		});
	// 	});
	// }

}