-- =====================================================================
-- Atualização 2 da agenda da Amanda: serviços editáveis, remarcar e lembretes.
-- Para quem JÁ rodou o schema.sql antes. Cole tudo no SQL Editor e toque em Run.
-- Pode rodar de novo sem problema. Não apaga nenhum horário.
-- =====================================================================

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
