import difflib, json
from verifier import plat
from generer import DEX, texte as attendu_de
scores = json.load(open('scores.json', encoding='utf-8'))
lignes = []
for i, (s, entendu) in scores.items():
    f = DEX[i].get('flavor')
    if not f: continue
    a, b = plat(f), plat(entendu)                  # description attendue / tout ce qui est entendu
    couvert = sum(bl.size for bl in difflib.SequenceMatcher(None, a, b).get_matching_blocks()) / len(a)
    tout = plat(attendu_de(int(i)))                # nom + catégorie + types + description
    repris = sum(bl.size for bl in difflib.SequenceMatcher(None, tout, b).get_matching_blocks())
    rajout = max(0, len(b) - repris) / len(tout)   # ce qui est entendu EN PLUS du texte
    lignes.append((round(couvert, 3), round(rajout, 3), int(i), entendu))
lignes.sort()
for seuil in [0.1, 0.15, 0.2, 0.3]:
    print('rajout >', seuil, ':', sum(1 for c, r, *_ in lignes if r > seuil))
mauvais = [l for l in lignes if l[0] < 0.9 or l[1] > 0.15]
for c, r, i, t in mauvais: print(c, r, i, '|', t[:150], flush=True)
open('a-refaire.txt', 'w').write(' '.join(str(l[2]) for l in mauvais))
print(len(mauvais), 'à refaire')
