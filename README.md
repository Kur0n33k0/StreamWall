# StreamWall — Regardez plusieurs streams en même temps

Réimplémentation 100 % front-end (HTML / CSS / JavaScript, sans backend) du
projet [bhamrick/multitwitch](https://github.com/bhamrick/multitwitch), qui
permettait à l'origine de regarder plusieurs streams Twitch en simultané sur
une seule page.

Contrairement à l'original (application Python/Pyramid nécessitant un
serveur applicatif), cette version est un **site statique** : elle
fonctionne sur n'importe quel hébergeur de fichiers statiques, sans base de
données ni processus serveur.

## Sommaire

1. [Fonctionnalités](#fonctionnalités)
2. [Structure du projet](#structure-du-projet)
3. [Fonctionnement technique](#fonctionnement-technique)
4. [Lancer le projet en local](#lancer-le-projet-en-local)
5. [Déploiement](#déploiement)
6. [Le paramètre `parent` de Twitch (point critique)](#le-paramètre-parent-de-twitch-point-critique)
7. [Personnalisation](#personnalisation)
8. [Limitations connues](#limitations-connues)
9. [Licence](#licence)

## Fonctionnalités

- Affichage d'un nombre illimité de streams Twitch côte à côte, dans une
  grille **dimensionnée dynamiquement** pour occuper le maximum d'espace
  disponible, quel que soit le nombre de streams — **sans jamais de
  défilement (scroll)**, même avec un seul stream affiché.
- **Gestion des streams par cases à cocher** : une chaîne ajoutée reste
  connue de l'application. Elle apparaît dans la fenêtre "Changer les
  streams" avec une case à cocher : cochée, elle est affichée dans la
  grille ; décochée, elle est retirée de la grille mais reste dans la
  liste pour être recochée plus tard sans avoir à retaper son nom. Un
  bouton « × » à côté de chaque chaîne permet de l'oublier définitivement.
- **Mode "Réorganiser"** (bouton dédié dans le menu) : affiche/masque
  l'en-tête de chaque lecteur (poignée de glisser-déposer, nom de la
  chaîne, bouton « × » de retrait rapide) ainsi qu'une **tuile "+"** de la
  même taille qu'un lecteur, qui ouvre la fenêtre "Changer les streams".
  En dehors de ce mode, seules les vidéos sont visibles, pour un
  visionnage sans distraction. **C'est aussi, avec le bouton de l'état
  vide, le seul moyen d'ouvrir la fenêtre "Changer les streams"** : il
  n'y a plus de bouton "Changer les streams" séparé dans le menu.
- **Réorganisation par glisser-déposer** (en mode Réorganiser) : on
  attrape n'importe quel point d'un lecteur (pas seulement son en-tête) et
  on le fait glisser sur un autre pour échanger leur position.
  **Alternative clavier** : une fois l'en-tête d'un lecteur focalisé (Tab),
  les **4 flèches** le déplacent dans l'ordre d'affichage — haut/gauche
  pour avancer d'un cran, bas/droite pour reculer d'un cran (la grille
  n'ayant pas un nombre de colonnes fixe, il n'y a qu'un seul axe de
  réorganisation, pas une notion stable de "case du dessus").
- **Mise en avant d'un stream** (bouton étoile ☆/★ dans l'en-tête d'un
  lecteur, mode Réorganiser) : ce stream occupe alors **exactement le
  quart supérieur gauche** de la zone vidéo, pendant que tous les autres
  se redisposent automatiquement en "L" tout autour (à sa droite, puis en
  dessous sur toute la largeur) dans les trois quarts restants — sans
  jamais nécessiter de scroll, comme le reste de la grille. Un seul
  stream peut être mis en avant à la fois ; cliquer à nouveau sur son
  étoile l'enlève. C'est aussi lui qui démarre avec le son. Cette mise en
  avant n'a d'effet que s'il reste au moins un autre stream visible :
  seul à l'écran, un stream utilise toute la place, quel que soit son
  statut.
- **Bascule thème sombre / clair**, via une icône tout à droite du menu
  (thème sombre par défaut).
- Panneau de **chat Twitch** avec sélection de la chaîne à afficher, et
  bouton pour l'afficher/masquer.
- **Validation à l'ajout** : un nom de chaîne vide, contenant des
  caractères invalides, ou de longueur incorrecte est refusé immédiatement
  dans la modale, avec un message explicite — sans attendre l'écran
  d'erreur générique du lecteur Twitch.
- **Dispositions favorites ("presets")** : la combinaison de streams
  actuellement affichée peut être enregistrée sous un nom, pour être
  rappelée en un clic depuis la modale "Changer les streams", sans avoir
  à recocher chaque chaîne une à une. Sauvegardées en `localStorage`.
  Chaque disposition a aussi son propre **bouton de partage** (icône
  lien) : il copie dans le presse-papiers un lien pointant vers SES
  chaînes à elle, indépendamment de ce qui est affiché à l'instant t —
  pas de bouton "Copier le lien" global dans le menu.
- Menu **"Réorganiser" / "Afficher-Masquer le chat" / thème**, positionné
  en haut à droite de la page (pas de bouton "Changer les streams" dans
  le menu : voir le point sur le mode Réorganiser ci-dessus ; pas de
  bouton "Copier le lien" non plus : voir le point sur les dispositions
  favorites).
- Interface reprenant le **code couleur officiel de Twitch.tv** (violet
  `#9147FF` dans les deux thèmes), sans logo ni favicon Twitch.
- Les chaînes actuellement **affichées** sont encodées dans **l'URL**
  (`#chaine1/chaine2/...`), ce qui permet de partager un lien direct vers
  une composition de streams précise.
- La disposition complète (chaînes connues et leur statut, mode
  Réorganiser, thème, visibilité du chat, chaîne de chat sélectionnée,
  dispositions favorites) est sauvegardée en `localStorage` pour être
  restaurée à la prochaine visite.

## Structure du projet

```
streamwall/
├── index.html          Page unique de l'application (structure HTML)
├── css/
│   └── style.css        Feuille de style (thèmes, grille, drag&drop, modale)
├── js/
│   └── app.js            Toute la logique applicative, abondamment commentée
└── README.md            Cette documentation
```

Il n'y a **aucune étape de build** (pas de Webpack/Vite/npm install) : les
fichiers sont servis tels quels par n'importe quel serveur HTTP statique.

## Fonctionnement technique

### 1. Affichage des streams : le SDK officiel Twitch

Le fichier `index.html` charge le script officiel fourni par Twitch :

```html
<script src="https://embed.twitch.tv/embed/v1.js" defer></script>
```

Ce script expose un objet global `window.Twitch` avec le constructeur
utilisé dans `app.js` pour la vidéo :

- `Twitch.Player` : un lecteur vidéo autonome (utilisé pour chaque stream
  de la grille).

Comme le script est chargé avec l'attribut `defer`, `app.js` attend sa
disponibilité via la fonction utilitaire `whenTwitchReady()` avant de
créer le moindre lecteur.

**Optimisation : une seule scrutation, pas une par lecteur.** Au premier
chargement avec plusieurs streams déjà configurés, `renderPlayersGrid()`
appelle `mountPlayer()` — donc `whenTwitchReady()` — pour chacun d'entre
eux d'un coup, alors que le SDK n'est presque jamais encore prêt à cet
instant. Une implémentation naïve démarrerait un `setInterval` **par
appel**, chacun vérifiant indépendamment exactement la même condition
(`window.Twitch && window.Twitch.Player`) toutes les 50ms — N streams,
N minuteurs redondants. `whenTwitchReady()` mutualise plutôt tous les
callbacks en attente (`pendingTwitchReadyCallbacks`) derrière **une
seule** scrutation partagée, qui les déclenche tous d'un coup dès que le
SDK devient disponible. Elle abandonne aussi au bout de
`TWITCH_READY_MAX_ATTEMPTS` tentatives (~30s) avec un avertissement en
console, pour ne pas scruter indéfiniment si le script ne se charge
jamais (bloqueur de publicité, coupure réseau) — un futur appel (ex.
ajout d'une nouvelle chaîne) relance une scrutation normalement.

Deux `<link rel="preconnect">` dans `<head>` (vers `embed.twitch.tv` et
`www.twitch.tv`) établissent par ailleurs la connexion réseau (DNS +
TLS) vers ces domaines dès le tout début du chargement de la page,
avant même que le SDK ou la première iframe ne l'exigent réellement —
un gain de latence classique pour des domaines systématiquement
utilisés par la page.

> ⚠️ Le SDK `embed/v1.js` **ne fournit pas de constructeur JS pour un
> chat autonome** : il n'existe pas de `Twitch.Chat` dans l'API
> officielle (seuls `Twitch.Player` et `Twitch.Embed`, ce dernier
> combinant vidéo + chat dans une unique iframe, sont exposés). Une
> précédente version de ce projet appelait à tort `new Twitch.Chat(...)`,
> ce qui levait une exception dès la création et empêchait **tout**
> affichage du chat, quelle que soit la chaîne sélectionnée. Voir la
> section [Panneau de chat](#10-panneau-de-chat--iframe-directe-et-non-sdk-js)
> ci-dessous pour la méthode correcte.

### 2. Modèle de données : chaînes connues vs chaînes visibles

Tout l'état des streams repose sur un seul tableau, `state.entries`, où
chaque élément a la forme :

```js
{ name: "zerator", visible: true }
```

- **Ajouter** une chaîne (champ + bouton "Ajouter" de la modale) crée une
  nouvelle entrée avec `visible: true`, ou repasse à `true` une entrée
  existante qui avait été décochée.
- **Cocher / décocher** une case dans la modale (ou cliquer sur le « × »
  d'une carte en mode Réorganiser, qui décoche silencieusement) modifie
  uniquement le champ `visible` de l'entrée correspondante — l'entrée
  elle-même n'est jamais supprimée.
- **Oublier** une chaîne (bouton « × » à côté de son nom dans la modale)
  supprime définitivement son entrée du tableau.

La grille de lecteurs, le sélecteur de chat et le hash de l'URL sont tous
**dérivés** de ce tableau via la fonction `getVisibleChannels()`. Voir
`applyEntriesChange()` dans `app.js`, qui centralise la mise à jour de
toute l'interface après chaque modification.

### 3. Le mode "Réorganiser" et la tuile "+"

Chaque carte de lecteur contient toujours, dans le DOM, un en-tête avec sa
poignée de glisser-déposer, le nom de la chaîne et un groupe d'actions
(`.player-card-actions`) réunissant le bouton "mettre en avant" (☆/★, voir
section 5) et le bouton « × », ainsi qu'un overlay `.player-card-dragzone`
couvrant toute la tuile (voir section 7 ci-dessous pour son rôle). Ces
deux éléments sont positionnés en **overlay absolu par-dessus la vidéo**
(`position: absolute` dans `css/style.css`) et **masqués par défaut**,
pour une expérience de visionnage sans distraction et sans jamais changer
la taille de la tuile (voir aussi la section sur la grille dynamique
ci-dessous : les afficher ne doit jamais faire "pousser" la vidéo ni
casser le calcul de mise en page).

Le bouton **"Réorganiser"** du menu bascule un booléen
`state.reorderMode`, qui ajoute/retire la classe CSS `reorder-mode` sur la
grille (`#players-grid`) :

```css
.players-grid.reorder-mode .player-card-header  { display: flex; }
.players-grid.reorder-mode .player-card-dragzone { display: block; }
.players-grid.reorder-mode .add-tile             { display: flex; }
```

- La première règle affiche l'en-tête de chaque lecteur (et donc la
  poignée de drag et le bouton « × », utilisables uniquement dans ce
  mode).
- La deuxième affiche l'overlay de glisser-déposer par-dessus toute la
  tuile, pour pouvoir démarrer le drag depuis la vidéo elle-même (voir
  section 7).
- La troisième affiche la **tuile "+"** (`#add-tile` dans `index.html`), une
  case de la même taille qu'un lecteur (elle partage la classe
  `.player-card`), avec un gros "+" centré. Un clic dessus ouvre la
  fenêtre "Changer les streams" — c'est, avec le bouton de l'état vide
  (`#btn-empty-add`), le seul point d'entrée vers cette fenêtre : il n'y
  a pas de bouton "Changer les streams" dans le menu. La fonction
  `renderPlayersGrid()` la replace systématiquement en dernière position
  de la grille à chaque rendu, et elle est comptée comme une tuile à part
  entière dans le calcul de disposition (voir section suivante) tant que
  le mode Réorganiser est actif.

### 4. Grille dynamique : remplissage maximal, jamais de scroll

C'est le cœur du correctif demandé pour que "les vignettes prennent
toujours le plus de place possible" et qu'"il n'y ait jamais de scroll",
y compris avec un seul stream affiché.

**Le problème avec une grille CSS classique** (`grid-template-columns:
repeat(auto-fit, minmax(420px, 1fr))` avec `aspect-ratio: 16/9` sur les
cartes, utilisé dans une version précédente) : la largeur des colonnes est
déterminée par la largeur du conteneur, puis la hauteur de chaque carte en
découle via son ratio d'aspect. Rien ne garantit que cette hauteur calculée
tienne dans la hauteur du conteneur — avec un seul stream par exemple, la
carte pouvait être bien plus haute que l'écran, provoquant un défilement.

**La solution retenue** : la grille n'a plus de `grid-template-columns` ni
`grid-template-rows` fixés en CSS. À la place, `js/app.js` calcule à
l'exécution, pour le nombre de tuiles à afficher et l'espace réellement
disponible (largeur ET hauteur), le nombre de colonnes et de lignes qui
se rapproche le plus d'une disposition au format 16:9 par tuile. C'est le
rôle de la fonction `computeBestGrid()` :

```js
function computeBestGrid(containerWidth, containerHeight, itemCount, gap, aspectRatio) {
  // Pour chaque nombre de colonnes possible (1 à itemCount), calcule le
  // nombre de lignes nécessaires et la taille qu'aurait une tuile 16:9
  // dans la cellule résultante, et retient la disposition (cols, rows)
  // donnant la plus grande tuile SIMULÉE — un bon indicateur de la
  // disposition la plus proche d'une vraie grille vidéo.
}
```

**Remplir 100% de la page, pas seulement "le plus possible".** Une
première version de cet algorithme appliquait la taille de tuile simulée
ci-dessus telle quelle, en pixels exacts, puis centrait la grille avec
`justify-content`/`align-content`. Problème : dès que le ratio
(colonnes×lignes) ne correspondait pas exactement au ratio du conteneur,
il restait des bandes vides sur les côtés (ou en haut/bas) de la page
entière — par exemple deux tuiles côte à côte contraintes à 16:9 chacune
laissent souvent une marge verticale ou horizontale si la fenêtre n'a pas
exactement le bon rapport largeur/hauteur.

La version actuelle applique `computeBestGrid()`/`computeFeaturedGrid()`
différemment : seuls `cols`/`rows` (le NOMBRE de colonnes/lignes choisi)
sont utilisés, appliqués en unités **`fr`** plutôt qu'en pixels exacts :

```js
el.playersGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
el.playersGrid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
```

Avec des pistes `fr`, CSS Grid répartit tout l'espace disponible (une
fois les `gap` déduits) à parts strictement égales entre les colonnes/
lignes : la grille remplit donc **toujours exactement 100%** de la
largeur et de la hauteur de son conteneur, quel que soit le nombre de
tuiles — impossible d'avoir la moindre marge résiduelle à l'échelle de la
page. Si la cellule obtenue n'est pas exactement 16:9 (le rapport
largeur/hauteur du conteneur ne tombe pas toujours juste), ce n'est plus
la page qui affiche des bandes vides : c'est le lecteur Twitch **lui-même**,
à l'intérieur de sa propre iframe, qui applique un éventuel lettrboxing —
comportement standard de n'importe quel lecteur vidéo embarqué, et un
compromis largement préférable à de l'espace perdu sur toute
l'application. `computeBestGrid()` continue de choisir le nombre de
colonnes/lignes le plus proche d'un ratio 16:9 (via la simulation
ci-dessus), précisément pour minimiser ce lettrboxing interne.

Ce recalcul est déclenché :

- après chaque ajout/suppression/case cochée-décochée (le nombre de tuiles
  change) ;
- après chaque bascule du mode Réorganiser (la tuile "+" s'ajoute ou se
  retire du calcul) ;
- après chaque bascule du panneau de chat (la largeur disponible pour la
  grille change) ;
- après chaque mise en avant/retrait d'un stream (voir section 5 : le
  calcul change entièrement de méthode, voir `computeFeaturedGrid()`) ;
- à chaque redimensionnement, détecté via un **`ResizeObserver`** posé sur
  `#players-grid` (plus fiable qu'un simple écouteur `resize` sur
  `window`, car il détecte aussi les changements de taille internes à la
  page, comme l'apparition du panneau de chat, sans dépendre d'un
  redimensionnement de la fenêtre elle-même).

`#players-grid` reste en `overflow: hidden` de façon définitive : comme
les pistes `fr` remplissent toujours exactement l'espace disponible,
aucun contenu ne devrait jamais déborder.

**Optimisation : une seule liste de chaînes visibles par rendu.**
`getVisibleChannels()` refiltre `state.entries` à chaque appel. Or un
rendu complet (`renderPlayersGrid()`) a besoin de cette liste à plusieurs
endroits : pour placer les cartes, pour savoir si la mise en avant doit
s'appliquer (`isFeatureSplitActive()`), et pour dimensionner la grille
(`applyGridLayout()`). Plutôt que de laisser chaque fonction rappeler
`getVisibleChannels()` de son côté (jusqu'à 4 refiltrages du même tableau
pour un seul rendu), `isFeatureSplitActive(visibleChannels)` et
`applyGridLayout(visibleChannels)` acceptent toutes deux un paramètre
optionnel : `renderPlayersGrid()` calcule la liste UNE fois et la
propage aux deux. Le paramètre reste optionnel (repli sur
`getVisibleChannels()` si omis) car `applyGridLayout()` est aussi
appelée sans liste sous la main depuis `scheduleGridLayout()`
(redimensionnement, bascule du panneau de chat) — même principe déjà
appliqué à `startsUnmuted` dans `mountPlayer()` (calculé une fois par
`renderPlayersGrid()` et transmis, plutôt que recalculé à l'intérieur).

### 5. Mise en avant d'un stream (quart supérieur gauche, autres en "L" autour)

Un clic sur l'étoile (☆/★) de l'en-tête d'un lecteur, en mode
Réorganiser, le "met en avant" : il occupe alors le **quart supérieur
gauche** de la grille, et tous les autres streams se redisposent
automatiquement dans les trois quarts restants (en forme de "L" : à sa
droite, puis en dessous sur toute la largeur).

**Pourquoi pas une simple colonne à 25% ?** Une première version de cette
fonctionnalité réservait 25% de la LARGEUR sur toute la hauteur à la
tuile mise en avant (une colonne de gauche, façon barre latérale). Ça
donnait bien 25% de l'aire, mais pas du tout la disposition demandée :
la tuile occupait tout un côté au lieu d'un unique coin, et les autres
tuiles restaient cantonnées dans les 75% de droite plutôt que d'entourer
la vedette des deux côtés (droite ET dessous). D'où la version actuelle,
en quadrants.

**Une seule grille, pas deux zones.** Contrairement à l'ancienne version,
`#players-grid` reste une grille CSS **unique** contenant toutes les
cartes (y compris la vedette) — pas de conteneurs séparés. C'est
`grid-column`/`grid-row` (posés en JS, en style inline, sur la carte
vedette seulement) qui lui font occuper plusieurs cases, combinés à
l'auto-placement natif de CSS Grid pour les autres :

```css
.players-grid {
  display: grid;
  grid-auto-flow: row dense; /* comble les cases libres autour de la vedette */
  /* ... */
}
```

**Le calcul : `computeFeaturedGrid()`.** La grille est divisée en `cols`
colonnes × `rows` lignes, **toujours PAIRES**, et la tuile vedette occupe
le bloc `cols/2` × `rows/2` ancré en haut à gauche :

```js
featuredCard.style.gridColumn = `1 / span ${layout.cols / 2}`;
featuredCard.style.gridRow = `1 / span ${layout.rows / 2}`;
```

Comme `cols` et `rows` sont paires, ce bloc fait par construction
EXACTEMENT `(cols/2 × rows/2) / (cols × rows) = 1/4` de la grille —
**toujours 25% de l'aire**, quel que soit le nombre d'autres streams (ce
n'est donc pas un simple "gros bloc de 2×2 cases", dont la proportion
varierait avec la taille de la grille : l'algorithme choisit `cols`/`rows`
précisément pour que la moitié de chaque dimension corresponde à ce
qu'occupe la vedette). Le reste — `cols*rows - (cols/2)*(rows/2)`, soit
`cols*rows*3/4` cases — doit suffire à accueillir les autres tuiles ; la
fonction cherche, parmi tous les couples (cols, rows) pairs satisfaisant
cette contrainte, celui qui donne la plus grande taille de case (même
stratégie gloutonne que `computeBestGrid()`, section 4, dont c'est une
variante).

Comme pour la grille classique (section 4), `cols`/`rows` sont appliqués
en unités **`fr`** (`repeat(cols, 1fr)`), pas en pixels exacts : chaque
colonne/ligne se partage l'espace réellement disponible à parts égales,
donc le bloc `cols/2 × rows/2` de la vedette occupe très exactement 25%
de la surface RÉELLEMENT rendue (pas d'un calcul simulé arrondi au
pixel), et le reste de la grille remplit intégralement les 75% qui
restent, sans aucune marge résiduelle sur les côtés.

**Le "L" est géré par le navigateur, pas par du JS.** Aucune case n'est
positionnée individuellement pour les tuiles "autres" : elles n'ont
AUCUN `grid-column`/`grid-row` explicite. `grid-auto-flow: row dense`
suffit : le navigateur parcourt la grille ligne par ligne, saute les
cases déjà occupées par le bloc vedette, et y place chaque tuile "autre"
dans l'ordre du DOM. Concrètement, pour une grille 4×4 avec la vedette en
haut-gauche (2×2) : la 1ʳᵉ tuile "autre" atterrit en haut à droite, la
suivante juste en dessous, puis le navigateur continue sur toute la
largeur de la 3ᵉ ligne, etc. — exactement la disposition en "L" demandée,
sans qu'une seule ligne de JS n'ait eu à raisonner sur des coordonnées
2D. `applyGridLayout()` (dans `app.js`) efface systématiquement tout
`grid-column`/`grid-row` résiduel sur CHAQUE carte avant de repositionner
la vedette actuelle, pour qu'un ancien stream mis en avant ne reste pas
figé en grand format une fois qu'un autre a pris sa place.

**Cases vides possibles avec peu de streams.** Avec très peu de streams
"autres" (1, 2 ou 3, avec les nombres par défaut de l'algorithme), la
grille minimale (2×2) laisse déjà 3 cases pour eux : certaines peuvent
donc rester vides visuellement (ex. avec un seul autre stream, sur les 3
cases disponibles à côté de la vedette, une seule est utilisée). C'est
une conséquence assumée du découpage en quadrants fixes plutôt qu'un
bug : la structure 1/4 + 3/4 est fixe, elle ne se contracte pas pour
"économiser" de l'espace quand il y a peu de contenu à côté.

**Un seul stream à la fois, et seulement si ça a un sens.**
`state.featuredChannel` mémorise la chaîne mise en avant (ou `null`).
`isFeatureSplitActive()` détermine si le découpage en quadrants doit
réellement s'appliquer :

```js
function isFeatureSplitActive() {
  const visible = getVisibleChannels();
  return Boolean(state.featuredChannel)
    && visible.includes(state.featuredChannel)
    && visible.length > 1;
}
```

La dernière condition (`visible.length > 1`) évite un cas dégénéré :
si le stream mis en avant est le SEUL stream affiché, réserver un quart
pour lui et laisser les trois autres vides n'aurait aucun sens — il
utilise alors toute la surface disponible, comme en l'absence de mise en
avant (retour à `computeBestGrid()` classique).

**Le son.** C'est le stream mis en avant qui démarre avec le son (plutôt
que "le premier stream visible", la règle utilisée en l'absence de mise
en avant) : sans ça, rien ne garantirait que le stream choisi pour être
regardé en grand soit celui qu'on entend (voir `renderPlayersGrid()`).

**Interaction avec le glisser-déposer.** Comme la position de la carte
vedette dans la grille est posée EXPLICITEMENT par nom de chaîne (et non
déduite de sa position dans le DOM), réordonner les chaînes par
glisser-déposer ou au clavier (section 7) n'a aucune incidence sur elle :
`reorderChannels()` n'a besoin d'aucun traitement spécial pour la carte
mise en avant, contrairement à la première version de cette
fonctionnalité (qui devait la faire "sortir"/"rentrer" d'un conteneur
dédié après un glisser-déposer).

### 6. Routage par hash d'URL

Seules les chaînes **visibles** (cochées) sont encodées dans le **hash**
de l'URL (la partie après le `#`), au format :

```
https://votre-domaine.com/#zerator/gotaga/ninja
```

Ce choix (plutôt qu'un chemin d'URL classique) évite toute configuration
de réécriture d'URL côté hébergement : le hash n'est jamais envoyé au
serveur, donc le site fonctionne à l'identique sur un simple hébergement
statique. Voir `readChannelsFromHash()` et `writeChannelsToHash()` dans
`app.js`.

### 7. Glisser-déposer (drag and drop)

Le réordonnancement utilise l'**API HTML5 Drag and Drop native du
navigateur**, sans dépendance externe (voir `attachDragEvents()` et
`reorderChannels()`). Seul le **nœud DOM** de la carte est déplacé lors
d'un réordonnancement : les lecteurs vidéo ne sont jamais recréés, pour
éviter de recharger les flux. Le nombre de tuiles ne changeant pas, la
disposition de la grille (tailles) n'a pas besoin d'être recalculée dans
ce cas.

**Démarrer le drag depuis n'importe quel point de la tuile, pas
seulement l'en-tête.** L'API Drag and Drop natif n'active `dragstart` que
sur l'élément qui porte explicitement `draggable="true"` (ou l'un de ses
enfants directs sans conteneur intermédiaire non-draggable) : au départ,
seul l'en-tête (`.player-card-header`) portait cet attribut, donc on ne
pouvait attraper une carte que par sa fine barre du haut.

Un second problème s'ajoute sur la vidéo elle-même : `.player-card-video`
contient une **iframe** (le lecteur Twitch), c'est-à-dire un tout autre
contexte de navigation, qui capte ses propres évènements souris. Un clic
puis glisser démarré directement sur la vidéo ne remonte donc jamais
jusqu'au document parent, même si on rendait la vidéo elle-même
`draggable`.

La solution retenue est un overlay transparent, `.player-card-dragzone`
(voir `css/style.css`), positionné en `absolute; inset: 0` par-dessus
toute la tuile — y compris la vidéo — mais **sous** l'en-tête
(`z-index: 1` contre `2`), et **masqué en dehors du mode Réorganiser**
comme l'en-tête. Cet overlay appartient au document principal : il capte
donc normalement les évènements souris sur toute la surface de la tuile.
`createPlayerCard()` (dans `app.js`) pose `draggable = true` à la fois
sur l'en-tête et sur cet overlay, et `attachDragEvents(card, [header,
dragZone])` attache les écouteurs `dragstart`/`dragend` aux deux : le
glisser-déposer peut ainsi démarrer aussi bien depuis la barre
supérieure que depuis n'importe quel point du lecteur. Les évènements de
survol et de dépôt (`dragover`/`dragleave`/`drop`), eux, restent posés
sur la carte entière (`card`), donc inchangés par cet ajout.

**Alternative clavier (accessibilité).** Le glisser-déposer natif n'a pas
d'équivalent clavier standard. `.player-card-header` porte donc
`tabindex="0"` (toujours, pas seulement en mode Réorganiser : l'élément
est de toute façon `display: none` hors de ce mode, donc naturellement
exclu de l'ordre de tabulation par le navigateur) et écoute `keydown` sur
les **4 flèches**, via la table `ARROW_KEY_DIRECTIONS` :

```js
const ARROW_KEY_DIRECTIONS = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};
```

Haut et gauche avancent la chaîne d'un cran, bas et droite la reculent
d'un cran, via `moveChannelByKeyboard()`, qui réutilise
`reorderChannels()` avec la chaîne voisine correspondante (donc les
mêmes garde-fous en bout de liste). Toutes les 4 flèches partagent la
même sémantique à un seul axe plutôt que de tenter une navigation
spatiale (haut/bas = ligne, gauche/droite = colonne) : le nombre de
colonnes de la grille change dynamiquement avec la taille de la fenêtre
(voir section 4), donc "la case du dessus" n'est pas une notion stable
d'un redimensionnement à l'autre — mieux vaut un seul ordre linéaire
prévisible, accessible par n'importe quelle flèche. Le focus reste sur
le même en-tête après le déplacement, pour pouvoir enchaîner plusieurs
flèches sans avoir à re-cliquer.

### 8. Thème sombre / clair

Le thème est piloté par un attribut `data-theme` ("dark" ou "light") posé
sur `<html>`, dont dépendent les variables CSS (`css/style.css`) :

```css
html[data-theme="light"] {
  --bg-app: #f7f7f8;
  --text-primary: #0e0e10;
  /* ... */
}
```

Pour éviter un "flash" de thème sombre au chargement si l'utilisateur a
choisi le thème clair lors d'une visite précédente, un **petit script
inline** est exécuté en tout début de `<head>` dans `index.html`, avant le
chargement de la feuille de style : il relit la préférence en
`localStorage` et positionne l'attribut `data-theme` immédiatement.
`app.js` (fonction `applyTheme()`) relit ensuite la même valeur pour
garder `state.theme` synchronisé et gérer le clic sur le bouton de bascule
(icône soleil/lune, tout à droite du menu).

### 9. Persistance

En plus du hash d'URL (qui ne porte que les chaînes visibles), l'état
complet — chaînes connues et leur statut, mode Réorganiser, thème,
visibilité du chat, chaîne de chat sélectionnée, chaîne mise en avant
(section 5) et dispositions favorites — est sauvegardé dans
`localStorage` (voir `persistState()` et `loadInitialState()`).

### 10. Panneau de chat : iframe directe (et non SDK JS)

Comme la vidéo de chaque stream est déjà affichée séparément via
`Twitch.Player` (voir section 1), le panneau de chat n'a besoin
d'afficher que le chat seul. Twitch documente cela comme un **widget de
chat autonome**, intégré via une simple `<iframe>` dont l'URL suit ce
format (voir https://dev.twitch.tv/docs/embed/chat/) :

```
https://www.twitch.tv/embed/<chaine>/chat?parent=<domaine>[&darkpopout]
```

- `parent` (obligatoire) : même règle que pour `Twitch.Player`, voir la
  section sur le [paramètre `parent`](#le-paramètre-parent-de-twitch-point-critique)
  plus bas — calculé dynamiquement via `getParentDomain()`.
- `darkpopout` (optionnel) : bascule le chat Twitch sur son thème sombre.
  Le code n'ajoute ce paramètre que lorsque `state.theme === "dark"`,
  pour rester visuellement cohérent avec le thème de l'application.

Cette URL est construite par `buildChatEmbedUrl()` dans `app.js`, puis
posée comme `src` d'un élément `<iframe>` inséré dans
`#chat-embed-container` par `renderChatOnly()`, qui est appelée :

- à chaque changement de chaîne sélectionnée dans le menu déroulant du
  chat ;
- à chaque ajout/suppression/case cochée-décochée d'une chaîne (le chat
  peut devoir basculer sur une autre chaîne si celle affichée est
  retirée) ;
- à l'affichage/masquage du panneau de chat ;
- à chaque bascule de thème (pour ajouter/retirer `darkpopout`).

`renderChatOnly()` vide d'abord `#chat-embed-container`
(`innerHTML = ""`) avant d'insérer la nouvelle iframe, ce qui détruit et
recrée l'iframe de chat (et donc son état de connexion) à chaque appel —
comportement attendu, comme pour l'ancien code basé sur le SDK.

### 11. Validation du nom de chaîne à l'ajout

`validateChannelName()` (dans `app.js`) vérifie, **avant** tout appel à
`addChannelEntry()`, que la saisie correspond aux règles Twitch (4 à 25
caractères, lettres/chiffres/underscore uniquement — voir
https://help.twitch.tv/s/article/username-faq) et affiche un message
d'erreur précis sous le champ (`#modal-add-error`) sinon, sans jamais
tenter la création d'un lecteur pour un nom manifestement invalide.

Cette fonction fait volontairement double emploi avec
`sanitizeChannelName()` (section 2) : cette dernière reste utilisée telle
quelle pour les chaînes venant du **hash d'URL**, un contexte sans
retour utilisateur possible où corriger silencieusement (en retirant les
caractères invalides) est le seul choix raisonnable. `validateChannelName()`,
elle, ne corrige jamais silencieusement : elle REFUSE et explique,
puisqu'un humain est en train de regarder le formulaire.

> ⚠️ **Limite assumée** : cette validation ne vérifie que le **format**
> du nom, pas qu'un compte Twitch de ce nom existe réellement. Vérifier
> une existence réelle demanderait d'appeler l'API Helix de Twitch, qui
> exige un `Client-Id` (et un jeton applicatif, donc potentiellement un
> `Client Secret`) — impossible à faire proprement sans backend, ce qui
> contredirait l'architecture 100 % statique de ce projet. Un nom bien
> formé mais inexistant affichera donc toujours l'écran d'erreur standard
> du lecteur Twitch une fois ajouté (voir aussi "Limitations connues").

### 12. Dispositions favorites (presets) et partage

Section dédiée dans la modale "Changer les streams" (sous la liste des
chaînes), qui permet d'enregistrer la combinaison de chaînes **visibles**
actuelle sous un nom, puis de la rappeler — ou de la partager — plus
tard en un clic :

- `savePresetFromCurrentState(name)` capture `getVisibleChannels()` (donc
  l'ordre d'affichage courant) sous ce nom. Un nom déjà utilisé (comparé
  sans tenir compte de la casse) **met à jour** le preset existant plutôt
  que d'en créer un doublon.
- `applyPreset(preset)` rend visibles les chaînes du preset (dans son
  ordre), et repasse invisibles — SANS les oublier — les autres chaînes
  actuellement connues, exactement comme décocher une case dans la liste
  (section 2). Une chaîne du preset qui n'a jamais été ajoutée est créée
  à la volée.
- Chaque ligne de la liste a aussi un **bouton de partage** (icône lien,
  `.modal-preset-share`), qui copie dans le presse-papiers un lien
  pointant vers LES CHAÎNES DU PRESET, pas forcément celles affichées à
  l'instant t. `buildPresetShareUrl(channels)` reconstruit l'URL à partir
  de `location.origin` + `location.pathname` + un hash `#chaine1/chaine2/...`
  (même format que `writeChannelsToHash()`, section 6) — **et non** de
  `location.href`, précisément pour ignorer le hash courant et ne
  refléter que les chaînes du preset. Il n'y a donc **pas** de bouton
  "Copier le lien" global dans le menu : partager "ce qui est affiché
  maintenant" passe par enregistrer un preset (même éphémère) puis
  cliquer sur son bouton de partage.
- Stockées dans `localStorage` (`STORAGE_KEY_PRESETS`), donc propres à ce
  navigateur — elles ne voyagent pas dans l'URL, à la différence des
  chaînes visibles.

Les noms de presets sont du **texte libre** saisi par l'utilisateur
(contrairement aux noms de chaînes, restreints à `[a-z0-9_]` par
construction) : `renderPresetsList()` les passe systématiquement par
`escapeHtml()` avant de les insérer dans un gabarit `innerHTML`, pour
éviter toute injection HTML.

### 13. Copier le lien et toast de confirmation

`copyShareLink(url)` (dans `app.js`) copie l'URL reçue en paramètre dans
le presse-papiers via `navigator.clipboard.writeText()`, puis affiche un
toast de confirmation (`showToast()`). C'est une fonction générique — ce
n'est qu'un appelant, le bouton de partage de chaque preset (voir section
11), qui décide QUELLE url partager.

`navigator.clipboard` exige un **contexte sécurisé** (HTTPS, ou
`http://localhost`/`http://127.0.0.1` en développement) et peut être
absent sur d'anciens navigateurs : `copyShareLink()` retombe alors sur
`fallbackCopyToClipboard()`, qui utilise la technique classique
(`<textarea>` temporaire hors écran + `document.execCommand("copy")`,
dépréciée mais encore largement supportée en repli).

Le toast lui-même (`#toast` dans `index.html`) est un simple message
temporaire positionné en bas à droite : `showToast()` force un reflow
(`void el.toast.offsetWidth`) entre le retrait de l'attribut `hidden` et
l'ajout de la classe `is-visible` qui déclenche la transition CSS —
nécessaire car, sans ce reflow forcé, le navigateur peut fusionner les
deux changements de style dans un seul repaint et sauter l'animation
d'entrée si le toast était démasqué juste avant dans le même tick.

## Lancer le projet en local

Comme il s'agit d'un site 100 % statique, il suffit de le servir avec
n'importe quel serveur HTTP local. **Ne pas ouvrir `index.html` directement
avec `file://`** : Twitch exige une origine HTTP valide pour le paramètre
`parent` (voir section suivante).

Quelques options, au choix :

```bash
# Avec Python (déjà installé sur la plupart des systèmes)
cd streamwall
python3 -m http.server 8080

# Avec Node.js, sans installation globale
cd streamwall
npx serve -l 8080

# Avec PHP
cd streamwall
php -S localhost:8080
```

Puis ouvrir `http://localhost:8080` dans le navigateur.

## Déploiement

Le site étant statique, il se déploie sur n'importe quel hébergeur de
fichiers statiques. Quelques options courantes :

### GitHub Pages

1. Poussez le contenu du dossier `streamwall/` sur une branche (par
   exemple `main`) d'un dépôt GitHub.
2. Dans les paramètres du dépôt (`Settings` → `Pages`), sélectionnez la
   branche et le dossier racine (`/`) comme source.
3. Le site sera disponible à une adresse du type
   `https://votre-utilisateur.github.io/votre-repo/`.
4. Pensez à adapter le paramètre `parent` si besoin (voir plus bas) : par
   défaut le code utilise `window.location.hostname`, donc cela fonctionne
   automatiquement sans modification.

### Netlify / Vercel

1. Connectez votre dépôt Git à Netlify ou Vercel.
2. Aucune commande de build n'est nécessaire : laissez le champ "build
   command" vide et indiquez `streamwall/` (ou la racine du projet) comme
   dossier de publication ("publish directory" / "output directory").
3. Déployez : la plateforme vous fournit une URL en `https://`.

### Hébergement traditionnel (Apache / Nginx / OVH, etc.)

Copiez simplement le contenu du dossier `streamwall/` (via FTP/SFTP/SCP)
dans le répertoire public de votre hébergement
(`/var/www/html`, `public_html/`, etc.). Aucune configuration serveur
particulière (pas de réécriture d'URL, pas de PHP, pas de base de données)
n'est nécessaire puisque le routage se fait par hash côté client.

Exemple avec `rsync` vers un serveur distant :

```bash
rsync -avz --delete ./streamwall/ utilisateur@votre-serveur:/var/www/html/
```

### Conteneur Docker (optionnel)

Pour un déploiement conteneurisé avec Nginx :

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
```

```bash
docker build -t streamwall .
docker run -p 8080:80 streamwall
```

## Le paramètre `parent` de Twitch (point critique)

Twitch **exige** que chaque page intégrant un lecteur ou un chat déclare
explicitement le nom de domaine qui l'héberge, via le paramètre `parent`.
Sans cela, l'iframe reste blanche avec une erreur de type *"embedding is
disabled on this domain"*.

Dans ce projet, ce paramètre est calculé automatiquement à l'exécution :

```js
function getParentDomain() {
  return window.location.hostname || "localhost";
}
```

Cela signifie que **le site fonctionne sans configuration supplémentaire,
quel que soit le domaine sur lequel il est déployé** (localhost, domaine de
test Netlify, domaine final, etc.), puisque le nom d'hôte est lu
dynamiquement à chaque chargement.

Points d'attention :

- En local, servez le site via `http://localhost:PORT` (voir section
  précédente) : `window.location.hostname` vaudra alors `localhost`, ce qui
  est une valeur acceptée par Twitch.
- Si vous déployez derrière un domaine personnalisé avec plusieurs
  sous-domaines (ex. `www.exemple.com` et `exemple.com`), assurez-vous que
  les utilisateurs accèdent toujours via le même nom d'hôte, ou adaptez
  `getParentDomain()` pour renvoyer une valeur fixe si nécessaire.

## Personnalisation

### Couleurs et thèmes

Toutes les couleurs sont centralisées dans les variables CSS en haut de
`css/style.css`, déclinées en thème sombre (`:root, html[data-theme="dark"]`)
et thème clair (`html[data-theme="light"]`) :

```css
:root, html[data-theme="dark"] {
  --twitch-purple: #9147ff;
  --bg-app: #0e0e10;
  --bg-panel: #18181b;
  --text-primary: #efeff1;
  --text-secondary: #adadb8;
  /* ... */
}

html[data-theme="light"] {
  --bg-app: #f7f7f8;
  --bg-panel: #ffffff;
  --text-primary: #0e0e10;
  /* ... */
}
```

Il suffit de modifier ces valeurs pour adapter l'un ou l'autre thème.

### Réglages de la grille dynamique

Deux constantes en haut de `js/app.js` contrôlent le calcul de
disposition :

```js
const GRID_GAP = 4;              // doit correspondre au `gap` CSS de .players-grid
const TILE_ASPECT_RATIO = 16 / 9; // ratio largeur/hauteur cible des tuiles
```

Si vous changez le `gap` dans `css/style.css`, pensez à mettre à jour
`GRID_GAP` en conséquence pour que le calcul reste exact.

### Logo et favicon

Volontairement, le site n'affiche **aucun logo ni favicon Twitch** : seul
le nom "StreamWall" apparaît en texte dans l'en-tête (`.brand-name` dans
`index.html`), et aucune balise `<link rel="icon">` n'est déclarée (le
navigateur affiche son icône générique par défaut). Pour ajouter votre
propre identité visuelle, il suffit d'ajouter un élément (image, SVG) dans
le conteneur `.brand` de `index.html`, et/ou une balise `<link rel="icon">`
pointant vers votre propre fichier dans `<head>`.

