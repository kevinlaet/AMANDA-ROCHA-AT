# Amanda Rocha · memória do projeto

Leia este arquivo inteiro antes de mexer em qualquer coisa. Ele guarda o contexto, o padrão de qualidade e as decisões já tomadas. O `README.md` explica **como funciona e como colocar no ar**; este explica **por que é assim e como manter o padrão**.

> Repositório público (GitHub Pages). **Nunca** coloque aqui senha, e-mail pessoal, chave secreta (`service_role`/Secret key) nem dados de clientes.

## 1. Quem é quem

- **Kevin Laet** (o usuário): constrói tudo para a esposa. Está sempre muito atarefado: respostas **curtas, em português, passo a passo mínimo**, sem jargão. Dono do domínio, do GitHub e do Supabase.
- **Amanda Rocha**: enfermeira (COREN-SP 617675), especialista em saúde mental e psiquiatria, em pós de estética facial e corporal. Faz **auriculoterapia** (há 2 anos) e **limpeza de pele**. **Só atende mulheres.** Mexe bem em sistemas do trabalho (CAPS), mas **nunca viu um painel**: tudo precisa ser simples e intuitivo. Frase dela: "Cuidado com afeto e individualidade".
- **Sandra**: mãe da Amanda, dona do salão **Studio La Rocha** (Vila Nova Mauá). A Amanda atende lá, aos sábados. A Sandra aluga cadeira e maca para outras profissionais (sem valor divulgado; água, luz e cadeira inclusos; a profissional traz o material). Existe um projeto separado do salão (logo C "Fiel ao original" escolhida); um chat próprio será criado a partir do dossiê.
- **Clientes**: mulheres de 18 a 60+, muitas de baixa renda, em celular simples e internet fraca. Daí: site leve (cerca de 150 KB), letras grandes, poucos toques para agendar.

## 2. Regras de ouro do Kevin (valem sempre)

1. **Qualidade acima de tudo.** "É minha esposa." Revise sozinho, procure erro, teste. Entregue algo que dê aquela sensação de "que lindo!".
2. **Assinatura em toda página** dos projetos dele: `Desenvolvido por Kevin Laet`, discreta e elegante (classe `.credito`, fonte Cormorant 600, caixa alta, `letter-spacing` 2.5–3px, linha fina acima). Na home: 12px, opacidade .7. Nas outras páginas e no painel: 10px, opacidade .45. Em páginas novas, artefatos e documentos: **última coisa da página**.
3. **O painel não pode errar horário** (perder dinheiro e confiança). Nada de dupla reserva, nem horário errado, nem tela quebrada.
4. **Segurança e proteção jurídica/antigolpe** em tudo (CDC, LGPD, COFEN 554/2017). Pagamento **só no salão, pessoalmente**; nunca pedir Pix antecipado nem sinal (decisão da Amanda: sem sinal). Ver `regras/`.
5. **Nunca pedir nem guardar:** Supabase Secret key/`service_role`, senha da Amanda. Manter o e-mail dela fora do repositório. Notificações levam **só o primeiro nome** da cliente, nunca telefone nem sobrenome.
6. **Não abrir PR** a menos que ele peça. Sempre empurrar para **`site-v1` e `main`** (`git push origin site-v1 site-v1:main`); o Pages publica a `main`. Mensagens de commit em português, no estilo dos anteriores (primeira linha curta + o porquê em tópicos), terminando com as linhas de atribuição pedidas pela sessão.
7. Ele quer **ver o resultado** (capturas de tela, links) e respostas honestas: se algo não foi testado ou depende dele, dizer.
8. Dividir tarefas com clareza: o que é do Kevin, da Amanda, da Sandra e do Claude (documento "Tarefas da estreia").

## 3. Padrão visual e de texto (não desviar)

