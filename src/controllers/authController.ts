import jsonwebtoken from "jsonwebtoken";
import { FastifyRequest, FastifyReply} from "fastify";
import bcrypt from "bcrypt";

import User from "../models/User";

type authRequest = FastifyRequest<{
    Body: {
        username: string,
        password: string,
        refresh_token: string
    }
}>

class authController{
    static async auth(req : authRequest, res: FastifyReply) : Promise<FastifyReply> {
        const {username, password} = req.body;

        const user = await User.findOne({where: {username}});

        if(!user) return res.status(401).send({error: true, message: "Usuário ou senha invalidos."});
        if(!bcrypt.compareSync(password, user.password)) return res.status(401).send({error: true, message: "Usuário ou senha invalidos."});

        const date = new Date();

        const token = await jsonwebtoken.sign({ user }, String(process.env.SECRET) ,{expiresIn: '1h'});

        date.setHours(date.getHours() + 1);

        return res.send({
            type: "bearer",
            token,
            expires_in: date.valueOf()
        });
    }
}

export default authController;