# Sneaker Raffle Watcher

Surveille automatiquement les nouveaux raffles sneakers (Nike, adidas, Air Jordan, Yeezy, New Balance, Off-White, etc.) et envoie une notification Telegram des qu'une nouvelle annonce apparait, avec la marque, le modele et le lien pour s'inscrire.

**Cout : 0 €, sans exception, ni maintenant ni dans le temps** (voir explication ci-dessous).

## Comment ca marche

- **Sources des donnees** (plusieurs, interrogees independamment a chaque run) :
  - [raffle-sneakers.com](https://raffle-sneakers.com/) — blog dedie aux raffles Nike, adidas, Jordan, Off-White, New Balance, Yeezy, etc. (page d'accueil HTML).
  - [topsandbottomsusa.com](https://www.topsandbottomsusa.com/blogs/new-look) — revendeur US qui publie ses propres raffles via un flux Atom/RSS standard (un article = un raffle, tres actif).
  Si l'une des sources tombe en panne ou change de structure, l'autre continue de fonctionner : elles sont independantes et fusionnees avant la comparaison avec les raffles deja vus.
- **Detection des nouveautes** : la liste des raffles deja notifies est stockee dans [`state/seen.json`](state/seen.json), commite dans le depot Git a chaque execution. Pas de base de donnees externe necessaire.
- **Notification** : envoyee via l'API gratuite de Telegram (Bot API), avec la marque, le modele, le statut et le lien.
- **Hebergement** : le script tourne dans **GitHub Actions**, sur un depot **public** (les minutes d'execution GitHub Actions sont illimitees et gratuites pour les depots publics, contrairement aux depots prives qui sont limites a 2000 min/mois gratuites). Votre ordinateur n'a pas besoin d'etre allume : tout se passe sur les serveurs de GitHub, gratuitement.
- **Frequence reglable** : un simple cron dans `.github/workflows/raffle-watch.yml`, modifiable a tout moment.

Le token du bot Telegram et l'identifiant du chat restent **secrets** (stockes comme "GitHub Actions Secrets", jamais visibles dans le code ni dans les logs), meme si le depot est public.

## Etape 1 — Creer votre bot Telegram (gratuit, ~2 minutes)

1. Ouvrez Telegram et cherchez **@BotFather**.
2. Envoyez `/newbot`, choisissez un nom puis un identifiant (doit finir par `bot`, ex: `MesRafflesSneakersBot`).
3. BotFather vous donne un **token** du type `123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`. Gardez-le, c'est votre `TELEGRAM_BOT_TOKEN`.
4. Cherchez votre bot dans Telegram (par le nom que vous lui avez donne) et envoyez-lui **n'importe quel message** (ex: "salut") — c'est necessaire pour que le bot puisse ensuite vous ecrire.
5. Recuperez votre **chat_id** :
   - Localement, si vous avez Node installe : creez un fichier `.env` a la racine du projet avec `TELEGRAM_BOT_TOKEN=votre_token`, puis lancez `node --env-file=.env scripts/get-chat-id.mjs`.
   - Sinon, ouvrez simplement cette URL dans votre navigateur (remplacez le token) :
     `https://api.telegram.org/bot<VOTRE_TOKEN>/getUpdates`
     et repérez `"chat":{"id":XXXXXXX, ...}` dans la reponse JSON. C'est votre `TELEGRAM_CHAT_ID`.

## Etape 2 — Mettre le code sur GitHub

Ce dossier est deja initialise en depot Git local. Il ne reste qu'a le pousser sur GitHub :

1. Creez un **nouveau depot GitHub** (public, recommande — voir "Pourquoi un depot public ?" plus bas) : https://github.com/new
   - Ne cochez ni README, ni .gitignore, ni licence (le depot local en a deja).
2. Dans un terminal, a la racine du projet :
   ```bash
   git remote add origin https://github.com/<votre-utilisateur>/<nom-du-repo>.git
   git branch -M main
   git push -u origin main
   ```

### Pourquoi un depot public ?

- **Public** : minutes GitHub Actions **illimitees et gratuites**, quelle que soit la frequence choisie.
- **Prive** : 2 000 minutes gratuites/mois. Chaque execution dure ~10-20 secondes, donc meme prive vous avez largement de la marge pour une verification toutes les 15-30 minutes (~1500-3000 min/mois selon frequence — a la limite). **Public reste plus simple et garantit 0 € pour toujours quelle que soit la frequence choisie.**
- Le code source (un scraper + un envoi Telegram) ne contient aucune donnee personnelle : vos identifiants Telegram restent dans les secrets GitHub, jamais dans le code visible.

Si vous preferez malgre tout un depot prive, ca fonctionne aussi (voir tableau frequence/minutes plus bas).

## Etape 3 — Ajouter vos secrets sur GitHub

Dans votre depot GitHub : **Settings → Secrets and variables → Actions → New repository secret**

Ajoutez deux secrets :
| Nom | Valeur |
|---|---|
| `TELEGRAM_BOT_TOKEN` | le token recu de BotFather |
| `TELEGRAM_CHAT_ID` | le chat_id recupere a l'etape 1 |

## Etape 4 — Tester

1. Allez dans l'onglet **Actions** de votre depot.
2. Selectionnez le workflow **"Sneaker Raffle Watch"**, cliquez sur **"Run workflow"**.
3. Mettez `test_mode` a `true`, puis lancez.
4. Vous devez recevoir un message Telegram "Message de test - Sneaker Raffle Watcher" en quelques secondes. Si oui, tout fonctionne.
5. Relancez ensuite le workflow avec `test_mode` a `false` (ou laissez-le simplement s'executer via le cron). **Ce premier vrai run n'envoie aucune notification** : il enregistre tous les raffles actuellement en ligne comme "deja connus", pour eviter de vous envoyer d'un coup toutes les annonces en cours. A partir du run suivant, seules les **nouvelles** annonces vous sont notifiees.

## Ajuster la frequence de verification

Ouvrez [`.github/workflows/raffle-watch.yml`](.github/workflows/raffle-watch.yml) et modifiez la ligne `cron:` (des exemples prets a copier sont juste au-dessus dans le fichier). Par defaut : toutes les 15 minutes.

```yaml
- cron: "*/15 * * * *"   # toutes les 15 minutes
```

Committez et poussez le changement (`git add`, `git commit`, `git push`) : la nouvelle frequence est prise en compte au prochain declenchement. Notez que GitHub peut retarder legerement les cron jobs de quelques minutes en cas de forte charge sur leur infrastructure (limitation connue de GitHub Actions, pas un bug du projet).

## Historique consultable depuis l'ordinateur

En plus des notifications Telegram, chaque nouveau raffle detecte est aussi ajoute a [`historique-raffles.md`](historique-raffles.md) (marque, modele, prix, date de vente, lien cliquable). Ce fichier est commite automatiquement dans le depot : consultez-le directement sur GitHub, ou faites `git pull` pour le recuperer en local.

## Limites connues

- **Deux sources tierces**, pas les flux officiels des marques (Nike SNKRS / adidas Confirmed n'exposent pas d'API publique gratuite et bloquent activement le scraping automatise). Si l'une des deux change de structure, seule sa partie du code (`scripts/check-raffles.mjs`, objets `raffleSneakersSource` / `topsAndBottomsSource`) devra etre mise a jour — c'est le principal point de maintenance a prevoir sur la duree.
- Le lien envoye pointe vers la fiche/l'article de la source (qui contient elle-meme les details et le lien d'inscription), plutot que toujours vers un lien direct chez la marque : les sources ne proposent pas toujours un lien externe unique et fiable a extraire automatiquement (parfois plusieurs revendeurs/regions, parfois des bannieres publicitaires sans rapport). C'est un choix deliberement plus robuste plutot que de risquer d'envoyer un lien errone.
- `raffle-sneakers.com` peut traverser des periodes sans nouvelle publication (deja observe : ~2 mois sans mise a jour a un moment donne) — l'agent continue de fonctionner normalement, il n'a simplement rien a signaler sur cette source tant qu'elle est inactive. `topsandbottomsusa.com` sert de source de secours active dans ce cas.

## Ajouter une autre source plus tard

La logique est volontairement simple pour rester facile a etendre : dans `scripts/check-raffles.mjs`, dupliquez le principe de `fetchHomepage` + `parseRaffles` pour un autre site, normalisez le resultat au meme format `{ id, title, brand, link, image, status }`, et fusionnez les listes avant la comparaison avec `state/seen.json`. Demandez si besoin, ce point d'extension a ete prepare pour ca.

## Depannage

- **Pas de message recu lors du test** : verifiez que vous avez bien envoye un message a votre bot avant de recuperer le `chat_id` (etape 1.4), et que les deux secrets sont bien orthographies dans GitHub.
- **Le workflow echoue** : ouvrez l'onglet Actions → cliquez sur l'execution en erreur → lisez les logs, l'erreur est explicite (ex: "TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID doivent etre definis" = secrets manquants ou mal nommes).
- **Zero raffle trouve** : le site source a peut-etre change de structure HTML ; ouvrez une issue ou demandez une mise a jour du parseur.

## Test local (optionnel)

```bash
# necessite Node.js 20+
echo "TELEGRAM_BOT_TOKEN=votre_token" > .env
echo "TELEGRAM_CHAT_ID=votre_chat_id" >> .env

node --env-file=.env scripts/check-raffles.mjs --test   # message de test
node --env-file=.env scripts/check-raffles.mjs          # verification reelle
```
