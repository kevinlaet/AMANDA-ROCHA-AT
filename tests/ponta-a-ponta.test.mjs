// Fluxo completo: site das clientes + painel da Amanda, num navegador de verdade,
// falando com o PostgreSQL real (via tests/postgrest.mjs).
// As páginas são servidas em /AMANDA-ROCHA-AT/, o mesmo caminho do GitHub Pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { criarBanco, placar, RAIZ, EMAIL_ADMIN } from './banco.mjs';
import { criarApi, SUPABASE_URL, ANON_KEY, SENHAS } from './postgrest.mjs';

const { ok, fim } = placar();
const CAPTURAS = process.env.CAPTURAS || '';
const foto = async (pagina, nome, inteira = true) => { if (CAPTURAS) await pagina.screenshot({ path: path.join(CAPTURAS, nome + '.png'), fullPage: inteira }); };

// ---------- servidor estático ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const PREFIXO = '/AMANDA-ROCHA-AT';
// trocas: arquivos servidos com outro conteúdo (para testar o guardião contra alterações)
const trocas = {};
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (trocas[p.slice(PREFIXO.length + 1)]) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(trocas[p.slice(PREFIXO.length + 1)]); }
  if (!p.startsWith(PREFIXO + '/')) { res.writeHead(404); return res.end(); }
  p = path.join(RAIZ, p.slice(PREFIXO.length));
  if (!p.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(fs.readFileSync(path.join(RAIZ, '404.html'))); }
  res.writeHead(200, { 'content-type': TIPOS[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => servidor.listen(0, r));
const BASE = `http://localhost:${servidor.address().port}${PREFIXO}/`;

// ---------- banco e cenário ----------
const banco = await criarBanco();
const api = criarApi(banco);
// as consultas diretas do teste entram na mesma fila dos pedidos do site e do painel:
// assim nunca rodam no meio de um pedido, com o papel (anon, Amanda) dele
const dbBruto = banco.db;
const db = { exec: (s) => api.exec(s), query: (s, p) => api.sql(s, p) };
// limites do guardião bem altos: estes testes fazem muitos pedidos seguidos de propósito (o guardião é testado à parte)
await db.exec(`update guardiao set max_10min = 1000, max_hora = 1000`);
const q = async (s, p) => (await db.query(s, p)).rows;
const dia = async (n) => (await q(`select (public.agora_sp() + interval '${n} days')::date::text d`))[0].d;
const D3 = await dia(3), D5 = await dia(5), D10 = await dia(10);
await db.exec(`alter table horarios disable trigger trg_horario_passado`);
await db.exec(`insert into horarios (data, hora) select '${D3}'::date, h from unnest(array['13:00','14:00','15:00']) h`);
await db.exec(`insert into horarios (data, hora) select '${D10}'::date, h from unnest(array['13:00','16:00']) h`);
await db.exec(`insert into horarios (data, hora) select d::date, to_char(d, 'HH24:MI') from (select public.agora_sp() - interval '2 hours' d union all select public.agora_sp() + interval '30 minutes') t on conflict do nothing`);
await db.exec(`alter table horarios enable trigger trg_horario_passado`);
// a estreia da limpeza de pele vem do banco (editável pelo painel); no teste ela fica para daqui a 5 dias
await db.query(`update servicos set desde = $1 where id = 'limpeza'`, [D5]);
const horario = async (data, hora) => (await q(`select * from horarios where data = $1 and hora = $2`, [data, hora]))[0];
// o painel tem 4 abas (Início, Agenda, Enviar, Serviços), trocadas pela barra de baixo
const aba = async (pagina, nome) => { await pagina.click(`[data-aba-btn="${nome}"]`); await pagina.waitForSelector(`[data-aba="${nome}"]:not([hidden])`); };
// abre um horário específico na Agenda (pelo id, sem depender do texto do botão)
const noPainel = async (pagina, data, hora) => { await aba(pagina, 'agenda'); await pagina.click(`#agenda [data-abrir="${(await horario(data, hora)).id}"]`); };
// abre uma página do "Mais" (Serviços, Histórico, Segurança, Como funciona, Minha conta)
const doMais = async (pagina, nome) => { await aba(pagina, 'mais'); await pagina.click(`[data-aba="mais"] [data-ir="${nome}"]`); await pagina.waitForSelector(`[data-aba="${nome}"]:not([hidden])`); };
// abre o formulário "Abrir novos horários" da Agenda
const formAbrir = async (pagina) => { await aba(pagina, 'agenda'); if (await pagina.locator('#cardAbrir').isHidden()) await pagina.click('#bMostrarAbrir'); };
// espera a animação de subida do painel de ações terminar e devolve a posição dele
const caixaDoPainel = async (pagina) => { await pagina.locator('#sheet').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); return pagina.locator('#sheet').boundingBox(); };

// ---------- navegador ----------
const navegador = await chromium.launch();
const erros = [], violacoes = [];
const agendaJs = fs.readFileSync(path.join(RAIZ, 'agenda.js'), 'utf8').replace(/desde: "\d{4}-\d\d-\d\d"/, `desde: "${D5}"`);
async function contexto(dispositivo, { ligado = true, apiDoBanco = api, medicao = '' } = {}) {
  const c = await navegador.newContext({ ...dispositivo, reducedMotion: 'reduce' });
  const cfgMedicao = `window.MEDICAO={googleAnalytics:${JSON.stringify(medicao)}};`;
  await c.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: (ligado ? `window.SUPABASE={url:${JSON.stringify(SUPABASE_URL)},anonKey:${JSON.stringify(ANON_KEY)}};` : 'window.SUPABASE={url:"",anonKey:""};') + cfgMedicao }));
  await c.route('**/agenda.js', (r) => r.fulfill({ contentType: 'text/javascript', body: agendaJs }));
  await c.route(SUPABASE_URL + '/**', apiDoBanco.tratar);
  await c.route('https://wa.me/**', (r) => r.fulfill({ contentType: 'text/html', body: 'whatsapp' }));
  c.on('page', (p) => { p.on('pageerror', (e) => erros.push(p.url() + ': ' + e.message)); p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) violacoes.push(p.url() + ': ' + m.text().slice(0, 150)); }); });
  return c;
}
const ANDROID = devices['Galaxy S9+'], IPHONE = devices['iPhone 13'];

// ===== 1. Site sem Supabase (modo atual, só WhatsApp) =====
{
  const c = await contexto(ANDROID, { ligado: false });
  const p = await c.newPage();
  await p.goto(BASE);
  await p.waitForSelector('#o-dia .opt');
  ok(await p.locator('#stTel').isHidden(), 'sem Supabase: não pede telefone');
  ok((await p.locator('#goTxt').innerText()) === 'Confirmar pelo WhatsApp' && /toque no botão abaixo/.test(await p.locator('#hint').innerText()), 'sem Supabase: instrução acima do botão "Confirmar pelo WhatsApp"');
  await p.click('#o-servico .opt >> nth=0'); await p.click('#o-dia .opt >> nth=0'); await p.click('#o-hora .opt >> nth=1'); await p.fill('#nome', 'Maria');
  await Promise.all([p.waitForURL(/wa\.me/), p.click('#go')]);
  ok(/Auriculoterapia/.test(decodeURIComponent(p.url())) && /Meu nome é Maria/.test(decodeURIComponent(p.url())), 'sem Supabase: abre o WhatsApp com a mensagem pronta');
  await c.close();
}

// ===== 2. Site com Supabase =====
const cA = await contexto(ANDROID);
const A = await cA.newPage();
await A.clock.install({ time: new Date('2030-01-01T10:00:00') }); // relógio do celular muito errado
await A.goto(BASE);
await A.waitForSelector('#o-dia .opt');
await foto(A, 'site-inicio', false);
ok((await A.locator('#o-dia .opt').count()) === 2, 'celular com relógio em 2030 ainda vê os 2 dias certos, vindos do banco');
// limpeza de pele só a partir da data de estreia
await A.click('#o-servico .opt:has-text("Limpeza de pele")');
const d3 = A.locator('#o-dia .opt >> nth=0'), d10 = A.locator('#o-dia .opt >> nth=1');
ok(await d3.isDisabled() && /a partir de/.test(await d3.innerText()), 'limpeza de pele: dia antes da estreia fica bloqueado com "a partir de"');
ok(!(await d10.isDisabled()), 'limpeza de pele: dia depois da estreia fica liberado');
await A.click('#o-servico .opt:has-text("Auriculoterapia")');
ok(!(await d3.isDisabled()), 'auriculoterapia: o mesmo dia fica liberado');
await d3.click();
ok((await A.locator('#o-hora .opt').count()) === 3, 'mostra os 3 horários do dia');
await A.click('#o-hora .opt:has-text("14h")');
await A.fill('#nome', 'Maria Silva');
ok(await A.locator('#go').isDisabled(), 'sem WhatsApp da cliente, o botão fica bloqueado');
await A.fill('#tel', '11912345678');
await A.locator('#tel').blur();
ok((await A.inputValue('#tel')) === '(11) 91234-5678', 'telefone é formatado: (11) 91234-5678');
ok(!(await A.locator('#go').isDisabled()), 'com telefone válido, o botão libera');
ok((await A.locator('#goTxt').innerText()) === 'Confirmar pelo WhatsApp' && /garantir o horário/.test(await A.locator('#hint').innerText()), 'com Supabase: instrução e botão "Confirmar pelo WhatsApp"');
if (CAPTURAS) await A.locator('#agendar').screenshot({ path: path.join(CAPTURAS, 'site-agenda-preenchida.png') });

// outra cliente pega o mesmo horário antes
const cB = await contexto(ANDROID);
const B = await cB.newPage();
await B.goto(BASE); await B.waitForSelector('#o-dia .opt');
await B.click('#o-servico .opt:has-text("Auriculoterapia")'); await B.click('#o-dia .opt >> nth=0'); await B.click('#o-hora .opt:has-text("14h")');
await B.fill('#nome', 'Joana'); await B.fill('#tel', '11 98888-7777');
await Promise.all([B.waitForURL(/wa\.me/), B.click('#go')]);
ok((await horario(D3, '14:00')).nome === 'Joana', 'Joana reservou 14h');
await A.click('#go');
await A.waitForFunction(() => /acabou de ser pego/.test(document.getElementById('resumo').innerText));
ok(true, 'Maria é avisada de que o horário acabou de ser pego');
ok((await horario(D3, '14:00')).nome === 'Joana', 'o banco continua com a Joana (nada foi sobrescrito)');
ok(await A.locator('#o-hora .opt:has-text("14h")').isDisabled(), '14h aparece como ocupado para a Maria');
ok((await A.inputValue('#nome')) === 'Maria Silva' && (await A.inputValue('#tel')) === '(11) 91234-5678', 'nome e telefone da Maria continuam preenchidos');
await A.click('#o-hora .opt:has-text("15h")');
await Promise.all([A.waitForURL(/wa\.me/), A.click('#go')]);
ok((await horario(D3, '15:00')).nome === 'Maria Silva', 'Maria reservou 15h');
ok(/5511948907302/.test(A.url()) && /Maria Silva/.test(decodeURIComponent(A.url())) && /15h/.test(decodeURIComponent(A.url())), 'Maria vai para o WhatsApp da Amanda com dia e hora certos');

// limite de 2 horários por telefone, sem perder o que foi escolhido
{
  const p = await cA.newPage();
  await p.goto(BASE); await p.waitForSelector('#o-dia .opt');
  await p.click('#o-servico .opt:has-text("Auriculoterapia")'); await p.click('#o-dia .opt >> nth=1'); await p.click('#o-hora .opt:has-text("13h")');
  await p.fill('#nome', 'Maria Silva'); await p.fill('#tel', '(11) 91234-5678');
  await Promise.all([p.waitForURL(/wa\.me/), p.click('#go')]);
  const p2 = await cA.newPage();
  await p2.goto(BASE); await p2.waitForSelector('#o-dia .opt');
  await p2.click('#o-servico .opt:has-text("Auriculoterapia")'); await p2.click('#o-dia .opt >> nth=1'); await p2.click('#o-hora .opt:has-text("16h")');
  await p2.fill('#nome', 'Maria Silva'); await p2.fill('#tel', '(11) 91234-5678');
  await p2.click('#go');
  await p2.waitForFunction(() => /2 horários/.test(document.getElementById('resumo').innerText));
  ok(true, 'terceiro horário do mesmo telefone: aviso de limite');
  ok((await p2.locator('#o-hora .opt[aria-pressed=true]').count()) === 1, 'e o horário escolhido continua marcado');
  await p.close(); await p2.close();
}

// ===== 3. Página de links =====
{
  const p = await cA.newPage();
  await p.goto(BASE + 'links/');
  const href = await p.locator('a.main').evaluate((a) => a.href);
  ok(href === BASE + '#agendar', 'links: "Agendar" leva para a agenda do site (' + href.replace(BASE, '/') + ')');
  const servs = await p.locator('a.l', { hasText: /Limpeza de pele|Auriculoterapia/ }).evaluateAll((l) => l.map((a) => a.href));
  ok(servs.join() === [BASE + 'limpeza/', BASE + 'auriculo/'].join(), 'links: limpeza e auriculoterapia levam direto ao agendamento com o serviço já escolhido');
  ok(/R\$ 75 até 19\/12/.test(await p.locator('a.l.nov').innerText()), 'links: o valor de inauguração mostra o prazo (até 19/12)');
  await foto(p, 'links');
  await p.close();
}

// ===== 4. Painel da Amanda =====
const cAdm = await contexto(IPHONE);
const P = await cAdm.newPage();
await P.goto(BASE + 'admin/');
ok(await P.locator('#vLogin').isVisible(), 'painel pede login');
await P.fill('#email', EMAIL_ADMIN); await P.fill('#senha', 'errada'); await P.click('#bLogin');
await P.waitForFunction(() => /incorretos/.test(document.getElementById('mLogin').innerText));
ok(true, 'senha errada: "E-mail ou senha incorretos"');
await P.fill('#email', 'outra@pessoa.com'); await P.fill('#senha', 'certa'); await P.click('#bLogin');
await P.waitForFunction(() => /não tem acesso/.test(document.getElementById('mLogin').innerText));
ok(await P.locator('#vLogin').isVisible(), 'e-mail que não é o da Amanda: entra, mas é barrado com explicação');
await P.fill('#email', EMAIL_ADMIN); await P.fill('#senha', 'certa'); await P.click('#bLogin');
await P.waitForSelector('#vApp:not([hidden])');
await P.waitForSelector('#pedidos .ped');
ok((await P.locator('#pedidos .ped').count()) === 3, 'painel mostra os 3 pedidos');
ok((await P.title()).startsWith('(3)'), 'a aba mostra (3) pedidos');
ok(/Atualizado às \d\d:\d\d/.test(await P.locator('#atualizado').innerText()), 'mostra a hora da última atualização');
{
  // "Visualizar agenda como cliente": abre o site numa aba nova, direto na agenda
  const ver = P.locator('.atalhos .ver-site');
  ok((await ver.innerText()).includes('Visualizar agenda como cliente') && (await ver.getAttribute('target')) === '_blank' && (await P.locator('#bVerSite').count()) === 1, 'painel: botão "Visualizar agenda como cliente" no Início e na Agenda');
  const [aba] = await Promise.all([cAdm.waitForEvent('page'), ver.click()]);
  await aba.waitForSelector('#o-servico .opt');
  ok(new URL(aba.url()).hash === '#agendar' && (await aba.locator('#o-dia .opt').count()) > 0, 'painel: "Visualizar agenda como cliente" abre o site na agenda, com os dias que a cliente vê');
  await aba.close();
}
// simples para quem nunca usou painel: abre no Início, com guia e abas
ok((await P.locator('[data-aba]:not([hidden])').evaluateAll((e) => e.map((x) => x.dataset.aba))).join() === 'inicio', 'abre na aba Início, só com o que precisa dela agora');
await P.waitForSelector('#ola:not([hidden])');
const olaT = await P.locator('#olaT').innerText(), olaM = await P.locator('#olaM').innerText();
ok(/Amanda/.test(olaT) && /^(Bom dia|Boa tarde|Boa noite|Oi|Ué|Feliz Dia|Daqui a|Meta batida|\d+ atendimentos|\S+ já passou|A \S+ voltou|Cliente nova|Mais um sábado|Agenda cheia|Hoje são|Sábado chegou|Tem cliente|Sexta-feira|Segunda-feira|Agenda com espaço)/.test(olaT) && olaM.length > 10 && (await P.locator('#boasVindas').count()) === 0, 'o Início abre com uma saudação para a Amanda e uma frase inspiradora (sem guia nem explicações): ' + olaT + ' / ' + olaM);
ok(await P.evaluate(() => getComputedStyle(document.getElementById('olaM')).fontStyle === 'italic' && document.fonts.check('italic 22px Cormorant')), 'a frase da saudação usa a Cormorant itálica');
ok(await P.locator('#blocoSug').isHidden(), 'sugestões em espera: a área não aparece no Início');
ok(/🔔 3 pedidos esperando você/.test(await P.locator('#olaChips').innerText()), 'a saudação avisa dos pedidos esperando');
ok((await P.locator('#selo').count()) === 0 && await P.locator('#vApp header .cab-logo').isVisible(), 'o topo tem o logo e não tem mais o selo');
ok((await P.locator('#nPedNav').innerText()) === '3', 'a barra de baixo mostra 3 pedidos no botão Início');
ok((await P.locator('.abas [data-aba-btn]').count()) === 4 && (await P.locator('[data-aba="inicio"] details.ajuda').count()) === 0 && (await P.locator('[data-aba]:not([data-aba="profissionais"]) details.ajuda summary', { hasText: 'Como usar esta parte' }).count()) === 3, 'são 4 abas; o Início não tem mais "Como usar esta parte"');
const ordem = await P.evaluate(() => [...document.querySelectorAll('[data-aba="inicio"] > [id], [data-aba="inicio"] > .atalhos')].map((e) => e.id || e.className));
ok(ordem[ordem.length - 1] === 'blocoPed' && await P.locator('#blocoPed').isVisible(), 'os pedidos ficam no final do Início (e aparecem porque há pedidos)');
await foto(P, 'painel-pedidos');

// confirmar pelo cartão do pedido
await P.locator('#pedidos .ped', { hasText: 'Joana' }).locator('[data-a=confirmar]').click();
await P.waitForSelector('#toast:not([hidden])');
ok((await horario(D3, '14:00')).status === 'confirmado', 'confirmar a Joana grava no banco');
const avisar = await P.locator('#toast a.btn').getAttribute('href');
ok(avisar && avisar.startsWith('https://wa.me/5511988887777') && /confirmado/.test(decodeURIComponent(avisar)), 'aviso traz o botão "Avisar Joana no WhatsApp" com a confirmação pronta');
await foto(P, 'painel-confirmado', false);

// recusar exige confirmação e apaga os dados da cliente
await P.locator('#pedidos .ped', { hasText: 'Maria Silva' }).first().locator('[data-a=perg-recusar]').click();
ok(await P.locator('#sheet .pergunta').isVisible(), 'recusar pergunta antes: "Recusar o pedido de Maria?"');
ok((await horario(D3, '15:00')).status === 'pedido', 'antes de confirmar a pergunta, nada muda no banco');
await foto(P, 'painel-pergunta', false);
await P.click('#sheet [data-a=recusar]');
await P.waitForSelector('#sheet', { state: 'hidden' });
const recusado = await horario(D3, '15:00');
ok(recusado.status === 'livre' && recusado.nome === null && recusado.telefone === null, 'recusado: horário livre e dados da cliente apagados');
ok(/n%C3%A3o%20vou%20conseguir|não vou conseguir/.test(await P.locator('#toast a.btn').getAttribute('href')), 'aviso traz a mensagem de recusa pronta para a cliente');

