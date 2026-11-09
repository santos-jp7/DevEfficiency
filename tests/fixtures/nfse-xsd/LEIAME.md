# XSD oficial da NFS-e Padrão Nacional (v1.01)

Cópia de `nfse-esquemas_xsd-v1-01-20260209.zip` (gov.br/nfse → Documentação técnica → Documentação atual), usada
pelo `tests/nfse.test.js` para validar a DPS gerada com o `xmllint`.

Única alteração: em `tiposSimples_v1.01.xsd`, o padrão de `TSSerieDPS` era `^0{0,4}\d{1,5}$`. Em expressão regular
de XSD, `^` e `$` são caracteres literais, então o `libxml2` recusaria qualquer série. Os anchors foram retirados
(`0{0,4}\d{1,5}`). O sistema envia a série com 5 dígitos (ex.: `00001`), que atende às duas leituras.
