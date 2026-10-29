// Sobe um PostgreSQL real (PGlite) com o mínimo do ambiente do Supabase
// (papéis anon/authenticated e auth.jwt()) e aplica o supabase/schema.sql.
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
    grant usage on schema auth, public to anon, authenticated;
    -- o Supabase dá estes privilégios por padrão; o schema precisa se proteger mesmo assim
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;
  `);
  const sql = fs.readFileSync(schema || path.join(RAIZ, 'supabase/schema.sql'), 'utf8').replaceAll('SEU_EMAIL_AQUI', EMAIL_ADMIN);
  await db.exec(sql);

  // Executa fn como um papel do Supabase (anon, ou authenticated com e-mail).
  const como = async (papel, email, fn) => {
    await db.exec(`set role ${papel}`);
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(email ? { email, role: papel } : { role: papel })]);
    try { return await fn(); } finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claims', '', false)`); }
  };
  return { db, como };
}

export function placar() {
  let falhas = 0;
  const ok = (cond, texto) => { console.log((cond ? 'OK    ' : 'FALHA ') + texto); if (!cond) falhas++; };
  const fim = (nome) => { console.log(falhas ? `\n${falhas} FALHA(S) em ${nome}` : `\nTodos os testes de ${nome} passaram`); process.exitCode = falhas ? 1 : 0; return falhas; };
  return { ok, fim };
}
