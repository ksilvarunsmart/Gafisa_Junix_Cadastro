/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/query', 'N/record', 'N/runtime'],
    /**
 * @param{query} query
 * @param{record} record
 */
    (query, record, runtime) => {
        function tratarData(data) {
            var dataCadastro = data.split('T');
            var dateCadastro = dataCadastro[0].split('-');
            var cadastroData = dateCadastro[2] + '/' + dateCadastro[1] + '/' + dateCadastro[0];
            cadastroData = cadastroData.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$2/$1/$3");
            cadastroData = new Date(cadastroData);
            return cadastroData;
        }
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
            arrResults = [];

            var objIterator = query.runSuiteQLPaged({
                query:  "select b1.id idFatura, b1.custbody_lrc_fatura_principal faturaprincipal, " +
                    "b1.custbody_rsc_projeto_obra_gasto_compra projetoobra, item itematualizacao, quantity qtdfator, " +
                    "c.custbody_rsc_finan_indice_base_cont basecalculo, a.id unidadeCorrecao from customrecord_rsc_correction_unit a,\n" +
                    "transactionline b\n" +
                    "join transaction b1 on b1.id = b.transaction \n" +
                    "join transaction c on b1.custbody_lrc_fatura_principal = c.id\n" +
                    "where  a.name = 'INCP' and custrecord_rsc_ucr_calc_base_item = item\n" +
                    "and c.custbody_rsc_status_contrato = '2' and b1.custbodyrsc_tpparc > 2 and 39412 = b1.custbody_lrc_fatura_principal"
            }).iterator();
            objIterator.each(function(page) {
                var objPage = page.value.data.iterator();

                objPage.each(function(row) {

                    arrResults.push(row.value.asMap());
                    return true;
                });

                return true;
            });

            log.audit({title: 'Total de registros', details: arrResults.length})
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
            try {


            /* Recuperar a taxa a ser calculada */
            log.debug({title:'mapContext', details: mapContext})
            let objContext = mapContext.value;
            log.debug({title: 'Context', details: objContext});
            let installmentContext = JSON.parse(objContext);
            log.debug({title: 'Context', details: installmentContext});

            var effectiveDate =  runtime.getCurrentScript().getParameter({name:'custscript_rsc_effective_date'});
            effectiveDate = '01/08/2021';
            log.debug({title: 'parametro unidade', details: installmentContext.unidadecorrecao});
            log.debug({title: 'parametro data', details: effectiveDate});
            var queryResults = query.runSuiteQL({
                query: 'select custrecord_rsc_hif_factor_percent from customrecord_rsc_factor_history\n' +
                    'where custrecord_rsc_hif_effective_date = ?  and custrecord_rsc_hif_correction_unit = ? ',
            params: [effectiveDate, installmentContext.unidadecorrecao]});
            var results = queryResults.asMappedResults();
            if (results.length <= 0){
                throw 'Data Efetiva não Parametrizada';
            } else {
                var newFactor = 0;
                for (let i = 0; i < results.length; i++) {
                    var result = results[i];
                    newFactor = result['custrecord_rsc_hif_factor_percent'];
                }
            }

            if (newFactor <= installmentContext.basecalculo){
                /*Ignorar este calculo */
                throw 'Fator Menor ou igual o Atual: ' + newFactor;
            }

            var diffFactor = newFactor - installmentContext.basecalculo;
            log.debug({title: 'Diferença de update', details:diffFactor});
            log.debug({title: 'validação', details:'Check se deverá atualizar o fator'});

            var installmentRecord = record.load({
                type: 'customsale_rsc_financiamento',
                id: installmentContext.idfatura,
                isDynamic: false
            });

            var lines = installmentRecord.getLineCount({sublistId: 'item'});
            for (let i = 0; i < lines; i++) {
                var item = installmentRecord.getSublistValue({sublistId: 'item', line: i, fieldId:'item'});
                log.debug({title: 'validação item', details:item});
                if (item == installmentContext.itematualizacao){
                    /* Obtem valor anterior*/
                    var rateLast = installmentRecord.getSublistValue({sublistId: 'item', line: i, fieldId:'rate'});
                    log.debug({title: 'validação rateLast', details:rateLast});
                    if (rateLast < diffFactor){
                        /* Atualizo com o novo Valor */
                        log.debug({title: 'validação atualizou', details:diffFactor});
                        installmentRecord.setSublistValue({sublistId:'item', line:i, fieldId:'rate',value: diffFactor});
                        var qtd = installmentRecord.getSublistValue({sublistId:'item', line:i, fieldId:'quantity'});
                        installmentRecord.setSublistValue({sublistId:'item', line:i, fieldId:'amount', value: diffFactor*qtd});
                    }
                }
            }

            installmentRecord.save({ignoreMandatoryFields: true});
            } catch (e){
                log.error({title: 'Error Processing', details: e});
            }

        }

        /**
         * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
         * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
         * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
         *     provided automatically based on the results of the map stage.
         * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
         *     reduce function on the current group
         * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
         * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} reduceContext.key - Key to be processed during the reduce stage
         * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
         *     for processing
         * @since 2015.2
         */
        const reduce = (reduceContext) => {

        }


        /**
         * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
         * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
         * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
         * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
         *     script
         * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
         * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
         * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
         * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
         *     script
         * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
         * @param {Object} summaryContext.inputSummary - Statistics about the input stage
         * @param {Object} summaryContext.mapSummary - Statistics about the map stage
         * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
         * @since 2015.2
         */
        const summarize = (summaryContext) => {

        }

        return {getInputData, map, reduce, summarize}

    });
