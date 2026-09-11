"""Découpe les objets de COCO (val2017) : des exemples de ce qui N'EST PAS un Pokémon.

Le premier entraînement n'apprenait « rien » que sur Imagenette, dix catégories de
photos (poissons, camions, églises…) : sur le téléphone, tasses, peluches, jouets,
visages étaient encadrés comme des Pokémon. COCO détoure 80 catégories d'objets du
quotidien sur 5 000 photos. Chaque objet est découpé avec sa transparence, comme le
sont les sprites des Pokémon : les réseaux ne peuvent donc plus distinguer un
Pokémon au seul fait qu'il est « collé » sur un fond.

Séparation par PHOTO : 4 000 pour l'apprentissage, 1 000 pour le test, jamais mêlées.
Usage : python ml/coco_objets.py <dossier de données>
"""
import json
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

racine = Path(sys.argv[1] if len(sys.argv) > 1 else 'D:/Code/Jeu-scan')
coco = racine / 'coco'
ann = json.loads((coco / 'annotations' / 'instances_val2017.json').read_text())
categories = {c['id']: c['name'] for c in ann['categories']}
images = {i['id']: i for i in ann['images']}
ids = sorted(images)
random.Random(3).shuffle(ids)
test = set(ids[:1000])

par_image = {}
for a in ann['annotations']:
    # Les foules (iscrowd) sont codées en RLE et désignent des groupes : écartées.
    if a['iscrowd'] or a['area'] < 40 * 40 or not isinstance(a['segmentation'], list):
        continue
    par_image.setdefault(a['image_id'], []).append(a)

sortie = {'train': [], 'test': []}
for part in sortie:
    (coco / 'objets' / part).mkdir(parents=True, exist_ok=True)

for n, (iid, objets) in enumerate(par_image.items()):
    info = images[iid]
    part = 'test' if iid in test else 'train'
    img = Image.open(coco / 'val2017' / info['file_name']).convert('RGB')
    for a in objets:
        masque = Image.new('L', img.size, 0)
        dessin = ImageDraw.Draw(masque)
        for poly in a['segmentation']:
            if len(poly) >= 6:
                dessin.polygon(poly, fill=255)
        x, y, w, h = a['bbox']
        boite = (int(x), int(y), int(x + w + 1), int(y + h + 1))
        objet = img.crop(boite).convert('RGBA')
        objet.putalpha(masque.crop(boite))
        nom = f"{a['id']}.png"
        objet.save(coco / 'objets' / part / nom)
        sortie[part].append({'fichier': f'{part}/{nom}', 'image': info['file_name'], 'bbox': a['bbox'],
                             'categorie': categories[a['category_id']]})
    if n % 500 == 0:
        print(n, 'photos', sum(len(v) for v in sortie.values()), 'objets', flush=True)

(coco / 'objets.json').write_text(json.dumps(sortie))
print({k: len(v) for k, v in sortie.items()}, 'objets découpés')
