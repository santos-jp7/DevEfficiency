import { FastifyRequest, FastifyReply } from "fastify";

import Client from "../models/Client";
import Project from "../models/Project";

type projectsRequest = FastifyRequest<{
    Body: Project, Params: Project
}>

class projectsController{
    static async index(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send(await Project.findAll());
    }

    static async show(req : projectsRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send(await Project.findByPk(req.params.id));
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