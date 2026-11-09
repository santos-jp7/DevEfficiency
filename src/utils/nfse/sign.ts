// Assinatura XMLDSig da DPS: enveloped sobre <infDPS> (Reference URI = #Id), RSA-SHA256, canonicalização C14N,
// KeyInfo só com o X509Certificate do titular. A <Signature> entra como último filho de <DPS>, sem prefixo de
// namespace (a Sefin rejeita prefixos — E1228).
import { SignedXml } from 'xml-crypto'

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature'
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256'

export function signXml(xml: string, keyPem: string, certPem: string, rootName: string, signedName: string): string {
    const m = new RegExp(`<${signedName}\\b[^>]*\\bId="([^"]+)"`).exec(xml)
    if (!m) throw new Error(`Elemento <${signedName}> sem atributo Id.`)

    const sig = new SignedXml({
        privateKey: keyPem,
        publicCert: certPem,
        signatureAlgorithm: RSA_SHA256,
        canonicalizationAlgorithm: C14N,
    })
    sig.addReference({
        xpath: `//*[local-name(.)='${signedName}']`,
        transforms: [ENVELOPED, C14N],
        digestAlgorithm: SHA256,
        uri: `#${m[1]}`,
    })
    sig.computeSignature(xml, { location: { reference: `//*[local-name(.)='${rootName}']`, action: 'append' } })
    return sig.getSignedXml()
}

export const signDps = (xml: string, keyPem: string, certPem: string) => signXml(xml, keyPem, certPem, 'DPS', 'infDPS')
