import { FastifyReply, FastifyRequest } from 'fastify'
import Nfse from '../models/Nfse'
import {
    NfseError,
    cancelNfse,
    emitNfseForBilling,
    nfseDraft,
    nfsePdf,
    substituteNfse,
    substitutionDraft,
    syncNfse,
} from '../utils/nfse/emit'
import { MOTIVOS_CANCELAMENTO } from '../utils/nfse/events'
import {
    getCertificateInfo,
    getNfseSettings,
    normalizeSettings,
    saveCertificate,
    saveNfseSettings,
    settingsProblems,
} from '../utils/nfse/settings'

type Req = FastifyRequest<{ Params: { id: string }; Body: Record<string, any>; Querystring: Record<string, any> }>

function fail(res: FastifyReply, err: any) {
    if (err instanceof NfseError) return res.status(err.status).send({ message: err.message, details: err.details })
    console.error('NFS-e:', err)
    return res.status(500).send({ message: err?.message || 'Erro ao processar a NFS-e.' })
}

const userId = (req: any) => req.__user?.user?.id ?? null

// Lista sem os XMLs (podem ter dezenas de KB cada).
const LIST_ATTRS = { exclude: ['xml_dps', 'xml_nfse', 'xml_evento'] }

class nfseController {
    static async settings(req: Req, res: FastifyReply) {
        const settings = await getNfseSettings()
        const certificate = await getCertificateInfo()
        return res.send({ settings, certificate, problems: settingsProblems(settings, certificate) })
    }

    static async saveSettings(req: Req, res: FastifyReply) {
        const { values, errors } = normalizeSettings(req.body || {})
        if (errors.length) return res.status(400).send({ message: errors.join(' '), details: errors })
        await saveNfseSettings(values)
        return nfseController.settings(req, res)
    }

    // Body: { pfx: base64 (ou data URL), password }
    static async uploadCertificate(req: Req, res: FastifyReply) {
        const { pfx, password } = (req.body || {}) as any
        if (!pfx || !password) return res.status(400).send({ message: 'Envie o arquivo .pfx e a senha do certificado.' })
        const b64 = String(pfx).replace(/^data:[^;]*;base64,/, '')
        try {
            const info = await saveCertificate(Buffer.from(b64, 'base64'), String(password))
            const settings = await getNfseSettings()
            return res.send({ certificate: info, problems: settingsProblems(settings, info) })
        } catch (err: any) {
            return res.status(400).send({ message: err?.message || 'Certificado inválido.' })
        }
    }

    static async index(req: Req, res: FastifyReply) {
        const { status, BillingId, limit } = (req.query || {}) as any
        const where: any = {}
        if (status) where.status = status
        if (BillingId) where.BillingId = BillingId
        const rows = await Nfse.findAll({
            where,
            attributes: LIST_ATTRS,
            order: [['id', 'DESC']],
            limit: Math.min(parseInt(limit, 10) || 100, 500),
        })
        return res.send(rows)
    }

    static async show(req: Req, res: FastifyReply) {
        const nfse = await Nfse.findByPk(req.params.id, { attributes: LIST_ATTRS })
        if (!nfse) return res.status(404).send({ message: 'NFS-e não encontrada' })
        return res.send(nfse)
    }

    static async draft(req: Req, res: FastifyReply) {
        try {
            return res.send(await nfseDraft(parseInt(req.params.id, 10)))
        } catch (err) {
            return fail(res, err)
        }
    }

    static async emit(req: Req, res: FastifyReply) {
        try {
            const nfse = await emitNfseForBilling(parseInt(req.params.id, 10), (req.body || {}) as any, userId(req))
            const { xml_dps, xml_nfse, xml_evento, ...data } = nfse.toJSON() as any
            return res.status(nfse.status === 'autorizada' ? 201 : 200).send(data)
        } catch (err) {
            return fail(res, err)
        }
    }

    static async sync(req: Req, res: FastifyReply) {
        try {
            const nfse = await syncNfse(parseInt(req.params.id, 10))
            const { xml_dps, xml_nfse, xml_evento, ...data } = nfse.toJSON() as any
            return res.send(data)
        } catch (err) {
            return fail(res, err)
        }
    }

    static async cancel(req: Req, res: FastifyReply) {
        try {
            const nfse = await cancelNfse(parseInt(req.params.id, 10), (req.body || {}) as any, userId(req))
            const { xml_dps, xml_nfse, xml_evento, ...data } = nfse.toJSON() as any
            return res.send(data)
        } catch (err) {
            return fail(res, err)
        }
    }

    static async cancelReasons(req: Req, res: FastifyReply) {
        return res.send(MOTIVOS_CANCELAMENTO)
    }

    static async substituteDraft(req: Req, res: FastifyReply) {
        try {
            return res.send(await substitutionDraft(parseInt(req.params.id, 10)))
        } catch (err) {
            return fail(res, err)
        }
    }

    static async substitute(req: Req, res: FastifyReply) {
        try {
            const nfse = await substituteNfse(parseInt(req.params.id, 10), (req.body || {}) as any, userId(req))
            const { xml_dps, xml_nfse, xml_evento, ...data } = nfse.toJSON() as any
            return res.status(nfse.status === 'autorizada' ? 201 : 200).send(data)
        } catch (err) {
            return fail(res, err)
        }
    }

    // ?tipo=dps baixa a DPS enviada; ?tipo=evento o evento de cancelamento; padrão é o XML da NFS-e autorizada.
    static async xml(req: Req, res: FastifyReply) {
        const nfse = await Nfse.findByPk(req.params.id)
        if (!nfse) return res.status(404).send({ message: 'NFS-e não encontrada' })
        const tipo = (req.query as any)?.tipo
        const xml = tipo === 'dps' ? nfse.xml_dps : tipo === 'evento' ? nfse.xml_evento : nfse.xml_nfse
        if (!xml) return res.status(404).send({ message: 'XML ainda não disponível.' })
        const name = tipo === 'dps' ? `DPS_${nfse.id_dps}.xml` : tipo === 'evento' ? `Cancelamento_${nfse.chave_acesso}.xml` : `NFS-e_${nfse.chave_acesso}.xml`
        res.header('Content-Type', 'application/xml; charset=utf-8')
        res.header('Content-Disposition', `attachment; filename=${name}`)
        return res.send(xml)
    }

    static async pdf(req: Req, res: FastifyReply) {
        try {
            const { nfse, pdf } = await nfsePdf(parseInt(req.params.id, 10))
            res.header('Content-Type', 'application/pdf')
            res.header('Content-Disposition', `inline; filename=NFS-e_${nfse.numero_nfse || nfse.id}.pdf`)
            return res.send(pdf)
        } catch (err) {
            return fail(res, err)
        }
    }
}

export default nfseController
