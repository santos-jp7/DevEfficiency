import jsonwebtoken from "jsonwebtoken";

import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from "fastify";
import User from "../models/User";

interface isAuthedRequest extends FastifyRequest{
    user: User
}

interface jwtUserDecode {
    id: number
}

export default function isAuthed(req : isAuthedRequest, res : FastifyReply, next: HookHandlerDoneFunction) : void {
    const {authorization} = req.headers;

    console.log(req.headers);

    const decoded : any = jsonwebtoken.verify(String(authorization), String(process.env.SECRET));

    next();
}
