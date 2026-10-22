# Wallabag

Reliez Gladys à [Wallabag](https://wallabag.org), l'application libre de
lecture différée : suivez vos articles non lus et leur temps de lecture,
réagissez quand un article est enregistré ou lu, enregistrez un lien depuis une
scène, et affichez les derniers non lus sur le tableau de bord.

Testée avec un vrai Wallabag 2.6.14 (l'image Docker officielle). Vos retours
sont les bienvenus sur le forum Gladys.

## Prérequis

- Gladys Assistant 5.1 ou plus.
- Wallabag 2, auto-hébergé ou le service hébergé
  [wallabag.it](https://wallabag.it), joignable depuis la machine de Gladys.
- Un client d'API : dans Wallabag, ouvrez **Gestion des clients API → Créer un
  nouveau client** (un nom suffit), puis notez son **ID client** et son
  **secret client**.
- Votre nom d'utilisateur et votre mot de passe Wallabag : l'API de Wallabag
  les demande pour se connecter (OAuth2). L'intégration voit les articles de
  cet utilisateur.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Dans **Adresse de Wallabag**, saisissez l'adresse du serveur, par exemple
   `192.168.1.50:8080`, ou une adresse complète comme
   `https://wallabag.example.org` ou `https://app.wallabag.it`.
3. Collez l'**ID client** et le **secret client**, puis votre **nom
   d'utilisateur** et votre **mot de passe**.
4. Facultatif : **Lire Wallabag toutes les** (5 minutes par défaut).
5. Cliquez sur **Tester la connexion** : elle affiche l'utilisateur, les
   articles non lus, leur temps de lecture et les favoris.
6. Ouvrez l'onglet **Découverte** et ajoutez l'appareil **Wallabag**.

Le mot de passe sert à obtenir un jeton de connexion, renouvelé toutes les
heures sans le redemander ; il n'est jamais écrit dans les journaux.

## Appareil

**Wallabag**, quatre valeurs gardées dans l'historique :

- _Articles non lus_ : la liste « Non lus » de Wallabag.
- _Articles favoris_ : la liste « Favoris » (lus ou non).
- _Lus aujourd'hui_ : les articles marqués comme lus (archivés) depuis minuit,
  à l'heure de Gladys.
- _Temps de lecture (non lus)_ : la somme des temps de lecture estimés par
  Wallabag pour les articles non lus, en minutes. Au-delà de 2 000 articles non
  lus, le reste est estimé d'après la moyenne.

Les valeurs sont lues toutes les quelques minutes (le réglage ci-dessus) et
juste après chaque modification faite depuis Gladys.

## Widget du tableau de bord

**Wallabag** : le nombre d'articles non lus, leur temps de lecture, les
articles lus aujourd'hui, les six derniers articles enregistrés et pas encore
lus (site, temps de lecture, tags, étoile des favoris, liens vers l'article et
vers Wallabag quand ils sont en https), et un bouton **Actualiser** qui relit
Wallabag tout de suite. Réglé sur un tag (par exemple `cuisine` sur la
tablette de la cuisine), le widget n'affiche que les articles non lus de ce
tag.

## Déclencheurs de scène

- **Nouvel article** : un article a été enregistré dans Wallabag (depuis
  l'extension du navigateur, l'application mobile ou une scène).
- **Article archivé** : un article a été marqué comme lu (archivé).

Les deux ont un filtre facultatif, le **site** (le domaine de l'article,
exactement comme Wallabag l'affiche, par exemple `www.lemonde.fr`), et
transmettent : titre, lien, site, tags (séparés par des virgules), temps de
lecture en minutes, favori, identifiant de l'article.

Rien ne se déclenche à la première lecture après l'installation. Au plus 10
articles de chaque sorte sont annoncés par lecture (un import en masse n'envoie
pas des centaines de messages).

## Actions de scène

- **Enregistrer un lien dans Wallabag** : une adresse web (ou une variable qui
  en contient une) et des tags facultatifs, séparés par des virgules. Wallabag
  récupère la page avant de répondre, ce qui peut prendre quelques secondes.
  Un lien déjà enregistré n'est pas dupliqué : il reçoit les nouveaux tags.
  Résultats : identifiant de l'article, titre, site, temps de lecture, déjà
  enregistré avant.
- **Marquer un article Wallabag comme lu** : l'identifiant de l'article (par
  exemple celui donné par un déclencheur) ou son adresse. Résultats :
  identifiant et titre.
- **Lire les titres non lus de Wallabag** : les articles enregistrés le plus
  récemment et pas encore lus (1 à 10), de tous les tags ou d'un seul.
  Résultats : nombre lu, articles non lus en tout, titres un par ligne
  (« Titre — site »), leur temps de lecture, titre, lien et identifiant du plus
  récent.

## Exemples de scènes

- **Lecture du soir** : à 21 h, _Lire les titres non lus de Wallabag_ (3
  articles), puis envoyer un message avec son résultat _Titres_ et _Leur temps
  de lecture_ (à insérer avec le sélecteur de variables).
- **Garder une recette** : un déclencheur d'une autre intégration qui donne un
  lien (un message reçu, un flux RSS) → _Enregistrer un lien dans Wallabag_
  avec le tag `cuisine` ; le widget de la cuisine, réglé sur ce tag, l'affiche.
- **Objectif de lecture** : _Article archivé_ → si _Lus aujourd'hui_ vaut 5,
  envoyer « Objectif du jour atteint ».

## Dépannage

- **« Wallabag a refusé le client d'API »** : l'ID ou le secret client est
  faux, ou le client a été supprimé : créez-en un nouveau.
- **« Wallabag a refusé le nom d'utilisateur ou le mot de passe »** : vérifiez
  vos identifiants en vous connectant à Wallabag. Un compte qui se connecte par
  un fournisseur externe n'a pas de mot de passe utilisable par l'API.
- **« Wallabag ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys. Derrière un reverse proxy, saisissez l'adresse complète,
  chemin compris.
- **« Cette adresse ne répond pas comme Wallabag »** : l'adresse mène à un
  autre service, ou à une page de connexion (un proxy d'authentification devant
  Wallabag doit laisser passer `/oauth/v2/token` et `/api/`).
- **Un article enregistré sans titre** : Wallabag n'a pas pu récupérer la page
  (site injoignable depuis le serveur Wallabag, page protégée). C'est le
  comportement de Wallabag lui-même.
- Plus de détails : réglez la variable `LOG_LEVEL` de l'intégration sur
  `debug`.

## Limites

- Le filtre des déclencheurs ne compare que des valeurs exactes : un site,
  pas un tag (un article en porte plusieurs ; les tags sont transmis en
  variable).
- Les annotations, le contenu des articles et les favoris ne se gèrent pas
  depuis Gladys.
- Wallabag ne prévient pas : un article est annoncé à la lecture suivante de
  l'intégration (5 minutes par défaut). Chaque lecture fait quelques petites
  requêtes, sans le contenu des articles ; wallabag.it ne publie pas de quota.
- Les liens du widget n'ouvrent que des adresses https.
- Sans lien avec Wallabag.
