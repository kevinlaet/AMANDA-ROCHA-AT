// Imita a API do Supabase (PostgREST + login) só no que o site e o painel usam,
// executando cada pedido no PostgreSQL real com o papel certo (anon ou authenticated).
// Assim os testes exercitam as regras de verdade do supabase/schema.sql.
import { EMAIL_ADMIN } from './banco.mjs';

export const SUPABASE_URL = 'https://teste.supabase.co';
export const ANON_KEY = 'sb_publishable_chave_de_teste';
export const SENHAS = { [EMAIL_ADMIN]: 'certa', 'outra@pessoa.com': 'certa' };

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const COLUNAS = { horarios: new Set(['status', 'nome', 'servico', 'telefone', 'pedido_em', 'lembrete_em', 'data', 'hora']), servicos: new Set(['id', 'nome', 'detalhe', 'novidade', 'desde', 'ativo', 'ordem', 'duracao']) };

export function criarApi({ db, como, opcoes = {} }) {
  let fila = Promise.resolve();
  const emSerie = (fn) => { const r = fila.then(fn); fila = r.catch(() => {}); return r; };
  const json = (route, corpo, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(corpo) });
  const lista = async (sql, params) => (await db.query(`with t as (${sql}) select coalesce(json_agg(t), '[]'::json) j from t`, params)).rows[0].j;

  function filtros(url, params, tabela = 'horarios') {
    const w = [];
    for (const [k, v] of url.searchParams) {
      if (k === 'id' && v.startsWith('eq.')) { params.push(v.slice(3)); w.push(tabela === 'servicos' ? `id = $${params.length}` : `id = $${params.length}::uuid`); }
      if (k === 'data' && v.startsWith('eq.')) { params.push(v.slice(3)); w.push(`data = $${params.length}::date`); }
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

    const cab = req.headers();
    // cada login cria uma sessão em auth.sessions, como no Supabase; o token aponta para ela
    const sessaoDe = async (t) => (await db.query(`select s.id, u.email from auth.sessions s join auth.users u on u.id = s.user_id where s.id::text = $1`, [String(t || '')])).rows[0];
    const novaSessao = async (email) => (await db.query(`insert into auth.sessions (user_id, user_agent) select id, $2 from auth.users where email = $1 returning id`, [email, cab['user-agent'] || ''])).rows[0].id;
    const tokens = (sid, email) => ({ access_token: 'tok:' + sid, refresh_token: 'ref:' + sid, expires_in: 3600, user: { email } });
    const autorizacao = cab['authorization'] || '';
    if (caminho === '/auth/v1/settings') return json(route, { disable_signup: opcoes.cadastroAberto ? false : true, external: { email: true } });
    if (caminho === '/auth/v1/token') {
      const b = req.postDataJSON() || {};
      if (url.searchParams.get('grant_type') === 'password') {
        if (SENHAS[b.email] && SENHAS[b.email] === b.password) return emSerie(async () => json(route, tokens(await novaSessao(b.email), b.email)));
        return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400);
      }
      if (url.searchParams.get('grant_type') === 'refresh_token' && String(b.refresh_token).startsWith('ref:')) {
        return emSerie(async () => {
          const s = await sessaoDe(b.refresh_token.slice(4));
          if (!s) return json(route, { error: 'invalid_grant', error_description: 'Refresh Token Not Found' }, 400);
          await db.query('update auth.sessions set updated_at = now() where id = $1', [s.id]);
          return json(route, tokens(s.id, s.email));
        });
      }
      return json(route, { error: 'invalid_grant' }, 400);
    }

    // o gateway do Supabase recusa chaves sb_publishable_ enviadas como Bearer
    if (autorizacao === 'Bearer ' + ANON_KEY) return json(route, { message: 'Invalid JWT' }, 401);
    const sessao = autorizacao.startsWith('Bearer tok:') ? await emSerie(() => sessaoDe(autorizacao.slice('Bearer tok:'.length))) : null;
    if (autorizacao.startsWith('Bearer tok:') && !sessao) return json(route, { message: 'JWT expired' }, 401);
    const email = sessao ? sessao.email : null;

    if (caminho === '/auth/v1/logout') {
      if (!sessao) return json(route, { message: 'invalid' }, 401);
      const escopo = url.searchParams.get('scope') || 'local';
      await emSerie(() => db.query(escopo === 'local' ? 'delete from auth.sessions where id = $1'
        : `delete from auth.sessions where user_id = (select user_id from auth.sessions where id = $1)${escopo === 'others' ? ' and id <> $1' : ''}`, [sessao.id]));
      return route.fulfill({ status: 204, headers: CORS });
    }
    if (caminho === '/auth/v1/user' && metodo === 'PUT') {
      if (!sessao) return json(route, { message: 'invalid' }, 401);
      const nova = (req.postDataJSON() || {}).password || '';
      if (nova.length < 6) return json(route, { code: 'weak_password', message: 'Password should be at least 6 characters.' }, 422);
      if (nova === SENHAS[email]) return json(route, { code: 'same_password', message: 'New password should be different from the old password.' }, 422);
      SENHAS[email] = nova;
      return json(route, { email });
    }

    const papel = email ? 'authenticated' : 'anon';
    const prefer = cab['prefer'] || '';
    const cabecalhos = cab['x-forwarded-for'] ? { 'x-forwarded-for': cab['x-forwarded-for'] } : {};

    return emSerie(() => como(papel, email, async () => {
      try {
        if (caminho === '/rest/v1/rpc/agenda_publica') return json(route, await lista('select * from public.agenda_publica()'));
        if (caminho === '/rest/v1/rpc/agora_sp') return json(route, (await db.query('select to_json(public.agora_sp()) j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/sou_admin') return json(route, (await db.query('select public.sou_admin() j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/servicos_publicos') return json(route, await lista('select * from public.servicos_publicos()'));
        const rpc1 = { '/rest/v1/rpc/situacao_guardiao': 'select public.situacao_guardiao() j', '/rest/v1/rpc/marcar_alertas_vistos': 'select public.marcar_alertas_vistos() j', '/rest/v1/rpc/guardiao_publico': 'select public.guardiao_publico() j' };
        if (rpc1[caminho]) return json(route, (await db.query(rpc1[caminho])).rows[0].j);
        if (caminho === '/rest/v1/rpc/enviar_resumo_agora') return json(route, (await db.query('select public.enviar_resumo_agora() j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/testar_notificacao') return json(route, (await db.query('select public.testar_notificacao() j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/clientes_resumo') return json(route, (await db.query('select public.clientes_resumo() j')).rows[0].j);
        if (caminho === '/rest/v1/rpc/salvar_cliente') { const b = req.postDataJSON() || {}; return json(route, (await db.query('select public.salvar_cliente($1, $2) j', [b.p_chave, b.p_obs])).rows[0].j); }
        if (caminho === '/rest/v1/rpc/definir_protecao') return json(route, (await db.query('select public.definir_protecao($1) j', [!!(req.postDataJSON() || {}).p_pausar])).rows[0].j);
        if (caminho === '/rest/v1/rpc/remarcar') { const b = req.postDataJSON(); return json(route, (await db.query('select public.remarcar($1, $2) j', [b.p_de, b.p_para])).rows[0].j); }
        if (caminho === '/rest/v1/servicos') {
          const params = [];
          if (metodo === 'GET') return json(route, await lista(`select * from public.servicos${filtros(url, params, 'servicos')} order by ordem, nome`, params));
          if (metodo === 'POST') {
            const corpo = req.postDataJSON(), linhas = Array.isArray(corpo) ? corpo : [corpo], out = [];
            for (const n of linhas) { const cols = Object.keys(n).filter((k) => COLUNAS.servicos.has(k)); out.push(...await lista(`insert into public.servicos (${cols.join(', ')}) values (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) returning *`, cols.map((k) => n[k]))); }
            return prefer.includes('return=representation') ? json(route, out, 201) : route.fulfill({ status: 201, headers: CORS });
          }
          if (metodo === 'PATCH') {
            const b = req.postDataJSON(), sets = [];
            for (const k of Object.keys(b)) { if (!COLUNAS.servicos.has(k)) throw new Error('coluna não permitida: ' + k); params.push(b[k]); sets.push(`${k} = $${params.length}`); }
            const r = await lista(`update public.servicos set ${sets.join(', ')}${filtros(url, params, 'servicos')} returning *`, params);
            return prefer.includes('return=representation') ? json(route, r) : route.fulfill({ status: 204, headers: CORS });
          }
          if (metodo === 'DELETE') { const r = await lista(`delete from public.servicos${filtros(url, params, 'servicos')} returning *`, params); return prefer.includes('return=representation') ? json(route, r) : route.fulfill({ status: 204, headers: CORS }); }
        }
        if (caminho === '/rest/v1/rpc/pedir_horario') {
          const b = req.postDataJSON();
          return json(route, (await db.query('select public.pedir_horario($1, $2, $3, $4) j', [b.p_id, b.p_servico, b.p_nome, b.p_telefone])).rows[0].j);
        }
        if (caminho === '/rest/v1/historico') {
          const params = [], w = [], nome = url.searchParams.get('nome') || '';
          if (nome.startsWith('ilike.')) { params.push(nome.slice(6).replace(/\*/g, '%')); w.push(`nome ilike $${params.length}`); }
          const lim = Math.min(Number(url.searchParams.get('limit')) || 1000, 1000), off = Number(url.searchParams.get('offset')) || 0;
          return json(route, await lista(`select * from public.historico${w.length ? ' where ' + w.join(' and ') : ''} order by em desc, id desc limit ${lim} offset ${off}`, params));
        }
        if (['/rest/v1/admins', '/rest/v1/alertas', '/rest/v1/eventos', '/rest/v1/guardiao', '/rest/v1/aparelhos_vistos'].includes(caminho)) return json(route, await lista(`select * from public.${caminho.split('/').pop()}`));
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
            for (const k of Object.keys(b)) { if (!COLUNAS.horarios.has(k)) throw new Error('coluna não permitida: ' + k); params.push(b[k]); sets.push(`${k} = $${params.length}`); }
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
        // função ou tabela que ainda não existe no banco: o PostgREST responde 404
        const status = e.code === '42501' ? (email ? 403 : 401) : e.code === '23505' ? 409 : (e.code === '42883' || e.code === '42P01') ? 404 : 400;
        return json(route, { code: e.code, message: e.message }, status);
      }
    }, { sessao: sessao ? sessao.id : undefined, cabecalhos }));
  }
  return { tratar, estat };
}
