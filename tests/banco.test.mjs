// Regras do banco (supabase/schema.sql) rodando num PostgreSQL de verdade.
import fs from 'node:fs';
import path from 'node:path';
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
ok(await pedir(amanha, 'Limpeza de pele', 'Ana Souza', '+55 (11) 97777-6666') === 'ok', 'telefone com +55 é aceito');
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
ok(!!(await como('authenticated', 'outra@pessoa.com', () => tenta(q('select public.remarcar($1, $2)', [d6[1].id, d6[0].id])))).erro, 'outra pessoa não consegue remarcar');
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

// 8. Atualização 2 aplicada em um banco que já existia (caso real do Supabase da Amanda)
{
  const velho = await criarBanco({ schema: path.join(RAIZ, 'tests/fixtures/schema-antes-da-atualizacao-2.sql') });
  await velho.db.exec(`insert into horarios (data, hora) values ((public.agora_sp() + interval '4 days')::date, '13:00'), ((public.agora_sp() + interval '4 days')::date, '14:00')`);
  const ids = (await velho.db.query(`select id from horarios order by hora`)).rows.map((r) => r.id);
  await velho.como('anon', null, () => velho.db.query(`select public.pedir_horario($1, 'Auriculoterapia', 'Ana Paula', '11955556666')`, [ids[0]]));
  const r = await tenta(velho.db.exec(fs.readFileSync(path.join(RAIZ, 'supabase/atualizacao-2.sql'), 'utf8')));
  ok(!r.erro, 'atualização 2 roda em cima do banco antigo sem erro' + (r.erro ? ': ' + r.erro : ''));
  ok((await velho.db.query(`select nome from horarios where id = $1`, [ids[0]])).rows[0].nome === 'Ana Paula', 'e não perde o pedido que já existia');
  const r2 = await tenta(velho.db.exec(fs.readFileSync(path.join(RAIZ, 'supabase/atualizacao-2.sql'), 'utf8')));
  ok(!r2.erro, 'rodar a atualização 2 duas vezes não dá erro');
  ok((await velho.como('authenticated', EMAIL_ADMIN, async () => (await velho.db.query('select public.remarcar($1, $2) r', [ids[0], ids[1]])).rows[0].r)) === 'ok', 'depois da atualização, remarcar funciona');
  ok((await velho.como('anon', null, async () => (await velho.db.query('select * from public.servicos_publicos()')).rows)).length === 2, 'depois da atualização, o site recebe os serviços');
}

fim('banco');