## Limitations connues

- Les publicités et restrictions géographiques imposées par Twitch
  s'appliquent normalement à chaque lecteur intégré ; elles ne peuvent pas
  être contournées par cette application.
- Le chat n'est affiché que pour **une seule chaîne à la fois** (comme dans
  le projet d'origine), sélectionnable via le menu déroulant du panneau de
  chat.
- Les noms de chaînes ne sont validés côté client que sur leur **format**
  (4 à 25 caractères, alphanumériques et underscore — voir section 11) ;
  un nom bien formé mais correspondant à une chaîne inexistante ou hors
  ligne affichera tout de même l'écran d'erreur standard du lecteur
  Twitch, faute de pouvoir vérifier une existence réelle sans backend
  (voir l'encadré de la section 11).
- Le calcul dynamique de la grille s'appuie sur l'API `ResizeObserver`,
  supportée par tous les navigateurs modernes (Chrome, Firefox, Safari,
  Edge) mais absente des très anciens navigateurs (Internet Explorer).
- Avec un très grand nombre de streams affichés simultanément sur un petit
  écran, les tuiles peuvent devenir très petites (aucune taille minimale
  n'est imposée), afin de respecter la contrainte "jamais de scroll".
- Les tuiles remplissent toujours 100% de la grille (voir section 4),
  mais ne sont pas garanties d'être exactement au format 16:9 : quand le
  ratio (colonnes×lignes) choisi ne tombe pas exactement sur le ratio du
  conteneur, le lecteur Twitch affiche lui-même un léger lettrboxing
  (bandes noires) à l'intérieur de sa propre tuile plutôt que de laisser
  de l'espace vide autour de la page.
- Les **dispositions favorites** (presets) sont un état local à ce
  navigateur, sauvegardé en `localStorage` : pas synchronisées entre
  appareils. Un lien de partage de preset (voir section 12), lui, voyage
  normalement puisque c'est une URL classique.
- Le bouton de partage d'un preset utilise l'API Clipboard moderne
  (`navigator.clipboard`), qui exige un **contexte sécurisé** (HTTPS, ou
  `http://localhost` en développement) ; un repli existe pour les autres
  cas (voir section 13) mais reste moins fiable selon le navigateur.
- Le son suit une règle unique et automatique : le stream mis en avant
  s'il y en a un (voir section 5), sinon le premier stream visible ; il
  n'y a pas de contrôle individuel du son/volume dans l'interface pour
  l'ajuster ensuite sans passer par les commandes du lecteur Twitch
  lui-même.
- La mise en avant (section 5) est, comme les presets, un état local à ce
  navigateur (`localStorage`), non incluse dans le hash d'URL partagé :
  ouvrir un lien partagé n'active la mise en avant de personne, même si
  elle était active chez qui l'a partagé.
- Le découpage en quadrants de la mise en avant (section 5) est un
  découpage FIXE (toujours 1/4 + 3/4), pas un algorithme qui chercherait
  à minimiser l'espace perdu : avec très peu d'autres streams (1 à 3),
  certaines cases du "L" peuvent rester visuellement vides plutôt que de
  laisser les tuiles présentes grandir pour les combler.

## Licence

Comme le projet d'origine, ce code est libre d'utilisation.
