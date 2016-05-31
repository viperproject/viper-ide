'use strict';
const fs = require('fs');
class Settings {
    static valid(backends) {
        if (!backends || backends.length == 0) {
            return "No backend detected, specify at least one backend";
        }
        for (var i = 0; i < backends.length; i++) {
            let backend = backends[i];
            //name there?
            if (!backend.name || backend.name.length == 0) {
                return "Every backend setting needs a name.";
            }
            //path there?
            if (!backend.path || backend.path.length == 0) {
                return backend.name + ": The backend setting is missing a path";
            }
            //mainMethod there?
            if (!backend.mainMethod || backend.mainMethod.length == 0) {
                return backend.name + ": The backend setting is missing a mainMethod";
            }
            //command there?
            if (!backend.command || backend.command.length == 0) {
                return backend.name + ": The backend setting is missing the command";
            }
            //check path
            //is path environment variable
            let envVarValue = Settings.extractEnvVar(backend.path);
            if (!envVarValue) {
                return backend.name + ": Environment varaible " + backend.path + " is not set.";
            }
            //-> set path to environment variable value
            backend.path = envVarValue;
            //is absolute path
            if (backend.path.indexOf(":") < 0) {
                return backend.name + ": The path to the backend jar-file must be absolute.";
            }
            //does path point to a .jar file
            if (!backend.path.endsWith(".jar")) {
                return backend.name + ": The backend path must point ot the backend's jar-file.";
            }
            //does file exist?
            if (!fs.existsSync(backend.path)) {
                return backend.name + ": File not found: " + backend.path + " ";
            }
        }
        return null;
    }
    static extractEnvVar(path) {
        if (path.startsWith("%") && path.endsWith("%")) {
            let envName = path.substr(1, path.length - 2);
            let envValue = process.env[envName];
            //is environment variable set?
            if (!envValue) {
                return null;
            }
            return envValue;
        }
        else
            return path;
    }
}
exports.Settings = Settings;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU2V0dGluZ3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvc3JjL1NldHRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLFlBQVksQ0FBQztBQUViLE1BQU8sRUFBRSxXQUFXLElBQUksQ0FBQyxDQUFDO0FBZTFCO0lBSUksT0FBYyxLQUFLLENBQUMsUUFBbUI7UUFDdkMsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLElBQUksUUFBUSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3BDLE1BQU0sQ0FBQyxtREFBbUQsQ0FBQztRQUMvRCxDQUFDO1FBRUQsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7WUFDdkMsSUFBSSxPQUFPLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzFCLGFBQWE7WUFDYixFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxJQUFJLElBQUksT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDNUMsTUFBTSxDQUFDLHFDQUFxQyxDQUFDO1lBQ2pELENBQUM7WUFDRCxhQUFhO1lBQ2IsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQzVDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLHlDQUF5QyxDQUFDO1lBQ3BFLENBQUM7WUFDRCxtQkFBbUI7WUFDbkIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsVUFBVSxJQUFJLE9BQU8sQ0FBQyxVQUFVLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hELE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLCtDQUErQyxDQUFDO1lBQzFFLENBQUM7WUFDRCxnQkFBZ0I7WUFDaEIsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xELE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxHQUFHLDhDQUE4QyxDQUFDO1lBQ3pFLENBQUM7WUFDRCxZQUFZO1lBQ1osOEJBQThCO1lBQzlCLElBQUksV0FBVyxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO1lBQ3ZELEVBQUUsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQztnQkFDZixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyx5QkFBeUIsR0FBRyxPQUFPLENBQUMsSUFBSSxHQUFHLGNBQWMsQ0FBQztZQUNwRixDQUFDO1lBQ0QsMkNBQTJDO1lBQzNDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsV0FBVyxDQUFDO1lBQzNCLGtCQUFrQjtZQUNsQixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNoQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxzREFBc0QsQ0FBQztZQUNqRixDQUFDO1lBQ0QsZ0NBQWdDO1lBQ2hDLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUNqQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRywwREFBMEQsQ0FBQztZQUNyRixDQUFDO1lBQ0Qsa0JBQWtCO1lBQ2xCLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMvQixNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksR0FBRyxvQkFBb0IsR0FBRyxPQUFPLENBQUMsSUFBSSxHQUFHLEdBQUcsQ0FBQztZQUNwRSxDQUFDO1FBS0wsQ0FBQztRQUNELE1BQU0sQ0FBQyxJQUFJLENBQUM7SUFDaEIsQ0FBQztJQUVELE9BQWMsYUFBYSxDQUFDLElBQVk7UUFDcEMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM3QyxJQUFJLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBQzlDLElBQUksUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDcEMsOEJBQThCO1lBQzlCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztnQkFDWixNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2hCLENBQUM7WUFDRCxNQUFNLENBQUMsUUFBUSxDQUFDO1FBQ3BCLENBQUM7UUFDRCxJQUFJO1lBQUMsTUFBTSxDQUFDLElBQUksQ0FBQztJQUNyQixDQUFDO0FBRUQsQ0FBQztBQXBFWSxnQkFBUSxXQW9FcEIsQ0FBQSJ9