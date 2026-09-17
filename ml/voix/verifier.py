"""Voix du Pokédex : fait retranscrire chaque WAV brut par Whisper et le compare au texte.

Un clip dont la retranscription s'écarte trop du texte (syllabes inventées, phrase
tronquée, bafouillage) est listé dans a-refaire.txt ; `generer.py <ids>` le régénère
(XTTS n'est pas déterministe, un nouveau tirage suffit presque toujours).
Le nom du Pokémon est retiré de la comparaison : Whisper ne le connaît pas.
"""
import difflib, json, re, sys, unicodedata
from pathlib import Path

import whisper
from generer import texte, DEX

RACINE = Path(__file__).parent
SEUIL = 0.8

def plat(t):
    t = unicodedata.normalize('NFD', t.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z]+', '', t)

if __name__ == '__main__':
    ids = [int(a) for a in sys.argv[1:]] or sorted(int(f.stem) for f in (RACINE / 'brut').glob('*.wav') if f.stem.isdigit())
    m = whisper.load_model('medium', device='cuda')
    scores = {}
    for i in ids:
        attendu = texte(i).split(',', 1)[1]            # sans le nom
        r = m.transcribe(str(RACINE / 'brut' / f'{i}.wav'), language='fr')['text']
        entendu = r.split(',', 1)[1] if ',' in r else r
        s = difflib.SequenceMatcher(None, plat(attendu), plat(entendu)).ratio()
        scores[i] = (round(s, 3), r.strip())
        if s < SEUIL: print(i, round(s, 2), '|', r.strip(), flush=True)
    mauvais = sorted(i for i, (s, _) in scores.items() if s < SEUIL)
    (RACINE / 'a-refaire.txt').write_text(' '.join(map(str, mauvais)))
    json.dump(scores, open(RACINE / 'scores.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('à refaire :', len(mauvais), mauvais)
