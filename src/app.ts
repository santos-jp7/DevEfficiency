import fastify, { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";

import routes from "./routes";

const app : FastifyInstance = fastify();

app.decorateRequest("user", {});

app.register(helmet);
app.register(routes);

export default app;