import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
})

const bucket = process.env.R2_BUCKET!
const publicUrl = process.env.R2_PUBLIC_URL!

async function uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
    await r2.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }),
    )
    return `${publicUrl}/${key}`
}

async function deleteFile(key: string): Promise<void> {
    await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export default { uploadFile, deleteFile }
