import { FastifyContextConfig, FastifyInstance, FastifyPluginCallback, FastifyRegister, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";

import helloController from "./controllers/helloController";
import clientController from "./controllers/clientController";
import credentialsController from "./controllers/credentialsController";
import authController from "./controllers/authController";
import projectsController from "./controllers/projectsController";
import subprojectsController from "./controllers/subprojectsController";
import serviceOrdersController from "./controllers/serviceOrdersController";

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

    instance.get("/projects", projectsController.index);
    instance.get("/projects/:id", projectsController.show);
    instance.post("/projects", projectsController.store);
    instance.put("/projects", projectsController.update);
    instance.delete("/projects", projectsController.destroy);

    instance.get("/subprojects", subprojectsController.index);
    instance.get("/subprojects/:id", subprojectsController.show);
    instance.post("/subprojects", subprojectsController.store);
    instance.put("/subprojects", subprojectsController.update);
    instance.delete("/subprojects", subprojectsController.destroy);

    instance.get("/os", serviceOrdersController.index);
    instance.get("/os/:id", serviceOrdersController.show);
    instance.post("/os", serviceOrdersController.store);
    instance.put("/os", serviceOrdersController.update);
    instance.delete("/os", serviceOrdersController.destroy);

    next();
};

export default routes;