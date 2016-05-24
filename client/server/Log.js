'use strict';
var Log = (function () {
    function Log() {
    }
    Log.log = function (message) {
        this.connection.console.log("S: " + message);
    };
    Log.error = function (message) {
        this.connection.console.error("S: " + message);
    };
    Log.logWithOrigin = function (origin, message) {
        this.connection.console.log(origin + ": " + message);
    };
    return Log;
}());
exports.Log = Log;
//# sourceMappingURL=Log.js.map