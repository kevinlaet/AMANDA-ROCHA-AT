# Gera todos os arquivos do kit e as pranchas de apresentação
import os, shutil, html
from montar import vertical, horizontal, so_simbolo, CORES, SIMB
RAIZ = 'kit'; shutil.rmtree(RAIZ, ignore_errors=True)
PASTAS = {'A': 'A-fina', 'B': 'B-linha-continua', 'C': 'C-fiel-ao-original-RECOMENDADA'}
NOMES = {'cor': 'colorido', 'preto': 'preto', 'branco': 'branco-fundo-transparente', 'dourado': 'dourado', 'escuro': 'fundo-escuro'}
def gravar(k, tipo, modo, svg):
    pasta = f'{RAIZ}/{PASTAS[k]}'; os.makedirs(pasta, exist_ok=True)
    open(f'{pasta}/{tipo}-{NOMES[modo]}.svg', 'w').write(svg)
for k in 'ABC':
    modos = ['cor', 'preto', 'branco', 'dourado', 'escuro'] if k == 'C' else ['cor', 'preto', 'branco', 'escuro']
    for modo in modos:
        gravar(k, 'logo-vertical', modo, vertical(k, modo)[0])
        gravar(k, 'logo-horizontal', modo, horizontal(k, modo)[0])
        gravar(k, 'simbolo', modo, so_simbolo(k, modo)[0])
print('arquivos svg:', sum(len(f) for _, _, f in os.walk(RAIZ)))

# ---------- pranchas ----------
FONTES = 'file:///home/user/amanda-rocha-at/fonts/'
CSS = f"""@font-face{{font-family:Montserrat;src:url({FONTES}montserrat.woff2) format('woff2');font-weight:100 900}}
@font-face{{font-family:Cormorant;src:url({FONTES}cormorant.woff2) format('woff2');font-weight:300 700}}
*{{box-sizing:border-box;margin:0}} body{{background:#F4EFE8;font-family:Montserrat,sans-serif;color:#2B2622;padding:56px 60px 64px}}
h1{{font-family:Cormorant,serif;font-weight:600;font-size:46px;letter-spacing:.02em}} .sub{{color:#6B6258;font-size:17px;margin-top:6px}}
.grade{{display:grid;gap:22px;margin-top:34px}} .card{{background:#fff;border-radius:18px;padding:26px 22px 22px;box-shadow:0 2px 14px rgba(60,40,10,.08);display:flex;flex-direction:column}}
.card.esc{{background:#1F1A17}} .tag{{font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#9C7A45;margin-bottom:14px}} .esc .tag{{color:#C9A468}}
.card svg,.card img.logo{{width:100%;height:auto;display:block}} .nota{{font-size:15px;line-height:1.45;color:#5F564C;margin-top:14px}}
.peq{{display:flex;align-items:flex-end;gap:22px;margin-top:18px;padding-top:16px;border-top:1px solid #EEE6DA}} .peq svg{{width:auto!important}}
.rec{{outline:3px solid #B08D57}} .selo{{display:inline-block;background:#B08D57;color:#fff;font-size:12px;font-weight:700;letter-spacing:.1em;padding:4px 10px;border-radius:99px;margin-left:8px;text-transform:uppercase;vertical-align:middle}}"""
def inline(svg, largura=None, altura=None):
    import re
    estilo = f'height:{altura}px;width:auto' if altura else 'width:100%;height:auto'
    return re.sub(r'width="\d+" height="\d+"', f'style="{estilo};display:block"', svg, count=1)
def peq(k):
    return ''.join(f'<div>{inline(so_simbolo(k, "cor", 8, 700)[0], altura=h)}</div>' for h in (96, 56, 32))
def prancha_comparacao():
    cards = [('Original', f'<img class="logo" src="file:///tmp/claude-0/-home-user/9bde1e0e-53b4-52cb-a4a9-911e58ccd05e/scratchpad/logo-salao/original-recorte.png">', 'Como está hoje: efeito 3D, degradê e traço pesado.', '', '')]
    desc = {'A': ('A · Fina', 'Só linhas finas, bem delicado. Muito elegante em tamanho grande, mas some em tamanho pequeno.'),
            'B': ('B · Linha contínua', 'Uma só espessura de linha, aérea e leve. Fica bem em papel e fachada; no pequeno perde força.'),
            'C': ('C · Fiel ao original', 'Mantém o cabelo cheio que elas gostaram, mais leve e limpo. Funciona em qualquer tamanho.')}
    for k in 'ABC':
        cards.append((desc[k][0], inline(vertical(k)[0]), desc[k][1], peq(k), ' rec' if k == 'C' else ''))
    h = ''
    for i, (t, corpo, nota, p, cls) in enumerate(cards):
        selo = '<span class="selo">recomendada</span>' if cls else ''
        h += f'<div class="card{cls}"><div class="tag">{t}{selo}</div>{corpo}<div class="nota">{nota}</div>{"<div class=peq>" + p + "</div>" if p else ""}</div>'
    return f'<style>{CSS} .grade{{grid-template-columns:repeat(4,1fr)}}</style><h1>Studio La Rocha · opções de logo</h1><p class="sub">Todas em vetor: servem para cartão, fachada, adesivo e Instagram. O nome e a frase foram refeitos com letras novas, e "bem-estar" agora leva o hífen.</p><div class="grade">{h}</div>'
def prancha_recomendada(k='C'):
    v = lambda modo: inline(vertical(k, modo)[0]); hz = lambda modo: inline(horizontal(k, modo)[0])
    sb = lambda modo, a: inline(so_simbolo(k, modo, 20, 700)[0], altura=a)
    corpo = f"""<div class="grade" style="grid-template-columns:1fr 1fr">
      <div class="card"><div class="tag">Vertical · colorido</div>{v('cor')}</div>
      <div class="card esc"><div class="tag">Vertical · fundo escuro</div>{v('escuro')}</div>
      <div class="card"><div class="tag">Horizontal · colorido</div>{hz('cor')}</div>
      <div class="card esc"><div class="tag">Horizontal · fundo escuro</div>{hz('escuro')}</div>
      <div class="card"><div class="tag">Uma cor · preto (carimbo, nota, adesivo)</div>{hz('preto')}</div>
      <div class="card" style="background:#B08D57"><div class="tag" style="color:#fff">Uma cor · branco sobre dourado</div>{hz('branco')}</div>
      <div class="card"><div class="tag">Símbolo sozinho (foto de perfil, selo)</div><div style="display:flex;gap:34px;align-items:flex-end;justify-content:center">{sb('cor', 220)}{sb('cor', 120)}{sb('cor', 64)}{sb('cor', 36)}</div></div>
      <div class="card esc"><div class="tag">Símbolo sozinho · fundo escuro</div><div style="display:flex;gap:34px;align-items:flex-end;justify-content:center">{sb('escuro', 220)}{sb('escuro', 120)}{sb('escuro', 64)}{sb('escuro', 36)}</div></div>
    </div>"""
    return f'<style>{CSS}</style><h1>Studio La Rocha · versão recomendada (C)</h1><p class="sub">O kit completo: vertical, horizontal, símbolo, e as versões de uma cor para carimbo e adesivo.</p>{corpo}'
for nome, h in (('prancha-comparacao', prancha_comparacao()), ('prancha-recomendada', prancha_recomendada())):
    open(f'{nome}.html', 'w').write(f'<!doctype html><meta charset="utf-8"><body>{h}</body>')
print('pranchas ok')
