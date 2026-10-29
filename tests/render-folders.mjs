// Gera os PNGs dos folders (folders/png) a partir de folders/folder.html e confere se nada vazou da página.
// Uso: node tests/render-folders.mjs [pasta-de-saida]
import { chromium } from 'playwright';
import path from 'node:path';
import { RAIZ } from './banco.mjs';

const saida = process.argv[2] || path.join(RAIZ, 'folders/png');
const navegador = await chromium.launch();
let problemas = 0;
for (const v of ['novidade', 'agenda', 'aluguel']) {
  for (const f of ['story', 'feed']) {
    const alto = f === 'feed' ? 1350 : 1920;
    const p = await navegador.newPage({ viewport: { width: 1080, height: alto }, deviceScaleFactor: 1 });
    await p.goto('file://' + path.join(RAIZ, 'folders/folder.html') + `?v=${v}${f === 'feed' ? '&f=feed' : ''}`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    // nada pode passar da moldura (26px da borda) nem ficar por cima de outro bloco
    const r = await p.evaluate((alto) => {
      const pg = document.querySelector('main:not([hidden])');
      const els = [...pg.querySelectorAll(':scope > *, .colunas > *, .col > *')].filter((e) => e.offsetParent && !e.classList.contains('esp'));
      const fora = els.filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > alto - 30 || b.top < 30; }).map((e) => e.className || e.tagName);
      const blocos = [...pg.children].filter((e) => e.offsetParent && !e.classList.contains('esp')).map((e) => ({ n: e.className || e.tagName, b: e.getBoundingClientRect() }));
      const sobre = [];
      for (let i = 1; i < blocos.length; i++) if (blocos[i].b.top < blocos[i - 1].b.bottom - 1) sobre.push(blocos[i - 1].n + ' / ' + blocos[i].n);
      const ultimo = blocos[blocos.length - 1].b.bottom;
      return { fora, sobre, folga: Math.round(alto - ultimo) };
    }, alto);
    const nome = `${v}-${f}.png`;
    await p.screenshot({ path: path.join(saida, nome) });
    const ok = !r.fora.length && !r.sobre.length && r.folga >= 40;
    if (!ok) problemas++;
    console.log((ok ? 'OK    ' : 'FALHA ') + nome + `  folga embaixo: ${r.folga}px` + (r.fora.length ? '  fora: ' + r.fora.join(', ') : '') + (r.sobre.length ? '  sobrepostos: ' + r.sobre.join(', ') : ''));
    await p.close();
  }
}
await navegador.close();
process.exit(problemas ? 1 : 0);
