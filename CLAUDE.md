# AMANDA-ROCHA-AT — onde está o contexto

Este repositório é o site, o painel e o banco (Supabase) da Amanda Rocha, e o painel também serve o Studio La Rocha.
O contexto completo do projeto (pessoas, regras, padrão visual, endereços, agenda, pendências) está em
`kevinlaet/studiolarocha` → `CLAUDE.md`. Leia lá antes de mexer.

Regras rápidas: nunca inventar dados; nunca guardar senhas nem a Secret key/service_role; só a chave pública no código;
linguagem simples; testes com `npm test`; banco idempotente (`schema.sql` e `atualizacao.sql` juntos).

Desenvolvido por Kevin Laet
