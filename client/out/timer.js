'use strict';
var Timer = (function () {
    function Timer(func, timeout) {
        var _this = this;
        this.lastExec = Date.now();
        this.interval = null;
        this.checkingFrequency = 200;
        this.interval = setInterval(function () {
            var now = Date.now();
            if (now - _this.lastExec > timeout) {
                _this.lastExec = now;
                func();
            }
        }, this.checkingFrequency);
    }
    Timer.prototype.stop = function () {
        clearInterval(this.interval);
    };
    Timer.prototype.dispose = function () {
        this.stop();
    };
    Timer.prototype.reset = function () {
        this.lastExec = Date.now();
    };
    return Timer;
}());
exports.Timer = Timer;
//# sourceMappingURL=Timer.js.map