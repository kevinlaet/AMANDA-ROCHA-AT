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
  ('auriculo', 'Auriculoterapia', 'Dores, ansiedade e sono', false, null, 1),
  ('limpeza', 'Limpeza de pele', 'R$ 75 na inauguração', true, '2026-11-14', 2)
on conflict (id) do nothing;

-- a auriculoterapia também ajuda com dores (só troca se a Amanda não tiver mudado o texto)
update public.servicos set detalhe = 'Dores, ansiedade e sono'
 where id = 'auriculo' and detalhe = 'Ansiedade, sono e bem-estar';

-- Duração de cada procedimento, em minutos, já contando o preparo para a próxima cliente.
-- Valores iniciais prudentes; a Amanda ajusta no painel (Mais › Serviços e preços).
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'servicos' and column_name = 'duracao') then
    alter table public.servicos add column duracao integer not null default 60 check (duracao between 10 and 480);
    update public.servicos set duracao = 90 where id = 'limpeza';
  end if;
end $$;

-- Personalização de cada serviço no site: preço, preço antes da promoção (aparece riscado),
-- observação do preço, texto do serviço e até 3 benefícios principais.
create or replace function public.beneficios_ok(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null
      or (coalesce(array_length(p, 1), 0) <= 3
          and not exists (select 1 from unnest(p) b where b is null or length(b) > 40))
$$;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'servicos' and column_name = 'preco') then
    alter table public.servicos
      add column preco numeric(8,2) check (preco >= 0 and preco < 100000),
      add column preco_antes numeric(8,2) check (preco_antes >= 0 and preco_antes < 100000),
      add column preco_obs text check (length(preco_obs) <= 40),
      add column descricao text check (length(descricao) <= 500),
      add column beneficios text[] check (public.beneficios_ok(beneficios));
    -- textos iniciais (os mesmos do site); a Amanda muda tudo no painel
    update public.servicos set
      descricao = 'Técnica da medicina chinesa que estimula pontos da orelha. Cada ponto está ligado a uma parte do corpo. Assim, ajudamos o corpo a se equilibrar, relaxar e aliviar dores.',
      beneficios = array['Alívio de dores', 'Menos ansiedade', 'Sono mais tranquilo']
     where id = 'auriculo';
    update public.servicos set
      preco = 75,
      preco_obs = 'valor de inauguração',
      detalhe = case when detalhe = 'R$ 75 na inauguração' then 'Pele limpa, renovada e com viço' else detalhe end,
      descricao = 'Remove impurezas, cravos e células mortas. A pele fica mais limpa, leve e com viço. Um momento de relaxamento só seu.',
      beneficios = array['Menos cravos', 'Controle da oleosidade', 'Pele renovada']
     where id = 'limpeza';
  end if;
end $$;

-- O site vê só os serviços visíveis.
drop function if exists public.servicos_publicos();
create or replace function public.servicos_publicos()
returns table (id text, nome text, detalhe text, novidade boolean, desde date, duracao integer,
               preco numeric, preco_antes numeric, preco_obs text, descricao text, beneficios text[])
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.nome, s.detalhe, s.novidade, s.desde, s.duracao,
         s.preco, s.preco_antes, s.preco_obs, s.descricao, s.beneficios
    from public.servicos s
   where s.ativo
   order by s.ordem, s.nome
$$;

-- Quanto tempo um atendimento ocupa (serviço desconhecido ou "combinado por fora": 1 hora).
create or replace function public.duracao_de(p_servico text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.duracao from public.servicos s where lower(s.nome) = lower(btrim(coalesce(p_servico, ''))) limit 1), 60)
$$;

-- ---------------------------------------------------------------------
-- Lembrete: guarda quando a Amanda mandou o lembrete para a cliente
-- ---------------------------------------------------------------------
alter table public.horarios add column if not exists lembrete_em timestamptz;

-- ---------------------------------------------------------------------
-- Seus números: quanto rendeu cada atendimento e se a cliente não veio
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'horarios' and column_name = 'valor') then
    alter table public.horarios add column valor numeric(8,2) check (valor is null or valor between 0 and 99999);
    -- quem já estava marcado fica com o preço atual do serviço (se ele tiver preço)
    update public.horarios h set valor = s.preco
      from public.servicos s
     where h.status <> 'livre' and lower(s.nome) = lower(btrim(coalesce(h.servico, '')));
  end if;
end $$;
alter table public.horarios add column if not exists faltou boolean not null default false;

alter table public.horarios drop constraint if exists dados_coerentes;
alter table public.horarios add constraint dados_coerentes check (
  (status = 'livre' and nome is null and servico is null and telefone is null and pedido_em is null and lembrete_em is null
   and valor is null and not faltou)
  or (status <> 'livre' and nome is not null)
);

