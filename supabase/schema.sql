-- Agenda da Amanda Rocha
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- ANTES de rodar, troque SEU_EMAIL_AQUI pelo e-mail da Amanda (o mesmo que ela vai usar para entrar no painel).

create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora text not null check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  status text not null default 'livre' check (status in ('livre', 'pedido', 'confirmado')),
  servico text,
  nome text,
  pedido_em timestamptz,
  unique (data, hora)
);

alter table public.horarios enable row level security;

-- Só a Amanda (pelo e-mail) lê e altera tudo, inclusive nomes das clientes.
drop policy if exists "amanda_total" on public.horarios;
create policy "amanda_total" on public.horarios
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'SEU_EMAIL_AQUI')
  with check (auth.jwt() ->> 'email' = 'SEU_EMAIL_AQUI');

-- O site público enxerga só dia, hora e se está livre. Nunca nomes.
create or replace view public.horarios_publicos as
  select id, data, hora, status
  from public.horarios
  where data >= (now() at time zone 'America/Sao_Paulo')::date;

grant select on public.horarios_publicos to anon, authenticated;

-- A cliente pede um horário. Só funciona se ele ainda estiver livre,
-- então duas pessoas nunca pegam o mesmo horário.
create or replace function public.pedir_horario(p_id uuid, p_servico text, p_nome text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if length(trim(coalesce(p_nome, ''))) < 2 then
    return false;
  end if;

  update public.horarios
     set status = 'pedido',
         servico = left(p_servico, 40),
         nome = left(trim(p_nome), 60),
         pedido_em = now()
   where id = p_id
     and status = 'livre'
     and data >= (now() at time zone 'America/Sao_Paulo')::date;

  get diagnostics n = row_count;
  return n = 1;
end;
$$;

grant execute on function public.pedir_horario(uuid, text, text) to anon, authenticated;
