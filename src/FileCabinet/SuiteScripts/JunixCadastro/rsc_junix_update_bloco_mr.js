/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/runtime', 'N/record', './rsc_junix_call_api.js'],
    
    (search, runtime, record, api) => {
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
                return search.create({
                        type: "customrecord_rsc_bl_emp",
                        filters:
                            [
                                    ["custrecord_rsc_bl_emp_int_junix","is","F"]
                            ],
                        columns:
                            [
                                    search.createColumn({
                                            name: "name",
                                            sort: search.Sort.ASC,
                                            label: "Name"
                                    }),
                                    search.createColumn({name: "scriptid", label: "Script ID"}),
                                    search.createColumn({name: "custrecord_rsc_bl_emp_desc", label: "Descrição"}),
                                    search.createColumn({name: "custrecord_rsc_bl_emp_projeto", label: "Empreendimento"}),
                                    search.createColumn({name: "custrecord_rsc_bl_emp_dt_chaves", label: "Data Chaves"}),
                            ]
                });
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
                log.debug({title:'Map', details: mapContext});
                var searchResult = JSON.parse(mapContext.value);

                internalid = searchResult.id;

                log.debug({title: 'Job', details:searchResult.values['custrecord_rsc_bl_emp_projeto'] })
                /* recuperar os dados */
                var projeto = record.load({
                        type: record.Type.JOB,
                        id: searchResult.values['custrecord_rsc_bl_emp_projeto'].value,
                        isDynamic: false,
                });
                log.debug({title: 'Cod Sub', details: projeto.getValue('custentity_rsc_aprop_subsidiaria')});
                var subsidiary = record.load({
                                type: record.Type.SUBSIDIARY,
                                id: projeto.getValue('custentity_rsc_aprop_subsidiaria'),
                                isDynamic: false});
                var codProject = subsidiary.getValue('name').substr(0,4) + '_' + subsidiary.getValue('name').substr(0,4);
                /* montar o body do request */
                var body = {
                        codigo: searchResult.id,
                        codigoEmpreendimento: codProject,
                        nomeBloco: searchResult.values['custrecord_rsc_bl_emp_desc'],
                        dataEntregaChaves: searchResult.values['custrecord_rsc_bl_emp_dt_chaves']
                }
                log.debug({title: 'body', details: body})
                /* Atualizar como processsado*/
                /*var load_sub =  record.load({
                    type: record.Type.SUBSIDIARY,
                    id: rec_id,
                    isDynamic: false,
                });

                load_sub.setValue('custrecord_rsc_atualizado_junix', false);
                load_sub.save(); */

                var retorno = JSON.parse(api.sendRequest(body, 'BLOCO_JUNIX/1.0/'));
                log.debug({title: "retorno", details: retorno});

                if (retorno.OK){
                        var job_update = record.load({
                                type: 'customrecord_rsc_bl_emp',
                                id: internalid,
                                isDynamic: false,
                        });
                        log.debug({title: "Retornou Ok.", details: "Retornou o ID " + retorno.Dados});
                        job_update.setValue('custrecord_rsc_bl_emp_int_junix', true);
                        job_update.setValue('custrecord_rsc_bl_emp_idJunix', retorno.Dados);
                        job_update.save();
                } else {
                        log.debug({title: "Retornou Erro .", details: "Mensagem Erro " + retorno.Mensagem});
                }


                var scriptObj = runtime.getCurrentScript();
                log.debug({
                        title: "Remaining usage units: ",
                        details: scriptObj.getRemainingUsage()
                });
                } catch (e){
                        log.error({title: 'Erro', details: e.message})
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