-- O valor é o preço do serviço quando a cliente marcou; a Amanda pode ajustar
-- (desconto, pacote, cortesia = 0). Mudou o serviço sem mexer no valor: vale o
-- preço do serviço novo. Horário livre não tem valor nem falta, e "não veio" só
-- vale para atendimento confirmado que já começou.
create or replace function public.ajusta_atendimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'livre' then
    new.valor := null;
    new.faltou := false;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'livre' and new.servico is distinct from old.servico
     and new.valor is not distinct from old.valor then
    new.valor := null;
  end if;
  if new.valor is null then
    new.valor := (select s.preco from public.servicos s
                   where lower(s.nome) = lower(btrim(coalesce(new.servico, ''))) limit 1);
  end if;
  if new.faltou and (new.status <> 'confirmado' or (new.data + new.hora::time) > public.agora_sp()) then
    new.faltou := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ajusta_atendimento on public.horarios;
create trigger trg_ajusta_atendimento
  before insert or update on public.horarios
  for each row execute function public.ajusta_atendimento();

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
-- Um dia de cada vez: enquanto um pedido confere se cabe no dia, nenhuma
-- outra marcação desse dia passa na frente (evita dois atendimentos colados).
-- ---------------------------------------------------------------------
create or replace function public.trava_dia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('agenda:' || new.data::text));
  return new;
end;
$$;

drop trigger if exists trg_trava_dia on public.horarios;
create trigger trg_trava_dia
  before insert or update on public.horarios
  for each row when (new.status <> 'livre')
  execute function public.trava_dia();

-- ---------------------------------------------------------------------
-- O que o site público pode ver: dia, hora, se está livre e, quando
-- ocupado, até que horas (para não marcar ninguém em cima). Nunca nomes ou telefones.
-- ---------------------------------------------------------------------
drop function if exists public.agenda_publica();
create or replace function public.agenda_publica()
returns table (id uuid, data date, hora text, status text, ate timestamp)
language sql
stable
security definer
set search_path = ''
as $$
  -- 'bloqueio': atendimento que já começou (ou começa em menos de 1 hora); não aparece como
  -- opção no site, mas ainda ocupa o tempo até terminar
  select h.id, h.data, h.hora,
         case when h.status = 'livre' then 'livre'
              when (h.data + h.hora::time) <= public.agora_sp() + public.antecedencia() then 'bloqueio'
              else 'ocupado' end,
         case when h.status = 'livre' then null
              else h.data + h.hora::time + make_interval(mins => public.duracao_de(h.servico)) end
    from public.horarios h
   where (h.data + h.hora::time) > public.agora_sp() + public.antecedencia()
      or (h.status <> 'livre' and h.data + h.hora::time + make_interval(mins => public.duracao_de(h.servico)) > public.agora_sp())
   order by h.data, h.hora
$$;

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
      elsif old.status = new.status and old.faltou is distinct from new.faltou then
        v_obs := case when new.faltou then 'faltou' else 'veio' end;
      elsif old.status = new.status
            and (old.nome, old.telefone, old.servico, old.valor) is distinct from (new.nome, new.telefone, new.servico, new.valor) then
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
-- Resposta: 'ok' | 'indisponivel' | 'conflito' | 'dados' | 'servico' | 'limite' | 'pausado'
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
  v_ini timestamp;
  v_fim timestamp;
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

  -- o procedimento precisa caber sem encostar em outro atendimento do dia
  select h.data, h.hora into v_data, v_hora from public.horarios h where h.id = p_id;
  if found then
    perform pg_advisory_xact_lock(hashtext('agenda:' || v_data::text));
    v_ini := v_data + v_hora::time;
    v_fim := v_ini + make_interval(mins => public.duracao_de(v_serv));
    if exists (select 1 from public.horarios o
                where o.id <> p_id and o.status in ('pedido', 'confirmado')
                  and o.data between v_data - 1 and v_data + 1
                  and (o.data + o.hora::time) < v_fim
                  and (o.data + o.hora::time) + make_interval(mins => public.duracao_de(o.servico)) > v_ini) then
      return 'conflito';
    end if;
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
      split_part(v_nome, ' ', 1) || ' pediu ' || public.quando_texto(v_data, v_hora) || ' · ' || v_serv || '. Abra o painel para confirmar.', 4, 'calendar');
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
         pedido_em = coalesce(o.pedido_em, now()), lembrete_em = null, valor = o.valor
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
    'ntfy', case when public.notificacoes_disponiveis() then g.ntfy_topico end,
    'resumo', public.resumo_ligado());
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
drop function if exists public.guardiao_publico();
create or replace function public.guardiao_publico()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return json_build_object(
    'versao', 4,
    'notificacoes', public.notificacoes_disponiveis(),
    'resumo', public.resumo_ligado(),
    'pausado', coalesce((select g.pausado from public.guardiao g where g.id = 1), false),
    'graves', (select count(*) from public.alertas a where a.visto_em is null and a.nivel = 'grave'));
