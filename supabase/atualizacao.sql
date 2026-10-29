-- =====================================================================
-- Atualização da agenda da Amanda (vale para quem JÁ rodou o schema.sql).
--
-- Cole tudo no SQL Editor do Supabase e toque em Run. Se aparecer o aviso
-- "Make sure you are not accidentally removing something important",
-- toque em Run de novo: os comandos "drop ... if exists" só recriam regras
-- e gatilhos. Nenhum horário, cliente ou serviço é apagado.
--
-- Este arquivo junta todas as atualizações: serve para qualquer versão
-- anterior do banco e pode ser rodado quantas vezes quiser.
-- =====================================================================

-- >>> ATUALIZAÇÕES (bloco idêntico no schema.sql e no atualizacao.sql)

-- ---------------------------------------------------------------------
-- Serviços (a Amanda edita pelo painel; o site lê daqui)
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id text primary key check (id ~ '^[a-z0-9-]{2,30}$'),
  nome text not null check (length(trim(nome)) between 2 and 40),
  detalhe text check (length(detalhe) <= 60),
  novidade boolean not null default false,
  desde date,
  ativo boolean not null default true,
  ordem integer not null default 0
);
alter table public.servicos enable row level security;
revoke all on public.servicos from anon;
grant select, insert, update, delete on public.servicos to authenticated;

drop policy if exists "admin_servicos" on public.servicos;
create policy "admin_servicos" on public.servicos
  for all to authenticated
  using (public.sou_admin())
  with check (public.sou_admin());

insert into public.servicos (id, nome, detalhe, novidade, desde, ordem) values
  ('auriculo', 'Auriculoterapia', 'Ansiedade, sono e bem-estar', false, null, 1),
  ('limpeza', 'Limpeza de pele', 'R$ 75 na inauguração', true, '2026-11-14', 2)
on conflict (id) do nothing;

-- O site vê só os serviços visíveis.
create or replace function public.servicos_publicos()
returns table (id text, nome text, detalhe text, novidade boolean, desde date)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.nome, s.detalhe, s.novidade, s.desde
    from public.servicos s
   where s.ativo
   order by s.ordem, s.nome
$$;

-- ---------------------------------------------------------------------
-- Lembrete: guarda quando a Amanda mandou o lembrete para a cliente
-- ---------------------------------------------------------------------
alter table public.horarios add column if not exists lembrete_em timestamptz;
alter table public.horarios drop constraint if exists dados_coerentes;
alter table public.horarios add constraint dados_coerentes check (
  (status = 'livre' and nome is null and servico is null and telefone is null and pedido_em is null and lembrete_em is null)
  or (status <> 'livre' and nome is not null)
);

-- ---------------------------------------------------------------------
-- Horário nunca vai para o passado: ao abrir é descartado;
-- ao mudar dia ou hora de um horário existente, a mudança é recusada.
-- ---------------------------------------------------------------------
create or replace function public.bloqueia_horario_passado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.data + new.hora::time) <= public.agora_sp() then
    if tg_op = 'INSERT' then
      return null;
    end if;
    raise exception 'horario_passado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_horario_passado on public.horarios;
create trigger trg_horario_passado
  before insert or update of data, hora on public.horarios
  for each row execute function public.bloqueia_horario_passado();

-- ---------------------------------------------------------------------
-- Guardião: vigia o banco em tempo real e guarda alertas para a Amanda
-- ---------------------------------------------------------------------
-- Uma linha só, com o estado da proteção e os limites (ajustáveis aqui).
create table if not exists public.guardiao (
  id smallint primary key default 1 check (id = 1),
  pausado boolean not null default false,
  pausado_em timestamptz,
  pausado_por text,
  motivo text,
  contar_desde timestamptz,
  sal text not null default md5(random()::text || clock_timestamp()::text),
  max_10min integer not null default 6,        -- pedidos pelo site em 10 minutos
  max_hora integer not null default 15,        -- pedidos pelo site em 1 hora
  max_origem_hora integer not null default 4,  -- pedidos do mesmo aparelho/rede em 1 hora
  max_sondagem integer not null default 15,    -- tentativas estranhas em 10 minutos
  max_limite integer not null default 8        -- tentativas além do limite em 10 minutos
);
insert into public.guardiao (id) values (1) on conflict (id) do nothing;
alter table public.guardiao enable row level security;
revoke all on public.guardiao from anon, authenticated;

