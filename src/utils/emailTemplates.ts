// Layout único dos e-mails automáticos ao cliente (mesmo visual do e-mail de fatura).
export const esc = (text: unknown) =>
    String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

export const brl = (v: number | string) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

type Layout = {
    title: string
    greeting: string
    // HTML já escapado pelo chamador.
    body: string
    accent?: string
    button?: { label: string; url: string }
    footer?: string
}

export function emailLayout({ title, greeting, body, accent = '#0056b3', button, footer }: Layout): string {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(title)}</title></head>
<body style="font-family:Arial,sans-serif;background:#f4f7fc;margin:0;padding:0">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.1);overflow:hidden">
    <div style="background:${accent};color:#fff;text-align:center;padding:20px;font-size:20px;font-weight:bold">${esc(title)}</div>
    <div style="padding:20px;color:#333;font-size:16px;line-height:1.6">
      <p>${esc(greeting)}</p>
      ${body}
      ${button ? `<p style="text-align:center"><a href="${esc(button.url)}" style="display:inline-block;background:${accent};color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px">${esc(button.label)}</a></p>` : ''}
    </div>
    <div style="background:${accent};color:#fff;text-align:center;padding:15px;font-size:14px">${esc(footer || 'Codlinx')}</div>
  </div>
</body></html>`
}

// Caixa de destaque (lista de "rótulo: valor").
export function infoBox(rows: [string, string][]): string {
    return `<div style="background:#f9f9f9;border-left:4px solid #0056b3;padding:10px 14px;margin:14px 0;font-size:15px">${rows
        .filter(([, v]) => v)
        .map(([k, v]) => `<div><span style="color:#666">${esc(k)}:</span> <strong>${esc(v)}</strong></div>`)
        .join('')}</div>`
}

export const paragraph = (text: string) => `<p>${esc(text)}</p>`

// Texto livre do usuário: escapa e preserva quebras de linha.
export const multiline = (text: unknown) => `<p>${esc(text).replace(/\r?\n/g, '<br>')}</p>`
