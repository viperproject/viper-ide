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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0hlbHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixzQkFBb0IsT0FBTyxDQUFDLENBQUE7QUFJNUI7SUFJSTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0FnQ0c7SUFFSCxPQUFjLGdCQUFnQixDQUFDLE9BQWU7UUFDMUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsZUFBZSxDQUFDLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzNFLENBQUM7SUFFRCxPQUFjLGtCQUFrQixDQUFDLFFBQWdCO1FBQzdDLElBQUksQ0FBQztZQUNELEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzNCLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUMzQyxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLHNCQUFzQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQzFDLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBYyxpQkFBaUIsQ0FBQyxHQUF3QjtRQUNwRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUM7UUFDdkIsSUFBSSxTQUFTLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsSUFBSSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksU0FBUyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0lBQzVFLENBQUM7SUFFRCxPQUFjLFNBQVMsQ0FBQyxDQUFzQixFQUFFLENBQXNCO1FBQ2xFLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQztRQUMzQixNQUFNLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxPQUFjLFdBQVcsQ0FBQyxHQUF3QjtRQUM5QyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQztZQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7UUFDdEIsRUFBRSxDQUFDLENBQUMsT0FBTyxHQUFHLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQztZQUMxQixNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2YsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUMxQixDQUFDO0lBQ0wsQ0FBQztJQUVELE9BQWMsV0FBVyxDQUFDLEdBQXdCO1FBQzlDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztRQUN0QixFQUFFLENBQUMsQ0FBQyxPQUFPLEdBQUcsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxDQUFDO1FBQUMsSUFBSSxDQUFDLENBQUM7WUFDSixNQUFNLENBQUMsR0FBRyxDQUFDO1FBQ2YsQ0FBQztJQUNMLENBQUM7QUFDTCxDQUFDO0FBOUVpQix1QkFBZ0IsR0FBYSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQztBQUZuRCxjQUFNLFNBZ0ZsQixDQUFBIn0=