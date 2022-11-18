import { FastifyJwtSignOptions } from "@fastify/jwt";
import fastify, { FastifyRequest, FastifyReply} from "fastify";
import User from "../models/User";

type authRequest = FastifyRequest<{
    Body: {
        username?: string,
        password?: string,
        refresh_token?: string
    }
}>

class authController{
    static async auth(req : authRequest, res: FastifyReply) : Promise<FastifyReply> {
        const {username, password} = req.body;

        const user = await User.findOne({where: {username}});
        if(!user) return res.status(401).send({error: true, message: "Usuário ou senha invalidos."});

        const token = res.jwtSign({ user });

        return res.send(token);
    }
}

export default authController;