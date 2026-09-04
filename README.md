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
2. Il positionne les **4 coins** de la zone de texte pour épouser l'angle
   réel du support dans la photo (rotation, inclinaison, profondeur) —
   pas juste un rectangle à plat — avec aperçu en direct.
3. Pour chaque commande reçue, il colle le texte personnalisé de l'acheteur
   → l'image est générée instantanément, texte déformé en perspective pour
   suivre le support, prête à être téléchargée et envoyée depuis Etsy
   Messages.

### Positionnement en perspective (3 axes)

Un simple rectangle plaqué à plat ne convainc pas sur un produit photographié
sous un angle (bague, pendentif incliné...). L'éditeur laisse donc déplacer
individuellement les 4 coins de la zone de texte ; `lib/perspectiveWarp.js`
calcule la transformation projective qui envoie le texte "à plat" sur ce
quadrilatère (technique dite *corner-pin*, la même que Printful/Placeit/
Customily), ce qui le fait suivre la rotation, l'inclinaison horizontale et
la profondeur apparentes du support. Un mode de fusion « Effet gravé »
(`blend: multiply`) est aussi disponible pour laisser transparaître les
reflets/ombres de la photo à travers le texte plutôt qu'un aplat de couleur.

**Limite assumée** : c'est une déformation 2D en perspective, pas un rendu
3D avec relief/éclairage réel (ce qui demanderait un modèle 3D du produit ou
une génération par IA type ControlNet/depth — beaucoup plus lourd et
coûteux). Suffisant pour une surface plane ou légèrement courbée ; moins
convaincant sur une courbure prononcée (ex : texte qui doit s'enrouler
autour d'un objet cylindrique vu de face).

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

Sans `DATABASE_URL`, l'app tourne directement sur un fichier JSON local —
pratique pour tester sans rien installer, voir section **Base de données**
ci-dessous pour les limites de ce mode.

## Base de données

Deux backends de stockage, sélectionnés automatiquement :

- **`DATABASE_URL` absente** → fichier JSON local (`data/db.json`,
  `lib/storeJson.js`). Zéro installation, pratique pour développer, mais
  **à éviter en production** : sur Render (plan gratuit), le disque n'est
  pas persistant — toutes les données disparaissent à chaque redéploiement
  ou réveil du service après une mise en veille.
- **`DATABASE_URL` définie** → PostgreSQL (`lib/storePostgres.js`),
  persistant indépendamment du disque de l'app. Les sessions de connexion
  sont aussi persistées en base dans ce cas (`connect-pg-simple`) — sans
  ça, tous les vendeurs seraient déconnectés à chaque redéploiement.

### Mise en place (recommandé avant tout usage réel)

Le Postgres gratuit de Render **expire après 30 jours** (données supprimées
ensuite) — pas adapté pour de vraies données. Deux alternatives gratuites
et durables :

- **[Neon](https://neon.tech/)** (recommandé) — Postgres serverless, 0,5 Go
  gratuit, pas d'expiration, pas de carte bancaire requise.
- **[Supabase](https://supabase.com/)** — alternative équivalente.

1. Créez un projet, copiez la chaîne de connexion (`postgresql://...`).
2. Renseignez `DATABASE_URL` dans `.env` (local) ou dans Environment sur
   Render.
3. Au démarrage, l'app crée automatiquement les tables nécessaires
   (`collections`, `user_sessions`) — aucune migration manuelle à lancer.

### Détails techniques

`lib/store.js` expose une API commune (`list`, `find`, `filter`, `insert`,
`update`, `remove`), 100% asynchrone, quel que soit le backend actif — le
reste de l'app (routes, middlewares) ne sait pas quel backend est utilisé.
Chaque "collection" (users, templates, previews...) est stockée comme des
lignes JSONB dans une table générique plutôt que des tables dédiées par
type : ça évite d'écrire une migration de schéma à chaque nouveau champ,
au prix d'un filtrage fait côté Node plutôt qu'en SQL indexé — un choix
pragmatique pour ce stade du produit, à revoir si une collection (ex :
`aiUsage`) grossit beaucoup.

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

## Outils IA additionnels (optionnels)

Trois outils supplémentaires, chacun **inactif tant que sa clé API n'est
pas configurée** (même principe que l'intégration Etsy) :

| Outil | Page | Clé requise | Fournisseur | Coût indicatif |
|---|---|---|---|---|
| Optimiseur SEO (titre + 13 tags + description) | `/seo.html` | `DEEPSEEK_API_KEY` | [DeepSeek](https://platform.deepseek.com/) | très faible par génération |
| Générateur de mockups produit | `/mockups.html` | `REPLICATE_API_TOKEN` | [Replicate](https://replicate.com/) (Flux) | ~0,01-0,08$ par image |
| Générateur de vidéos produit | `/videos.html` | `RUNWAY_API_KEY` | [Runway](https://dev.runwayml.com/) | plusieurs $ par vidéo — le plus coûteux |

### ⚠️ À vérifier avant mise en production

Les API de génération d'image/vidéo par IA évoluent vite (noms de modèles,
schémas d'entrée). `lib/replicateClient.js` et `lib/runwayClient.js`
utilisent des valeurs par défaut correctes au moment de l'écriture
(`REPLICATE_MODEL`, `RUNWAY_MODEL`, overridables par variable
d'environnement), mais **à re-vérifier sur la documentation officielle du
fournisseur** avant de compter dessus en production — un modèle peut être
renommé ou son schéma d'entrée changer sans préavis.

### Générateur de vidéos : limites à connaître

- Génération asynchrone (jusqu'à ~10 min) suivie en mémoire côté serveur —
  un redémarrage pendant une génération en cours la laisse bloquée sur
  "en cours" côté app (elle continue côté Runway ; vérifier son tableau de
  bord dans ce cas).
- Coût réel de plusieurs dollars par vidéo généré : pas de bouton
  "annuler", chaque clic sur "Générer" engage la dépense.
- Sur le plan Render gratuit (disque non persistant), **téléchargez vos
  vidéos rapidement** après génération.

## Déploiement sur Render

Le dépôt contient un `render.yaml` (Blueprint Render) prêt à l'emploi.

1. Sur [render.com](https://render.com), **New +** → **Blueprint**.
2. Connecte ce dépôt GitHub (`laklachezouheir-ai/personalysing`) et sélectionne
   la branche à déployer.
3. Render détecte `render.yaml` et propose de créer le service web
   `personalysing` (build : `npm install`, démarrage : `npm start`).
   `SESSION_SECRET` est généré automatiquement ; les variables `ETSY_*`
   restent vides tant que l'intégration Etsy n'est pas activée.
4. **Apply** / **Create Web Service**. Render fournit une URL du type
   `https://personalysing-xxxx.onrender.com`.

**⚠️ Important — disque non persistant (plan gratuit)** : sur le plan
gratuit, le système de fichiers est réinitialisé à chaque déploiement et à
chaque réveil du service après mise en veille (inactivité).

- Avec `DATABASE_URL` configurée (voir section **Base de données**), les
  **données** (comptes, templates, historique) survivent maintenant à ces
  redémarrages — c'est le problème principal réglé.
- Les **fichiers binaires** (photos de template, aperçus/mockups/vidéos
  générés) restent en revanche stockés sur le disque local de l'app
  (`data/uploads`, `data/previews`...) et **sont toujours perdus** dans ces
  cas-là, même avec Postgres configuré. Pour les conserver de façon fiable,
  passer au plan **Starter** (~7$/mois) et ajouter un disque persistant
  monté sur `./data`, ou migrer ces fichiers vers un stockage objet
  S3-compatible (amélioration future, non faite ici).

## Structure du projet

```
personalysing/
├── server.js                    # Point d'entrée Express, routes principales
├── routes/
│   ├── seo.js                    # Optimiseur SEO (DeepSeek)
│   ├── mockups.js                 # Générateur de mockups (Replicate)
│   └── videos.js                   # Générateur de vidéos (Runway)
├── lib/
│   ├── fontSetup.js           # Enregistre assets/fonts auprès de fontconfig
│   ├── fonts.js                # Registre des polices disponibles
│   ├── store.js                 # API de stockage commune (dispatch JSON/Postgres)
│   ├── storeJson.js              # Backend fichier JSON local (repli dev)
│   ├── storePostgres.js           # Backend PostgreSQL (actif si DATABASE_URL)
│   ├── auth.js                     # Inscription / connexion / sessions
│   ├── uploads.js                 # Upload d'images (multer + normalisation sharp)
│   ├── imageCompose.js             # Moteur de composition texte-sur-image
│   ├── perspectiveWarp.js           # Déformation en perspective (corner-pin)
│   ├── etsyClient.js                 # Client OAuth2/API Etsy Open API v3
│   ├── deepseekClient.js              # Client API DeepSeek (SEO)
│   ├── replicateClient.js              # Client API Replicate (mockups)
│   ├── runwayClient.js                  # Client API Runway (vidéos)
│   ├── stripeClient.js                   # Client Stripe (SDK officiel)
│   ├── billing.js                         # Middleware requirePro + isPro()
│   ├── stripeWebhookHandler.js             # Traite checkout/subscription.*
│   └── quotas.js                            # Quotas quotidiens par vendeur (garde-fou coûts IA)
├── assets/fonts/               # Polices embarquées (SIL OFL)
├── public/                     # Frontend statique (HTML/CSS/JS, sans framework)
│   ├── index.html               # Landing + connexion/inscription
│   ├── dashboard.html            # Templates + file d'aperçus à envoyer
│   ├── template.html              # Éditeur de template (zone + aperçu live)
│   ├── seo.html, mockups.html, videos.html  # Outils IA
│   ├── common.js, style.css
├── data/                        # Généré au runtime (JSON + images), non versionné
├── .env.example
└── package.json
```

## Abonnement Pro (Stripe)

Modèle économique à deux niveaux :

- **Gratuit** : configurateur de personnalisation illimité (templates,
  aperçus de commande) — sans coût d'API, reste gratuit indéfiniment.
- **Pro** (abonnement récurrent) : déverrouille les 3 outils IA (SEO,
  mockups, vidéos), qui ont un vrai coût d'API par utilisation.

Comme les autres intégrations, **le paywall reste inactif tant que Stripe
n'est pas configuré** — en développement ou tant que vous n'avez pas mis en
place la facturation, les outils IA restent ouverts à tout compte connecté
(protégés uniquement par les quotas quotidiens).

### Mise en place

1. Sur le [dashboard Stripe](https://dashboard.stripe.com/), créez un
   produit avec un prix récurrent (mensuel) → copiez l'ID du prix
   (`price_...`).
2. Récupérez votre clé secrète (`sk_...`) dans **Développeurs > Clés API**.
3. Renseignez `STRIPE_SECRET_KEY` et `STRIPE_PRICE_ID` dans `.env` (ou dans
   Environment sur Render).
4. **Développeurs > Webhooks** → ajoutez un endpoint pointant vers
   `https://votre-domaine/api/stripe/webhook`, évènements à sélectionner :
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Copiez le secret de signature
   (`whsec_...`) dans `STRIPE_WEBHOOK_SECRET`.
5. Depuis `/billing.html`, un vendeur clique sur « Passer Pro » → redirigé
   vers Stripe Checkout (hébergé par Stripe, aucune donnée bancaire ne
   transite par notre serveur) → le webhook met à jour son statut
   automatiquement. « Gérer mon abonnement » ouvre le Customer Portal
   Stripe (annulation, moyen de paiement, factures).

### ⚠️ Point d'attention technique

Le webhook (`POST /api/stripe/webhook`) est déclaré dans `server.js`
**avant** `express.json()` et utilise `express.raw()` : Stripe exige le
corps brut de la requête pour vérifier la signature. Ne pas déplacer cette
route après le middleware JSON global, la vérification de signature
échouerait systématiquement.

## Sécurité et protection des coûts

- **Quotas IA quotidiens par vendeur** (`lib/quotas.js`) : chaque outil payant
  (SEO, mockups, vidéos) a une limite de générations/jour configurable
  (`SEO_DAILY_LIMIT`, `MOCKUP_DAILY_LIMIT`, `VIDEO_DAILY_LIMIT`) — protège
  contre un dérapage de facture (compte piraté, script, clic répété), en
  particulier pour les vidéos (plusieurs $ par génération). Retourne une
  erreur 429 claire une fois la limite atteinte.
- **Longueur des prompts plafonnée** côté serveur (description SEO,
  prompts mockups/vidéos) pour limiter le coût par appel.
- **Protection anti-brute-force** sur `/api/signup` et `/api/login`
  (`express-rate-limit`, 20 tentatives / 15 min / IP).
- **Cookies de session sécurisés en production** (`secure: true`,
  `trust proxy` activé) dès que `NODE_ENV=production` — déjà positionné
  automatiquement par `render.yaml`.

## Ce qui manque avant un vrai lancement commercial

- **Sécurité webhook Etsy** : la vérification de signature n'est pas encore
  implémentée sur `POST /api/etsy/webhook` (le webhook Stripe, lui, vérifie
  bien sa signature — voir section Stripe ci-dessus).
- **Etsy Commercial Access** : à demander dès que le produit est validé par
  les premiers utilisateurs en mode manuel (voir stratégie de lancement).

## Limites connues

- Le glisser-déposer de la zone de texte dans l'éditeur ne gère pas encore
  le tactile (souris uniquement).
- Le mode fichier JSON (sans `DATABASE_URL`) reste mono-process : pas
  adapté si vous faites tourner plusieurs instances du serveur en
  parallèle. Avec Postgres configuré, ce n'est plus une limite.
