import { FastifyRequest, FastifyReply } from "fastify";

import Client from "../models/Client";
import Subproject from "../models/Project";

type projectsRequest = FastifyRequest<{
    Body: Subproject, Params: Subproject
}>

class projectsController{
    static async index(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send(await Subproject.findAll());
    }

    static async show(req : projectsRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send(await Subproject.findByPk(req.params.id));
    }

    static async store(req : projectsRequest, res: FastifyReply) : Promise<FastifyReply> {
        const {
            name, url, clientId, type
        } = req.body;


        const client = await Client.findByPk(clientId);
        const project = await client?.createProject({name, url, type});

        return res.send(project);
    }

    static async update(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send("Hello World");
    }

    static async destroy(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send("Hello World");
    }
}

export default projectsController;