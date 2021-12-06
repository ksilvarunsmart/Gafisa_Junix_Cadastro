/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/https', 'N/runtime'], function(https, runtime) {

    function beforeLoad(context) {
        
    }

    function beforeSubmit(context) {
        /*Valida apenas se permanece o valor do campo igual. */
        if (context.oldRecord != null){
            if (context.oldRecord.getValue('custrecord_rsc_atualizado_junix') == context.newRecord.getValue('custrecord_rsc_atualizado_junix')){
                if (context.type !== context.UserEventType.DELETE){
                    context.newRecord.setValue('custrecord_rsc_atualizado_junix', false);
                }
            }
        }

    }

    function afterSubmit(context) {
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    }
});
