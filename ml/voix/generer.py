"""Voix du Pokédex : génère la description lue de chaque espèce (XTTS-v2, voix Sofia).

Sortie brute (sans vitesse ni effet) : A:/Jeu-scan/voix/brut/<id>.wav — reprend là où
elle s'est arrêtée. `finir.py` applique ensuite vitesse, effet et bip, et produit les MP3.
"""
import json, os, re, sys
from pathlib import Path

import numpy as np
import soundfile as sf

RACINE = Path(__file__).parent
BRUT = RACINE / 'brut'
BRUT.mkdir(exist_ok=True)
DEX = json.load(open(r'A:\Code\Pokedex\src\data\pokedex.json', encoding='utf-8'))
TYPES = {
    'normal': 'Normal', 'fire': 'Feu', 'water': 'Eau', 'grass': 'Plante', 'electric': 'Électrik',
    'ice': 'Glace', 'fighting': 'Combat', 'poison': 'Poison', 'ground': 'Sol', 'flying': 'Vol',
    'psychic': 'Psy', 'bug': 'Insecte', 'rock': 'Roche', 'ghost': 'Spectre', 'dragon': 'Dragon',
    'dark': 'Ténèbres', 'steel': 'Acier', 'fairy': 'Fée',
}

# Prononciation : graphie phonétique des mots que la voix lit mal. À compléter.
LEXIQUE = {
    r'\bSheauriken\b': 'Chouriquène', r'\bshurikens?\b': 'chouriquène',
    r'\b[Nn]injas?\b': 'nindja',
    r'\bÉlectrik\b': 'Électrique',
}
UNITES = [
    (r'(\d) ?km/h\b', r'\1 kilomètres heure'), (r'(\d) ?km\b', r'\1 kilomètres'),
    (r'(\d) ?cm\b', r'\1 centimètres'), (r'(\d) ?mm\b', r'\1 millimètres'),
    (r'(\d) ?kg\b', r'\1 kilos'), (r'(\d) ?t\b', r'\1 tonnes'), (r'(\d) ?m\b', r'\1 mètres'),
    (r'(\d) ?[ºo°] ?C\b', r'\1 degrés'), (r'(\d) ?%', r'\1 pour cent'),
]

def nombres(t):
    from num2words import num2words
    t = re.sub(r'(?<=\d)[\u00a0\u202f ](?=\d{3}\b)', '', t)          # 1 400 → 1400
    t = re.sub(r'-(\d)', r'moins \1', t)
    t = re.sub(r'\d+,\d+', lambda m: num2words(float(m.group().replace(',', '.')), lang='fr'), t)
    return re.sub(r'\d+', lambda m: num2words(int(m.group()), lang='fr'), t)

def texte(i):
    p = DEX[str(i)]
    types = ' et '.join(TYPES.get(t, t) for t in p['types'])
    g = p.get('genus') or ''
    if g and not g.startswith('Pokémon'): g = 'Pokémon ' + g     # gén. 9 : « Chat Plante »
    t = f"{p['name']}, le {g}, de type {types}." if g else f"{p['name']}, de type {types}."
    if p.get('flavor'): t += ' ' + p['flavor']
    t = t.replace('’', "'").replace('\u00a0', ' ')
    for motif, rempl in UNITES: t = re.sub(motif, rempl, t)
    t = nombres(t)
    for motif, rempl in LEXIQUE.items(): t = re.sub(motif, rempl, t)
    return t

if __name__ == '__main__':
    if sys.argv[1:2] == ['texte']:
        for i in sys.argv[2:]: print(i, texte(i))
        sys.exit()
    os.environ['COQUI_TOS_AGREED'] = '1'
    from TTS.api import TTS
    tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2').to('cuda')
    ids = [int(a) for a in sys.argv[1:]] or range(1, 1026)
    for i in ids:
        f = BRUT / f'{i}.wav'
        if f.exists() and len(sys.argv) == 1: continue
        audio = tts.tts(text=texte(i), language='fr', speaker='Sofia Hellen')
        sf.write(f, np.asarray(audio, dtype=np.float32), 24000)
        print(i, flush=True)
    print('fini', flush=True)
