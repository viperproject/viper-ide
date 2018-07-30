import * as request from 'request';

import { viperApi } from "../extension";
import { AlloyInstance } from '../external';


export class Alloy {

    public static generate(model: string): Promise<AlloyInstance> {
        const urlPromise: Promise<string> = viperApi.getViperServerUrl();

        return new Promise<AlloyInstance>((resolve, reject) => {
            urlPromise.then(
                // When we get the actual address, perform a request to generate the model and return as a promise
                (url: string) => {
                    let options = {
                        url: url + '/alloy', 
                        headers: {'content-type': 'application/json'},
                        body: JSON.stringify({ arg: model })
                    };
                    request.post(options, (error, response, body) => {
                        if (error) {
                            return reject("Got error from POST request to ViperServer when generating Alloy model: " +
                                          JSON.stringify(error, undefined, 2));
                        }
                        if (response.statusCode !== 200) {
                            return reject("Bad response on POST request to ViperServer when generating Alloy model:" +
                                          JSON.stringify(response, undefined, 2));
                        }

                        const instance = <AlloyInstance>JSON.parse(body);
                        if (instance.signatures === undefined) {
                            return reject("Response from ViperServer had no signatures in Alloy model:\n" + body);
                        }

                        return resolve(instance);
                    });
                },

                // Delegate handling of failure to the client
                (reason: string) => reject(`Could not get ViperServer address: ${reason}`)
            );
    });
    }
}