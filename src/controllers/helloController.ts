import { FastifyRequest, FastifyReply } from "fastify";

class helloController{
    static handler(req : FastifyRequest, res: FastifyReply) : FastifyReply {
        return res.send("Hello World");
    }
}

export default helloController;