create table if not exists public.alertas (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  tipo text not null,
  nivel text not null check (nivel in ('aviso', 'grave')),
  titulo text not null,
  detalhe text,
  visto_em timestamptz,
  chave text unique  -- evita repetir o mesmo alerta
);
alter table public.alertas enable row level security;
revoke all on public.alertas from anon, authenticated;

-- O que chega pelo site, para contar (a origem é guardada embaralhada, nunca o IP).
create table if not exists public.eventos (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  tipo text not null,
  origem text
);
create index if not exists eventos_em on public.eventos (em);
alter table public.eventos enable row level security;
revoke all on public.eventos from anon, authenticated;

-- Aparelhos que já entraram no painel (para avisar quando aparece um novo).
create table if not exists public.aparelhos_vistos (
  session_id uuid primary key,
  visto_em timestamptz not null default now()
);
alter table public.aparelhos_vistos enable row level security;
revoke all on public.aparelhos_vistos from anon, authenticated;

create or replace function public.alerta(p_tipo text, p_nivel text, p_titulo text, p_detalhe text, p_chave text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.alertas (tipo, nivel, titulo, detalhe, chave)
  values (p_tipo, p_nivel, p_titulo, p_detalhe, p_chave)
  on conflict (chave) do nothing
$$;

-- De onde veio o pedido, embaralhado (o mesmo celular/rede dá sempre o mesmo código).
create or replace function public.origem_pedido()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h json;
  ip text;
  v_sal text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    h := null;
  end;
  ip := coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(h ->> 'x-real-ip', ''), nullif(btrim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''));
  if ip is null then
    return 'desconhecida';
  end if;
  select g.sal into v_sal from public.guardiao g where g.id = 1;
  return left(md5(coalesce(v_sal, '') || ip), 16);
end;
$$;

-- Confere os números depois de cada pedido e reage na hora.
create or replace function public.vigia()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guardiao;
  n10 integer;
  n60 integer;
  sond integer;
  lim integer;
  hora text := to_char(public.agora_sp(), 'YYYY-MM-DD HH24');
begin
  select * into g from public.guardiao where id = 1;
  select count(*) filter (where e.tipo = 'pedido' and e.em > now() - interval '10 minutes'),
         count(*) filter (where e.tipo = 'pedido'),
         count(*) filter (where e.tipo in ('sondagem', 'dados') and e.em > now() - interval '10 minutes'),
         count(*) filter (where e.tipo = 'limite' and e.em > now() - interval '10 minutes')
    into n10, n60, sond, lim
    from public.eventos e
   where e.em > greatest(now() - interval '1 hour', coalesce(g.contar_desde, '-infinity'::timestamptz));

  -- enxurrada de pedidos: o site passa a mandar as clientes direto para o WhatsApp
  if not g.pausado and (n10 > g.max_10min or n60 > g.max_hora) then
    update public.guardiao
       set pausado = true, pausado_em = now(), pausado_por = 'guardião',
           motivo = 'Muitos pedidos pelo site em pouco tempo'
     where id = 1 and not pausado;
    if found then
      perform public.alerta('enxurrada', 'grave', 'Proteção ligada automaticamente',
        format('Chegaram %s pedidos pelo site em pouco tempo, o que não é normal. Para evitar pedidos falsos, as clientes agora são levadas direto para o seu WhatsApp. Confira os pedidos e, se estiver tudo certo, religue o agendamento pelo site em Segurança.', greatest(n10, n60)),
        null);
    end if;
  end if;

  if sond >= g.max_sondagem then
    perform public.alerta('sondagem', 'aviso', 'Tentativas estranhas no site',
      format('%s tentativas com dados inválidos ou horários que não existem nos últimos 10 minutos. Pode ser alguém testando o site. Nada foi alterado.', sond),
      'sondagem:' || hora);
  end if;
  if lim >= g.max_limite then
    perform public.alerta('limite', 'aviso', 'Alguém tentou marcar muitos horários',
      format('%s tentativas de marcar além do limite nos últimos 10 minutos. Foram todas barradas.', lim),
      'limite:' || hora);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Histórico completo: também mudança de dia/hora, edição, lembrete e remarcação.
