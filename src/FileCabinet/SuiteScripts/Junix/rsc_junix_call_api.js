/**
 * @NApiVersion 2.1
 */
endpoint = 'https://api-gafisa-qa.imobflow.com.br/api/';

username = 'netsuite';
password = 'ld2lFDQ9XfozKFPxfO2F';

/* Integração OIC */
endpointOIC = 'https://gafisa-oic-test-grkcv6l86jjv-gr.integration.ocp.oraclecloud.com:443/ic/api/integration/v1/flows/rest/';
token = 'cmJvYXZlbnR1cmFAdHJpLWNzLmNvbTohQWthNDdha2E0NzM='

define(['N/http', 'N/https'],
    /**
 * @param{http} http
 * @param{https} https
 */
    (http, https) => {

        const getToken = () => {
            /* Get Record Type */
            url = endpoint + 'token';
            var content_type = 'application/x-www.form-urlenconded';
            var data = {
                username: username,
                password: password,
                grant_type: 'password'
            };

            var response = https.post({
                url: url,
                body: data,
                headers: {
                    'Content-Type': content_type
                }});

            log.debug({title: 'Return', details: response.body});
            return response.body;
        }

        const sendRequest = (data, api) => {
            content_type = 'application/json; charset=UTF-8';
            /* Get Record Type */
            url = endpointOIC + api;
            log.debug({title: 'URL', details: url});
            //log.debug({title: 'Authorization', details: 'Bearer ' + token.access_token})
            var response = https.post({
                url: url,
                body: JSON.stringify(data),
                headers: {
                    'Content-Type': content_type,
                    'Authorization': 'Basic ' + token,
                    'Accept': '*/*'
                }});

            log.debug({title: 'Return', details: response});
            return response.body;
        }

        const getRequest = (api) => {
            content_type = 'application/json; charset=UTF-8';
            /* Get Record Type */
            url = endpointOIC + api;
            log.debug({title: 'URL', details: url});
            //log.debug({title: 'Authorization', details: 'Bearer ' + token.access_token})
            var response = https.get({
                url: url,
                headers: {
                    'Content-Type': content_type,
                    'Authorization': 'Basic ' + token,
                    'Accept': '*/*'
                }});

            log.debug({title: 'Return', details: response});
            return response.body;
        }

        return {getToken, sendRequest, getRequest}

    });
