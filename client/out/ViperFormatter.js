'use-strict';
"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const Helper_1 = require('./Helper');
class ViperFormatter {
    formatOpenDoc() {
        try {
            Log_1.Log.log("Format the document");
            let openDoc = vscode.window.activeTextEditor.document;
            if (!Helper_1.Helper.isViperSourceFile(openDoc.uri.toString())) {
                return;
            }
            let indent = "\t";
            let content = openDoc.getText();
            let replacement = this.format(this.tokenize(content));
            let edit = new vscode.WorkspaceEdit();
            let range = new vscode.Range(openDoc.positionAt(0), openDoc.positionAt(content.length));
            edit.replace(openDoc.uri, range, replacement);
            vscode.workspace.applyEdit(edit).then(params => {
                openDoc.save();
            });
        }
        catch (e) {
            Log_1.Log.error("Error formatting document: " + e);
        }
    }
    tokenize(content) {
        let res = [];
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
                    res.push(token);
                    token = "";
                    res.push("\n");
                    lineComment = false;
                }
                else {
                    token += curr;
                }
            }
            else if (multiLineComment) {
                if (both == "*/") {
                    res.push(token);
                    token = "";
                    res.push("*/");
                    i++;
                    multiLineComment = false;
                }
                else {
                    token += curr;
                }
            }
            else {
                if (both == "//") {
                    if (token.length > 0) {
                        res.push(token);
                        token = "";
                    }
                    res.push("//");
                    i++;
                    lineComment = true;
                }
                else if (both == "/*") {
                    if (token.length > 0) {
                        res.push(token);
                        token = "";
                    }
                    res.push("/*");
                    i++;
                    multiLineComment = true;
                }
                else if (nextThree == "==>") {
                    if (token.length > 0) {
                        res.push(token);
                        token = "";
                    }
                    res.push(nextThree);
                    i += 2;
                }
                else if ("==:=>=<=!=".indexOf(both) >= 0) {
                    if (token.length > 0) {
                        res.push(token);
                        token = "";
                    }
                    res.push(both);
                    i++;
                }
                else if (this.isWhiteSpace(curr) || "()[]{}:,+-\\*><!".indexOf(curr) >= 0) {
                    if (token.length > 0) {
                        res.push(token);
                        token = "";
                    }
                    if (curr == "\n" || (curr.length > 0 && "()[]{}:,+-\\*>=<=!=".indexOf(curr) >= 0)) {
                        res.push(curr);
                    }
                }
                else {
                    token += curr;
                }
            }
        }
        if (token.length > 0) {
            res.push(token);
        }
        return res;
    }
    format(token) {
        let res = "";
        let indent = 0;
        let tab = "\t";
        for (let i = 0; i < token.length; i++) {
            let curr = token[i];
            let next = i + 1 < token.length ? token[i + 1] : "";
            let space = " ";
            if (curr == "//") {
                res += curr + next;
                i++;
                continue;
            }
            else if (curr == "/*") {
                let nextNext = i + 2 < token.length ? token[i + 2] : "";
                res += curr + next + nextNext;
                i += 2;
                continue;
            }
            else if ("([".indexOf(curr) >= 0 || "())]:,".indexOf(next) >= 0) {
                space = "";
            }
            else if (curr == "{") {
                space = (next == "\n" ? "" : "\n") + this.getIndent(tab, indent, next);
                indent++;
            }
            else if (next == "}") {
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
    getIndent(tab, indent, next) {
        return tab.repeat(indent + (next == "requires" || next == "ensures" || next == "invariant" ? 1 : 0));
    }
    static containsSpecialCharacters(s) {
        return s.indexOf('⦿') >= 0;
    }
    isWhiteSpace(char) {
        return char === " " || char === "\t" || char == "\r" || char == "\n";
    }
}
exports.ViperFormatter = ViperFormatter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGb3JtYXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGb3JtYXR0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBOztBQUVaLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBRWpDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQix5QkFBcUIsVUFFckIsQ0FBQyxDQUY4QjtBQUUvQjtJQUNRLGFBQWE7UUFDbkIsSUFBSSxDQUFDO1lBQ0osU0FBRyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1lBQy9CLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDO1lBQ3RELEVBQUUsQ0FBQyxDQUFDLENBQUMsZUFBTSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3ZELE1BQU0sQ0FBQztZQUNSLENBQUM7WUFDRCxJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUM7WUFDbEIsSUFBSSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2hDLElBQUksV0FBVyxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBRXRELElBQUksSUFBSSxHQUFHLElBQUksTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1lBQ3RDLElBQUksS0FBSyxHQUFHLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUE7WUFDdkYsSUFBSSxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxXQUFXLENBQUMsQ0FBQztZ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