-- =====================================================================
-- Agenda da Amanda Rocha
--
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo > Run
--
-- ANTES de rodar, troque SEU_EMAIL_AQUI (uma vez só, logo abaixo)
-- pelo e-mail que a Amanda vai usar para entrar no painel.
--
-- Todas as regras de horário ficam aqui no banco, e não no site, para que
-- nenhum celular com relógio errado ou tela desatualizada cause erro.
-- Fuso usado em tudo: America/Sao_Paulo.
-- Pode rodar de novo sem perder dados.
-- =====================================================================

do $$
begin
  if position('@' in 'SEU_EMAIL_AQUI') = 0 then
    raise exception 'Troque SEU_EMAIL_AQUI pelo e-mail da Amanda antes de rodar.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Quem administra a agenda
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

insert into public.admins (email) values (lower('SEU_EMAIL_AQUI'))
on conflict do nothing;

create or replace function public.sou_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;

-- ---------------------------------------------------------------------
-- Relógio e antecedência mínima (um lugar só para mudar)
-- ---------------------------------------------------------------------
create or replace function public.agora_sp()
returns timestamp
language sql
stable
set search_path = ''
as $$ select now() at time zone 'America/Sao_Paulo' $$;

-- Horários que começam em menos que isso somem do site.
create or replace function public.antecedencia()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '1 hour' $$;

-- ---------------------------------------------------------------------
-- Horários
-- ---------------------------------------------------------------------
create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora text not null check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status text not null default 'livre' check (status in ('livre', 'pedido', 'confirmado')),
  servico text check (length(servico) <= 40),
  nome text check (length(nome) <= 60),
  telefone text check (telefone ~ '^[0-9]{10,11}$'),
  pedido_em timestamptz,
  unique (data, hora),
  -- horário livre nunca guarda dados de cliente; pedido e confirmado sempre têm nome
  constraint dados_coerentes check (
    (status = 'livre' and nome is null and servico is null and telefone is null and pedido_em is null)
    or (status <> 'livre' and nome is not null)
  )
);

alter table public.horarios enable row level security;
revoke all on public.horarios from anon;
grant select, insert, update, delete on public.horarios to authenticated;

drop policy if exists "amanda_total" on public.horarios;
drop policy if exists "admin_total" on public.horarios;
create policy "admin_total" on public.horarios
  for all to authenticated
  using (public.sou_admin())
  with check (public.sou_admin());

-- ---------------------------------------------------------------------
-- Histórico: toda mudança fica registrada (quem, quando, de onde para onde)
-- ---------------------------------------------------------------------
create table if not exists public.historico (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  horario_id uuid,
  data date,
  hora text,
  de text,
  para text,
  nome text,
  quem text
);
alter table public.historico enable row level security;
revoke all on public.historico from anon, authenticated;
grant select on public.historico to authenticated;

drop policy if exists "admin_le" on public.historico;
create policy "admin_le" on public.historico
  for select to authenticated
  using (public.sou_admin());

create or replace function public.registra_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem text := coalesce(auth.jwt() ->> 'email', 'site');
begin
  if tg_op = 'INSERT' then
    insert into public.historico (horario_id, data, hora, de, para, nome, quem)
    values (new.id, new.data, new.hora, null, new.status, new.nome, quem);
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status or old.nome is distinct from new.nome then
      insert into public.historico (horario_id, data, hora, de, para, nome, quem)
      values (new.id, new.data, new.hora, old.status, new.status, coalesce(new.nome, old.nome), quem);
    end if;
  elsif tg_op = 'DELETE' then
    insert into public.historico (horario_id, data, hora, de, para, nome, quem)
    values (old.id, old.data, old.hora, old.status, 'removido', old.nome, quem);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_historico on public.horarios;
create trigger trg_historico
  after insert or update or delete on public.horarios
  for each row execute function public.registra_historico();

