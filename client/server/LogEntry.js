"use strict";
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
})(exports.LogType || (exports.LogType = {}));
var LogType = exports.LogType;
var LogEntry = (function () {
    function LogEntry(type, data) {
        this.data = data.trim();
        this.type = type;
        this.typeName = type.toString;
    }
    return LogEntry;
}());
exports.LogEntry = LogEntry;
//# sourceMappingURL=LogEntry.js.map