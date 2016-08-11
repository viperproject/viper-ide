'use-strict';
"use strict";
const vscode = require('vscode');
const StateVisualizer_1 = require('./StateVisualizer');
const Log_1 = require('./Log');
const ViperProtocol_1 = require('./ViperProtocol');
const fs = require('fs');
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
        vscode.workspace.applyEdit(edit);
    }
    static addCharacterToDecorationOptionLocations() {
        if (StateVisualizer_1.StateVisualizer.showStates) {
            Log_1.Log.log("addCharacterToDecorationOptionLocations", ViperProtocol_1.LogLevel.Debug);
            let openDoc = vscode.window.activeTextEditor.document;
            let edit = new vscode.WorkspaceEdit();
            StateVisualizer_1.StateVisualizer.decorationOptions.forEach((element, i) => {
                let p = StateVisualizer_1.StateVisualizer.stepInfo[i].originalPosition;
                //need to create a propper vscode.Position object
                let pos = new vscode.Position(p.line, p.character);
                edit.insert(openDoc.uri, pos, '⦿');
            });
            vscode.workspace.applyEdit(edit);
        }
    }
    static containsSpecialCharacters(s) {
        return s.indexOf('⦿') >= 0;
    }
    static removeSpecialCharacters(callback) {
        try {
            let openDoc = vscode.window.activeTextEditor.document;
            Log_1.Log.log("Remove Special Characters", ViperProtocol_1.LogLevel.Debug);
            let edit = new vscode.WorkspaceEdit();
            let content = openDoc.getText();
            let start = 0;
            let found = false;
            for (let i = 0; i < content.length; i++) {
                if (content[i] === '⦿') {
                    if (!found) {
                        found = true;
                        start = i;
                    }
                }
                else if (found) {
                    let range = new vscode.Range(openDoc.positionAt(start), openDoc.positionAt(i));
                    edit.delete(openDoc.uri, range);
                    found = false;
                }
            }
            vscode.workspace.applyEdit(edit).then(resolve => {
                if (resolve) {
                    vscode.window.activeTextEditor.document.save().then(saved => {
                        callback();
                    });
                }
            });
        }
        catch (e) {
            Log_1.Log.error("Eror removing special characters: " + e);
        }
    }
    static removeSpecialCharsFromClosedDocument(filename, callback) {
        fs.readFile(filename, (err, data) => {
            if (!err) {
                let newData = data.toString();
                if (newData.indexOf("⦿") >= 0) {
                    newData = newData.replace(/⦿/g, "");
                    fs.writeFileSync(filename, newData);
                }
                callback();
            }
            else {
                Log_1.Log.error("cannot remove special chars from closed file: " + err.message);
            }
        });
    }
    isWhiteSpace(char) {
        return char === " " || char === "\t" || char == "\r" || char == "\n";
    }
}
exports.ViperFormatter = ViperFormatter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlwZXJGb3JtYXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVmlwZXJGb3JtYXR0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFBOztBQUVaLE1BQVksTUFBTSxXQUFNLFFBQVEsQ0FBQyxDQUFBO0FBQ2pDLGtDQUFtRCxtQkFBbUIsQ0FBQyxDQUFBO0FBQ3ZFLHNCQUFrQixPQUFPLENBQUMsQ0FBQTtBQUMxQixnQ0FBdUIsaUJBQ3ZCLENBQUMsQ0FEdUM7QUFDeEMsTUFBWSxFQUFFLFdBQU0sSUFBSSxDQUFDLENBQUE7QUFFekI7SUFDUSxhQUFhO1FBQ25CLElBQUksTUFBTSxHQUFHLElBQUksQ0FBQztRQUVsQixJQUFJLE9BQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsQ0FBQztRQUN0RCxJQUFJLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEMsSUFBSSxJQUFJLEdBQUcsSUFBSSxNQUFNLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDdEMsSUFBSSxXQUFXLEdBQUcsQ0FBQyxDQUFDO1FBQ3BCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLElBQUksWUFBWSxHQUFHLENBQUMsQ0FBQztRQUNyQixJQUFJLGVBQWUsR0FBRyxDQUFDLENBQUM7UUFDeEIsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDekMsSUFBSSxJQUFJLEdBQUcsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3RCLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzlCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQztnQkFDckIsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFD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