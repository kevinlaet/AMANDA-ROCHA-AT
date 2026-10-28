-- Agenda da Amanda Rocha
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- ANTES de rodar, troque SEU_EMAIL_AQUI pelo e-mail da Amanda (aparece 2 vezes).
--
-- Todas as regras de horário ficam aqui no banco, e não no site, para que nenhum
-- celular com relógio errado ou tela desatualizada consiga causar erro.
-- Fuso usado em tudo: America/Sao_Paulo.

create table if not exists public.horarios (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  hora text not null check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  status text not null default 'livre' check (status in ('livre', 'pedido', 'confirmado')),
  servico text,
  nome text,
  telefone text,
  pedido_em timestamptz,
  unique (data, hora),
  -- horário livre nunca guarda dados de cliente; pedido e confirmado sempre têm nome
  constraint dados_coerentes check (
    (status = 'livre' and nome is null and servico is null and telefone is null and pedido_em is null)
    or (status <> 'livre' and nome is not null)
  )
);

-- Agora, em horário de Brasília.
create or replace function public.agora_sp()
returns timestamp
language sql
stable
as $$ select now() at time zone 'America/Sao_Paulo' $$;

-- Horário que já passou nunca é aberto: é descartado em silêncio e os demais
-- da mesma lista entram normalmente (o painel avisa quantos ficaram de fora).
create or replace function public.bloqueia_horario_passado()
returns trigger
language plpgsql
as $$
begin
  if (new.data + new.hora::time) <= public.agora_sp() then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_horario_passado on public.horarios;
create trigger trg_horario_passado
  before insert on public.horarios
  for each row execute function public.bloqueia_horario_passado();

alter table public.horarios enable row level security;

-- A tabela só é acessível por quem está logado como a Amanda.
revoke all on public.horarios from anon;
grant select, insert, update, delete on public.horarios to authenticated;

drop policy if exists "amanda_total" on public.horarios;
create policy "amanda_total" on public.horarios
  for all to authenticated
  using (auth.jwt() ->> 'email' = 'SEU_EMAIL_AQUI')
  with check (auth.jwt() ->> 'email' = 'SEU_EMAIL_AQUI');

-- O site público enxerga só dia, hora e status. Nunca nomes ou telefones.
-- Some quem já passou ou começa em menos de 1 hora (para mudar, troque o '1 hour').
create or replace view public.horarios_publicos as
  select id, data, hora, status
  from public.horarios
  where (data + hora::time) > public.agora_sp() + interval '1 hour';

grant select on public.horarios_publicos to anon, authenticated;

-- A cliente pede um horário. A checagem e a reserva acontecem numa única
-- instrução, então duas clientes nunca pegam o mesmo horário.
-- Resposta: 'ok' | 'indisponivel' | 'dados' | 'limite'
create or replace function public.pedir_horario(p_id uuid, p_servico text, p_nome text, p_telefone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  tel text;
  ativos integer;
  n integer;
begin
  tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if tel like '55%' and length(tel) in (12, 13) then
    tel := substr(tel, 3);
  end if;

  if length(trim(coalesce(p_nome, ''))) < 2 or length(tel) not in (10, 11) then
    return 'dados';
  end if;

  -- no máximo 2 horários ativos por telefone (evita robô reservando a agenda toda)
  select count(*) into ativos
    from public.horarios
   where telefone = tel
     and status in ('pedido', 'confirmado')
     and (data + hora::time) > public.agora_sp();
  if ativos >= 2 then
    return 'limite';
  end if;

  update public.horarios
     set status = 'pedido',
         servico = left(trim(coalesce(p_servico, '')), 40),
         nome = left(trim(p_nome), 60),
         telefone = tel,
         pedido_em = now()
   where id = p_id
     and status = 'livre'
     and (data + hora::time) > public.agora_sp() + interval '1 hour';

  get diagnostics n = row_count;
  if n = 1 then
    return 'ok';
  end if;
  return 'indisponivel';
end;
$$;

revoke all on function public.pedir_horario(uuid, text, text, text) from public;
grant execute on function public.pedir_horario(uuid, text, text, text) to anon, authenticated;
