// Regras do banco (supabase/schema.sql) rodando num PostgreSQL de verdade.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { criarBanco, placar, RAIZ, EMAIL_ADMIN } from './banco.mjs';

const { ok, fim } = placar();
const tenta = async (p) => { try { return { linhas: await p }; } catch (e) { return { erro: e.message }; } };

// 0. Proteção contra esquecer de trocar o e-mail
{
  const db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;`);
  const r = await tenta(db.exec(fs.readFileSync(path.join(RAIZ, 'supabase/schema.sql'), 'utf8')));
  ok(r.erro && /Troque SEU_EMAIL_AQUI/.test(r.erro), 'rodar sem trocar o e-mail da Amanda é bloqueado');
  const t = (await db.query(`select count(*)::int n from pg_tables where tablename = 'horarios'`)).rows[0].n;
  ok(t === 0, 'e nada é criado pela metade');
}

const { db, como } = await criarBanco();
const q = async (s, p) => (await db.query(s, p)).rows;

// 1. Fuso
const [{ sp, utc }] = await q(`select public.agora_sp()::text sp, (now() at time zone 'utc')::text utc`);
console.log('   agora em São Paulo:', sp, '| UTC:', utc);
ok(sp !== utc, 'relógio do banco usa o fuso de São Paulo');

// Cenário: horários relativos a agora (desliga a trava de passado só para montar)
await db.exec(`alter table horarios disable trigger trg_horario_passado`);
const criar = async (min) => (await q(
  `insert into horarios (data, hora)
   select d::date, to_char(d, 'HH24:MI') from (select public.agora_sp() + ($1 || ' minutes')::interval d) t
   returning id`, [String(min)]))[0].id;
const passado = await criar(-120), em30 = await criar(30), em90 = await criar(90), amanha = await criar(60 * 26);
await db.exec(`alter table horarios enable trigger trg_horario_passado`);

// 2. O que o site enxerga
const pub = await como('anon', null, () => q('select * from public.agenda_publica()'));
const ids = new Set(pub.map((r) => r.id));
ok(!ids.has(passado), 'horário que já passou não aparece no site');
ok(!ids.has(em30), 'horário que começa em 30 min não aparece (antecedência de 1 h)');
ok(ids.has(em90) && ids.has(amanha), 'horários futuros aparecem');
ok(pub.length && Object.keys(pub[0]).sort().join() === 'data,hora,id,status', 'site recebe só id, dia, hora e status');

// 3. Quem pode ver o quê
for (const t of ['horarios', 'historico', 'admins']) {
  const r = await como('anon', null, () => tenta(q(`select * from ${t}`)));
  ok(!!r.erro, `visitante não lê a tabela ${t}`);
}
const outra = await como('authenticated', 'outra@pessoa.com', () => q('select * from horarios'));
ok(outra.length === 0, 'outra pessoa logada não vê nenhum horário');
const outraAltera = await como('authenticated', 'outra@pessoa.com', () => tenta(q(`update horarios set status = 'confirmado', nome = 'x' returning id`)));
ok(!outraAltera.linhas || outraAltera.linhas.length === 0, 'outra pessoa logada não altera nada');
const outraCria = await como('authenticated', 'outra@pessoa.com', () => tenta(q(`insert into horarios (data, hora) values (current_date + 20, '10:00')`)));
ok(!!outraCria.erro, 'outra pessoa logada não cria horário');
ok((await como('authenticated', 'outra@pessoa.com', () => q('select public.sou_admin() a')))[0].a === false, 'sou_admin() é falso para outra pessoa');
ok((await como('authenticated', EMAIL_ADMIN.toUpperCase(), () => q('select public.sou_admin() a')))[0].a === true, 'sou_admin() reconhece a Amanda mesmo com e-mail em maiúsculas');
ok((await como('authenticated', EMAIL_ADMIN, () => q('select * from horarios'))).length === 4, 'Amanda vê todos os horários');
ok(!!(await como('anon', null, () => tenta(q('select public.sou_admin()')))).erro, 'visitante não consulta sou_admin()');

// 4. Pedido de horário
const pedir = (id, servico, nome, tel) => como('anon', null, async () => (await q('select public.pedir_horario($1, $2, $3, $4) r', [id, servico, nome, tel]))[0].r);
ok(await pedir(em90, 'Auriculoterapia', 'Maria Silva', '(11) 91234-5678') === 'ok', 'pedido válido é aceito');
ok(await pedir(em90, 'Limpeza de pele', 'Joana', '11 98888-7777') === 'indisponivel', 'segunda cliente no mesmo horário é recusada');
const linha = (await q('select * from horarios where id = $1', [em90]))[0];
ok(linha.status === 'pedido' && linha.nome === 'Maria Silva' && linha.telefone === '11912345678', 'dados da primeira cliente ficam intactos e o telefone é normalizado');
ok(await pedir(passado, 'Auriculoterapia', 'Maria', '11912345678') === 'indisponivel', 'horário passado é recusado');
ok(await pedir(em30, 'Auriculoterapia', 'Maria', '11912345678') === 'indisponivel', 'horário a menos de 1 h é recusado');
ok(await pedir(amanha, 'Auriculoterapia', 'A', '11912345678') === 'dados', 'nome curto é recusado');
ok(await pedir(amanha, 'Auriculoterapia', 'Ana Souza', '123') === 'dados', 'telefone inválido é recusado');
ok(await pedir(amanha, '', 'Ana Souza', '11912345678') === 'dados', 'pedido sem serviço é recusado');
ok(await pedir('00000000-0000-0000-0000-000000000000', 'Auriculoterapia', 'Ana Souza', '11912345678') === 'indisponivel', 'horário inexistente é recusado');
ok(await pedir(amanha, 'Auriculoterapia', 'Ana Souza', '+55 (11) 97777-6666') === 'ok', 'telefone com +55 é aceito');
ok((await q('select telefone from horarios where id = $1', [amanha]))[0].telefone === '11977776666', 'e guardado sem o +55');

// limite por telefone
await db.exec(`insert into horarios (data, hora) select (public.agora_sp() + interval '3 days')::date, h from unnest(array['13:00', '14:00', '15:00']) h`);
const dia3 = await q(`select id from horarios where data = (public.agora_sp() + interval '3 days')::date order by hora`);
ok(await pedir(dia3[0].id, 'Auriculoterapia', 'Maria Silva', '11912345678') === 'ok', 'segundo horário da mesma cliente é aceito');
ok(await pedir(dia3[1].id, 'Auriculoterapia', 'Maria Silva', '11912345678') === 'limite', 'terceiro horário do mesmo telefone é recusado');

// muitos pedidos no mesmo horário: só um vence
const resultados = await Promise.all(Array.from({ length: 20 }, (_, i) => pedir(dia3[2].id, 'Auriculoterapia', 'Cliente ' + i, '119' + String(10000000 + i))));
ok(resultados.filter((r) => r === 'ok').length === 1, '20 pedidos no mesmo horário: exatamente 1 é aceito');

// 5. Integridade
const erroDe = async (sql) => !!(await tenta(q(sql))).erro;
ok(await erroDe(`insert into horarios (data, hora, status, nome) values (current_date + 10, '10:00', 'livre', 'Fulano')`), 'horário livre com nome de cliente é recusado');
ok(await erroDe(`insert into horarios (data, hora, status) values (current_date + 10, '10:00', 'pedido')`), 'pedido sem nome é recusado');
ok(await erroDe(`insert into horarios (data, hora) values (current_date + 10, '25:00')`), 'hora 25:00 é recusada');
ok(await erroDe(`insert into horarios (data, hora) values (current_date + 10, '9:00')`), 'hora sem zero (9:00) é recusada');
ok(await erroDe(`insert into horarios (data, hora, status, nome, telefone) values (current_date + 10, '10:00', 'pedido', 'Ana', '12ab')`), 'telefone com letras é recusado');
ok(await erroDe(`insert into horarios (data, hora, status, nome) values (current_date + 10, '10:00', 'pedido', repeat('a', 61))`), 'nome com mais de 60 letras é recusado');
await db.exec(`insert into horarios (data, hora) values ((public.agora_sp() + interval '5 days')::date, '13:00')`);
ok(await erroDe(`insert into horarios (data, hora) values ((public.agora_sp() + interval '5 days')::date, '13:00')`), 'horário duplicado é recusado');
const mistura = await q(`insert into horarios (data, hora) values ((public.agora_sp() - interval '1 day')::date, '10:00'), ((public.agora_sp() + interval '9 days')::date, '10:00') returning id`);
ok(mistura.length === 1, 'abrir horário passado junto com futuro: só o futuro entra, sem erro');
const pelaAmanda = await como('authenticated', EMAIL_ADMIN, () => tenta(q(`insert into horarios (data, hora) values ((public.agora_sp() - interval '1 day')::date, '11:00'), ((public.agora_sp() + interval '9 days')::date, '11:00') returning id`)));
ok(pelaAmanda.linhas && pelaAmanda.linhas.length === 1, 'o mesmo vale quando a Amanda abre pelo painel' + (pelaAmanda.erro ? ': ' + pelaAmanda.erro : ''));
ok(await como('authenticated', EMAIL_ADMIN, () => erroDe(`update horarios set status = 'livre' where id = '${amanha}'`)), 'voltar a livre sem apagar os dados da cliente é recusado');
ok(await como('anon', null, () => erroDe(`update horarios set status = 'livre'`)), 'visitante não altera a tabela');

// 6. Histórico
await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set status = 'confirmado' where id = $1`, [em90]));
await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set status = 'livre', nome = null, servico = null, telefone = null, pedido_em = null where id = $1`, [em90]));
const hist = await q(`select de, para, nome, quem from historico where horario_id = $1 order by id`, [em90]);
ok(hist.length === 4, 'histórico guarda criação, pedido, confirmação e liberação (' + hist.length + ' registros)');
ok(hist[1] && hist[1].para === 'pedido' && hist[1].quem === 'site' && hist[1].nome === 'Maria Silva', 'pedido pelo site fica registrado com o nome da cliente');
ok(hist[2] && hist[2].para === 'confirmado' && hist[2].quem === EMAIL_ADMIN, 'confirmação fica registrada com o e-mail da Amanda');
ok(hist[3] && hist[3].para === 'livre' && hist[3].nome === 'Maria Silva', 'liberação guarda quem era a cliente');
ok((await como('authenticated', EMAIL_ADMIN, () => q('select * from historico'))).length > 0, 'Amanda consegue ler o histórico');
ok(!!(await como('authenticated', EMAIL_ADMIN, () => tenta(q(`delete from historico`)))).erro, 'nem a Amanda consegue apagar o histórico');

// 6b. Serviços
const pubServ = await como('anon', null, () => q('select * from public.servicos_publicos()'));
ok(pubServ.length === 2 && pubServ[0].id === 'auriculo', 'site recebe os 2 serviços na ordem certa');
ok(!!(await como('anon', null, () => tenta(q('select * from servicos')))).erro, 'visitante não lê a tabela de serviços');
await como('authenticated', EMAIL_ADMIN, () => q(`update servicos set ativo = false where id = 'limpeza'`));
ok((await como('anon', null, () => q('select * from public.servicos_publicos()'))).length === 1, 'serviço escondido some do site');
await como('authenticated', EMAIL_ADMIN, () => q(`insert into servicos (id, nome, detalhe, ordem) values ('massagem', 'Massagem', 'Relaxante', 3)`));
ok((await como('anon', null, () => q('select * from public.servicos_publicos()'))).some((x) => x.id === 'massagem'), 'Amanda adiciona um serviço e ele aparece no site');
ok(!!(await como('authenticated', 'outra@pessoa.com', () => tenta(q(`insert into servicos (id, nome) values ('xx', 'Invasor')`)))).erro, 'outra pessoa não cria serviço');
ok(!!(await tenta(q(`insert into servicos (id, nome) values ('Com Espaço', 'Nome')`))).erro, 'código de serviço inválido é recusado');
await como('authenticated', EMAIL_ADMIN, () => q(`update servicos set ativo = true where id = 'limpeza'`));

// 6c. Remarcar
await db.exec(`insert into horarios (data, hora) select (public.agora_sp() + interval '6 days')::date, h from unnest(array['10:00', '11:00', '12:00']) h`);
const d6 = await q(`select id, hora from horarios where data = (public.agora_sp() + interval '6 days')::date order by hora`);
await pedir(d6[0].id, 'Auriculoterapia', 'Rosa Lima', '11933334444');
await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set status = 'confirmado', lembrete_em = now() where id = $1`, [d6[0].id]));
const rem = (id1, id2, email = EMAIL_ADMIN) => como('authenticated', email, async () => (await q('select public.remarcar($1, $2) r', [id1, id2]))[0].r);
ok(await rem(d6[0].id, d6[1].id) === 'ok', 'remarcar para um horário livre funciona');
const [de, para] = [(await q('select * from horarios where id = $1', [d6[0].id]))[0], (await q('select * from horarios where id = $1', [d6[1].id]))[0]];
ok(de.status === 'livre' && de.nome === null && para.status === 'confirmado' && para.nome === 'Rosa Lima' && para.telefone === '11933334444', 'a cliente vai inteira para o novo horário e o antigo fica livre');
ok(para.lembrete_em === null, 'o lembrete volta a ficar pendente no novo horário');
await pedir(d6[2].id, 'Auriculoterapia', 'Outra Cliente', '11922223333');
ok(await rem(d6[1].id, d6[2].id) === 'indisponivel', 'remarcar para horário ocupado é recusado');
ok((await q('select nome from horarios where id = $1', [d6[1].id]))[0].nome === 'Rosa Lima', 'e a cliente continua no horário dela');
ok(await rem(d6[0].id, d6[1].id) === 'origem', 'remarcar a partir de horário livre é recusado');
ok(await rem(d6[1].id, d6[0].id, 'outra@pessoa.com') === 'sem_acesso' && (await q('select nome from horarios where id = $1', [d6[1].id]))[0].nome === 'Rosa Lima', 'outra pessoa não consegue remarcar');
ok((await q(`select count(*)::int n from alertas where tipo = 'intruso' and detalhe like '%outra@pessoa.com%'`))[0].n === 1, 'e o guardião registra um alerta grave com a conta que tentou');
ok(!!(await como('anon', null, () => tenta(q('select public.remarcar($1, $2)', [d6[1].id, d6[0].id])))).erro, 'visitante não consegue remarcar');