// tela desatualizada: Amanda abre um horário livre; uma cliente pede no meio tempo
await noPainel(P, D3, '13:00');
const caixa = await caixaDoPainel(P), vp = P.viewportSize();
ok(caixa && caixa.y >= 0 && caixa.y + caixa.height <= vp.height + 1, `o painel de ações abre dentro da tela (de ${Math.round(caixa.y)} a ${Math.round(caixa.y + caixa.height)} px, tela de ${vp.height} px)`);
const id13 = (await horario(D3, '13:00')).id;
await api.como('anon', null, () => dbBruto.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Cliente Atrasada', '11977776666')`, [id13]));
await P.click('#sheet [data-a=perg-ocupar]');
await P.fill('#fNome', 'Dona Edilva');
await P.click('#sheet [data-a=ocupar]');
await P.waitForFunction(() => /mudou enquanto você olhava/.test(document.getElementById('toast').innerText));
const h13 = await horario(D3, '13:00');
ok(h13.status === 'pedido' && h13.nome === 'Cliente Atrasada', '"Marcar como ocupado" com a tela velha NÃO passa por cima do pedido novo');
await P.click('#sheet [data-a=fechar]').catch(() => {});

// remover com a tela velha
await db.exec(`insert into horarios (data, hora) values ('${D10}', '18:00')`);
await P.click('#bAtualizar'); await P.waitForSelector(`[data-abrir="${(await horario(D10, '18:00')).id}"]`);
await noPainel(P, D10, '18:00');
const id18 = (await horario(D10, '18:00')).id;
await api.como('anon', null, () => dbBruto.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Rita Lima', '11955554444')`, [id18]));
await P.click('#sheet [data-a=perg-remover]'); await P.click('#sheet [data-a=remover]');
await P.waitForFunction(() => /mudou enquanto você olhava/.test(document.getElementById('toast').innerText));
ok((await horario(D10, '18:00'))?.nome === 'Rita Lima', '"Remover" com a tela velha NÃO apaga o pedido novo');
await P.click('#sheet [data-a=fechar]').catch(() => {});

// marcar como ocupado com nome
await P.click('#bAtualizar');
await noPainel(P, D3, '15:00');
await P.click('#sheet [data-a=perg-ocupar]'); await P.fill('#fNome', 'Dona Edilva'); await P.click('#sheet [data-a=ocupar]');
await P.waitForSelector('#sheet', { state: 'hidden' });
ok((await horario(D3, '15:00')).nome === 'Dona Edilva', 'marcar como ocupado guarda o nome digitado');
await P.waitForSelector(`[data-abrir]:has-text("Dona")`, { timeout: 5000 }).catch(() => {});
ok(await P.locator(`[data-abrir]:has-text("Dona")`).count() === 1, 'e o nome aparece na agenda');

// cancelar um confirmado
await noPainel(P, D3, '14:00');
await P.click('#sheet [data-a=perg-cancelar]');
ok(await P.locator('#sheet .pergunta').isVisible(), 'cancelar um confirmado também pergunta antes');
await P.click('#sheet [data-a=cancelar]');
await P.waitForSelector('#sheet', { state: 'hidden' });
ok((await horario(D3, '14:00')).status === 'livre', 'cancelado: horário volta a ficar livre');
ok(/desmarcar/.test(decodeURIComponent(await P.locator('#toast a.btn').getAttribute('href'))), 'aviso traz a mensagem de cancelamento pronta');

// sem internet no meio de uma ação
await aba(P, 'inicio');
await P.route(SUPABASE_URL + '/rest/v1/horarios?**', (r) => (r.request().method() === 'PATCH' ? r.abort() : r.fallback()));
await P.locator('#pedidos .ped', { hasText: 'Rita' }).locator('[data-a=confirmar]').click();
await P.waitForFunction(() => /Sem conexão. Nada foi alterado/.test(document.getElementById('toast').innerText));
ok((await horario(D10, '18:00')).status === 'pedido', 'sem internet: nada é alterado e ela é avisada');
ok(!(await P.locator('#pedidos .ped', { hasText: 'Rita' }).locator('[data-a=confirmar]').isDisabled()), 'e os botões voltam a funcionar');
await P.unroute(SUPABASE_URL + '/rest/v1/horarios?**');

// abrir horários: vários sábados, horário quebrado, prévia antes
const inicio = await dia(14);
await formAbrir(P);
await P.fill('#novaData', inicio);
await P.selectOption('#repetir', '4');
await P.fill('#horaExtra', '13:30'); await P.click('#bExtra');
const previa = await P.locator('#previa').innerText();
ok(/13h30/.test(previa) && /4 dias/.test(previa), 'prévia mostra o que vai abrir: ' + previa.replace(/\s+/g, ' '));
await P.click('#bAbrir');
await P.waitForFunction(() => /horários abertos/.test(document.getElementById('toast').innerText));
const abertos = (await q(`select count(*)::int n from horarios where data in ($1, $2, $3, $4)`, [inicio, await dia(21), await dia(28), await dia(35)]))[0].n;
ok(abertos === 24, '4 semanas × 6 horários = 24 horários abertos (' + abertos + ')');
await P.click('#bAbrir');
await P.waitForFunction(() => /Nenhum horário novo/.test(document.getElementById('toast').innerText));
ok(true, 'abrir de novo os mesmos horários não duplica nada');

// abrir hoje: horários que já passaram ficam de fora
const hoje = await dia(0);
const HORAS_HOJE = `('08:00','09:00','10:00','11:00','12:00','13:00','13:30','14:00','15:00','16:00','17:00','18:00','19:00')`;
// só vale o que ESTE botão cria: horários de hoje abertos antes (quando ainda era mais cedo) não entram na conta
const jaExistiam = new Set((await q(`select hora from horarios where data = $1 and hora in ${HORAS_HOJE}`, [hoje])).map((r) => r.hora));
const [{ h: horaAgora }] = await q(`select to_char(public.agora_sp(), 'HH24:MI') h`);
await P.fill('#novaData', hoje); await P.selectOption('#repetir', '1');
await P.click('#bAbrir');
await P.waitForFunction(() => !document.getElementById('toast').hidden && /(aberto|Nenhum)/.test(document.getElementById('toast').innerText));
const criadosHoje = (await q(`select hora from horarios where data = $1 and hora in ${HORAS_HOJE}`, [hoje])).filter((r) => !jaExistiam.has(r.hora));
ok(criadosHoje.every((r) => r.hora > horaAgora), `abrir hoje (${horaAgora}): nenhum horário passado foi criado`);

// o painel de ações abre na tela mesmo com muitos dias abertos
await P.click('#agenda [data-abrir] >> nth=0');
const caixa2 = await caixaDoPainel(P);
ok(caixa2 && caixa2.y >= 0 && caixa2.y + caixa2.height <= vp.height + 1, 'com muitos dias na agenda, o painel de ações continua dentro da tela');
await foto(P, 'painel-acoes', false);
await P.keyboard.press('Escape');
await foto(P, 'painel-completo');
await aba(P, 'agenda');

// sessão
await P.reload(); await P.waitForSelector('#vApp:not([hidden])');
ok(true, 'continua logada depois de recarregar');
ok(await P.locator('[data-aba="agenda"]').isVisible() && (await P.getAttribute('[data-aba-btn="agenda"]', 'aria-current')) === 'page', 'ao recarregar, continua na aba em que estava');
await doMais(P, 'conta');
await P.click('#bSair');
ok(await P.locator('#vLogin').isVisible(), 'sair (em Mais › Minha conta) volta para o login');

// ===== 4c. Enviar horários para uma cliente (link ou imagem) =====
{
  const c = await contexto(IPHONE);
  await c.addInitScript(() => {
    window.__share = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__share = { n: d.files.length, tipo: d.files[0].type, tam: d.files[0].size, text: d.text }; };
  });
  const p = await c.newPage();
  await p.goto(BASE + 'admin/');
  await p.fill('#email', EMAIL_ADMIN); await p.fill('#senha', 'certa'); await p.click('#bLogin');
  await p.waitForSelector('#vApp:not([hidden])');
  // atalho do Início leva direto para abrir horários
  await p.click('[data-aba="inicio"] .atalhos [data-abrir-form]');
  ok(await p.locator('[data-aba="agenda"]').isVisible() && await p.locator('#cardAbrir').isVisible(), 'atalho "Abrir novos horários" vai para a Agenda com o formulário aberto');
  await aba(p, 'enviar');
  await p.waitForSelector('#envDias [data-env]');
  const chips = await p.locator('#envDias [data-env]').evaluateAll((els) => els.map((e) => e.getAttribute('data-env')));
  ok(chips.length >= 2, 'envio: o painel lista os dias que têm horário livre (' + chips.length + ' dias)');
  ok(await p.locator('#bLink').isDisabled() && await p.locator('#bImg').isDisabled(), 'envio: os botões ficam bloqueados até escolher um dia');
  const [d1, d2] = chips;
  await p.click(`[data-env="${d1}"]`); await p.click(`[data-env="${d2}"]`);
  ok(!(await p.locator('#bLink').isDisabled()) && !(await p.locator('#bImg').isDisabled()), 'envio: escolhendo dias, os dois botões liberam');
  const previaEnvio = await p.locator('#envPrevia').innerText();
  const livresD1 = (await q(`select hora from horarios where data = $1 and status = 'livre' order by hora`, [d1])).map((r) => r.hora);
  ok(previaEnvio.includes(String(Number(livresD1[livresD1.length - 1].slice(0, 2)))), 'envio: a prévia lista os horários livres dos dias escolhidos');

  // --- link ---
  await p.fill('#envNome', 'Maria Souza'); await p.fill('#envTel', '(11) 91111-2222');
  await p.selectOption('#envServ', 'auriculo');
  await p.click('#bLink');
  await p.waitForSelector('#envio pre.txt');
  const texto = await p.locator('#envio pre.txt').innerText();
  const urlLink = texto.match(/https?:\/\/\S+/)[0];
  ok(texto.startsWith('Oi, Maria! Aqui é a Amanda.') && urlLink.includes(`dias=${d1},${d2}`) && /n=Maria/.test(urlLink) && /s=auriculo/.test(urlLink) && urlLink.endsWith('#agendar'), 'envio por link: mensagem com saudação, dias, nome e serviço no endereço');
  const hrefZap = await p.locator('#envio a.btn.zap').getAttribute('href');
  ok(hrefZap.startsWith('https://wa.me/5511911112222?text='), 'envio por link: o botão abre a conversa direto com o número da cliente');
  await foto(p, 'envio-link', false);
  await p.keyboard.press('Escape');
  ok(await p.locator('#envio').isHidden(), 'envio: Escape fecha a janela');
  await p.fill('#envTel', ''); await p.click('#bLink'); await p.waitForSelector('#envio pre.txt');
  ok((await p.locator('#envio a.btn.zap').getAttribute('href')).startsWith('https://wa.me/?text='), 'envio por link: sem número, o WhatsApp deixa escolher a cliente');
  await p.click('#envio [data-acao=fecharEnvio]');

  // --- a cliente abre o link ---
  const cli = await contexto(ANDROID);
  const L = await cli.newPage();
  await L.goto(urlLink);
  await L.waitForSelector('#o-dia .opt');
  ok((await L.locator('#o-dia .opt').count()) === 2, 'link: a cliente vê só os 2 dias separados');
  ok(/separou estes dias para você/.test(await L.locator('#conv').innerText()) && /Maria/.test(await L.locator('#conv').innerText()), 'link: aparece o aviso com o nome da cliente');
  ok((await L.inputValue('#nome')) === 'Maria', 'link: o nome já vem preenchido');
  ok((await L.locator('#o-servico .opt[aria-pressed=true]').innerText()).includes('Auriculoterapia'), 'link: o serviço já vem escolhido');
  await L.click('[data-cv=todos]');
  ok((await L.locator('#o-dia .opt').count()) > 2, 'link: "Ver todos os dias" mostra os outros dias');
  await L.click('[data-cv=voltar]');
  ok((await L.locator('#o-dia .opt').count()) === 2, 'link: dá para voltar aos dias separados');
  const L2 = await cli.newPage();
  await L2.goto(BASE + '?dias=2020-01-01,xx,2026-13-45&n=%3Cb%3EX%3C%2Fb%3E');
  await L2.waitForSelector('#o-dia .opt, #o-dia .empty');
  ok(await L2.locator('#conv').isHidden() || (await L2.locator('#conv').innerHTML()).indexOf('<b>X') < 0, 'link: datas inválidas e nome com código são ignorados com segurança');
  const L3 = await cli.newPage();
  await L3.goto(BASE + '?dias=2020-01-01');
  await L3.waitForSelector('#o-dia .empty');
  ok(/já foram preenchidos/.test(await L3.locator('#o-dia').innerText()), 'link: dias que já passaram mostram "já foram preenchidos" e convidam a ver outros');

  // --- imagem ---
  await p.fill('#envTel', '');
  await p.click('#bImg');
  await p.waitForSelector('#envio img.previa-img');
  await p.waitForFunction(() => { const i = document.querySelector('#envio img.previa-img'); return i && i.complete && i.naturalWidth > 0; });
  const dim = await p.locator('#envio img.previa-img').evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight }));
  ok(dim.w === 1080 && dim.h >= 1350, `envio por imagem: imagem criada com ${dim.w}x${dim.h}`);
  if (CAPTURAS) {
    const b64 = await p.locator('#envio img.previa-img').evaluate((i) => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/png').split(',')[1]; });
    fs.writeFileSync(path.join(CAPTURAS, 'imagem-horarios.png'), Buffer.from(b64, 'base64'));
  }
  await p.click('#envio [data-acao=compartilhar]');
  const comp = await p.evaluate(() => window.__share);
  ok(comp && comp.n === 1 && comp.tipo === 'image/png' && comp.tam > 20000, 'envio por imagem: o botão entrega um arquivo PNG ao compartilhamento do celular (' + (comp && comp.tam) + ' bytes)');
  ok(/^Oi, Maria! Aqui é a Amanda\./.test(comp.text) && /responder aqui com o dia e a hora/.test(comp.text), 'envio por imagem: a mensagem acompanha a imagem');
  await foto(p, 'envio-imagem', false);
  await p.keyboard.press('Escape');
  await c.close(); await cli.close();
}

