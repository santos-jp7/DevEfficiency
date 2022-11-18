import fastify, { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";

import routes from "./routes";

const app : FastifyInstance = fastify();

app.register(helmet);
app.register(require('@fastify/jwt'), { secret: process.env.SECRET })
app.register(routes);

export default app;