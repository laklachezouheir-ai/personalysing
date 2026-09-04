# Personalysing

SaaS qui automatise la création des aperçus de personnalisation pour les
vendeurs Etsy de produits personnalisés (bijoux gravés, cadeaux prénom,
faire-part...). Le vendeur configure une fois une « zone de texte » sur la
photo de son produit ; ensuite, il colle le texte reçu dans une commande et
l'aperçu visuel est généré instantanément — au lieu de le refaire à la main
dans Photoshop/Canva à chaque commande.

## Pourquoi ce produit (contexte)

Sur Etsy, environ un tiers des ventes concernent des produits personnalisés.
Les vendeurs fabriquent aujourd'hui leurs aperçus à la main, commande par
commande. Ce MVP automatise la partie la plus chronophage (la création du
visuel) — voir la discussion complète dans l'historique de conception pour
le détail du positionnement produit et de la stratégie de lancement.

## Fonctionnement actuel (MVP)

1. Le vendeur crée un compte et importe la photo vierge de son produit.
2. Il définit la zone où le texte doit apparaître (position, taille,
   police, couleur, alignement) avec un aperçu en direct.
3. Pour chaque commande reçue, il colle le texte personnalisé de l'acheteur
   → l'image est générée instantanément, prête à être téléchargée et
   envoyée depuis Etsy Messages.

Ce flux **fonctionne dès aujourd'hui**, sans dépendre de l'API Etsy — c'est
volontaire : l'accès "Commercial" à l'API Etsy demande une revue manuelle
côté Etsy, qui peut prendre du temps. Le produit doit rester utilisable
avant cette approbation.

### Limite connue et assumée : pas d'envoi automatique du message

L'API Etsy Open API v3 n'expose aucun endpoint pour envoyer un message à un
acheteur (pas de messagerie programmable). Le vendeur doit donc toujours
envoyer l'image lui-même depuis Etsy — mais la partie la plus longue (créer
le visuel) est automatisée. Une fois la boutique connectée (voir
ci-dessous), la génération pourra se déclencher automatiquement à chaque
commande via le webhook `order.paid`.

### Polices intégrées

Plusieurs polices (Poppins, Montserrat, Playfair Display, Dancing Script,
Great Vibes — licence SIL Open Font License) sont embarquées dans
`assets/fonts/` et enregistrées auprès de fontconfig au démarrage
(`lib/fontSetup.js`). Ça garantit un rendu identique sur n'importe quel
environnement d'exécution (poste de dev, Render...), sans dépendre des
polices installées sur la machine hôte.

## Installation

```bash
npm install
cp .env.example .env
# éditez .env : au minimum SESSION_SECRET
npm start
```

Puis ouvrez http://localhost:3000.

Pour le développement avec rechargement automatique :

```bash
npm run dev
```

## Connexion Etsy (optionnelle, désactivée par défaut)

La connexion à l'API Etsy est **inactive tant que `ETSY_API_KEY` et
`ETSY_SHARED_SECRET` ne sont pas configurés** — le mode manuel décrit
ci-dessus reste pleinement fonctionnel sans ça.

Pour l'activer :

1. Créez une app sur https://www.etsy.com/developers/your-apps
2. Demandez l'accès **"Commercial"** (nécessaire pour gérer les boutiques
   de plusieurs vendeurs plutôt qu'une seule) — cette étape demande une
   revue manuelle par Etsy, prévoir un délai.
3. Renseignez `ETSY_API_KEY`, `ETSY_SHARED_SECRET` et `ETSY_REDIRECT_URI`
   dans `.env`.
4. Depuis le tableau de bord, onglet « Connexion Etsy », cliquez sur
   « Connecter ma boutique Etsy » (flux OAuth2 + PKCE).

Une fois connectée, la boutique peut recevoir les commandes via le webhook
`order.paid` sur `POST /api/etsy/webhook` (la vérification de signature du
webhook reste à implémenter avant mise en production réelle — voir le
`TODO` dans `server.js`).

## Structure du projet

```
personalysing/
├── server.js                 # Point d'entrée Express, toutes les routes
├── lib/
│   ├── fontSetup.js           # Enregistre assets/fonts auprès de fontconfig
│   ├── fonts.js                # Registre des polices disponibles
│   ├── store.js                 # Stockage JSON local (data/db.json)
│   ├── auth.js                   # Inscription / connexion / sessions
│   ├── uploads.js                 # Upload d'images (multer + normalisation sharp)
│   ├── imageCompose.js             # Moteur de composition texte-sur-image
│   └── etsyClient.js                # Client OAuth2/API Etsy Open API v3
├── assets/fonts/               # Polices embarquées (SIL OFL)
├── public/                     # Frontend statique (HTML/CSS/JS, sans framework)
│   ├── index.html               # Landing + connexion/inscription
│   ├── dashboard.html            # Templates + file d'aperçus à envoyer
│   ├── template.html              # Éditeur de template (zone + aperçu live)
│   ├── common.js, style.css
├── data/                        # Généré au runtime (JSON + images), non versionné
├── .env.example
└── package.json
```

## Ce qui manque avant un vrai lancement commercial

- **Paiement** : aucune intégration Stripe pour l'instant (abonnement,
  limites d'usage par plan).
- **Sécurité webhook Etsy** : la vérification de signature n'est pas encore
  implémentée sur `POST /api/etsy/webhook`.
- **Base de données** : le stockage JSON local (`lib/store.js`) est
  volontairement simple pour ce MVP — à remplacer par Postgres/SQLite avant
  d'avoir plusieurs vendeurs actifs en parallèle (accès concurrents).
- **Etsy Commercial Access** : à demander dès que le produit est validé par
  les premiers utilisateurs en mode manuel (voir stratégie de lancement).

## Limites connues

- Un seul fichier de session en mémoire (`express-session` par défaut) :
  suffisant pour tester, mais à faire persister (ex : Redis) en production
  avec plusieurs instances du serveur.
- Le glisser-déposer de la zone de texte dans l'éditeur ne gère pas encore
  le tactile (souris uniquement).