-- E vigia: muitos horários com cliente cancelados de uma vez geram alerta.
-- ---------------------------------------------------------------------
alter table public.historico add column if not exists obs text;
create index if not exists historico_em on public.historico (em desc);

create or replace function public.registra_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem text := coalesce(auth.jwt() ->> 'email', 'site');
  v_motivo text := nullif(current_setting('agenda.motivo', true), '');
  v_obs text := v_motivo;
  n integer;
begin
  if tg_op = 'INSERT' then
    insert into public.historico (horario_id, data, hora, de, para, nome, quem, obs)
    values (new.id, new.data, new.hora, null, new.status, new.nome, v_quem, v_motivo);
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.historico (horario_id, data, hora, de, para, nome, quem, obs)
    values (old.id, old.data, old.hora, old.status, 'removido', old.nome, v_quem, v_motivo);
  else
    if v_obs is null then
      if old.data is distinct from new.data or old.hora is distinct from new.hora then
        v_obs := 'mudou de ' || old.data::text || ' ' || old.hora;
      elsif old.lembrete_em is null and new.lembrete_em is not null then
        v_obs := 'lembrete';
      elsif old.status = new.status
            and (old.nome, old.telefone, old.servico) is distinct from (new.nome, new.telefone, new.servico) then
        v_obs := 'editado';
      end if;
    end if;
    if old.status is distinct from new.status or v_obs is not null then
      insert into public.historico (horario_id, data, hora, de, para, nome, quem, obs)
      values (new.id, new.data, new.hora, old.status, new.status, coalesce(new.nome, old.nome), v_quem, v_obs);
    end if;
  end if;

  if v_quem <> 'site' and old.status in ('pedido', 'confirmado')
     and (tg_op = 'DELETE' or new.status = 'livre') and coalesce(v_motivo, '') <> 'remarcado' then
    select count(*) into n
      from public.historico h
     where h.quem = v_quem and h.em > now() - interval '10 minutes'
       and h.de in ('pedido', 'confirmado') and h.para in ('livre', 'removido')
       and coalesce(h.obs, '') <> 'remarcado';
    if n >= 6 then
      perform public.alerta('cancelamentos', 'grave', 'Muitos horários com cliente cancelados de uma vez',
        format('%s horários com cliente foram cancelados ou apagados nos últimos 10 minutos (por %s). Se foi você, pode ignorar. Se não foi, troque sua senha agora em Minha conta.', n, v_quem),
        'cancelamentos:' || v_quem || ':' || to_char(public.agora_sp(), 'YYYY-MM-DD HH24'));
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_historico on public.horarios;
create trigger trg_historico
  after insert or update or delete on public.horarios
  for each row execute function public.registra_historico();

