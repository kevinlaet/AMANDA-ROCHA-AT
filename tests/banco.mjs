// Sobe um PostgreSQL real (PGlite) com o mínimo do ambiente do Supabase
// (papéis anon/authenticated, auth.jwt(), auth.uid(), usuários e sessões)
// e aplica o supabase/schema.sql.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EMAIL_ADMIN = 'amanda@teste.com';

export async function criarBanco({ schema } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid
    $$;
    -- só as colunas de auth.users e auth.sessions que o schema usa
    create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
    create table auth.sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users (id) on delete cascade,
      created_at timestamptz default now(),
      updated_at timestamptz default now(),
      user_agent text
    );
    -- imita o pg_net do Supabase: guarda o que seria enviado ao ntfy
    create schema net;
    create table net.enviados (id serial primary key, url text, body jsonb, em timestamptz default now());
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
    returns bigint language sql as $$ insert into net.enviados (url, body) values (url, body) returning id $$;
    -- imita o pg_cron do Supabase: guarda as tarefas agendadas
    create schema cron;
    create table cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
      insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
      on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
    insert into auth.users (email) values ('${EMAIL_ADMIN}'), ('outra@pessoa.com');
    grant usage on schema auth, public to anon, authenticated;
    -- o Supabase dá estes privilégios por padrão; o schema precisa se proteger mesmo assim
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);
  const sql = fs.readFileSync(schema || path.join(RAIZ, 'supabase/schema.sql'), 'utf8').replaceAll('SEU_EMAIL_AQUI', EMAIL_ADMIN);
  await db.exec(sql);

  // Executa fn como um papel do Supabase (anon, ou authenticated com e-mail).
  // sessao: id da sessão de login; cabecalhos: cabeçalhos HTTP do pedido (ex.: x-forwarded-for)
  const como = async (papel, email, fn, { sessao, cabecalhos } = {}) => {
    const sub = email ? (await db.query('select id from auth.users where email = lower($1)', [email])).rows[0]?.id : undefined;
    const claims = email ? { email, role: papel, sub, session_id: sessao } : { role: papel };
    await db.exec(`set role ${papel}`);
    await db.query(`select set_config('request.jwt.claims', $1, false), set_config('request.headers', $2, false)`, [JSON.stringify(claims), JSON.stringify(cabecalhos || {})]);
    try { return await fn(); } finally {
      await db.exec('reset role');
      await db.query(`select set_config('request.jwt.claims', '', false), set_config('request.headers', '', false)`);
    }
  };
  return { db, como };
}

export function placar() {
  let falhas = 0;
  const ok = (cond, texto) => { console.log((cond ? 'OK    ' : 'FALHA ') + texto); if (!cond) falhas++; };
  const fim = (nome) => { console.log(falhas ? `\n${falhas} FALHA(S) em ${nome}` : `\nTodos os testes de ${nome} passaram`); process.exitCode = falhas ? 1 : 0; return falhas; };
  return { ok, fim };
}
