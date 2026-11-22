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
- Imagens por IA (modelo `gpt-image-2`, qualidade `medium`; `high` falha) servem de ponto de partida e são vetorizadas depois para os logos.

## 7. Estado atual (3/11/2026)

Tudo no ar e testado: site, agenda com reserva, painel (Início, Agenda, Enviar, Mais › Clientes, Seus números, Serviços e preços, Histórico, Segurança, Ajuda, Conta; botão "Visualizar agenda como cliente"), notificações, guardiões, domínio com HTTPS, cookies, links curtos, folders, cartão de visita (Amanda aprovou o fidelidade; Kevin manda para a gráfica, 100 unidades), cartaz e recados da Sandra, guia da Amanda, dossiê e logos do Studio La Rocha, documento "Tarefas da estreia". Últimas entregas: correção do preço do cartão (`6cdcb46`), agenda com várias profissionais (juntada em `c6f6d4e`) e este arquivo.

**Pendências do Kevin:** rodar `supabase/atualizacao.sql` de novo no Supabase (traz as várias profissionais) e depois cadastrar a Sandra em Mais › Profissionais + Authentication › Add user; criar o Google Analytics 4 e passar o ID `G-…` (`config.js`, `MEDICAO`); confirmar o telefone no cartão antes da gráfica; rodar no Supabase `update public.guardiao set painel_url='https://amandarochabemestar.com.br/admin/' where painel_url='https://kevinlaet.github.io/AMANDA-ROCHA-AT/admin/';` e `update public.servicos set preco_obs='valor de inauguração até 19/12' where id='limpeza';`; decidir se as notificações perdem o primeiro nome; informar a região do Supabase (aviso de privacidade); 2FA no GitHub/Supabase; Perfil da Empresa no Google e grupos do Facebook (ele mesmo faz); lembrete de renovar o domínio.

**Próximas entregas do Claude** (ordem sugerida): vídeo "Agende em 1 minuto"; capas dos destaques do Instagram; stories de contagem regressiva; 2 carrosséis; roteiros; cartão "Seu próximo horário"; folheto pós-limpeza (precisa do texto da Amanda); vale-presente de Natal; botão "Mandar carinho" no painel; seção "Primeira vez? Veja como é"; seção "Como chegar" (precisa de endereço e foto da Sandra); atualizar guia, `divulgacao-kevin` e dossiê com o domínio novo.

## 8. Onde está o resto

- Repositório: https://github.com/kevinlaet/AMANDA-ROCHA-AT (branch de trabalho `site-v1`; deploy em `main`; a branch remota `dominio` é antiga).
- Documentos Claude: Tarefas da estreia (https://claude.ai/artifact/YX9AyeeC6aXN1JnpCeLTSW), Dossiê do Studio La Rocha (https://claude.ai/artifact/RrPetHbdyjgHPLsiM1mSKu), Guia da Amanda (https://claude.ai/artifact/JobS89hmSiFaQskcPwVQtY), opções de logo (https://claude.ai/artifact/6vRUf7m99TA9YB5KXxVRwr).
- Respostas da Amanda ao questionário (29/10/2026) já aplicadas: durações, preços, benefícios (⭐ vão para o site: sono, dores lombares, ansiedade; pele, linhas de expressão, cravos e espinhas), agenda aos sábados, regras de pagamento, história, WhatsApp Business (quer mudar), domínio que ela sugeriu `amandarocha.com.br` (o escolhido e registrado foi `amandarochabemestar.com.br`).
