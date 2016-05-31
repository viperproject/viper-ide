'use strict';
class Timer {
    constructor(func, timeout) {
        this.lastExec = Date.now();
        this.interval = null;
        this.checkingFrequency = 200;
        this.interval = setInterval(() => {
            let now = Date.now();
            if (now - this.lastExec > timeout) {
                this.lastExec = now;
                func();
            }
        }, this.checkingFrequency);
    }
    stop() {
        clearInterval(this.interval);
    }
    dispose() {
        this.stop();
    }
    reset() {
        this.lastExec = Date.now();
    }
}
exports.Timer = Timer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVGltZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvVGltZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDO0FBRWI7SUFLSSxZQUFZLElBQUksRUFBRSxPQUFPO1FBSHpCLGFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDdEIsYUFBUSxHQUFHLElBQUksQ0FBQztRQUNoQixzQkFBaUIsR0FBRyxHQUFHLENBQUM7UUFFcEIsSUFBSSxDQUFDLFFBQVEsR0FBRyxXQUFXLENBQUM7WUFDeEIsSUFBSSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3JCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQyxDQUFDLENBQUM7Z0JBQ2hDLElBQUksQ0FBQyxRQUFRLEdBQUcsR0FBRyxDQUFDO2dCQUNwQixJQUFJLEVBQUUsQ0FBQztZQUNYLENBQUM7UUFDTCxDQUFDLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVELElBQUk7UUFDQSxhQUFhLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxPQUFPO1FBQ0gsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO0lBQ2hCLENBQUM7SUFFRCxLQUFLO1FBQ0QsSUFBSSxDQUFDLFFBQVEsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7SUFDL0IsQ0FBQztBQUNMLENBQUM7QUExQlksYUFBSyxRQTBCakIsQ0FBQSJ9