- **Cores** (`:root` em `index.html`): verde-petróleo `--teal #0B5F59`, escuro `--teal-d/--night2 #053F3A`, claro `--teal-l #167469`, menta `--mint #7BE0CC`, pêssego `--peach #F5C59D` / `--peach-l #FBE3CE`, creme `--cream #FFF8F1`, areia `--sand #F7EBDF`, tinta `--ink #16302C`, `--muted #55706B`, linha `--line #E7D6C6`, WhatsApp `--wa #1FAF5A`. A Amanda pediu "um toque de sofisticação" nas cores: ajustes sutis, **nunca** mudar de paleta (o Kevin já mandou voltar ao tom atual uma vez).
- **Fontes** (todas locais em `fonts/`, nada de Google Fonts no site): Great Vibes (assinatura/script), Cormorant (títulos, serifada), Montserrat (texto), JetBrains Mono (detalhes técnicos). Use os subconjuntos `*-sub.woff2`.
- **Tom do site:** tecnológico e premium, "cara de super agência", mas **acolhedor**. Slogan: **Beleza · Saúde · Bem-estar** (nunca "Auriculoterapia e estética"). Sempre que couber, mencionar que a auriculoterapia ajuda com **dores**. Frase de abertura da agenda: "Próximas datas disponíveis".
- **Textos:** português simples, frases curtas, sem prometer cura (COFEN). Venda consultiva e suave, sem forçar. Nada de "de salto ou chinelo".
- **Preços e prazos:** auriculoterapia **R$ 55** (sessão 1h15; pacote 4 por R$ 200); limpeza de pele **R$ 85, inauguração R$ 75 até 19/12** (sessão 1h40). No banco as durações são **85 e 110 min** (incluem 10 min de intervalo). Limpeza começa a ser marcada em 14/11. Atende aos **sábados, das 10h às 17h** (nem todos), antecedência mínima 1 dia no pedido, mostra até 2 meses. Indicação: quem indica ganha **1 sessão de auriculoterapia** depois do primeiro atendimento da amiga. Cartão fidelidade: 5 carimbos = 1 sessão de auriculoterapia. Pagamento: Pix, dinheiro, débito e crédito, no salão. Aviso de falta: 24 h.
- **Layout sem tropeço** (lição do "75 fora de eixo"): preço e número **nunca quebram** (`white-space:nowrap`/`.nw`), caixas de preço em `flex` com `flex-wrap`, nada de rolagem lateral de 320 a 768 px. Testes cobrem isso; novos componentes precisam passar nas larguras 320, 360, 390 e 430.
- **Imagens/folders/impressos:** conferir que nada sai da página (os scripts `tests/render-*.mjs` já checam). Cartão de visita 9×5 cm, frente brilho e verso fosco (o verso usa cores mais escuras).

## 4. Arquitetura (resumo; detalhes no README)

