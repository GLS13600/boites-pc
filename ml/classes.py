"""Liste des classes que le scan sait reconnaître, et leurs images de référence.

Une classe = une ESPÈCE (1 à 1025) ou une FORME visuellement distincte : Méga,
Gigamax, forme régionale, forme de combat, et les autres formes à clé numérique dont
l'apparence change vraiment. Les formes cosmétiques, femelles, Totem et casquettes
d'événement sont écartées : elles ressemblent trop à leur espèce pour être départagées
à la caméra, et chaque confusion avec l'espèce compterait comme une erreur.

Chaque classe porte son GROUPE, le numéro de l'espèce. Une carte du JCC n'indique que
l'espèce (« Goupix d'Alola » est rangée sous 37) : son apprentissage porte donc sur le
groupe entier, et non sur une classe précise.

Usage : python ml/classes.py <dossier de données>  → écrit classes.json et refs.json
"""
import json
import re
import sys
from pathlib import Path

RACINE_APPLI = Path(__file__).resolve().parent.parent
DONNEES = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('D:/Code/Jeu-scan')
SPRITES_API = DONNEES / 'pokeapi-sprites' / 'sprites' / 'pokemon'
SPRITES_APPLI = RACINE_APPLI / 'public' / 'sprites'

NATURES_GARDEES = {'mega', 'gmax', 'region', 'combat', 'autre'}
# Parmi les « autres », celles qui ne se distinguent pas de leur espèce à l'œil.
ECARTEES = re.compile(r'Taille|Dominant|Totémique|Femelle|Casquette', re.I)


def classes():
    forms = json.loads((RACINE_APPLI / 'src/data/forms.json').read_text(encoding='utf8'))
    pokedex = json.loads((RACINE_APPLI / 'src/data/pokedex.json').read_text(encoding='utf8'))
    liste = []
    for num in range(1, 1026):
        e = pokedex.get(str(num)) or {}
        liste.append({'key': num, 'groupe': num, 'nom': e.get('name', str(num)), 'sprite': str(num)})
    for sp, fs in forms.items():
        for f in fs:
            if f['kind'] not in NATURES_GARDEES or not isinstance(f['key'], int):
                continue
            if ECARTEES.search(f.get('name') or ''):
                continue
            liste.append({'key': f['key'], 'groupe': int(sp), 'nom': f.get('name'), 'sprite': f['sprite']})
    return liste


def references(c):
    """Toutes les images connues d'une classe, avec leur provenance."""
    s = c['sprite']
    refs = []

    def ajoute(p, source):
        if p.exists():
            refs.append({'chemin': str(p), 'source': source})

    # Artworks officiels, déjà embarqués dans l'appli (384 px, WebP).
    ajoute(SPRITES_APPLI / 'other/official-artwork' / f'{s}.webp', 'artwork')
    ajoute(SPRITES_APPLI / 'other/official-artwork/shiny' / f'{s}.webp', 'artwork')
    # Rendus 3D de Pokémon HOME : les plus proches d'une figurine ou d'un jeu récent.
    ajoute(SPRITES_API / 'other/home' / f'{s}.png', 'home')
    ajoute(SPRITES_API / 'other/home/shiny' / f'{s}.png', 'home')
    # Modèles 3D des jeux, animés : quelques images de chaque GIF.
    for d in ('', 'shiny/', 'back/', 'back/shiny/'):
        ajoute(SPRITES_API / f'other/showdown/{d}{s}.gif', 'showdown')
    # Dessins Dream World, générations 1 à 5 (SVG convertis en PNG au préalable).
    ajoute(DONNEES / 'dream-world-png' / f'{s}.png', 'dessin')
    # Sprites en pixels de chaque jeu, de Rouge/Bleu à Épée/Bouclier.
    versions = SPRITES_API / 'versions'
    if versions.exists():
        for jeu in versions.glob('generation-*/*'):
            if jeu.name in ('icons',):
                continue
            for d in ('', 'shiny/', 'back/', 'back/shiny/', 'transparent/', 'transparent/shiny/'):
                ajoute(jeu / f'{d}{s}.png', 'pixel')
    return refs


if __name__ == '__main__':
    liste = classes()
    sortie = []
    for i, c in enumerate(liste):
        r = references(c)
        if not r:
            continue
        c = {**c, 'index': len(sortie), 'refs': r}
        sortie.append(c)
    # Classe finale : « rien de connu ». Elle apprend à refuser un fond, un objet, une
    # personne, plutôt que de forcer la réponse vers le Pokémon le moins éloigné.
    sortie.append({'key': None, 'groupe': 0, 'nom': 'rien', 'index': len(sortie), 'refs': []})
    (DONNEES / 'classes.json').write_text(json.dumps(sortie, ensure_ascii=False), encoding='utf8')
    par_source = {}
    for c in sortie:
        for r in c['refs']:
            par_source[r['source']] = par_source.get(r['source'], 0) + 1
    print(f"{len(sortie)} classes ({sum(1 for c in sortie if c['key'] and c['key'] > 1025)} formes)")
    print('références :', par_source, 'total', sum(par_source.values()))
    maigres = [c['nom'] for c in sortie if c['key'] and len(c['refs']) < 3]
    print(f'{len(maigres)} classes avec moins de 3 références :', maigres[:30])
