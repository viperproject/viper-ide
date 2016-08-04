'use strict';
const vscode = require('vscode');
const fs = require('fs');
const Log_1 = require('./Log');
class Helper {
    static showFile(filePath, column) {
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
                Log_1.Log.log("file shown (already open): " + msg.document.fileName);
            });
        }
        else {
            //open it
            vscode.workspace.openTextDocument(resource).then((doc) => {
                vscode.window.showTextDocument(doc, column, true).then(msg => {
                    Log_1.Log.log("file shown: " + msg.document.fileName);
                });
            }, (reason) => {
                Log_1.Log.error("Show file error: " + reason);
            });
        }
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSGVscGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL0hlbHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixNQUFZLE1BQU0sV0FBTSxRQUFRLENBQUMsQ0FBQTtBQUNqQyxNQUFZLEVBQUUsV0FBTSxJQUFJLENBQUMsQ0FBQTtBQUN6QixzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUI7SUFFSSxPQUFjLFFBQVEsQ0FBQyxRQUFnQixFQUFFLE1BQXlCO1FBQzlELElBQUksUUFBUSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ3pDLElBQUksR0FBRyxDQUFDO1FBQ1IscUNBQXFDO1FBQ3JDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDN0QsSUFBSSxJQUFJLEdBQUcsTUFBTSxDQUFDLFNBQVMsQ0FBQyxhQUFhLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0MsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUM3QixHQUFHLEdBQUcsSUFBSSxDQUFDO1lBQ2YsQ0FBQztRQUNMLENBQUM7UUFDRCxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQ04sa0NBQWtDO1lBQ2xDLE1BQU0sQ0FBQyxNQUFNLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRztnQkFDdEQsU0FBRyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBO1lBQ2xFLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQztRQUFDLElBQUksQ0FBQyxDQUFDO1lBQ0osU0FBUztZQUNULE1BQU0sQ0FBQyxTQUFTLENBQUMsZ0JBQWdCLENBQUMsUUFBUSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRztnQkFDakQsTUFBTSxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHO29CQUN0RCxTQUFHLENBQUMsR0FBRyxDQUFDLGNBQWMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFBO2dCQUNuRCxDQUFDLENBQUMsQ0FBQztZQUNQLENBQUMsRUFBRSxDQUFDLE1BQU07Z0JBQ04sU0FBRyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsR0FBRyxNQUFNLENBQUMsQ0FBQztZQUM1QyxDQUFDLENBQUMsQ0FBQztRQUNQLENBQUM7SUFDTCxDQUFDO0lBRUQsT0FBYyxnQkFBZ0IsQ0FBQyxPQUFlO1FBQzFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDLGVBQWUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUMzRSxDQUFDO0lBRUQsT0FBYyxrQkFBa0IsQ0FBQyxRQUFnQjtRQUM3QyxJQUFJLENBQUM7WUFDRCxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMzQixFQUFFLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDM0MsQ0FBQztRQUNMLENBQUU7UUFBQSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ1QsU0FBRyxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMxQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQWMsaUJBQWlCLENBQUMsR0FBVztRQUN2QyxNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ3hELENBQUM7QUFDTCxDQUFDO0FBN0NZLGNBQU0sU0E2Q2xCLENBQUEifQ==