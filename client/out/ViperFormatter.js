'use-strict';
"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
class ViperFormatter {
    formatOpenDoc() {
        try {
            let indent = "\t";
            let openDoc = vscode.window.activeTextEditor.document;
            let content = openDoc.getText();
            let edit = new vscode.WorkspaceEdit();
            let indentLevel = 0;
            let start = 0;
            let startIsInComment = false;
            let newLineCount = 0;
            let minNewLineCount = 0;
            let isInLineComment = false;
            let isInMultiLineComment = false;
            for (let i = 0; i < content.length; i++) {
                let curr = content[i];
                if (!this.isWhiteSpace(curr)) {
                    let doReplace = true;
                    //detect comment end
                    if (i + 1 < content.length) {
                        if (curr == '*' && content[i + 1] == "/") {
                            isInMultiLineComment = false;
                        }
                    }
                    if (!isInLineComment && !isInMultiLineComment) {
                        if (content[start] === '{' && !startIsInComment) {
                            if (curr != '}') {
                                indentLevel++;
                                minNewLineCount = 1;
                            }
                            else {
                                newLineCount = 0;
                                minNewLineCount = 0;
                            }
                        }
                        else if (curr === "}") {
                            indentLevel--;
                            minNewLineCount = 1;
                        }
                        else if (curr === '{' || (content[start] === '}' && !startIsInComment)) {
                            minNewLineCount = 1;
                        }
                        else if (newLineCount > 0 || (this.isWhiteSpace(content[start]) && !startIsInComment)) {
                            minNewLineCount = 0;
                        }
                        else {
                            doReplace = false;
                        }
                    }
                    else {
                        minNewLineCount = 0;
                        if (newLineCount <= 0) {
                            doReplace = false;
                        }
                    }
                    if (doReplace) {
                        newLineCount = Math.max(minNewLineCount, newLineCount);
                        let range = new vscode.Range(openDoc.positionAt(start + 1), openDoc.positionAt(i));
                        let replacement = ("\r\n".repeat(newLineCount)) + ("\t".repeat(indentLevel));
                        edit.replace(openDoc.uri, range, replacement);
                    }
                    //detect comment start
                    if (i + 1 < content.length && !isInLineComment && !isInMultiLineComment) {
                        if (curr == '/' && content[i + 1] == "/") {
                            isInLineComment = true;
                            i++;
                        }
                        if (curr == '/' && content[i + 1] == "*") {
                            isInMultiLineComment = true;
                            i++;
                        }
                    }
                    //add a new line?
                    start = i;
                    startIsInComment = isInLineComment || isInMultiLineComment;
                    newLineCount = 0;
                }
                else {
                    if (curr == "\n") {
                        newLineCount++;
                        isInLineComment = false;
                    }
                }
            }
            vscode.workspace.applyEdit(edit).then(params => {
                openDoc.save();
            });
        }
        catch (e) {
            Log_1.Log.error("Error formatting document: " + e);
        }
    }
    static containsSpecialCharacters(s) {
        return s.indexOf('⦿') >= 0;
    }
    isWhiteSpace(char) {
        return char === " " || char === "\t" || char == "\r" || char == "\n";
    }
}
exports.ViperFormatter = ViperFormatter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGb3JtYXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGb3JtYXR0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBOztBQUVaLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBRWpDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUkxQjtJQUNRLGFBQWE7UUFDbkIsSUFBRyxDQUFDO1lBQ0osSUFBSSxNQUFNLEdBQUcsSUFBSSxDQUFDO1lBRWxCLElBQUksT0FBTyxHQUFHLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDO1lBQ3RELElBQUksT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNoQyxJQUFJLElBQUksR0FBRyxJQUFJLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUN0QyxJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7WUFDcEIsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDO1lBQ2QsSUFBSSxnQkFBZ0IsR0FBRyxLQUFLLENBQUM7WUFDN0IsSUFBSSxZQUFZLEdBQUcsQ0FBQyxDQUFDO1lBQ3JCLElBQUksZUFBZSxHQUFHLENBQUMsQ0FBQztZQUN4QixJQUFJLGVBQWUsR0FBRyxLQUFLLENBQUM7WUFDNUIsSUFBSSxvQkFBb0IsR0FBRyxLQUFLLENBQUM7WUFDakMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7Z0JBQ3pDLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDOUIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDO29CQUVyQixvQkFBb0I7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