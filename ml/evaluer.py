"""Évalue un modèle exporté EXACTEMENT comme l'appli décide, et règle le seuil.

Reproduit la décision de src/scan.js : probabilités moyennées sur les cadrages, somme
par groupe, refus sous le seuil. Mesure, sur les cartes des extensions jamais vues :
  - le taux de bonnes fiches, le taux de « non trouvé » et le taux de fiches FAUSSES ;
  - sur des images sans Pokémon, combien ouvrent quand même une fiche.

Usage : python ml/evaluer.py <modele.onnx> <dossier de données> [--echelles 1,0.78]
"""
import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import torch.nn.functional as F


def cadrages(x, echelles):
    """x : lot uint8 (N,3,256,256) → (N*len(echelles),3,256,256) float [0,1]."""
    x = x.float() / 255
    sorties = []
    for e in echelles:
        if e == 1:
            sorties.append(x)
            continue
        c = int(round(256 * e))
        o = (256 - c) // 2
        sorties.append(F.interpolate(x[:, :, o:o + c, o:o + c], size=256, mode='bilinear', antialias=True, align_corners=False))
    return torch.stack(sorties, 1).reshape(-1, 3, 256, 256).numpy()


def probas(sess, X, echelles, lot=32):
    ps = []
    for i in range(0, len(X), lot):
        entree = cadrages(X[i:i + lot], echelles)
        logits = sess.run(None, {'image': entree})[0]
        p = torch.softmax(torch.from_numpy(logits).double(), -1).reshape(-1, len(echelles), logits.shape[-1]).mean(1)
        ps.append(p)
    return torch.cat(ps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('modele')
    ap.add_argument('racine')
    ap.add_argument('--echelles', default='1')
    ap.add_argument('--classes', default=None)
    args = ap.parse_args()
    racine = Path(args.racine)
    echelles = [float(v) for v in args.echelles.split(',')]
    classes = json.loads(Path(args.classes or Path(args.modele).parent / 'scan-classes.json').read_text())
    groupes = sorted({g for _, g in classes})
    gi = {g: i for i, g in enumerate(groupes)}
    membres = torch.zeros(len(groupes), len(classes), dtype=torch.float64)
    for i, (_, g) in enumerate(classes):
        membres[gi[g], i] = 1

    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 8
    sess = ort.InferenceSession(args.modele, opts, providers=['CPUExecutionProvider'])
    res = {}
    for nom in ('illustration', 'photo_carte', 'rien'):
        X, G = torch.load(racine / f'eval-{nom}.pt')
        P = probas(sess, X, echelles) @ membres.T
        conf, pred = P.max(-1)
        rien = gi[0]
        res[nom] = (conf, pred, G)
        print(f'{nom:13s} top-1 : {(pred == G).double().mean():.3f}  (n={len(G)})')

    print(f'\nÉchelles {echelles} — décision de l\'appli selon le seuil :')
    print('seuil | cartes illustr. : bonnes / non trouvé / FAUSSES | photos de cartes : bonnes / non trouvé / FAUSSES | sans Pokémon : fiche ouverte')
    for seuil in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
        ligne = f'{seuil:.1f}  |'
        for nom in ('illustration', 'photo_carte'):
            conf, pred, G = res[nom]
            accepte = (conf >= seuil) & (pred != gi[0])
            bonnes = (accepte & (pred == G)).double().mean()
            fausses = (accepte & (pred != G)).double().mean()
            ligne += f'  {bonnes:.3f} / {1 - accepte.double().mean():.3f} / {fausses:.3f}  |'
        conf, pred, G = res['rien']
        ouvre = ((conf >= seuil) & (pred != gi[0])).double().mean()
        ligne += f'  {ouvre:.3f}'
        print(ligne)


if __name__ == '__main__':
    main()
