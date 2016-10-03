'use-strict'

import * as vscode from 'vscode';
import {Log} from './Log';
import {LogLevel} from './ViperProtocol'
import {Helper} from './Helper'

export class ViperFormatter {
	public formatOpenDoc() {
		try {
			Log.log("Format the document");
			let openDoc = vscode.window.activeTextEditor.document;
			if (!Helper.isViperSourceFile(openDoc.uri.toString())) {
				return;
			}
			let indent = "\t";
			let content = openDoc.getText();
			let replacement = this.format(this.tokenize(content));

			let edit = new vscode.WorkspaceEdit();
			let range = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(content.length))
			edit.replace(openDoc.uri, range, replacement);
			vscode.workspace.applyEdit(edit).then(params => {
				openDoc.save();
			});
		} catch (e) {
			Log.error("Error formatting document: " + e)
		}
	}

	private tokenize(content: string): string[] {
		let res: string[] = [];
		let token = "";
		let lineComment = false;
		let multiLineComment = false;
		for (let i = 0; i <= content.length; i++) {
			let curr = i - 1 >= 0 ? content[i - 1] : "";
			let next = i < content.length ? content[i] : "";
			let nextNext = i + 1 < content.length ? content[i + 1] : "";
			let both = curr + next;
			let nextThree = both + nextNext;
			if (lineComment) {
				if (curr == "\n") {
					res.push(token); token = "";
					res.push("\n");
					lineComment = false;
				} else {
					token += curr;
				}
			}
			else if (multiLineComment) {
				if (both == "*/") {
					res.push(token); token = "";
					res.push("*/"); i++;
					multiLineComment = false;
				} else {
					token += curr;
				}
			}
			else {
				if (both == "//") {
					if (token.length > 0) {
						res.push(token); token = "";
					}
					res.push("//"); i++;
					lineComment = true;
				} else if (both == "/*") {
					if (token.length > 0) {
						res.push(token); token = "";
					}
					res.push("/*"); i++;
					multiLineComment = true;
				} else if (nextThree == "==>") {
					if (token.length > 0) {
						res.push(token); token = "";
					}
					res.push(nextThree); i += 2;
				} else if ("==:=>=<=!=".indexOf(both) >= 0) {
					if (token.length > 0) {
						res.push(token); token = "";
					}
					res.push(both); i++;
				} else if (this.isWhiteSpace(curr) || "()[]{}:,+-\\*><!".indexOf(curr) >= 0) {
					if (token.length > 0) {
						res.push(token); token = "";
					}
					if (curr == "\n" || (curr.length > 0 && "()[]{}:,+-\\*>=<=!=".indexOf(curr) >= 0)) {
						res.push(curr);
					}
				} else {
					token += curr;
				}
			}
		}
		if (token.length > 0) { res.push(token) }
		return res;
	}

	private format(token: string[]): string {
		let res = "";
		let indent = 0;
		let tab = "\t";
		for (let i = 0; i < token.length; i++) {
			let curr = token[i];
			let next = i + 1 < token.length ? token[i + 1] : "";
			let space = " ";
			if (curr == "//") {
				res += curr + next;
				i++
				continue;
			} else if (curr == "/*") {
				let nextNext = i + 2 < token.length ? token[i + 2] : "";
				res += curr + next + nextNext;
				i += 2;
				continue;
			} else if ("([".indexOf(curr) >= 0 || "())]:,".indexOf(next) >= 0) {
				space = "";
			} else if (curr == "{") {
				space = (next == "\n" ? "" : "\n") + this.getIndent(tab, indent, next);
				indent++;
			} else if (next == "}") {
				indent--;
				space = (curr == "\n" ? "" : "\n") + this.getIndent(tab, indent, next);
			}
			if (curr == "\n") {
				space = this.getIndent(tab, indent, next);
			}
			res += curr + space;
		}
		return res;
	}

	private getIndent(tab: string, indent: number, next: string): string {
		return tab.repeat(indent + (next == "requires" || next == "ensures" || next == "invariant" ? 1 : 0));
	}

	public static containsSpecialCharacters(s: string): boolean {
		return s.indexOf('⦿') >= 0
	}

	private isWhiteSpace(char) {
		return char === " " || char === "\t" || char == "\r" || char == "\n";
	}
}