/**
 * @NApiVersion 2.1
 */
endpoint = 'https://api-gafisa-qa.imobflow.com.br/api/';

username = 'netsuite';
password = 'ld2lFDQ9XfozKFPxfO2F';

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
            var token = JSON.parse(getToken());

            content_type = 'application/json';
            /* Get Record Type */
            url = endpoint + api;

            log.debug({title: 'Authorization', details: 'Bearer ' + token.access_token})
            var response = https.post({
                url: url,
                body: JSON.stringify(data),
                headers: {
                    'Content-Type': content_type,
                    'Authorization': 'Bearer ' + token.access_token
                }});

            log.debug({title: 'Return', details: response});
            return response.body;
        }

        return {getToken, sendRequest}

    });