// ===== 4d. Autonomia da Amanda: editar, remarcar, mudar, apagar, dias, serviços e lembretes =====
{
  const espera = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 120)); } return false; };
  const D20 = await dia(20), D21 = await dia(21), AMANHA = await dia(1);
  await db.exec(`insert into horarios (data, hora) select '${D20}'::date, h from unnest(array['10:00','11:00','12:00','13:00']) h`);
  await db.exec(`insert into horarios (data, hora) values ('${D21}', '10:00'), ('${AMANHA}', '23:30') on conflict do nothing`);
  const idDe = async (d, h) => (await horario(d, h)).id;
  // uma cliente confirmada em D20 10h e outra amanhã (para o lembrete)
  const [idB, idC] = [await idDe(D20, '10:00'), await idDe(AMANHA, '23:30')];
  await api.como('anon', null, () => dbBruto.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Beatriz Nunes', '11944443333')`, [idB]));
  await api.como('anon', null, () => dbBruto.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Carla Dias', '11977771111')`, [idC]));
  await db.exec(`update horarios set status = 'confirmado' where nome in ('Beatriz Nunes', 'Carla Dias')`);

  const c = await contexto(IPHONE);
  const P2 = await c.newPage();
  await P2.goto(BASE + 'admin/');
  await P2.fill('#email', EMAIL_ADMIN); await P2.fill('#senha', 'certa'); await P2.click('#bLogin');
  await P2.waitForSelector('#vApp:not([hidden])');
  await P2.waitForSelector('#proximos .prox');

  // lembrete
  const cartao = P2.locator('#proximos .prox', { hasText: 'Carla' });
  const hrefL = await cartao.locator('a[data-lembrete]').getAttribute('href');
  ok(/5511977771111/.test(hrefL) && /lembrar do seu horário de Auriculoterapia amanhã/.test(decodeURIComponent(hrefL)), 'lembrete: mensagem pronta com "amanhã", serviço e número da cliente');
  ok(/ainda não enviado/.test(await cartao.innerText()), 'lembrete: mostra que ainda não foi enviado');
  await cartao.locator('a[data-lembrete]').click();
  ok(await espera(async () => !!(await horario(AMANHA, '23:30')).lembrete_em), 'lembrete: ao tocar, fica registrado no banco');
  ok(await espera(async () => /Lembrete enviado/.test(await P2.locator('#proximos .prox', { hasText: 'Carla' }).innerText())), 'lembrete: o painel mostra "Lembrete enviado"');
  await foto(P2, 'painel-lembretes', false);

  // retornos: marcar pela ficha do atendimento (tela própria), aparecer no Início na data e mandar a mensagem de acompanhamento
  {
    const HOJE = await dia(0);
    const naTela = () => P2.locator('[data-aba="retorno"]:not([hidden])');
    await aba(P2, 'agenda');
    await P2.click(`[data-abrir="${idC}"]`);
    ok(await P2.locator('#sheet [data-a=perg-retorno]').isVisible(), 'retorno: a ficha do atendimento tem "Marcar retorno"');
    await P2.click('#sheet [data-a=perg-retorno]');
    ok(await naTela().isVisible() && await P2.locator('#sheet').isHidden() && /Marcar retorno/.test(await P2.locator('#rtTit').innerText()) && /Carla Dias/.test(await P2.locator('#rtCorpo .r-cab').innerText()), 'retorno: abre numa tela própria, com o nome da cliente');
    await P2.click('[data-rt-dias="30"]');
    const d30 = (await q(`select ($1::date + 30)::text d`, [AMANHA]))[0].d;
    const salvo30 = await P2.inputValue('#rtData');
    ok(new Date(salvo30 + 'T12:00:00Z').getUTCDay() === 6 && Math.abs((new Date(salvo30) - new Date(d30)) / 864e5) <= 3 && /Ajustado para o sábado mais perto/.test(await P2.locator('#rtPrev').innerText()), 'retorno: "30 dias" conta a partir do atendimento e cai no sábado mais perto (a Amanda atende aos sábados)');
    ok(/Como você está desde a última sessão\? Correu tudo bem\?/.test(await P2.inputValue('#rtMsg')) && !(await P2.isChecked('#rtFoto')), 'retorno: auriculoterapia começa com a pergunta geral, sem pedir foto');
    await P2.fill('#rtObs', 'o seu sono');
    ok(/^Oi, Carla! Aqui é a Amanda 💛\n\nComo está o seu sono desde a última sessão\? Correu tudo bem\?\n\nMe conta como você tá se sentindo pra gente acompanhar juntas\.$/.test(await P2.inputValue('#rtMsg')), 'retorno: a mensagem acompanha o que ela escreveu ("Como está o seu sono desde a última sessão?")');
    await P2.check('#rtFoto');
    ok(/me manda uma foto pra gente acompanhar o resultado juntas/.test(await P2.inputValue('#rtMsg')), 'retorno: "Pedir uma foto" entra na mensagem');
    await P2.uncheck('#rtFoto');
    await P2.click('[data-rt-sug="as suas dores"]');
    ok(/Como estão as suas dores desde a última sessão\?/.test(await P2.inputValue('#rtMsg')), 'retorno: as sugestões trocam o assunto, com o verbo certo ("estão as suas dores")');
    await P2.fill('#rtObs', 'o seu sono');
    await foto(P2, 'painel-retorno-marcar');
    await P2.click('[data-rt=salvar]');
    ok(await espera(async () => (await q(`select count(*)::int n from retornos where nome = 'Carla Dias' and data = $1 and obs = 'o seu sono' and mensagem like '%Como está o seu sono desde a última sessão?%' and status = 'pendente'`, [salvo30]))[0].n === 1), 'retorno: fica salvo no banco com a data, o assunto e a mensagem');
    ok(await espera(async () => await P2.locator('[data-aba="agenda"]').isVisible()), 'retorno: depois de salvar, volta para a Agenda');
    await P2.click(`[data-abrir="${idC}"]`);
    ok(await espera(async () => /Retorno/.test(await P2.locator('#sheet .ret-info').innerText().catch(() => ''))), 'retorno: a ficha mostra o retorno marcado');
    await P2.click('#sheet [data-a=fechar]');
    // chega o dia: aparece no Início
    await db.exec(`update retornos set data = '${HOJE}' where nome = 'Carla Dias'`);
    await db.exec(`insert into retornos (profissional, nome, telefone, servico, data, obs) values ('amanda', 'Beatriz Nunes', '11944443333', 'Auriculoterapia', '${await dia(-3)}', 'próxima sessão de auriculo')`);
    await aba(P2, 'inicio');
    await P2.click('#bAtualizar');
    ok(await espera(async () => (await P2.locator('#retornos .ret').count()) === 2), 'retorno: o Início mostra os retornos (de hoje e atrasados)');
    const atras = P2.locator('#retornos .ret.atras');
    ok((await atras.count()) === 1 && /Beatriz/.test(await atras.innerText()) && /Atrasado/.test(await atras.innerText()), 'retorno: o atrasado aparece primeiro e destacado');
    ok((await P2.locator('#retornos .ret').first().innerText()).includes('Beatriz'), 'retorno: atrasados vêm antes');
    ok((await P2.locator('#nRet').innerText()) === '2' && +(await P2.locator('#nPedNav').innerText()) >= 2, 'retorno: o número aparece no título e no botão Início');
    await P2.locator('#blocoRet').scrollIntoViewIfNeeded();
    await foto(P2, 'painel-retornos-lista', false);
    const carla = P2.locator('#retornos .ret', { hasText: 'Carla' });
    ok(/Hoje/.test(await carla.locator('.ret-dt').innerText()) && /Auriculoterapia/.test(await carla.innerText()) && /o seu sono/.test(await carla.locator('.ret-obs').innerText()), 'retorno: a linha mostra nome, procedimento, data e o que acompanhar');
    const hz = decodeURIComponent(await carla.locator('a[data-ret-zap]').getAttribute('href'));
    ok(/wa\.me\/5511977771111/.test(hz) && hz.includes('Oi, Carla! Aqui é a Amanda 💛\n\nComo está o seu sono desde a última sessão? Correu tudo bem?'), 'retorno: o WhatsApp abre com a mensagem que ela deixou pronta');
    const hb = decodeURIComponent(await atras.locator('a[data-ret-zap]').getAttribute('href'));
    ok(/Oi, Beatriz! Aqui é a Amanda 💛\n\nComo você está desde a última sessão\? Correu tudo bem\?/.test(hb) && !/foto/.test(hb), 'retorno: sem mensagem salva, vai a pergunta de acompanhamento (auriculoterapia, sem foto)');
    await carla.locator('a[data-ret-zap]').click();
    ok(await espera(async () => (await q(`select status from retornos where nome = 'Carla Dias'`))[0].status === 'enviada'), 'retorno: depois do clique, fica "mensagem enviada" no banco');
    ok(await espera(async () => /Mensagem enviada/.test(await P2.locator('#retornos .ret', { hasText: 'Carla' }).innerText())), 'retorno: e o painel mostra "Mensagem enviada"');
    await P2.locator('#retornos .ret', { hasText: 'Carla' }).locator('[data-ret=agendou]').click();
    ok(await espera(async () => (await q(`select status from retornos where nome = 'Carla Dias'`))[0].status === 'agendou' && (await P2.locator('#retornos .ret', { hasText: 'Carla' }).count()) === 0), 'retorno: "Agendou" anota e tira da lista');
    await P2.locator('#retornos .ret', { hasText: 'Beatriz' }).locator('[data-ret=adiar]').click();
    await P2.locator('#retornos .ret', { hasText: 'Beatriz' }).scrollIntoViewIfNeeded();
    await foto(P2, 'painel-retorno-adiar', false);
    const sab1 = (await q(`select (d + ((6 - extract(dow from d)::int + 7) % 7 + case when extract(dow from d)::int = 6 then 7 else 0 end))::text s from (select (public.agora_sp())::date d) t`))[0].s;
    const chipSab = P2.locator('#retornos .ret', { hasText: 'Beatriz' }).locator('[data-ret=para]').first();
    ok((await chipSab.getAttribute('data-d')) === sab1 && /^sáb, /.test(await chipSab.innerText()), 'retorno: "Adiar" oferece os próximos sábados (a Amanda atende aos sábados)');
    await chipSab.click();
    ok(await espera(async () => { const r = (await q(`select status, data::text d from retornos where nome = 'Beatriz Nunes'`))[0]; return r.status === 'pendente' && r.d === sab1; }), 'retorno: adiar para o próximo sábado muda a data no banco');
    ok(await espera(async () => !(await P2.locator('#retornos .ret.atras').count()) && /\d\d\/\d\d/.test(await P2.locator('#retornos .ret', { hasText: 'Beatriz' }).locator('.ret-dt').innerText())), 'retorno: adiado, deixa de aparecer como atrasado');
    await foto(P2, 'painel-retornos', false);
    await P2.locator('#retornos .ret', { hasText: 'Beatriz' }).locator('[data-ret=sem_resposta]').click();
    ok(await espera(async () => (await q(`select status from retornos where nome = 'Beatriz Nunes'`))[0].status === 'sem_resposta' && (await P2.locator('#retornos .ret').count()) === 0), 'retorno: "Não respondeu" anota e tira da lista');
    ok(await P2.locator('#blocoRet').isHidden(), 'retorno: sem retornos, o bloco some (nada de frase desanimadora)');
  }

  // retornos pela tela de Clientes: a Amanda escolhe a data de cada cliente e, no dia, manda a mensagem
  {
    const HOJE = await dia(0);
    await db.exec(`alter table horarios disable trigger trg_horario_passado`);
    await db.exec(`insert into horarios (data, hora, status, nome, telefone, servico, pedido_em) values ((public.agora_sp() - interval '20 days')::date, '10:00', 'confirmado', 'Lívia Prado', '11933332222', 'Limpeza de pele', now())`);
    await db.exec(`alter table horarios enable trigger trg_horario_passado`);
    await doMais(P2, 'clientes');
    const livia = () => P2.locator('#cliLista .cli', { hasText: 'Lívia Prado' });
    await P2.waitForSelector('#cliLista .cli:has-text("Lívia Prado")');
    ok(/Marcar retorno/.test(await livia().locator('.cli-acoes').innerText()) && (await livia().locator('.cli-acoes > *').count()) === 3, 'Clientes: cada cartão tem WhatsApp, Marcar retorno e Anotar');
    await livia().locator('[data-acao="cli-ret"]').click();
    await P2.waitForSelector('[data-aba="retorno"]:not([hidden])');
    ok(/Último atendimento/.test(await P2.locator('#rtCorpo .r-cab').innerText()) && await P2.locator('[data-rt-dias="15"]').isDisabled(), 'Clientes › Retorno: conta a partir do último atendimento (o de 15 dias já passou)');
    const m0 = await P2.inputValue('#rtMsg');
    ok(m0 === 'Oi, Lívia! Aqui é a Amanda 💛\n\nComo está a sua pele desde a última sessão? Correu tudo bem?\n\nSe puder, me manda uma foto pra gente acompanhar o resultado juntas.' && await P2.isChecked('#rtFoto'), 'Clientes › Retorno: na limpeza de pele, pergunta da pele e pede uma foto');
    await P2.fill('#rtMsg', m0 + ' 🌸');
    ok(await P2.locator('[data-rt="sugerido"]').isVisible(), 'Clientes › Retorno: dá para mudar o texto (e voltar ao sugerido)');
    await P2.click('[data-rt-dias="45"]');
    await P2.click('[data-rt=salvar]');
    ok(await espera(async () => await P2.locator('[data-aba="clientes"]').isVisible()), 'Clientes › Retorno: salvar volta para Clientes');
    ok(await espera(async () => /Retorno combinado/.test(await livia().innerText()) && /a sua pele/.test(await livia().locator('.cli-ret').innerText())), 'Clientes: o cartão mostra o retorno combinado');
    ok(/Retornos \(1\)/.test(await P2.locator('#cliRet').innerText()), 'Clientes: o filtro "Retornos" mostra quantas são');
    ok(!/Convidar a voltar/.test(await livia().innerText()) && /WhatsApp/.test(await livia().locator('.cli-acoes a.z').innerText()), 'Clientes: com retorno combinado, o botão WhatsApp não oferece outro convite');
    await livia().locator('[data-acao="cli-ret"]').click();
    ok(/Mudar retorno/.test(await P2.locator('#rtTit').innerText()) && (await P2.inputValue('#rtMsg')).endsWith('🌸'), 'Clientes › Retorno: ao mudar, mantém o texto que ela escreveu');
    await P2.click('[data-rt-outra]');
    await P2.fill('#rtData', HOJE);
    await P2.click('[data-rt=salvar]');
    ok(await espera(async () => (await q(`select data::text d from retornos where nome = 'Lívia Prado'`))[0]?.d === HOJE), 'Clientes › Retorno: a data muda no banco (outra data)');
    ok(await espera(async () => (await livia().locator('a[data-ret-zap]').count()) === 1), 'Clientes: no dia, o cartão ganha "Enviar mensagem de retorno"');
    const lz = decodeURIComponent(await livia().locator('a[data-ret-zap]').getAttribute('href'));
    ok(lz.startsWith('https://wa.me/5511933332222?text=') && lz.includes('Como está a sua pele desde a última sessão?') && lz.endsWith('🌸'), 'Clientes: a mensagem vai pronta, com o texto dela');
    await P2.click('[data-cli-f="retornos"]');
    ok((await P2.locator('#cliLista .cli').count()) === 1, 'Clientes: o filtro "Retornos" mostra só quem tem retorno');
    await foto(P2, 'painel-clientes-retorno');
    await livia().locator('a[data-ret-zap]').click();
    ok(await espera(async () => (await q(`select status from retornos where nome = 'Lívia Prado'`))[0].status === 'enviada' && /Mensagem de retorno enviada/.test(await livia().innerText())), 'Clientes: depois de enviar, fica "mensagem enviada"');
    await livia().locator('[data-acao="cli-ret"]').click();
    ok(/Hoje é o dia combinado com a Lívia/.test(await P2.locator('#rtSub').innerText()) && /Chamar de novo/.test(await P2.locator('#rtCorpo').innerText()) && /Como está a sua pele/.test(await P2.locator('#rtBolha').innerText()), 'Clientes › Retorno: no dia, a tela mostra a mensagem e o que fazer');
    await foto(P2, 'painel-retorno-no-dia');
    const vp0 = P2.viewportSize();
    await P2.setViewportSize({ width: 320, height: 640 });
    const largo = await P2.evaluate(() => document.documentElement.scrollWidth > 320);
    await P2.click('[data-rt="editar"]');
    const largo2 = await P2.evaluate(() => document.documentElement.scrollWidth > 320);
    await P2.click('#rtVoltar'); await P2.waitForSelector('[data-aba="clientes"]:not([hidden])');
    const largo3 = await P2.evaluate(() => document.documentElement.scrollWidth > 320);
    ok(!largo && !largo2 && !largo3, 'Retorno e Clientes em 320px: nada passa da tela');
    await P2.setViewportSize(vp0);
    await livia().locator('[data-acao="cli-ret"]').click();
    await P2.click('#rtCorpo [data-ret=agendou]');
    ok(await espera(async () => (await q(`select status from retornos where nome = 'Lívia Prado'`))[0].status === 'agendou' && await P2.locator('[data-aba="clientes"]').isVisible()), 'Clientes › Retorno: "Agendou" anota e volta para Clientes');
    ok(await espera(async () => !(await livia().count()) || !/Retorno combinado/.test(await livia().innerText())), 'Clientes: depois que ela agendou, a faixa do retorno sai do cartão');
    await P2.click('[data-cli-f="todas"]');
    // limpa a cliente de teste (não atrapalha a contagem de "Mais de 10 dias sem vir" mais adiante)
    await db.exec(`delete from retornos where nome = 'Lívia Prado'; delete from horarios where nome = 'Lívia Prado'`);
  }

  // próximos atendimentos: 2 meses, agrupados por semana e por mês
  {
    const D45 = await dia(45), D70 = await dia(70);
    await db.exec(`insert into horarios (data, hora, status, nome, telefone, servico) values ('${D45}', '10:00', 'confirmado', 'Paula Futuro', '11955556666', 'Auriculoterapia'), ('${D70}', '10:00', 'confirmado', 'Rosa Longe', '11955557777', 'Auriculoterapia')`);
    await aba(P2, 'inicio');
    await P2.click('#bAtualizar');
    ok(await espera(async () => /Paula Futuro/.test(await P2.locator('#proximos').innerText())), 'próximos: mostra atendimentos de até 2 meses');
    ok(!/Rosa Longe/.test(await P2.locator('#proximos').innerText()), 'próximos: depois de 2 meses, ainda não aparece');
    const titulos = await P2.locator('#proximos .prox-gt b').allInnerTexts();
    const MES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][+D45.slice(5, 7) - 1];
    ok(/^(ESTA SEMANA|SEMANA QUE VEM)$/i.test(titulos[0]) && titulos.some((t) => t.toLowerCase().startsWith(MES)), 'próximos: agrupados por semana e, mais para frente, por mês (' + titulos.join(' · ') + ')');
    const paula = P2.locator('#proximos .prox', { hasText: 'Paula' });
    ok((await paula.locator('a[data-lembrete]').count()) === 1 && /Mandar lembrete para Paula/.test(await paula.locator('a[data-lembrete]').getAttribute('aria-label')), 'próximos: mesmo longe, cada atendimento tem o botão de lembrete');
    await P2.evaluate(() => { document.getElementById('toast').hidden = true; document.getElementById('proxT').scrollIntoView(); });
    await foto(P2, 'painel-proximos-2-meses', false);
  }

  // sugestões de alterações: a Amanda escreve, anexa uma foto e envia; o Kevin recebe na página dele
  {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    ok(await P2.locator('#blocoSug').isHidden(), 'sugestões: em espera, a área fica escondida');
    await P2.evaluate(() => localStorage.setItem('painel-sugestoes', '1'));
    await P2.reload(); await P2.waitForSelector('#vApp:not([hidden])');
    await P2.waitForSelector('#blocoSug:not([hidden])');
    await P2.click('#bSug');
    ok(await espera(async () => /Escreva sua ideia/.test(await P2.locator('#toast').innerText())), 'sugestões: sem texto, pede para escrever antes de enviar');
    await P2.fill('#sugTxt', 'Queria ver as clientes que fazem aniversário no mês 🎂');
    await P2.setInputFiles('#sugArq', { name: 'ideia.png', mimeType: 'image/png', buffer: PNG });
    await P2.waitForSelector('#sugPrev:not([hidden])');
    ok(true, 'sugestões: a foto escolhida aparece antes de enviar');
    await P2.locator('#blocoSug').scrollIntoViewIfNeeded();
    await foto(P2, 'painel-sugestao', false);
    await P2.click('#bSug');
    ok(await espera(async () => (await q(`select count(*)::int n from sugestoes where texto like 'Queria ver as clientes%' and foto like 'data:image/jpeg;base64,%' and status = 'nova' and profissional = 'amanda'`))[0].n === 1), 'sugestões: fica salva no banco, com a foto (em JPEG leve) e status "nova"');
    ok(await espera(async () => /Sugestão enviada/.test(await P2.locator('#toast').innerText())) && (await P2.inputValue('#sugTxt')) === '' && await P2.locator('#sugPrev').isHidden(), 'sugestões: avisa que foi enviada e limpa o campo');
    ok(await espera(async () => /aniversário/.test(await P2.locator('#sugLista').innerText()) && /Nova/.test(await P2.locator('#sugLista').innerText())), 'sugestões: ela vê a sugestão na lista, com o status');
    const aviso = (await q(`select body from net.enviados order by id desc limit 1`))[0].body;
    ok(/Sugestão nova de Amanda/.test(aviso.title) && /aniversário/.test(aviso.message), 'sugestões: o aviso para o Kevin sai na hora');
    await P2.click('#sugLista [data-sug-foto]');
    ok(await espera(async () => await P2.locator('#envio img.foto-grande').isVisible()), 'sugestões: "Ver foto" abre a foto que ela mandou');
    await P2.click('#envio [data-acao=fecharEnvio]');

    await db.exec(`insert into auth.users (email) values ('kevin@teste.com') on conflict do nothing`);
    const ck = await contexto(IPHONE);
    const K = await ck.newPage();
    await K.goto(BASE + 'admin/sugestoes/');
    await K.fill('#email', 'kevin@teste.com'); await K.fill('#senha', 'certa'); await K.click('#bLogin');
    ok(await espera(async () => /não está configurado/.test(await K.locator('#mLogin').innerText())), 'página do Kevin: antes de configurar o e-mail, ninguém entra');
    await db.exec(`update desenvolvedor set email = 'kevin@teste.com'`);
    await K.fill('#senha', 'certa'); await K.click('#bLogin');
    await K.waitForSelector('#vApp:not([hidden])');
    await K.waitForSelector('#lista .it');
    ok((await K.locator('#resumo .novas b').innerText()) === '1' && /^\(1\) /.test(await K.title()), 'página do Kevin: contador de sugestões novas (também no título da aba)');
    const it = K.locator('#lista .it').first();
    ok(/Amanda/.test(await it.innerText()) && /aniversário/.test(await it.innerText()), 'página do Kevin: mostra quem mandou e o texto');
    await it.locator('[data-foto]').click();
    ok(await espera(async () => await it.locator('img').isVisible()), 'página do Kevin: abre a foto');
    ok(/sugestoes-/.test(await K.locator('#avisos').innerText()), 'página do Kevin: mostra o tópico para receber no celular');
    await foto(K, 'kevin-sugestoes');
    await it.locator('[data-st=feita]').click();
    ok(await espera(async () => (await q(`select status from sugestoes where texto like 'Queria ver as clientes%'`))[0].status === 'feita'), 'página do Kevin: "Feita" muda o status no banco');
    ok(await espera(async () => /Nenhuma sugestão nova/.test(await K.locator('#lista').innerText())), 'página do Kevin: a sugestão sai da lista de novas');
    await K.click('[data-f=feita]');
    ok(/aniversário/.test(await K.locator('#lista').innerText()), 'página do Kevin: aparece em "Feitas"');
    await K.click('#bTeste');
    ok(await espera(async () => /teste enviado/.test(await K.locator('#toast').innerText())) && (await q(`select body from net.enviados order by id desc limit 1`))[0].body.email === 'kevin@teste.com', 'página do Kevin: o aviso de teste vai para o e-mail configurado');
    await ck.close();
    await P2.reload(); await P2.waitForSelector('#vApp:not([hidden])');
    ok(await espera(async () => /Feita ✓/.test(await P2.locator('#sugLista').innerText())), 'sugestões: a Amanda vê que a ideia dela foi feita');
    // aniversário: a data fica no banco; no dia, a saudação é dela
    await db.exec(`update profissionais set aniversario = to_char(public.agora_sp(), 'MM-DD') where id = 'amanda'`);
    await P2.reload(); await P2.waitForSelector('#ola:not([hidden])');
    ok(/Feliz aniversário, Amanda! 🎂/.test(await P2.locator('#olaT').innerText()), 'aniversário: no dia, a saudação é de parabéns');
    await db.exec(`update profissionais set aniversario = '07-31' where id = 'amanda'`);
  }

  // editar dados
  await aba(P2, 'agenda');
  await P2.click(`[data-abrir="${await idDe(D20, '10:00')}"]`);
  await P2.click('#sheet [data-a=perg-editar]');
  ok((await P2.inputValue('#fNome')) === 'Beatriz Nunes' && (await P2.inputValue('#fTel')) === '(11) 94444-3333', 'editar: o formulário vem preenchido com os dados da cliente');
  await P2.fill('#fTel', '11 95555-0000'); await P2.selectOption('#fServ', 'Limpeza de pele');
  await P2.click('#sheet [data-a=editar]');
  ok(await espera(async () => { const r = await horario(D20, '10:00'); return r.telefone === '11955550000' && r.servico === 'Limpeza de pele'; }), 'editar: telefone e serviço atualizados no banco');
  await P2.click(`[data-abrir="${await idDe(D20, '10:00')}"]`); await P2.click('#sheet [data-a=perg-editar]');
  await P2.fill('#fTel', '123'); await P2.click('#sheet [data-a=editar]');
  await P2.waitForFunction(() => /Confira o WhatsApp/.test(document.getElementById('toast').innerText));
  ok((await horario(D20, '10:00')).telefone === '11955550000', 'editar: telefone inválido não é salvo');
  await P2.click('#sheet [data-a=voltar]'); await P2.click('#sheet [data-a=fechar]');

  // remarcar
  await P2.click(`[data-abrir="${await idDe(D20, '10:00')}"]`);
  await P2.click('#sheet [data-a=perg-remarcar]');
  ok(await P2.locator('#sheet [data-a=remarcar]').isDisabled(), 'remarcar: o botão só libera depois de escolher o novo horário');
  await P2.click(`#sheet [data-destino="${await idDe(D21, '10:00')}"]`);
  await P2.click('#sheet [data-a=remarcar]');
  ok(await espera(async () => (await horario(D21, '10:00')).nome === 'Beatriz Nunes' && (await horario(D20, '10:00')).status === 'livre'), 'remarcar: a cliente vai para o novo horário e o antigo fica livre');
  await P2.waitForFunction(() => /Remarcado/.test(document.getElementById('toast').innerText));
  ok(/mudou para/.test(decodeURIComponent(await P2.locator('#toast a.btn').getAttribute('href'))), 'remarcar: aviso traz a mensagem da nova data para a cliente');

  // mudar dia ou horário de um horário livre
  await P2.click(`[data-abrir="${await idDe(D20, '12:00')}"]`);
  await P2.click('#sheet [data-a=perg-mover]');
  await P2.fill('#fHora', '12:30'); await P2.click('#sheet [data-a=mover]');
  ok(await espera(async () => !!(await horario(D20, '12:30'))), 'mudar: horário livre passa de 12h para 12h30');
  await P2.waitForSelector(`[data-abrir="${await idDe(D20, '12:30')}"]`);
  await P2.click(`[data-abrir="${await idDe(D20, '12:30')}"]`);
  await P2.click('#sheet [data-a=perg-mover]');
  await P2.fill('#fHora', '11:00'); await P2.click('#sheet [data-a=mover]');
  await P2.waitForFunction(() => /já existe um horário/.test(document.getElementById('toast').innerText));
  ok(!!(await horario(D20, '12:30')), 'mudar: para um horário que já existe é recusado com explicação');
  await P2.click('#sheet [data-a=voltar]', { timeout: 1500 }).catch(() => {}); await P2.click('#sheet [data-a=fechar]', { timeout: 1500 }).catch(() => {});

  // marcar como ocupado com telefone e serviço
  await P2.click(`[data-abrir="${await idDe(D20, '13:00')}"]`);
  await P2.click('#sheet [data-a=perg-ocupar]');
  await P2.fill('#fNome', 'Dona Lurdes'); await P2.fill('#fTel', '(11) 93333-2222'); await P2.selectOption('#fServ', 'Auriculoterapia');
  await P2.click('#sheet [data-a=ocupar]');
  ok(await espera(async () => { const r = await horario(D20, '13:00'); return r.status === 'confirmado' && r.telefone === '11933332222' && r.servico === 'Auriculoterapia'; }), 'marcar por fora: guarda nome, telefone e serviço');

  // cancelar e apagar
  await P2.waitForSelector(`[data-abrir="${await idDe(D20, '13:00')}"]`);
  await P2.click(`[data-abrir="${await idDe(D20, '13:00')}"]`);
  await P2.click('#sheet [data-a=perg-excluir]');
  ok(await P2.locator('#sheet .pergunta').isVisible(), 'apagar: pede confirmação antes');
  await P2.click('#sheet [data-a=excluir]');
  ok(await espera(async () => !(await horario(D20, '13:00'))), 'apagar: o horário com cliente é cancelado e some da agenda');
  ok((await q(`select count(*)::int n from historico where hora = '13:00' and data = $1 and para = 'removido' and nome = 'Dona Lurdes'`, [D20]))[0].n === 1, 'apagar: fica registrado no histórico com o nome da cliente');

  // opções do dia
  await P2.click(`[data-acao=dia][data-dia="${D20}"]`);
  await P2.fill('#dHora', '15:45'); await P2.click('[data-acao=dia-add]');
  ok(await espera(async () => !!(await horario(D20, '15:45'))), 'dia: adicionar um horário avulso (15h45)');
  await P2.waitForSelector(`[data-acao=dia][data-dia="${D21}"]`);
  await P2.click(`[data-acao=dia][data-dia="${D20}"]`);
  await P2.click('[data-acao=dia-limpar-perg]');
  ok(/Os horários com cliente continuam/.test(await P2.locator('#envio .pergunta').innerText()), 'dia: remover livres pede confirmação e avisa que clientes ficam');
  await P2.click('[data-acao=dia-limpar]');
  ok(await espera(async () => (await q(`select count(*)::int n from horarios where data = $1 and status = 'livre'`, [D20]))[0].n === 0), 'dia: todos os horários livres do dia foram removidos');
  ok((await horario(D21, '10:00')).nome === 'Beatriz Nunes', 'dia: horários com cliente de outros dias continuam intactos');

  // serviços
  await doMais(P2, 'servicos');
  await P2.waitForSelector('#servicos .serv');
  ok((await P2.locator('#servicos .serv').count()) === 2, 'serviços: o painel mostra os 2 serviços do banco');
  await P2.click('#bNovoServ');
  await P2.fill('#sNome', 'Massagem relaxante'); await P2.fill('#sDet', 'Alívio de tensão');
  await P2.click('[data-acao=serv-salvar]');
  ok(await espera(async () => (await q(`select count(*)::int n from servicos where nome = 'Massagem relaxante'`))[0].n === 1), 'serviços: adicionar um novo serviço');
  const site1 = await (await contexto(ANDROID)).newPage();
  await site1.goto(BASE); await site1.waitForSelector('#o-servico .opt');
  ok((await site1.locator('#o-servico .opt', { hasText: 'Massagem relaxante' }).count()) === 1, 'serviços: o novo serviço aparece no site para as clientes');
  const idMass = (await q(`select id from servicos where nome = 'Massagem relaxante'`))[0].id;
  ok(idMass === 'massagem-relaxante', 'serviços: o código é criado a partir do nome (' + idMass + ')');
  await P2.waitForSelector(`[data-acao=serv-editar][data-serv="${idMass}"]`);
  await P2.click(`[data-acao=serv-editar][data-serv="${idMass}"]`);
  await P2.uncheck('#sAtivo'); await P2.click('[data-acao=serv-salvar]');
  ok(await espera(async () => (await q(`select ativo from servicos where id = $1`, [idMass]))[0].ativo === false), 'serviços: esconder do site');
  await site1.reload(); await site1.waitForSelector('#o-servico .opt');
  ok((await site1.locator('#o-servico .opt', { hasText: 'Massagem' }).count()) === 0, 'serviços: escondido some do site');
  await P2.waitForSelector(`#servicos .serv:has-text("Escondido do site")`);
  await P2.click(`[data-acao=serv-editar][data-serv="${idMass}"]`);
  await P2.click('[data-acao=serv-remover-perg]'); await P2.click('[data-acao=serv-remover]');
  ok(await espera(async () => (await q(`select count(*)::int n from servicos where id = $1`, [idMass]))[0].n === 0), 'serviços: remover');

  // preço, preço antes (riscado), observação, texto do site e 3 benefícios
  await P2.waitForSelector('[data-acao=serv-editar][data-serv="limpeza"]');
  await P2.click('[data-acao=serv-editar][data-serv="limpeza"]');
  ok((await P2.inputValue('#sPreco')) === '75' && (await P2.inputValue('#sPObs')) === 'valor de inauguração' && (await P2.inputValue('#sBen0')) === 'Menos cravos', 'serviços: preço, observação e benefícios vêm preenchidos');
  ok(await P2.locator('#sDesdeBox').isVisible() === true && (await P2.isChecked('#sTemDesde')), 'serviços: com data de estreia, a caixinha "Só a partir de uma data" vem marcada');
  await P2.fill('#sPreco', 'abc'); await P2.click('[data-acao=serv-salvar]');
  await P2.waitForFunction(() => /Confira o preço/.test(document.getElementById('toast').innerText));
  ok(true, 'serviços: preço inválido é recusado com explicação');
  await P2.fill('#sPreco', '80'); await P2.fill('#sAntes', '70'); await P2.click('[data-acao=serv-salvar]');
  await P2.waitForFunction(() => /precisa ser maior/.test(document.getElementById('toast').innerText));
  ok(true, 'serviços: preço "antes" menor que o atual é recusado');
  await P2.fill('#sAntes', '100'); await P2.fill('#sPObs', 'por sessão');
  await P2.fill('#sDesc', 'Limpeza profunda com extração e máscara calmante.');
  await P2.fill('#sBen0', 'Poros limpos'); await P2.fill('#sBen1', 'Pele macia'); await P2.fill('#sBen2', '');
  await P2.click('[data-acao=serv-salvar]');
  await P2.waitForFunction(() => /Serviço atualizado/.test(document.getElementById('toast').innerText));
  const lp = (await q(`select preco, preco_antes, preco_obs, descricao, beneficios from servicos where id = 'limpeza'`))[0];
  ok(lp.preco == 80 && lp.preco_antes == 100 && lp.preco_obs === 'por sessão' && lp.beneficios.join() === 'Poros limpos,Pele macia' && /extração/.test(lp.descricao), 'serviços: preço, texto e benefícios salvos no banco (benefício vazio é ignorado)');
  ok(await espera(async () => { const t = await P2.locator('#servicos .serv', { hasText: 'Limpeza de pele' }).innerText(); return /R\$ 100/.test(t) && /✓ Poros limpos/.test(t); }), 'serviços: a lista mostra preço e benefícios');
  // o site mostra na hora
  const site2 = await (await contexto(ANDROID)).newPage();
  await site2.goto(BASE); await site2.waitForSelector('#svcs .svc');
  const card = site2.locator('#svcs .svc', { hasText: 'Limpeza de pele' });
  ok(/R\$ 80/.test(await card.innerText()) && (await card.locator('.preco-svc s').innerText()) === 'R$ 100' && /extração/.test(await card.innerText()) && (await card.locator('li').allInnerTexts()).join() === 'Poros limpos,Pele macia', 'site: o cartão da limpeza mostra o preço riscado, o texto e os benefícios do painel');
  ok(/Dores, ansiedade e sono|Alívio de dores/.test(await site2.locator('#svcs .svc', { hasText: 'Auriculoterapia' }).innerText()), 'site: o cartão da auriculoterapia fala de dores');
  ok(/Limpeza de pele.*R\$ 80, por sessão/.test(await site2.locator('#novo').innerText()), 'site: a faixa de novidade usa o preço do painel (' + (await site2.locator('#novo').innerText()).replace(/\s+/g, ' ') + ')');
  // o preço nunca quebra em duas linhas ("R$" em cima e o valor embaixo), em nenhuma largura de celular
  for (const largura of [320, 360, 390, 430]) {
    await site2.setViewportSize({ width: largura, height: 800 });
    await site2.waitForTimeout(150);
    const quebrados = await site2.evaluate(() => [...document.querySelectorAll('.preco-svc b, #novo b')].filter((e) => /R\$/.test(e.textContent)).map((e) => {
      const r = document.createRange(); r.selectNodeContents(e);
      const c = [...r.getClientRects()].filter((q) => q.width > 0).map((q) => (q.top + q.bottom) / 2).sort((x, y) => x - y);
      let linhas = 0, ult = -1e9; for (const y of c) { if (y - ult > 7) linhas++; ult = y; }
      return linhas > 1 ? e.textContent.trim() : null;
    }).filter(Boolean));
    const fora = await site2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    ok(!quebrados.length && !fora, `site em ${largura}px: preços numa linha só e sem rolagem para o lado` + (quebrados.length ? ' (quebrou: ' + quebrados.join(' | ') + ')' : ''));
  }
  await card.locator('a.ir').click();
  ok((await site2.locator('#o-servico .opt[aria-pressed=true]').innerText()).includes('Limpeza de pele') && /R\$ 80/.test(await site2.locator('#o-servico .opt[aria-pressed=true]').innerText()), 'site: "Agendar limpeza de pele" já escolhe o serviço, com o preço');
  ok(/Seu nome e WhatsApp ficam só com a Amanda/.test(await site2.locator('#agendar').innerText()), 'site: aviso de privacidade junto do agendamento');
  // a data de estreia some ao desmarcar a caixinha
  await P2.click('[data-acao=serv-editar][data-serv="limpeza"]');
  await P2.uncheck('#sTemDesde');
  ok(await P2.locator('#sDesdeBox').isHidden(), 'serviços: desmarcar "Só a partir de uma data" esconde a data');
  await P2.click('[data-acao=serv-salvar]');
  ok(await espera(async () => (await q(`select desde from servicos where id = 'limpeza'`))[0].desde === null), 'serviços: e o serviço passa a poder ser marcado desde já');
  // logo depois de salvar, a lista já mostra o que foi salvo (sem esperar recarregar)
  ok(await espera(async () => !/A partir de/.test(await P2.locator('#servicos .card', { has: P2.locator('[data-serv="limpeza"]') }).innerText())), 'serviços: a lista mostra a mudança assim que salva');
  await P2.click('[data-acao=serv-editar][data-serv="limpeza"]');
  await P2.check('#sTemDesde'); await P2.click('[data-acao=serv-salvar]');
  await P2.waitForFunction(() => /Escolha a partir de qual dia/.test(document.getElementById('toast').innerText));
  ok(true, 'serviços: marcar a caixinha sem escolher a data pede a data');
  await P2.fill('#sDesde', D5); await P2.click('[data-acao=serv-salvar]');
  ok(await espera(async () => (await q(`select desde::text d from servicos where id = 'limpeza'`))[0].d === D5), 'serviços: data de estreia salva de novo');
  await db.exec(`update servicos set preco = 75, preco_antes = null, preco_obs = 'valor de inauguração' where id = 'limpeza'`);
  // uma atualização lenta que chega depois de ela salvar não pode desfazer a mudança na tela
  {
    const antes = (await q(`select detalhe from servicos where id = 'limpeza'`))[0].detalhe;
    let segurar = true, pegou = false;
    const daLista = (u) => u.pathname.endsWith('/rest/v1/servicos') && u.searchParams.get('select') === '*';
    await P2.route(daLista, async (r) => {
      if (r.request().method() !== 'GET' || !segurar) return api.tratar(r);
      segurar = false; // a resposta sai do banco agora (antes de salvar) e só chega 1,5 s depois
      let resposta;
      await api.tratar({ request: () => r.request(), fulfill: async (o) => { resposta = o; } });
      pegou = true;
      await new Promise((ok2) => setTimeout(ok2, 1500));
      return r.fulfill(resposta);
    });
    await P2.evaluate(() => document.getElementById('bAtualizar').click());
    await espera(async () => pegou);
    await P2.click('#servicos [data-acao=serv-editar][data-serv="limpeza"]');
    await P2.fill('#sDet', 'Pele leve e iluminada');
    await P2.click('[data-acao=serv-salvar]');
    await espera(async () => (await q(`select detalhe from servicos where id = 'limpeza'`))[0].detalhe === 'Pele leve e iluminada');
    await P2.waitForTimeout(2000);
    ok(/Pele leve e iluminada/.test(await P2.locator('#servicos .card', { has: P2.locator('[data-serv="limpeza"]') }).innerText()), 'serviços: uma atualização lenta que chega depois de salvar não desfaz a mudança na tela');
    await P2.unroute(daLista);
    await q(`update servicos set detalhe = $1 where id = 'limpeza'`, [antes]);
  }
  await foto(P2, 'painel-autonomia');
  // a assinatura fica acima da barra de abas, sem nada por cima (fechando o aviso passageiro)
  if (await P2.locator('#toast').isVisible()) await P2.click('#toast [data-fechar]');
  await P2.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await P2.waitForTimeout(200);
  const ass = await P2.evaluate(() => { const e = document.querySelector('.credito'), rg = document.createRange(); rg.selectNodeContents(e); const r = rg.getBoundingClientRect(), n = document.querySelector('.abas').getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: r.bottom <= n.top && (t === e || e.contains(t)), info: JSON.stringify({ top: r.top, bottom: r.bottom, nav: n.top, h: innerHeight, y: scrollY, sh: document.documentElement.scrollHeight, bh: document.body.offsetHeight, por: t && (t.id || t.className || t.tagName) }) }; });
  ok(ass.ok, 'painel logado: assinatura visível acima da barra de abas' + (ass.ok ? '' : ' ' + ass.info));
  await c.close();
}

