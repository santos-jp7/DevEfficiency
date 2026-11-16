// Leitura do XML da NFS-e devolvido pela Sefin Nacional (só os campos usados no sistema e no DANFSe).
import { DOMParser } from '@xmldom/xmldom'

const child = (parent: any, tag: string): any => (parent ? parent.getElementsByTagName(tag)[0] || null : null)
const text = (parent: any, tag: string): string | null => {
    const node = child(parent, tag)
    return node ? String(node.textContent ?? '').trim() : null
}

function pessoa(node: any) {
    if (!node) return null
    const end = child(node, 'end') || child(node, 'enderNac')
    const endNac = child(end, 'endNac')
    return {
        documento: text(node, 'CNPJ') || text(node, 'CPF') || text(node, 'NIF') || '',
        im: text(node, 'IM'),
        nome: text(node, 'xNome') || '',
        fantasia: text(node, 'xFant'),
        email: text(node, 'email'),
        fone: text(node, 'fone'),
        endereco: end
            ? {
                  logradouro: text(end, 'xLgr'),
                  numero: text(end, 'nro'),
                  complemento: text(end, 'xCpl'),
                  bairro: text(end, 'xBairro'),
                  cMun: text(endNac || end, 'cMun'),
                  uf: text(end, 'UF'),
                  cep: text(endNac || end, 'CEP'),
              }
            : null,
    }
}

export function parseNfseXml(xml: string) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml')
    const inf = child(doc, 'infNFSe')
    if (!inf) throw new Error('XML da NFS-e sem o grupo infNFSe.')
    const id = String(inf.getAttribute('Id') || '')
    const dps = child(inf, 'infDPS')
    const valoresNfse = child(inf, 'valores') // o primeiro "valores" dentro de infNFSe é o da NFS-e (antes do DPS)
    const valoresDps = child(dps, 'valores')
    const serv = child(dps, 'serv')
    const tribMun = child(valoresDps, 'tribMun')

    return {
        chaveAcesso: id.replace(/^NFS/, ''),
        numero: text(inf, 'nNFSe'),
        cStat: text(inf, 'cStat'),
        dhProc: text(inf, 'dhProc'),
        localEmissao: text(inf, 'xLocEmi'),
        localPrestacao: text(inf, 'xLocPrestacao'),
        localIncidencia: text(inf, 'xLocIncid'),
        tributacaoNacional: text(inf, 'xTribNac'),
        tributacaoMunicipal: text(inf, 'xTribMun'),
        nbsDescricao: text(inf, 'xNBS'),
        emitente: pessoa(child(inf, 'emit')),
        valores: {
            vBC: text(valoresNfse, 'vBC'),
            pAliqAplic: text(valoresNfse, 'pAliqAplic'),
            vISSQN: text(valoresNfse, 'vISSQN'),
            vTotalRet: text(valoresNfse, 'vTotalRet'),
            vLiq: text(valoresNfse, 'vLiq'),
        },
        dps: {
            id: dps ? String(dps.getAttribute('Id') || '') : '',
            dhEmi: text(dps, 'dhEmi'),
            competencia: text(dps, 'dCompet'),
            serie: text(dps, 'serie'),
            numero: text(dps, 'nDPS'),
            tomador: pessoa(child(dps, 'toma')),
            opSimpNac: text(child(dps, 'regTrib'), 'opSimpNac'),
            cTribNac: text(serv, 'cTribNac'),
            cTribMun: text(serv, 'cTribMun'),
            cNBS: text(serv, 'cNBS'),
            descricao: text(serv, 'xDescServ'),
            infoComplementar: text(serv, 'xInfComp'),
            vServ: text(valoresDps, 'vServ'),
            tpRetISSQN: text(tribMun, 'tpRetISSQN'),
            pAliq: text(tribMun, 'pAliq'),
            pTotTribSN: text(valoresDps, 'pTotTribSN'),
        },
    }
}

export type ParsedNfse = ReturnType<typeof parseNfseXml>
