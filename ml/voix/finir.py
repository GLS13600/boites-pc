"""Voix du Pokédex : applique bip, vitesse et effet aux WAV bruts, et écrit les MP3 de l'appli.

Entrée : brut/<id>.wav (generer.py). Sortie : A:/Code/Pokedex/public/voix/<id>.mp3.
Réglages choisis à l'écoute (17/09/2026) : voix XTTS « Sofia Hellen », vitesse ×1,3,
effet « marqué clair » (haut-parleur métallique, écho court, consonnes renforcées).
"""
import subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf

RACINE = Path(__file__).parent
BRUT = RACINE / 'brut'
SORTIE = Path(r'A:\Code\Pokedex\public\voix')
SORTIE.mkdir(parents=True, exist_ok=True)
FFMPEG = r'A:\Code\Pokedex\node_modules\ffmpeg-static\ffmpeg.exe'
VITESSE = 1.3
EFFET = ('highpass=f=230,lowpass=f=8000,chorus=0.7:0.9:12:0.25:0.4:1.5,aecho=0.85:0.5:8:0.15,'
         'equalizer=f=2200:t=q:w=1.2:g=4,equalizer=f=4000:t=q:w=1:g=3,volume=1.2')
SR = 24000

def bip():
    """Double bip d'ouverture, synthétisé (ne passe pas par la vitesse)."""
    t = lambda d: np.arange(int(SR * d)) / SR
    b1 = 0.25 * np.sin(2 * np.pi * 1760 * t(0.06)) * np.hanning(int(SR * 0.06))
    b2 = 0.25 * np.sin(2 * np.pi * 2350 * t(0.08)) * np.hanning(int(SR * 0.08))
    return np.concatenate([b1, np.zeros(int(SR * 0.05)), b2, np.zeros(int(SR * 0.12))]).astype(np.float32)

def finit(wav):
    mp3 = SORTIE / f'{wav.stem}.mp3'
    if mp3.exists() and mp3.stat().st_mtime > wav.stat().st_mtime and '--tout' not in sys.argv:
        return
    voix, sr = sf.read(wav, dtype='float32')
    assert sr == SR
    # Silences de début et de fin retirés : la lecture doit démarrer tout de suite.
    fort = np.flatnonzero(np.abs(voix) > 0.01)
    if len(fort): voix = voix[max(0, fort[0] - 1200): fort[-1] + 2400]
    tmp = wav.with_suffix('.tmp.wav')
    sf.write(tmp, voix, SR)
    filtre = f'[0:a]atempo={VITESSE},{EFFET}[v];[1:a][v]concat=n=2:v=0:a=1'
    b = wav.with_suffix('.bip.wav')
    sf.write(b, bip(), SR)
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', str(tmp), '-i', str(b),
                    '-filter_complex', filtre, '-ac', '1', '-ar', str(SR), '-b:a', '40k', str(mp3)], check=True)
    tmp.unlink(); b.unlink()

if __name__ == '__main__':
    fichiers = sorted(BRUT.glob('*.wav'), key=lambda f: int(f.stem) if f.stem.isdigit() else 0)
    fichiers = [f for f in fichiers if f.stem.isdigit()]
    with ThreadPoolExecutor(8) as ex: list(ex.map(finit, fichiers))
    total = sum(f.stat().st_size for f in SORTIE.glob('*.mp3'))
    print(len(list(SORTIE.glob('*.mp3'))), 'MP3', round(total / 1e6, 1), 'Mo')
