'use strict';
const ViperProtocol_1 = require('./ViperProtocol');
const Log_1 = require('./Log');
class Progress {
    constructor(json) {
        try {
            this.nofPredicates = json.nofPredicates;
            this.nofMethods = json.nofMethods;
            this.nofFunctions = json.nofFunctions;
            this.currentFunctions = 0;
            this.currentMethods = 0;
            this.currentPredicates = 0;
        }
        catch (e) {
            Log_1.Log.error("Error initializing progress: " + e);
        }
    }
    updateProgress(json) {
        try {
            switch (json.type) {
                case ViperProtocol_1.BackendOutputType.FunctionVerified:
                    this.currentFunctions++;
                    break;
                case ViperProtocol_1.BackendOutputType.MethodVerified:
                    this.currentMethods++;
                    break;
                case ViperProtocol_1.BackendOutputType.PredicateVerified:
                    this.currentPredicates++;
                    break;
            }
        }
        catch (e) {
            Log_1.Log.error("Error updating progress: " + e);
        }
    }
    toPercent() {
        let total = this.nofFunctions + this.nofMethods + this.nofPredicates;
        let current = this.currentFunctions + this.currentMethods + this.currentPredicates;
        return 100 * current / total;
    }
}
exports.Progress = Progress;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVG90YWxQcm9ncmVzcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NlcnZlci9zcmMvVG90YWxQcm9ncmVzcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxZQUFZLENBQUM7QUFFYixnQ0FBK0MsaUJBQWlCLENBQUMsQ0FBQTtBQUNqRSxzQkFBa0IsT0FBTyxDQUFDLENBQUE7QUFFMUI7SUFTSSxZQUFZLElBQW1CO1FBQzNCLElBQUksQ0FBQztZQUNELElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQztZQUN4QyxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDbEMsSUFBSSxDQUFDLFlBQVksR0FBRyxJQUFJLENBQUMsWUFBWSxDQUFDO1lBQ3RDLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxDQUFDLENBQUM7WUFDMUIsSUFBSSxDQUFDLGNBQWMsR0FBRyxDQUFDLENBQUM7WUFDeEIsSUFBSSxDQUFDLGlCQUFpQixHQUFHLENBQUMsQ0FBQztRQUMvQixDQUFFO1FBQUEsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNULFNBQUcsQ0FBQyxLQUFLLENBQUMsK0JBQStCLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkQsQ0FBQztJQUNMLENBQUM7SUFFRCxjQUFjLENBQUMsSUFBbUI7UUFDOUIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7Z0JBQ2hCLEtBQUssaUNBQWlCLENBQUMsZ0JBQWdCO29CQUNuQyxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsQ0FBQztvQkFDeEIsS0FBSyxDQUFDO2dCQUNWLEtBQUssaUNBQWlCLENBQUMsY0FBYztvQkFDakMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO29CQUN0QixLQUFLLENBQUM7Z0JBQ1YsS0FBSyxpQ0FBaUIsQ0FBQyxpQkFBaUI7b0JBQ3BDLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO29CQUN6QixLQUFLLENBQUM7WUFDZCxDQUFDO1FBQ0wsQ0FBRTtRQUFBLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDVCxTQUFHLENBQUMsS0FBSyxDQUFDLDJCQUEyQixHQUFHLENBQUMsQ0FBQyxDQUFDO1FBQy9DLENBQUM7SUFDTCxDQUFDO0lBRU0sU0FBUztRQUNaLElBQUksS0FBSyxHQUFHLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDO1FBQ3JFLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLENBQUMsY0FBYyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQztRQUNuRixNQUFNLENBQUMsR0FBRyxHQUFHLE9BQU8sR0FBRyxLQUFLLENBQUM7SUFDakMsQ0FBQztBQUNMLENBQUM7QUE3Q1ksZ0JBQVEsV0E2Q3BCLENBQUEifQ==