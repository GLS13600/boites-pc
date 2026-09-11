"""Exporte le modèle entraîné en ONNX pour onnxruntime-web, et vérifie qu'il répond
comme PyTorch — puis mesure ce que coûte chaque variante de compression.

Usage : python ml/exporter.py <dossier du run> [--quantifie]
Produit dans le dossier du run : modele.onnx (+ modele-int8.onnx) et scan-classes.json.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import timm
import torch
from timm.utils.model import reparameterize_model

import entrainer as E


def charge(run, C):
    m = timm.create_model(E.MODELE, pretrained=False, num_classes=C)
    m = reparameterize_model(m)
    m.load_state_dict(torch.load(run / 'meilleur.pt', map_location='cpu'))
    return m.eval()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run')
    ap.add_argument('--quantifie', action='store_true')
    args = ap.parse_args()
    run = Path(args.run)
    classes = json.loads((run / 'classes.json').read_text(encoding='utf8'))
    m = charge(run, len(classes))

    x = torch.rand(2, 3, 256, 256)
    sortie = run / 'modele.onnx'
    torch.onnx.export(m, x, sortie, input_names=['image'], output_names=['logits'],
                      dynamic_axes={'image': {0: 'lot'}, 'logits': {0: 'lot'}},
                      opset_version=17, dynamo=False)
    print(f'{sortie.name} : {sortie.stat().st_size / 1e6:.1f} Mo')

    with torch.no_grad():
        ref = m(x).numpy()
    sess = ort.InferenceSession(str(sortie), providers=['CPUExecutionProvider'])
    out = sess.run(None, {'image': x.numpy()})[0]
    # Les logits bruts divergent de quelques dixièmes sur des valeurs d'une centaine
    # (arrondis flottants accumulés sur tout le réseau) : c'est la PROBABILITÉ, ce que
    # l'appli lit, qu'il faut comparer.
    sm = lambda a: np.exp(a - a.max(-1, keepdims=True)) / np.exp(a - a.max(-1, keepdims=True)).sum(-1, keepdims=True)
    print('écart max des probabilités PyTorch / ONNX :', float(np.abs(sm(ref) - sm(out)).max()),
          '— même classe :', bool((ref.argmax(-1) == out.argmax(-1)).all()))

    if args.quantifie:
        from onnxruntime.quantization import QuantType, quantize_dynamic
        q = run / 'modele-int8.onnx'
        quantize_dynamic(str(sortie), str(q), weight_type=QuantType.QUInt8)
        print(f'{q.name} : {q.stat().st_size / 1e6:.1f} Mo')

    # Table de correspondance embarquée dans l'appli : index de sortie → clé et groupe.
    (run / 'scan-classes.json').write_text(json.dumps(
        [[c['key'], c['groupe']] for c in classes], separators=(',', ':')), encoding='utf8')


if __name__ == '__main__':
    main()
