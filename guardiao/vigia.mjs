// Guardião externo: confere de fora, como uma visitante qualquer, se o site e o banco
// estão como deveriam. Roda no GitHub Actions a cada 15 minutos (.github/workflows/guardiao.yml).
// Se encontrar problema, abre um aviso (issue) no GitHub e o Kevin recebe por e-mail;
// quando tudo volta ao normal, comenta e fecha o aviso.
//
// Uso local:  node guardiao/vigia.mjs            (mostra o relatório; sai com erro se houver problema)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = (process.env.GUARDIAO_SITE || 'https://kevinlaet.github.io/AMANDA-ROCHA-AT/').replace(/\/?$/, '/');
const config = fs.readFileSync(path.join(RAIZ, 'config.js'), 'utf8');
const SB = process.env.GUARDIAO_SUPABASE || (config.match(/url:\s*"([^"]*)"/) || [])[1] || '';
const CHAVE = process.env.GUARDIAO_CHAVE || (config.match(/anonKey:\s*"([^"]*)"/) || [])[1] || '';
const ESPERA = Number(process.env.GUARDIAO_ESPERA ?? 90) * 1000;
// números de WhatsApp que podem aparecer no site (Amanda e Sandra)
const WHATSAPP = ['5511948907302', '5511967682546'];
// arquivos publicados que precisam estar iguais aos do GitHub
const ARQUIVOS = ['index.html', 'site.js', 'config.js', 'agenda.js', 'links/index.html', 'admin/index.html', 'admin/painel.js', 'admin/diagnostico.html', 'questionario/index.html', 'questionario/questionario.js'];
const ZERO = '00000000-0000-0000-0000-000000000000';

const problemas = [], notas = [];
// chave secreta de verdade: sb_secret_... ou um token JWT com papel service_role
function temChaveSecreta(t) {
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(t)) return true;
  for (const [, p] of t.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(p, 'base64url').toString()).role === 'service_role') return true; } catch {}
  }
  return false;
}
const problema = (t) => problemas.push(t);

