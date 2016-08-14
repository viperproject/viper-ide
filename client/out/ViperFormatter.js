'use-strict';
"use strict";
const vscode = require('vscode');
class ViperFormatter {
    formatOpenDoc() {
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
                else if (curr === '{' || content[start] === '}') {
                    minNewLineCount = 1;
                }
                else if (newLineCount > 0 || this.isWhiteSpace(content[start])) {
                    minNewLineCount = 0;
                }
                else {
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
            }
            else {
                if (curr == "\n") {
                    newLineCount++;
                }
            }
        }
        vscode.workspace.applyEdit(edit).then(params => {
            openDoc.save();
        });
    }
    static containsSpecialCharacters(s) {
        return s.indexOf('⦿') >= 0;
    }
    isWhiteSpace(char) {
        return char === " " || char === "\t" || char == "\r" || char == "\n";
    }
}
exports.ViperFormatter = ViperFormatter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGb3JtYXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGb3JtYXR0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBOztBQUVaLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBTWpDO0lBQ1EsYUFBYTtRQUNuQixJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUM7UUFFbEIsSUFBSSxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUM7UUFDdEQsSUFBSSxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ2hDLElBQUksSUFBSSxHQUFHLElBQUksTUFBTSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3RDLElBQUksV0FBVyxHQUFHLENBQUMsQ0FBQztRQUNwQixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLFlBQVksR0FBRyxDQUFDLENBQUM7UUFDckIsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDO1FBQ3hCLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO1lBQ3pDLElBQUksSUFBSSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN0QixFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUM5QixJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7Z0JBQ3JCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO29CQUM1QixFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQzt3QkFDakIsV0FBVyxFQUFFLENBQUM7d0JBQ2QsZUFBZSxHQUFH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