// ===== 4b. Página de diagnóstico =====
{
  const rotulos = async (p) => p.locator('#lista .item').evaluateAll((els) => els.map((e) => ({ ok: e.classList.contains('ok'), t: e.querySelector('.t').textContent, d: e.querySelector('.d').textContent })));
  const c = await contexto(IPHONE);
  const p = await c.newPage();
  await p.goto(BASE + 'admin/diagnostico.html');
  await p.waitForSelector('#fim:not([hidden])');
  const itens = await rotulos(p);
  ok(itens.length === 6 && itens.every((i) => i.ok), 'diagnóstico: os 6 itens públicos passam com o banco correto');
  ok(/Tudo certo/.test(await p.locator('#fim').innerText()), 'diagnóstico: mostra "Tudo certo até aqui"');
  await p.fill('#email', EMAIL_ADMIN); await p.fill('#senha', 'certa'); await p.click('#bt');
  await p.waitForFunction(() => document.querySelectorAll('#lista .item').length === 10 && [...document.querySelectorAll('#lista .item')].every((e) => !e.classList.contains('esp')));
  const todos = await rotulos(p);
  ok(todos.length === 10 && todos.every((i) => i.ok), 'diagnóstico: com o login da Amanda, os 10 itens passam');
  ok(/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(todos[todos.length - 1].d), 'diagnóstico: mostra o relógio de Brasília (' + todos[todos.length - 1].d + ')');
  await p.fill('#email', 'outra@pessoa.com'); await p.click('#bt');
  await p.waitForFunction(() => document.querySelectorAll('#lista .item').length === 10 && [...document.querySelectorAll('#lista .item')].every((e) => !e.classList.contains('esp')));
  const outra = await rotulos(p);
  ok(outra.find((i) => /tem acesso/.test(i.t)).ok === false && /insert into public\.admins/.test(outra.find((i) => /tem acesso/.test(i.t)).d), 'diagnóstico: e-mail que não é admin é apontado, com o comando para corrigir');
  await p.close(); await c.close();

  // cadastro aberto deve ser apontado
  const api2 = criarApi({ ...banco, opcoes: { cadastroAberto: true } });
  const c2 = await navegador.newContext({ ...IPHONE });
  await c2.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.SUPABASE={url:${JSON.stringify(SUPABASE_URL)},anonKey:${JSON.stringify(ANON_KEY)}};` }));
  await c2.route(SUPABASE_URL + '/**', api2.tratar);
  const p2 = await c2.newPage();
  await p2.goto(BASE + 'admin/diagnostico.html'); await p2.waitForSelector('#fim:not([hidden])');
  const aberto = (await rotulos(p2)).find((i) => /Cadastro aberto/.test(i.t));
  ok(aberto.ok === false && /Allow new users/.test(aberto.d), 'diagnóstico: cadastro aberto no Supabase é apontado');
  await c2.close();

  // sem configuração
  const c3 = await contexto(IPHONE, { ligado: false });
  const p3 = await c3.newPage();
  await p3.goto(BASE + 'admin/diagnostico.html'); await p3.waitForSelector('#fim:not([hidden])');
  ok((await rotulos(p3))[0].ok === false && /config\.js/.test((await rotulos(p3))[0].d), 'diagnóstico: config.js vazio é apontado');
  await c3.close();
}

// ===== 4h. Duração dos procedimentos =====
{
  const D25 = await dia(25);
  await db.exec(`insert into horarios (data, hora) select '${D25}'::date, h from unnest(array['11:00','12:00','13:00','14:00','14:30','16:00']) h`);
  const idD = async (h) => (await horario(D25, h)).id;
  const id13 = await idD('13:00');
  await api.como('anon', null, () => dbBruto.query(`select public.pedir_horario($1, 'Limpeza de pele', 'Lara Limpeza', '11930001111')`, [id13]));
  // site: só aparecem os horários em que o procedimento cabe
  const cs = await contexto(ANDROID);
  const S = await cs.newPage();
  await S.goto(BASE); await S.waitForSelector('#o-dia .opt');
  const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const rotDia = `${D25.slice(8)} ${MES[+D25.slice(5, 7) - 1]}`;
  const hora = (h) => S.locator(`#o-hora .opt:has(.a:text-is("${h}"))`);
  await S.click('#o-servico .opt:has-text("Auriculoterapia")'); await S.click(`#o-dia .opt:has-text("${rotDia}")`);
  ok(await hora('14h').isDisabled() && !(await hora('14h30').isDisabled()) && !(await hora('12h').isDisabled()), 'site: com a limpeza das 13h (1h30), a auriculoterapia das 14h fica bloqueada e a das 14h30 liberada');
  await S.click('#o-servico .opt:has-text("Limpeza de pele")'); await S.click(`#o-dia .opt:has-text("${rotDia}")`);
  ok(await hora('12h').isDisabled() && !(await hora('11h').isDisabled()), 'site: limpeza às 12h fica bloqueada (terminaria em cima da das 13h); às 11h pode');
  // tela desatualizada: alguém marca às 15h antes; a limpeza das 14h30 passa a não caber
  await S.click(`#o-hora .opt:has(.a:text-is("14h30"))`);
  await S.fill('#nome', 'Mara Atrasada'); await S.fill('#tel', '11930002222');
  await db.exec(`insert into horarios (data, hora, status, nome, telefone, servico, pedido_em) values ('${D25}', '15:00', 'confirmado', 'Dona Quinze', '11930003333', 'Auriculoterapia', now())`);
  await S.click('#go');
  await S.waitForFunction(() => /ficou apertado/.test(document.getElementById('resumo').innerText));
  ok((await horario(D25, '14:30')).status === 'livre', 'site: com a tela velha, o banco recusa o horário colado e a cliente é avisada para escolher outro');
  ok(await hora('14h30').isDisabled(), 'site: depois do aviso, o 14h30 aparece bloqueado para limpeza');
  await cs.close();

  // painel: horário bloqueado e aviso antes de marcar colado
  const c = await contexto(IPHONE);
  const M = await c.newPage();
  await M.goto(BASE + 'admin/'); await M.fill('#email', EMAIL_ADMIN); await M.fill('#senha', 'certa'); await M.click('#bLogin');
  await M.waitForSelector('#vApp:not([hidden])');
  await aba(M, 'agenda');
  const chip14 = M.locator(`#agenda [data-abrir="${await idD('14:00')}"]`);
  ok(/bloqueado/.test(await chip14.innerText()), 'painel: o 14h aparece como "bloqueado" (fica dentro da limpeza das 13h)');
  if (CAPTURAS) await M.locator(`#agenda .dia:has([data-abrir="${await idD('14:00')}"])`).screenshot({ path: path.join(CAPTURAS, 'painel-bloqueado.png') });
  await chip14.click();
  ok(/dentro do atendimento de Lara às 13h \(Limpeza de pele, 1h30\)/.test(await M.locator('#sheet').innerText()), 'painel: explica por que as clientes não conseguem marcar o 14h');
  await M.click('#sheet [data-a=perg-ocupar]');
  await M.fill('#fNome', 'Encaixe Teste'); await M.selectOption('#fServ', 'Auriculoterapia');
  await M.click('#sheet [data-a=ocupar]');
  ok(await M.locator('#avisoConflito').isVisible() && /vai encostar no atendimento de Lara às 13h/.test(await M.locator('#avisoConflito').innerText()), 'painel: ao marcar colado, aparece o aviso');
  ok((await horario(D25, '14:00')).status === 'livre' && (await M.locator('#sheet [data-a=ocupar]').innerText()) === 'Marcar mesmo assim', 'painel: nada é gravado até ela tocar em "Marcar mesmo assim"');
  if (CAPTURAS) await M.locator('#sheet').screenshot({ path: path.join(CAPTURAS, 'painel-aviso-colado.png') });
  await M.click('#sheet [data-a=ocupar]');
  await M.waitForFunction(() => /marcado como ocupado/.test(document.getElementById('toast').innerText));
  ok((await horario(D25, '14:00')).nome === 'Encaixe Teste', 'painel: ela decide e consegue encaixar mesmo assim');
  // serviços: duração editável
  await doMais(M, 'servicos');
  ok(/Leva 1h30/.test(await M.locator('#servicos .serv', { hasText: 'Limpeza de pele' }).innerText()), 'serviços: mostra quanto tempo cada procedimento leva');
  await M.click('[data-acao=serv-editar][data-serv="limpeza"]');
  ok((await M.inputValue('#sDur')) === '90', 'serviços: a duração vem preenchida (1h30)');
  await M.selectOption('#sDur', '120'); await M.click('[data-acao=serv-salvar]');
  await M.waitForFunction(() => /Serviço atualizado/.test(document.getElementById('toast').innerText));
  ok((await q(`select duracao from servicos where id = 'limpeza'`))[0].duracao === 120, 'serviços: a Amanda muda a duração da limpeza para 2h');
  await db.exec(`update servicos set duracao = 90 where id = 'limpeza'`);
  // resumo das 6h: botão de teste
  await doMais(M, 'seguranca');
  ok(/Todo dia às 6h/.test(await M.locator('#gNtfy').innerText()), 'segurança: explica o resumo das 6h');
  await M.click('[data-acao=resumo-agora]');
  await M.waitForFunction(() => /(Resumo de hoje enviado|não há agendamentos)/.test(document.getElementById('toast').innerText));
  ok(true, 'segurança: "Mandar o resumo de hoje agora" responde');
  await c.close();
}

