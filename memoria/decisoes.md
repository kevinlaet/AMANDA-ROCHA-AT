# Decisões (por tema)

Fonte da verdade do que ficou combinado. Se mudar algo, **atualize aqui e no `../CLAUDE.md`**.

## Negócio
- **Amanda Rocha**: enfermeira (COREN-SP 617675), especialista em saúde mental e psiquiatria, pós em estética facial e corporal em andamento. Marca profissional própria; atende **dentro do Studio La Rocha** (salão da mãe, Sandra), Vila Nova Mauá, Mauá/SP. Endereço informado pela Amanda: Rua Onivaldo Vanderlei Dionísio, 25 (a Sandra deve confirmar que é o oficial).
- **Só atende mulheres** (site, cartão e FAQ dizem isso). Público: mulheres de 18 a 60+ e adolescentes. Queixas comuns: dores, ansiedade, insônia, estresse, enxaqueca, oleosidade, manchas, linhas de expressão.
- **Auriculoterapia**: R$ 55 (promoção de R$ 50 já encerrou); sessão de **1h15**; pacote de **4 por R$ 200**; retorno ideal toda semana. Benefícios no site (estrelas): melhora o sono, dores lombares, ansiedade. Cuidado: gestantes têm restrições.
- **Limpeza de pele**: R$ 85; **inauguração R$ 75 até 19/12**; sessão de **1h40**; retorno a cada 25 dias a 2 meses; pacote "talvez". Benefícios no site: melhora o aspecto da pele, suaviza linhas de expressão, remove cravos e espinhas com segurança. Cuidados: cistos, tumores, alergias, queimaduras. Começa a ser marcada em **14/11**.
- No banco as durações são **85 e 110 min** (incluem 10 min de intervalo). No painel (Serviços e preços) aparece "Leva 1h25 / Leva 1h50"; a FAQ do site fala em "cerca de 1h15 / 1h40".
- **Agenda**: sábados, 10h às 17h (não todos, ela tem aulas); intervalo extra 10 min; antecedência mínima de 1 dia; mostra até 2 meses. Estreia em **sábado, 14/11/2026**.
- **Pagamento**: Pix, dinheiro, débito e crédito, **só no salão, pessoalmente**. **Sem sinal** e sem pagamento antecipado (decisão da Amanda em 30/10, opção 1). Aviso de falta com 24 h; tolerância de atraso "depende".
- **Indicação**: quem indicar uma amiga que fechar um procedimento ganha **1 sessão de auriculoterapia** (depois do primeiro atendimento da amiga). **Cartão fidelidade**: 5 carimbos = 1 sessão de auriculoterapia.
- Promoções futuras sugeridas pela Amanda: Dia da Mulher, Outubro Rosa, Black Friday, aniversário do salão, aniversário dela.
- Quer: avaliações no Google, mensagem do dia seguinte ("Como sua pele amanheceu?"), resumo do mês, ficha de saúde, fotos de antes e depois (com autorização escrita). "Talvez": cartão fidelidade extra e aniversário das clientes.
- Quer mudar para **WhatsApp Business**. Instagram: `@amandarochaat`. Contato de agenda: (11) 94890-7302 (no `agenda.js`).
- **Sandra** aluga cadeira e maca para outras profissionais (sem valor divulgado; água, luz e cadeira inclusos; materiais por conta da profissional; já existe "cartela de clientes" na região). WhatsApp dela nos folders: (11) 96768-2546.

## Produto e experiência
- Leve (cerca de 150 KB), funciona no 3G, letras grandes, poucos toques. Mobile primeiro, 320 a 768 px sem rolagem lateral.
- O site mostra **"Próximas datas disponíveis"**; "Leva 1 minuto: você escolhe, e eu confirmo pelo WhatsApp. Atendimento exclusivo para mulheres."
- A reserva **fica guardada** e o WhatsApp abre com a mensagem pronta; a Amanda confirma ou recusa no painel e avisa a cliente com um toque.
- Painel simples como "aplicativo": Início, Agenda, Enviar, Mais. A Amanda nunca viu painel, mas usa sistemas no trabalho (CAPS). Tudo com ajuda embutida e confirmação antes de ações destrutivas.
- Painel **não pode errar horário**: duas clientes nunca no mesmo horário, relógio de Brasília no servidor, tela desatualizada nunca altera por engano.
- A Amanda usa WhatsApp comum; automação oficial custa por mensagem e exige WhatsApp Business. Por enquanto: **toque abre o WhatsApp com a mensagem pronta** (ela só aperta enviar). Notificações no celular dela via app **ntfy**.
- "Visualizar agenda como cliente" no Início e na Agenda do painel.
- Questionário e guia ficam como páginas/artefatos separados; o questionário salva só no celular dela e envia por WhatsApp.

