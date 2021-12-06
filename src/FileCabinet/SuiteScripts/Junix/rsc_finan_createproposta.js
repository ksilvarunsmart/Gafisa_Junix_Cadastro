/**
 * @NApiVersion 2.1
 */
define(['N/query', 'N/search', 'N/record'],
    
    (query, search, record) => {

            function tratarData(data) {
                    var dataCadastro = data.split('T');
                    var dateCadastro = dataCadastro[0].split('-');
                    var cadastroData = dateCadastro[2] + '/' + dateCadastro[1] + '/' + dateCadastro[0];
                    cadastroData = cadastroData.replace(/(\d{2})\/(\d{2})\/(\d{4})/, "$2/$1/$3");
                    cadastroData = new Date(cadastroData);
                    return cadastroData;
            }

            function _validateUnidade(codUnidade){
                    var unidade = record.load(
                        {
                                type: 'customrecord_rsc_unidades_empreendimento',
                                id: dadosRetorno.CodigoUnidade,
                                isDynamic: false
                        }
                    );
                    var statusUnidade = record.getValue({fieldId: 'custrecord_rsc_un_emp_status'});
                    return (statusUnidade == '1')? true: false
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
                    var codEmpreendimento;
                    var codProjeto;
                    var codLocation;

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

                            log.debug({title: 'CodEmpreendimento', details: codEmpreendimento});

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
                            return {codEmpreendimento: codEmpreendimento, codProjeto: codProjeto, codLocation: codLocation};
                    } else {
                            return {codEmpreendimento: null, codProjeto: null, codLocation: null};
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
                            var linhas = customerRecord.getLineCount({sublistId: 'addressbook'});

                            for (d = 0; d < linhas; d++) {
                                    customerRecord.removeLine({sublistId: 'addressbook', line: d});
                            }

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

            return {getSPEObra, getSeparetedName, _createCustomer, tratarData}
    });
