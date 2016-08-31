'use-strict';
"use strict";
const vscode = require('vscode');
const Log_1 = require('./Log');
const Helper_1 = require('./Helper');
class ViperFormatter {
    formatOpenDoc() {
        try {
            let openDoc = vscode.window.activeTextEditor.document;
            if (!Helper_1.Helper.isViperSourceFile(openDoc.uri.toString())) {
                return;
            }
            let indent = "\t";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGb3JtYXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGb3JtYXR0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBOztBQUVaLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBRWpDLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUcxQix5QkFBcUIsVUFFckIsQ0FBQyxDQUY4QjtBQUUvQjtJQUNRLGFBQWE7UUFDbkIsSUFBSSxDQUFDO1lBQ0osSUFBSSxPQUFPLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUM7WUFDdEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFNLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkQsTUFBTSxDQUFDO1lBQ1IsQ0FBQztZQUVELElBQUksTUFBTSxHQUFHLElBQUksQ0FBQztZQUNsQixJQUFJLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDaEMsSUFBSSxJQUFJLEdBQUcsSUFBSSxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDdEMsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1lBQ3BCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztZQUNkLElBQUksZ0JBQWdCLEdBQUcsS0FBSyxDQUFDO1lBQzdCLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztZQUNyQixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7WUFDeEIsSUFBSSxlQUFlLEdBQUcsS0FBSyxDQUFDO1lBQzVCLElBQUksb0JBQW9CLEdBQUcsS0FBSyxDQUFDO1lBQ2pDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsT0FBTyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUN6QyxJQUFJLElBQUksR0FBRyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3RCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7b0JBQzlCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQztvQkFFckIsb0JBQW9CO29CQUNwQixFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO3dCQUM1QixFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDMUMsb0JBQW9CLEdBQUcsS0FBSyxDQUFDO3dCQUM5QixDQUFDO29CQUNGLENBQUM7b0JBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFlLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDLENBQUM7d0JBQy9DLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7NEJBQ2pELEVBQUUsQ0FBQyxDQUFDLElBQUksSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFDO2dDQUNqQixXQUFXLEVBQUUsQ0FBQztnQ0FDZCxlQUFlLEdBQUcsQ0FBQyxDQUFDOzRCQUNyQixDQUFDOzRCQUFDLElBQUksQ0FBQyxDQUFDO2dDQUNQLFlBQVksR0FBRyxDQUFDLENBQUM7Z0NBQ2pCLGVBQWUsR0FBRyxDQUFDLENBQUM7NEJBQ3JCLENBQUM7d0JBQ0YsQ0FBQzt3QkFDRCxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUM7NEJBQ3ZCLFdBQVcsRUFBRSxDQUFDOzRCQUNkLGVBQWUsR0FBRyxDQUFDLENBQUM7d0JBQ3JCLENBQUM7d0JBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssR0FBRyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ3hFLGVBQWUsR0FBRyxDQUFDLENBQUM7d0JBQ3JCLENBQUM7d0JBQ0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLFlBQVksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7NEJBQ3ZGLGVBQWUsR0FBRyxDQUFDLENBQUM7d0JBQ3JCLENBQUM7d0JBQUMsSUFBSSxDQUFDLENBQUM7NEJBQ1AsU0FBUyxHQUFHLEtBQUssQ0FBQzt3QkFDbkIsQ0FBQztvQkFDRixDQUFDO29CQUFDLElBQUksQ0FBQyxDQUFDO3dCQUNQLGVBQWUsR0FBRyxDQUFDLENBQUM7d0JBQ3BCLEVBQUUsQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDOzRCQUN2QixTQUFTLEdBQUcsS0FBSyxDQUFDO3dCQUNuQixDQUFDO29CQUNGLENBQUM7b0JBRUQsRUFBRSxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQzt3QkFDZixZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsWUFBWSxDQUFDLENBQUM7d0JBQ3ZELElBQUksS0FBSyxHQUFHLElBQUksTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxDQUFDLENBQUMsRUFBRSxPQUFPLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQ25GLElBQUksV0FBVyxHQUFHLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDO3dCQUM3RSxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUMvQyxDQUFDO29CQUVELHNCQUFzQjtvQkFDdEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsZUFBZSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO3dCQUN6RSxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDMUMsZUFBZSxHQUFHLElBQUksQ0FBQzs0QkFDdkIsQ0FBQyxFQUFFLENBQUM7d0JBQ0wsQ0FBQzt3QkFDRCxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksR0FBRyxJQUFJLE9BQU8sQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQzs0QkFDMUMsb0JBQW9CLEdBQUcsSUFBSSxDQUFDOzRCQUM1QixDQUFDLEVBQUUsQ0FBQzt3QkFDTCxDQUFDO29CQUNGLENBQUM7b0JBQ0QsaUJBQWlCO29CQUNqQixLQUFLLEdBQUcsQ0FBQyxDQUFDO29CQUNWLGdCQUFnQixHQUFHLGVBQWUsSUFBSSxvQkFBb0IsQ0FBQztvQkFDM0QsWUFBWSxHQUFHLENBQUMsQ0FBQztnQkFDbEIsQ0FBQztnQkFBQyxJQUFJLENBQUMsQ0FBQztvQkFDUCxFQUFFLENBQUMsQ0FBQyxJQUFJLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQzt3QkFDbEIsWUFBWSxFQUFFLENBQUM7d0JBQ2YsZUFBZSxHQUFHLEtBQUssQ0FBQztvQkFDekIsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELE1BQU0sQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNO2dCQUMzQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDaEIsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNaLFNBQUcsQ0FBQyxLQUFLLENBQUMsNkJBQTZCLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFDN0MsQ0FBQztJQUNGLENBQUM7SUFFRCxPQUFjLHlCQUF5QixDQUFDLENBQVM7UUFDaEQsTUFBTSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFBO0lBQzNCLENBQUM7SUFFTyxZQUFZLENBQUMsSUFBSTtRQUN4QixNQUFNLENBQUMsSUFBSSxLQUFLLEdBQUcsSUFBSSxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJLElBQUksQ0FBQztJQUN0RSxDQUFDO0FBd0JGLENBQUM7QUE5SFksc0JBQWMsaUJBOEgxQixDQUFBIn0=