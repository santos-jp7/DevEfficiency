// Pedido de registro de evento da NFS-e (pedRegEvento, leiaute v1.01) — por ora o cancelamento (e101101).
// Id = "PRE" + chave de acesso (50) + código do evento (6). Assinatura enveloped sobre <infPedReg>.
import { APP_VERSION, DPS_VERSION, NFSE_NAMESPACE, escapeXml, formatDateTimeBR, onlyDigits } from './dps'
import { signXml } from './sign'

export const EVENTO_CANCELAMENTO = '101101'

// 1 = erro na emissão · 2 = serviço não prestado · 9 = outros
export const MOTIVOS_CANCELAMENTO: Record<string, string> = {
    '1': 'Erro na emissão',
    '2': 'Serviço não prestado',
    '9': 'Outros',
}

export function buildCancelamentoXml(params: {
    ambiente: 'producao' | 'producao_restrita'
    cnpjAutor: string
    chave: string
    cMotivo: string
    xMotivo: string
    dhEvento?: Date
}): string {
    const id = `PRE${params.chave}${EVENTO_CANCELAMENTO}`
    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        `<pedRegEvento xmlns="${NFSE_NAMESPACE}" versao="${DPS_VERSION}">` +
        `<infPedReg Id="${id}">` +
        `<tpAmb>${params.ambiente === 'producao' ? '1' : '2'}</tpAmb>` +
        `<verAplic>${escapeXml(APP_VERSION)}</verAplic>` +
        `<dhEvento>${formatDateTimeBR(params.dhEvento || new Date(Date.now() - 30_000))}</dhEvento>` +
        `<CNPJAutor>${onlyDigits(params.cnpjAutor)}</CNPJAutor>` +
        `<chNFSe>${params.chave}</chNFSe>` +
        '<e101101>' +
        '<xDesc>Cancelamento de NFS-e</xDesc>' +
        `<cMotivo>${escapeXml(params.cMotivo)}</cMotivo>` +
        `<xMotivo>${escapeXml(params.xMotivo)}</xMotivo>` +
        '</e101101>' +
        '</infPedReg>' +
        '</pedRegEvento>'
    )
}

export const signPedRegEvento = (xml: string, keyPem: string, certPem: string) =>
    signXml(xml, keyPem, certPem, 'pedRegEvento', 'infPedReg')
