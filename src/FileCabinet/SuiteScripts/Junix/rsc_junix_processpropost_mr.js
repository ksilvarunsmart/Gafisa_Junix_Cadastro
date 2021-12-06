/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
var codEmpreendimento = null;
var codProjeto = null;
var codEntidade = null;
var codLocation = null;
var listaClientes = new Array();



define([ "N/record", "N/runtime", "N/search", './rsc_junix_call_api.js', "N/query", './rsc_finan_comissao_venda.js', './rsc_finan_createproposta.js'],

    (record, runtime, search, api, query, comissao, propostaFunction) => {

            /**
             * Function to format date and return new date object.
             * @param {String} date
             * @returns {Date} Return formated date
             * @since 2015.2
             */
            function formatDate(date) {
                    var dateToFormat = date.split('T');
                    var arrayDateToFormat = dateToFormat[0].split('-');
                    var dateStringToFormat = arrayDateToFormat[2] + '/' + arrayDateToFormat[1] + '/' + arrayDateToFormat[0];
                    dateStringToFormat = dateStringToFormat.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$2/$1/$3");
                    var returnDate = new Date(dateStringToFormat);
                    return returnDate;
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
                    /* Return all unprocessed values, maybe change to query in the future */
                    return search.create({
                            type: "customrecord_rsc_junix_feed_proposta",
                            filters:
                                [
                                        ["custrecord_rsc_processado", "is", "F"],
                                        "AND",
                                        ["custrecord_rsc_erro_flag", "is", "F"]
                                ],
                            columns:
                                [
                                        search.createColumn({
                                                name: "name",
                                                sort: search.Sort.ASC,
                                                label: "Name"
                                        }),
                                        search.createColumn({name: "scriptid", label: "Script ID"}),
                                        search.createColumn({
                                                name: "custrecord_rsc_numero_proposta",
                                                label: "Numero Proposta"
                                        }),
                                        search.createColumn({name: "custrecord_rsc_processado", label: "Processado"})
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
                    /* Get value to process */
                    var proposta = JSON.parse(mapContext.value);
                    /* Open record to registry to log o process */
                    var registroProcesso = record.load({type: 'customrecord_rsc_junix_feed_proposta', id: proposta.id});
                    try {
                            /* Recovery propose from Junix to process updated value, if necessary we can change to recovery
                            *  from Junix Feed record type */
                            log.debug({title: 'Proposta', details: proposta});
                            var body = {
                                    tipoFiltro: "NÃO PROCESSADOS",
                                    Codigo: registroProcesso.getValue('custrecord_rsc_numero_proposta')
                            };

                            var retorno = JSON.parse(api.sendRequest(body, 'PROPOSTA_PESQVENDA_JUNIX/1.0/'));
                            log.debug({title:'JSON', details: retorno});

                            /* Validate if proposta is same approve status. */
                            var fase = proposta.Status.Fase;
                            var sintese = proposta.Status.Sintese;
                            if ((fase == 'SECRETARIA DE VENDAS') && (sintese == 'CONTRATO EMITIDO')) {
                                    mapContext.write(proposta.id, retorno);
                            } else {
                                    registroProcesso.setValue({fieldId:'custrecord_rsc_log_error', value:'Proposta Fora de Status'});
                            }

                    } catch (e) {
                            log.audit({title: 'Erro ao recuperar o Valor', details: e.message});
                            registroProcesso.setValue({fieldId: 'custrecord_rsc_log_error', value: e.message});
                            registroProcesso.setValue({fieldId: 'custrecord_rsc_erro_flag', value: 'T'});
                            registroProcesso.setValue({fieldId: 'custrecord_rsc_processado', value: 'T'});
                    }
                    /* Save registry */
                    registroProcesso.save({ignoreMandatoryFields: false})
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
                    var retorno = reduceContext.values;
                    createFaturaParcela(retorno, reduceContext.key);
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
                    var totalItemsProcessed = 0;
                    summaryContext.output.iterator().each(function () {
                            totalItemsProcessed++;
                    });
                    var summaryMessage = "Usage: " + summaryContext.usage + " Concurrency: " + summaryContext.concurrency +
                        " Number of yields: " + summaryContext.yields + " Total Items Processed: " + totalItemsProcessed;
                    log.audit({title: 'Summary of usase', details: summaryMessage});
            }

            function getSeparetedName(name) {
                    var separetedName = name.split(' ');
                    var firstName = '';
                    var lastName = '';
                    separetedName.forEach(function (word, index) {
                            if (index === 0) {
                                    firstName = word;
                            } else {
                                    lastName += ' ' + word;
                            }
                    });
                    log.error({'title': firstName, details: lastName});
                    return {firstName: firstName, lastName: lastName};
            }

            function getSPEObra(codEmpreend) {
                    var queryResults = query.runSuiteQL({
                            query: 'select id from subsidiary ' +
                                'where substr(name, 0, 4)|| \'_\' || substr(name, 0, 4) = ?',
                            params: [codEmpreend]
                    });
                    var records = queryResults.asMappedResults();
                    if (records.length > 0) {
                            // Add the records to the sublist...
                            for (r = 0; r < records.length; r++) {
                                    dados = records[r];
                                    codEmpreendimento = dados['id'];
                            }
                    }

                    log.audit({title: 'CodEmpreendimento', details: codEmpreendimento});

                    queryResults = query.runSuiteQL({
                            query: 'select * from job ' +
                                'where custentity_rsc_codigo_junix_obra = ?',
                            params: [codEmpreend]
                    });

                    records = queryResults.asMappedResults();
                    if (records.length > 0) {
                            // Add the records to the sublist...
                            for (r = 0; r < records.length; r++) {
                                    dados = records[r];
                                    codProjeto = dados['id'];
                            }
                    }
                    log.audit({title: 'CodProjeto', details: codProjeto});

                    queryResults = query.runSuiteQL({
                            query: 'select location.id from location, locationsubsidiarymap, subsidiary\n' +
                                'where \n' +
                                'Location.id = LocationSubsidiaryMap.location\n' +
                                'and LocationSubsidiaryMap.subsidiary = Subsidiary.id\n' +
                                'and subsidiary.id = ?',
                            params: [codEmpreendimento]
                    });
                    records = queryResults.asMappedResults();
                    if (records.length > 0) {
                            // Add the records to the sublist...
                            for (r = 0; r < records.length; r++) {
                                    dados = records[r];
                                    codLocation = dados['id'];
                            }
                    }
            }

            function _createCustomer(comprador, speNetsuite) {
                    var cliente = comprador.Cliente;
                    //log.error({title:'json', details: cliente});
                    //log.error({title: 'clienteId', details: cliente['Id']});
                    var cpfcnpj = null
                    if (cliente.CPF != '') {
                            cpfcnpj = cliente.CPF.replace(/\D+/g, '');
                    } else {
                            cpfcnpj = cliente.CNPJ.replace(/\D+/g, '');
                    }

                    var searchCustomer = search.create({
                            type: 'customer',
                            filters: [
                                    ['custentity_enl_cnpjcpf', 'IS', cpfcnpj]
                            ]
                    }).run().getRange({
                            start: 0,
                            end: 1
                    });
                    /* Localizou o cliente */
                    //                log.debug({title: 'Localizou o CNPJ/CPF', details: searchCustomer})
                    var customerRecord = null;
                    if (searchCustomer[0]) {
                            /* validar se o cliente está naquela SPE */
                            customerRecord = record.load({
                                    type: 'customer',
                                    id: searchCustomer[0].id
                            });

                            var lines = customerRecord.getLineCount({sublistId: 'submachine'});

                            var sub_array = [];
                            for (var x = 0; x < lines; x++) {
                                    var d = customerRecord.getSublistValue({
                                            sublistId: 'submachine',
                                            fieldId: 'subsidiary',
                                            line: x
                                    });
                                    sub_array.push(Number(d));
                            }
                            var index = sub_array.indexOf(speNetsuite);
                            if (index == -1) {
                                    customerRecord.setSublistValue({
                                            fieldId: 'subsidiary',
                                            sublistId: 'submachine',
                                            line: lines,
                                            value: speNetsuite
                                    });
                            }

                    } else {
                            customerRecord = record.create({
                                    type: record.Type.CUSTOMER,
                                    isDynamic: false
                            });
                            var cpf = cliente['CPF'];
                            if (cpf == '') {
                                    customerRecord.setValue({
                                            fieldId: 'isperson',
                                            value: 'F'
                                    });
                                    customerRecord.setValue({
                                            fieldId: 'companyname',
                                            value: cliente['Nome']
                                    });
                                    customerRecord.setValue({
                                            fieldId: 'custentity_enl_cnpjcpf',
                                            value: cpfcnpj
                                    });
                            } else {
                                    var _a = getSeparetedName(cliente['Nome']);
                                    firstName = _a.firstName, lastName = _a.lastName;
                                    customerRecord.setValue({
                                            fieldId: 'isperson',
                                            value: 'T'
                                    });
                                    customerRecord.setValue({
                                            fieldId: 'firstname',
                                            value: firstName
                                    });
                                    customerRecord.setValue({
                                            fieldId: 'lastname',
                                            value: lastName
                                    });
                                    customerRecord.setValue({
                                            fieldId: 'custentity_enl_cnpjcpf',
                                            value: cpfcnpj
                                    });
                            }

                            log.debug({title: 'Subsidiaria', details: speNetsuite})
                            customerRecord.setSublistValue({
                                    fieldId: 'subsidiary',
                                    sublistId: 'submachine',
                                    line: 0,
                                    value: speNetsuite
                            });
                            customerRecord.setValue({
                                    fieldId: 'custentity_lrc_metodo_fav_pagamento',
                                    value: 2
                            });

                            var addressDatas = comprador.Cliente.Enderecos;
                            for (k = 0; k < addressDatas.length; k++) {
                                    var addressData = addressDatas[k];
                                    if (addressData) {
                                            var linhaInsert = k;
                                            customerRecord.insertLine({
                                                    sublistId: 'addressbook',
                                                    line: linhaInsert
                                            });

                                            customerRecord.setSublistValue({
                                                    sublistId: 'addressbook',
                                                    fieldId: 'label',
                                                    value: linhaInsert,
                                                    line: linhaInsert
                                            });

                                            customerRecord.setSublistValue({
                                                    sublistId: 'addressbook',
                                                    fieldId: 'defaultbilling',
                                                    value: (linhaInsert == 0 ? true : false),
                                                    line: linhaInsert
                                            });

                                            customerRecord.setSublistValue({
                                                    sublistId: 'addressbook',
                                                    fieldId: 'defaultshipping',
                                                    value: (linhaInsert == 0 ? true : false),
                                                    line: linhaInsert
                                            });

                                            customerRecord.setSublistValue({
                                                    sublistId: 'addressbook',
                                                    fieldId: 'isresidential',
                                                    value: (linhaInsert == 0 ? true : false),
                                                    line: linhaInsert
                                            });

                                            var subrec2 = customerRecord.getSublistSubrecord({
                                                    sublistId: 'addressbook',
                                                    fieldId: 'addressbookaddress',
                                                    line: linhaInsert
                                            });

                                            const cep = addressData.CEP.replace(/\D/g, '');
                                            //const url = 'https://viacep.com.br/ws/' + cep + '/json/';
                                            //const ibge = JSON.parse(https.get({url: url}).body).ibge;
                                            //log.debug({title: 'IBGE', details: ibge})
                                            var address = {
                                                    label: 'Principal',
                                                    country: 'BR',
                                                    zip: addressData.CEP,
                                                    addr1: addressData.Endereco,
                                                    addr2: addressData.EnderecoComplemento,
                                                    custrecord_enl_numero: addressData.EnderecoNumero,
                                                    addr3: addressData.Bairro.substring(0, 30),
                                                    state: addressData.UF,
                                                    city: addressData.Cidade,//_getCityId(addressData.city),
                                                    addressee: comprador.Cliente.Nome
                                            }

                                            log.debug({title: 'Address', details: address});

                                            Object.keys(address).forEach(function (field) {

                                                    if (field === 'state') {
                                                            log.audit({title: 'state', details: address[field]})
                                                            subrec2.setText({
                                                                    fieldId: field,
                                                                    value: address[field]
                                                            });
                                                    } else {
                                                            log.debug({title: 'campo', details: field})
                                                            subrec2.setValue({
                                                                    fieldId: field,
                                                                    value: address[field]
                                                            });
                                                    }
                                            });
                                    }
                            }



                    }
                    if (cliente['Email'] === 'teste@teste'){
                            customerRecord.setValue({
                                    fieldId: 'email',
                                    value: 'teste@junix.com.br'
                            });
                    } else {
                            customerRecord.setValue({
                                    fieldId: 'email',
                                    value: cliente['Email']
                            });
                    }


                    customerRecord.setValue({
                            fieldId: 'mobilephone',
                            value: cliente['Celular']
                    });
                    customerRecord.setValue({
                            fieldId: 'phone',
                            value: cliente['celularComercial']
                    });
                    customerRecord.setValue({
                            fieldId: 'homephone',
                            value: cliente['telefoneResidencial']
                    });
                    var sexo = cliente['Sexo'].toLowerCase();
                    if (sexo == 'masculino') {
                            sexo = 1;
                    } else {
                            sexo = 2;
                    }
                    customerRecord.setValue({
                            fieldId: 'custentity_rsc_sexo',
                            value: sexo
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_codigo_externo',
                            value: cliente['CodigoClienteExterno']
                    });
                    if (cliente['DataNascimento'] != null && cliente['DataNascimento'] != ''){

                            log.debug({title: 'Data Nascimento', details: cliente['DataNascimento']})
                            var nascimento = cliente['DataNascimento'].split('T');
                            var dataNasc = nascimento[0].split('-');
                            var nascData = dataNasc[2] + '/' + dataNasc[1] + '/' + dataNasc[0];
                            nascData = nascData.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$2/$1/$3");
                            nascData = new Date(nascData);
                            customerRecord.setValue({
                                    fieldId: 'custentity_lrc_data_nascimento',
                                    value: nascData
                            });
                    }
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_nacionalidade',
                            value: cliente['Nacionalidade']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_naturalidade',
                            value: cliente['Naturalidade']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_estado_civil',
                            value: cliente['EstadoCivil']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_rg',
                            value: cliente['RG']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentityprof',
                            value: cliente['Profissao']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_orgao_expedidor',
                            value: cliente['OrgaoExpedidor']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_telefone_comercial',
                            value: cliente['TelefoneComercial']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_tipo_pessoa',
                            value: cliente['TipoPessoa']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_nome_pai',
                            value: cliente['NomePai']
                    });
                    customerRecord.setValue({
                            fieldId: 'custentity_lrc_nome_mae',
                            value: cliente['NomeMae']
                    });

                    if (cliente['DataEmissao'] != null && cliente['DataEmissao'] != '') {
                            log.debug({title: 'Data de Emissão', details:cliente['DataEmissão']})
                            var emissao = cliente['DataEmissao'].split('T');
                            // Log.error('nascimento', nascimento)
                            var dataEmissao = emissao[0].split('-');
                            var emissaoData = dataEmissao[2] + '/' + dataEmissao[1] + '/' + dataEmissao[0];
                            emissaoData = emissaoData.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$2/$1/$3");
                            emissaoData = new Date(emissaoData);
                            customerRecord.setValue({
                                    fieldId: 'custentity_lrc_data_emissao',
                                    value: emissaoData
                            });
                    }

                    log.audit({title: 'Cliente', details: customerRecord})
                    var clienteId = customerRecord.save({
                            ignoreMandatoryFields: true
                    });

                    return clienteId
            }

            function createFaturaParcela(retorno, key) {
                    /* Recupera dados do registro a ser processado. */
                    var dadosRetorno = (JSON.parse(retorno))[0];

                    /* Recupera registro do processamento para log dos erros.*/
                    var registroProcesso = record.load({type: 'customrecord_rsc_junix_feed_proposta', id: key});

                    try {
                            /* Obtem os dados da Subsidiaria */
                            getSPEObra(dadosRetorno.CodigoEmpreendimento);

                            var speNetsuite = codEmpreendimento;

                            var projetoObra = codProjeto;

                            if (dadosRetorno.NumeroProposta > 0) {
                                    listaClientes = [];
                                    /* Create or validate Client */
                                    var compradores = dadosRetorno.ListaCompradores;
                                    if (compradores.length > 0) {
                                            for (let i = 0; i < compradores.length; i++) {
                                                    var comprador = compradores[i];
                                                    var principal = comprador.Principal;

                                                    var cliente = _createCustomer(comprador, speNetsuite);
                                                    listaClientes.push(cliente);
                                                    if (principal == true) {
                                                            idClientePrincipal = cliente;
                                                    }
                                            }
                                    }

                                    /* Prepare fields to create  */
                                    var dataCadastroJunix = formatDate(dadosRetorno.DataCadastro);

                                    var vendaData = formatDate(dadosRetorno.DataVenda);

                                    var fieldsInvoice = {
                                            "custbody_rsc_nr_proposta": dadosRetorno.NumeroProposta,
                                            "duedate": dataCadastroJunix,
                                            "trandate": dataCadastroJunix,
                                            "subsidiary": speNetsuite,
                                            "custbody_lrc_distribuicao_premio": dadosRetorno.PossuiDistribuicaoPremio,
                                            "custbody_lrc_critica_fluxo": dadosRetorno.CriticaFluxo,
                                            "custbody_rsc_projeto_obra_gasto_compra": projetoObra,
                                            "custbody_rsc_ebu": dadosRetorno.CodigoBloco,
                                            "custbody_lrc_codigo_unidade": dadosRetorno.CodigoUnidade,
                                            "custbody_lrc_numero_contrato": dadosRetorno.NumeroContrato,
                                            "custbody_rsc_data_venda": vendaData,
                                            "custbody_lrc_tipo_contrato": dadosRetorno.TipoContrato,
                                            "custbody_rsc_ativo": dadosRetorno.Ativo,
                                            "custbody_lrc_itbi_gratis": dadosRetorno.ITBIGratis,
                                            "custbody_lrc_registro_gratis": dadosRetorno.RegistroGratis,
                                            "custbody_lrc_vlr_venda_att": dadosRetorno.ValorVendaAtualizada,
                                            "custbody_lrc_vlr_devedor": dadosRetorno.ValorSaldoDevedor,
                                            "custrecord_enl_bankid": dadosRetorno.Banco,
                                            "custbody_rsc_tipo_op": dadosRetorno.TipoOperacao,
                                            "custbody_rsc_mod_financ": dadosRetorno.ModalidadeFinanciamento,
                                            "custbody_rsc_sist_amort": dadosRetorno.SistemaAmortizacao,
                                            "custbody_lrc_valor_fgts": dadosRetorno.ValorFGTS,
                                            "custbody_lrc_vlr_subsidio": dadosRetorno.ValorSubsidio,
                                            "custbody_lrc_vlr_interveniencia": dadosRetorno.ValorInterveniencia,
                                            "custbody_lrc_recursos_proprios": dadosRetorno.ValorRecursosProprios,
                                            "custrecord_gst_instal_interestrate": dadosRetorno.TaxaJurosv,
                                            "custbody_lrc_assessoria": dadosRetorno.Assessoria,
                                            "custbody_lrc_vlr_total_comissao": dadosRetorno.ValorTotalComissao,
                                            "custbody_rsc_vlr_venda": dadosRetorno.ValorVenda,
                                            "custbody_rsc_tran_unidade": dadosRetorno.CodigoUnidade,

                                    };

                                    var invoiceRecord = record.create({
                                            type: 'invoice',
                                            isDynamic: false
                                    });

                                    Object.keys(fieldsInvoice).forEach(function (key) {
                                            invoiceRecord.setValue({
                                                    fieldId: key,
                                                    value: fieldsInvoice[key]
                                            });
                                    });

                                    invoiceRecord.setValue({
                                            fieldId: 'entity',
                                            value: idClientePrincipal
                                    });
                                    var localidade = codLocation;

                                    /* Create Configuration to Default Item */
                                    var item = 287;
                                    invoiceRecord.setValue({
                                            fieldId: 'location',
                                            value: localidade
                                    });

                                    invoiceRecord.setSublistValue({
                                            fieldId: 'item',
                                            sublistId: 'item',
                                            line: 0,
                                            value: item
                                    });

                                    invoiceRecord.setSublistValue({
                                            fieldId: 'amount',
                                            sublistId: 'item',
                                            line: 0,
                                            value: dadosRetorno.ValorTotalIncorporadora
                                    });

                                    invoiceRecord.setSublistValue({
                                            fieldId: 'quantity',
                                            sublistId: 'item',
                                            line: 0,
                                            value: 1
                                    });

                                    /* Create Fatura */
                                    var faturaPrincipalId = invoiceRecord.save({
                                            ignoreMandatoryFields: true
                                    });

                                    /* Include Client in contract */
                                    log.debug({title:'Lista clientes', details: listaClientes.length})
                                    for (let i = 0; i < listaClientes.length; i++) {
                                            var listaCli = record.create({
                                                    type: 'customrecord_rsc_finan_client_contrato',
                                                    isDynamic: true
                                            });
                                            listaCli.setValue('custrecord_rsc_fat_contrato', faturaPrincipalId);
                                            listaCli.setValue('custrecord_rsc_clientes_contratos', listaClientes[i]);
                                            listaCli.setValue('custrecord_rsc_principal', (listaClientes[i] == idClientePrincipal ? true : false));
                                            listaCli.save({ignoreMandatoryFields: true});
                                    }

                                    /* Update unit status */
                                    var unidade = record.load(
                                        {
                                                type: 'customrecord_rsc_unidades_empreendimento',
                                                id: dadosRetorno.CodigoUnidade,
                                                isDynamic: false
                                        }
                                    );
                                    unidade.setValue('custrecord_rsc_un_emp_nr_contrato', faturaPrincipalId);
                                    unidade.setValue('custrecord_rsc_un_emp_status', 3);
                                    unidade.save({
                                            ignoreMandatoryFields: true
                                    })
                                    var comm = comissao._newCommission(
                                        idClientePrincipal,
                                        dadosRetorno.NumeroProposta,
                                        faturaPrincipalId,
                                        dataCadastroJunix,
                                        projetoObra,
                                        dadosRetorno.CodigoUnidade);
                                    log.audit({title: 'Id Venda', details: faturaPrincipalId});

                                    var faturas = dadosRetorno.ListaParcelas;
                                    if (faturas.length > 0) {
                                            for (let i = 0; i < faturas.length; i++) {
                                                    var fatura = faturas[i];
                                                    var scriptObj = runtime.getCurrentScript();
                                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());

                                                    /* Prepara a data de vencimento */
                                                    var parcelaVencData = formatDate(fatura.Data);

                                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());

                                                    log.debug({title: "Venciemento", details: parcelaVencData});

                                                    var tipoParcela = '';
                                                    switch (fatura.TipoParcela) {
                                                            case 'Ato': tipoParcela = 1;
                                                                    break;
                                                            case 'Mensal 30': tipoParcela = 2;
                                                                    break;
                                                            case 'Mensal 60': tipoParcela = 3;
                                                                    break;
                                                            case 'Mensal': tipoParcela = 4;
                                                                    break;
                                                            case 'Anual': tipoParcela = 5;
                                                                    break;
                                                            case 'Financiamento': tipoParcela = 8;
                                                                    break;
                                                            case 'Única': tipoParcela = 6;
                                                                    break;
                                                            case 'Periodicidade': tipoParcela = 7;
                                                                    break;
                                                            case 'Repasse': tipoParcela = 8;
                                                                    break;
                                                            case 'Unica': tipoParcela =6;
                                                                    break;
                                                            case 'Mensal 90': tipoParcela = 9;
                                                            break;
                                                            default: tipoParcela = 4;
                                                                    break;
                                                    }

                                                    var fieldsCustomerParcela = {
                                                            "custbody_rsc_nr_proposta": dadosRetorno.NumeroProposta,
                                                            "duedate": parcelaVencData,
                                                            "trandate": dataCadastroJunix,
                                                            "startdate": dataCadastroJunix,
                                                            "enddate": parcelaVencData,
                                                            "subsidiary": speNetsuite,
                                                            "custbody_rsc_projeto_obra_gasto_compra": projetoObra,
                                                            "custbody_lrc_numero_contrato": dadosRetorno.NumeroContrato,
                                                            "custbody_rsc_mod_financ": dadosRetorno.ModalidadeFinanciamento,
                                                            "custbody_rsc_sist_amort": dadosRetorno.SistemaAmortizacao,
                                                            "custbody_lrc_fatura_principal": faturaPrincipalId,
                                                            "custbody_lrc_cod_parcela": fatura.CodParcela,
                                                            "custbodyrsc_tpparc": tipoParcela,
                                                            "terms": 4,
                                                            "status": 'B',
                                                            "account": 122,
                                                            "custbody_rsc_tran_unidade": dadosRetorno.CodigoUnidade,
                                                            "custbody_rsc_planocontratual": 'T'
                                                    };

                                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());

                                                    var invoiceRecord = record.create({
                                                            type: 'customsale_rsc_financiamento'
                                                    });

                                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());

                                                    invoiceRecord.setValue({
                                                            fieldId: 'entity',
                                                            value: idClientePrincipal
                                                    });

                                                    Object.keys(fieldsCustomerParcela).forEach(function (key) {
                                                            invoiceRecord.setValue({
                                                                    fieldId: key,
                                                                    value: fieldsCustomerParcela[key],
                                                                    ignoreFieldChange: true
                                                            });
                                                    });

                                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());


                                                    var localidade = codLocation;
                                                    invoiceRecord.setValue({
                                                            fieldId: 'location',
                                                            value: localidade
                                                    });
                                                    /* Busca Estrutura do parcelamento */

                                                    var queryResults
                                                    queryResults = query.runSuiteQL(
                                                        {
                                                                query: 'select b.CUSTRECORD_RSC_ISI_MAIN_ITEM ,  b.custrecord_rsc_isi_item, a.custrecord_rsc_ist_project from customrecord_rsc_installment_setup a, customrecord_rsc_installment_setup_item b\n' +
                                                                    '                                                where\n' +
                                                                    '                                                b.CUSTRECORD_RSC_ISI_INSTALLMENT_SETUP = a.id\n' +
                                                                    '                                                and\n' +
                                                                    '                                                custrecord_rsc_ist_project = ?',
                                                                params: [projetoObra]
                                                        }
                                                    );

                                                    var records = queryResults.asMappedResults();
                                                    if (records.length > 0) {
                                                            // Add the records to the sublist...
                                                            for (r = 0; r < records.length; r++) {
                                                                    var dados = records[r];

                                                                    //var itemCount = invoiceRecord.selectNewLine({"sublistId": "item"});
                                                                    invoiceRecord.setSublistValue({
                                                                            fieldId: 'item',
                                                                            sublistId: 'item',
                                                                            line: r,
                                                                            value: dados['custrecord_rsc_isi_item']
                                                                    });
                                                                    if (dados['custrecord_rsc_isi_main_item'] === 'T') {
                                                                            invoiceRecord.setSublistValue({
                                                                                    fieldId: 'amount',
                                                                                    sublistId: 'item',
                                                                                    line: r,
                                                                                    value: fatura.ValorIncorporadora
                                                                            });
                                                                    } else {
                                                                            invoiceRecord.setSublistValue({
                                                                                    fieldId: 'amount',
                                                                                    sublistId: 'item',
                                                                                    line: r,
                                                                                    value: 0
                                                                            });
                                                                    }

                                                                    invoiceRecord.setSublistValue({
                                                                            fieldId: 'quantity',
                                                                            sublistId: 'item',
                                                                            line: r,
                                                                            value: 1
                                                                    });
                                                                    //invoiceRecord.commitLine({"sublistId": "item"});
                                                            }
                                                    }


                                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());
                                                    var idParcelaRecord = invoiceRecord.save({
                                                            ignoreMandatoryFields: true
                                                    })
                                                    /*Valida se foi existe parcela de comissão para Gerar*/
                                                    if (fatura.Comissionados != null){
                                                            var comissionados = fatura.Comissionados;
                                                            if (comissionados.length > 0) {
                                                                    for (let i = 0; i < comissionados.length; i++) {
                                                                            var comissionado = comissionados[i];
                                                                            comm = comissao._summarizeValues(comm, comissionado, parcelaVencData, fatura.CodParcela);
                                                                    }
                                                            }
                                                    }


                                                    log.audit({title: 'Id Venda', details: idParcelaRecord});
                                            }
                                    }

                                    comm = comissao._createCommission(comm);
                                    log.debug('Remaining governance units: ' + scriptObj.getRemainingUsage());
                                    registroProcesso.setValue(
                                        {
                                                fieldId: 'custrecord_rsc_invoice_netsuite',
                                                value: faturaPrincipalId
                                        });

                                    registroProcesso.setValue(
                                        {
                                                fieldId: 'custrecord_rsc_processado',
                                                value: true
                                        });


                            } else {
                                    registroProcesso.setValue(
                                        {
                                                fieldId: 'custrecord_rsc_log_error',
                                                value: 'Status: Não há Numero de Proposta.'
                                        });
                                    registroProcesso.setValue(
                                        {
                                                fieldId: 'custrecord_rsc_erro_flag',
                                                value: true
                                        });
                            }

                            /* Call Atualizar status Junix*/

                            registroProcesso.save();
                            /* Marcar como Processado*/
                            api.getRequest( 'MARCARCOMOPROCES_JUNIX/1.0/' + dadosRetorno.NumeroProposta);
                    } catch (e) {
                            log.error({title: 'Erro Processamento', details: e.toString()})
                    }
            }

            return {getInputData, map, reduce, summarize}

    });
