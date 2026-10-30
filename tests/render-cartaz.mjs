// Gera a propaganda do salão (folders/cartaz.html) em PDF para imprimir e PNG para conferir,
// e confere se nada saiu da página ou do cartão.
// Uso: node tests/render-cartaz.mjs [pasta-de-saida]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './banco.mjs';

const saida = process.argv[2] || path.join(RAIZ, 'folders/impressao');
fs.mkdirSync(saida, { recursive: true });
const navegador = await chromium.launch();
const p = await navegador.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
await p.goto('file://' + path.join(RAIZ, 'folders/cartaz.html'));
await p.evaluate(() => document.fonts.ready);
await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));

// nada pode passar da moldura nem ficar por cima de outro bloco
const r = await p.evaluate(() => {
  const mm = 96 / 25.4, prob = [];
  const dentro = (caixa, el, folga, nome) => {
    const c = caixa.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (b.top < c.top + folga - 0.5 || b.bottom > c.bottom - folga + 0.5 || b.left < c.left + folga - 0.5 || b.right > c.right - folga + 0.5) prob.push(nome + ': ' + (el.className || el.tagName) + ' sai da moldura');
  };
  const empilhados = (pai, nome) => {
    const l = [...pai.children].filter((e) => e.offsetParent && !e.classList.contains('esp'));
    for (let i = 1; i < l.length; i++) if (l[i].getBoundingClientRect().top < l[i - 1].getBoundingClientRect().bottom - 0.5) prob.push(nome + ': ' + (l[i - 1].className || l[i - 1].tagName) + ' / ' + (l[i].className || l[i].tagName) + ' sobrepostos');
  };
  const cz = document.querySelector('.cz');
  for (const e of cz.children) if (!e.classList.contains('foto')) dentro(document.querySelector('.cartaz'), e, 7 * mm, 'cartaz');
  dentro(document.querySelector('.cartaz'), document.querySelector('.selo'), 7 * mm, 'cartaz');
  empilhados(cz, 'cartaz');
  document.querySelectorAll('.cartao').forEach((c, i) => { for (const e of c.children) if (!e.classList.contains('esp')) dentro(c, e, 4 * mm, 'cartão ' + (i + 1)); empilhados(c, 'cartão ' + (i + 1)); });
  const ultimo = cz.lastElementChild.getBoundingClientRect().bottom, fim = document.querySelector('.cartaz').getBoundingClientRect().bottom;
  return { prob, folga: Math.round((fim - ultimo) / mm * 10) / 10, cartoes: document.querySelectorAll('.cartao').length };
});

const nomes = ['cartaz-a4.png', 'cartoes-espelho.png', 'cartoes-sandra.png'];
const folhas = await p.locator('.folha').all();
for (let i = 0; i < folhas.length; i++) await folhas[i].screenshot({ path: path.join(saida, nomes[i]) });
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: path.join(saida, 'propaganda-salao.pdf'), preferCSSPageSize: true, printBackground: true });
await navegador.close();

const ok = !r.prob.length && r.cartoes === 8 && folhas.length === 3;
console.log((ok ? 'OK    ' : 'FALHA ') + `3 folhas, ${r.cartoes} cartões, folga embaixo do cartaz: ${r.folga} mm` + (r.prob.length ? '\n  ' + r.prob.join('\n  ') : ''));
process.exit(ok ? 0 : 1);
