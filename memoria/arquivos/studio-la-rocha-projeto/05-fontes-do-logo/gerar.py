# Pede ao gerador de imagens versões refinadas do símbolo do Studio La Rocha (só o desenho, sem texto)
import json, subprocess, sys, base64, time
from concurrent.futures import ThreadPoolExecutor

REGRAS = ("Pure white background (#FFFFFF). Use ONE flat metallic-gold color only (#B08D57): no gradients, no shading, no shadows, "
          "no bevel, no emboss, no glow, no texture, no 3D effect. Crisp, clean, vector-quality edges with smooth curves. "
          "NO text, NO letters, NO watermark. The emblem is centered with generous white margin on all sides.")
CENA = ("two women in profile facing right (one slightly in front of the other) with long flowing stylized hair, inside a tall frame "
        "whose top is a semicircular arch with small square shoulders")
OPCOES = {
  'A': ("Redraw this beauty-salon emblem as a refined, professional logo symbol. Keep the same concept and composition: " + CENA + ". "
        "Make everything clearly THINNER and more elegant than the reference: delicate thin lines of a consistent weight for the faces, eyes, lips, "
        "necks and for the arched frame; slim sleek hair strands separated by fine white gaps; small refined lips and eyes drawn as thin gold lines. "
        "Clean symmetrical arch frame with perfectly straight sides. " + REGRAS, 'high'),
  'B': ("Reimagine this beauty-salon emblem as a minimalist luxury monoline logo symbol: " + CENA + ". "
        "Draw everything with ONE consistent thin line weight, like fine gold foil stamping: continuous elegant contour lines for faces, hair strands, "
        "necks and the frame, with almost no filled areas. Very airy, elegant and premium. " + REGRAS, 'low'),
  'C': ("Reimagine this beauty-salon emblem as an elegant art-deco style logo symbol: " + CENA + ". "
        "Combine thin gold outlines for the faces, eyes, lips and the frame with sleek solid gold hair shapes separated by fine white gaps, so the hair "
        "keeps some weight while the whole symbol feels light, fine and sophisticated. " + REGRAS, 'low'),
}
def pedir(chave):
    prompt, fid = OPCOES[chave]
    t = time.time()
    cmd = ['curl', '-sS', '--max-time', '280', 'https://api.openai.com/v1/images/edits',
           '-F', 'model=gpt-image-2', '-F', 'image[]=@ref-simbolo.png', '-F', 'prompt=' + prompt,
           '-F', 'size=1024x1024', '-F', 'quality=medium', '-F', 'n=1',
           '-o', f'resp-{chave}.json', '-w', '%{http_code}']
    codigo = subprocess.run(cmd, capture_output=True, text=True).stdout.strip()
    try:
        d = json.load(open(f'resp-{chave}.json'))
        if 'data' in d:
            open(f'opcao-{chave}.png', 'wb').write(base64.b64decode(d['data'][0]['b64_json']))
            return f'{chave}: ok ({time.time() - t:.0f}s, HTTP {codigo}) uso={d.get("usage", {}).get("total_tokens")}'
        return f'{chave}: ERRO HTTP {codigo}: {json.dumps(d.get("error", d))[:400]}'
    except Exception as e:
        return f'{chave}: falhou ({e}) HTTP {codigo}'
with ThreadPoolExecutor(3) as ex:
    for r in ex.map(pedir, sys.argv[1:] or list(OPCOES)): print(r, flush=True)
