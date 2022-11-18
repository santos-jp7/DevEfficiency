import jsonwebtoken from "jsonwebtoken";

import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import User from "../models/User";

export default function isAuthed(req : FastifyRequest<{
    Body: any,
    Headers: any
}>, res : FastifyReply, next: HookHandlerDoneFunction) : void{
    const {authorization} = req.headers;

    console.log(req.headers);

    const decoded = jsonwebtoken.verify(String(authorization), String(process.env.SECRET));

    next();
}