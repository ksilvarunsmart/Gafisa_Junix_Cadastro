/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/record', './rsc_junix_call_api.js', 'N/query'],
    
    (search, record, sendAPI, query) => {
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
                return query.runSuiteQL({query: 'select a.id, custentity_rsc_codigo_junix_obra, ' +
                            'custrecord_rsc_un_emp_bloco, custrecord_rsc_un_emp_unidade, custbody_lrc_numero_contrato, ' +
                            'custbody_rsc_nr_proposta, TO_CHAR(custbody_rsc_data_venda,\'YYYY-MM-DD\') custbody_rsc_data_venda, custbody_rsc_vlr_venda, ' +
                            'custbody_rsc_ativo, custbody_lrc_tipo_contrato, a.foreigntotal from transaction a \n' +
                            'join job b on b.id = a.custbody_rsc_projeto_obra_gasto_compra\n' +
                            'join customrecord_rsc_unidades_empreendimento c on c.id = a.custbody_rsc_tran_unidade\n' +
                            ' where type = \'CustInvc\' and a.id = 54552 and custbody_rsc_status_contrato = \'2\' '}).asMappedResults();
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
                        log.audit({title: 'Detail', details: mapContext})
                        var resultado = JSON.parse(mapContext.value);
                        log.debug({title: 'Requisicao', details: resultado});

                        var querySeries = query.runSuiteQL(
                            {query:'select b.recordid codigoSerie, b.name tipoParcela, TO_CHAR(min(a.duedate),\'YYYY-MM-DD\') dataReferencia, 0 taxaJuros, sum(foreigntotal), 0 prazo, max(foreigntotal) valorParcela,  TO_CHAR(min(a.duedate),\'YYYY-MM-DD\') dataPrimeiroVencimento, count(*) quantidade, count(*) quantidademeses, \'A VISTA\' tipoReceita\n' +
                                        'from transaction a\n' +
                                        'join customlist_rsc_tipo_parcela b on a.custbodyrsc_tpparc = b.recordid\n' +
                                        'where custbody_lrc_fatura_principal = ?\n' +
                                        'group by b.recordid, b.name', params: [resultado['id']]});
                        var resultadoSeries = querySeries.asMappedResults();
                        var series = [];
                        var serieArray = [];
                        if (resultadoSeries.length > 0){
                                for (let i = 0; i < resultadoSeries.length; i++) {
                                        var serie = resultadoSeries[i];
                                        var serieArr = {
                                                "codigoSerie": serie['codigoserie'],
                                                "codigoSerieExterno": serie['codigoserieexterno'],
                                                "tipoParcela": serie['tipoparcela'],
                                                "numeroSerie": serie['numeroserie'],
                                                "aplicaCorrecao": serie['aplicacorrecao'],
                                                "dataReferencia": serie['datareferencia'],
                                                "taxaJuros": serie['taxajuros'],
                                                "valor": serie['valor'],
                                                "prazo": serie['prazo'],
                                                "valorParcela": serie['valorparcela'],
                                                "dataPrimeiroVencimento": serie['dataprimeirovencimento'],
                                                "quantidade": serie['quantidade'],
                                                "quantidademeses": serie['quantidademeses'],
                                                "tipoReceita": serie['tipoReceita']
                                        }
                                        series.push(serieArr);
                                        serieArray.push({"tipoParcela": serie['tipoparcela'], "codigoSerie": serie['codigoserie']})
                                }
                        }
                        var parcelas = [];

                        var sql = 'select t.id codigo, \n' +
                            '\tcustbodyrsc_tpparc numeroSerie,\n' +
                            '\tcustbodyrsc_tpparc tpparc,\n' +
                            '\tt.trandate data, \n' +
                            '\t\' \' dataPagamento,\n' +
                            '\tt.foreigntotal\tvalorParcela,\n' +
                            '\tt.foreignamountpaid valorPago,\n' +
                            '\tt.foreignamountunpaid valorEmAberto, \n' +
                            '\t(select b.foreignamount from transactionline b where b.transaction = t.id and linesequencenumber = 0)\tvalorParcelaPrincipal,\n' +
                            '\t0 valordesconto,\n' +
                            '\t0 juros,\n' +
                            '        0 multa,\n' +
                            '        0 mora,\n' +
                            '        0 prorata,\n' +
                            '        0 igpm,\n' +
                            '\t(select b.foreignamount from transactionline b where b.transaction = t.id and linesequencenumber = 2) incc,\n' +
                            '\t\'\' tipoJuros,\n' +
                            '\tstatus status,\n' +
                            '\tt.foreigntotal valorAtualizado,\n' +
                            '        \' \' codigoParcelaExterno,\n' +
                            '        0 codigoContrato,\n' +
                            '        \' \' codigoContratoExterno,\n' +
                            '        t.entity codigoClientePrincipal,\n' +
                            '        \' \' codigoClienteExterno,\n' +
                            '        \' \' codigoUnidadeExterno,\n' +
                            '        \' \' dataEmissaoBoleto,\n' +
                            '        t.duedate dataVencimento\n' +
                            'from transaction as t \n' +
                            ' where t.custbody_lrc_fatura_principal = '+ resultado['id'] +' and t.type = \'CuTrSale\'  order by t.duedate asc';

                        log.debug({title: 'Sql ', details: sql})
                        var queryParcelas = query.runSuiteQL({
                                query: sql
                        });
                        var resultadoParcelas = queryParcelas.asMappedResults();
                        log.debug({title: 'Parcela', details: resultadoParcelas});
                        if (resultadoParcelas.length > 0){
                                for (var i = 0; i < resultadoParcelas.length; i++){
                                        var parcel = resultadoParcelas[i];
                                        log.debug({title: 'Parcela', details: parcel});
                                        log.debug({title: 'Tipo Parcela', details: parcel['tpparc']});
                                        log.debug({title: 'Lista Tipos Parcela', details: serieArray});
                                        var tipoParcela = serieArray.filter(word => word.codigoSerie == parcel['tpparc']);
                                        var parcela = {
                                                codigo: parcel['codigo'],
                                                numeroSerie: parcel['numeroserie'],
                                                numeroParcela: parcel['numeroparcela'],
                                                tipoParcela: tipoParcela[0].tipoParcela,
                                                data: parcel['data'],
                                                dataPagamento: parcel['datapagamento'],
                                                valorParcela: parcel['valorparcela'],
                                                valorPago: parcel['valorpago'],
                                                valorEmAberto: parcel['valoremaberto'],
                                                valorParcelaPrincipal: parcel['valorparcelaprincipal'],
                                                valorDesconto: parcel['valordesconto'],
                                                juros: parcel['juros'],
                                                multa: parcel['multa'],
                                                mora: parcel['mora'],
                                                prorata: parcel['prorata'],
                                                igpm: parcel['igpm'],
                                                incc: parcel['incc'],
                                                tipoJuros: parcel['tipojuros'],
                                                status: parcel['status'],
                                                valorAtualizado: parcel['valoratualizado'],
                                                codigoParcelaExterno: parcel['codigoparcelaexterno'],
                                                codigoContrato: parcel['codigocontrato'],
                                                codigoContratoExterno: parcel['codigocontratoexterno'],
                                                codigoClientePrincipal: parcel['codigoclienteprincipal'],
                                                codigoClienteExterno: parcel['codigoclienteexterno'],
                                                codigoUnidadeExterno: parcel['codigounidadeexterno'],
                                                dataEmissaoBoleto: parcel['dataemissaoboleto'],
                                                dataVencimento: parcel['datavencimento']
                                        }
                                        parcelas.push(parcela);
                                }
                        }

                        var queryCliente = query.runSuiteQL({
                                query:'select b.altname nome, custentity_enl_cnpjcpf cpF_CNPJ, b.email email, custentity_lrc_data_nascimento dataNascimento, d.zip cep, d.addr1 endereco, \n' +
                                    'd. custrecord_enl_numero enderecoNumero, d.addr2 enderecoComplemento, d.addr3 bairro, city cidade, state uf,  a.custrecord_rsc_principal principal, \n' +
                                    'custentity_lrc_nacionalidade nacionalidade,  custentity_lrc_naturalidade naturalidade, custentity_lrc_estado_civil estadoCivil, custentity_lrc_rg rg, \n' +
                                    'custentity_lrc_orgao_expedidor orgaoExpedidor, custentityprof profissao, c.homephone telefoneComercial, c.mobilephone celular, custentity_lrc_tipo_pessoa tipo from customrecord_rsc_finan_client_contrato a \n' +
                                    'join entity b on b.id = a.custrecord_rsc_clientes_contratos\n' +
                                    'join customer c on b.customer = c.id \n' +
                                    'join entityaddress d on c.defaultbillingaddress = d.nkey ' +
                                    'where custrecord_rsc_fat_contrato = ?'
                        , params: [resultado['id']]});
                        var results = queryCliente.asMappedResults();
                        var compradores = [];
                        if (results.length > 0){
                                for (var i = 0; i< results.length; i++) {
                                        var cliente = results[i];
                                        var informacoesProfissionais = {
                                                tipo: "string",
                                                cargoFuncao: "string",
                                                dataAdmissao: "2021-09-11T17:09:36.892Z",
                                                telefone: "string",
                                                empresa: "string",
                                                cnpj: "string",
                                                cep: "string",
                                                endereco: "string",
                                                enderecoNumero: "string",
                                                enderecoComplemento: "string",
                                                bairro: "string",
                                                cidade: "string",
                                                uf: "string",
                                                valorRenda: 0,
                                                valorRendaLiquido: 0
                                        }
                                        var fgts = {
                                                cpF_CNPJ: "string",
                                                valorFGTS: 0,
                                                numeroContaFGTS: "string",
                                                codigoEmpregador: "string",
                                                valor: 0,
                                                possuiTresAnos: true
                                        }
                                        var informacoesBancarias = {
                                                cpF_CNPJ: "string",
                                                codigoBanco: "string",
                                                agencia: 0,
                                                conta: 0,
                                                valorLimite: 0,
                                                tipoConta: "string"
                                        }

                                        var comprador = {
                                                nome: cliente['nome'],
                                                cpF_CNPJ: cliente['cpf_cnpj'],
                                                email: cliente['email'],
                                                dataNascimento: cliente['dataNascimento'],
                                                cep: cliente['cep'],
                                                endereco: cliente['endereco'],
                                                enderecoNumero: cliente['enderecoNumero'],
                                                enderecoComplemento: cliente['enderecoComplemento'],
                                                bairro: cliente['bairro'],
                                                cidade: cliente['cidade'],
                                                uf: cliente['uf'],
                                                principal: (cliente['principal'] == 'T'? true: false),
                                                nacionalidade: cliente['nacionalidade'],
                                                naturalidade: cliente['naturalidade'],
                                                estadoCivil: cliente['estadoCivil'],
                                                rg: cliente['rg'],
                                                orgaoExpedidor: cliente['orgaoExpedidor'],
                                                profissao: cliente['profissao'],
                                                telefoneComercial: cliente['telefoneComercial'],
                                                celular: cliente['celular'],
                                                //celularComercial: "string",
                                                //telefoneResidencial: "string",
                                                tipo: cliente['tipo'],
                                                //cpF_CNPJ_Conjuge: "string",
                                                sexo: "M",
                                                //informacoesProfissionais: informacoesProfissionais,
                                                //fgts: fgts,
                                                //informacoesBancarias: informacoesBancarias
                                        }
                                        compradores.push(comprador);

                                }
                        }





                        var objInvoice = {
                                CodigoEmpreendimento: resultado['custentity_rsc_codigo_junix_obra'],
                                codigoBloco: resultado['custrecord_rsc_un_emp_bloco'],
                                unidade: resultado['custrecord_rsc_un_emp_unidade'],
                                numeroProposta: resultado['custbody_rsc_nr_proposta'],
                                numeroContrato: resultado['custbody_lrc_numero_contrato'],
                                dataVenda: resultado['custbody_rsc_data_venda'],
                                valorVenda: resultado['custbody_rsc_vlr_venda'],
                                ativo: (resultado['custbody_rsc_ativo'] == 'T'? true: false),
                                tipoContrato: resultado['custbody_lrc_tipo_contrato'],
                                //itbiGratis: true,
                                //registroGratis: true,
                                dataEmissao: resultado['custbody_rsc_data_venda'],
                                valorVendaAtualizada: resultado['foreigntotal'],
                                valorSaldoDevedor: resultado['foreigntotal'],
                                //banco: "string",
                                //tipoOperacao: "string",
                                //dataRepasseFuturo: "2021-09-11T17:09:36.892Z",
                                //modalidadeFinanciamento: "string",
                                //sistemaAmortizacao: "string",
                                //valorFGTS: 0,
                                //valorSubsidio: 0,
                                //valorInterveniencia: 0,
                                //valorRecursosProprios: 0,
                                //taxaJuros: 0,
                                //dataLiberacaoChave: "string",
                                //tipoBloqueio: "string",
                                //dataBloqueio: "2021-09-11T17:09:36.892Z",
                                //status : 'Contrato',
                                compradores: compradores,
                                series: series,
                                parcelas: parcelas
                        };
                        var body = objInvoice;

                log.debug({title: 'Body', details: body});
                var retorno = sendAPI.sendRequest(body, 'CONTRATO_SALVAR_JUNIX/1.0/');
                log.debug({title: 'Retorno', details: retorno});
                /*invoiceRecord.setValue({
                        fieldId: 'custbody_lrc_enviado_para_junix',
                        value: true
                });
                invoiceRecord.save({
                        ignoreMandatoryFields: true
                });*/
                } catch (e){
                        log.error({title: "Erro Processamento", details: e.message})
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
            /*
                           {
                                   "codigoEmpreendimento": "string",
                                   "codigoBloco": "string",
                                   "unidade": "string",
                                   "numeroProposta": "string",
                                   "numeroContrato": "string",
                                   "dataVenda": "2021-09-11T17:09:36.892Z",
                                   "valorVenda": 0,
                                   "dataEntregaChaves": "2021-09-11T17:09:36.892Z",
                                   "ativo": true,
                                   "tipoContrato": "string",
                                   "dataPrevisaoEntrega": "2021-09-11T17:09:36.892Z",
                                   "itbiGratis": true,
                                   "registroGratis": true,
                                   "dataEmissao": "2021-09-11T17:09:36.892Z",
                                   "valorVendaAtualizada": 0,
                                   "valorSaldoDevedor": 0,
                                   "banco": "string",
                                   "tipoOperacao": "string",
                                   "dataRepasseFuturo": "2021-09-11T17:09:36.892Z",
                                   "modalidadeFinanciamento": "string",
                                   "sistemaAmortizacao": "string",
                                   "valorFGTS": 0,
                                   "valorSubsidio": 0,
                                   "valorInterveniencia": 0,
                                   "valorRecursosProprios": 0,
                                   "taxaJuros": 0,
                                   "dataLiberacaoChave": "string",
                                   "tipoBloqueio": "string",
                                   "dataBloqueio": "2021-09-11T17:09:36.892Z",
                                   "compradores": [
                                           {
                                                   "nome": "string",
                                                   "cpF_CNPJ": "string",
                                                   "email": "string",
                                                   "dataNascimento": "2021-09-11T17:09:36.892Z",
                                                   "cep": "string",
                                                   "endereco": "string",
                                                   "enderecoNumero": "string",
                                                   "enderecoComplemento": "string",
                                                   "bairro": "string",
                                                   "cidade": "string",
                                                   "uf": "string",
                                                   "principal": true,
                                                   "nacionalidade": "string",
                                                   "naturalidade": "string",
                                                   "estadoCivil": "string",
                                                   "rg": "string",
                                                   "orgaoExpedidor": "string",
                                                   "profissao": "string",
                                                   "telefoneComercial": "string",
                                                   "celular": "string",
                                                   "celularComercial": "string",
                                                   "telefoneResidencial": "string",
                                                   "tipo": "string",
                                                   "cpF_CNPJ_Conjuge": "string",
                                                   "sexo": "string",
                                                   "informacoesProfissionais": [
                                                           {
                                                                   "tipo": "string",
                                                                   "cargoFuncao": "string",
                                                                   "dataAdmissao": "2021-09-11T17:09:36.892Z",
                                                                   "telefone": "string",
                                                                   "empresa": "string",
                                                                   "cnpj": "string",
                                                                   "cep": "string",
                                                                   "endereco": "string",
                                                                   "enderecoNumero": "string",
                                                                   "enderecoComplemento": "string",
                                                                   "bairro": "string",
                                                                   "cidade": "string",
                                                                   "uf": "string",
                                                                   "valorRenda": 0,
                                                                   "valorRendaLiquido": 0
                                                           }
                                                   ],
                                                   "fgts": [
                                                           {
                                                                   "cpF_CNPJ": "string",
                                                                   "valorFGTS": 0,
                                                                   "numeroContaFGTS": "string",
                                                                   "codigoEmpregador": "string",
                                                                   "valor": 0,
                                                                   "possuiTresAnos": true
                                                           }
                                                   ],
                                                   "informacoesBancarias": [
                                                           {
                                                                   "cpF_CNPJ": "string",
                                                                   "codigoBanco": "string",
                                                                   "agencia": 0,
                                                                   "conta": 0,
                                                                   "valorLimite": 0,
                                                                   "tipoConta": "string"
                                                           }
                                                   ]
                                           }
                                   ],
                                   "series": [
                                           {
                                                   "codigoSerie": 0,
                                                   "codigoSerieExterno": "string",
                                                   "tipoAmortizacao": "string",
                                                   "taxaAmortizacao": 0,
                                                   "tipoParcela": "string",
                                                   "tipoIndexador": "string",
                                                   "tipoIndice": "string",
                                                   "reajusteAplique": "string",
                                                   "numeroSerie": 0,
                                                   "aplicaCorrecao": true,
                                                   "dataReferencia": "2021-09-11T17:09:36.892Z",
                                                   "taxaJuros": 0,
                                                   "valor": 0,
                                                   "prazo": 0,
                                                   "valorParcela": 0,
                                                   "dataPrimeiroVencimento": "2021-09-11T17:09:36.892Z",
                                                   "dataInicioCorrecao": "2021-09-11T17:09:36.892Z",
                                                   "quantidade": 0,
                                                   "quantidademeses": 0,
                                                   "tipoReceita": "string"
                                           }
                                   ],
                                   "parcelas": [
                                           {
                                                   "codigo": "string",
                                                   "numeroSerie": "string",
                                                   "numeroParcela": 0,
                                                   "tipoParcela": "string",
                                                   "data": "2021-09-11T17:09:36.892Z",
                                                   "dataPagamento": "2021-09-11T17:09:36.892Z",
                                                   "valorParcela": 0,
                                                   "valorPago": 0,
                                                   "valorEmAberto": 0,
                                                   "valorParcelaPrincipal": 0,
                                                   "valorDesconto": 0,
                                                   "juros": 0,
                                                   "multa": 0,
                                                   "mora": 0,
                                                   "prorata": 0,
                                                   "igpm": 0,
                                                   "incc": 0,
                                                   "tipoJuros": "string",
                                                   "status": "string",
                                                   "valorAtualizado": 0,
                                                   "codigoParcelaExterno": "string",
                                                   "codigoContrato": 0,
                                                   "codigoContratoExterno": "string",
                                                   "codigoClientePrincipal": 0,
                                                   "codigoClienteExterno": "string",
                                                   "codigoUnidadeExterno": "string",
                                                   "dataEmissaoBoleto": "2021-09-11T17:09:36.892Z",
                                                   "dataVencimento": "2021-09-11T17:09:36.892Z"
                                           }
                                   ],
                                   "status": "string"
                           }
                            */
    });