async function buscar(url, opcoes = {}, tentativas = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(20000) });
      const texto = await r.text();
      let json = null; try { json = texto ? JSON.parse(texto) : null; } catch {}
      return { status: r.status, texto, json };
    } catch (e) {
      if (i >= tentativas) return { status: 0, texto: '', json: null, erro: e.message };
      await new Promise((ok) => setTimeout(ok, 3000 * i));
    }
  }
}
const local = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// ---------- 1. o site ----------
async function conferirSite() {
  const noAr = {};
  let diferentes = [];
  for (const f of ARQUIVOS) {
    const r = await buscar(SITE + f + '?guardiao=' + Date.now());
    if (r.status !== 200) { problema(`O arquivo ${f} não abriu (resposta ${r.status || r.erro}). O site pode estar fora do ar.`); continue; }
    noAr[f] = r.texto;
    if (hash(r.texto) !== hash(local(f))) diferentes.push(f);
  }
  if (diferentes.length) {
    // logo depois de uma publicação o GitHub Pages leva alguns minutos para atualizar
    let recente = false;
    if (!process.env.GUARDIAO_SEM_TOLERANCIA) try { recente = Date.now() / 1000 - Number(execSync('git log -1 --format=%ct', { cwd: RAIZ }).toString()) < 20 * 60; } catch {}
    if (ESPERA) await espera(ESPERA);
    const ainda = [];
    for (const f of diferentes) { const r = await buscar(SITE + f + '?guardiao=' + Date.now()); if (r.status === 200) noAr[f] = r.texto; if (hash(r.texto) !== hash(local(f))) ainda.push(f); }
    diferentes = ainda;
    if (diferentes.length && recente) notas.push(`Publicação recente ainda chegando: ${diferentes.join(', ')}.`);
    else if (diferentes.length) problema(`O site no ar está diferente do que está no GitHub: ${diferentes.join(', ')}. Alguém pode ter mexido, ou a última publicação falhou.`);
  }
  for (const [f, t] of Object.entries(noAr)) {
    for (const [, n] of t.matchAll(/wa\.me\/(\d{8,15})/g)) if (!WHATSAPP.includes(n)) problema(`O arquivo ${f} tem um WhatsApp desconhecido (${n}). As clientes podem estar sendo desviadas.`);
    for (const [, src] of t.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) if (/^(https?:)?\/\//i.test(src)) problema(`O arquivo ${f} carrega um script de fora: ${src}.`);
    if (temChaveSecreta(t)) problema(`O arquivo ${f} parece ter uma chave secreta do Supabase exposta. Troque a chave no Supabase agora.`);
    if (f.endsWith('.html') && !t.includes('Desenvolvido por Kevin Laet')) problema(`O arquivo ${f} está sem a assinatura (pode ter sido trocado).`);
  }
  const ag = noAr['agenda.js'] || '';
  if (ag && !ag.includes('whatsapp: "5511948907302"')) problema('O número de WhatsApp da Amanda no agenda.js foi alterado.');
}

// ---------- 2. o banco (Supabase), como visitante ----------
async function conferirBanco() {
  if (!SB || !CHAVE) { problema('O config.js está sem o endereço ou a chave do Supabase.'); return; }
  if (temChaveSecreta(CHAVE)) problema('ATENÇÃO: a chave no config.js é a secreta. Troque pela "Publishable key" e gere uma nova chave secreta no Supabase.');
  const cab = { apikey: CHAVE, 'Content-Type': 'application/json' };
  const rest = (c, op = {}) => buscar(SB + '/rest/v1/' + c, { headers: cab, ...op });
  const rpc = (f, corpo = {}) => rest('rpc/' + f, { method: 'POST', body: JSON.stringify(corpo) });
  const aberto = (r) => r.status >= 200 && r.status < 300;

  const ag = await rpc('agenda_publica');
  if (ag.status !== 200 || !Array.isArray(ag.json)) problema(`A agenda do site não respondeu (resposta ${ag.status || ag.erro}). As clientes não conseguem ver os horários.`);
  else if (ag.json.some((h) => Object.keys(h).some((k) => !['id', 'data', 'hora', 'status', 'ate'].includes(k)))) problema('A agenda pública está mostrando mais dados do que deveria.');
  const pd = await rpc('pedir_horario', { p_id: ZERO, p_servico: 'Teste', p_nome: 'Guardião', p_telefone: '11900000000' });
  if (pd.status !== 200 || pd.json !== 'indisponivel') problema(`A reserva de horário respondeu algo inesperado (${pd.status} ${pd.texto.slice(0, 80)}).`);

  for (const t of ['horarios', 'historico', 'admins', 'servicos', 'clientes', 'alertas', 'eventos', 'guardiao', 'aparelhos_vistos', 'painel_config']) {
    const r = await rest(t + '?select=*&limit=1');
    if (r.status === 200 && Array.isArray(r.json) && r.json.length) problema(`PERIGO: visitantes conseguem ler a tabela ${t}. Rode o supabase/atualizacao.sql de novo.`);
  }
  if (aberto(await rest('horarios', { method: 'POST', body: JSON.stringify([{ data: '2099-01-01', hora: '03:00' }]) }))) problema('PERIGO: visitantes conseguem criar horários.');
  if (aberto(await rest('servicos?id=eq.__guardiao__', { method: 'PATCH', body: JSON.stringify({ nome: 'x' }) }))) problema('PERIGO: visitantes conseguem mudar os serviços.');
  for (const f of ['remarcar', 'situacao_guardiao', 'clientes_resumo', 'testar_notificacao', 'definir_protecao', 'meus_numeros', 'definir_meta']) {
    const r = await rpc(f, f === 'remarcar' ? { p_de: ZERO, p_para: ZERO } : f === 'definir_protecao' ? { p_pausar: false } : f === 'definir_meta' ? { p_valor: 1 } : {});
    if (r.status === 200 && r.json !== null && r.json !== false) problema(`PERIGO: visitantes conseguem usar a função ${f}.`);
  }
  const cfg = await buscar(SB + '/auth/v1/settings', { headers: { apikey: CHAVE } });
  if (cfg.json && cfg.json.disable_signup !== true) problema('Qualquer pessoa pode criar conta no Supabase. Desligue "Allow new users to sign up" em Authentication.');

  const g = await rpc('guardiao_publico');
  if (g.status === 404) problema('O guardião do banco ainda não está ligado: rode o arquivo supabase/atualizacao.sql no Supabase.');
  else if (g.status === 200 && g.json) {
    if (g.json.pausado) problema('A proteção do guardião está ligada: as clientes estão confirmando pelo WhatsApp. Confira os pedidos com a Amanda e religue em Mais › Segurança.');
    if (g.json.graves > 0) problema(`O guardião do banco tem ${g.json.graves} alerta(s) grave(s) que a Amanda ainda não viu (Mais › Segurança no painel).`);
  }
}

// ---------- 3. aviso no GitHub (e-mail para o Kevin) ----------
async function avisarGitHub() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return true;
  const gh = async (caminho, metodo = 'GET', corpo) => {
    const r = await fetch('https://api.github.com/repos/' + repo + caminho, { method: metodo, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (!r.ok) throw new Error(`GitHub ${metodo} ${caminho}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.status === 204 ? null : r.json();
  };
  const abertos = (await gh('/issues?state=open&per_page=50')).filter((i) => !i.pull_request && i.title.startsWith('Guardião:'));
  const aberto = abertos[0];
  const marca = '<!-- guardiao:' + hash(problemas.join('\n')).slice(0, 16) + ' -->';
  const dono = process.env.GITHUB_REPOSITORY_OWNER;
  if (problemas.length) {
    const corpo = `${marca}\n${dono ? '@' + dono + ' ' : ''}o guardião encontrou ${problemas.length === 1 ? 'um problema' : problemas.length + ' problemas'} no site da Amanda:\n\n${problemas.map((p) => '- ' + p).join('\n')}\n\nConferido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Este aviso fecha sozinho quando tudo voltar ao normal.`;
    if (!aberto) await gh('/issues', 'POST', { title: 'Guardião: algo fora do normal no site', body: corpo });
    else if (!aberto.body.includes(marca)) { await gh(`/issues/${aberto.number}`, 'PATCH', { body: corpo }); await gh(`/issues/${aberto.number}/comments`, 'POST', { body: 'A situação mudou:\n\n' + problemas.map((p) => '- ' + p).join('\n') }); }
  } else if (aberto) {
    await gh(`/issues/${aberto.number}/comments`, 'POST', { body: 'Tudo normal de novo. Fechando este aviso.' });
    await gh(`/issues/${aberto.number}`, 'PATCH', { state: 'closed', state_reason: 'completed' });
  }
  return true;
}

await conferirSite();
await conferirBanco();
const relatorio = { ok: !problemas.length, problemas, notas, site: SITE };
if (process.argv.includes('--json')) console.log(JSON.stringify(relatorio));
else console.log(problemas.length ? 'PROBLEMAS:\n' + problemas.map((p) => '- ' + p).join('\n') : 'Tudo certo: site e banco como deveriam.' + (notas.length ? '\n' + notas.join('\n') : ''));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Guardião\n\n${problemas.length ? problemas.map((p) => '- ' + p).join('\n') : 'Tudo certo.'}\n`);
if (process.env.GITHUB_TOKEN) {
  try { await avisarGitHub(); } catch (e) { console.error(e.message); process.exit(1); }
  process.exit(0);
}
process.exit(problemas.length ? 1 : 0);
