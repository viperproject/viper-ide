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
    //unused
    static makeSureFileExists(fileName) {
        try {
            if (!fs.existsSync(fileName)) {
                fs.createWriteStream(fileName).close();
            }
            fs.accessSync(fileName);
        }
        catch (e) {
            Log_1.Log.error("Error making sure " + fileName + " exists. Are you missing access permission? " + e);
        }
    }
    static isViperSourceFile(uri) {
        if (!uri)
            return false;
        let uriString = this.uriToString(uri);
        return this.viperFileEndings.some(ending => uriString.endsWith(ending));
    }
    static uriEquals(a, b) {
        if (!a || !b)
            return false;
        return this.uriToString(a) == this.uriToString(b);
    }
    static uriToString(uri) {
        if (!uri)
            return null;
        if (typeof uri === "string") {
            return uri;
        }
        else {
            return uri.toString();
        }
    }
    static uriToObject(uri) {
        if (!uri)
            return null;
        if (typeof uri === "string") {
            return vscode.Uri.parse(uri);
        }
        else {
            return uri;
        }
    }
}
Helper.viperFileEndings = [".vpr", ".sil"];
exports.Helper = Helper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0hlbHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixzQkFBb0IsT0FBTyxDQUFDLENBQUE7QUFJNUI7SUFJSTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FnQ0c7SUFFSCxPQUFjLGdCQUFnQixDQUFDLE9BQWU7UUFDMUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxRQUFRO0lBQ1IsT0FBYyxrQkFBa0IsQ0FBQyxRQUFnQjtRQUM3QyxJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixFQUFFLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDM0MsQ0FBQztZQUNELEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUIsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLG9CQUFvQixHQUFHLFFBQVEsR0FBRyw4Q0FBOEMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNwRyxDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWMsaUJBQWlCLENBQUMsR0FBd0I7UUFDcEQsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFBQyxNQUFNLENBQUMsS0FBSyxDQUFDO1FBQ3ZCLElBQUksU0FBUyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDdEMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLFNBQVMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztJQUM1RSxDQUFDO0lBRUQsT0FBYyxTQUFTLENBQUMsQ0FBc0IsRUFBRSxDQUFzQjtRQUNsRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDM0IsTUFBTSxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsT0FBYyxXQUFXLENBQUMsR0FBd0I7UUFDOUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUM7WUFBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1FBQ3RCLEVBQUUsQ0FBQyxDQUFDLE9BQU8sR0FBRyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7WUFDMUIsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmLENBQUM7UUFBQyxJQUFJLENBQUMsQ0FBQztZQUNKLE1BQU0sQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDMUIsQ0FBQztJQUNMLENBQUM7SUFFRCxPQUFjLFdBQVcsQ0FBQyxHQUF3QjtRQUM5QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDdEIsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMxQixNQUFNLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDakMsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUNmLENBQUM7SUFDTCxDQUFDO0FBQ0wsQ0FBQztBQWhGaUIsdUJBQWdCLEdBQWEsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFGbkQsY0FBTSxTQWtGbEIsQ0FBQSJ9