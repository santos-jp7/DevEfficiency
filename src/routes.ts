import { FastifyContextConfig, FastifyInstance, FastifyPluginCallback, FastifyRegister, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import helloController from "./controllers/helloController";
import clientController from "./controllers/clientController";
import credentialsController from "./controllers/credentialsController";
import authController from "./controllers/authController";

import isAuthed from "./middlewares/isAuthed";

const routes : FastifyPluginCallback = (instance, opts, next) => {
    instance.get("/", helloController.handler);

    instance.post("/auth", authController.auth);
    instance.post("/auth/refresh", authController.auth);
    
    instance.get("/clients", {preHandler: [isAuthed]}, clientController.index);
    instance.get("/clients/:id", clientController.show);
    instance.post("/clients", {preHandler: [isAuthed]}, clientController.store);
    instance.put("/clients", clientController.update);
    instance.delete("/clients", clientController.destroy);

    instance.get("/credentials", credentialsController.index);
    instance.get("/credentials/:id", credentialsController.show);
    instance.post("/credentials", credentialsController.store);
    instance.put("/credentials", credentialsController.update);
    instance.delete("/credentials", credentialsController.destroy);

    next();
};

export default routes;