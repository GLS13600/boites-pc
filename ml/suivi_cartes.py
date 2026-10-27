"""Tableau de bord en console de l'entraînement du scan des cartes.

Lit le journal écrit par lance-cartes.cmd et redessine l'écran toutes les 5 secondes :
phase en cours, barre de l'époque et barre d'ensemble, vitesse, heure de fin estimée,
résultat de chaque époque, occupation de la carte graphique. Ne touche à rien : il
peut être fermé et rouvert à volonté.

Usage : python suivi_cartes.py [journal] [lanceur]
"""
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

JOURNAL = Path(sys.argv[1] if len(sys.argv) > 1 else 'A:/Jeu-scan/runs/cartes-v2.log')
LANCEUR = Path(sys.argv[2] if len(sys.argv) > 2 else 'A:/Jeu-scan/lance-cartes.cmd')
MESURE_S = 120  # durée typique de la mesure de fin d'époque (36 772 cartes + 3 000 photos)


def barre(f, largeur=40):
    f = max(0.0, min(1.0, f))
    plein = int(round(f * largeur))
    return '█' * plein + '░' * (largeur - plein) + f' {f * 100:5.1f} %'


def duree(s):
    s = int(max(0, s))
    h, r = divmod(s, 3600)
    m, s = divmod(r, 60)
    return f'{h} h {m:02d} min' if h else f'{m} min {s:02d} s'


def gpu():
    try:
        r = subprocess.run(['nvidia-smi', '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu',
                            '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=5)
        u, m, t, c = [x.strip() for x in r.stdout.strip().split(',')]
        return f'{u} % de calcul · {int(m) / 1024:.1f} / {int(t) / 1024:.0f} Go · {c} °C'
    except Exception:
        return 'indisponible'


def reglage(nom, defaut):
    """Un réglage du lanceur (--epoques, --lot…), lu tel qu'il a été lancé."""
    try:
        m = re.search(rf'--{nom}\s+(\d+)', LANCEUR.read_text(errors='ignore'))
        return int(m.group(1)) if m else defaut
    except Exception:
        return defaut


def lit():
    if not JOURNAL.exists():
        return None
    lignes = JOURNAL.read_text(encoding='utf-8', errors='ignore').splitlines()
    # Seul le dernier lancement compte (le journal s'allonge à chaque reprise).
    debuts = [i for i, l in enumerate(lignes) if l.rstrip().endswith('debut')]
    if debuts:
        lignes = lignes[debuts[-1]:]
    e = {'epoques': [], 'pas': None, 'depart': None, 'fin': None, 'erreur': None, 'reprise': None}
    for l in lignes:
        l = l.strip()
        if l.startswith('{'):
            try:
                d = json.loads(l)
            except ValueError:
                continue
            if 'pas' in d:
                e['pas'] = d
            elif d.get('epoque') == 0:
                e['depart'] = d
            elif 'epoque' in d:
                e['epoques'].append(d)
                e['pas'] = None
        elif 'fin (code' in l:
            e['fin'] = l
        elif l.startswith('reprise'):
            e['reprise'] = l
        elif 'Traceback' in l or 'Error' in l:
            e['erreur'] = l
    return e


def affiche():
    n_ep, lot = reglage('epoques', 10), reglage('lot', 256)
    e = lit()
    out = ['', '  SCAN DES CARTES — entraînement de l\'empreinte visuelle', '  ' + '─' * 58]
    if e is None:
        out.append(f'  En attente du journal {JOURNAL}…')
        return out
    faites = len(e['epoques'])
    age = time.time() - JOURNAL.stat().st_mtime
    if e['erreur'] and not e['fin']:
        phase = 'ERREUR — voir le journal'
    elif e['fin']:
        phase = 'TERMINÉ' if 'code 0' in e['fin'] else f'ARRÊTÉ ({e["fin"].split("(")[-1]}'
    elif e['depart'] is None and not e['reprise']:
        phase = 'Préparation : photos de mesure, puis mesure de départ'
    elif e['pas']:
        phase = f'Époque {faites + 1} / {n_ep} : apprentissage'
    else:
        phase = f'Époque {faites + 1} / {n_ep} : démarrage' if faites < n_ep else 'Fin en cours'
    out.append(f'  Phase    : {phase}')

    # Avancement de l'époque en cours.
    p = e['pas']
    f_ep = p['pas'] / p['sur'] if p else 0.0
    if p and p['pas'] >= p['sur'] - 1:
        out[-1] = f'  Phase    : Époque {faites + 1} / {n_ep} : mesure de fin d\'époque'
    out.append(f'  Époque   : {barre(f_ep)}' + (f'   {p["pas"]} / {p["sur"]} lots' if p else ''))
    out.append(f'  Ensemble : {barre((faites + f_ep) / n_ep)}   {faites} / {n_ep} époques')

    # Vitesse et heure de fin.
    if p:
        vitesse = p['paires_s']
        reste_ep = (p['sur'] - p['pas']) * lot / max(1, vitesse) + MESURE_S
        duree_ep = [d['duree'] for d in e['epoques'] if 'duree' in d]
        par_ep = sum(duree_ep) / len(duree_ep) if duree_ep else p['sur'] * lot / max(1, vitesse) + MESURE_S
        reste = reste_ep + par_ep * max(0, n_ep - faites - 1)
        out.append(f'  Vitesse  : {vitesse} paires/s · perte {p["perte"]}')
        out.append(f'  Reste    : {duree(reste)} → fin vers {(datetime.now() + timedelta(seconds=reste)).strftime("%H:%M")}')
    elif not e['fin']:
        out.append('  Reste    : estimé dès les premiers lots')

    out.append(f'  GPU      : {gpu()}')
    if age > 1200 and not e['fin']:
        out.append(f'  ⚠ Aucune nouvelle du journal depuis {duree(age)} : l\'entraînement est peut-être arrêté.')

    # Résultats.
    out += ['', '  Résultats (bonne carte en 1er · réponses « sûres » : part et justesse)']
    if e['depart']:
        out.append(f'    départ   : {e["depart"]["top1"] * 100:5.1f} %')
    for d in e['epoques']:
        s = d.get('ecart>=0.06', {})
        out.append(f'    époque {d["epoque"]:2d} : {d["top1"] * 100:5.1f} %   sûres {s.get("couverture", 0) * 100:4.0f} % '
                   f'justes à {s.get("precision", 0) * 100:5.1f} %   ({duree(d.get("duree", 0))})')
    if e['fin'] and 'code 0' in e['fin']:
        meilleur = max((d['top1'] for d in e['epoques']), default=0)
        out += ['', f'  ✔ Entraînement terminé. Meilleur résultat : {meilleur * 100:.1f} %.',
                '    Prochaine étape : le bilan de fiabilité, puis l\'export vers l\'appli.']
    if e['erreur'] and not e['fin']:
        out += ['', f'  ✖ {e["erreur"][:100]}']
    out += ['', f'  Mis à jour à {datetime.now().strftime("%H:%M:%S")} · Ctrl+C pour fermer ce suivi (l\'entraînement continue)']
    return out


if __name__ == '__main__':
    try:
        while True:
            lignes = affiche()
            sys.stdout.write('\x1b[2J\x1b[H' + '\n'.join(lignes) + '\n')
            sys.stdout.flush()
            time.sleep(5)
    except KeyboardInterrupt:
        pass
