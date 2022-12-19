import { FastifyRequest, FastifyReply } from "fastify";

import Project from "../models/Project";
import ServiceOrder from "../models/ServiceOrder";

type serviceOrdersRequest = FastifyRequest<{
    Body: ServiceOrder, Params: ServiceOrder
}>

class serviceOrdersController{
    static async index(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send(await ServiceOrder.findAll());
    }

    static async show(req : serviceOrdersRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send(await ServiceOrder.findByPk(req.params.id));
    }

    static async store(req : serviceOrdersRequest, res: FastifyReply) : Promise<FastifyReply> {
        const {
            subject, description, status, projectId
        } = req.body;

        const project = await Project.findByPk(projectId);
        const os = await project?.createServiceOrder({subject, description, status});

        return res.send(os);
    }

    static async update(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send("Hello World");
    }

    static async destroy(req : FastifyRequest, res: FastifyReply) : Promise<FastifyReply> {
        return res.send("Hello World");
    }
}

export default serviceOrdersController;