- **Site estático** em GitHub Pages, domínio **https://amandarochabemestar.com.br** (arquivo `CNAME`, HTTPS forçado, DNS no Registro.br; vence em 29/10/2027). O endereço antigo `kevinlaet.github.io/AMANDA-ROCHA-AT/` redireciona.
- Páginas: `index.html` (site + agenda), `links/` (bio do Instagram), `regras/`, `questionario/`, `admin/` (painel, com CSP), links curtos `agendar/`, `limpeza/`, `auriculo/` (redirecionam para `/?s=<serviço>#agendar` mantendo `?o=`).
- JS puro ES5, sem framework: `site.js`, `agenda.js` (reserva local de serviços), `medicao.js` (Google Analytics só após aceitar cookies), `admin/painel.js`.
- **Supabase** (`config.js` guarda URL e chave **pública** `sb_publishable_…`): tabelas com RLS, funções `security definer` com `set search_path=''`, relógio de Brasília (`agora_sp()`), reserva atômica (`pedir_horario`), duração/bloqueio, histórico, guardião no banco, notificações ntfy (pg_net) e resumo das 6h (pg_cron), `meus_numeros()`.
- **Várias profissionais (Studio La Rocha):** o mesmo banco guarda uma agenda por profissional. Sócias (Amanda e Sandra) alternam entre "Só a minha agenda" e "Todas as profissionais"; parceiras veem só a própria (garantido por RLS no banco); a maca trava entre profissionais; Mais › Profissionais cadastra a equipe. Veio de outra sessão (PR #1 e commits seguintes) e foi juntada à `site-v1` em `c6f6d4e`; o painel do salão (`studiolarocha`, pasta `painel/`) é este painel copiado por `ferramentas/painel.mjs`. Ver README, seção "Agenda do Studio La Rocha". Sempre `git fetch` e confira se a `main` andou antes de empurrar.
- **Atualizações do banco:** `supabase/atualizacao.sql` é cumulativo e idempotente; o bloco final é **idêntico** ao fim de `schema.sql` (há teste que garante). Toda mudança de banco entra nos dois.
- **Guardião externo:** `.github/workflows/guardiao.yml` + `guardiao/vigia.mjs` (roda algumas vezes por dia, abre issue se algo estiver errado). Dispare à mão (`workflow_dispatch`) para checar o site no ar.
- **Origem das visitas:** `?o=instagram|facebook|google|whatsapp…` vira `utm_source`; QR dos impressos usam `cartao`, `cartaz`, `espelho`, `sandra`.

## 4b. Retornos (no ar em 22/11/2026)

- **O que é:** na ficha de um atendimento (pedido ou confirmado), "↻ Marcar retorno": 15/21/30/45/60 dias (contados do dia do atendimento) ou uma data, mais a orientação curta ("manutenção da limpeza"). Se a data não cair num sábado, um botão oferece o sábado mais perto (só para a Amanda).
- **Início › Retornos próximos:** quem tem retorno nos próximos 7 dias; atrasados primeiro, em vermelho. Cada linha: nome, procedimento, data, orientação, "Chamar no WhatsApp" (mensagem pronta: "Oi, [Nome]! Tudo bem? Aqui é a Amanda 💛 Já tá chegando a hora da sua [orientação], como combinamos. Quer que eu reserve um horário pra você nesse sábado?"; atrasado: "Já passou um pouquinho…"), "Agendou", "Não respondeu", "Adiar" (para a Amanda: os próximos 3 sábados; outras: +7/+15/+30; ou data; e remover). Visual (22/11): cartões claros com a inicial em pêssego, data em pílula (Hoje / Atrasado · N dias / sáb, 28/11), orientação em caixa tracejada, WhatsApp verde e 3 botões lado a lado. O clique no WhatsApp marca "mensagem enviada". Número no botão Início = pedidos + retornos de hoje/atrasados.
- **Nada é enviado sozinho:** a Amanda sempre toca e envia.
- **Banco:** tabela nova `retornos` (cópia de nome, telefone e serviço; `horario_id` único, solto quando o horário volta a ficar livre por gatilho `solta_retorno`, para outra cliente nunca herdar), RLS ligada e tabela fechada; só pelas funções `salvar_retorno`, `marcar_retorno`, `apagar_retorno`, `retornos_lista` (conferem `posso(profissional)`: parceira só mexe nos dela). Não altera nada que já existia.
- **Publicado** em `site-v1`/`main` com o "pode" do Kevin (22/11), junto com o login de 24 h (desconecta na hora se algo estranho), cadastro de clientes travado e story de horários livres. Painel do salão sincronizado (`studiolarocha`, `ferramentas/painel.mjs`). **Falta o Kevin rodar `supabase/atualizacao.sql` no Supabase**: até lá o bloco de retornos fica escondido e o resto funciona.

## 4c. Início novo e sugestões (no ar em 24/11/2026 com o "pode" do Kevin; sugestões seguem em espera)

- **Topo:** logo + "Amanda Rocha" com entrada suave (logo gira e acende, título com brilho pêssego), só CSS, uma vez por acesso, desligada em "reduzir movimento". **Sem o selo "Protegido"** (a situação do guardião fica em Mais › Segurança e no aviso vermelho quando há problema).
- **Início sem explicações:** saiu o guia de boas-vindas, o "Como usar esta parte" (só do Início) e as dicas.
- **Saudação inteligente (aprovada pelo Kevin, 24/11):** data em caixa alta + saudação (Montserrat 700, com o nome) + mensagem inspiradora (Cormorant itálica, filete pêssego). Primeiro os **momentos especiais** (`momentos()`): madrugada, 8/3, 12/5, atendimento em até 75 min, meta batida, marco de atendimentos (sempre que acontecem); mês melhor que o anterior, cliente que voltou, cliente nova, pedidos, sábado (com atendimentos / lotado / à noite), retornos para chamar (na maioria das vezes); sexta com atendimento no sábado, segunda, semana com horários livres. Senão, 4 frases por período (manhã 5–12h, tarde 12–18h, noite). Humor só às vezes (café, "tá ficando famosa", madrugada). Nunca repete a última (`localStorage amanda-ola`). A primeira escolha espera números, retornos e clientes (até 2,5 s). O Kevin vetou frases vagas ("tá indo lindo") e bobas ("pausa pro docinho"). **Aniversário (24/11):** coluna `profissionais.aniversario` ('MM-DD', só dia e mês; a data fica **no banco**, nunca no código público), devolvida por `quem_sou()` só para a própria profissional. No dia: "Feliz aniversário, {nome}! 🎂 / Hoje quem merece todo o cuidado do mundo é você. Aproveita o seu dia! 💛" (prioridade máxima). Amanda: 31/07 — o Kevin roda `update public.profissionais set aniversario = '07-31' where id = 'amanda';` depois do `atualizacao.sql`. Aniversário do Studio: falta a data.
- **Próximos atendimentos:** 60 dias, agrupados em "Esta semana", "Semana que vem" e depois por mês; data em caixinha; perto (até 2 dias) e sem lembrete = botão grande "Mandar lembrete"; mais longe = botão pequeno "Lembrete". Vazio = cartão positivo "Sua agenda tá com espaço pra novas clientes" com "Divulgar" (WhatsApp com o link `agendar/?o=whatsapp`) e "Copiar link". **Nunca** mostrar frases como "Nenhum atendimento/pedido".
- **Pedidos** vão para o fim do Início e só aparecem quando existem. Retornos também somem quando vazios.
- **Sugestões de alterações: EM ESPERA (Kevin, 24/11).** Código, banco e página do Kevin prontos, mas a área não aparece no painel (`SUG_LIGADAS`: só com `window.PAINEL.sugestoes` ou `localStorage painel-sugestoes = 1`). Quando ele pedir, ligar por padrão. Detalhes: campo + foto opcional (redimensionada no celular para JPEG ≤ 1,3 MB) + Enviar; lista "Suas sugestões" com status (Nova / Em andamento / Feita ✓). Banco: tabelas novas `sugestoes` e `desenvolvedor` (fechadas, só por funções `enviar_sugestao`, `minhas_sugestoes`, `foto_sugestao`, `sugestoes_dev`, `marcar_sugestao`, `testar_aviso_dev`, `sou_dev`, `avisar_dev`), limite de 20 por dia por pessoa.
- **Página do Kevin:** `admin/sugestoes/` (login próprio, só entra o e-mail de `public.desenvolvedor`): contador de novas, filtros, foto, mudar status, aviso de teste e o tópico do ntfy. **Aviso automático:** `avisar_dev` manda pelo ntfy (pg_net, como as notificações da Amanda) para o tópico `sugestoes-…` e, com o campo `email`, o ntfy encaminha por e-mail. O e-mail do Kevin **nunca** vai para o repositório: ele roda `update public.desenvolvedor set email = '…' where id;` no SQL Editor e cria o usuário dele em Authentication › Add user.

## 4d. Faturamento (no ar em 24/11/2026 com o "pode" do Kevin; precisa do `atualizacao.sql` rodado)

- **Início › cartão do faturamento:** além do mês, a caixa **"Desde a inauguração"** (total, atendimentos e a data do primeiro atendimento, de `meus_numeros().total`) e o botão **"Verificar faturamento detalhado"** (também em Mais › Seus números, que agora diz "Desde a inauguração"). "Definir uma meta do mês" virou link discreto. Valores em `dinheiro()` nunca quebram entre o R$ e o número (`span.nw`).
- **Página Faturamento** (aba `faturamento`, voltar para Início ou Seus números): Dia · Semana · Mês · Ano · Tudo · Período (De/Até), setas para andar (no Dia, pulam para o dia anterior/seguinte **com atendimento**; abre no último dia com atendimento), filtro de **procedimento** e, para sócia em "Todas", de **profissional**. Mostra total, comparação (período fechado: ▲/▼ % ; em andamento: "Outubro inteiro: R$ X", sem vermelho), atendimentos, clientes, média, "já marcados até o fim do…", por procedimento (com %), por profissional, dia a dia (até 62 dias) ou mês a mês, e a lista de atendimentos (40 por vez; "não veio" aparece fora da conta). O olho esconde os valores.
- **Banco:** função nova `faturamento(p_de, p_ate, p_prof)` (mesmas regras de `meus_numeros`: sócia vê todas ou uma; parceira só a dela; até ~10 anos por pedido; não devolve telefone, só `cli` = md5 para contar clientes). O painel guarda os atendimentos já trazidos e só busca o que falta; recarrega quando os números mudam.
- Testes: banco (10 checagens) e ponta a ponta (seção 4j, relógio em 20/10/2026), inclusive 320 px.

## 4e. Retornos pela tela de Clientes e mensagem de acompanhamento (no ar em 24/11/2026 com o "pode" do Kevin; precisa do `atualizacao.sql` rodado)

- **Pedido do Kevin:** a Amanda escolhe a data do retorno de cada cliente (depende da pele, do problema) e, no dia, tem um botão para mandar a mensagem. Telas separadas para não poluir. Prévia aprovada ("o resto ficou bom"), só a mensagem mudou.
- **Mensagem (Kevin, 24/11):** acompanhamento, não convite: "Oi, {Nome}! Aqui é a Amanda 💛 / Como está a sua pele desde a última sessão? Correu tudo bem? / Se puder, me manda uma foto pra gente acompanhar o resultado juntas." Sem foto: "Me conta como você tá se sentindo pra gente acompanhar juntas." Assunto vazio: "Como você está desde a última sessão?". Verbo concorda ("Como estão as suas dores"). Limpeza de pele já vem com "a sua pele" e foto marcada. A Amanda pode editar o texto (botão "Voltar ao texto sugerido"). Vale também para o Início › Retornos próximos (retornos antigos sem mensagem usam a pergunta gerada pelo serviço).
- **Clientes:** cartão com 3 botões iguais (WhatsApp · Retorno/Marcar retorno · Anotar); faixa "Retorno combinado" com o assunto e a data (pêssego no dia, vermelha se atrasado); no dia, botão verde "Enviar mensagem de retorno" (marca "enviada"); filtro "Retornos (N)".
- **Tela Retorno** (aba `retorno`, volta para Clientes/Agenda): chips 15/21/30/45/60 dias contados do último atendimento (ou do próximo, se ainda não veio; os que já passaram ficam apagados) + "Outra data"; para a Amanda, ajusta para o sábado mais perto; "O que acompanhar?" com sugestões; "Pedir uma foto"; a mensagem editável; Salvar/Remover. No dia: mensagem pronta, "Enviar no WhatsApp", Agendou / Não respondeu / Adiar e "Mudar a data ou a mensagem". A ficha do atendimento (Agenda › "Marcar retorno") abre esta mesma tela.
- **Banco:** `retornos.mensagem` (≤ 700), `salvar_retorno(p_horario, p_data, p_obs, p_msg)` (a versão de 3 argumentos é apagada), `editar_retorno(p_id, p_data, p_obs, p_msg)`, `retornos_lista` devolve a mensagem, `clientes_resumo` devolve `ref`/`ref_data` (o atendimento que liga o retorno). Links na mensagem são recusados.

## 5. Como trabalhar (checklist antes de entregar)

1. `cd tests && npm ci && npx playwright install chromium` (uma vez), depois `npm test` (banco com PGlite + ponta a ponta com Playwright). **Todos devem passar** antes de qualquer push (hoje: 301 checagens no site, mais os do banco).
2. Mudou layout? Rode a varredura de tamanhos (as seções "layout" dos testes) e olhe capturas: `CAPTURAS=/pasta npm run test:site` salva imagens.
3. Mudou impresso/folder? `node tests/render-folders.mjs`, `render-cartao.mjs`, `render-cartaz.mjs` e commite os arquivos gerados.
4. Mudou domínio? Troque `CNAME`, `canonical`/`og:`, QR dos impressos e `painel_url` no banco.
5. Push para `site-v1` e `main`; confira o CI (aba Actions) e, se mexeu no site, dispare o guardião.
6. Mudou texto de preço/prazo? Atualize **todos**: `index.html`, `agenda.js`, `links/`, `regras/`, `folders/`, cartões, README e o painel/SQL (`servicos.preco_obs`).

## 6. Armadilhas já pagas (não repetir)

- `pkill -f "padrão"` mata o próprio shell se o padrão estiver na linha de comando: use `kill %1`.
- Com a CSP do painel, `fetch(blob:)` é bloqueado: capturas de tela leem a imagem por canvas.
- Playwright em modo estrito: dois elementos `.preco-svc` exigem `nth`.
- Em `\u` dentro de entradas de ferramenta, montar com `chr(92)+'u'` (Python).
- Chrome arredonda tamanho de página no PDF: o PDF do cartão é montado à mão (`pdfDeJpgs`) para 90×50 mm exatos.
- O GitHub atrasa o `cron`: nunca prometer "a cada 15 minutos".
- Nunca afirmar que o domínio está "no nome da Amanda": o titular é o Kevin.
- Título em Great Vibes com `background-clip:text` (brilho do topo do painel) corta o alto do "A" e do "R": o fundo só pinta a caixa. Solução: `padding` com `margin` negativa igual (`.24em .16em .14em`).
- Imagens por IA (modelo `gpt-image-2`, qualidade `medium`; `high` falha) servem de ponto de partida e são vetorizadas depois para os logos.

## 7. Estado atual (3/11/2026; atualizado em 22/11 com retornos e login de 24 h)

Tudo no ar e testado: site, agenda com reserva, painel (Início, Agenda, Enviar, Mais › Clientes, Seus números, Serviços e preços, Histórico, Segurança, Ajuda, Conta; botão "Visualizar agenda como cliente"), notificações, guardiões, domínio com HTTPS, cookies, links curtos, folders, cartão de visita (Amanda aprovou o fidelidade; Kevin manda para a gráfica, 100 unidades), cartaz e recados da Sandra, guia da Amanda, dossiê e logos do Studio La Rocha, documento "Tarefas da estreia". Últimas entregas: correção do preço do cartão (`6cdcb46`), agenda com várias profissionais (juntada em `c6f6d4e`) e este arquivo.

**Pendências do Kevin:** rodar `supabase/atualizacao.sql` de novo no Supabase (traz as várias profissionais, contatos e **retornos**) e depois cadastrar a Sandra em Mais › Profissionais + Authentication › Add user; criar o Google Analytics 4 e passar o ID `G-…` (`config.js`, `MEDICAO`); confirmar o telefone no cartão antes da gráfica; rodar no Supabase `update public.guardiao set painel_url='https://amandarochabemestar.com.br/admin/' where painel_url='https://kevinlaet.github.io/AMANDA-ROCHA-AT/admin/';` e `update public.servicos set preco_obs='valor de inauguração até 19/12' where id='limpeza';`; decidir se as notificações perdem o primeiro nome; informar a região do Supabase (aviso de privacidade); 2FA no GitHub/Supabase; Perfil da Empresa no Google e grupos do Facebook (ele mesmo faz); lembrete de renovar o domínio.

**Próximas entregas do Claude** (ordem sugerida): vídeo "Agende em 1 minuto"; capas dos destaques do Instagram; stories de contagem regressiva; 2 carrosséis; roteiros; cartão "Seu próximo horário"; folheto pós-limpeza (precisa do texto da Amanda); vale-presente de Natal; botão "Mandar carinho" no painel; seção "Primeira vez? Veja como é"; seção "Como chegar" (precisa de endereço e foto da Sandra); atualizar guia, `divulgacao-kevin` e dossiê com o domínio novo.

## 8. Onde está o resto

- Repositório: https://github.com/kevinlaet/AMANDA-ROCHA-AT (branch de trabalho `site-v1`; deploy em `main`; a branch remota `dominio` é antiga).
- Documentos Claude: Tarefas da estreia (https://claude.ai/artifact/YX9AyeeC6aXN1JnpCeLTSW), Dossiê do Studio La Rocha (https://claude.ai/artifact/RrPetHbdyjgHPLsiM1mSKu), Guia da Amanda (https://claude.ai/artifact/JobS89hmSiFaQskcPwVQtY), opções de logo (https://claude.ai/artifact/6vRUf7m99TA9YB5KXxVRwr).
- Respostas da Amanda ao questionário (29/10/2026) já aplicadas: durações, preços, benefícios (⭐ vão para o site: sono, dores lombares, ansiedade; pele, linhas de expressão, cravos e espinhas), agenda aos sábados, regras de pagamento, história, WhatsApp Business (quer mudar), domínio que ela sugeriu `amandarocha.com.br` (o escolhido e registrado foi `amandarochabemestar.com.br`).
