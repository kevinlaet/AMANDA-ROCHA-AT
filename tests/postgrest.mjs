// Imita a API do Supabase (PostgREST + login) só no que o site e o painel usam,
// executando cada pedido no PostgreSQL real com o papel certo (anon ou authenticated).
// Assim os testes exercitam as regras de verdade do supabase/schema.sql.
import { EMAIL_ADMIN } from './banco.mjs';

export const SUPABASE_URL = 'https://teste.supabase.co';
export const ANON_KEY = 'sb_publishable_chave_de_teste';
export const SENHAS = { [EMAIL_ADMIN]: 'certa', 'outra@pessoa.com': 'certa' };

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const COLUNAS = new Set(['status', 'nome', 'servico', 'telefone', 'pedido_em']);

export function criarApi({ db, como, opcoes = {} }) {
  let fila = Promise.resolve();
  const emSerie = (fn) => { const r = fila.then(fn); fila = r.catch(() => {}); return r; };
  const json = (route, corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo) });
  const lista = async (sql, params) => (await db.query(`with t as (${sql}) select coalesce(json_agg(t), '[]'::json) j from t`, params)).rows[0].j;

  function filtros(url, params) {
    const w = [];
    for (const [k, v] of url.searchParams) {
      if (k === 'id' && v.startsWith('eq.')) { params.push(v.slice(3)); w.push(`id = $${params.length}::uuid`); }
      if (k === 'status' && v.startsWith('eq.')) { params.push(v.slice(3)); w.push(`status = $${params.length}`); }
      if (k === 'status' && v.startsWith('in.(')) { params.push(v.slice(4, -1).split(',')); w.push(`status = any($${params.length})`); }
      if (k === 'data' && v.startsWith('gte.')) { params.push(v.slice(4)); w.push(`data >= $${params.length}::date`); }
    }
    return w.length ? ' where ' + w.join(' and ') : '';
  }

  const estat = { pedidos: 0 };
  async function tratar(route) {
    const req = route.request(), url = new URL(req.url()), metodo = req.method(), caminho = url.pathname;
    if (metodo === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.headers()['apikey'] !== ANON_KEY) return json(route, { message: 'No API key found in request' }, 401);
    estat.pedidos++;

    if (caminho === '/auth/v1/settings') return json(route, { disable_signup: opcoes.cadastroAberto ? false : true, external: { email: true } });
    if (caminho === '/auth/v1/token') {
      const b = req.postDataJSON() || {};
      if (url.searchParams.get('grant_type') === 'password') {
        if (SENHAS[b.email] && SENHAS[b.email] === b.password) return json(route, { access_token: 'tok:' + b.email, refresh_token: 'ref:' + b.email, expires_in: 3600 });
        return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      }
      if (url.searchParams.get('grant_type') === 'refresh_token' && String(b.refresh_token).startsWith('ref:')) {
        const email = b.refresh_token.slice(4);
        return json(route, { access_token: 'tok:' + email, refresh_token: 'ref:' + email, expires_in: 3600 });
      }
      return json(route, { error: 'invalid_grant' }, 400);
    }

    const autorizacao = req.headers()['authorization'] || '';
    // o gateway do Supabase recusa chaves sb_publishable_ enviadas como Bearer
    if (autorizacao === 'Bearer ' + ANON_KEY) return json(route, { message: 'Invalid JWT' }, 401);
    const email = autorizacao.startsWith('Bearer tok:') ? autorizacao.slice('Bearer tok:'.length) : null;
    const papel = email ? 'authenticated' : 'anon';
    const prefer = req.headers()['prefer'] || '';

    return emSerie(() => como(papel, email, async () => {
      try {
        if (caminho === '/rest/v1/rpc/agenda_publica') return json(route, await lista('select * from public.agenda_publica()'));
        if (caminho === '/rest/v1/rpc/agora_sp') return json(route, (await db.query('select to_json(public.agora_sp()) j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/sou_admin') return json(route, (await db.query('select public.sou_admin() j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/pedir_horario') {
          const b = req.postDataJSON();
          return json(route, (await db.query('select public.pedir_horario($1, $2, $3, $4) j', [b.p_id, b.p_servico, b.p_nome, b.p_telefone])).rows[0].j);
        }
        if (caminho === '/rest/v1/historico' || caminho === '/rest/v1/admins') return json(route, await lista(`select * from public.${caminho.split('/').pop()}`));
        if (caminho === '/rest/v1/horarios') {
          const params = [];
          if (metodo === 'GET') return json(route, await lista(`select * from public.horarios${filtros(url, params)} order by data, hora${url.searchParams.get('limit') ? ' limit ' + Number(url.searchParams.get('limit')) : ''}`, params));
          if (metodo === 'POST') {
            const novos = req.postDataJSON();
            const ignorar = prefer.includes('resolution=ignore-duplicates') ? ' on conflict (data, hora) do nothing' : '';
            const r = await lista(`insert into public.horarios (data, hora) select * from json_to_recordset($1::json) as x(data date, hora text)${ignorar} returning *`, [JSON.stringify(novos)]);
            return prefer.includes('return=representation') ? json(route, r, 201) : route.fulfill({ status: 201, headers: CORS });
          }
          if (metodo === 'PATCH') {
            const b = req.postDataJSON(), sets = [];
            for (const k of Object.keys(b)) { if (!COLUNAS.has(k)) throw new Error('coluna não permitida: ' + k); params.push(b[k]); sets.push(`${k} = $${params.length}`); }
            const r = await lista(`update public.horarios set ${sets.join(', ')}${filtros(url, params)} returning *`, params);
            return prefer.includes('return=representation') ? json(route, r) : route.fulfill({ status: 204, headers: CORS });
          }
          if (metodo === 'DELETE') {
            const r = await lista(`delete from public.horarios${filtros(url, params)} returning *`, params);
            return prefer.includes('return=representation') ? json(route, r) : route.fulfill({ status: 204, headers: CORS });
          }
        }
        return json(route, { message: 'não encontrado' }, 404);
      } catch (e) {
        if (process.env.DEPURAR) console.log('   [api]', metodo, caminho + url.search, e.message);
        const status = e.code === '42501' ? (email ? 403 : 401) : 400;
        return json(route, { code: e.code, message: e.message }, status);
      }
    }));
  }
  return { tratar, estat };
}
