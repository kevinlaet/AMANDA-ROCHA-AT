# Links, contas e arquivos

Sem senhas nem chaves secretas. Cada conta tem um responsável.

## No ar (domínio amandarochabemestar.com.br)
| O quê | Endereço |
|---|---|
| Site e agenda | https://amandarochabemestar.com.br |
| Agendar (curto) | /agendar · limpeza: /limpeza · auriculoterapia: /auriculo |
| Links da bio do Instagram | /links |
| Regras e combinados | /regras |
| Painel da Amanda | /admin (diagnóstico: /admin/diagnostico.html) |
| Questionário | /questionario |
| Imagens para postar | /folders/png/ (`novidade-feed.png`, `agenda-feed.png`, `aluguel-feed.png` e versões `-story`) |
| Impressos | `folders/impressao/` (`cartao-9x5.pdf` para a gráfica, `cartao-visita.pdf`, `propaganda-salao.pdf`, `cartaz-a4.png`) |
| Endereço antigo (redireciona) | https://kevinlaet.github.io/AMANDA-ROCHA-AT/ |

Para medir a origem, acrescente `?o=instagram`, `?o=facebook`, `?o=google` ou `?o=whatsapp`. Os QR impressos já levam `cartao`, `cartaz`, `espelho` e `sandra`.

## Código e serviços
- Repositório: https://github.com/kevinlaet/AMANDA-ROCHA-AT (trabalho em `site-v1`; publica a `main`).
- Supabase: https://qumfluviiqjxlqzjcfly.supabase.co (a chave pública está no `config.js`). Região: **a informar pelo Kevin**.
- SQL de atualização: `supabase/atualizacao.sql` (link cru: https://raw.githubusercontent.com/kevinlaet/AMANDA-ROCHA-AT/main/supabase/atualizacao.sql).
- Domínio: Registro.br, titular o Kevin; DNS na zona avançada (4 `A`, `CNAME www`, `TXT` do GitHub). Vence em 29/10/2027.
- Notificações: app ntfy; o código sai em Mais › Segurança do painel.
- Google Analytics 4: **ainda não criado** (`config.js` › `MEDICAO.googleAnalytics` vazio).
- Gráfica dos cartões: Ayres Print (9×5 cm, 100 unidades; frente brilho, verso fosco; arte sem sangria).

## Documentos Claude (links privados; o dono compartilha)
- Tarefas da estreia: https://claude.ai/artifact/YX9AyeeC6aXN1JnpCeLTSW (instantâneo em `tarefas-da-estreia.md`)
- Dossiê do Studio La Rocha: https://claude.ai/artifact/RrPetHbdyjgHPLsiM1mSKu (PDF em `arquivos/studio-la-rocha-projeto/01-dossie/`)
- Guia da Amanda: https://claude.ai/artifact/JobS89hmSiFaQskcPwVQtY (cópia em `arquivos/guia-e-divulgacao/guia-da-amanda.html`)
- Apresentação das opções de logo: https://claude.ai/artifact/6vRUf7m99TA9YB5KXxVRwr (fonte em `arquivos/studio-la-rocha-projeto/04-apresentacao/`)

## Arquivos guardados nesta pasta (`arquivos/`)
- `studio-la-rocha-projeto/`: `00-LEIA-ME.txt` (como começar o chat do salão), `01-dossie` (PDF e texto), `02-logo-escolhido-C` (SVG, PDF e PNG em horizontal, vertical e símbolo; colorido, dourado, preto, branco e fundo escuro), `03-outras-opcoes` (A e B), `04-apresentacao` (página HTML e molde), `05-fontes-do-logo` (scripts de geração e vetorização, `original.jpg` = prova de origem do desenho).
- `guia-e-divulgacao/`: `guia-da-amanda.html` (guia de venda, marketing e segurança jurídica) e `divulgacao-kevin.md` (posts de Facebook com `?o=facebook`).
- `prova-cartao/`: prova do cartão que a Amanda aprovou.

## Comandos úteis
```sh
cd tests && npm ci && npx playwright install chromium   # uma vez
npm test                                                # banco + site (tudo deve passar)
CAPTURAS=/pasta npm run test:site                       # salva capturas de tela
node tests/render-folders.mjs                           # PNGs dos folders
node tests/render-cartao.mjs                            # cartão (PDF e JPGs)
node tests/render-cartaz.mjs                            # cartaz e recados da Sandra
git fetch origin && git push origin site-v1 site-v1:main
```

Desenvolvido por Kevin Laet
