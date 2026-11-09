# Linha do tempo

Datas de 2026. Hashes são commits do repositório `kevinlaet/AMANDA-ROCHA-AT`.

## 28/10 · Nasce o projeto
- Kevin grava dois áudios com a Amanda (o dia ideal de trabalho: liberdade, agenda organizada, escolher quem atender).
- Pedido: agenda + linktree + site muito bonito, **leve** (clientes de baixa renda, celular simples), fácil de agendar, e **painel para a Amanda administrar horários sem erro**.
- Escolhas técnicas: GitHub Pages + Supabase (autorizados pelo Kevin). Folders de divulgação (agenda de 14/11, 12/12 e 19/12; aluguel de cadeira e maca com o WhatsApp da Sandra).
- Textos trocados a pedido: sai "de salto ou chinelo"; botão passa a orientar "para confirmar o horário, toque no botão abaixo e envie a mensagem de confirmação pelo WhatsApp".
- Assinatura "Desenvolvido por Kevin Laet" em todas as páginas.
- Redesenho "tecnológico, cara de super agência" e depois volta ao tom verde-petróleo (o Kevin pediu para manter a paleta).
- Recurso novo: a Amanda escolhe dias (ex.: 3 e 4 de novembro) e envia à cliente **um link** (a cliente agenda sozinha) **ou uma imagem** com os horários (para clientes mais velhas).

## 29/10 · Painel profissional e segurança
- Painel reorganizado em abas (Início, Agenda, Enviar, Mais) e tela de boas-vindas.
- **Guardião** no banco (tempo real) e externo (GitHub Actions): barra abuso, avisa por issue e, no celular, por ntfy.
- Sessão do painel de **12 horas**, com encerramento automático se algo parecer estranho.
- Clientes cadastradas sozinhas a partir da agenda; "mais de 10 dias sem vir" com convite pronto (texto "sagaz" aprovado pelo Kevin); sugestão de nomes ao digitar.
- Duração dos procedimentos: o banco **nunca** deixa marcar colado em outro atendimento; a Amanda recebe aviso se tentar.
- Resumo às 6h no celular ("Você tem N agendamentos para hoje", só se houver), com primeiro nome e procedimento.
- Serviços, preços e 3 benefícios principais **editáveis no painel**; o site atualiza sozinho.
- Slogan trocado para **Beleza · Saúde · Bem-estar**; sempre mencionar que a auriculoterapia ajuda com **dores**.
- Questionário da Amanda (13 etapas) e, às 13h20, ela responde. Decisões aplicadas (ver `decisoes.md`).
- "Seus números": contador de atendimentos, faturamento, meta do mês e "não veio" (incentivo para ela).

## 30/10 · Vender mais e se proteger
- Amanda já tinha 2 limpezas marcadas. Pedido: plano para mais 2 clientes → **guia da Amanda** (venda consultiva que sugere, não ordena; tudo claro e leve), cartaz A4 + cartões de espelho + "recado da Sandra" para o salão, Facebook, chip de trabalho, fotos antes e depois.
- Revisão **jurídica e antigolpe** de todos os materiais (COFEN 554/2017, CDC, LGPD, Anvisa RDC 222/2018, Lei 13.352/2016). Resultado: pagamento só no salão; sem sinal (a Amanda escolheu a opção 1).
- **Cartão de visita** com cartão fidelidade no verso (Amanda aprovou: "1, amei o cartão fidelidade"). Gráfica Ayres Print, 9×5 cm, frente brilho/verso fosco, 100 unidades. PDF exato de 90×50 mm.
- **Cookies e Google Analytics** com consentimento; QR dos impressos marcam a origem.
- **Studio La Rocha** (salão da Sandra): refinamento do logo (3 opções A, B, C), página de apresentação, dossiê do projeto.
- Auditoria de segurança do site (nenhum dado vazando); CSP no painel (`0825f65`).
- Início da configuração do domínio.

## 31/10 · Domínio e estreia
- Sandra e Amanda escolhem o **logo C (Fiel ao original)**.
- **amandarochabemestar.com.br** no ar com HTTPS (`5c121cc`); DNS no Registro.br, GitHub verificado, Supabase Auth com as URLs novas.
- Heading da agenda vira **"Próximas datas disponíveis"**; ideias de materiais (stories, carrosséis, vídeo).
- Documento "Tarefas da estreia" (quem faz o quê).

## 01/11 · Acabamento
- Links curtos `/agendar`, `/limpeza`, `/auriculo` (`5a30e4b`); página de links com serviços direto no agendamento (`c6ddaea`).
- Botão "Visualizar agenda como cliente" no painel (`3e1dcd6`).
- Resumo profissional de 300 caracteres para o linktree.
- Correção do "R$ 75 fora de eixo" e varredura de layout em 7 larguras; testes permanentes (301 checagens) (`6cdcb46`).

## 03/11 · Memória
- Chat renomeado para **Amanda Rocha Bem-estar**.
- `CLAUDE.md` criado (`ec065a8`, `7234dfd`).
- Descoberta: outra sessão colocou na `main` a **agenda com várias profissionais** (PR #1). Juntada à `site-v1` (`c6f6d4e`), todos os testes do site passaram.
- Esta pasta `memoria/` criada.

## Próximo (combinado)
Vídeo "Agende em 1 minuto" e capas dos destaques do Instagram, depois o resto da lista em `tarefas-da-estreia.md`.

Desenvolvido por Kevin Laet
