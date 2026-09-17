"""Régénère un clip jusqu'à ce que sa retranscription colle au texte (XTTS bafouille parfois)."""
import difflib, shutil, subprocess, sys
from pathlib import Path
import whisper
from generer import texte
from verifier import plat
m = whisper.load_model('medium', device='cuda')
PY = [sys.executable, str(Path(__file__).with_name('generer.py'))]
for i in sys.argv[1:]:
    attendu = plat(texte(int(i)))
    for essai in range(5):
        subprocess.run(PY + [i], check=True, capture_output=True)
        entendu = plat(m.transcribe(f'brut/{i}.wav', language='fr')['text'])
        sm = difflib.SequenceMatcher(None, attendu, entendu)
        repris = sum(b.size for b in sm.get_matching_blocks())
        rajout = max(0, len(entendu) - repris) / len(attendu)
        print(i, essai, round(rajout, 3), flush=True)
        if rajout < 0.06:
            shutil.copy(f'brut/{i}.wav', f'brut/{i}.ok.wav'); break
    else:
        print(i, 'toujours imparfait', flush=True)