-- ---------------------------------------------------------------------
-- A cliente pede um horário. A checagem e a reserva acontecem numa única
-- instrução, então duas clientes nunca pegam o mesmo horário.
-- Resposta: 'ok' | 'indisponivel' | 'dados' | 'servico' | 'limite' | 'pausado'
-- ---------------------------------------------------------------------
create or replace function public.pedir_horario(p_id uuid, p_servico text, p_nome text, p_telefone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guardiao;
  v_origem text;
  v_tel text;
  v_nome text;
  v_serv text := btrim(coalesce(p_servico, ''));
  v_desde date;
  v_data date;
  v_hora text;
  ativos integer;
begin
  -- conferência do diagnóstico e do guardião externo: não reserva nem conta nada
  if p_id = '00000000-0000-0000-0000-000000000000' then
    return 'indisponivel';
  end if;

  -- proteção ligada: o site leva a cliente direto para o WhatsApp
  select * into g from public.guardiao where id = 1;
  if g.pausado then
    return 'pausado';
  end if;
  v_origem := public.origem_pedido();

  v_tel := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  if v_tel like '55%' and length(v_tel) in (12, 13) then
    v_tel := substr(v_tel, 3);
  end if;
  -- nome sem caracteres invisíveis, de controle ou espaços repetidos
  v_nome := regexp_replace(coalesce(p_nome, ''), '[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]', '', 'g');
  v_nome := left(btrim(regexp_replace(regexp_replace(v_nome, '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 60);

  if length(v_nome) < 2 or v_nome !~ '[[:alpha:]]'
     or v_nome ~* '(https?:|www\.|\.(com|net|org|br|ly|me|io)(\W|$)|@)'
     or length(v_tel) not in (10, 11) or v_tel !~ '^[1-9][1-9]' or v_tel ~ '^(\d)\1+$'
     or length(v_serv) < 2 then
    insert into public.eventos (tipo, origem) values ('dados', v_origem);
    perform public.vigia();
    return 'dados';
  end if;

  -- só serviços que estão no site, e só a partir da data de estreia
  if exists (select 1 from public.servicos) then
    select s.nome, s.desde into v_serv, v_desde
      from public.servicos s
     where s.ativo and lower(s.nome) = lower(v_serv)
     limit 1;
    if not found then
      insert into public.eventos (tipo, origem) values ('dados', v_origem);
      perform public.vigia();
      return 'servico';
    end if;
  end if;

  -- limites: 2 horários ativos por telefone e poucos pedidos por aparelho/rede
  select count(*) into ativos
    from public.horarios h
   where h.telefone = v_tel
     and h.status in ('pedido', 'confirmado')
     and (h.data + h.hora::time) > public.agora_sp();
  if ativos >= 2
     or (v_origem <> 'desconhecida'
         and (select count(*) from public.eventos e
               where e.tipo = 'pedido' and e.origem = v_origem and e.em > now() - interval '1 hour') >= g.max_origem_hora) then
    insert into public.eventos (tipo, origem) values ('limite', v_origem);
    perform public.vigia();
    return 'limite';
  end if;

  update public.horarios h
     set status = 'pedido',
         servico = left(v_serv, 40),
         nome = v_nome,
         telefone = v_tel,
         pedido_em = now()
   where h.id = p_id
     and h.status = 'livre'
     and (h.data + h.hora::time) > public.agora_sp() + public.antecedencia()
     and (v_desde is null or h.data >= v_desde)
  returning h.data, h.hora into v_data, v_hora;

  if found then
    insert into public.eventos (tipo, origem) values ('pedido', v_origem);
    perform public.vigia();
    -- avisa a Amanda no celular (sem o nome da cliente)
    perform public.notificar('Novo pedido de horário',
      public.quando_texto(v_data, v_hora) || ' · ' || v_serv || '. Abra o painel para confirmar.', 4, 'calendar');
    return 'ok';
  end if;
  if not exists (select 1 from public.horarios h where h.id = p_id) then
    insert into public.eventos (tipo, origem) values ('sondagem', v_origem);
    perform public.vigia();
  end if;
  return 'indisponivel';
end;
$$;

-- ---------------------------------------------------------------------
-- Remarcar: leva a cliente de um horário para outro livre, numa operação só.
-- Resposta: 'ok' | 'indisponivel' (destino ocupado ou passado) | 'origem' (nada para mover) | 'sem_acesso'
-- ---------------------------------------------------------------------
create or replace function public.remarcar(p_de uuid, p_para uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.horarios;
  d public.horarios;
begin
  if not public.sou_admin() then
    perform public.alerta('intruso', 'grave', 'Uma conta sem permissão tentou mexer na agenda',
      'Conta: ' || coalesce(auth.jwt() ->> 'email', 'sem e-mail') || '. Nada foi alterado.',
      'intruso:' || coalesce(auth.jwt() ->> 'email', '') || ':' || to_char(public.agora_sp(), 'YYYY-MM-DD'));
    return 'sem_acesso';
  end if;
  if p_de = p_para then
    return 'indisponivel';
  end if;

  -- trava as duas linhas sempre na mesma ordem (evita bloqueio cruzado)
  perform 1 from public.horarios h where h.id in (p_de, p_para) order by h.id for update;
  select * into o from public.horarios h where h.id = p_de;
  select * into d from public.horarios h where h.id = p_para;

  if o.id is null or o.status = 'livre' then
    return 'origem';
  end if;
  if d.id is null or d.status <> 'livre' or (d.data + d.hora::time) <= public.agora_sp() then
    return 'indisponivel';
  end if;

  perform set_config('agenda.motivo', 'remarcado', true);
  update public.horarios h
     set status = o.status, servico = o.servico, nome = o.nome, telefone = o.telefone,
         pedido_em = coalesce(o.pedido_em, now()), lembrete_em = null
   where h.id = p_para;
  update public.horarios h
     set status = 'livre', servico = null, nome = null, telefone = null, pedido_em = null, lembrete_em = null
   where h.id = p_de;
  perform set_config('agenda.motivo', '', true);
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------
-- Painel: situação do guardião, ligar/desligar a proteção, marcar alertas como vistos
-- ---------------------------------------------------------------------
create or replace function public.situacao_guardiao()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guardiao;
  v_atual uuid;
  v_havia boolean;
  v_aparelhos json;
  s record;
begin
  if not public.sou_admin() then
    perform public.alerta('intruso', 'grave', 'Uma conta sem permissão tentou abrir o painel',
      'Conta: ' || coalesce(auth.jwt() ->> 'email', 'sem e-mail') || '.',
      'intruso:' || coalesce(auth.jwt() ->> 'email', '') || ':' || to_char(public.agora_sp(), 'YYYY-MM-DD'));
    return null;
  end if;

  delete from public.eventos where em < now() - interval '7 days';

  -- aparelhos conectados (sessões de login); se o Supabase não permitir ler, segue sem a lista
  begin
    v_atual := nullif(auth.jwt() ->> 'session_id', '')::uuid;
    select exists (select 1 from public.aparelhos_vistos) into v_havia;
    for s in
      select x.id, x.user_agent from auth.sessions x
       where x.user_id = auth.uid()
         and not exists (select 1 from public.aparelhos_vistos v where v.session_id = x.id)
    loop
      insert into public.aparelhos_vistos (session_id) values (s.id) on conflict do nothing;
      if v_havia then
        perform public.alerta('aparelho', 'aviso', 'Novo acesso ao painel',
          coalesce(nullif(s.user_agent, ''), 'Aparelho não identificado'), 'aparelho:' || s.id::text);
      end if;
    end loop;
    select coalesce(json_agg(json_build_object(
             'id', x.id, 'desde', x.created_at, 'uso', coalesce(x.updated_at, x.created_at),
             'aparelho', x.user_agent, 'atual', x.id = v_atual)
             order by coalesce(x.updated_at, x.created_at) desc), '[]'::json)
      into v_aparelhos
      from auth.sessions x
     where x.user_id = auth.uid();
  exception when others then
    v_aparelhos := null;
  end;

  select * into g from public.guardiao where id = 1;
  return json_build_object(
    'pausado', g.pausado,
    'pausado_em', g.pausado_em,
    'pausado_por', g.pausado_por,
    'motivo', g.motivo,
    'nao_vistos', (select count(*) from public.alertas a where a.visto_em is null),
    'graves', (select count(*) from public.alertas a where a.visto_em is null and a.nivel = 'grave'),
    'alertas', (select coalesce(json_agg(t order by t.em desc), '[]'::json)
                  from (select a.id, a.em, a.tipo, a.nivel, a.titulo, a.detalhe, a.visto_em
                          from public.alertas a order by a.em desc limit 30) t),
    'aparelhos', v_aparelhos,
    'ntfy', case when public.notificacoes_disponiveis() then g.ntfy_topico end);
end;
$$;

create or replace function public.definir_protecao(p_pausar boolean)
returns json
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    return public.situacao_guardiao();
  end if;
  update public.guardiao
     set pausado = p_pausar,
         pausado_em = case when p_pausar then now() end,
         pausado_por = case when p_pausar then coalesce(auth.jwt() ->> 'email', 'painel') end,
         motivo = case when p_pausar then 'Ligada pelo painel' end,
         -- ao religar, a contagem recomeça do zero
         contar_desde = case when p_pausar then contar_desde else now() end
   where id = 1;
  return public.situacao_guardiao();
end;
$$;

create or replace function public.marcar_alertas_vistos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.sou_admin() then
    return 0;
  end if;
  update public.alertas set visto_em = now() where visto_em is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Para o guardião externo e o diagnóstico: só números, nada de dados de clientes.
create or replace function public.guardiao_publico()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'versao', 3,
    'pausado', coalesce((select g.pausado from public.guardiao g where g.id = 1), false),
    'graves', (select count(*) from public.alertas a where a.visto_em is null and a.nivel = 'grave'))
$$;

-- ---------------------------------------------------------------------
-- Notificações no celular da Amanda (app ntfy, grátis).
-- O código secreto do canal fica só aqui no banco; ela assina pelo painel.
-- As mensagens não levam nome nem telefone de cliente.
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível: as notificações ficam desligadas';
end $$;

alter table public.guardiao add column if not exists ntfy_topico text not null
  default ('amanda-' || substr(md5(random()::text || clock_timestamp()::text), 1, 20));
alter table public.guardiao add column if not exists ntfy_ligado boolean not null default true;
alter table public.guardiao add column if not exists painel_url text not null
  default 'https://kevinlaet.github.io/AMANDA-ROCHA-AT/admin/';

create or replace function public.notificacoes_disponiveis()
returns boolean
language sql
stable
set search_path = ''
as $$ select to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null $$;

-- Envia a notificação sem travar nada: se der erro, o resto continua normalmente.
create or replace function public.notificar(p_titulo text, p_texto text, p_prioridade integer, p_tag text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.guardiao;
begin
  select * into g from public.guardiao where id = 1;
  if g.ntfy_topico is null or not g.ntfy_ligado or not public.notificacoes_disponiveis() then
    return false;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, params := ''{}''::jsonb, headers := ''{"Content-Type": "application/json"}''::jsonb, timeout_milliseconds := 5000)'
      using 'https://ntfy.sh/', jsonb_build_object('topic', g.ntfy_topico, 'title', p_titulo, 'message', p_texto,
                                                   'priority', p_prioridade, 'tags', jsonb_build_array(p_tag), 'click', g.painel_url);
    return true;
  exception when others then
    return false;
  end;
end;
$$;

-- Alertas graves e acessos novos ao painel viram notificação na hora.
create or replace function public.notifica_alerta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.nivel = 'grave' or new.tipo = 'aparelho' then
    perform public.notificar(new.titulo,
      case when new.tipo = 'aparelho' then 'Um aparelho novo entrou no seu painel. Se não foi você, abra o painel em Mais › Segurança.'
           else 'Abra o painel em Mais › Segurança para ver o que aconteceu.' end,
      case when new.nivel = 'grave' then 5 else 4 end,
      case when new.nivel = 'grave' then 'warning' else 'lock' end);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_notifica_alerta on public.alertas;
create trigger trg_notifica_alerta
  after insert on public.alertas
  for each row execute function public.notifica_alerta();

-- Texto curto do dia e hora: "sábado, 14/11 às 15h"
create or replace function public.quando_texto(p_data date, p_hora text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[extract(dow from p_data)::int + 1]
         || ', ' || to_char(p_data, 'DD/MM') || ' às '
         || split_part(p_hora, ':', 1)::int::text || 'h' || coalesce(nullif(split_part(p_hora, ':', 2), '00'), '')
$$;

-- Botão "Enviar teste" do painel
create or replace function public.testar_notificacao()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    return false;
  end if;
  return public.notificar('Notificações ligadas', 'Pronto! Os avisos da sua agenda vão chegar aqui.', 3, 'white_check_mark');
end;
$$;

-- ---------------------------------------------------------------------
-- Clientes: a ficha de cada cliente é montada a partir da agenda;
-- a Amanda só guarda anotações (alergias, preferências, observações).
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  chave text primary key check (length(chave) between 2 and 80),  -- telefone, ou "nome:..." para quem não tem telefone
  obs text check (length(obs) <= 500),
  atualizado_em timestamptz not null default now()
);
alter table public.clientes enable row level security;
revoke all on public.clientes from anon, authenticated;

create or replace function public.clientes_resumo()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    return null;
  end if;
  return (
    select coalesce(json_agg(t order by t.recente desc), '[]'::json)
      from (
        select k.chave,
               (array_agg(h.nome order by h.data desc, h.hora desc))[1] as nome,
               max(h.telefone) as telefone,
               count(*) filter (where h.status = 'confirmado' and (h.data + h.hora::time) <= public.agora_sp()) as atendimentos,
               max(h.data) filter (where h.status = 'confirmado' and (h.data + h.hora::time) <= public.agora_sp()) as ultima,
               min(h.data + h.hora::time) filter (where (h.data + h.hora::time) > public.agora_sp()) as proxima,
               array_agg(distinct h.servico) filter (where h.servico is not null and h.servico not in ('Combinado por fora', 'Manual')) as servicos,
               (array_agg(h.servico order by h.data desc, h.hora desc) filter (where h.status = 'confirmado' and (h.data + h.hora::time) <= public.agora_sp()))[1] as ultimo_servico,
               min(h.data) as desde,
               max(h.data) as recente,
               c.obs
          from public.horarios h
          cross join lateral (select coalesce(h.telefone, 'nome:' || lower(btrim(h.nome))) as chave) k
          left join public.clientes c on c.chave = k.chave
         where h.status in ('pedido', 'confirmado') and h.nome is not null and h.nome <> 'Marcado por fora'
         group by k.chave, c.obs
      ) t
  );
end;
$$;

create or replace function public.salvar_cliente(p_chave text, p_obs text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    return false;
  end if;
  insert into public.clientes (chave, obs, atualizado_em)
  values (left(btrim(p_chave), 80), nullif(left(btrim(coalesce(p_obs, '')), 500), ''), now())
  on conflict (chave) do update set obs = excluded.obs, atualizado_em = now();
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- (o Supabase dá acesso automático a funções novas; aqui tudo é fechado e
-- depois liberado só para quem precisa)
-- ---------------------------------------------------------------------
revoke all on function public.agenda_publica() from public, anon, authenticated;
revoke all on function public.pedir_horario(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.sou_admin() from public, anon, authenticated;
revoke all on function public.agora_sp() from public, anon, authenticated;
revoke all on function public.antecedencia() from public, anon, authenticated;
revoke all on function public.registra_historico() from public, anon, authenticated;
revoke all on function public.bloqueia_horario_passado() from public, anon, authenticated;
revoke all on function public.servicos_publicos() from public, anon, authenticated;
revoke all on function public.remarcar(uuid, uuid) from public, anon, authenticated;
revoke all on function public.alerta(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.origem_pedido() from public, anon, authenticated;
revoke all on function public.vigia() from public, anon, authenticated;
revoke all on function public.situacao_guardiao() from public, anon, authenticated;
revoke all on function public.definir_protecao(boolean) from public, anon, authenticated;
revoke all on function public.marcar_alertas_vistos() from public, anon, authenticated;
revoke all on function public.guardiao_publico() from public, anon, authenticated;
revoke all on function public.clientes_resumo() from public, anon, authenticated;
revoke all on function public.notificar(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.notifica_alerta() from public, anon, authenticated;
revoke all on function public.notificacoes_disponiveis() from public, anon, authenticated;
revoke all on function public.quando_texto(date, text) from public, anon, authenticated;
revoke all on function public.testar_notificacao() from public, anon, authenticated;
revoke all on function public.salvar_cliente(text, text) from public, anon, authenticated;

grant execute on function public.agenda_publica() to anon, authenticated;
grant execute on function public.pedir_horario(uuid, text, text, text) to anon, authenticated;
grant execute on function public.servicos_publicos() to anon, authenticated;
grant execute on function public.guardiao_publico() to anon, authenticated;
grant execute on function public.agora_sp() to anon, authenticated;
grant execute on function public.sou_admin() to authenticated;
grant execute on function public.remarcar(uuid, uuid) to authenticated;
grant execute on function public.situacao_guardiao() to authenticated;
grant execute on function public.definir_protecao(boolean) to authenticated;
grant execute on function public.marcar_alertas_vistos() to authenticated;
grant execute on function public.clientes_resumo() to authenticated;
grant execute on function public.testar_notificacao() to authenticated;
grant execute on function public.salvar_cliente(text, text) to authenticated;
