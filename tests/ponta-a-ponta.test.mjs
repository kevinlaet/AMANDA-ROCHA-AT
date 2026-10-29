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
const { db } = banco;
const api = criarApi(banco);
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
const erros = [];
const agendaJs = fs.readFileSync(path.join(RAIZ, 'agenda.js'), 'utf8').replace(/desde: "\d{4}-\d\d-\d\d"/, `desde: "${D5}"`);
async function contexto(dispositivo, { ligado = true, apiDoBanco = api } = {}) {
  const c = await navegador.newContext({ ...dispositivo, reducedMotion: 'reduce' });
  await c.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ligado ? `window.SUPABASE={url:${JSON.stringify(SUPABASE_URL)},anonKey:${JSON.stringify(ANON_KEY)}};` : 'window.SUPABASE={url:"",anonKey:""};' }));
  await c.route('**/agenda.js', (r) => r.fulfill({ contentType: 'text/javascript', body: agendaJs }));
  await c.route(SUPABASE_URL + '/**', apiDoBanco.tratar);
  await c.route('https://wa.me/**', (r) => r.fulfill({ contentType: 'text/html', body: 'whatsapp' }));
  c.on('page', (p) => p.on('pageerror', (e) => erros.push(p.url() + ': ' + e.message)));
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
// simples para quem nunca usou painel: abre no Início, com guia e abas
ok((await P.locator('[data-aba]:not([hidden])').evaluateAll((e) => e.map((x) => x.dataset.aba))).join() === 'inicio', 'abre na aba Início, só com o que precisa dela agora');
ok(await P.locator('#boasVindas').isVisible(), 'primeira vez: aparece o guia de boas-vindas');
ok((await P.locator('#nPedNav').innerText()) === '3', 'a barra de baixo mostra 3 pedidos no botão Início');
ok((await P.locator('.abas [data-aba-btn]').count()) === 4 && (await P.locator('details.ajuda').count()) === 4, 'são 4 abas, cada uma com "Como usar esta parte"');
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
await banco.como('anon', null, () => db.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Cliente Atrasada', '11977776666')`, [id13]));
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
await banco.como('anon', null, () => db.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Rita Lima', '11955554444')`, [id18]));
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
const [{ h: horaAgora }] = await q(`select to_char(public.agora_sp(), 'HH24:MI') h`);
await P.fill('#novaData', hoje); await P.selectOption('#repetir', '1');
await P.click('#bAbrir');
await P.waitForFunction(() => !document.getElementById('toast').hidden && /(aberto|Nenhum)/.test(document.getElementById('toast').innerText));
const criadosHoje = await q(`select hora from horarios where data = $1 and hora in ('08:00','09:00','10:00','11:00','12:00','13:00','13:30','14:00','15:00','16:00','17:00','18:00','19:00')`, [hoje]);
ok(criadosHoje.every((r) => r.hora > horaAgora), `abrir hoje (${horaAgora}): nenhum horário passado foi criado`);

// o painel de ações abre na tela mesmo com muitos dias abertos
await P.click('#agenda [data-abrir] >> nth=0');
const caixa2 = await caixaDoPainel(P);
ok(caixa2 && caixa2.y >= 0 && caixa2.y + caixa2.height <= vp.height + 1, 'com muitos dias na agenda, o painel de ações continua dentro da tela');
await foto(P, 'painel-acoes', false);
await P.keyboard.press('Escape');
await foto(P, 'painel-completo');
await aba(P, 'inicio');
await P.click('#boasVindas [data-guia-ok]:not([data-ir])');
ok(await P.locator('#boasVindas').isHidden(), '"Já entendi" esconde o guia');
await aba(P, 'agenda');

// sessão
await P.reload(); await P.waitForSelector('#vApp:not([hidden])');
ok(true, 'continua logada depois de recarregar');
ok(await P.locator('[data-aba="agenda"]').isVisible() && (await P.getAttribute('[data-aba-btn="agenda"]', 'aria-current')) === 'page', 'ao recarregar, continua na aba em que estava');
ok(await P.locator('#boasVindas').isHidden(), 'o guia não volta depois de "Já entendi"');
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
  // botão do guia leva direto para abrir horários
  await p.click('#boasVindas [data-abrir-form]');
  ok(await p.locator('[data-aba="agenda"]').isVisible() && await p.locator('#cardAbrir').isVisible() && await p.locator('#boasVindas').isHidden(), 'guia: "Abrir meus horários" vai para a Agenda com o formulário aberto');
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
    const b64 = await p.locator('#envio img.previa-img').evaluate(async (i) => { const r = await fetch(i.src); const buf = new Uint8Array(await r.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s); });
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
  await banco.como('anon', null, () => db.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Beatriz Nunes', '11944443333')`, [idB]));
  await banco.como('anon', null, () => db.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Carla Dias', '11977771111')`, [idC]));
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
  await P2.click('#sheet [data-a=voltar]').catch(() => {}); await P2.click('#sheet [data-a=fechar]').catch(() => {});

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
  await card.locator('a.ir').click();
  ok((await site2.locator('#o-servico .opt[aria-pressed=true]').innerText()).includes('Limpeza de pele') && /R\$ 80/.test(await site2.locator('#o-servico .opt[aria-pressed=true]').innerText()), 'site: "Agendar limpeza de pele" já escolhe o serviço, com o preço');
  ok(/Seu nome e WhatsApp ficam só com a Amanda/.test(await site2.locator('#agendar').innerText()), 'site: aviso de privacidade junto do agendamento');
  // a data de estreia some ao desmarcar a caixinha
  await P2.click('[data-acao=serv-editar][data-serv="limpeza"]');
  await P2.uncheck('#sTemDesde');
  ok(await P2.locator('#sDesdeBox').isHidden(), 'serviços: desmarcar "Só a partir de uma data" esconde a data');
  await P2.click('[data-acao=serv-salvar]');
  ok(await espera(async () => (await q(`select desde from servicos where id = 'limpeza'`))[0].desde === null), 'serviços: e o serviço passa a poder ser marcado desde já');
  await P2.click('[data-acao=serv-editar][data-serv="limpeza"]');
  await P2.check('#sTemDesde'); await P2.click('[data-acao=serv-salvar]');
  await P2.waitForFunction(() => /Escolha a partir de qual dia/.test(document.getElementById('toast').innerText));
  ok(true, 'serviços: marcar a caixinha sem escolher a data pede a data');
  await P2.fill('#sDesde', D5); await P2.click('[data-acao=serv-salvar]');
  ok(await espera(async () => (await q(`select desde::text d from servicos where id = 'limpeza'`))[0].d === D5), 'serviços: data de estreia salva de novo');
  await db.exec(`update servicos set preco = 75, preco_antes = null, preco_obs = 'valor de inauguração' where id = 'limpeza'`);
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
  await banco.como('anon', null, () => db.query(`select public.pedir_horario($1, 'Limpeza de pele', 'Lara Limpeza', '11930001111')`, [id13]));
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
  const qv = async (sql, p) => (await velho.db.query(sql, p)).rows;
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
  ok(errosV.filter((t) => !/Failed to load resource/.test(t)).length === 0, 'banco antigo: nenhum erro no console' + (errosV.filter((t) => !/Failed to load resource/.test(t)).length ? ' (' + errosV.join(' | ') + ')' : ''));
  await c.close();
}

// ===== 4e. Mais: Histórico, Segurança (guardião) e Minha conta =====
{
  const entrar = async (c, senha = 'certa') => { const p = await c.newPage(); await p.goto(BASE + 'admin/'); await p.fill('#email', EMAIL_ADMIN); await p.fill('#senha', senha); await p.click('#bLogin'); await p.waitForSelector('#vApp:not([hidden])'); await p.waitForSelector('#selo:not([hidden])'); return p; };
  const c = await contexto(IPHONE);
  const M = await entrar(c);
  ok((await M.locator('#selo').innerText()) === 'Protegido', 'topo do painel mostra o selo "Protegido" do guardião');
  ok(await M.locator('#bancoVelho').isHidden(), 'com o banco atualizado, não aparece aviso de atualização');
  await aba(M, 'mais');
  ok((await M.locator('[data-aba="mais"] .lista [data-ir]').count()) === 6, 'Mais tem 6 páginas: Clientes, Serviços, Histórico, Segurança, Como funciona e Minha conta');
  ok(await M.locator('#nMais').isVisible(), 'o botão Mais avisa que há alertas novos (logins de outros aparelhos nos testes)');

  // clientes
  await doMais(M, 'clientes');
  await M.waitForSelector('#cliLista .cli');
  const bea = M.locator('#cliLista .cli', { hasText: 'Beatriz Nunes' });
  ok((await bea.count()) === 1 && /\(11\) 95555-0000/.test(await bea.innerText()) && /próximo/.test(await bea.innerText()), 'Clientes: ficha com WhatsApp e próximo horário');
  ok((await bea.locator('a.btn').getAttribute('href')).startsWith('https://wa.me/5511955550000'), 'Clientes: botão abre o WhatsApp da cliente');
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
  const convite = decodeURIComponent((await M.locator('#cliLista .cli a.btn').getAttribute('href')).split('text=')[1]);
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

  // proteção ligada na mão: o site leva a cliente direto para o WhatsApp
  await M.click('#gStatus [data-acao=protecao]');
  await M.waitForFunction(() => /Proteção ligada/.test(document.getElementById('selo').textContent));
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
  await M.waitForFunction(() => document.getElementById('selo').textContent === 'Protegido');
  ok((await q('select pausado from guardiao'))[0].pausado === false, 'Amanda religa o agendamento pelo site');

  // sair dos outros aparelhos
  const c2 = await contexto(IPHONE);
  const O = await entrar(c2);
  await M.reload(); await M.waitForSelector('#selo:not([hidden])');
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

  // sessão de 12 horas
  await M.evaluate(() => { const s = JSON.parse(localStorage.getItem('amanda-sess')); s.inicio = Date.now() - 13 * 3600 * 1000; localStorage.setItem('amanda-sess', JSON.stringify(s)); });
  await M.reload();
  await M.waitForSelector('#vLogin:not([hidden])');
  ok(/a cada 12 horas/.test(await M.locator('#mLogin').innerText()), 'depois de 12 horas o painel pede a senha de novo, explicando o motivo');
  await c.close();

  // acesso estranho (um programa logado com a senha dela): desconecta todos os aparelhos
  const c4 = await contexto(IPHONE);
  const E = await entrar(c4);
  await q(`insert into auth.sessions (user_id, user_agent) select id, 'python-requests/2.31' from auth.users where email = $1`, [EMAIL_ADMIN]);
  await E.click('#bAtualizar');
  await E.waitForSelector('#vLogin:not([hidden])');
  ok(/acesso estranho/.test(await E.locator('#mLogin').innerText()), 'acesso de um programa automático: o painel desconecta e pede a senha');
  ok((await q(`select count(*)::int n from auth.sessions s join auth.users u on u.id = s.user_id where u.email = $1`, [EMAIL_ADMIN]))[0].n === 0, 'e todas as sessões, inclusive a do invasor, são encerradas');
  await c4.close();
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

// ===== 5. Privacidade e erros =====
const publico = await (await fetch(BASE)).text();
ok(!/Joana|Maria Silva|Rita Lima|Edilva|988887777|912345678|955554444/.test(publico), 'o HTML público não tem nome nem telefone de cliente');
const respostaPublica = await banco.como('anon', null, () => q('select * from public.agenda_publica()'));
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
ok(erros.length === 0, 'nenhum erro de JavaScript nas páginas' + (erros.length ? ': ' + erros.join(' | ') : ''));

await navegador.close();
servidor.close();
fim('ponta a ponta');
process.exit(process.exitCode || 0);