## Visual e texto
- Paleta verde-petróleo + creme + pêssego (ver `../CLAUDE.md`). A Amanda pediu "um toque de sofisticação" nas cores; nunca trocar de paleta.
- Fontes locais: Great Vibes, Cormorant, Montserrat, JetBrains Mono.
- Slogan: **Beleza · Saúde · Bem-estar**. Português simples; sem promessa de cura.
- Folders: nota 5/5 da Amanda; querem sensação de "que lindo!". Formatos feed (4:5) e story.
- **Assinatura** "Desenvolvido por Kevin Laet" em toda página e documento, discreta e elegante (maior na home, menor e mais transparente nas outras).
- Materiais para clientes simples: poucas palavras, passo a passo ilustrado, carinho e beleza (stories, carrosséis, vídeo "Agende em 1 minuto", destaques do Instagram).

## Segurança, privacidade e jurídico
- Nunca guardar **Secret key/service_role** do Supabase nem a senha da Amanda. Chave pública (`sb_publishable_…`) pode ficar no `config.js`.
- O e-mail da Amanda fica **fora** do repositório. Notificações levam **só o primeiro nome**; decisão pendente do Kevin: tirar até o nome.
- Sessão do painel: 12 h; encerra e pede senha se algo estranho acontecer. Cadastro novo fechado no Supabase Auth.
- CSP no painel (`script-src 'self'`, `connect-src https://*.supabase.co`). Guardião no banco e no GitHub Actions. O GitHub atrasa agendamentos: o guardião externo roda "algumas vezes por dia".
- LGPD: dados de clientes só no painel, nunca no site; cookies/GA4 só após "Aceitar"; nome e telefone nunca vão ao Google. COFEN 554/2017: sem promessa de resultado, sem sensacionalismo, imagem de cliente só com autorização escrita. CDC art. 30: oferta anunciada obriga (por isso "até 19/12" escrito em tudo e preço volta a R$ 85 em 20/12).
- Antigolpe: aviso de que o pagamento é só no salão; cuidado com comprovantes de Pix falsos; contas do salão no e-mail da Sandra, não do Kevin.
- Domínio: titular é o **Kevin** (não afirmar que é da Amanda). Vence em 29/10/2027.

## Processo de trabalho
- O Kevin pede **qualidade acima de velocidade**, respostas curtas e em português, e quer ver o resultado (capturas, links).
- Sempre testar (`cd tests && npm test`) antes de empurrar; empurrar para `site-v1` **e** `main`; conferir CI; fazer `git fetch` antes (outra sessão pode ter mexido na `main`).
- Sem PR a menos que o Kevin peça. Commits em português, com as linhas de atribuição pedidas pela sessão.
- Dividir tarefas por pessoa (Kevin, Amanda, Sandra, Claude) no documento "Tarefas da estreia".
- Para imagens por IA: modelo `gpt-image-2`, qualidade `medium`. Logos: gerar com IA e **vetorizar** (potrace), nunca usar a imagem solta.

## Studio La Rocha (projeto separado)
- Marca principal do lugar; Amanda Rocha é marca profissional **dentro** dele (cada uma mantém logo, cores e perfil). O dossiê completo está em `arquivos/studio-la-rocha-projeto/01-dossie/`.
- Logo **C (Fiel ao original)** escolhido em 31/10. Cores: símbolo dourado `#B08D57`, nome preto quente `#2B2622`, frase bronze `#9C7A45`; fundo escuro `#1F1A17`. Fontes: Cormorant Medium (nome) e Great Vibes (frase).
- Falta: confirmar nome oficial, data da inauguração, CNPJ/MEI, alvará e licença sanitária, contrato com parceiras (Lei 13.352/2016), foto real do espaço.
- O painel do salão (`studiolarocha`, pasta `painel/`) é este mesmo painel com a cara do salão.

Desenvolvido por Kevin Laet
