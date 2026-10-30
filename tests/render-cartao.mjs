// Gera o cartão de visita (folders/cartao-visita.html): PDF para a gráfica, com 3 mm de sangria,
// e imagens da frente e do verso já cortadas, para conferir. Confere se o texto fica na área segura.
// Também gera a versão 9 x 5 cm sem sangria, para gráficas que pedem a imagem no tamanho final:
// cartao-9x5-frente.jpg e cartao-9x5-verso.jpg, a 300 dpi.
// Uso: node tests/render-cartao.mjs [telefone, ex.: 11999998888] [pasta-de-saida]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from './banco.mjs';

const tel = (process.argv[2] || '').replace(/\D/g, '');
const saida = process.argv[3] || path.join(RAIZ, 'folders/impressao');
const DPI = 300;
fs.mkdirSync(saida, { recursive: true });
const navegador = await chromium.launch();
const abrir = async (escala) => {
  const p = await navegador.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: escala });
  await p.goto('file://' + path.join(RAIZ, 'folders/cartao-visita.html') + (tel ? '?tel=' + tel : ''));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  return p;
};
// todo o conteúdo fica 7 mm para dentro da página (3 mm de sangria + 4 mm de margem até o corte)
const conferir = (p, margem) => p.evaluate((margem) => {
  const mm = 96 / 25.4, prob = [];
  document.querySelectorAll('.pag').forEach((pg, i) => {
    const c = pg.getBoundingClientRect();
    pg.querySelectorAll('.seguro *').forEach((el) => {
      if (!el.getClientRects().length) return;
      const b = el.getBoundingClientRect();
      if (b.top < c.top + margem * mm - 0.5 || b.bottom > c.bottom - margem * mm + 0.5 || b.left < c.left + margem * mm - 0.5 || b.right > c.right - margem * mm + 0.5) prob.push((i ? 'verso' : 'frente') + ': ' + (el.className || el.tagName) + ' sai da área segura');
    });
  });
  return { prob: [...new Set(prob)], tel: document.getElementById('tel').textContent, pags: document.querySelectorAll('.pag').length };
}, margem);
// grava 300 dpi no cabeçalho JFIF, para a imagem abrir já com 9 x 5 cm
function comDpi(jpg) {
  const b = Buffer.from(jpg);
  if (b[2] === 0xFF && b[3] === 0xE0 && b.toString('latin1', 6, 11) === 'JFIF\0') { b[13] = 1; b.writeUInt16BE(DPI, 14); b.writeUInt16BE(DPI, 16); return b; }
  const app0 = Buffer.from([0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, DPI >> 8, DPI & 255, DPI >> 8, DPI & 255, 0x00, 0x00]);
  return Buffer.concat([b.subarray(0, 2), app0, b.subarray(2)]);
}
// largura e altura em pixels, lidas do próprio JPG
function tamanhoJpg(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1], n = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + n;
  }
  return null;
}

// com sangria: PDF de 96 x 56 mm e imagens cortadas para conferir
const p = await abrir(4);
const r = await conferir(p, 7);
const mm = 96 / 25.4;
const pags = await p.locator('.pag').all();
for (const [i, nome] of ['cartao-frente.png', 'cartao-verso.png'].entries()) {
  const b = await pags[i].boundingBox();
  await p.screenshot({ path: path.join(saida, nome), clip: { x: b.x + 3 * mm, y: b.y + 3 * mm, width: 90 * mm, height: 50 * mm } });
}
await p.emulateMedia({ media: 'print' });
await p.pdf({ path: path.join(saida, 'cartao-visita.pdf'), preferCSSPageSize: true, printBackground: true });

// sem sangria, 9 x 5 cm exatos. As imagens saem da página com sangria, recortadas no corte:
// 340 x 189 px de tela viram 1063 x 591 px (9 x 5 cm a 300 dpi), e o que sobrar do arredondamento é a própria sangria.
const pj = await abrir(1063 / 340);
const tamanhos = [];
for (const [i, el] of (await pj.locator('.pag').all()).entries()) {
  const b = await el.boundingBox();
  const jpg = comDpi(await pj.screenshot({ type: 'jpeg', quality: 95, clip: { x: Math.round(b.x + 3 * mm), y: Math.round(b.y + 3 * mm), width: 340, height: 189 } }));
  fs.writeFileSync(path.join(saida, ['cartao-9x5-frente.jpg', 'cartao-9x5-verso.jpg'][i]), jpg);
  tamanhos.push(tamanhoJpg(jpg));
}
await navegador.close();

const certo = (t) => t && Math.abs(t[0] - 1063) <= 1 && Math.abs(t[1] - 591) <= 1;
const prob = r.prob;
const ok = !prob.length && r.pags === 2 && tamanhos.every(certo);
console.log((ok ? 'OK    ' : 'FALHA ') + `frente e verso, telefone ${r.tel}; 9 x 5 cm: ${tamanhos.map((t) => t ? t.join(' x ') : '?').join(' e ')} px a ${DPI} dpi` + (prob.length ? '\n  ' + prob.join('\n  ') : ''));
process.exit(ok ? 0 : 1);
