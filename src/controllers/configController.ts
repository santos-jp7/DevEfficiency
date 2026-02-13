import { FastifyRequest, FastifyReply } from 'fastify'
import Config from '../models/Config'
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
        return res.send(await Config.findAll())
    }

    static async show(req: ConfigRequest, res: FastifyReply): Promise<FastifyReply> {
        const { type } = req.params;

        if (!type) {
            return res.status(400).send({ message: 'Type is required.' });
        }

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
