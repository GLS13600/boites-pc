// Serveur de développement en HTTPS, pour tester la CAMÉRA depuis le téléphone.
// Usage : npm run dev:https
//
// POURQUOI : `getUserMedia` exige un contexte sécurisé. Ouvert depuis le téléphone par
// l'IP réseau (http://192.168.x.x:5173), le serveur de dev n'en est pas un — seul
// `localhost`, sur la machine elle-même, y échappe. La vue Scan y affiche donc « la
// caméra demande une connexion sécurisée », et la seule façon de l'essayer était de
// pousser puis d'attendre le déploiement Pages à chaque fois.
//
// Le certificat est AUTO-SIGNÉ (@vitejs/plugin-basic-ssl) : Safari affiche un
// avertissement au premier accès. Afficher les détails → Visiter ce site web. Une fois
// accepté, l'origine est sécurisée et la caméra fonctionne.
//
// `npm run dev` reste en clair : un certificat auto-signé est refusé par certains
// clients, dont le panneau de prévisualisation.

import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

// Les adresses IPv4 réelles de la machine, pour n'avoir pas à les chercher.
const adresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);

// Le port n'est pas garanti : Vite en prend un autre si 5173 est occupé. On annonce
// donc les adresses, et Vite annonce le port juste après.
console.log('\n  Serveur de dev en HTTPS — certificat auto-signé.');
console.log(`  Adresses de cette machine : ${adresses.join(', ')}`);
console.log(`
  Sur l'iPhone, ouvrir l'adresse « Network » ci-dessous. Safari avertira que le
  certificat n'est pas fiable : « Afficher les détails » puis « Visiter ce site web ».
  La caméra fonctionne ensuite, l'origine étant sécurisée.

  Pour le diagnostic de l'écran noir, ajouter ?diag à l'adresse.
`);

// Vite lit DEV_HTTPS dans vite.config.js et n'ajoute le plugin que s'il est posé.
const vite = spawn('npx vite --host', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEV_HTTPS: '1' },
});
vite.on('exit', (code) => process.exit(code ?? 0));
