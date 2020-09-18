"use strict";
/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
Object.defineProperty(exports, "__esModule", { value: true });
var LogType;
(function (LogType) {
    LogType[LogType["Comment"] = 0] = "Comment";
    LogType[LogType["Pop"] = 1] = "Pop";
    LogType[LogType["Push"] = 2] = "Push";
    LogType[LogType["SetOption"] = 3] = "SetOption";
    LogType[LogType["DeclareDatatypes"] = 4] = "DeclareDatatypes";
    LogType[LogType["DeclareConst"] = 5] = "DeclareConst";
    LogType[LogType["DeclareSort"] = 6] = "DeclareSort";
    LogType[LogType["DeclareFun"] = 7] = "DeclareFun";
    LogType[LogType["DefineConst"] = 8] = "DefineConst";
    LogType[LogType["DefineDatatypes"] = 9] = "DefineDatatypes";
    LogType[LogType["DefineSort"] = 10] = "DefineSort";
    LogType[LogType["DefineFun"] = 11] = "DefineFun";
    LogType[LogType["Assert"] = 12] = "Assert";
    LogType[LogType["CheckSat"] = 13] = "CheckSat";
    LogType[LogType["GetInfo"] = 14] = "GetInfo";
})(LogType = exports.LogType || (exports.LogType = {}));
class LogEntry {
    constructor(type, data) {
        this.data = data.trim();
        this.type = type;
        this.typeName = type.toString;
    }
}
exports.LogEntry = LogEntry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nRW50cnkuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL0xvZ0VudHJ5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0lBTUk7O0FBRUosSUFBWSxPQWdCWDtBQWhCRCxXQUFZLE9BQU87SUFDZiwyQ0FBTyxDQUFBO0lBQ1AsbUNBQUcsQ0FBQTtJQUNILHFDQUFJLENBQUE7SUFDSiwrQ0FBUyxDQUFBO0lBQ1QsNkRBQWdCLENBQUE7SUFDaEIscURBQVksQ0FBQTtJQUNaLG1EQUFXLENBQUE7SUFDWCxpREFBVSxDQUFBO0lBQ1YsbURBQVcsQ0FBQTtJQUNYLDJEQUFlLENBQUE7SUFDZixrREFBVSxDQUFBO0lBQ1YsZ0RBQVMsQ0FBQTtJQUNULDBDQUFNLENBQUE7SUFDTiw4Q0FBUSxDQUFBO0lBQ1IsNENBQU8sQ0FBQTtBQUNYLENBQUMsRUFoQlcsT0FBTyxHQUFQLGVBQU8sS0FBUCxlQUFPLFFBZ0JsQjtBQUVELE1BQWEsUUFBUTtJQU1qQixZQUFZLElBQWEsRUFBRSxJQUFZO1FBQ25DLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ3hCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksQ0FBQyxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQztJQUNsQyxDQUFDO0NBQ0o7QUFYRCw0QkFXQyJ9