# Amanda Rocha · site, agenda e folders

Site para celular (cerca de 100 KB, abre rápido até no 3G), com agenda, página de links para o Instagram, painel para a Amanda cuidar dos horários e os folders de divulgação.

| Arquivo | O que é |
|---|---|
| `index.html` | Site das clientes: agenda, serviços, sobre, dúvidas |
| `links/` | Página curta para a bio do Instagram |
| `admin/` | Painel da Amanda (entra com e-mail e senha) |
| `questionario/` | Questionário para a Amanda contar como quer o site, o painel e os folders |
| `agenda.js` | Serviços (e os horários usados enquanto o Supabase não estiver ligado) |
| `config.js` | Ligação com o Supabase |
| `supabase/schema.sql` | Banco: tabelas, regras de horário e segurança |
| `folders/` | Modelos dos folders; PNGs prontos em `folders/png/` |
| `tests/` | Testes automáticos da agenda |

## Os dois modos da agenda

**Agora (sem Supabase):** a cliente escolhe serviço, dia e horário, e o WhatsApp abre com a mensagem pronta. Os dias vêm do `agenda.js`. Nada é reservado automaticamente: a Amanda confirma pelo WhatsApp.

**Com Supabase ligado:** os horários vêm do banco, e a Amanda cuida deles pelo painel.

1. No painel, a Amanda escolhe o dia e os horários e toca em "Abrir horários". Dá para repetir por várias semanas e incluir horários como 13h30.
2. A cliente vê só os horários livres, preenche nome e WhatsApp e toca em "Reservar meu horário". O horário fica guardado e o WhatsApp abre com a mensagem pronta.
3. Duas clientes nunca pegam o mesmo horário. A segunda recebe o aviso "Esse horário acabou de ser pego".
4. No painel, a Amanda toca em **Confirmar** ou **Recusar**. Depois de cada ação, aparece o botão para avisar a cliente no WhatsApp com a mensagem já escrita.
5. Horário combinado por fora: toque nele e em "Marcar como ocupado".

**O que a Amanda consegue fazer sozinha no painel:**

- **Agendamentos:** confirmar, recusar, editar nome, telefone e serviço, remarcar para outro horário livre (a cliente vai inteira, sem perder dados), cancelar e liberar, ou cancelar e apagar.
- **Horários livres:** marcar como ocupado (com nome, telefone e serviço), mudar o dia ou a hora, remover.
- **Dias:** em "Opções do dia", adicionar um horário avulso ou remover todos os horários livres do dia (quem tem cliente continua).
- **Serviços:** adicionar, renomear, mudar a descrição, esconder do site, marcar como novidade e definir a partir de quando pode ser marcado. O site atualiza sozinho.
- **Lembretes:** "Próximos atendimentos" lista os confirmados dos próximos 7 dias. "Mandar lembrete" abre o WhatsApp da cliente com a mensagem pronta ("Passando para lembrar do seu horário amanhã...") e registra que foi enviado.
- **Clientes** (Mais › Clientes): ficha montada sozinha a partir da agenda, com WhatsApp, atendimentos, última vez, próximo horário, serviços e anotações. O botão "Mais de 10 dias sem vir" lista quem sumiu, com um convite pronto: motivo pelo último serviço e dois horários livres para a cliente responder "1" ou "2".
- **Nomes que já existem:** ao digitar o nome em "Marcar como ocupado" ou em Enviar, o painel sugere as clientes e preenche o WhatsApp.
- **Histórico** (Mais › Histórico): tudo o que aconteceu, em frases simples, com busca pelo nome.
- **Duração de cada procedimento** (Mais › Serviços e preços): o banco nunca deixa uma cliente marcar um horário que encoste em outro atendimento (por exemplo, limpeza de 1h30 às 13h bloqueia a auriculoterapia das 14h). No painel, esses horários aparecem como "bloqueado"; se a Amanda marcar por fora em cima de outro atendimento, o painel avisa e ela decide.

O painel é organizado como aplicativo: **Início** (pedidos e lembretes do dia), **Agenda**, **Enviar** e **Mais** (Clientes, Serviços e preços, Histórico, Segurança, Como funciona e Minha conta).

**Enviar horários para uma cliente específica** (no painel, seção do mesmo nome):

1. Escolha os dias (por exemplo 3 e 4 de novembro). O painel mostra só dias com horário livre.
2. Opcional: nome da cliente, WhatsApp dela e o serviço.
3. Escolha como enviar:
   - **Enviar link:** a cliente abre uma página só com esses dias, já com o nome preenchido, e agenda sozinha. Se os horários acabarem, ela vê o aviso e pode pedir outros.
   - **Enviar imagem:** o painel cria uma imagem com letras grandes, com os dias e horários, para clientes que preferem ver e responder pelo WhatsApp. Quando a cliente responder, a Amanda toca no horário e em "Marcar como ocupado", com o nome dela.