// ===== 4f. Painel com o banco ainda na versão antiga (sem a atualização): nada pode dar erro =====
{
  const velho = await criarBanco({ schema: path.join(RAIZ, 'tests/fixtures/schema-antes-da-atualizacao-2.sql') });
  const apiVelha = criarApi(velho);
  const qv = async (sql, p) => (await apiVelha.sql(sql, p)).rows;
  const DV = (await qv(`select (public.agora_sp() + interval '3 days')::date::text d`))[0].d;
  await velho.db.exec(`insert into horarios (data, hora) select '${DV}'::date, h from unnest(array['10:00','11:00','12:00','13:00','14:00']) h`);
  const idV = async (h) => (await qv(`select id from horarios where data = $1 and hora = $2`, [DV, h]))[0].id;
  for (const [h, nome, tel] of [['10:00', 'Xuxu Teste', '11911110001'], ['11:00', 'Ana Velha', '11911110002'], ['12:00', 'Bia Velha', '11911110003']]) { const id = await idV(h); await velho.como('anon', null, () => velho.db.query(`select public.pedir_horario($1, 'Auriculoterapia', $2, $3)`, [id, nome, tel])); }
  const c = await contexto(IPHONE, { apiDoBanco: apiVelha });
  const V = await c.newPage();
  const errosV = [];
  V.on('console', (m) => { if (m.type() === 'error') errosV.push(m.text()); });
  await V.goto(BASE + 'admin/');
  await V.fill('#email', EMAIL_ADMIN); await V.fill('#senha', 'certa'); await V.click('#bLogin');
  await V.waitForSelector('#pedidos .ped');
  ok(await V.locator('#bancoVelho').isVisible(), 'banco antigo: o aviso de atualização aparece');
  const semErro = async (rotulo) => { const t = V.locator('#toast'); const erro = (await t.isVisible()) && (await t.getAttribute('class')).includes('erro'); ok(!erro, 'banco antigo: ' + rotulo + ' sem erro' + (erro ? ' (' + (await t.innerText()) + ')' : '')); };
  // confirmar e depois cancelar e apagar (o caso da Xuxu)
  await V.locator('#pedidos .ped', { hasText: 'Xuxu' }).locator('[data-a=confirmar]').click();
  await V.waitForFunction(() => /Confirmado/.test(document.getElementById('toast').innerText)); await semErro('confirmar');
  await aba(V, 'agenda');
  await V.click(`#agenda [data-abrir="${await idV('10:00')}"]`);
  await V.click('#sheet [data-a=perg-excluir]'); await V.click('#sheet [data-a=excluir]');
  await V.waitForFunction(() => !document.getElementById('toast').hidden);
  await semErro('cancelar e apagar o horário da Xuxu');
  ok((await qv(`select count(*)::int n from horarios where nome = 'Xuxu Teste'`))[0].n === 0, 'banco antigo: o horário da Xuxu foi apagado de verdade');
  // recusar, cancelar e liberar, marcar por fora, editar, mudar horário, abrir horários
  await aba(V, 'inicio');
  await V.locator('#pedidos .ped', { hasText: 'Ana Velha' }).locator('[data-a=perg-recusar]').click(); await V.click('#sheet [data-a=recusar]');
  await V.waitForFunction(() => !document.getElementById('toast').hidden); await semErro('recusar');
  ok((await qv(`select status from horarios where id = $1`, [await idV('11:00')]))[0].status === 'livre', 'banco antigo: recusar libera o horário');
  await V.locator('#pedidos .ped', { hasText: 'Bia Velha' }).locator('[data-a=confirmar]').click();
  await V.waitForFunction(() => /Confirmado/.test(document.getElementById('toast').innerText));
  await V.click('#toast [data-fechar]');
  await aba(V, 'agenda');
  await V.click(`#agenda [data-abrir="${await idV('12:00')}"]`);
  ok(await V.locator('#sheet [data-a=perg-remarcar]').count() === 0, 'banco antigo: o botão Remarcar fica escondido até atualizar');
  await V.click('#sheet [data-a=perg-cancelar]'); await V.click('#sheet [data-a=cancelar]');
  await V.waitForFunction(() => !document.getElementById('toast').hidden); await semErro('cancelar e liberar');
  await V.click('#toast [data-fechar]');
  await V.click(`#agenda [data-abrir="${await idV('13:00')}"]`);
  await V.click('#sheet [data-a=perg-ocupar]'); await V.fill('#fNome', 'Dona Antiga'); await V.click('#sheet [data-a=ocupar]');
  await V.waitForFunction(() => /marcado como ocupado/.test(document.getElementById('toast').innerText)); await semErro('marcar como ocupado');
  await V.click(`#agenda [data-abrir="${await idV('13:00')}"]`);
  await V.click('#sheet [data-a=perg-editar]'); await V.fill('#fTel', '11922223333'); await V.click('#sheet [data-a=editar]');
  await V.waitForFunction(() => /atualizados/.test(document.getElementById('toast').innerText)); await semErro('editar dados');
  await V.click(`#agenda [data-abrir="${await idV('14:00')}"]`);
  await V.click('#sheet [data-a=perg-mover]'); await V.fill('#fHora', '14:30'); await V.click('#sheet [data-a=mover]');
  await V.waitForFunction(() => /Horário mudado/.test(document.getElementById('toast').innerText)); await semErro('mudar horário');
  await formAbrir(V); await V.fill('#novaData', await dia(16)); await V.click('#bAbrir');
  await V.waitForFunction(() => /horários abertos/.test(document.getElementById('toast').innerText)); await semErro('abrir horários');
  await doMais(V, 'historico'); await V.waitForSelector('#hLista .hrow');
  ok((await V.locator('#hLista .hrow').count()) > 3, 'banco antigo: o histórico também funciona');
  await doMais(V, 'seguranca');
  ok(/atualização do banco/.test(await V.locator('#gStatus').innerText()), 'banco antigo: Segurança explica que falta a atualização');
  ok(await V.locator('#numeros').isHidden(), 'banco antigo: o cartão de números não aparece no Início');
  await doMais(V, 'numeros');
  await V.waitForFunction(() => /falta rodar a atualização/.test(document.getElementById('numDet').innerText));
  ok(true, 'banco antigo: Seus números explica que falta a atualização');
  ok(errosV.filter((t) => !/Failed to load resource/.test(t)).length === 0, 'banco antigo: nenhum erro no console' + (errosV.filter((t) => !/Failed to load resource/.test(t)).length ? ' (' + errosV.join(' | ') + ')' : ''));
  await c.close();
}