// 6d. Mudar dia ou hora
ok(!!(await como('authenticated', EMAIL_ADMIN, () => tenta(q(`update horarios set data = current_date - 2 where id = $1`, [d6[0].id])))).erro, 'mudar um horário para o passado é recusado');
const mv = await como('authenticated', EMAIL_ADMIN, () => tenta(q(`update horarios set hora = '10:30' where id = $1 returning hora`, [d6[0].id])));
ok(mv.linhas && mv.linhas[0].hora === '10:30', 'mudar a hora de um horário livre funciona');
ok(!!(await como('authenticated', EMAIL_ADMIN, () => tenta(q(`update horarios set hora = '11:00' where id = $1`, [d6[0].id])))).erro, 'mudar para um horário que já existe é recusado');
ok(!!(await tenta(q(`update horarios set lembrete_em = now() where id = $1`, [d6[0].id]))).erro, 'horário livre não pode ter lembrete marcado');

// 7. Rodar o schema de novo não perde nada
const antes = (await q('select count(*)::int n from horarios'))[0].n;
const r2 = await tenta(db.exec(fs.readFileSync(path.join(RAIZ, 'supabase/schema.sql'), 'utf8').replaceAll('SEU_EMAIL_AQUI', EMAIL_ADMIN)));
ok(!r2.erro, 'rodar o schema de novo não dá erro' + (r2.erro ? ': ' + r2.erro : ''));
ok((await q('select count(*)::int n from horarios'))[0].n === antes, 'e não perde nenhum horário');