**Regras que o banco garante:**

- Horário que já passou, ou que começa em menos de 1 hora, some do site.
- Tudo segue o horário de Brasília, mesmo que o relógio do celular esteja errado.
- Cada telefone pode ter no máximo 2 horários reservados ao mesmo tempo.
- Recusar ou cancelar sempre pede confirmação.
- Se o horário mudou enquanto a Amanda olhava a tela (por exemplo, uma cliente pediu naquele instante), a ação não acontece e ela é avisada.
- Nomes e telefones das clientes só aparecem no painel, nunca no site.
- Toda mudança fica registrada na tabela `historico`: quem, quando e de que status para qual. No Supabase, ela fica em Table Editor > historico.

## Colocar no ar

### 1. GitHub Pages (o site)

1. Em Settings > General > Danger Zone > Change visibility, mude o repositório para **Public**. O plano grátis só publica repositório público. Nada secreto fica no repositório.
2. Em Settings > Pages > Build and deployment, escolha **Deploy from a branch**, o branch do site e a pasta **/ (root)**.
3. O endereço será `https://kevinlaet.github.io/AMANDA-ROCHA-AT/`. A página de links fica em `…/links/` e o painel em `…/admin/`.

Se um dia usarem domínio próprio, troquem o endereço nas tags `og:` e `canonical` de `index.html` e `links/index.html`. É isso que faz a prévia com imagem aparecer quando o link é mandado no WhatsApp.

### 2. Supabase (a agenda com reserva e o painel)

1. Crie um projeto grátis em supabase.com, na região **South America (São Paulo)**.
2. Em Authentication > Users > Add user > Create new user, cadastre o e-mail e a senha da Amanda e marque **Auto Confirm User**.
3. Em Authentication > Sign In / Providers, desligue **Allow new users to sign up**.
4. Abra `supabase/schema.sql` e troque `SEU_EMAIL_AQUI` pelo e-mail da Amanda. Ele aparece uma vez só; se esquecer, o próprio arquivo avisa e não roda. Cole o arquivo inteiro em SQL Editor > New query > Run.
5. Copie para o `config.js` o **Project URL** e a chave pública (**Publishable key**, que começa com `sb_publishable_`, ou "anon public" em projetos antigos). Os dois ficam no botão **Connect** do projeto e em Project Settings > Data API / API Keys. Nunca coloque ali a Secret key nem a service_role.
6. Envie o `config.js` para o GitHub. Em poucos minutos, o site e o painel passam a usar o banco.
7. Abra `…/admin/diagnostico.html` no celular. A página confere sozinha, com ✓ e ✗, se o banco, as permissões e o cadastro estão certos, e o login da Amanda também se você digitar o e-mail e a senha dela. Ela não cria nem altera nenhum dado.

### 3. Painel no celular da Amanda

Abra `…/admin/` no celular dela e escolha "Adicionar à tela de início" (no Safari, pelo botão de compartilhar). O painel vira um ícone como de aplicativo. Ele se atualiza sozinho a cada 30 segundos e quando ela volta para a tela.

## Segurança

- **Guardião do banco (tempo real):** se chegarem pedidos demais em pouco tempo, ele liga a proteção sozinho. O site continua mostrando os horários, e as clientes passam a confirmar direto pelo WhatsApp. Também barra abuso por aparelho/rede e avisa sobre tentativas estranhas, muitos cancelamentos de uma vez e acesso novo ao painel. Tudo aparece em Mais › Segurança, onde a Amanda religa o agendamento.
- **Sessão:** o painel pede a senha a cada 12 horas. Se um programa automático entrar com a senha dela, todos os aparelhos são desconectados na hora. Em Minha conta ela troca a senha (os outros aparelhos saem) e pode "Sair dos outros aparelhos".
- **Guardião externo:** `.github/workflows/guardiao.yml` roda `guardiao/vigia.mjs` a cada 15 minutos. Ele confere se o site está no ar e igual ao GitHub, os números de WhatsApp, chaves secretas expostas, a privacidade das tabelas, o cadastro fechado e os alertas do banco. Se algo estiver errado, abre um aviso (issue) no GitHub, que manda e-mail ao dono do repositório, e fecha sozinho quando tudo volta ao normal. Atenção: o GitHub pausa tarefas agendadas depois de 60 dias sem nenhuma mudança no repositório e avisa por e-mail; basta reativar em Actions.

## Notificações no celular (app ntfy, grátis)

A Amanda recebe um aviso a cada pedido novo e sempre que o guardião encontrar algo grave, mesmo com o painel fechado. Todo dia às 6h, só quando houver agendamento, chega um resumo ("Você tem 3 agendamentos para hoje:" e uma linha por cliente, como "• 13h Maria · Auriculoterapia"); ele usa a extensão pg_cron do Supabase. As mensagens levam só o primeiro nome da cliente, nunca telefone nem sobrenome.