// ===== 4e. Mais: Histórico, Segurança (guardião) e Minha conta =====
{
  const entrar = async (c, senha = 'certa') => { const p = await c.newPage(); await p.goto(BASE + 'admin/'); await p.fill('#email', EMAIL_ADMIN); await p.fill('#senha', senha); await p.click('#bLogin'); await p.waitForSelector('#vApp:not([hidden])'); await p.waitForFunction(() => !document.getElementById('mSeg').hidden); return p; };
  const c = await contexto(IPHONE);
  const M = await entrar(c);
  ok((await M.locator('#selo').count()) === 0 && /Tudo normal|novo/.test(await M.locator('#mSeg').textContent()), 'o topo fica limpo (sem selo); a situação do guardião fica em Mais › Segurança');
  ok(await M.locator('#bancoVelho').isHidden(), 'com o banco atualizado, não aparece aviso de atualização');
  await aba(M, 'mais');
  ok((await M.locator('[data-aba="mais"] .lista [data-ir]:visible').count()) === 8, 'Mais tem 8 páginas: Seus números, Clientes, Serviços, Profissionais (para sócias), Histórico, Segurança, Como funciona e Minha conta');
  ok(await M.locator('#nMais').isVisible(), 'o botão Mais avisa que há alertas novos (logins de outros aparelhos nos testes)');

  // clientes
  await doMais(M, 'clientes');
  await M.waitForSelector('#cliLista .cli');
  const bea = M.locator('#cliLista .cli', { hasText: 'Beatriz Nunes' });
  ok((await bea.count()) === 1 && /\(11\) 95555-0000/.test(await bea.innerText()) && /próximo/.test(await bea.innerText()), 'Clientes: ficha com WhatsApp e próximo horário');
  ok((await bea.locator('.cli-acoes a.z').getAttribute('href')).startsWith('https://wa.me/5511955550000'), 'Clientes: botão abre o WhatsApp da cliente');
  await M.fill('#cliBusca', 'beat');
  ok((await M.locator('#cliLista .cli').count()) === 1, 'Clientes: busca pelo nome');
  await bea.locator('[data-acao=cli-obs]').click();
  await M.fill('#oTexto', 'Prefere sábado à tarde');
  await M.click('[data-acao=cli-salvar]');
  await M.waitForFunction(() => /Anotação salva/.test(document.getElementById('toast').innerText));
  ok((await q(`select obs from clientes where chave = '11955550000'`))[0]?.obs === 'Prefere sábado à tarde' && /Prefere sábado/.test(await bea.innerText()), 'Clientes: anotação salva e mostrada na ficha');
  await M.fill('#cliBusca', '');
  // há mais de 10 dias sem vir
  await db.exec(`alter table horarios disable trigger trg_horario_passado`);
  await db.exec(`insert into horarios (data, hora, status, nome, telefone, servico, pedido_em) values ((public.agora_sp() - interval '15 days')::date, '10:00', 'confirmado', 'Glória Antiga', '11966660000', 'Auriculoterapia', now()), ((public.agora_sp() - interval '5 days')::date, '10:00', 'confirmado', 'Recente Cliente', '11966661111', 'Auriculoterapia', now())`);
  await db.exec(`alter table horarios enable trigger trg_horario_passado`);
  await doMais(M, 'clientes'); await M.waitForSelector('#cliLista .cli:has-text("Glória")');
  ok(/\(1\)/.test(await M.locator('#cliSumidas').innerText()), 'Clientes: o botão "Mais de 10 dias sem vir" mostra quantas são (1)');
  await M.click('#cliSumidas');
  const sum = await M.locator('#cliLista .cli').allInnerTexts();
  ok(sum.length === 1 && /Glória Antiga/.test(sum[0]) && /15 dias/.test(sum[0]) && /Convidar a voltar/.test(sum[0]), 'Clientes: só aparece quem está há mais de 10 dias sem vir, com o convite pronto');
  const convite = decodeURIComponent((await M.locator('#cliLista .cli .cli-acoes a.z').getAttribute('href')).split('text=')[1]);
  ok(/^Oi, Glória!/.test(convite) && /15 dias da sua última sessão de auriculoterapia/.test(convite) && /Separei dois horários/.test(convite) && /1\) .+ às \d+h/.test(convite) && /responder 1 ou 2/.test(convite), 'Clientes: convite personalizado pelo serviço, com 2 horários livres de verdade para escolher');
  console.log('   convite:', convite.replace(/\n/g, ' / '));
  await M.click('[data-cli-f=todas]');
  await foto(M, 'painel-clientes');

  // sugestão de nomes ao digitar (marcar por fora e enviar horários)
  await aba(M, 'agenda');
  await M.click('#agenda .s.livre >> nth=0');
  await M.click('#sheet [data-a=perg-ocupar]');
  await M.locator('#fNome').pressSequentially('glo');
  await M.waitForSelector('#sug-fNome button');
  ok(/Glória Antiga/.test(await M.locator('#sug-fNome').innerText()), 'ao digitar "glo", o painel sugere "Glória Antiga" (sem precisar de acento)');
  await M.click('#sug-fNome button >> nth=0');
  ok((await M.inputValue('#fNome')) === 'Glória Antiga' && (await M.inputValue('#fTel')) === '(11) 96666-0000', 'tocar na sugestão preenche o nome e o WhatsApp');
  await M.click('#sheet [data-a=voltar]'); await M.click('#sheet [data-a=fechar]');
  await aba(M, 'enviar');
  await M.locator('#envNome').pressSequentially('Bea');
  await M.waitForSelector('#sug-envNome button');
  await M.click('#sug-envNome button >> nth=0');
  ok((await M.inputValue('#envNome')) === 'Beatriz Nunes' && (await M.inputValue('#envTel')) === '(11) 95555-0000', 'em Enviar, a sugestão também preenche nome e WhatsApp');
  await M.fill('#envNome', ''); await M.fill('#envTel', '');

  // histórico
  await doMais(M, 'historico');
  await M.waitForSelector('#hLista .hrow');
  const txtH = await M.locator('#hLista').innerText();
  ok(/pediu este horário/.test(txtH) && /pelo site/.test(txtH) && /por você/.test(txtH), 'histórico em frases simples: quem pediu pelo site e o que ela fez');
  ok(/remarcada para este horário/.test(txtH) && /Lembrete enviado para/.test(txtH) && /Horário mudado \(antes era/.test(txtH), 'histórico mostra remarcação, lembrete e mudança de horário');
  await M.fill('#hBusca', 'Beatriz');
  await M.waitForFunction(() => { const r = [...document.querySelectorAll('#hLista .hrow .ht')]; return r.length && r.every((x) => /Beatriz/.test(x.textContent)); });
  ok(true, 'busca no histórico pelo nome da cliente');
  await M.fill('#hBusca', 'ninguémcomessenome');
  await M.waitForFunction(() => /Nada encontrado/.test(document.getElementById('hLista').innerText));
  ok(true, 'busca sem resultado avisa "Nada encontrado"');
  await foto(M, 'painel-historico');

  // segurança
  await doMais(M, 'seguranca');
  ok(/Tudo normal/.test(await M.locator('#gStatus').innerText()), 'Segurança: "Tudo normal" quando não há nada grave');
  ok((await M.locator('#gAlertas .al', { hasText: 'Novo acesso ao painel' }).count()) >= 1 && (await M.locator('#gAlertas .novo').count()) >= 1, 'Segurança: alertas de novo acesso aparecem marcados como NOVO');
  ok((await M.locator('#gAparelhos .ap', { hasText: 'Este aparelho' }).count()) === 1, 'Segurança: lista os aparelhos conectados e marca "Este aparelho"');
  const cod = (await M.locator('#ntfyCodigo').innerText()).trim();
  ok(/^amanda-[0-9a-f]{20}$/.test(cod), 'Segurança: mostra o código secreto para assinar no app ntfy (' + cod + ')');
  const antesN = (await q('select count(*)::int n from net.enviados'))[0].n;
  await M.click('[data-acao=ntfy-teste]');
  await M.waitForFunction(() => /teste enviada/.test(document.getElementById('toast').innerText));
  const env = (await q('select url, body from net.enviados order by id desc limit 1'))[0];
  ok((await q('select count(*)::int n from net.enviados'))[0].n === antesN + 1 && env.url === 'https://ntfy.sh/' && env.body.topic === cod, 'Segurança: "Enviar teste" manda a notificação para o canal dela no ntfy');
  await M.waitForFunction(() => document.getElementById('nMais').hidden);
  ok((await q(`select count(*)::int n from alertas where visto_em is null`))[0].n === 0, 'abrir a Segurança marca os alertas como vistos');
  await foto(M, 'painel-seguranca');

  // todas as telas do painel em celulares estreitos: nada para fora da tela, nenhuma rolagem para o lado,
  // nenhum preço ou palavra curta quebrada em duas linhas
  const problemasDeLayout = (pagina) => pagina.evaluate(() => {
    const A = [], vw = innerWidth;
    const nome = (e) => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '')).slice(0, 60);
    if (document.documentElement.scrollWidth > vw + 1) A.push('rolagem para o lado (' + document.documentElement.scrollWidth + ' > ' + vw + ')');
    for (const e of document.querySelectorAll('#vApp *')) {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' || e.closest('[hidden],svg')) continue;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
      if (r.right > vw + 1 || r.left < -1) { let rola = false; for (let q = e.parentElement; q; q = q.parentElement) { const o = getComputedStyle(q).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') { rola = true; break; } } if (!rola) A.push('fora da tela: ' + nome(e)); }
      const t = e.textContent.trim().replace(/\s+/g, ' ');
      if (t && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && ((/R\$\s?\d/.test(t) && t.length <= 22) || (!e.children.length && t.length <= 9 && !/\s/.test(t)))) {
        const g = document.createRange(); g.selectNodeContents(e);
        const c = [...g.getClientRects()].filter((x) => x.width > 0).map((x) => (x.top + x.bottom) / 2).sort((x, y) => x - y);
        let linhas = 0, ult = -1e9; for (const y of c) { if (y - ult > 7) linhas++; ult = y; }
        if (linhas > 1) A.push('quebrado em ' + linhas + ' linhas: "' + t + '" (' + nome(e) + ')');
      }
    }
    return [...new Set(A)];
  });
  for (const largura of [320, 360, 390]) {
    await M.setViewportSize({ width: largura, height: 800 });
    const todos = [];
    for (const t of ['inicio', 'agenda', 'enviar']) { await aba(M, t); await M.waitForTimeout(120); todos.push(...(await problemasDeLayout(M)).map((x) => t + ': ' + x)); }
    for (const t of ['numeros', 'clientes', 'servicos', 'historico', 'seguranca', 'ajuda', 'conta']) { await doMais(M, t); await M.waitForTimeout(120); todos.push(...(await problemasDeLayout(M)).map((x) => t + ': ' + x)); }
    ok(!todos.length, `painel em ${largura}px: 10 telas sem nada fora do lugar` + (todos.length ? ' (' + todos.slice(0, 4).join(' | ') + ')' : ''));
  }
  await M.setViewportSize({ width: 390, height: 844 });
  await doMais(M, 'seguranca');

  // proteção ligada na mão: o site leva a cliente direto para o WhatsApp
  await M.click('#gStatus [data-acao=protecao]');
  await M.waitForFunction(() => /Proteção ligada/.test(document.getElementById('mSeg').textContent));
  ok((await q('select pausado from guardiao'))[0].pausado === true, 'Amanda liga a proteção pelo painel');
  const cs = await contexto(ANDROID);
  const S = await cs.newPage();
  await S.goto(BASE); await S.waitForSelector('#o-dia .opt');
  await S.click('#o-servico .opt:has-text("Auriculoterapia")'); await S.click('#o-dia .opt:not([disabled]) >> nth=0'); await S.click('#o-hora .opt:not([disabled]) >> nth=0');
  const hEscolhido = (await S.locator('#o-hora .opt[aria-pressed=true]').innerText()).trim();
  await S.fill('#nome', 'Cliente Protegida'); await S.fill('#tel', '11931313131');
  await Promise.all([S.waitForURL(/wa\.me/), S.click('#go')]);
  ok(/Cliente Protegida/.test(decodeURIComponent(S.url())) && (await q(`select count(*)::int n from horarios where nome = 'Cliente Protegida'`))[0].n === 0, `com a proteção ligada, a cliente vai para o WhatsApp com o pedido (${hEscolhido}) e nada é reservado`);
  await cs.close();
  await M.click('#gStatus [data-acao=protecao]');
  await M.waitForFunction(() => !/Proteção ligada/.test(document.getElementById('mSeg').textContent));
  ok((await q('select pausado from guardiao'))[0].pausado === false, 'Amanda religa o agendamento pelo site');

  // sair dos outros aparelhos
  const c2 = await contexto(IPHONE);
  const O = await entrar(c2);
  await M.reload(); await M.waitForFunction(() => !document.getElementById('mSeg').hidden);
  await M.click('[data-aba="seguranca"] [data-acao=sair-outros]');
  await M.waitForFunction(() => /outros aparelhos foram desconectados/.test(document.getElementById('toast').innerText));
  await O.reload();
  await O.waitForSelector('#vLogin:not([hidden])');
  ok(true, '"Sair dos outros aparelhos" desconecta o outro celular');
  ok(await M.locator('#vApp').isVisible(), 'e este aparelho continua conectado');
  await c2.close();

  // trocar senha
  await doMais(M, 'conta');
  ok(/Conectada como amanda@teste\.com/.test(await M.locator('#cEmail').innerText()), 'Minha conta mostra o e-mail conectado');
  await M.fill('#cAtual', 'errada'); await M.fill('#cNova', 'novaSenha2026'); await M.fill('#cNova2', 'novaSenha2026'); await M.click('#bSenha');
  await M.waitForFunction(() => /senha atual não confere/.test(document.getElementById('toast').innerText));
  ok(SENHAS[EMAIL_ADMIN] === 'certa', 'trocar senha com a senha atual errada é recusado');
  await M.fill('#cAtual', 'certa'); await M.fill('#cNova', 'curta1'); await M.fill('#cNova2', 'curta1'); await M.click('#bSenha');
  await M.waitForFunction(() => /pelo menos 8 caracteres/.test(document.getElementById('toast').innerText));
  ok(true, 'senha nova fraca é recusada antes de enviar');
  await M.fill('#cNova', 'novaSenha2026'); await M.fill('#cNova2', 'novaSenha2026'); await M.click('#bSenha');
  await M.waitForFunction(() => /Senha trocada/.test(document.getElementById('toast').innerText));
  ok(SENHAS[EMAIL_ADMIN] === 'novaSenha2026' && await M.locator('#vApp').isVisible(), 'senha trocada e ela continua conectada');
  const c3 = await contexto(IPHONE);
  await entrar(c3, 'novaSenha2026');
  ok(true, 'a senha nova funciona para entrar');
  await c3.close();
  SENHAS[EMAIL_ADMIN] = 'certa';

  // sessão de 24 horas: fica aberta o dia todo e pede a senha uma vez por dia
  // espera o painel terminar de gravar a sessão (linha de base dos alertas) antes de mexer no relógio dela
  await M.waitForFunction(() => { try { const s = JSON.parse(localStorage.getItem('amanda-sess') || 'null'); return !!(s && s.base != null); } catch (e) { return false; } }); await M.evaluate(() => { const s = JSON.parse(localStorage.getItem('amanda-sess')); s.inicio = Date.now() - 13 * 3600 * 1000; localStorage.setItem('amanda-sess', JSON.stringify(s)); });
  await M.reload();
  await M.waitForSelector('#vApp:not([hidden])');
  ok(await M.locator('#vLogin').isHidden(), '13 horas depois continua conectada, sem pedir a senha');
  await M.evaluate(() => { const s = JSON.parse(localStorage.getItem('amanda-sess')); s.inicio = Date.now() - 25 * 3600 * 1000; localStorage.setItem('amanda-sess', JSON.stringify(s)); });
  await M.reload();
  await M.waitForSelector('#vLogin:not([hidden])');
  ok(/uma vez por dia/.test(await M.locator('#mLogin').innerText()), 'depois de 24 horas o painel pede a senha de novo, explicando o motivo');
  await c.close();

  // login: e-mail lembrado, sem opção de "manter 30 dias", e a senha nunca fica guardada
  {
    const cm = await contexto(IPHONE);
    const L = await cm.newPage();
    await L.goto(BASE + 'admin/');
    ok((await L.locator('#manter').count()) === 0 && /24 horas/.test(await L.locator('#fLogin').innerText()), 'login: não há mais "manter 30 dias"; avisa que fica conectada por 24 horas');
    await L.fill('#email', EMAIL_ADMIN); await L.fill('#senha', 'certa'); await L.click('#bLogin');
    await L.waitForSelector('#vApp:not([hidden])');
    const guardado = await L.evaluate(() => Object.keys(localStorage).map((k) => k + '=' + localStorage.getItem(k)).join('\n'));
    ok(!/certa/.test(guardado.replace(/amanda-sess=.*/g, '')) && !/"password"|"senha"/.test(guardado), 'a senha nunca fica guardada no aparelho');
    await L.waitForFunction(() => { try { const s = JSON.parse(localStorage.getItem('amanda-sess') || 'null'); return !!(s && s.base != null); } catch (e) { return false; } }); await L.evaluate(() => { const s = JSON.parse(localStorage.getItem('amanda-sess')); s.inicio = Date.now() - 25 * 3600 * 1000; localStorage.setItem('amanda-sess', JSON.stringify(s)); });
    await L.reload();
    await L.waitForSelector('#vLogin:not([hidden])');
    ok((await L.inputValue('#email')) === EMAIL_ADMIN && (await L.inputValue('#senha')) === '', 'no login seguinte: e-mail já preenchido e senha vazia (vem do Chaveiro do celular)');
    ok(await L.evaluate(() => document.activeElement && document.activeElement.id === 'senha'), 'e o cursor já está na senha');
    await cm.close();
  }

  // acesso estranho (um programa logado com a senha dela): desconecta todos os aparelhos
  const c4 = await contexto(IPHONE);
  const E = await entrar(c4);
  await q(`insert into auth.sessions (user_id, user_agent) select id, 'python-requests/2.31' from auth.users where email = $1`, [EMAIL_ADMIN]);
  await E.click('#bAtualizar');
  await E.waitForSelector('#vLogin:not([hidden])');
  ok(/acesso estranho/.test(await E.locator('#mLogin').innerText()), 'acesso de um programa automático: o painel desconecta e pede a senha');
  ok((await q(`select count(*)::int n from auth.sessions s join auth.users u on u.id = s.user_id where u.email = $1`, [EMAIL_ADMIN]))[0].n === 0, 'e todas as sessões, inclusive a do invasor, são encerradas');
  await c4.close();

  // alerta grave novo do guardião (muitos cancelamentos de uma vez): fecha na hora; o que já existia antes de entrar não conta
  await q(`insert into public.alertas (tipo, nivel, titulo, detalhe, chave) values ('cancelamentos', 'grave', 'Muitos horários com cliente cancelados de uma vez', 'teste antigo', 'teste:antigo')`);
  const c5 = await contexto(IPHONE);
  const G = await entrar(c5);
  ok(await G.locator('#vApp').isVisible(), 'alerta grave que já existia antes de entrar não derruba a sessão');
  await q(`insert into public.alertas (tipo, nivel, titulo, detalhe, chave) values ('cancelamentos', 'grave', 'Muitos horários com cliente cancelados de uma vez', 'teste novo', 'teste:novo')`);
  await G.click('#bAtualizar');
  await G.waitForSelector('#vLogin:not([hidden])');
  ok(/guardião viu algo estranho/.test(await G.locator('#mLogin').innerText()), 'alerta grave novo: o painel desconecta na hora e explica');
  ok((await q(`select count(*)::int n from auth.sessions s join auth.users u on u.id = s.user_id where u.email = $1`, [EMAIL_ADMIN]))[0].n === 0, 'e todas as sessões são encerradas');
  await q(`delete from public.alertas where chave like 'teste:%'`);
  await c5.close();
}

// ===== 4g. Guardião externo (o robô que confere o site a cada 15 minutos) =====
{
  const { execFile } = await import('node:child_process');
  // o mesmo Supabase de mentira, agora como servidor HTTP de verdade
  const servApi = http.createServer(async (req, res) => {
    const partes = []; for await (const c of req) partes.push(c);
    const corpo = Buffer.concat(partes).toString();
    await api.tratar({
      request: () => ({ url: () => SUPABASE_URL + req.url, method: () => req.method, headers: () => req.headers, postDataJSON: () => (corpo ? JSON.parse(corpo) : null) }),
      fulfill: async ({ status = 200, headers = {}, contentType, body = '' }) => { res.writeHead(status, { ...headers, ...(contentType ? { 'content-type': contentType } : {}) }); res.end(body); },
    });
  });
  await new Promise((r) => servApi.listen(0, r));
  const vigia = () => new Promise((ok) => execFile(process.execPath, [path.join(RAIZ, 'guardiao/vigia.mjs'), '--json'], { env: { ...process.env, GITHUB_TOKEN: '', GUARDIAO_SITE: BASE, GUARDIAO_SUPABASE: `http://127.0.0.1:${servApi.address().port}`, GUARDIAO_CHAVE: ANON_KEY, GUARDIAO_ESPERA: '0', GUARDIAO_SEM_TOLERANCIA: '1' } }, (e, out) => ok(JSON.parse(out))));
  await db.exec(`update alertas set visto_em = now() where visto_em is null`);
  const r1 = await vigia();
  ok(r1.ok, 'guardião externo: tudo certo com o site e o banco' + (r1.ok ? '' : ': ' + r1.problemas.join(' | ')));
  trocas['agenda.js'] = fs.readFileSync(path.join(RAIZ, 'agenda.js'), 'utf8').replace('5511948907302', '5511999990000');
  const r2 = await vigia();
  ok(!r2.ok && r2.problemas.some((p) => /diferente do que está no GitHub/.test(p)) && r2.problemas.some((p) => /WhatsApp da Amanda/.test(p)), 'guardião externo: percebe quando trocam o WhatsApp no site');
  delete trocas['agenda.js'];
  await db.exec(`grant select on horarios to anon; drop policy if exists "vazou" on horarios; create policy "vazou" on horarios for select to anon using (true)`);
  const r3 = await vigia();
  ok(!r3.ok && r3.problemas.some((p) => /visitantes conseguem ler a tabela horarios/.test(p)), 'guardião externo: percebe se os dados das clientes ficarem expostos');
  await db.exec(`drop policy "vazou" on horarios; revoke select on horarios from anon`);
  await db.exec(`update guardiao set pausado = true`);
  const r4 = await vigia();
  ok(!r4.ok && r4.problemas.some((p) => /proteção do guardião está ligada/.test(p)), 'guardião externo: avisa quando a proteção está ligada');
  await db.exec(`update guardiao set pausado = false`);
  ok((await vigia()).ok, 'guardião externo: volta a "tudo certo" quando o problema some');
  servApi.close();
}

// ===== 4i. Questionário da Amanda (salva sozinho no celular e envia pelo WhatsApp) =====
{
  const c = await contexto(IPHONE);
  await c.grantPermissions(['clipboard-read', 'clipboard-write']);
  const fora = [];
  c.on('request', (r) => { if (new URL(r.url()).origin !== new URL(BASE).origin) fora.push(r.url()); });
  const p = await c.newPage();
  const etapa = async () => (await p.locator('#num').innerText()).replace('ETAPA ', '');
  const chip = (nome) => p.locator('#etapas [data-ir]', { hasText: nome });
  const op = (k, v) => p.locator(`.op[data-k="${k}"][data-v="${v}"]`);
  await p.goto(BASE + 'questionario/');
  await p.waitForSelector('#tela .etapa');
  const total = await p.locator('#etapas [data-ir]').count();
  ok((await etapa()) === '01/' + total && total >= 12, `questionário: abre na etapa 1 de ${total}`);
  // responde, recarrega e continua tudo lá (inclusive a etapa em que parou)
  await op('proc.auriculo.tempo', '1h').click();
  await p.fill('[data-k="proc.auriculo.preco"]', '120');
  await chip('Benefícios').click();
  await p.reload();
  await p.waitForSelector('#tela .etapa');
  ok((await etapa()) === '02/' + total, 'questionário: ao voltar, abre na etapa em que ela parou');
  await chip('Seus procedimentos').click();
  ok((await op('proc.auriculo.tempo', '1h').getAttribute('aria-pressed')) === 'true' && (await p.inputValue('[data-k="proc.auriculo.preco"]')) === '120', 'questionário: respostas continuam salvas depois de recarregar');
  // benefícios: estrela só em benefício escrito, e no máximo 3
  await chip('Benefícios').click();
  const estrela = (i) => p.locator(`.estrela[data-estrela="ben.auriculo"][data-i="${i}"]`);
  await estrela(0).click();
  ok((await estrela(0).getAttribute('aria-pressed')) === 'false' && /Escreva o benefício primeiro/.test(await p.locator('#animo').innerText()), 'questionário: não dá estrela para benefício em branco');
  const bens = ['Alívio de dores', 'Menos ansiedade', 'Sono mais tranquilo', 'Mais disposição'];
  for (const [i, t] of bens.entries()) await p.fill(`[data-k="ben.auriculo"][data-i="${i}"]`, t);
  for (const i of [0, 1, 2, 3]) await estrela(i).click();
  ok((await estrela(3).getAttribute('aria-pressed')) === 'false' && (await p.locator('[data-cont="ben.auriculo"]').innerText()) === '3 de 3 estrelas' && /Só 3 estrelas/.test(await p.locator('#animo').innerText()), 'questionário: no máximo 3 estrelas por serviço');
  // ideias para crescer
  await chip('Ideias para crescer').click();
  await op('id.google', '😍 Quero!').click();
  // sugestões: acrescentar, escolher tipo/lugar/prioridade e remover
  await chip('Suas sugestões').click();
  const blocos = () => p.locator('[id^="sug-b-"]').count();
  ok((await blocos()) === 3, 'questionário: começa com 3 sugestões');
  await p.fill('#sug-0', 'Ideia A');
  await p.click('#sug-b-0 [data-c="tipo"][data-v="✨ Ideia nova"]');
  await p.click('[data-sug-mais]');
  const nova = await p.locator('#sug-b-3').boundingBox();
  ok((await blocos()) === 4 && nova && nova.y >= 0 && nova.y < IPHONE.viewport.height, 'questionário: "Adicionar sugestão 4" cria a sugestão e mostra ela na tela (a página não pula para o topo)');
  await p.fill('#sug-3', 'Trocar a foto do topo');
  for (const [c2, v] of [['tipo', '🔧 Mudança'], ['onde', 'Site'], ['prio', '🔥 Urgente']]) await p.click(`#sug-b-3 [data-c="${c2}"][data-v="${v}"]`);
  await p.click('[data-sug-tirar="1"]'); // em branco: sai sem perguntar
  ok((await blocos()) === 3 && (await p.inputValue('#sug-2')) === 'Trocar a foto do topo', 'questionário: remover sugestão em branco renumera as outras');
  let perguntou = false;
  p.once('dialog', (d) => { perguntou = true; d.dismiss(); });
  await p.click('[data-sug-tirar="0"]');
  ok(perguntou && (await blocos()) === 3 && (await p.inputValue('#sug-0')) === 'Ideia A', 'questionário: remover sugestão escrita pede confirmação');
  // nenhuma etapa passa da largura da tela
  const largas = [];
  for (let i = 0; i < total; i++) {
    await p.click(`#etapas [data-ir="${i}"]`);
    if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) largas.push(i + 1);
  }
  ok(!largas.length, 'questionário: nenhuma etapa passa da largura do celular' + (largas.length ? ' (etapas ' + largas.join(', ') + ')' : ''));
  // final: prévia, WhatsApp com o mesmo texto, etapas que faltam e copiar
  await chip('Prontinho').click();
  const previa = await p.locator('#previa').innerText();
  const esperado = ['Auriculoterapia · Tempo (com preparo): 1h', 'Auriculoterapia · Preço normal: R$ 120', '1) Alívio de dores ⭐', '4) Mais disposição', 'Avaliações no Google: 😍 Quero!', 'Sugestão 1 (✨ Ideia nova): Ideia A', 'Sugestão 3 (🔧 Mudança · Site · 🔥 Urgente): Trocar a foto do topo'];
  const faltando = esperado.filter((t) => !previa.includes(t));
  ok(!faltando.length && !/4\) Mais disposição ⭐/.test(previa), 'questionário: o texto final traz as respostas, as estrelas e as sugestões' + (faltando.length ? ' (faltou: ' + faltando.join(' | ') + ')' : ''));
  const zap = await p.getAttribute('#bZap', 'href');
  ok(zap.startsWith('https://wa.me/?text=') && decodeURIComponent(zap.slice(20)) === previa, 'questionário: "Enviar pelo WhatsApp" leva exatamente o texto da prévia');
  await p.click('[data-copiar]');
  await p.waitForFunction(() => /Copiado/.test(document.getElementById('animo').textContent));
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  ok(copiado.split('\n').slice(2).join('\n') === previa.split('\n').slice(2).join('\n'), 'questionário: "Copiar respostas" copia o mesmo texto');
  ok((await p.locator('.falta [data-ir]', { hasText: 'Sua agenda' }).count()) === 1 && !(await p.locator('.falta [data-ir]', { hasText: 'Benefícios' }).count()), 'questionário: o final mostra as etapas ainda sem resposta');
  await p.click('.falta [data-ir]:has-text("Sua agenda")');
  ok((await etapa()) === '03/' + total, 'questionário: tocar numa etapa que falta leva até ela');
  ok(!fora.length, 'questionário: nada sai do celular (nenhum pedido para outro endereço)' + (fora.length ? ': ' + fora.join(', ') : ''));
  // apagar tudo
  await chip('Prontinho').click();
  p.once('dialog', (d) => d.accept());
  await p.click('[data-limpar]');
  const salvo = await p.evaluate(() => JSON.parse(localStorage.getItem('amanda-questionario-v1')));
  ok((await etapa()) === '01/' + total && (await op('proc.auriculo.tempo', '1h').getAttribute('aria-pressed')) === 'false' && JSON.stringify(salvo) === JSON.stringify({ sug: [{}, {}, {}], depo: [{}, {}, {}] }), 'questionário: "Apagar minhas respostas" limpa tudo e volta ao começo');
  // dados estragados no celular não quebram a página
  await p.evaluate(() => { localStorage.setItem('amanda-questionario-v1', '{"sug":5,"depo":[null,"x"],"ben.auriculo":"oi"}'); localStorage.setItem('amanda-questionario-v1-etapa', '99'); });
  await p.reload();
  await p.waitForSelector('#tela .etapa');
  const inicio = await etapa();
  await chip('Benefícios').click();
  await p.fill('[data-k="ben.auriculo"][data-i="0"]', 'Alívio de dores');
  await chip('Suas clientes').click();
  await chip('Suas sugestões').click();
  const sugs = await blocos();
  await chip('Prontinho').click();
  ok(inicio === '01/' + total && sugs === 3 && (await p.locator('#previa').innerText()).includes('1) Alívio de dores'), 'questionário: respostas estragadas no celular não quebram a página');
  await c.close();
}

