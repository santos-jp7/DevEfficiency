import { FastifyRequest, FastifyReply } from 'fastify'
import Config from '../models/Config'
import { Op } from 'sequelize'
import { PROTECTED_CONFIG_TYPES } from '../utils/nfse/settings'
import * as fs from 'fs/promises' // For async file operations
import * as path from 'path' // For path manipulation

type ConfigRequest = FastifyRequest<{
    Body: {
        value: string;
        upload?: boolean; // Add upload to body
    }
    Params: {
        type: string;
    }
    Headers: any
}>

class configController {
    static async index(req: FastifyRequest, res: FastifyReply): Promise<FastifyReply> {
        // Certificado da NFS-e (criptografado) e controles internos não saem pela API genérica.
        return res.send(await Config.findAll({ where: { type: { [Op.notIn]: PROTECTED_CONFIG_TYPES } } }))
    }

    static async show(req: ConfigRequest, res: FastifyReply): Promise<FastifyReply> {
        const { type } = req.params;

        if (!type) {
            return res.status(400).send({ message: 'Type is required.' });
        }
        if (PROTECTED_CONFIG_TYPES.includes(type)) return res.status(404).send({ message: 'Config not found.' })

        const config = await Config.findOne({
            where: { type }
        });

        if (!config) {
            return res.status(404).send({ message: 'Config not found.' });
        }

        return res.send(config);
    }

    static async store(req: ConfigRequest, res: FastifyReply): Promise<FastifyReply> {
        const { type } = req.params
        let { value, upload } = req.body // Get upload from body

        if (!value) {
            return res.status(400).send({ message: 'Value is required.' })
        }
        if (PROTECTED_CONFIG_TYPES.includes(type))
            return res.status(400).send({ message: 'Esta configuração é alterada pela tela de NFS-e.' })

        if (type === 'hourly_rate') {
            const rate = Number(String(value).replace(',', '.'))
            if (!(rate > 0)) return res.status(400).send({ message: 'Valor por hora deve ser maior que zero.' })
            value = rate.toFixed(2)
        }

        if (upload) {
            // Check if value is a base64 string
            const matches = value.match(/^data:(.+);base64,(.+)$/);
            if (matches) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                const fileExtension = mimeType.split('/')[1]; // e.g., 'png', 'jpeg', 'pdf'

                // Generate a unique filename
                const filename = `${type}-${Date.now()}.${fileExtension}`;
                const filePath = path.join('/tmp', filename); // Save to /tmp

                try {
                    await fs.writeFile(filePath, buffer);
                    value = filePath; // Store the file path in the database
                } catch (error) {
                    console.error('Error saving uploaded file:', error);
                    return res.status(500).send({ message: 'Error saving uploaded file.' });
                }
            } else {
                return res.status(400).send({ message: 'Invalid base64 file format for upload.' });
            }
        }


        const [config, created] = await Config.findOrCreate({
            where: { type },
            defaults: { type, value, upload: upload || false }, // Use upload flag from request
        })

        if (!created) {
            // If not created, it means it already existed, so update it
            await config.update({ value, upload: upload || false }) // Update upload flag
            await config.save()
        }

        return res.send(config)
    }
}

export default configController
