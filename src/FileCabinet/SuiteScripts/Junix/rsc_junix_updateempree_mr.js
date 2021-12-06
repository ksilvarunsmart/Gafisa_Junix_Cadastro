/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/runtime', 'N/record', './rsc_junix_call_api.js'],
    /**
 * @param{search} search
 */
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
                type: "job",
                filters:
                    [
                        ["custentity_rsc_atualizadocontrato_junix","is","F"],
                        "AND",
                        ["custentity_rsc_junix_aprovado_envio","is","T"]
                    ],
                columns:
                    [
                        search.createColumn({
                            name: "entityid",
                            sort: search.Sort.ASC,
                            label: "ID"
                        }),
                        search.createColumn({name: "companyname", label: "Name"}),
                        search.createColumn({name: "email", label: "Email"}),
                        search.createColumn({name: "phone", label: "Phone"}),
                        search.createColumn({name: "altphone", label: "Office Phone"}),
                        search.createColumn({name: "fax", label: "Fax"}),
                        search.createColumn({name: "customer", label: "Customer"}),
                        search.createColumn({name: "entitystatus", label: "Status"}),
                        search.createColumn({name: "contact", label: "Primary Contact"}),
                        search.createColumn({name: "jobtype", label: "Project Type"}),
                        search.createColumn({name: "startdate", label: "Start Date"}),
                        search.createColumn({name: "projectedenddate", label: "Projected End Date"}),
                        search.createColumn({name: "altemail", label: "Alt. Email"}),
                        search.createColumn({name: "subsidiary", label: "Subsidiary"}),
                        search.createColumn({name: "custentity_lrc_matricula", label: "Matrícula"}),
                        search.createColumn({name: "custentity_project_type_np", label: "Project Type"}),
                        search.createColumn({name: "custentity_rsc_project_date_habite", label:"Data Habite"}),
                        search.createColumn({name: "custentity_rsc_inicio_venda", label:"Inicio Venda"})
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
            log.debug({title:'Id', details: internalid});

            log.debug({title: 'subsidiary', details:searchResult.values['subsidiary'] })
            /* recuperar os dados */
            var subsidiary = record.load({
                type: record.Type.SUBSIDIARY,
                id: searchResult.values['subsidiary'].value,
                isDynamic: false,
            });

            let address = subsidiary.getSubrecord({ fieldId: 'mainaddress' });
            var cidade = record.load({ type: 'customrecord_enl_cities', id:address.getValue('custrecord_enl_city') });
            log.audit({title: 'Cidade', details: cidade});
            var codProject = subsidiary.getValue('name').substr(0,4) + '_' + subsidiary.getValue('name').substr(0,4);
            /* montar o body do request */
            var body = {
                Codigo: codProject,
                nome: searchResult.values['companyname'],
                apelido: '',
                dataHabitese: searchResult.values['custentity_rsc_project_date_habite'],
                dataLancamento: searchResult.values['custentity_rsc_inicio_venda'],
                dataEntregaEfetiva: searchResult.values['projectedenddate'],
                dataInicioObra: searchResult.values['startdate'] ,
                Cep: address.getValue('zip'),
                endereco: address.getValue('addr1'),
                Bairro: address.getValue('addr3'),
                Cidade: cidade.getValue('name'),
                Estado: address.getValue('state'),
                Numero: address.getValue('custrecord_enl_numero'),
                Complemento: address.getValue('addr2'),
                statusObra: '',
                codigoSPE: subsidiary.getValue('name').substr(0,4)
            }
            log.debug({title: 'body', details: body})


            var retorno = JSON.parse(api.sendRequest(body, 'EMPREENDIMENTO_JUNIX/1.0/'));
            log.debug({title: "retorno", details: retorno});
            if (retorno.OK){
                var job_update = record.load({
                    type: record.Type.JOB,
                    id: internalid,
                    isDynamic: false,
                });
                log.debug({title: "Retornou Ok.", details: "Retornou o ID " + retorno.Dados});
                job_update.setValue('custentity_rsc_atualizadocontrato_junix', true);
                job_update.setValue('custentity_rsc_junix_id', retorno.Dados);
                job_update.setValue('custentity_rsc_codigo_junix_obra', codProject);

                job_update.save();
            } else {
                log.debug({title: "Retornou Erro .", details: "Mensagem Erro " + retorno.Mensagem});
            }
            subsidiary.save({ignoreMandatoryFields: true});

            var scriptObj = runtime.getCurrentScript();
            log.debug({
                title: "Remaining usage units: ",
                details: scriptObj.getRemainingUsage()
            });
            } catch (e){
                log.error({title : 'Erro ao processar', details: e.message()})
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