// ===== 4j. Seus números: atendimentos e faturamento no painel (relógio do banco fixo em 20/10/2026 às 15h) =====
{
  const nb = await criarBanco();
  const apiN = criarApi(nb);
  const nq = async (sql, p) => (await apiN.sql(sql, p)).rows;
  const aguarda = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 120)); } return false; };
  await nb.db.exec(`create or replace function public.agora_sp() returns timestamp language sql stable set search_path = '' as $$ select timestamp '2026-10-20 15:00' $$`);
  await nb.db.exec(`update servicos set preco = 80 where id = 'auriculo'; update servicos set desde = null where id = 'limpeza'`);
  await nb.db.exec(`alter table horarios disable trigger trg_horario_passado`);
  await nb.db.exec(`insert into horarios (data, hora, status, nome, telefone, servico, pedido_em) values
    ('2026-10-05', '10:00', 'confirmado', 'Maria Silva', '11911110001', 'Auriculoterapia', now()),
    ('2026-10-15', '14:00', 'confirmado', 'Joana Lima', '11911110002', 'Limpeza de pele', now()),
    ('2026-10-20', '13:00', 'confirmado', 'Rita Souza', '11911110003', 'Auriculoterapia', now()),
    ('2026-10-20', '17:00', 'confirmado', 'Cris Melo', '11911110005', 'Limpeza de pele', now()),
    ('2026-09-10', '10:00', 'confirmado', 'Joana Lima', '11911110002', 'Auriculoterapia', now())`);
  await nb.db.exec(`alter table horarios enable trigger trg_horario_passado`);
  await nb.db.exec(`insert into horarios (data, hora) values ('2026-10-22', '10:00')`);
  const idDe = async (data, hora) => (await nq(`select id from horarios where data = $1 and hora = $2`, [data, hora]))[0].id;
  const rita = await idDe('2026-10-20', '13:00'), livre = await idDe('2026-10-22', '10:00');
  const c = await contexto(IPHONE, { apiDoBanco: apiN });
  const N = await c.newPage();
  await N.goto(BASE + 'admin/');
  await N.fill('#email', EMAIL_ADMIN); await N.fill('#senha', 'certa'); await N.click('#bLogin');
  await N.waitForSelector('#numeros:not([hidden])');
  const cartao = () => N.locator('#numeros').innerText();
  const fechaAviso = async () => { if (await N.locator('#toast').isVisible()) await N.click('#toast [data-fechar]'); };
  let t = await cartao();
  ok(/Faturamento de outubro/.test(t) && /R\$ 235/.test(t) && /3 atendimentos este mês/.test(t), 'Início mostra o faturamento do mês (R$ 235) e os 3 atendimentos: ' + t.replace(/\n+/g, ' / '));
  ok(/Você já passou setembro \(R\$ 80\)/.test(t), 'sem meta, compara com o mês passado (setembro, R$ 80)');
  ok(/\+ R\$ 75 em 1 atendimento já marcado até o fim do mês/.test(t), 'mostra quanto já está marcado até o fim do mês');
  ok(/desde a inauguração\s*R\$ 315\s*4 atendimentos · desde 10\/09\/2026/i.test(t), 'Início mostra o faturamento desde a inauguração (R$ 315, 4 atendimentos)');
  await foto(N, 'painel-numeros', false);
  // faturamento detalhado: filtros por dia, semana, mês, ano, tudo, período e procedimento
  {
    await N.click('#numeros [data-fat-ir]');
    await N.waitForSelector('[data-aba="faturamento"]:not([hidden]) #fatRes .fat-res');
    const fres = () => N.locator('#fatRes').innerText();
    const rot = () => N.locator('#fatRot').innerText();
    const itens = () => N.locator('#fatRes .fat-at li').count();
    let f = await fres();
    ok(/R\$ 235/.test(f) && /Setembro inteiro: R\$ 80/.test(f) && /\+ R\$ 75 em 1 atendimento já marcado até o fim do mês/.test(f), 'faturamento detalhado abre no mês: R$ 235, setembro para comparar e o que já está marcado');
    ok(/Auriculoterapia\s*R\$ 160\s*2 atendimentos · 68%/.test(f) && /Limpeza de pele\s*R\$ 75\s*1 atendimento · 32%/.test(f), 'faturamento: separado por procedimento, com a parte de cada um');
    ok(/Dia a dia/.test(f) && (await itens()) === 3 && /Média de R\$ 78,33 por atendimento/.test(f), 'faturamento: dia a dia, os 3 atendimentos e a média');
    await foto(N, 'painel-faturamento');
    await N.selectOption('#fatServ', 'Limpeza de pele');
    f = await fres();
    ok(/Faturamento · Limpeza de pele/.test(f) && /R\$ 75/.test(f) && (await itens()) === 1 && !/Por procedimento/.test(f), 'faturamento: filtro por procedimento (só a limpeza, R$ 75)');
    await N.selectOption('#fatServ', '');
    await N.click('[data-fat-n="-1"]');
    ok(/Setembro/.test(await rot()) && /R\$ 80/.test(await fres()) && await N.locator('[data-fat-n="-1"]').isDisabled(), 'faturamento: a seta volta para setembro (R$ 80), e antes da inauguração não volta mais');
    await N.click('[data-fat-n="1"]');
    ok(/Outubro/.test(await rot()) && await N.locator('[data-fat-n="1"]').isDisabled(), 'faturamento: não avança para depois de hoje');
    await N.click('[data-fat-p="dia"]');
    ok(await aguarda(async () => /Hoje/.test(await rot()) && /Rita Souza/.test(await fres())) && /R\$ 80/.test(await fres()), 'faturamento por dia: abre no último dia com atendimento (hoje, Rita, R$ 80)');
    await N.click('[data-fat-n="-1"]');
    ok(/Quinta-feira/.test(await rot()) && /15 de outubro de 2026/.test(await rot()) && /Joana Lima/.test(await fres()), 'faturamento por dia: a seta pula para o dia anterior com atendimento (15/10)');
    await N.click('[data-fat-p="semana"]');
    f = await fres();
    ok(/18 a 24 de outubro/.test(await rot()) && /R\$ 80/.test(f) && /Semana anterior: R\$ 75/.test(f) && /já marcado até o fim da semana/.test(f), 'faturamento por semana: de domingo a sábado, com a semana anterior e o que já está marcado');
    await N.click('[data-fat-p="ano"]');
    f = await fres();
    ok(/2026/.test(await rot()) && /R\$ 315/.test(f) && /Mês a mês/.test(f) && (await N.locator('#fatRes .fat-bar').last().locator('li').count()) === 2, 'faturamento por ano: R$ 315, mês a mês desde a inauguração');
    await N.click('[data-fat-p="tudo"]');
    f = await fres();
    ok(/Desde a inauguração/.test(await rot()) && /10\/09\/2026 até hoje/.test(await rot()) && /R\$ 315/.test(f) && /4\s*atendimentos/.test(f) && /3\s*clientes/.test(f), 'faturamento "Tudo": desde a inauguração (R$ 315, 4 atendimentos, 3 clientes)');
    await N.click('[data-fat-p="periodo"]');
    await N.fill('#fatIni', '2026-10-10'); await N.fill('#fatFim', '2026-10-20');
    ok(await aguarda(async () => /R\$ 155/.test(await fres()) && (await itens()) === 2), 'faturamento por período: do dia 10 ao 20/10 (R$ 155)');
    await N.click('#fatOlho [data-num="olho"]');
    ok(/R\$ •••/.test(await fres()) && !/155/.test(await fres()), 'faturamento: o olho esconde os valores');
    await N.click('#fatOlho [data-num="olho"]');
    ok(/R\$ 155/.test(await fres()), 'faturamento: e mostra de novo');
    await N.setViewportSize({ width: 320, height: 640 });
    let largo = [];
    for (const m of ['mes', 'dia', 'semana', 'ano', 'tudo', 'periodo']) { await N.click(`[data-fat-p="${m}"]`); if (await N.evaluate(() => document.documentElement.scrollWidth > 320)) largo.push(m); }
    ok(!largo.length, 'faturamento em 320px: nada passa da tela ' + largo.join());
    await N.setViewportSize(IPHONE.viewport);
    await N.click('#fatVoltar');
    ok(await N.locator('[data-aba="inicio"]').isVisible(), 'faturamento: "Início" volta para o Início');
  }
  // olho: esconde os valores e lembra no aparelho
  await N.click('#numeros [data-num="olho"]');
  t = await cartao();
  ok(/R\$ •••/.test(t) && !/235/.test(t) && /3 atendimentos/.test(t), 'o olho esconde os valores (os atendimentos continuam)');
  await N.reload(); await N.waitForSelector('#numeros:not([hidden])');
  ok(/R\$ •••/.test(await cartao()) && (await N.getAttribute('#numeros [data-num="olho"]', 'aria-pressed')) === 'true', 'depois de recarregar, os valores continuam escondidos');
  await N.click('#numeros [data-num="olho"]');
  ok(/R\$ 235/.test(await cartao()), 'tocar de novo no olho mostra os valores');
  // não veio
  await aba(N, 'agenda');
  await N.click(`#agenda [data-abrir="${rita}"]`);
  await foto(N, 'painel-nao-veio-antes', false);
  await N.click('#sheet [data-a="perg-faltou"]');
  await N.click('#sheet [data-a="faltou"]');
  ok(await aguarda(async () => (await nq(`select faltou from horarios where id = $1`, [rita]))[0].faltou === true), 'não veio: fica anotado no banco');
  ok(await aguarda(async () => /não veio/.test(await N.locator(`#agenda [data-abrir="${rita}"]`).innerText())), 'não veio: a agenda mostra "não veio" no horário');
  await aba(N, 'inicio');
  ok(await aguarda(async () => /R\$ 155/.test(await cartao()) && /2 atendimentos este mês/.test(await cartao())), 'não veio: sai da conta (2 atendimentos, R$ 155)');
  await fechaAviso();
  await aba(N, 'agenda');
  await N.click(`#agenda [data-abrir="${rita}"]`);
  ok(/Anotado: a cliente não veio/.test(await N.locator('#sheet').innerText()), 'o horário mostra que a cliente não veio');
  await N.click('#sheet [data-a="veio"]');
  ok(await aguarda(async () => (await nq(`select faltou from horarios where id = $1`, [rita]))[0].faltou === false), 'desfazer: a cliente veio, sim');
  await aba(N, 'inicio');
  ok(await aguarda(async () => /R\$ 235/.test(await cartao())), 'desfazer: o atendimento volta para a conta');
  await fechaAviso();
  // cortesia: valor cobrado 0
  await aba(N, 'agenda');
  await N.click(`#agenda [data-abrir="${rita}"]`);
  ok(/R\$ 80/.test(await N.locator('#sheet').innerText()), 'o horário mostra o valor do atendimento (R$ 80)');
  await N.click('#sheet [data-a="perg-editar"]');
  ok((await N.inputValue('#fValor')) === '80', 'Editar dados traz o valor cobrado');
  await foto(N, 'painel-valor', false);
  await N.fill('#fValor', 'abc'); await N.click('#sheet [data-a="editar"]');
  ok(/Confira o valor/.test(await N.locator('#toast').innerText()), 'valor inválido é recusado com explicação');
  await N.fill('#fValor', '0'); await N.click('#sheet [data-a="editar"]');
  ok(await aguarda(async () => Number((await nq(`select valor from horarios where id = $1`, [rita]))[0].valor) === 0), 'cortesia: valor 0 salvo no banco');
  await aba(N, 'inicio');
  ok(await aguarda(async () => /R\$ 155/.test(await cartao())), 'cortesia: o faturamento do mês desce para R$ 155');
  await fechaAviso();
  // meta do mês
  await N.click('#numeros [data-num="meta-ir"]');
  await N.waitForSelector('[data-aba="numeros"]:not([hidden])');
  ok(await N.evaluate(() => document.activeElement && document.activeElement.id === 'metaV'), '"Definir uma meta" abre a página de números com o campo da meta pronto');
  await N.fill('#metaV', '500'); await N.click('[data-num="meta-salvar"]');
  ok(await aguarda(async () => Number((await nq(`select meta_mensal from painel_config`))[0].meta_mensal) === 500), 'meta salva no banco (R$ 500)');
  await aba(N, 'inicio');
  ok(await aguarda(async () => /31% da meta de R\$ 500 · faltam R\$ 345/.test(await cartao())), 'Início mostra quanto falta para a meta: ' + (await cartao()).replace(/\n+/g, ' / '));
  ok((await N.getAttribute('#numeros [role="progressbar"]', 'aria-valuenow')) === '31', 'a barra da meta diz o número para quem usa leitor de tela');
  await foto(N, 'painel-numeros-meta', false);
  await doMais(N, 'numeros');
  await foto(N, 'painel-numeros-detalhes');
  const det = await N.locator('#numDet').innerText();
  ok(/Auriculoterapia\s*2 atendimentos · R\$ 80/.test(det) && /Limpeza de pele\s*1 atendimento · R\$ 75/.test(det), 'detalhes: o mês separado por serviço');
  ok((await N.locator('#numDet .num-meses li').count()) === 6 && /Set\s*1 atend\. · R\$ 80/.test(det), 'detalhes: os últimos 6 meses');
  ok(/4\s*atendimentos/.test(det) && /3\s*clientes/.test(det) && /R\$ 235\s*faturamento/.test(det) && /Desde 10\/09\/2026/.test(det), 'detalhes: desde o começo (4 atendimentos, 3 clientes, R$ 235)');
  // lembrou depois: "não veio" pela lista dos últimos 7 dias
  const joana = () => N.locator('#numDet .num-ult li', { hasText: 'Joana Lima' });
  ok(await aguarda(async () => (await N.locator('#numDet .num-ult li').count()) === 2), 'Últimos 7 dias: lista os atendimentos que já aconteceram (Rita e Joana; a Cris ainda vai ser atendida)');
  await joana().locator('[data-num="faltou"]').click();
  ok(await aguarda(async () => (await nq(`select faltou from horarios where data = '2026-10-15'`))[0].faltou === true), 'Últimos 7 dias: "Não veio" fica anotado no banco, mesmo fora da agenda de hoje');
  ok(await aguarda(async () => /não veio/.test(await joana().innerText())), 'Últimos 7 dias: a cliente aparece como "não veio"');
  await fechaAviso();
  await joana().locator('[data-num="faltou"]').click();
  ok(await aguarda(async () => (await nq(`select faltou from horarios where data = '2026-10-15'`))[0].faltou === false), 'Últimos 7 dias: "Veio, sim" desfaz');
  await fechaAviso();
  await N.fill('#metaV', '100'); await N.click('[data-num="meta-salvar"]');
  await aba(N, 'inicio');
  ok(await aguarda(async () => /Meta do mês batida! \(R\$ 100\)/.test(await cartao())) && (await N.getAttribute('#numeros .meter', 'class')).includes('ok'), 'meta batida: parabéns e barra verde');
  await doMais(N, 'numeros');
  await N.click('[data-num="meta-tirar"]');
  ok(await aguarda(async () => (await nq(`select meta_mensal from painel_config`))[0].meta_mensal === null), 'tirar a meta');
  // marcar por fora: o valor vem sozinho do preço do serviço
  await fechaAviso();
  await aba(N, 'agenda');
  await N.click(`#agenda [data-abrir="${livre}"]`);
  await N.click('#sheet [data-a="perg-ocupar"]');
  await N.fill('#fNome', 'Lu Prado'); await N.selectOption('#fServ', 'Auriculoterapia');
  ok((await N.getAttribute('#fValor', 'placeholder')) === 'Preço do serviço: R$ 80', 'ao escolher o serviço, o campo de valor mostra o preço dele');
  await N.click('#sheet [data-a="ocupar"]');
  ok(await aguarda(async () => Number((await nq(`select valor from horarios where id = $1`, [livre]))[0].valor) === 80), 'marcar por fora sem escrever o valor: fica o preço do serviço');
  await doMais(N, 'historico');
  ok(await aguarda(async () => /Rita Souza não veio/.test(await N.locator('#hLista').innerText()) && /Rita Souza veio, sim/.test(await N.locator('#hLista').innerText())), 'o histórico mostra o "não veio" e o desfazer');
  await doMais(N, 'clientes');
  ok(await aguarda(async () => /Rita Souza/.test(await N.locator('#cliLista').innerText())), 'a ficha das clientes continua abrindo');
  await c.close();
}

