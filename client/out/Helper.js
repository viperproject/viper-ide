'use strict';
const vscode = require('vscode');
const fs = require('fs');
const Log_1 = require('./Log');
class Helper {
    /*public static showFile(filePath: string, column: vscode.ViewColumn) {
        let resource = vscode.Uri.file(filePath);
        let doc;
        //see if the document is already open
        for (let i = 0; i < vscode.workspace.textDocuments.length; i++) {
            let elem = vscode.workspace.textDocuments[i];
            if (elem.fileName === filePath) {
                doc = elem;
            }
        }
        if (doc) {
            //just show it if its open already
            vscode.window.showTextDocument(doc, column, true).then(msg => {
                Log.log("file shown (already open): " + path.basename(msg.document.uri.toString()), LogLevel.Debug)
            });
        } else {
            if (!resource) {
                Log.error("resource is undefined");
                return;
            }
            //open it
            vscode.workspace.openTextDocument(resource).then((doc) => {
                if (!doc) {
                    Log.error("doc is undefined");
                    return;
                }
                vscode.window.showTextDocument(doc, column, true).then(msg => {
                });
            }, (reason) => {
                Log.error("Show file error: " + reason);
            });
        }
    }*/
    static getConfiguration(setting) {
        return vscode.workspace.getConfiguration("viperSettings").get(setting);
    }
    static makeSureFileExists(fileName) {
        try {
            if (!fs.existsSync(fileName)) {
                fs.createWriteStream(fileName).close();
            }
        }
        catch (e) {
            Log_1.Log.error("Cannot create file: " + e);
        }
    }
    static isViperSourceFile(uri) {
        return uri.endsWith(".sil") || uri.endsWith(".vpr");
    }
}
exports.Helper = Helper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0hlbHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFJMUI7SUFFSTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FnQ0c7SUFFSCxPQUFjLGdCQUFnQixDQUFDLE9BQWU7UUFDMUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxPQUFjLGtCQUFrQixDQUFDLFFBQWdCO1FBQzdDLElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMzQyxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLHNCQUFzQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBYyxpQkFBaUIsQ0FBQyxHQUFXO1FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDeEQsQ0FBQztBQUNMLENBQUM7QUFyRFksY0FBTSxTQXFEbEIsQ0FBQSJ9