-- ---------------------------------------------------------------------
-- O que o site público pode ver: só dia, hora e se está livre.
-- Nunca nomes ou telefones.
-- ---------------------------------------------------------------------
drop view if exists public.horarios_publicos;

create or replace function public.agenda_publica()
returns table (id uuid, data date, hora text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.data, h.hora,
         case when h.status = 'livre' then 'livre' else 'ocupado' end
    from public.horarios h
   where (h.data + h.hora::time) > public.agora_sp() + public.antecedencia()
   order by h.data, h.hora
$$;

-- ---------------------------------------------------------------------
-- A cliente pede um horário. A checagem e a reserva acontecem numa única
-- instrução, então duas clientes nunca pegam o mesmo horário.
-- Resposta: 'ok' | 'indisponivel' | 'dados' | 'limite'
-- ---------------------------------------------------------------------
drop function if exists public.pedir_horario(uuid, text, text);

create or replace function public.pedir_horario(p_id uuid, p_servico text, p_nome text, p_telefone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  tel text;
  ativos integer;
  n integer;
begin
  tel := regexp_replace(coalesce(p_telefone, ''), '[^0-9]', '', 'g');
  if tel like '55%' and length(tel) in (12, 13) then
    tel := substr(tel, 3);
  end if;

  if length(trim(coalesce(p_nome, ''))) < 2
     or length(trim(coalesce(p_servico, ''))) < 2
     or length(tel) not in (10, 11) then
    return 'dados';
  end if;

  -- no máximo 2 horários ativos por telefone (evita alguém ocupar a agenda toda)
  select count(*) into ativos
    from public.horarios h
   where h.telefone = tel
     and h.status in ('pedido', 'confirmado')
     and (h.data + h.hora::time) > public.agora_sp();
  if ativos >= 2 then
    return 'limite';
  end if;

  update public.horarios h
     set status = 'pedido',
         servico = left(trim(p_servico), 40),
         nome = left(trim(p_nome), 60),
         telefone = tel,
         pedido_em = now()
   where h.id = p_id
     and h.status = 'livre'
     and (h.data + h.hora::time) > public.agora_sp() + public.antecedencia();

  get diagnostics n = row_count;
  if n = 1 then
    return 'ok';
  end if;
  return 'indisponivel';
end;
$$;

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
-- Remarcar: leva a cliente de um horário para outro livre, numa operação só.
-- Resposta: 'ok' | 'indisponivel' (destino ocupado ou passado) | 'origem' (nada para mover)
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
    raise exception 'sem_acesso';
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

  update public.horarios h
     set status = o.status, servico = o.servico, nome = o.nome, telefone = o.telefone,
         pedido_em = coalesce(o.pedido_em, now()), lembrete_em = null
   where h.id = p_para;
  update public.horarios h
     set status = 'livre', servico = null, nome = null, telefone = null, pedido_em = null, lembrete_em = null
   where h.id = p_de;
  return 'ok';
end;
$$;

revoke all on function public.servicos_publicos() from public, anon, authenticated;
revoke all on function public.remarcar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.servicos_publicos() to anon, authenticated;
grant execute on function public.remarcar(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
-- (o Supabase dá acesso automático a funções novas; aqui tudo é fechado e
-- depois liberado só para quem precisa)
revoke all on function public.agenda_publica() from public, anon, authenticated;
revoke all on function public.pedir_horario(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.sou_admin() from public, anon, authenticated;
revoke all on function public.agora_sp() from public, anon, authenticated;
revoke all on function public.registra_historico() from public, anon, authenticated;
revoke all on function public.bloqueia_horario_passado() from public, anon, authenticated;

grant execute on function public.agenda_publica() to anon, authenticated;
grant execute on function public.pedir_horario(uuid, text, text, text) to anon, authenticated;
grant execute on function public.agora_sp() to anon, authenticated;
grant execute on function public.sou_admin() to authenticated;
