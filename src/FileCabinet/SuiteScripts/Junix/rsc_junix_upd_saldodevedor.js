/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/query', './rsc_junix_call_api.js'],
    /**
 * @param{query} query
 */
    (query, sendAPI) => {
        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */

        const getInputData = (inputContext) => {
            var sql = 'select custbody_lrc_numero_contrato numeroContrato, TO_CHAR(sysdate,' +
                ' \'YYYY-MM-DD"T"HH24:MI:SS"Z"\') dataSaldo, b.valorSaldoAtualizado, \n' +
                'b.valorVendaAtualizado, b.valorPago  from transaction a\n' +
                'join (select custbody_lrc_fatura_principal, sum(foreigntotal) valorSaldoAtualizado,  ' +
                'sum(foreignamountpaid) valorPago, sum(foreignamountunpaid) valorVendaAtualizado ' +
                'from transaction group by custbody_lrc_fatura_principal) b on b.custbody_lrc_fatura_principal = a.id \n' +
                'where custbody_rsc_status_contrato = 2\n' +
                'and id = 54552' ;
            var queryParams = new Array();
            var arrResults = selectAllRows( sql, queryParams );
            return arrResults;

        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        const map = (mapContext) => {
            log.audit({title: 'Detail', details: mapContext})
            var resultado = JSON.parse(mapContext.value);

            var body = {
                numeroContrato: resultado['numerocontrato'],
                dataSaldo: resultado['datasaldo'],
                ValorSaldoAtualizado: resultado['valorsaldoatualizado'],
                ValorVendaAtualizado: resultado['valorvendaatualizado'],
                ValorPago: resultado['valorpago']
            }

            log.debug({title: 'Body', details: body});
            var retorno = sendAPI.sendRequest(body, 'SALDO_DEVEDOR_JUNIX/1.0/');
            log.debug({title: 'Retorno', details: retorno});
        }

        function selectAllRows( sql, queryParams = new Array() ) {
            try {
                var moreRows = true;
                var rows = new Array();
                var paginatedRowBegin = 1;
                var paginatedRowEnd = 5000;

                do {
                    var paginatedSQL = 'SELECT * FROM ( SELECT ROWNUM AS ROWNUMBER, * FROM (' + sql + ' ) ) WHERE ( ROWNUMBER BETWEEN ' + paginatedRowBegin + ' AND ' + paginatedRowEnd + ')';
                    var queryResults = query.runSuiteQL( { query: paginatedSQL, params: queryParams } ).asMappedResults();
                    rows = rows.concat( queryResults );
                    if ( queryResults.length < 5000 ) { moreRows = false; }
                    paginatedRowBegin = paginatedRowBegin + 5000;
                } while ( moreRows );
            } catch( e ) {
                log.error( { title: 'selectAllRows - error', details: { 'sql': sql, 'queryParams': queryParams, 'error': e } } );
            }
            return rows;
        }

        return {getInputData, map}

    });
