# Amanda Rocha · site, agenda e folders

Site leve (menos de 150 KB) feito para celular, com agenda ligada ao Supabase e painel para a Amanda.

- `index.html`: site das clientes (agenda, serviços, sobre, dúvidas)
- `links/`: página para a bio do Instagram
- `admin/`: painel da Amanda (login com senha)
- `config.js`: endereço e chave pública do Supabase
- `supabase/schema.sql`: tabelas e regras de segurança do banco
- `agenda.js`: horários de exemplo, usados só enquanto o `config.js` estiver vazio
- `folders/`: modelos dos folders e PNGs prontos em `folders/png/`

## Como a agenda funciona

1. A Amanda entra em `/admin/`, escolhe um dia e os horários e toca em "Abrir esses horários".
2. A cliente vê só os horários livres, escolhe e toca em "Confirmar pelo WhatsApp".
3. O horário fica reservado como pedido. Duas clientes nunca pegam o mesmo horário.
4. A Amanda vê o pedido no painel e toca em Confirmar ou Recusar. Recusar libera o horário.
5. Horário combinado por fora: toque no horário e em "Marcar como ocupado".

Nomes das clientes aparecem só no painel. O site público enxerga apenas dia, hora e se está livre.

## Colocar no ar (uma vez só)

**Supabase** (grátis)
1. Crie um projeto em supabase.com.
2. Authentication > Users > Add user: e-mail e senha da Amanda (marque "Auto confirm").
3. Authentication > Sign In / Providers: desligue "Allow new users to sign up".
4. Abra `supabase/schema.sql`, troque `SEU_EMAIL_AQUI` pelo e-mail da Amanda (aparece 2 vezes) e rode no SQL Editor.
5. Project Settings > API: copie "Project URL" e a chave "anon public" para o `config.js`.

**GitHub Pages**
1. Settings > General > Danger Zone > Change visibility > Public (o plano grátis só publica repositório público).
2. Settings > Pages > Source: "Deploy from a branch", escolha o branch e a pasta "/ (root)".
3. O endereço sai em `https://<usuario>.github.io/AMANDA-ROCHA-AT/`.

## Folders

Abra `folders/folder.html` no navegador com:

- `?v=novidade`, `?v=agenda` ou `?v=aluguel`
- `&f=feed` para o formato 4:5 (sem isso, sai no formato story 9:16)