1. Instale o app **ntfy** (App Store ou Play Store).
2. No painel, abra Mais › Segurança › Avisos no celular e toque em **Copiar código**.
3. No app, toque em **+**, cole o código e confirme.
4. No painel, toque em **Enviar teste**: a notificação deve chegar em alguns segundos.

Se o painel disser que as notificações não estão ligadas, ative a extensão **pg_net** no Supabase (Database > Extensions) e rode o `supabase/atualizacao.sql` de novo.

## Atualizar um banco que já existe

Quem já rodou o `schema.sql` antes não precisa rodar tudo de novo: cole `supabase/atualizacao.sql` no SQL Editor e toque em Run (se aparecer o aviso "Make sure you are not accidentally removing something important", toque em Run de novo: os `drop ... if exists` só recriam regras). Ele junta todas as atualizações (serviços editáveis, remarcar, lembretes, histórico completo e o guardião), não apaga nenhum horário e pode ser rodado quantas vezes quiser.

## Seus números (atendimentos e faturamento)

No Início do painel, um cartão mostra o faturamento do mês, quantos atendimentos ela fez e quanto falta para a meta (ou para passar o mês anterior, enquanto não houver meta). Em Mais › Seus números ficam a meta do mês, cada serviço, os últimos 6 meses e o total desde o começo. Só ela vê, e o olho do cartão esconde os valores quando alguém estiver olhando a tela.

- Conta cada atendimento confirmado assim que o horário começa. Pedido sem confirmar não conta.
- O valor é o preço do serviço no dia em que a cliente marcou. Desconto, pacote ou cortesia (0): no horário, Editar dados › Valor cobrado.
- Se a cliente não veio: **Não veio**, no próprio horário (no dia) ou em Seus números › Últimos 7 dias (se lembrar depois). Sai da conta, fica no histórico e na ficha da cliente, e dá para desfazer.
- Atendimento de serviço sem preço conta como atendimento, mas só entra no faturamento quando o serviço ganhar preço.

## Mudar textos e serviços

- **Serviços e preços:** pelo painel, em Mais › Serviços e preços › Editar: nome, preço (com o preço antigo riscado, se quiser), observação do preço, frase curta, texto do site, os 3 benefícios principais, duração, data de estreia e se aparece no site. O site muda na hora. O `agenda.js` só é usado enquanto o banco não tiver a atualização 2.
- **Textos do site**: `index.html`
- **Propaganda do salão**: `folders/cartaz.html` (cartaz A4, cartões de espelho e recado da Sandra; o QR abre o agendamento com a limpeza escolhida e não há telefone impresso). Para gerar o PDF e as imagens em `folders/impressao/`, rode `node tests/render-cartaz.mjs`.
- **Folders**: abra `folders/folder.html?v=novidade`, `?v=agenda` ou `?v=aluguel` no navegador, e acrescente `&f=feed` para o formato 4:5. Para gerar os PNGs de novo (e conferir que nada saiu da página), rode `node tests/render-folders.mjs`. As fotos ficam em `img/folder-*.jpg`; a do espaço é ilustrativa, então o ideal é trocar `img/folder-espaco.jpg` por uma foto real do salão.

## Questionário da Amanda

Abra [kevinlaet.github.io/AMANDA-ROCHA-AT/questionario/](https://kevinlaet.github.io/AMANDA-ROCHA-AT/questionario/) no celular dela. São 13 etapas curtas (tempo e preço de cada procedimento, os 10 benefícios de cada serviço com as 3 estrelas que vão para o site, agenda, regras, promoções, história, depoimentos, endereço, visual e domínio, painel, ideias para crescer e sugestões livres). As respostas ficam salvas só naquele celular, então ela pode parar e voltar quando quiser. Nada vai para servidor nenhum: no fim, o botão **Enviar pelo WhatsApp** (ou **Copiar respostas**) manda tudo como texto para o Kevin, que cola o texto aqui para atualizar o site, o painel e os folders. As perguntas ficam na lista `ETAPAS` de `questionario/questionario.js`.

## Testes

Os testes sobem um PostgreSQL de verdade com o `schema.sql` e abrem o site e o painel num navegador. Eles cobrem, entre outros casos:

- duas clientes no mesmo horário;
- celular com relógio errado;
- tela desatualizada no painel;
- queda de internet no meio de uma ação;
- telefone repetido;
- privacidade dos dados das clientes.

O GitHub roda os testes sozinho a cada mudança (aba Actions). Para rodar no computador:

```sh
cd tests
npm ci
npx playwright install chromium
npm test
```
