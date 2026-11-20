// Exporta as 5 telas em 1080x1350 (pasta ../1080) e em alta (2160x2700, pasta ../alta) e confere se nada saiu do lugar.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); let erros = 0;
  for (const [esc, pasta] of [[1, '1080'], [2, 'alta']]) {
    const page = await b.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: esc });
    const falhas = []; page.on('requestfailed', r => falhas.push(r.url())); page.on('pageerror', e => falhas.push(String(e)));
    await page.goto('file://' + path.join(__dirname, 'carrossel.html'));
    await page.evaluate(() => document.fonts.ready);
    const fontes = await page.evaluate(() => ['Cormorant', 'Great Vibes', 'Montserrat'].map(f => document.fonts.check('40px "' + f + '"')));
    const fora = await page.evaluate(() => [...document.querySelectorAll('section.t')].flatMap(s => {
      const r = s.getBoundingClientRect();
      return [...s.querySelectorAll('*')].filter(el => !el.classList.contains('foto') && getComputedStyle(el).position !== 'absolute' || el.classList.contains('rodape')).map(el => [el, el.getBoundingClientRect()])
        .filter(([el, q]) => q.width && (q.left < r.left - 1 || q.right > r.right + 1 || q.bottom > r.bottom - 40))
        .map(([el]) => s.id + ':' + (el.className || el.tagName) + ':' + (el.textContent || '').slice(0, 30));
    }));
    const sobre = await page.evaluate(() => [...document.querySelectorAll('section.t')].map(s => {
      const rod = s.querySelector('.rodape'); if (!rod) return null;
      const r = rod.getBoundingClientRect(); let pior = 0;
      s.querySelectorAll('.escassez,.lista,.leve,.frase,.balao,.itens').forEach(el => { pior = Math.max(pior, el.getBoundingClientRect().bottom); });
      return pior > r.top - 20 ? s.id + ' encosta no rodapé' : null;
    }).filter(Boolean));
    if (falhas.length || fontes.includes(false) || fora.length || sobre.length) { erros++; console.log('PROBLEMA', pasta, { falhas, fontes, fora, sobre }); }
    const out = path.join(__dirname, '..', pasta); fs.mkdirSync(out, { recursive: true });
    for (let i = 1; i <= 5; i++) await page.locator('#t' + i).screenshot({ path: path.join(out, `tela-${i}.png`) });
    await page.close();
  }
  await b.close(); console.log(erros ? 'COM PROBLEMAS' : 'Tudo certo: 5 telas, fontes carregadas, nada fora do lugar.'); process.exit(erros ? 1 : 0);
})();