// ===== 5. Privacidade e erros =====
const publico = await (await fetch(BASE)).text();
ok(!/Joana|Maria Silva|Rita Lima|Edilva|988887777|912345678|955554444/.test(publico), 'o HTML público não tem nome nem telefone de cliente');
const respostaPublica = await api.como('anon', null, async () => (await dbBruto.query('select * from public.agenda_publica()')).rows);
ok(!JSON.stringify(respostaPublica).match(/Joana|Maria|Rita|Edilva|988887777|912345678/), 'a agenda pública não entrega nome nem telefone');
// assinatura no fim de todas as páginas (os moldes de imagem em folders/ ficam de fora)
{
  const paginas = [];
  const varrer = (dir) => { for (const n of fs.readdirSync(dir)) { const f = path.join(dir, n); if (['node_modules', '.git', 'folders', 'tests'].includes(n)) continue; if (fs.statSync(f).isDirectory()) varrer(f); else if (n.endsWith('.html')) paginas.push(path.relative(RAIZ, f)); } };
  varrer(RAIZ);
  const sem = paginas.filter((f) => !fs.readFileSync(path.join(RAIZ, f), 'utf8').includes('Desenvolvido por Kevin Laet'));
  ok(paginas.length >= 5 && !sem.length, `assinatura "Desenvolvido por Kevin Laet" em todas as ${paginas.length} páginas` + (sem.length ? ' (faltando: ' + sem.join(', ') + ')' : ''));
  const c = await contexto(IPHONE);
  const p = await c.newPage();
  for (const f of paginas) {
    await p.goto(BASE + f.replace(/index\.html$/, ''), { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(200);
    const v = await p.evaluate(() => { const e = [...document.querySelectorAll('.credito')].find((x) => x.offsetParent !== null); if (!e) return false; const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.bottom <= innerHeight && (t === e || e.contains(t)); });
    ok(v, `assinatura visível e sem nada por cima no fim de ${f}`);
  }
  await c.close();
}
// ===== 5a. Links curtos (/agendar, /limpeza, /auriculo): fáceis de falar, levam direto à agenda =====
{
  const c = await contexto(IPHONE);
  const p = await c.newPage();
  for (const [curto, nome] of [['agendar', null], ['limpeza', 'Limpeza de pele'], ['auriculo', 'Auriculoterapia']]) {
    await p.goto(BASE + curto + '/?o=instagram');
    await p.waitForURL(/#agendar$/);
    await p.waitForSelector('#o-servico .opt');
    const u = new URL(p.url());
    const marcado = await p.locator('#o-servico .opt[aria-pressed="true"]').allInnerTexts();
    ok(u.pathname === new URL(BASE).pathname && u.searchParams.get('o') === 'instagram' && (nome ? u.searchParams.get('s') === curto && marcado.length === 1 && marcado[0].includes(nome) : !u.searchParams.has('s') && !marcado.length),
      `link curto /${curto}: abre a agenda` + (nome ? ` com ${nome.toLowerCase()} já escolhida` : '') + ' e leva junto a origem da visita');
  }
  await c.close();
}

// ===== 5b. O painel só executa o próprio código e só fala com o Supabase (CSP) =====
{
  ok(!violacoes.length, 'o painel inteiro rodou nos testes acima sem nenhuma violação da política de segurança (CSP)' + (violacoes.length ? ': ' + violacoes[0] : ''));
  const c = await contexto(IPHONE);
  const p = await c.newPage();
  await p.goto(BASE + 'admin/');
  const r = await p.evaluate(async () => {
    const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.head.appendChild(s);
    const d = document.createElement('div'); document.body.appendChild(d); d.innerHTML = '<img src="x" onerror="window.__onerror = 1">';
    await new Promise((f) => setTimeout(f, 400));
    let fora = true; try { await fetch('https://coleta-externa.example/dados'); } catch (e) { fora = false; }
    return { inline: window.__inline === 1, onerror: window.__onerror === 1, fora };
  });
  ok(!r.inline && !r.onerror, 'painel: nem script injetado nem "onerror" de imagem executam (um nome de cliente malicioso não roda código)');
  ok(!r.fora, 'painel: não consegue mandar dados para um endereço de fora do Supabase');
  ok(violacoes.length >= 3, 'painel: o navegador registrou os 3 bloqueios (script, onerror e envio para fora)');
  violacoes.length = 0;
  await c.close();
}

// ===== 6. Cookies e medição de visitas =====
{
  const google = [];
  const googleDeMentira = (c) => c.route('https://www.googletagmanager.com/**', (r) => { google.push(r.request().url()); r.fulfill({ contentType: 'text/javascript', body: '' }); });
  // sem o código do Google Analytics no config.js: nem aviso, nem link, nem Google
  const c0 = await contexto(IPHONE);
  await googleDeMentira(c0);
  const s0 = await c0.newPage();
  await s0.goto(BASE, { waitUntil: 'networkidle' });
  ok(!(await s0.locator('.ck').count()) && await s0.locator('footer [data-cookies]').isHidden() && !google.length, 'cookies: sem o código do Google Analytics, não há aviso, link nem medição');
  await c0.close();

  const ID = 'G-TESTE12345';
  const c = await contexto(IPHONE, { ligado: false, medicao: ID });
  await googleDeMentira(c);
  // tudo o que o site entrega para o Google fica registrado aqui, mesmo quando a página sai para o WhatsApp
  const enviados = [];
  await c.exposeFunction('__google', (t) => enviados.push(t));
  await c.addInitScript(() => {
    const dl = [];
    dl.push = function (...itens) { for (const a of itens) window.__google(JSON.stringify(Array.from(a))); return Array.prototype.push.apply(this, itens); };
    window.dataLayer = dl;
  });
  const p = await c.newPage();
  await p.goto(BASE + '?o=cartao&n=Mariazinha&s=limpeza#agendar', { waitUntil: 'networkidle' });
  ok(await p.locator('.ck').isVisible() && await p.locator('.ck [data-ck="sim"]').isVisible() && await p.locator('.ck [data-ck="nao"]').isVisible(), 'cookies: o aviso aparece na primeira visita, com Aceitar e Recusar');
  ok(!google.length && !enviados.length && !(await c.cookies()).some((k) => k.name.startsWith('_ga')), 'cookies: nada vai para o Google antes de a visitante aceitar');
  await p.click('.ck [data-ck="nao"]');
  await p.reload({ waitUntil: 'networkidle' });
  ok(await p.locator('.ck').isHidden() && !google.length && !enviados.length, 'cookies: a recusa fica guardada (sem aviso e sem Google na volta)');
  await p.click('footer [data-cookies]');
  ok(/recusados/.test(await p.locator('.ck').innerText()), 'cookies: o link "Cookies" do rodapé reabre o aviso e mostra a escolha atual');
  await p.click('.ck [data-ck="sim"]');
  await p.waitForFunction(() => document.querySelector('script[src*="googletagmanager"]'));
  ok(google.length === 1 && google[0].includes('id=' + ID), 'cookies: depois de aceitar, o Google Analytics carrega');
  let tudo = enviados.join('\n');
  ok(/utm_source=cartao/.test(tudo) && /utm_medium=qr/.test(tudo), 'cookies: quem chega pelo QR do cartão aparece com a origem "cartao"');
  ok(!/Mariazinha|s=limpeza|[?&]n=/.test(tudo), 'cookies: o nome da cliente e os parâmetros do link não vão para o Google');
  ok(/"ad_storage":"denied"/.test(tudo) && /"allow_google_signals":false/.test(tudo), 'cookies: propaganda e sinais do Google ficam sempre desligados');
  // pedido de horário vira o evento "agendamento" (só com o serviço, sem o nome)
  await p.click('#o-servico .opt >> nth=0'); await p.click('#o-dia .opt >> nth=0'); await p.click('#o-hora .opt >> nth=1'); await p.fill('#nome', 'Mariazinha');
  await Promise.all([p.waitForURL(/wa\.me/), p.click('#go')]);
  await p.waitForTimeout(200);
  tudo = enviados.join('\n');
  ok(/"event","agendamento",\{"servico":"Auriculoterapia"\}/.test(tudo) && !/Mariazinha/.test(tudo), 'cookies: o pedido de horário conta como "agendamento", com o serviço e sem o nome da cliente');
  // a escolha vale também na página de links do Instagram
  await p.goto(BASE + 'links/', { waitUntil: 'networkidle' });
  ok(await p.locator('.ck').count() === 0 && google.length >= 2, 'cookies: a página de links usa a mesma escolha, sem perguntar de novo');
  await Promise.all([p.waitForURL(/wa\.me/), p.click('a.l[href*="wa.me"]')]);
  await p.waitForTimeout(200);
  ok(/"event","contato_whatsapp"/.test(enviados.join('\n')), 'cookies: o toque no WhatsApp conta como "contato_whatsapp"');
  // recusar depois de ter aceitado apaga os cookies do Google
  await p.goto(BASE, { waitUntil: 'networkidle' });
  // como o Google Analytics grava: na raiz do site
  await p.evaluate(() => { document.cookie = '_ga=GA1.1.123.456; path=/'; document.cookie = '_ga_TESTE12345=GS1.1.1; path=/'; });
  ok((await c.cookies()).filter((k) => k.name.startsWith('_ga')).length === 2, 'cookies: (teste) cookies do Google gravados como o Google grava');
  await p.click('footer [data-cookies]');
  await p.click('.ck [data-ck="nao"]');
  ok(!(await c.cookies()).some((k) => k.name.startsWith('_ga')) && await p.evaluate((id) => window['ga-disable-' + id] === true, ID), 'cookies: recusar depois de aceitar desliga a medição e apaga os cookies do Google');
  await c.close();
}

// ===== 5. Studio La Rocha: várias profissionais no mesmo painel =====
{
  const sb = await criarBanco();
  const apiS = criarApi(sb);
  const sq = async (sql, p) => (await apiS.sql(sql, p)).rows;
  await sb.db.exec(`insert into auth.users (email) values ('sandra@teste.com'), ('bia@teste.com')`);
  await sb.db.exec(`update profissionais set email = 'sandra@teste.com' where id = 'sandra'`);
  await sb.db.exec(`insert into profissionais (id, nome, email, papel, ordem) values ('bia', 'Bia Santos', 'bia@teste.com', 'parceira', 3)`);
  await sb.db.exec(`update servicos set desde = null, recurso = case when id = 'limpeza' then 'maca' end`);
  await sb.db.exec(`insert into servicos (id, nome, profissional, duracao, recurso) values ('bia-massagem', 'Massagem', 'bia', 60, 'maca')`);
  const d7 = (await sq(`select (public.agora_sp() + interval '7 days')::date::text d`))[0].d;
  await sb.db.exec(`insert into horarios (data, hora, profissional) values ('${d7}', '14:00', 'amanda'), ('${d7}', '14:00', 'bia'), ('${d7}', '16:00', 'bia')`);
  await sb.db.exec(`update horarios set status = 'confirmado', nome = 'Lia Souza', telefone = '11930000001', servico = 'Limpeza de pele', pedido_em = now() where profissional = 'amanda' and data = '${d7}' and hora = '14:00'`);
  const entrarComo = async (c, email) => { const p = await c.newPage(); await p.goto(BASE + 'admin/'); await p.fill('#email', email); await p.fill('#senha', 'certa'); await p.click('#bLogin'); await p.waitForSelector('#vApp:not([hidden])'); await p.waitForFunction(() => /^Atualizado/.test(document.querySelector('#atualizado').textContent)); return p; };

  // Sandra (sócia)
  const cS = await contexto(ANDROID, { apiDoBanco: apiS });
  const S = await entrarComo(cS, 'sandra@teste.com');
  ok(await S.locator('#visao').isVisible(), 'sócia: aparece a chave "Só a minha agenda / Todas as profissionais"');
  await S.waitForSelector('#ola:not([hidden])');
  ok(/Sandra/.test(await S.locator('#olaT').innerText()), 'Início: a saudação usa o nome de quem entrou (Sandra)');
  ok(await S.locator('#proximos .vazio-bom').isVisible() && /espaço pra novas clientes/.test(await S.locator('#proximos').innerText()) && !/Nenhum/.test(await S.locator('[data-aba="inicio"]').innerText()), 'Início: sem atendimentos, aparece uma mensagem positiva (nada de "Nenhum…")');
  const divulgar = decodeURIComponent(await S.locator('#proximos .vazio-bom a.zap').getAttribute('href'));
  ok(/^https:\/\/wa\.me\/\?text=/.test(divulgar) && /agendar/.test(divulgar), 'Início: o botão "Divulgar" abre o WhatsApp com o link de agendamento');
  ok(await S.locator('#blocoPed').isHidden() && await S.locator('#blocoRet').isHidden(), 'Início: sem pedidos nem retornos, esses blocos nem aparecem');
  await foto(S, 'painel-inicio-vazio', false);
  await aba(S, 'agenda');
  ok((await S.locator('#tAgenda').innerText()) === 'Minha agenda' && (await S.locator('#agenda .s').count()) === 0, 'sócia: começa vendo só a própria agenda (a Sandra ainda não abriu horários)');
  const como = S.locator('[data-aba="agenda"] [data-como-cliente]');
  ok(await como.isVisible() && (await como.getAttribute('target')) === '_blank' && /#agendar$/.test(await como.getAttribute('href')), 'botão "Visualizar agenda como cliente" abre o site como a cliente vê, em outra aba');
  await S.click('[data-visao="todas"]');
  await S.waitForSelector('#agenda .prof-t');
  ok((await S.locator('#tAgenda').innerText()) === 'Agenda de todas as profissionais', 'sócia: em "Todas as profissionais", o título muda');
  const grupos = await S.locator('#agenda .prof-t').allInnerTexts();
  ok(grupos.includes('Amanda Rocha') && grupos.includes('Bia Santos'), 'sócia: vê os horários da Amanda e da Bia, separados por profissional');
  await aba(S, 'inicio');
  ok(/com Lia|com Amanda/.test(await S.locator('#proximos').innerText()), 'sócia: os próximos atendimentos dizem com qual profissional é');
  await formAbrir(S);
  ok(await S.locator('#paraQuemBox').isVisible(), 'sócia: em "Todas", abrir horários pergunta para quem');
  await S.selectOption('#paraQuem', 'bia');
  await S.fill('#novaData', d7);
  await S.click('#bAbrir');
  await S.waitForSelector('#toast:not([hidden])');
  ok((await sq(`select count(*)::int n from horarios where profissional = 'bia' and data = $1 and hora = '13:00'`, [d7]))[0].n === 1 && (await sq(`select count(*)::int n from horarios where profissional = 'sandra'`))[0].n === 0, 'sócia: os horários abertos "para a Bia" entram na agenda da Bia');
  await aba(S, 'mais');
  ok(await S.locator('#mProf').isVisible(), 'sócia: Mais tem a página Profissionais');
  await S.click('#mProf');
  ok((await S.locator('#profLista .card').count()) === 3, 'sócia: a página Profissionais lista a Amanda, a Sandra e a Bia');
  await S.click('[data-visao="minha"]');
  await aba(S, 'agenda');
  await S.waitForFunction(() => document.querySelector('#tAgenda').textContent === 'Minha agenda');
  await S.waitForSelector('#agenda .prof-t', { state: 'detached' }); // a agenda recarrega depois de trocar a visão
  ok((await S.locator('#agenda .prof-t').count()) === 0, 'sócia: voltando para "Só a minha agenda", some a agenda das outras');
  await cS.close();

  // Bia (parceira)
  const cB = await contexto(ANDROID, { apiDoBanco: apiS });
  const B = await entrarComo(cB, 'bia@teste.com');
  ok(await B.locator('#visao').isHidden(), 'parceira: não aparece a chave de ver todas as agendas');
  await aba(B, 'mais');
  ok(await B.locator('#mProf').isHidden(), 'parceira: não vê a página Profissionais');
  await aba(B, 'agenda');
  const horasBia = await B.locator('#agenda .s').count();
  ok(horasBia === (await sq(`select count(*)::int n from horarios where profissional = 'bia'`))[0].n, 'parceira: a agenda mostra só os horários dela');
  // marcar massagem (maca) às 14h, quando a maca está com a Amanda
  const b14 = (await sq(`select id from horarios where profissional = 'bia' and data = $1 and hora = '14:00'`, [d7]))[0].id;
  await B.click(`[data-abrir="${b14}"]`);
  await B.click('#sheet [data-a=perg-ocupar]');
  await B.fill('#fNome', 'Rosa Lima'); await B.selectOption('#fServ', 'Massagem');
  await B.click('#sheet [data-a=ocupar]');
  await B.waitForSelector('#toast:not([hidden])');
  ok(/maca/.test(await B.locator('#toast').innerText()), 'parceira: marcar a maca já ocupada pela Amanda mostra aviso claro de maca ocupada');
  ok((await sq(`select status from horarios where id = $1`, [b14]))[0].status === 'livre', 'e nada é alterado');
  await B.keyboard.press('Escape');
  await doMais(B, 'seguranca');
  ok(/Sua conta/.test(await B.locator('#gStatus').innerText()) && (await B.locator('#gStatus [data-acao="protecao"]').count()) === 0, 'parceira: na Segurança, vê só a própria conta, sem ligar a proteção do salão');
  // cadastro de clientes: sugestão desde a 1ª letra, cadastro travado e correção só pelas sócias
  const cB2 = await contexto(ANDROID, { apiDoBanco: apiS });
  const B2 = await entrarComo(cB2, 'bia@teste.com');
  await aba(B2, 'enviar');
  await B2.fill('#envNome', 'Gisele');
  ok(await B2.locator('#cadBox').isVisible() && await B2.locator('#bCadastrar').isDisabled(), 'cadastro: ao digitar o nome, aparece "Cadastrar como nova cliente", ainda desligado sem o WhatsApp');
  ok(/preencha também o WhatsApp/.test(await B2.locator('#cadDica').innerText()), 'cadastro: e explica o que falta');
  await B2.fill('#envTel', '(11) 94000-1111');
  ok(!(await B2.locator('#bCadastrar').isDisabled()), 'cadastro: com nome e WhatsApp o botão liga');
  await B2.click('#bCadastrar');
  ok(/só a Sandra e a Amanda/.test(await B2.locator('#envio').innerText()), 'cadastro: antes de salvar, avisa que depois só a Sandra e a Amanda alteram');
  await B2.click('#envio [data-acao="cad-confirmar"]');
  await B2.waitForSelector('#toast:not([hidden])');
  ok((await sq(`select nome, profissional from contatos where telefone = '11940001111'`))[0].profissional === 'bia', 'cadastro: a cliente entra na lista da Bia');
  await B2.fill('#envNome', ''); await B2.fill('#envTel', '');
  await B2.fill('#envNome', 'g');
  await B2.waitForSelector('#sug-envNome button');
  ok((await B2.locator('#sug-envNome button').first().innerText()).includes('Gisele'), 'cadastro: a sugestão aparece já na 1ª letra, com o nome e o WhatsApp');
  await B2.fill('#envNome', 'Gi');
  await B2.click('#sug-envNome button');
  ok((await B2.inputValue('#envTel')) === '(11) 94000-1111', 'cadastro: tocando na sugestão, o WhatsApp já vem preenchido');
  ok(/já está cadastrada/.test(await B2.locator('#cadDica').innerText()) && await B2.locator('#bCadastrar').isDisabled(), 'cadastro: uma cliente já cadastrada não é cadastrada de novo');
  await aba(B2, 'mais'); await B2.click('[data-ir="clientes"]');
  await B2.waitForSelector('#cliLista .card');
  const cartao = B2.locator('#cliLista .card', { hasText: 'Gisele' }).first();
  ok(/Cadastro travado/.test(await cartao.innerText()) && (await cartao.locator('[data-acao="contato-editar"]').count()) === 0, 'cadastro: para a parceira o cartão mostra "Cadastro travado" e não oferece editar nem apagar');
  ok((await cartao.locator('a', { hasText: 'Pedir correção' }).count()) === 1, 'cadastro: e oferece "Pedir correção" pelo WhatsApp');
  // story "Horários livres": só os horários livres dela que o site também mostra
  await sb.db.exec(`insert into horarios (data, hora, profissional) select (public.agora_sp() + interval '1 day')::date, h, 'bia' from unnest(array['09:00','10:00','15:30']) h on conflict do nothing`);
  await B2.click('#bAtualizar'); await aba(B2, 'inicio');
  await B2.click('[data-aba="inicio"] [data-acao="story"]');
  await B2.waitForSelector('#envio');
  ok(/não tem horários livres hoje/.test(await B2.locator('#envio').innerText()), 'story: sem horários livres hoje, avisa e oferece o dia seguinte');
  await B2.click('#envio [data-quando="amanha"]');
  await B2.waitForSelector('#envio img.previa-img');
  const dim = await B2.locator('#envio img.previa-img').evaluate((i) => i.complete ? [i.naturalWidth, i.naturalHeight] : new Promise((r) => { i.onload = () => r([i.naturalWidth, i.naturalHeight]); }));
  ok(dim[0] === 1080 && dim[1] === 1920, 'story: a imagem sai com 1080 x 1920, o tamanho do story');
  const txt = await B2.locator('#envio').innerText();
  ok(/3 horários livres: 9h, 10h, 15h30/.test(txt), 'story: lista os horários livres de amanhã');
  ok(!/Bia Santos|Lia|Rosa/.test(txt), 'story: não mostra nenhum nome de cliente');
  await B2.click('#envio [data-acao="fecharEnvio"]');
  await cB2.close();

  const cS2 = await contexto(ANDROID, { apiDoBanco: apiS });
  const S2 = await entrarComo(cS2, 'sandra@teste.com');
  await S2.click('[data-visao="todas"]');
  await S2.waitForSelector('#visao [data-visao="todas"][aria-pressed="true"]');
  await aba(S2, 'mais'); await S2.click('[data-ir="clientes"]');
  await S2.waitForSelector('#cliLista .card');
  const cartaoS = S2.locator('#cliLista .card', { hasText: '(11) 94000-1111' }).first();
  ok(await cartaoS.locator('[data-acao="contato-editar"]').isVisible() && /com Bia/.test(await cartaoS.innerText()), 'cadastro: a Sandra, em "Todas", vê o contato da Bia, com quem é, e pode editar');
  await cartaoS.locator('[data-acao="contato-editar"]').click();
  await S2.fill('#ctNome', 'Gisele Alves Souza');
  await S2.click('#envio [data-acao="contato-salvar"]');
  await S2.waitForSelector('#toast:not([hidden])');
  ok((await sq(`select nome from contatos where telefone = '11940001111'`))[0].nome === 'Gisele Alves Souza', 'cadastro: a Sandra corrige o nome e fica salvo');
  await S2.locator('#cliLista .card', { hasText: 'Gisele Alves Souza' }).first().locator('[data-acao="contato-editar"]').click();
  await S2.click('#envio [data-acao="contato-apagar-perg"]');
  await S2.click('#envio [data-acao="contato-apagar"]');
  await S2.waitForSelector('#toast:not([hidden])');
  ok((await sq(`select count(*)::int n from contatos where telefone = '11940001111'`))[0].n === 0, 'cadastro: a Sandra apaga o contato');
  await cS2.close();
  await cB.close();
}

ok(erros.length === 0, 'nenhum erro de JavaScript nas páginas' + (erros.length ? ': ' + erros.join(' | ') : ''));

await navegador.close();
servidor.close();
fim('ponta a ponta');
process.exit(process.exitCode || 0);
