import * as request from 'request';

import { viperApi } from "../extension";


export class Alloy {

    public static generate(model: string): Promise<string> {
        const urlPromise: Promise<string> = viperApi.getViperServerUrl();

        return new Promise<string>((resolve, reject) => {
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
                            reject("Got error from POST request to ViperServer when generating Alloy model: " +
                                   JSON.stringify(error, undefined, 2));
                        }
                        if (response.statusCode !== 200) {
                            reject("Bad response on POST request to ViperServer when generating Alloy model:" +
                                   JSON.stringify(response, undefined, 2));
                        }

                        const response_body = JSON.parse(body);
                        if (response_body.instance === undefined) {
                            reject("Response from request to ViperServer when generating Alloy model had no instance" +
                                   body);
                        }

                        return resolve(response_body.instance as string);
                    });
                },

                // Delegate handling of failure to the client
                (reason: string) => reject(`Could not get ViperServer address: ${reason}`)
            );
    });
    }
}