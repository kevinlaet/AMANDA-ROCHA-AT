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

// 7. Rodar o schema de novo não perde nada
const antes = (await q('select count(*)::int n from horarios'))[0].n;
const r2 = await tenta(db.exec(fs.readFileSync(path.join(RAIZ, 'supabase/schema.sql'), 'utf8').replaceAll('SEU_EMAIL_AQUI', EMAIL_ADMIN)));
ok(!r2.erro, 'rodar o schema de novo não dá erro' + (r2.erro ? ': ' + r2.erro : ''));
ok((await q('select count(*)::int n from horarios'))[0].n === antes, 'e não perde nenhum horário');

fim('banco');