end;
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
  default 'https://amandarochabemestar.com.br/admin/';
-- o site mudou para o domínio próprio: as notificações passam a abrir o painel no endereço novo
update public.guardiao set painel_url = 'https://amandarochabemestar.com.br/admin/'
  where painel_url = 'https://kevinlaet.github.io/AMANDA-ROCHA-AT/admin/';

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

-- Hora curta: "15h", "13h30"
create or replace function public.hora_texto(p_hora text)
returns text
language sql
immutable
set search_path = ''
as $$
  select split_part(p_hora, ':', 1)::int::text || 'h' || coalesce(nullif(split_part(p_hora, ':', 2), '00'), '')
$$;

-- Texto curto do dia e hora: "sábado, 14/11 às 15h"
create or replace function public.quando_texto(p_data date, p_hora text)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[extract(dow from p_data)::int + 1]
         || ', ' || to_char(p_data, 'DD/MM') || ' às ' || public.hora_texto(p_hora)
$$;

-- Bom dia: "Você tem 2 agendamentos para hoje:" e uma linha por cliente ("• 13h Maria · Auriculoterapia").
-- Só manda se houver agendamento no dia. Resposta: 'enviado' | 'vazio' | 'falhou'
create or replace function public.resumo_do_dia()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoje date := public.agora_sp()::date;
  v_lista text;
  n integer;
begin
  select count(*),
         string_agg('• ' || public.hora_texto(h.hora) || ' '
                    || case when h.nome = 'Marcado por fora' then 'marcado por fora' else split_part(btrim(h.nome), ' ', 1) end
                    || case when h.servico is null or h.servico in ('Combinado por fora', 'Manual') then '' else ' · ' || h.servico end
                    || case when h.status = 'pedido' then ' (falta confirmar)' else '' end,
                    chr(10) order by h.hora)
    into n, v_lista
    from public.horarios h
   where h.data = v_hoje and h.status in ('confirmado', 'pedido');
  if coalesce(n, 0) = 0 then
    return 'vazio';
  end if;
  if public.notificar('Bom dia! Sua agenda de hoje',
       'Você tem ' || n || case when n = 1 then ' agendamento' else ' agendamentos' end || ' para hoje:' || chr(10) || v_lista,
       3, 'sunny') then
    return 'enviado';
  end if;
  return 'falhou';
end;
$$;

-- Todo dia às 6h de Brasília (9h no relógio do servidor, que usa UTC)
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    begin
      create extension if not exists pg_cron;
    exception when others then
      raise notice 'pg_cron indisponível: o resumo das 6h fica desligado';
    end;
  end;
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    execute $cmd$select cron.schedule('amanda-resumo-do-dia', '0 9 * * *', 'select public.resumo_do_dia()')$cmd$;
  end if;
exception when others then
  raise notice 'não consegui agendar o resumo das 6h: %', sqlerrm;
end $$;

create or replace function public.resumo_ligado()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r boolean := false;
begin
  if to_regclass('cron.job') is null then
    return false;
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1)' into r using 'amanda-resumo-do-dia';
  return coalesce(r, false);
exception when others then
  return false;
end;
$$;

-- Botão "Enviar o resumo de hoje agora" do painel
create or replace function public.enviar_resumo_agora()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    return 'sem_acesso';
  end if;
  return public.resumo_do_dia();
end;
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
               count(*) filter (where h.status = 'confirmado' and not h.faltou and (h.data + h.hora::time) <= public.agora_sp()) as atendimentos,
               max(h.data) filter (where h.status = 'confirmado' and not h.faltou and (h.data + h.hora::time) <= public.agora_sp()) as ultima,
               min(h.data + h.hora::time) filter (where (h.data + h.hora::time) > public.agora_sp()) as proxima,
               array_agg(distinct h.servico) filter (where h.servico is not null and h.servico not in ('Combinado por fora', 'Manual')) as servicos,
               (array_agg(h.servico order by h.data desc, h.hora desc) filter (where h.status = 'confirmado' and not h.faltou and (h.data + h.hora::time) <= public.agora_sp()))[1] as ultimo_servico,
               count(*) filter (where h.faltou) as faltas,
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
-- Seus números: atendimentos e faturamento, só para a Amanda
-- ---------------------------------------------------------------------
create table if not exists public.painel_config (
  id boolean primary key default true check (id),
  meta_mensal numeric(9,2) check (meta_mensal is null or meta_mensal between 1 and 9999999)
);
alter table public.painel_config enable row level security;
revoke all on public.painel_config from anon, authenticated;
insert into public.painel_config (id) values (true) on conflict (id) do nothing;

