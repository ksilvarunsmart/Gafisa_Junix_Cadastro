/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/query'],
    
    (query) => {
        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
        const beforeLoad = (scriptContext) => {

        }

        /**
         * Defines the function definition that is executed before record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const beforeSubmit = (scriptContext) => {
                if (scriptContext.oldRecord != null) {

                        var proposta = scriptContext.oldRecord.getValue('custbody_rsc_nr_proposta');
                        if (proposta != null) {
                                log.audit({title: 'Script Context', details: scriptContext})

                                log.audit({
                                        title: 'Valor Anterior contrato',
                                        details: scriptContext.oldRecord.getValue('custbody_rsc_status_contrato')
                                });

                                log.audit({
                                        title: 'Valor Novo contrato',
                                        details: scriptContext.newRecord.getValue('custbody_rsc_status_contrato')
                                });

                                var valorAntigoStatusContrato = scriptContext.oldRecord.getValue('custbody_rsc_status_contrato');

                                var valorNovoStatusContrato = scriptContext.newRecord.getValue('custbody_rsc_status_contrato');
                                /* Caso o status atual seja contrato e tente voltar para proposta bloquear a ação */
                                if (valorAntigoStatusContrato == 2 && valorNovoStatusContrato == 1) {
                                        log.error({title: 'Status Invalido', details: 'Erro Status Invalido'});
                                }

                                /* Caso o status atual seja proposta e tente voltar para distrato bloquear a ação */
                                if (valorAntigoStatusContrato == 1 && valorNovoStatusContrato == 3) {
                                        log.error({title: 'Status Invalido', details: 'Erro Status Invalido'});
                                }

                                /* Caso o status seja Distratado e altere para qualquer outra bloquear a ação */
                                if (valorAntigoStatusContrato == 3 && valorNovoStatusContrato != 3) {
                                        log.error({title: 'Status Invalido', details: 'Erro Status Invalido'});
                                }

                                /* Caso o status atual seja proposta e o novo seja contrato */
                                if (valorAntigoStatusContrato == 1 && valorNovoStatusContrato == 2) {
                                        scriptContext.newRecord.setValue('custbody_rsc_ativo', true);
                                        /* Recuperar indice de reajuste nas configurações das parcelas */
                                        var projetoObra = scriptContext.newRecord.getValue('custbody_rsc_projeto_obra_gasto_compra');
                                        var dataPesquisa = new Date();
                                        var additionOfMonths = 2;
                                        dataPesquisa.setMonth(dataPesquisa.getMonth() - additionOfMonths);
                                        log.error({title: 'Data Para pesquisa', details: dataPesquisa});

                                        var mesPesquisa = dataPesquisa.getMonth() + 1;
                                        log.error({title: 'Mes Para pesquisa', details: mesPesquisa})

                                        var queryResults
                                        queryResults = query.runSuiteQL(
                                            {
                                                    query: 'select custrecord_rsc_unidade_correcao, a.custrecord_rsc_ist_project, b.name, TO_CHAR(c.custrecord_rsc_hif_effective_date, \'MM/DD/YYYY\') custrecord_rsc_hif_effective_date, custrecord_rsc_hif_factor_percent from customrecord_rsc_installment_setup a, customrecord_rsc_correction_unit b, \n' +
                                                        'customrecord_rsc_factor_history c\n' +
                                                        'where custrecord_rsc_ist_project = ? and\n' +
                                                        'a.custrecord_rsc_unidade_correcao = b.id and \n' +
                                                        'b.id = c.CUSTRECORD_RSC_HIF_CORRECTION_UNIT and ' +
                                                        'TO_CHAR(c.custrecord_rsc_hif_effective_date, \'MM\') = ?',
                                                    params: [projetoObra, mesPesquisa]
                                            }
                                        );

                                        var records = queryResults.asMappedResults();
                                        if (records.length > 0) {
                                                var record = records[0];
                                                /* Preencher data padrao considerando os 2 meses anteriores */
                                                log.audit({
                                                        title: 'Data Retornada',
                                                        details: record['custrecord_rsc_hif_effective_date']
                                                })
                                                scriptContext.newRecord.setValue('custbody_rsc_finan_dateativacontrato', new Date(record['custrecord_rsc_hif_effective_date']));

                                                /* Preencher a taxa padrao dos 2 meses anteriores */
                                                scriptContext.newRecord.setValue('custbody_rsc_finan_indice_base_cont', record['custrecord_rsc_hif_factor_percent']);

                                                /* Disparar MapReduce de Atualização das Parcelas */

                                        } else {
                                                log.error({
                                                        title: 'Erro recuperar Fator:',
                                                        details: 'Não foi possivel encontrar fator para o periodo mencionado.'
                                                })
                                        }
                                }
                        }
                }
        }

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {

        }

        return {beforeLoad, beforeSubmit, afterSubmit}

    });
