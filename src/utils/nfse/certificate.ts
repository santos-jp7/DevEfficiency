// Certificado digital A1 (ICP-Brasil, .pfx/.p12) usado na NFS-e: assina a DPS (XMLDSig) e autentica a conexão (mTLS).
// O arquivo e a senha ficam no banco CRIPTOGRAFADOS (AES-256-GCM) com a chave NFSE_CERT_KEY (ou SECRET).
import crypto from 'crypto'
import forge from 'node-forge'

export interface CertificateInfo {
    subject: string
    cnpj: string | null
    issuer: string
    notBefore: string
    notAfter: string
    serial: string
}

export interface LoadedCertificate {
    pfx: Buffer
    password: string
    keyPem: string
    certPem: string
    info: CertificateInfo
}

function encryptionKey(): Buffer {
    const secret = process.env.NFSE_CERT_KEY || process.env.SECRET
    if (!secret) throw new Error('Defina NFSE_CERT_KEY (ou SECRET) para guardar o certificado da NFS-e.')
    return crypto.createHash('sha256').update(`nfse-cert:${secret}`).digest()
}

export function encryptSecret(plain: Buffer | string): string {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
    const data = Buffer.concat([cipher.update(typeof plain === 'string' ? Buffer.from(plain, 'utf8') : plain), cipher.final()])
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decryptSecret(payload: string): Buffer {
    const [version, iv, tag, data] = String(payload || '').split(':')
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Certificado da NFS-e não configurado.')
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    try {
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()])
    } catch {
        throw new Error('Não foi possível abrir o certificado salvo (a chave NFSE_CERT_KEY/SECRET mudou?). Envie o certificado novamente.')
    }
}

// CNPJ do titular: extensão OtherName OID 2.16.76.1.3.3 (padrão ICP-Brasil); se não achar, o CN "RAZÃO:CNPJ".
function extractCnpj(cert: forge.pki.Certificate): string | null {
    try {
        const ext: any = cert.getExtension('subjectAltName')
        const raw: string | undefined = ext?.value
        if (raw) {
            const oid = forge.asn1.oidToDer('2.16.76.1.3.3').getBytes()
            const at = raw.indexOf(oid)
            if (at >= 0) {
                const m = raw.slice(at + oid.length, at + oid.length + 40).match(/\d{14}/)
                if (m) return m[0]
            }
        }
    } catch {
        /* segue para o CN */
    }
    const cn = String(cert.subject.getField('CN')?.value || '')
    const m = cn.match(/(\d{14})\s*$/) || cn.match(/\d{14}/)
    return m ? m[1] || m[0] : null
}

const dn = (attrs: forge.pki.CertificateField[]) =>
    attrs.map((a) => `${a.shortName || a.name}=${a.value}`).join(', ')

export function parsePfx(pfx: Buffer, password: string): LoadedCertificate {
    let p12: forge.pkcs12.Pkcs12Pfx
    try {
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')))
        p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password)
    } catch {
        throw new Error('Não foi possível abrir o certificado: arquivo inválido ou senha incorreta.')
    }

    const keyBags = [
        ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
        ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
    ]
    const key = keyBags.find((b) => b.key)?.key
    if (!key) throw new Error('O arquivo não contém a chave privada do certificado (use o A1 exportado com a chave).')

    // Entre os certificados do arquivo (a cadeia pode vir junto), usa o que corresponde à chave privada.
    const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
        .map((b) => b.cert)
        .filter(Boolean) as forge.pki.Certificate[]
    const modulus = (key as forge.pki.rsa.PrivateKey).n
    const cert = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals?.(modulus)) || certs[0]
    if (!cert) throw new Error('O arquivo não contém o certificado.')

    return {
        pfx,
        password,
        keyPem: forge.pki.privateKeyToPem(key),
        certPem: forge.pki.certificateToPem(cert),
        info: {
            subject: dn(cert.subject.attributes),
            cnpj: extractCnpj(cert),
            issuer: dn(cert.issuer.attributes),
            notBefore: cert.validity.notBefore.toISOString(),
            notAfter: cert.validity.notAfter.toISOString(),
            serial: cert.serialNumber,
        },
    }
}
