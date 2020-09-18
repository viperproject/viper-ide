/**
  * This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/.
  *
  * Copyright (c) 2011-2019 ETH Zurich.
  */
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const ViperProtocol_1 = require("./ViperProtocol");
const ServerClass_1 = require("./ServerClass");
class Log {
    static log(message, logLevel) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.Log, { data: message, logLevel: logLevel });
    }
    static startProgress() {
        this.lastProgress = 0;
    }
    static progress(domain, cur, len, logLevel) {
        let progress = 100.0 * cur / len;
        if (Math.floor(progress) > this.lastProgress) {
            this.lastProgress = progress;
            let data = { domain: domain, current: cur, total: len };
            ServerClass_1.Server.sendProgressMessage({ data: data, logLevel: logLevel });
        }
    }
    static toLogFile(message, logLevel = ViperProtocol_1.LogLevel.Default) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.ToLogFile, { data: message, logLevel: logLevel });
    }
    static error(message, logLevel = ViperProtocol_1.LogLevel.Debug) {
        ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.Error, { data: message, logLevel: logLevel });
    }
    static logWithOrigin(origin, message, logLevel) {
        if (message) {
            ServerClass_1.Server.sendLogMessage(ViperProtocol_1.Commands.Log, { data: (logLevel >= ViperProtocol_1.LogLevel.Debug ? "[" + origin + "]: " : "") + message, logLevel: logLevel });
        }
    }
    static hint(message, showSettingsButton = false, showViperToolsUpdateButton = false) {
        ServerClass_1.Server.connection.sendNotification(ViperProtocol_1.Commands.Hint, { message: message, showSettingsButton: showSettingsButton, showViperToolsUpdateButton: showViperToolsUpdateButton });
    }
    static logOutput(process, label) {
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label, data, ViperProtocol_1.LogLevel.LowLevelDebug);
        });
        process.stdout.on('data', (data) => {
            Log.logWithOrigin(label + " error", data, ViperProtocol_1.LogLevel.LowLevelDebug);
        });
    }
}
Log.logLevel = ViperProtocol_1.LogLevel.Default;
exports.Log = Log;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vc2VydmVyL3NyYy9Mb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztJQU1JO0FBRUosWUFBWSxDQUFDOztBQUViLG1EQUErRDtBQUUvRCwrQ0FBdUM7QUFFdkMsTUFBYSxHQUFHO0lBR1osTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFlLEVBQUUsUUFBa0I7UUFDMUMsb0JBQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQy9FLENBQUM7SUFFRCxNQUFNLENBQUMsYUFBYTtRQUNoQixJQUFJLENBQUMsWUFBWSxHQUFHLENBQUMsQ0FBQztJQUMxQixDQUFDO0lBSUQsTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFjLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxRQUFrQjtRQUN4RCxJQUFJLFFBQVEsR0FBRyxLQUFLLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQTtRQUNoQyxJQUFJLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEdBQUcsSUFBSSxDQUFDLFlBQVksRUFBRTtZQUMxQyxJQUFJLENBQUMsWUFBWSxHQUFHLFFBQVEsQ0FBQztZQUM3QixJQUFJLElBQUksR0FBYSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUE7WUFDakUsb0JBQU0sQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7U0FDbEU7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxPQUFlLEVBQUUsV0FBcUIsd0JBQVEsQ0FBQyxPQUFPO1FBQ25FLG9CQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsU0FBUyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBRUQsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFlLEVBQUUsV0FBcUIsd0JBQVEsQ0FBQyxLQUFLO1FBQzdELG9CQUFNLENBQUMsY0FBYyxDQUFDLHdCQUFRLENBQUMsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztJQUNqRixDQUFDO0lBRUQsTUFBTSxDQUFDLGFBQWEsQ0FBQyxNQUFjLEVBQUUsT0FBZSxFQUFFLFFBQWtCO1FBQ3BFLElBQUksT0FBTyxFQUFFO1lBQ1Qsb0JBQU0sQ0FBQyxjQUFjLENBQUMsd0JBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxRQUFRLElBQUksd0JBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxNQUFNLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7U0FDekk7SUFDTCxDQUFDO0lBRUQsTUFBTSxDQUFDLElBQUksQ0FBQyxPQUFlLEVBQUUsa0JBQWtCLEdBQUcsS0FBSyxFQUFFLDBCQUEwQixHQUFHLEtBQUs7UUFDdkYsb0JBQU0sQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsd0JBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLDBCQUEwQixFQUFFLDBCQUEwQixFQUFFLENBQUMsQ0FBQztJQUM1SyxDQUFDO0lBRUQsTUFBTSxDQUFDLFNBQVMsQ0FBQyxPQUFtQyxFQUFFLEtBQWE7UUFDL0QsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUU7WUFDdkMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDM0QsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFZLEVBQUUsRUFBRTtZQUN2QyxHQUFHLENBQUMsYUFBYSxDQUFDLEtBQUssR0FBRyxRQUFRLEVBQUUsSUFBSSxFQUFFLHdCQUFRLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDdEUsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDOztBQTlDTSxZQUFRLEdBQWEsd0JBQVEsQ0FBQyxPQUFPLENBQUM7QUFEakQsa0JBZ0RDIn0=