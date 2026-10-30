// Gera o cartão de visita (folders/cartao-visita.html): PDF para a gráfica, com 3 mm de sangria,
// e imagens da frente e do verso já cortadas, para conferir. Confere se o texto fica na área segura.
// Uso: node tests/render-cartao.mjs [telefone, ex.: 11999998888] [pasta-de-saida]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './banco.mjs';

const tel = (process.argv[2] || '').replace(/\D/g, '');
const saida = process.argv[3] || path.join(RAIZ, 'folders/impressao');
fs.mkdirSync(saida, { recursive: true });
const navegador = await chromium.launch();
const p = await navegador.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 4 });
await p.goto('file://' + path.join(RAIZ, 'folders/cartao-visita.html') + (tel ? '?tel=' + tel : ''));
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));

// todo o conteúdo fica 7 mm para dentro da página (3 mm de sangria + 4 mm de margem)
const r = await p.evaluate(() => {
  const mm = 96 / 25.4, prob = [];
  document.querySelectorAll('.pag').forEach((pg, i) => {
    const c = pg.getBoundingClientRect();
    pg.querySelectorAll('.seguro *').forEach((el) => {
      if (!el.getClientRects().length) return;
      const b = el.getBoundingClientRect();
      if (b.top < c.top + 7 * mm - 0.5 || b.bottom > c.bottom - 7 * mm + 0.5 || b.left < c.left + 7 * mm - 0.5 || b.right > c.right - 7 * mm + 0.5) prob.push((i ? 'verso' : 'frente') + ': ' + (el.className || el.tagName) + ' sai da área segura');
    });
  });
  return { prob: [...new Set(prob)], tel: document.getElementById('tel').textContent };
});

const mm = 96 / 25.4;
const pags = await p.locator('.pag').all();
for (const [i, nome] of ['cartao-frente.png', 'cartao-verso.png'].entries()) {
  const b = await pags[i].boundingBox();
  await p.screenshot({ path: path.join(saida, nome), clip: { x: b.x + 3 * mm, y: b.y + 3 * mm, width: 90 * mm, height: 50 * mm } });
}
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: path.join(saida, 'cartao-visita.pdf'), preferCSSPageSize: true, printBackground: true });
await navegador.close();

const ok = !r.prob.length && pags.length === 2;
console.log((ok ? 'OK    ' : 'FALHA ') + `frente e verso, telefone ${r.tel}` + (r.prob.length ? '\n  ' + r.prob.join('\n  ') : ''));
process.exit(ok ? 0 : 1);
