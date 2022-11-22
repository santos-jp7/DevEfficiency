import fastify, { FastifyInstance, FastifyRequest, RequestBodyDefault } from "fastify";
import helmet from "@fastify/helmet";

import routes from "./routes";

const app : FastifyInstance = fastify();

declare module "fastify"{
    export interface FastifyRequest{
        __user: any
    }
}

app.addHook("preHandler", (req, reply, done) => {
    req.__user = {};

    done();
})

app.register(helmet);
app.register(routes);

export default app;