// 8. Atualização aplicada em bancos que já existiam (caso real do Supabase da Amanda)
const ATUALIZACAO = fs.readFileSync(path.join(RAIZ, 'supabase/atualizacao.sql'), 'utf8');
{
  const sch = fs.readFileSync(path.join(RAIZ, 'supabase/schema.sql'), 'utf8'), marca = '-- >>> ATUALIZAÇÕES';
  ok(sch.slice(sch.indexOf(marca)) === ATUALIZACAO.slice(ATUALIZACAO.indexOf(marca)), 'o bloco de atualizações é idêntico no schema.sql e no atualizacao.sql');
}
for (const [rotulo, extras] of [['antes da atualização 2', []], ['depois da atualização 2', ['tests/fixtures/atualizacao-2.sql']]]) {
  const velho = await criarBanco({ schema: path.join(RAIZ, 'tests/fixtures/schema-antes-da-atualizacao-2.sql') });
  for (const f of extras) await velho.db.exec(fs.readFileSync(path.join(RAIZ, f), 'utf8'));
  await velho.db.exec(`insert into horarios (data, hora) values ((public.agora_sp() + interval '4 days')::date, '13:00'), ((public.agora_sp() + interval '4 days')::date, '14:00')`);
  const ids = (await velho.db.query(`select id from horarios order by hora`)).rows.map((r) => r.id);
  await velho.como('anon', null, () => velho.db.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Ana Paula', '11955556666')`, [ids[0]]));
  const r = await tenta(velho.db.exec(ATUALIZACAO));
  ok(!r.erro, `atualização roda em cima do banco ${rotulo} sem erro` + (r.erro ? ': ' + r.erro : ''));
  ok((await velho.db.query(`select nome from horarios where id = $1`, [ids[0]])).rows[0].nome === 'Ana Paula', `e não perde o pedido que já existia (${rotulo})`);
  const r2 = await tenta(velho.db.exec(ATUALIZACAO));
  ok(!r2.erro, `rodar a atualização duas vezes não dá erro (${rotulo})`);
  ok((await velho.como('authenticated', EMAIL_ADMIN, async () => (await velho.db.query('select public.remarcar($1, $2) r', [ids[0], ids[1]])).rows[0].r)) === 'ok', `depois da atualização, remarcar funciona (${rotulo})`);
  ok((await velho.como('anon', null, async () => (await velho.db.query('select * from public.servicos_publicos()')).rows)).length === 2, `depois da atualização, o site recebe os serviços (${rotulo})`);
  ok((await velho.como('anon', null, async () => (await velho.db.query('select public.guardiao_publico() g')).rows[0].g)).versao === 3, `depois da atualização, o guardião está ativo (${rotulo})`);
}

// 9. Guardião do banco
{
  const recomeca = () => db.exec(`update guardiao set contar_desde = now(), pausado = false`);
  const novoDia = async (dias, horas) => { await db.exec(`insert into horarios (data, hora) select (public.agora_sp() + interval '${dias} days')::date, h from unnest(array[${horas.map((h) => `'${h}'`).join(',')}]) h on conflict do nothing`); return (await q(`select id from horarios where data = (public.agora_sp() + interval '${dias} days')::date and status = 'livre' order by hora`)).map((r) => r.id); };
  const pedirDe = (ip, id, nome, tel, servico = 'Auriculoterapia') => como('anon', null, async () => (await q('select public.pedir_horario($1, $2, $3, $4) r', [id, servico, nome, tel]))[0].r, { cabecalhos: ip ? { 'x-forwarded-for': ip + ', 10.0.0.1' } : {} });
  await recomeca();

  // serviço e data de estreia valem também no banco (não só na tela)
  await db.exec(`update servicos set desde = current_date + 30 where id = 'limpeza'`);
  const g1 = await novoDia(12, ['09:00', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30', '17:30', '18:30', '19:30']);
  ok(await pedirDe(null, g1[0], 'Bruna Alves', '11960000001', 'Limpeza de pele') === 'indisponivel', 'limpeza de pele antes da data de estreia é recusada pelo banco');
  ok(await pedirDe(null, g1[0], 'Bruna Alves', '11960000001', 'Massagem que não existe') === 'servico', 'serviço que não está no site é recusado');
  await db.exec(`update servicos set ativo = false where id = 'massagem'`);
  ok(await pedirDe(null, g1[0], 'Bruna Alves', '11960000001', 'Massagem') === 'servico', 'serviço escondido do site é recusado');
  ok(await pedirDe(null, g1[0], 'Ganhe pix em www.golpe.com', '11960000001') === 'dados', 'nome com endereço de site é recusado');
  ok(await pedirDe(null, g1[0], 'Bruna Alves', '11111111111') === 'dados', 'telefone com todos os números iguais é recusado');
  ok(await pedirDe(null, g1[0], 'Bru​na‮  Alves\t', '11960000001', 'auriculoterapia') === 'ok', 'pedido com nome sujo e serviço em minúsculas é aceito');
  const limpa = (await q('select nome, servico from horarios where id = $1', [g1[0]]))[0];
  ok(limpa.nome === 'Bruna Alves' && limpa.servico === 'Auriculoterapia', 'nome guardado sem caracteres invisíveis e serviço com o nome oficial (' + JSON.stringify(limpa) + ')');

  // limite por aparelho/rede (a origem é guardada embaralhada)
  await recomeca();
  const r4 = [];
  for (let i = 1; i <= 4; i++) r4.push(await pedirDe('200.1.1.1', g1[i], 'Cliente Rede ' + i, '1196000001' + i));
  ok(r4.every((r) => r === 'ok'), '4 pedidos da mesma rede em 1 hora são aceitos');
  ok(await pedirDe('200.1.1.1', g1[5], 'Cliente Rede 5', '11960000015') === 'limite', 'o 5º pedido da mesma rede na mesma hora é barrado');
  ok(await pedirDe('200.9.9.9', g1[5], 'Outra Rede', '11960000016') === 'ok', 'outra rede continua marcando normalmente');
  const origens = (await q(`select distinct origem from eventos where origem <> 'desconhecida'`)).map((r) => r.origem);
  ok(origens.length >= 2 && origens.every((o) => /^[0-9a-f]{16}$/.test(o)), 'a origem é guardada embaralhada, nunca o IP');

  // enxurrada: o guardião liga a proteção sozinho
  await recomeca();
  const g2 = await novoDia(13, ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  const r7 = [];
  for (let i = 0; i < 7; i++) r7.push(await pedirDe('201.0.0.' + i, g2[i], 'Enxurrada ' + i, '1197000000' + i));
  const est = (await q('select pausado, pausado_por from guardiao'))[0];
  ok(r7.filter((r) => r === 'ok').length === 7 && est.pausado && est.pausado_por === 'guardião', '7 pedidos em poucos minutos: o guardião liga a proteção sozinho');
  ok((await q(`select count(*)::int n from alertas where tipo = 'enxurrada' and nivel = 'grave'`))[0].n === 1, 'e cria um alerta grave para a Amanda');
  ok(await pedirDe('201.0.1.1', g2[7], 'Depois da Proteção', '11970000099') === 'pausado', 'com a proteção ligada, o pedido responde "pausado" (o site leva ao WhatsApp)');
  ok((await q('select status from horarios where id = $1', [g2[7]]))[0].status === 'livre', 'e o horário continua livre');
  ok((await como('anon', null, () => q('select * from public.agenda_publica()'))).length > 0, 'a agenda continua aparecendo no site');
  const pub = (await como('anon', null, () => q('select public.guardiao_publico() g')))[0].g;
  ok(pub.pausado === true && pub.graves >= 1 && Object.keys(pub).sort().join() === 'graves,pausado,versao', 'guardião público mostra só a situação, sem dados (' + JSON.stringify(pub) + ')');
  ok(!!(await como('anon', null, () => tenta(q('select public.definir_protecao(false)')))).erro, 'visitante não desliga a proteção');
  ok((await como('authenticated', 'outra@pessoa.com', () => q('select public.definir_protecao(false) s')))[0].s === null && (await q('select pausado from guardiao'))[0].pausado, 'outra conta também não desliga');
  const sit = (await como('authenticated', EMAIL_ADMIN, () => q('select public.definir_protecao(false) s')))[0].s;
  ok(sit && sit.pausado === false, 'a Amanda religa o agendamento pelo painel');
  ok(await pedirDe('201.0.1.2', g2[7], 'Depois de Religar', '11970000098') === 'ok', 'depois de religar, a contagem recomeça e o pedido é aceito');
  ok((await como('authenticated', EMAIL_ADMIN, () => q('select public.definir_protecao(true) s')))[0].s.pausado === true, 'a Amanda também pode ligar a proteção na mão');
  await como('authenticated', EMAIL_ADMIN, () => q('select public.definir_protecao(false)'));

  // sondagem: muitos horários que não existem
  await recomeca();
  const antesZero = (await q('select count(*)::int n from eventos'))[0].n;
  await pedirDe('202.0.0.1', '00000000-0000-0000-0000-000000000000', 'Teste de conferência', '11900000000');
  ok((await q('select count(*)::int n from eventos'))[0].n === antesZero, 'a conferência do diagnóstico não conta como tentativa');
  for (let i = 0; i < 15; i++) await pedirDe('202.0.0.' + i, crypto.randomUUID(), 'Sonda ' + i, '1198000000' + (i % 10));
  ok((await q(`select count(*)::int n from alertas where tipo = 'sondagem'`))[0].n === 1, '15 tentativas com horários inexistentes geram 1 alerta (sem repetir)');
  ok(!(await q('select pausado from guardiao'))[0].pausado, 'sondagem só avisa, não bloqueia as clientes');

  // histórico mais completo
  const g3 = await novoDia(14, ['10:00', '11:00', '12:00']);
  await pedirDe(null, g3[0], 'Helena Prado', '11950000001');
  await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set status = 'confirmado' where id = $1`, [g3[0]]));
  await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set lembrete_em = now() where id = $1`, [g3[0]]));
  await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set telefone = '11950000002' where id = $1`, [g3[0]]));
  await como('authenticated', EMAIL_ADMIN, () => q('select public.remarcar($1, $2)', [g3[0], g3[1]]));
  await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set hora = '12:30' where id = $1`, [g3[2]]));
  const hs = await q(`select horario_id, de, para, obs from historico where horario_id = any($1) order by id`, [g3]);
  const tem = (f) => hs.some(f);
  ok(tem((h) => h.obs === 'lembrete') && tem((h) => h.obs === 'editado'), 'histórico registra lembrete enviado e dados editados');
  ok(tem((h) => h.horario_id === g3[1] && h.para === 'confirmado' && h.obs === 'remarcado') && tem((h) => h.horario_id === g3[0] && h.para === 'livre' && h.obs === 'remarcado'), 'histórico registra a remarcação nos dois horários');
  ok(tem((h) => h.horario_id === g3[2] && /^mudou de \d{4}-\d\d-\d\d 12:00$/.test(h.obs || '')), 'histórico registra a mudança de horário (de 12:00)');

  // muitos cancelamentos de uma vez
  const g4 = await novoDia(15, ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']);
  await recomeca();
  for (let i = 0; i < 6; i++) await pedirDe('203.0.0.' + i, g4[i], 'Cancelada ' + i, '1194000000' + i);
  await recomeca();
  await db.exec(`update historico set em = em - interval '1 hour'`); // cancelamentos dos testes anteriores ficam fora da janela
  for (let i = 0; i < 5; i++) await como('authenticated', EMAIL_ADMIN, () => q(`update horarios set status = 'livre', nome = null, servico = null, telefone = null, pedido_em = null where id = $1`, [g4[i]]));
  ok((await q(`select count(*)::int n from alertas where tipo = 'cancelamentos'`))[0].n === 0, '5 cancelamentos seguidos ainda não geram alerta');
  await como('authenticated', EMAIL_ADMIN, () => q(`delete from horarios where id = $1`, [g4[5]]));
  ok((await q(`select count(*)::int n from alertas where tipo = 'cancelamentos' and nivel = 'grave'`))[0].n === 1, 'o 6º cancelamento em 10 minutos gera alerta grave');

  // aparelhos conectados e acesso novo
  const amanda = (await q(`select id from auth.users where email = $1`, [EMAIL_ADMIN]))[0].id;
  const [s1] = await q(`insert into auth.sessions (user_id, user_agent) values ($1, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1') returning id`, [amanda]);
  const sitA = async (sessao) => (await como('authenticated', EMAIL_ADMIN, () => q('select public.situacao_guardiao() s'), { sessao }))[0].s;
  const a1 = await sitA(s1.id);
  ok(a1.aparelhos.length === 1 && a1.aparelhos[0].atual === true, 'situação mostra o aparelho conectado e marca "este aparelho"');
  ok((await q(`select count(*)::int n from alertas where tipo = 'aparelho'`))[0].n === 0, 'o primeiro aparelho não gera alerta');
  await q(`insert into auth.sessions (user_id, user_agent) values ($1, 'python-requests/2.31')`, [amanda]);
  const a2 = await sitA(s1.id);
  ok(a2.aparelhos.length === 2 && a2.alertas.some((x) => x.tipo === 'aparelho' && /python/.test(x.detalhe)), 'um login novo em outro aparelho gera alerta de "Novo acesso ao painel"');
  await sitA(s1.id);
  ok((await q(`select count(*)::int n from alertas where tipo = 'aparelho'`))[0].n === 1, 'e o alerta não se repete');
  ok(a2.nao_vistos > 0 && (await como('authenticated', EMAIL_ADMIN, () => q('select public.marcar_alertas_vistos() n')))[0].n === a2.nao_vistos, 'a Amanda marca os alertas como vistos');
  ok((await como('anon', null, () => q('select public.guardiao_publico() g')))[0].g.graves === 0, 'e o guardião público volta a mostrar zero alertas graves');
  ok((await como('authenticated', 'outra@pessoa.com', () => q('select public.situacao_guardiao() s')))[0].s === null, 'outra conta não vê a situação do guardião');

  // ninguém mexe no guardião por fora
  for (const t of ['guardiao', 'alertas', 'eventos', 'aparelhos_vistos']) {
    ok(!!(await como('anon', null, () => tenta(q(`select * from ${t}`)))).erro && !!(await como('authenticated', EMAIL_ADMIN, () => tenta(q(`select * from ${t}`)))).erro, `a tabela ${t} só é acessada pelas funções do guardião`);
  }
  for (const f of [`public.alerta('x', 'grave', 'falso', 'falso', null)`, 'public.vigia()', 'public.origem_pedido()', 'public.situacao_guardiao()', 'public.marcar_alertas_vistos()']) {
    ok(!!(await como('anon', null, () => tenta(q(`select ${f}`)))).erro, `visitante não chama ${f.split('(')[0]}`);
  }
  ok(!!(await como('authenticated', EMAIL_ADMIN, () => tenta(q(`select public.alerta('x', 'grave', 'falso', 'falso', null)`)))).erro, 'nem a Amanda cria alertas falsos diretamente');

  // clientes
  await db.exec(`alter table horarios disable trigger trg_horario_passado`);
  await db.exec(`insert into horarios (data, hora, status, nome, telefone, servico, pedido_em) values
    ((public.agora_sp() - interval '60 days')::date, '10:00', 'confirmado', 'Helena Prado', '11950000002', 'Limpeza de pele', now()),
    ((public.agora_sp() - interval '20 days')::date, '10:00', 'confirmado', 'Helena Prado', '11950000002', 'Auriculoterapia', now())`);
  await db.exec(`alter table horarios enable trigger trg_horario_passado`);
  const cli = (await como('authenticated', EMAIL_ADMIN, () => q('select public.clientes_resumo() c')))[0].c;
  const helena = cli.find((x) => x.telefone === '11950000002');
  ok(helena && helena.atendimentos === 2 && helena.proxima && helena.servicos.length === 2, 'ficha da cliente: 2 atendimentos, próximo horário e serviços feitos (' + JSON.stringify(helena) + ')');
  ok(!cli.some((x) => x.nome === 'Marcado por fora'), 'horários "marcado por fora" sem nome não viram cliente');
  ok((await como('authenticated', EMAIL_ADMIN, () => q(`select public.salvar_cliente('11950000002', 'Pele sensível') r`)))[0].r === true, 'Amanda salva uma anotação');
  ok((await como('authenticated', EMAIL_ADMIN, () => q('select public.clientes_resumo() c')))[0].c.find((x) => x.telefone === '11950000002').obs === 'Pele sensível', 'a anotação aparece na ficha');
  ok(!!(await como('anon', null, () => tenta(q('select public.clientes_resumo()')))).erro && !!(await como('anon', null, () => tenta(q(`select public.salvar_cliente('x1', 'y')`)))).erro, 'visitante não vê nem altera clientes');
  ok((await como('authenticated', 'outra@pessoa.com', () => q('select public.clientes_resumo() c')))[0].c === null && (await como('authenticated', 'outra@pessoa.com', () => q(`select public.salvar_cliente('x1', 'y') r`)))[0].r === false, 'outra conta não vê nem altera clientes');
  ok(!!(await como('anon', null, () => tenta(q('select * from clientes')))).erro, 'a tabela de clientes é fechada');
}

fim('banco');
