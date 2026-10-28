// Fluxo completo: site das clientes + painel da Amanda, num navegador de verdade,
// falando com o PostgreSQL real (via tests/postgrest.mjs).
// As páginas são servidas em /AMANDA-ROCHA-AT/, o mesmo caminho do GitHub Pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import { criarBanco, placar, RAIZ, EMAIL_ADMIN } from './banco.mjs';
import { criarApi, SUPABASE_URL, ANON_KEY } from './postgrest.mjs';

const { ok, fim } = placar();
const CAPTURAS = process.env.CAPTURAS || '';
const foto = async (pagina, nome, inteira = true) => { if (CAPTURAS) await pagina.screenshot({ path: path.join(CAPTURAS, nome + '.png'), fullPage: inteira }); };

// ---------- servidor estático ----------
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const PREFIXO = '/AMANDA-ROCHA-AT';
const servidor = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
const q = async (s, p) => (await db.query(s, p)).rows;
const dia = async (n) => (await q(`select (public.agora_sp() + interval '${n} days')::date::text d`))[0].d;
const D3 = await dia(3), D5 = await dia(5), D10 = await dia(10);
await db.exec(`alter table horarios disable trigger trg_horario_passado`);
await db.exec(`insert into horarios (data, hora) select '${D3}'::date, h from unnest(array['13:00','14:00','15:00']) h`);
await db.exec(`insert into horarios (data, hora) select '${D10}'::date, h from unnest(array['13:00','16:00']) h`);
await db.exec(`insert into horarios (data, hora) select d::date, to_char(d, 'HH24:MI') from (select public.agora_sp() - interval '2 hours' d union all select public.agora_sp() + interval '30 minutes') t on conflict do nothing`);
await db.exec(`alter table horarios enable trigger trg_horario_passado`);
const horario = async (data, hora) => (await q(`select * from horarios where data = $1 and hora = $2`, [data, hora]))[0];
// abre um horário específico no painel (pelo id, sem depender do texto do botão)
const noPainel = async (pagina, data, hora) => pagina.click(`[data-abrir="${(await horario(data, hora)).id}"]`);
// espera a animação de subida do painel de ações terminar e devolve a posição dele
const caixaDoPainel = async (pagina) => { await pagina.locator('#sheet').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished))); return pagina.locator('#sheet').boundingBox(); };

// ---------- navegador ----------
const navegador = await chromium.launch();
const erros = [];
const agendaJs = fs.readFileSync(path.join(RAIZ, 'agenda.js'), 'utf8').replace(/desde: "\d{4}-\d\d-\d\d"/, `desde: "${D5}"`);
async function contexto(dispositivo, { ligado = true } = {}) {
  const c = await navegador.newContext({ ...dispositivo });
  await c.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ligado ? `window.SUPABASE={url:${JSON.stringify(SUPABASE_URL)},anonKey:${JSON.stringify(ANON_KEY)}};` : 'window.SUPABASE={url:"",anonKey:""};' }));
  await c.route('**/agenda.js', (r) => r.fulfill({ contentType: 'text/javascript', body: agendaJs }));
  await c.route(SUPABASE_URL + '/**', api.tratar);
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
  ok((await p.locator('#goTxt').innerText()) === 'Enviar pelo WhatsApp', 'sem Supabase: botão diz "Enviar pelo WhatsApp"');
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
ok((await A.locator('#goTxt').innerText()) === 'Reservar meu horário', 'com Supabase: botão diz "Reservar meu horário"');
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
await banco.como('anon', null, () => db.query(`select public.pedir_horario($1, 'Limpeza de pele', 'Cliente Atrasada', '11977776666')`, [id13]));
await P.click('#sheet [data-a=perg-ocupar]');
await P.fill('#nomeFora', 'Dona Edilva');
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
await P.click('#sheet [data-a=perg-ocupar]'); await P.fill('#nomeFora', 'Dona Edilva'); await P.click('#sheet [data-a=ocupar]');
await P.waitForSelector('#sheet', { state: 'hidden' });
ok((await horario(D3, '15:00')).nome === 'Dona Edilva', 'marcar como ocupado guarda o nome digitado');
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
await P.route(SUPABASE_URL + '/rest/v1/horarios?**', (r) => (r.request().method() === 'PATCH' ? r.abort() : r.fallback()));
await P.locator('#pedidos .ped', { hasText: 'Rita' }).locator('[data-a=confirmar]').click();
await P.waitForFunction(() => /Sem conexão. Nada foi alterado/.test(document.getElementById('toast').innerText));
ok((await horario(D10, '18:00')).status === 'pedido', 'sem internet: nada é alterado e ela é avisada');
ok(!(await P.locator('#pedidos .ped', { hasText: 'Rita' }).locator('[data-a=confirmar]').isDisabled()), 'e os botões voltam a funcionar');
await P.unroute(SUPABASE_URL + '/rest/v1/horarios?**');

// abrir horários: vários sábados, horário quebrado, prévia antes
const inicio = await dia(14);
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
await P.click('[data-abrir] >> nth=0');
const caixa2 = await caixaDoPainel(P);
ok(caixa2 && caixa2.y >= 0 && caixa2.y + caixa2.height <= vp.height + 1, 'com muitos dias na agenda, o painel de ações continua dentro da tela');
await foto(P, 'painel-acoes', false);
await P.keyboard.press('Escape');
await foto(P, 'painel-completo');

// sessão
await P.reload(); await P.waitForSelector('#vApp:not([hidden])');
ok(true, 'continua logada depois de recarregar');
await P.click('#bSair');
ok(await P.locator('#vLogin').isVisible(), 'sair volta para o login');

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

// ===== 5. Privacidade e erros =====
const publico = await (await fetch(BASE)).text();
ok(!/Joana|Maria Silva|Rita Lima|Edilva|988887777|912345678|955554444/.test(publico), 'o HTML público não tem nome nem telefone de cliente');
const respostaPublica = await banco.como('anon', null, () => q('select * from public.agenda_publica()'));
ok(!JSON.stringify(respostaPublica).match(/Joana|Maria|Rita|Edilva|988887777|912345678/), 'a agenda pública não entrega nome nem telefone');
ok(erros.length === 0, 'nenhum erro de JavaScript nas páginas' + (erros.length ? ': ' + erros.join(' | ') : ''));

await navegador.close();
servidor.close();
fim('ponta a ponta');
process.exit(process.exitCode || 0);
