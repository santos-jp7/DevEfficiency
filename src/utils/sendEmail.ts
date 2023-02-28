import nodemialer from 'nodemailer'

const transporter = nodemialer.createTransport({
    host: process.env.EMAIL_HOST,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
})

export default function sendMail(to: string[] | string, subject: string, html: string): void {
    if (!Array.isArray(to)) to = to.split(',')

    to.push(process.env.EMAIL_CC as string)
    to = to.join(',')

    const from = `${process.env.EMAIL_NAME} <${process.env.EMAIL_FROM}>`

    transporter.sendMail(
        {
            from,
            to,
            subject,
            html,
        },
        function (err, info) {
            if (err) {
                console.log(err)
            } else {
                console.log('[+] Email enviado: ' + info.response)
            }
        },
    )
}
