# Amanda Rocha · site, agenda e folders

Site leve (menos de 100 KB) feito para celular, com agenda que envia o pedido pelo WhatsApp.

- `index.html`: site completo (topo com links, agenda, serviços, sobre e dúvidas)
- `links/`: página curta para a bio do Instagram
- `agenda.js`: **dias e horários da agenda** (é o único arquivo que precisa mudar no dia a dia)
- `folders/`: modelos dos folders e os PNGs prontos em `folders/png/`

## Mudar a agenda

Abra `agenda.js` e edite a lista `dias`. Para marcar um horário como ocupado:

```js
ocupados: {
  "2026-11-14": ["13h", "15h"]
}
```

Dias que já passaram somem sozinhos do site.

## Gerar os folders de novo

Abra `folders/folder.html` no navegador com:

- `?v=novidade`, `?v=agenda` ou `?v=aluguel`
- `&f=feed` para o formato 4:5 (sem isso, sai no formato story 9:16)
- `&tel=(11)%2099999-9999` no folder de aluguel, para colocar o WhatsApp da Sandra