-- Atendimento = horário confirmado que já começou e em que a cliente veio.
-- Valor = o que ficou no horário; sem valor, o preço atual do serviço.
create or replace function public.meus_numeros()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_agora timestamp := public.agora_sp();
  v_mes date := date_trunc('month', public.agora_sp())::date;
  v_ant date := (date_trunc('month', public.agora_sp()) - interval '1 month')::date;
  v_prox date := (date_trunc('month', public.agora_sp()) + interval '1 month')::date;
begin
  if not public.sou_admin() then
    return null;
  end if;
  return (
    with a as (
      select h.data, h.servico, h.nome, h.telefone, h.faltou,
             coalesce(h.valor, (select s.preco from public.servicos s
                                 where lower(s.nome) = lower(btrim(coalesce(h.servico, ''))) limit 1)) as valor,
             (h.data + h.hora::time) <= v_agora as feito
        from public.horarios h
       where h.status = 'confirmado'
    ),
    f as (select * from a where feito and not faltou)
    select json_build_object(
      'hoje', v_agora::date,
      'mes', (select json_build_object('atendimentos', count(*), 'faturamento', coalesce(sum(valor), 0),
                                       'sem_valor', count(*) filter (where valor is null))
                from f where data >= v_mes),
      'marcados', (select json_build_object('atendimentos', count(*), 'faturamento', coalesce(sum(valor), 0))
                     from a where not feito and data < v_prox),
      'anterior', (select json_build_object('atendimentos', count(*), 'faturamento', coalesce(sum(valor), 0))
                     from f where data >= v_ant and data < v_mes),
      'meses', (select json_agg(json_build_object('mes', m.mes, 'atendimentos', coalesce(x.n, 0), 'faturamento', coalesce(x.v, 0)) order by m.mes)
                  from (select g::date as mes from generate_series(v_mes - interval '5 months', v_mes::timestamp, interval '1 month') g) m
                  left join (select date_trunc('month', data)::date as mes, count(*) as n, sum(valor) as v from f group by 1) x on x.mes = m.mes),
      'servicos', (select coalesce(json_agg(json_build_object('servico', t.servico, 'atendimentos', t.n, 'faturamento', t.v) order by t.n desc, t.servico), '[]'::json)
                     from (select coalesce(servico, 'Combinado por fora') as servico, count(*) as n, coalesce(sum(valor), 0) as v
                             from f where data >= v_mes group by 1) t),
      'total', (select json_build_object('atendimentos', count(*), 'faturamento', coalesce(sum(valor), 0),
                                         'clientes', count(distinct coalesce(telefone, 'nome:' || lower(btrim(nome)))) filter (where nome <> 'Marcado por fora'),
                                         'desde', min(data))
                  from f),
      'faltas', (select count(*) from a where faltou),
      'meta', (select c.meta_mensal from public.painel_config c where c.id)
    )
  );
end;
$$;

-- Meta do mês (vazia tira a meta)
create or replace function public.definir_meta(p_valor numeric)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_admin() then
    return false;
  end if;
  if p_valor is not null and (p_valor < 1 or p_valor > 9999999) then
    return false;
  end if;
  insert into public.painel_config (id, meta_mensal) values (true, round(p_valor, 2))
  on conflict (id) do update set meta_mensal = excluded.meta_mensal;
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
revoke all on function public.duracao_de(text) from public, anon, authenticated;
revoke all on function public.beneficios_ok(text[]) from public, anon, authenticated;
revoke all on function public.trava_dia() from public, anon, authenticated;
revoke all on function public.hora_texto(text) from public, anon, authenticated;
revoke all on function public.resumo_do_dia() from public, anon, authenticated;
revoke all on function public.resumo_ligado() from public, anon, authenticated;
revoke all on function public.enviar_resumo_agora() from public, anon, authenticated;
revoke all on function public.salvar_cliente(text, text) from public, anon, authenticated;
revoke all on function public.ajusta_atendimento() from public, anon, authenticated;
revoke all on function public.meus_numeros() from public, anon, authenticated;
revoke all on function public.definir_meta(numeric) from public, anon, authenticated;

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
grant execute on function public.enviar_resumo_agora() to authenticated;
-- a regra dos benefícios roda quando a Amanda salva um serviço
grant execute on function public.beneficios_ok(text[]) to authenticated;
grant execute on function public.salvar_cliente(text, text) to authenticated;
grant execute on function public.meus_numeros() to authenticated;
grant execute on function public.definir_meta(numeric) to authenticated;
