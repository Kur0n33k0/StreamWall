/**
 * ============================================================================
 * StreamWall — js/app.js
 * ----------------------------------------------------------------------------
 * Réimplémentation en JavaScript pur (sans framework, sans backend) du projet
 * "multitwitch" (https://github.com/bhamrick/multitwitch), qui permettait à
 * l'origine d'afficher plusieurs streams Twitch côte à côte sur une seule
 * page, avec un menu "Change Streams | Toggle Chat".
 *
 * Fonctionnalités de cette version :
 *   1. Affichage de N streams Twitch en simultané, via l'API officielle
 *      d'embed Twitch (https://embed.twitch.tv/embed/v1.js).
 *   2. Une chaîne ajoutée reste connue de l'application : elle apparaît dans
 *      la liste de la modale "Changer les streams" avec une case à cocher.
 *      Cocher l'affiche dans la grille, décocher la retire de la grille SANS
 *      l'oublier. Le bouton « × » à côté d'une chaîne l'oublie définitivement.
 *      L'ajout est validé (format du nom) avant d'être tenté, et le champ
 *      propose une auto-complétion (`<datalist>` natif) des chaînes déjà
 *      connues de ce navigateur au fil de la saisie (voir
 *      `renderKnownChannelsDatalist()`).
 *   3. Mode "Réorganiser" (bouton du menu) : affiche/masque l'en-tête de
 *      chaque lecteur (poignée de glisser-déposer + nom + boutons "mettre en
 *      avant"/« × »), ainsi qu'une tuile "+" de la même taille qu'un lecteur,
 *      qui ouvre la fenêtre "Changer les streams". En dehors de ce mode,
 *      seules les vidéos sont visibles, pour un visionnage sans distraction.
 *   4. Réorganisation des lecteurs par glisser-déposer (drag and drop natif
 *      HTML5, sans librairie tierce, démarrable depuis n'importe quel point
 *      de la tuile), ou au clavier (les 4 flèches sur l'en-tête d'un lecteur
 *      en mode "Réorganiser" — haut/gauche pour avancer, bas/droite pour
 *      reculer dans l'ordre d'affichage).
 *   5. Mise en avant d'un stream (bouton étoile dans l'en-tête, mode
 *      "Réorganiser") : ce stream occupe alors EXACTEMENT le quart supérieur
 *      gauche de la grille (la moitié des colonnes × la moitié des lignes),
 *      et tous les autres streams se redisposent automatiquement en "L"
 *      tout autour (les 3/4 restants), via l'auto-placement natif de CSS
 *      Grid. Un seul stream peut être mis en avant à la fois.
 *   6. Bascule de thème sombre/clair (bouton tout à droite du menu),
 *      sombre par défaut.
 *   7. Grille de lecteurs dimensionnée DYNAMIQUEMENT en JavaScript pour que
 *      les tuiles occupent toujours le maximum d'espace disponible, quel
 *      que soit leur nombre, sans jamais provoquer de défilement (voir la
 *      fonction `computeBestGrid`).
 *   8. Panneau de chat Twitch, avec sélection de la chaîne à afficher et
 *      bouton pour l'afficher/masquer. Le panneau reste monté et connecté
 *      en arrière-plan même quand il est masqué (masquage purement CSS,
 *      voir `updateChatPanelVisibility()`) : pas besoin de rouvrir/relancer
 *      la connexion à chaque affichage. L'iframe pointe directement vers
 *      twitch.tv (voir `buildChatEmbedUrl()`), avec SES PROPRES cookies de
 *      session : se connecter à Twitch n'importe où dans ce navigateur
 *      (y compris via le lien "Se connecter" du chat lui-même) suffit à
 *      connecter le chat automatiquement — inutile d'implémenter un flux
 *      OAuth applicatif ou un bouton dédié dans StreamWall.
 *   9. Le menu est affiché en haut à droite de la page (cf. index.html +
 *      style.css).
 *  10. Dispositions favorites ("presets") : la combinaison de streams
 *      actuellement affichée peut être enregistrée sous un nom, pour être
 *      rappelée en un clic plus tard (sauvegardé en localStorage). Chaque
 *      preset a son propre bouton de partage (copie un lien pointant vers
 *      SES chaînes, indépendamment de ce qui est affiché à l'instant t).
 *
 * Aucune dépendance externe autre que le SDK officiel Twitch.
 * ============================================================================
 */

(function () {
  "use strict";

  /* ==========================================================================
   * 1. CONFIGURATION & ÉTAT GLOBAL
   * ========================================================================== */

  /** Clés utilisées pour la persistance en localStorage. */
  const STORAGE_KEY_ENTRIES = "streamwall:entries";
  const STORAGE_KEY_CHAT_VISIBLE = "streamwall:chatVisible";
  const STORAGE_KEY_CHAT_CHANNEL = "streamwall:chatChannel";
  const STORAGE_KEY_REORDER_MODE = "streamwall:reorderMode";
  const STORAGE_KEY_THEME = "streamwall:theme";
  const STORAGE_KEY_PRESETS = "streamwall:presets";
  const STORAGE_KEY_FEATURED = "streamwall:featuredChannel";

  /** Écart (en pixels) entre les tuiles de la grille — doit rester en phase
   *  avec la propriété `gap` de `.players-grid` dans css/style.css. */
  const GRID_GAP = 4;

  /** Ratio largeur/hauteur cible pour chaque tuile (format vidéo standard). */
  const TILE_ASPECT_RATIO = 16 / 9;

  /**
   * État de l'application, gardé en mémoire dans ce module.
   *
   * - entries     : tableau ordonné de TOUTES les chaînes déjà ajoutées, sous
   *                 la forme `{ name: string, visible: boolean }`.
   * - players     : Map<channel, Twitch.Player> des instances de lecteurs
   *                 actifs, pour pouvoir les détruire proprement.
   * - chatVisible : booléen, le panneau de chat est-il affiché ?
   * - chatChannel : nom de la chaîne actuellement affichée dans le chat.
   * - reorderMode : booléen, le mode "Réorganiser" est-il actif ? (affiche
   *                 les en-têtes de lecteurs + la tuile "+")
   * - theme       : "dark" ou "light".
   * - dragSourceChannel : mémorise la carte en cours de déplacement pendant
   *                       un drag and drop.
   * - presets     : dispositions favorites, sous la forme
   *                 `{ id: string, name: string, channels: string[] }[]`
   *                 (voir section 11).
   * - featuredChannel : nom de la chaîne actuellement mise en avant (ou
   *                 `null`). Un seul stream peut être mis en avant à la
   *                 fois (voir `isFeatureSplitActive()`, section 3).
   */
  const state = {
    entries: [],
    players: new Map(),
    chatVisible: true,
    chatChannel: null,
    reorderMode: false,
    theme: "dark",
    dragSourceChannel: null,
    presets: [],
    featuredChannel: null,
  };

  /* ==========================================================================
   * 2. RÉFÉRENCES AUX ÉLÉMENTS DU DOM
   * ========================================================================== */

  const el = {
    playersGrid: document.getElementById("players-grid"),
    addTile: document.getElementById("add-tile"),
    chatPanel: document.getElementById("chat-panel"),
    chatSelect: document.getElementById("chat-channel-select"),
    chatEmbedContainer: document.getElementById("chat-embed-container"),
    emptyState: document.getElementById("empty-state"),
    // Pas de bouton "Changer les streams" dans le menu : la modale
    // s'ouvre uniquement via la tuile "+" (mode Réorganiser) ou le
    // bouton de l'état vide (voir btnEmptyAdd et addTile plus bas). Pas
    // de bouton "Copier le lien" dans le menu non plus : le partage se
    // fait par preset (voir modalPresetsList, section 11).
    btnToggleReorder: document.getElementById("btn-toggle-reorder"),
    btnToggleChat: document.getElementById("btn-toggle-chat"),
    btnToggleTheme: document.getElementById("btn-toggle-theme"),
    btnEmptyAdd: document.getElementById("btn-empty-add"),
    toast: document.getElementById("toast"),
    modalOverlay: document.getElementById("modal-overlay"),
    modalAddInput: document.getElementById("modal-add-input"),
    modalAddBtn: document.getElementById("modal-add-btn"),
    modalAddError: document.getElementById("modal-add-error"),
    modalChannelsList: document.getElementById("modal-channels-list"),
    // <datalist> d'auto-complétion du champ d'ajout, voir
    // renderKnownChannelsDatalist() (section 11 du README).
    modalKnownChannels: document.getElementById("modal-known-channels"),
    modalPresetNameInput: document.getElementById("modal-preset-name-input"),
    modalPresetSaveBtn: document.getElementById("modal-preset-save-btn"),
    modalPresetFeedback: document.getElementById("modal-preset-feedback"),
    modalPresetsList: document.getElementById("modal-presets-list"),
    modalConfirm: document.getElementById("modal-confirm"),
  };

  /* ==========================================================================
   * 3. UTILITAIRES
   * ========================================================================== */

  /**
   * Nettoie une chaîne fournie par l'utilisateur pour en extraire un nom de
   * chaîne Twitch valide. Accepte aussi bien "zerator" que
   * "https://www.twitch.tv/zerator" ou "twitch.tv/zerator/". Utilisée pour
   * les chaînes venant du hash d'URL (readChannelsFromHash) : contexte sans
   * retour utilisateur possible, donc on corrige silencieusement plutôt que
   * de rejeter. Pour la saisie dans la modale, voir `validateChannelName()`
   * ci-dessous, qui EXPLIQUE l'erreur au lieu de la corriger en silence.
   * @param {string} raw
   * @returns {string} nom de chaîne en minuscules, ou chaîne vide si invalide
   */
  function sanitizeChannelName(raw) {
    if (!raw) return "";
    let value = raw.trim().toLowerCase();

    if (value.includes("twitch.tv/")) {
      const parts = value.split("twitch.tv/")[1] || "";
      value = parts.split("/")[0];
    }

    value = value.replace(/[^a-z0-9_]/g, "");
    return value;
  }

  /**
   * Valide un nom de chaîne saisi dans la modale "Changer les streams",
   * SANS retirer silencieusement les caractères invalides (contrairement à
   * `sanitizeChannelName()`) : le but est de pouvoir expliquer précisément
   * à l'utilisateur pourquoi son entrée est refusée — avant même de tenter
   * de créer un lecteur, plutôt que de le laisser découvrir le problème via
   * l'écran d'erreur générique de Twitch.
   *
   * Règles Twitch (noms d'utilisateur) : 4 à 25 caractères, lettres,
   * chiffres et underscore uniquement.
   * Voir https://help.twitch.tv/s/article/username-faq
   *
   * @param {string} raw texte saisi (nom simple ou URL twitch.tv/...)
   * @returns {{ok: true, name: string} | {ok: false, message: string}}
   */
  function validateChannelName(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed) {
      return { ok: false, message: "Entrez un nom de chaîne." };
    }

    // Accepte de coller une URL twitch.tv complète (même logique que
    // sanitizeChannelName, dupliquée ici car on ne veut PAS que ce qui
    // suit retire silencieusement les caractères invalides).
    let value = trimmed.toLowerCase();
    if (value.includes("twitch.tv/")) {
      value = value.split("twitch.tv/")[1] || "";
      value = value.split(/[/?#]/)[0];
    }

    if (!/^[a-z0-9_]+$/.test(value)) {
      return {
        ok: false,
        message: "Nom invalide : uniquement lettres, chiffres et underscore.",
      };
    }
    if (value.length < 4 || value.length > 25) {
      return {
        ok: false,
        message: "Nom invalide : les noms Twitch font entre 4 et 25 caractères.",
      };
    }

    return { ok: true, name: value };
  }

  /**
   * Échappe les caractères HTML spéciaux d'une chaîne, pour pouvoir
   * l'insérer sans risque dans un gabarit `innerHTML`. Contrairement aux
   * noms de chaînes Twitch (restreints à [a-z0-9_] par construction), les
   * noms de dispositions favorites (presets) sont du texte libre saisi par
   * l'utilisateur : ils DOIVENT être échappés avant insertion.
   * @param {string} value
   * @returns {string}
   */
  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  /**
   * Renvoie le nom d'hôte à utiliser comme paramètre "parent" pour les
   * embeds Twitch. Twitch exige que le domaine d'accueil soit déclaré
   * explicitement pour autoriser l'affichage de l'iframe.
   * @returns {string}
   */
  function getParentDomain() {
    return window.location.hostname || "localhost";
  }

  /**
   * File d'attente des callbacks en attente du SDK Twitch, et minuteur de
   * scrutation partagé (voir `whenTwitchReady()` juste en dessous).
   * `null` tant qu'aucun appel n'a eu besoin d'attendre.
   * @type {Array<() => void>|null}
   */
  let pendingTwitchReadyCallbacks = null;

  /** Nombre maximal de scrutations (à 50ms d'intervalle, donc ~30s) avant
   *  d'abandonner : évite une scrutation infinie si le SDK Twitch ne se
   *  charge jamais (bloqueur de publicité, coupure réseau...). */
  const TWITCH_READY_MAX_ATTEMPTS = 600;

  /**
   * Attend que le SDK Twitch (window.Twitch) soit chargé avant d'exécuter
   * le callback. Le script est chargé en "defer" donc il peut ne pas être
   * encore disponible au moment où app.js s'exécute — c'est systématiquement
   * le cas juste après le chargement de la page, quand `renderPlayersGrid()`
   * appelle `mountPlayer()` pour chaque chaîne visible d'un coup.
   *
   * Optimisation : tous les appels effectués avant que le SDK soit prêt
   * partagent UNE SEULE scrutation (`setInterval`), au lieu d'en démarrer
   * une par appel. Sans ça, afficher N streams au chargement démarrait N
   * minuteurs indépendants, vérifiant tous exactement la même condition
   * (`window.Twitch && window.Twitch.Player`) toutes les 50ms jusqu'à ce
   * que chacun se résolve séparément — un travail redondant qui grandit
   * avec le nombre de streams.
   * @param {() => void} callback
   */
  function whenTwitchReady(callback) {
    if (window.Twitch && window.Twitch.Player) {
      callback();
      return;
    }

    if (!pendingTwitchReadyCallbacks) {
      pendingTwitchReadyCallbacks = [];
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.Twitch && window.Twitch.Player) {
          clearInterval(interval);
          const callbacks = pendingTwitchReadyCallbacks;
          pendingTwitchReadyCallbacks = null;
          callbacks.forEach((cb) => cb());
        } else if (attempts >= TWITCH_READY_MAX_ATTEMPTS) {
          // Abandon : évite de scruter indéfiniment si le script Twitch
          // n'a jamais pu se charger. Les callbacks en attente ne seront
          // jamais appelés (aucun lecteur ne peut de toute façon être créé
          // sans le SDK) ; un nouvel appel à whenTwitchReady() plus tard
          // (ex. ajout d'une nouvelle chaîne) redémarrera une scrutation.
          clearInterval(interval);
          pendingTwitchReadyCallbacks = null;
          console.warn(
            "StreamWall: le SDK Twitch (embed/v1.js) ne s'est jamais chargé " +
              "— vérifiez la connexion réseau ou un éventuel bloqueur de publicité."
          );
        }
      }, 50);
    }

    pendingTwitchReadyCallbacks.push(callback);
  }

  /**
   * Renvoie la liste ordonnée des noms de chaînes actuellement VISIBLES
   * (celles à afficher dans la grille), dérivée de `state.entries`.
   * @returns {string[]}
   */
  function getVisibleChannels() {
    return state.entries.filter((entry) => entry.visible).map((entry) => entry.name);
  }

  /**
   * Indique si la mise en avant doit s'appliquer visuellement (la tuile
   * occupant le quart supérieur gauche de la grille, voir
   * `computeFeaturedGrid()`, section 6). Il faut :
   *  - qu'une chaîne soit désignée (`state.featuredChannel`) ;
   *  - qu'elle soit toujours visible ;
   *  - qu'il reste au moins une AUTRE chaîne visible à côté d'elle, sinon
   *    la mise en avant n'a pas de sens (rien avec quoi "partager"
   *    l'espace) : autant utiliser toute la surface disponible, comme en
   *    l'absence de mise en avant.
   * @param {string[]} [visibleChannels] - résultat déjà calculé de
   *   `getVisibleChannels()`, à passer quand l'appelant l'a déjà sous la
   *   main (voir `applyGridLayout()`/`renderPlayersGrid()`) pour éviter de
   *   refiltrer `state.entries` une deuxième fois inutilement. Recalculé
   *   ici si omis.
   * @returns {boolean}
   */
  function isFeatureSplitActive(visibleChannels) {
    const visible = visibleChannels || getVisibleChannels();
    return (
      Boolean(state.featuredChannel) &&
      visible.includes(state.featuredChannel) &&
      visible.length > 1
    );
  }

  /* ==========================================================================
   * 4. GESTION DE L'URL (ROUTING PAR HASH) & PERSISTANCE
   * ========================================================================== */

  function readChannelsFromHash() {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return [];
    return hash
      .split("/")
      .map(sanitizeChannelName)
      .filter(Boolean);
  }

  function writeChannelsToHash() {
    const newHash = "#" + getVisibleChannels().join("/");
    history.replaceState(null, "", newHash || "#");
  }

  /**
   * Sauvegarde l'état courant en localStorage (liste complète des chaînes
   * connues, visibilité du chat, chaîne de chat, mode Réorganiser, thème,
   * dispositions favorites, chaîne mise en avant).
   */
  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(state.entries));
      localStorage.setItem(STORAGE_KEY_CHAT_VISIBLE, JSON.stringify(state.chatVisible));
      localStorage.setItem(STORAGE_KEY_CHAT_CHANNEL, state.chatChannel || "");
      localStorage.setItem(STORAGE_KEY_REORDER_MODE, JSON.stringify(state.reorderMode));
      localStorage.setItem(STORAGE_KEY_THEME, state.theme);
      localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(state.presets));
      localStorage.setItem(STORAGE_KEY_FEATURED, state.featuredChannel || "");
    } catch (err) {
      // localStorage peut être indisponible (navigation privée stricte, etc.)
      console.warn("StreamWall: impossible d'écrire dans localStorage.", err);
    }
  }

  /**
   * Détermine l'état initial de l'application au chargement.
   */
  function loadInitialState() {
    const hashChannels = readChannelsFromHash();

    let savedEntries = [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ENTRIES);
      if (saved) savedEntries = JSON.parse(saved);
    } catch (err) {
      savedEntries = [];
    }
    if (!Array.isArray(savedEntries)) savedEntries = [];

    if (hashChannels.length > 0) {
      const savedByName = new Map(savedEntries.map((e) => [e.name, e]));
      const entries = [];

      hashChannels.forEach((name) => {
        entries.push({ name, visible: true });
        savedByName.delete(name);
      });
      savedByName.forEach((entry) => {
        entries.push({ name: entry.name, visible: false });
      });

      state.entries = entries;
    } else {
      state.entries = savedEntries;
    }

    try {
      const savedVisible = localStorage.getItem(STORAGE_KEY_CHAT_VISIBLE);
      state.chatVisible = savedVisible === null ? true : JSON.parse(savedVisible);
    } catch (err) {
      state.chatVisible = true;
    }

    try {
      state.chatChannel = localStorage.getItem(STORAGE_KEY_CHAT_CHANNEL) || null;
    } catch (err) {
      state.chatChannel = null;
    }

    try {
      const savedReorder = localStorage.getItem(STORAGE_KEY_REORDER_MODE);
      state.reorderMode = savedReorder === null ? false : JSON.parse(savedReorder);
    } catch (err) {
      state.reorderMode = false;
    }

    // Le thème a déjà été appliqué au <html> par le script inline de
    // index.html (pour éviter un flash) ; on relit simplement la même
    // valeur ici pour que `state.theme` reste synchronisé.
    try {
      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
      state.theme = savedTheme === "light" ? "light" : "dark";
    } catch (err) {
      state.theme = "dark";
    }

    try {
      const savedPresets = localStorage.getItem(STORAGE_KEY_PRESETS);
      state.presets = savedPresets ? JSON.parse(savedPresets) : [];
    } catch (err) {
      state.presets = [];
    }
    if (!Array.isArray(state.presets)) state.presets = [];

    try {
      state.featuredChannel = localStorage.getItem(STORAGE_KEY_FEATURED) || null;
    } catch (err) {
      state.featuredChannel = null;
    }

    const visible = getVisibleChannels();
    if (!visible.includes(state.chatChannel)) {
      state.chatChannel = visible[0] || null;
    }

    writeChannelsToHash();
  }

  /* ==========================================================================
   * 5. CALCUL DYNAMIQUE DE LA GRILLE (REMPLISSAGE MAXIMAL, JAMAIS DE SCROLL)
   * ========================================================================== */

  /**
   * Détermine, pour un nombre de tuiles donné et un espace disponible
   * donné, le nombre de colonnes/lignes qui se rapproche le plus d'une
   * disposition "au format vidéo standard" (16:9 par tuile).
   *
   * Cette fonction ne fixe PAS la taille finale des tuiles : elle sert
   * uniquement à CHOISIR cols/rows (voir `applyGridLayout()`, qui applique
   * ensuite `repeat(cols, 1fr)` pour que les tuiles s'étirent et occupent
   * la totalité de l'espace disponible, sans aucune marge perdue autour de
   * la grille). Pour départager les candidats, on simule malgré tout la
   * taille qu'aurait une tuile 16:9 dans chaque disposition candidate (en
   * la contraignant par la dimension la plus limitante de sa cellule) et
   * on retient celle qui donnerait la plus grande tuile : c'est un bon
   * indicateur de "quelle disposition ressemble le plus à une vraie
   * grille vidéo", même si la tuile réellement affichée sera étirée pour
   * remplir sa cellule exactement (voir la note sur le lettrboxing interne
   * dans `applyGridLayout()`).
   *
   * Principe : pour chaque nombre de colonnes possible (de 1 à N), on en
   * déduit le nombre de lignes nécessaires (arrondi supérieur), puis la
   * taille que prendrait une tuile 16:9 dans la cellule résultante. On
   * retient la disposition qui donne la plus grande tuile simulée.
   *
   * @param {number} containerWidth  largeur disponible en pixels
   * @param {number} containerHeight hauteur disponible en pixels
   * @param {number} itemCount       nombre de tuiles à placer
   * @param {number} gap             écart entre tuiles en pixels
   * @param {number} aspectRatio     ratio largeur/hauteur cible d'une tuile
   * @returns {{cols:number, rows:number, tileWidth:number, tileHeight:number}|null}
   *   `tileWidth`/`tileHeight` ne sont que la taille SIMULÉE ayant servi à
   *   départager les candidats ; elles ne sont pas appliquées telles
   *   quelles (voir ci-dessus).
   */
  function computeBestGrid(containerWidth, containerHeight, itemCount, gap, aspectRatio) {
    if (itemCount <= 0 || containerWidth <= 0 || containerHeight <= 0) return null;

    let best = null;

    for (let cols = 1; cols <= itemCount; cols++) {
      const rows = Math.ceil(itemCount / cols);

      const availableWidth = containerWidth - gap * (cols - 1);
      const availableHeight = containerHeight - gap * (rows - 1);
      if (availableWidth <= 0 || availableHeight <= 0) continue;

      const cellWidth = availableWidth / cols;
      const cellHeight = availableHeight / rows;

      // On fait tenir une tuile 16:9 dans la cellule (cellWidth x cellHeight)
      // en la contraignant par la dimension la plus limitante.
      let tileWidth = cellWidth;
      let tileHeight = tileWidth / aspectRatio;
      if (tileHeight > cellHeight) {
        tileHeight = cellHeight;
        tileWidth = tileHeight * aspectRatio;
      }

      const area = tileWidth * tileHeight;
      if (!best || area > best.area) {
        best = { cols, rows, tileWidth, tileHeight, area };
      }
    }

    return best;
  }

  /**
   * Variante de `computeBestGrid()` pour la mise en avant : une tuile (le
   * stream mis en avant) occupe un bloc de `cols/2` colonnes × `rows/2`
   * lignes ancré en haut à gauche — donc, par construction, EXACTEMENT un
   * quart de la grille (la moitié de la largeur × la moitié de la
   * hauteur), quel que soit le nombre d'autres tuiles. Les `othersCount`
   * autres tuiles se répartissent dans les cases restantes (les 3/4
   * formant un "L" autour du bloc vedette), via l'auto-placement natif de
   * CSS Grid (`grid-auto-flow: dense` dans `style.css`) : cette fonction
   * ne calcule PAS leur position individuelle, seulement la taille de
   * case uniforme et le nombre de colonnes/lignes.
   *
   * `cols` et `rows` sont toujours PAIRS (et ≥ 2), pour que "la moitié de
   * la grille" tombe sur un nombre entier de colonnes/lignes. Comme le
   * bloc vedette "consomme" `(cols/2)*(rows/2)` cases sur les `cols*rows`
   * disponibles, il reste `cols*rows*3/4` cases pour les autres tuiles :
   * on cherche, parmi tous les couples (cols, rows) pairs qui satisfont
   * `cols*rows*3/4 >= othersCount`, celui qui donne la plus grande case
   * (même stratégie gloutonne que `computeBestGrid()`).
   *
   * Comme pour `computeBestGrid()`, seuls `cols`/`rows` sont réellement
   * utilisés par `applyGridLayout()` (via `repeat(cols, 1fr)`) : les
   * tuiles s'étirent pour remplir exactement leurs cellules, `tileWidth`/
   * `tileHeight` ne servent qu'à choisir la meilleure disposition.
   *
   * @param {number} containerWidth
   * @param {number} containerHeight
   * @param {number} othersCount nombre de tuiles AUTRES que la vedette
   * @param {number} gap
   * @param {number} aspectRatio
   * @returns {{cols:number, rows:number, tileWidth:number, tileHeight:number}|null}
   */
  function computeFeaturedGrid(containerWidth, containerHeight, othersCount, gap, aspectRatio) {
    if (containerWidth <= 0 || containerHeight <= 0) return null;

    let best = null;
    // Borne large mais sûre : avec `rows` au minimum (2), il faut
    // `cols >= othersCount / 1.5` pour loger tout le monde ; on double
    // cette borne par prudence (marge négligeable vu le faible nombre
    // d'itérations en jeu).
    const maxCols = Math.max(2, 2 * (othersCount + 2));

    for (let cols = 2; cols <= maxCols; cols += 2) {
      let rows = 2;
      while (cols * rows * 0.75 < othersCount) {
        rows += 2;
      }

      const availableWidth = containerWidth - gap * (cols - 1);
      const availableHeight = containerHeight - gap * (rows - 1);
      if (availableWidth <= 0 || availableHeight <= 0) continue;

      const cellWidth = availableWidth / cols;
      const cellHeight = availableHeight / rows;

      let tileWidth = cellWidth;
      let tileHeight = tileWidth / aspectRatio;
      if (tileHeight > cellHeight) {
        tileHeight = cellHeight;
        tileWidth = tileHeight * aspectRatio;
      }

      const area = tileWidth * tileHeight;
      if (!best || area > best.area) {
        best = { cols, rows, tileWidth, tileHeight, area };
      }
    }

    return best;
  }

  /**
   * Lit la taille utile (hors padding) d'un élément.
   * @param {HTMLElement} element
   * @returns {{width:number, height:number}}
   */
  function getInnerSize(element) {
    const style = window.getComputedStyle(element);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    return {
      width: element.clientWidth - paddingX,
      height: element.clientHeight - paddingY,
    };
  }

  /**
   * Recalcule et applique la disposition de la grille en fonction de
   * l'espace actuellement disponible.
   *
   * Les colonnes/lignes sont posées en unités `fr` (`repeat(cols, 1fr)`),
   * PAS en pixels exacts : avec des pistes `fr`, CSS Grid répartit tout
   * l'espace disponible (une fois les `gap` déduits) à parts égales entre
   * les cellules, qui remplissent donc TOUJOURS 100% de la largeur et
   * 100% de la hauteur de `#players-grid`, quel que soit le nombre de
   * tuiles — plus aucune marge vide sur les côtés.
   *
   * Une version précédente calculait au contraire une taille de tuile en
   * pixels contrainte au ratio 16:9 exact (voir l'historique de
   * `computeBestGrid()`), puis centrait la grille avec `justify-content`/
   * `align-content` : dès que le ratio (colonnes×lignes) ne correspondait
   * pas exactement au ratio du conteneur, il restait des bandes vides sur
   * les côtés (ou en haut/bas) de la PAGE entière. Avec des pistes `fr`,
   * ce résidu ne peut plus jamais apparaître à l'échelle de la page : si
   * la cellule obtenue n'est pas exactement 16:9, c'est le lecteur Twitch
   * LUI-MÊME qui affichera d'éventuelles bandes noires à l'intérieur de
   * sa propre iframe (comportement standard d'un player vidéo embarqué) —
   * un compromis largement préférable à de l'espace perdu sur toute la
   * page. `computeBestGrid()`/`computeFeaturedGrid()` continuent de
   * choisir le NOMBRE de colonnes/lignes le plus proche d'un format 16:9
   * (pour minimiser ce lettrboxing interne), seule la taille finale
   * appliquée change.
   *
   * Repart toujours d'un état "propre" en effaçant un éventuel
   * positionnement de grille explicite (`grid-column`/`grid-row`) posé
   * sur une carte lors d'un rendu précédent où elle était mise en avant —
   * sans ça, un ancien stream vedette resterait figé en grand format
   * après qu'un autre a pris sa place.
   *
   * Deux branches :
   *  - mise en avant active (`isFeatureSplitActive()`) : `computeFeaturedGrid()`
   *    dimensionne une grille où la tuile vedette occupe le quart
   *    supérieur gauche (voir cette fonction) ; on pose son `grid-column`/
   *    `grid-row` explicitement, les autres tuiles n'ont besoin d'AUCUN
   *    positionnement — l'auto-placement CSS natif s'occupe de les ranger
   *    dans les cases restantes ;
   *  - sinon : `computeBestGrid()` classique, sur TOUTES les tuiles
   *    visibles, comme avant l'ajout de la mise en avant.
   *
   * Appelée après chaque changement pouvant affecter le nombre de tuiles
   * ou l'espace disponible : ajout/suppression de chaîne, bascule du mode
   * Réorganiser, bascule du chat, mise en avant, et à chaque
   * redimensionnement (voir le ResizeObserver plus bas).
   *
   * @param {string[]} [visibleChannels] - résultat déjà calculé de
   *   `getVisibleChannels()`, à passer quand l'appelant l'a déjà sous la
   *   main (voir `renderPlayersGrid()`, qui l'a systématiquement) pour ne
   *   pas refiltrer `state.entries` une deuxième fois pour rien. Recalculé
   *   ici si omis (cas des appels déclenchés par `scheduleGridLayout()` :
   *   redimensionnement, bascule du panneau de chat — aucun des deux n'a
   *   de liste sous la main).
   */
  function applyGridLayout(visibleChannels) {
    const visible = visibleChannels || getVisibleChannels();
    const featuredActive = isFeatureSplitActive(visible);
    const itemCount = visible.length + (state.reorderMode ? 1 : 0);

    if (itemCount === 0) {
      // Rien à afficher (grille masquée au profit du message "aucun
      // stream") : pas de calcul à faire.
      return;
    }

    el.playersGrid.querySelectorAll(".player-card").forEach((card) => {
      card.style.gridColumn = "";
      card.style.gridRow = "";
    });

    const { width, height } = getInnerSize(el.playersGrid);

    if (featuredActive) {
      const othersCount = itemCount - 1;
      const layout = computeFeaturedGrid(width, height, othersCount, GRID_GAP, TILE_ASPECT_RATIO);
      if (!layout) return;

      // `1fr` partout : chaque colonne/ligne se partage équitablement
      // l'espace réellement disponible, donc le bloc vedette (qui span
      // exactement la moitié des colonnes/lignes, voir plus bas) occupe
      // exactement 25% de la SURFACE RÉELLEMENT AFFICHÉE — un calcul
      // encore plus exact qu'avec des pixels arrondis.
      el.playersGrid.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
      el.playersGrid.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;

      const featuredCard = el.playersGrid.querySelector(
        `.player-card[data-channel="${CSS.escape(state.featuredChannel)}"]`
      );
      if (featuredCard) {
        // Ancré explicitement en haut à gauche (1,1) : ne dépend pas de
        // l'ordre des cartes dans le DOM, contrairement aux autres tuiles
        // qui, elles, s'auto-placent selon cet ordre.
        featuredCard.style.gridColumn = `1 / span ${layout.cols / 2}`;
        featuredCard.style.gridRow = `1 / span ${layout.rows / 2}`;
      }
      return;
    }

    const layout = computeBestGrid(width, height, itemCount, GRID_GAP, TILE_ASPECT_RATIO);
    if (!layout) return;

    el.playersGrid.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
    el.playersGrid.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
  }

  /**
   * Programme un recalcul de la grille au prochain rendu du navigateur.
   * Évite de recalculer plusieurs fois pour le même redimensionnement
   * (le ResizeObserver peut déclencher plusieurs évènements rapprochés).
   */
  let gridLayoutScheduled = false;
  function scheduleGridLayout() {
    if (gridLayoutScheduled) return;
    gridLayoutScheduled = true;
    requestAnimationFrame(() => {
      gridLayoutScheduled = false;
      applyGridLayout();
    });
  }

  /* ==========================================================================
   * 6. RENDU DES LECTEURS VIDÉO
   * ========================================================================== */

  /**
   * Bascule la mise en avant d'une chaîne : un SEUL stream peut être mis
   * en avant à la fois (voir `state.featuredChannel`), donc en choisir un
   * nouveau remplace silencieusement l'ancien. Cliquer sur l'étoile d'une
   * chaîne déjà mise en avant l'enlève (retour à la grille normale).
   * @param {string} channel
   */
  function toggleFeaturedChannel(channel) {
    state.featuredChannel = state.featuredChannel === channel ? null : channel;
    persistState();
    renderPlayersGrid();
  }

  /**
   * Met à jour l'apparence (icône ★/☆, aria-pressed, aria-label) du
   * bouton "mettre en avant" d'une carte. Comme un seul stream peut être
   * mis en avant à la fois, cette fonction est appelée pour CHAQUE carte
   * à chaque rendu (voir `renderPlayersGrid()`), afin de désactiver
   * visuellement l'ancien bouton actif dès qu'un autre stream est choisi.
   * @param {HTMLElement} card
   * @param {string} channel
   */
  function updateFeatureButtonUI(card, channel) {
    const button = card.querySelector(".player-card-feature");
    if (!button) return;
    const isFeatured = channel === state.featuredChannel;
    button.textContent = isFeatured ? "★" : "☆";
    button.setAttribute("aria-pressed", String(isFeatured));
    button.setAttribute(
      "aria-label",
      isFeatured ? `Ne plus mettre ${channel} en avant` : `Mettre ${channel} en avant`
    );
  }

  /**
   * Construit la carte DOM d'un lecteur (en-tête, zone de glisser-déposer,
   * conteneur vidéo) et branche tous ses évènements. Ne crée PAS encore le
   * lecteur Twitch lui-même (voir `mountPlayer`), qui dépend du SDK externe.
   * @param {string} channel
   * @returns {HTMLElement}
   */
  function createPlayerCard(channel) {
    const card = document.createElement("div");
    card.className = "player-card";
    card.dataset.channel = channel;

    card.innerHTML = `
      <div class="player-card-header" tabindex="0">
        <span class="player-card-title">
          <span class="drag-handle" aria-hidden="true">✥</span>
          <span>${channel}</span>
        </span>
        <span class="player-card-actions">
          <button class="player-card-feature" type="button" aria-pressed="false">☆</button>
          <button class="player-card-remove" type="button" aria-label="Retirer ${channel} de la grille">×</button>
        </span>
      </div>
      <!--
        Overlay transparent posé sur toute la tuile (voir
        .player-card-dragzone dans style.css) : permet de démarrer le
        glisser-déposer depuis n'importe quel point du lecteur (pas
        seulement la barre d'en-tête), y compris au-dessus de la vidéo,
        dont l'iframe intercepterait sinon les évènements souris.
      -->
      <div class="player-card-dragzone" aria-hidden="true"></div>
      <div class="player-card-video" id="player-video-${channel}"></div>
    `;

    const header = card.querySelector(".player-card-header");
    const dragZone = card.querySelector(".player-card-dragzone");
    // Deux points de départ possibles pour le glisser-déposer : la barre
    // d'en-tête (poignée + titre) et l'overlay couvrant toute la tuile.
    header.draggable = true;
    dragZone.draggable = true;
    attachDragEvents(card, [header, dragZone]);

    // Alternative clavier au glisser-déposer : les 4 flèches, quand
    // l'en-tête a le focus (voir moveChannelByKeyboard(), section 8).
    header.setAttribute(
      "aria-label",
      `${channel} — glisser-déposer, ou flèches du clavier, pour réorganiser`
    );
    header.addEventListener("keydown", (event) => {
      const direction = ARROW_KEY_DIRECTIONS[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      moveChannelByKeyboard(channel, direction);
      header.focus();
    });

    card.querySelector(".player-card-feature").addEventListener("click", () => {
      toggleFeaturedChannel(channel);
    });

    card.querySelector(".player-card-remove").addEventListener("click", () => {
      setChannelVisibility(channel, false);
    });

    return card;
  }

  /**
   * Crée le lecteur Twitch pour une chaîne, une fois le SDK prêt.
   * @param {string} channel
   * @param {boolean} startsUnmuted - vrai si ce lecteur doit démarrer avec
   *   le son actif (le stream mis en avant s'il y en a un, sinon le
   *   premier stream visible — voir `renderPlayersGrid()`). Passé
   *   explicitement par l'appelant (plutôt que recalculé ici) pour éviter
   *   un décalage si l'état change entre l'appel et l'exécution effective
   *   du callback `whenTwitchReady` (qui peut être différée).
   */
  function mountPlayer(channel, startsUnmuted) {
    whenTwitchReady(() => {
      if (state.players.has(channel)) return;

      const containerId = `player-video-${channel}`;
      if (!document.getElementById(containerId)) return;

      const player = new window.Twitch.Player(containerId, {
        channel: channel,
        parent: [getParentDomain()],
        width: "100%",
        height: "100%",
        autoplay: true,
        muted: !startsUnmuted,
      });

      state.players.set(channel, player);
    });
  }

  function unmountPlayer(channel) {
    const player = state.players.get(channel);
    if (player && typeof player.destroy === "function") {
      try {
        player.destroy();
      } catch (err) {
        // Certaines versions du SDK n'exposent pas destroy() ; on ignore.
      }
    }
    state.players.delete(channel);
  }

  /**
   * Redessine la grille de lecteurs pour correspondre aux chaînes
   * actuellement visibles, replace la tuile "+" en dernière position, puis
   * recalcule la disposition (tailles de tuiles, et positionnement de la
   * tuile mise en avant s'il y en a une) via `applyGridLayout`.
   *
   * Toutes les cartes — y compris celle du stream mis en avant — restent
   * dans le MÊME conteneur (`#players-grid`) et gardent leur position dans
   * le DOM dérivée de `state.entries`, comme avant l'ajout de la mise en
   * avant : c'est uniquement `applyGridLayout()` qui donne à la carte
   * vedette son positionnement de grille spécial (`grid-column`/
   * `grid-row`), sans avoir besoin de la déplacer où que ce soit.
   */
  function renderPlayersGrid() {
    const visible = getVisibleChannels();
    const featuredChannel = isFeatureSplitActive(visible) ? state.featuredChannel : null;

    const existingCards = new Map(
      Array.from(el.playersGrid.children)
        .filter((node) => node.dataset && node.dataset.channel)
        .map((card) => [card.dataset.channel, card])
    );

    existingCards.forEach((card, channel) => {
      if (!visible.includes(channel)) {
        card.remove();
        unmountPlayer(channel);
      }
    });

    visible.forEach((channel, index) => {
      let card = existingCards.get(channel);
      if (!card) {
        card = createPlayerCard(channel);
      }
      updateFeatureButtonUI(card, channel);

      const currentNodeAtIndex = el.playersGrid.children[index];
      if (currentNodeAtIndex !== card) {
        el.playersGrid.insertBefore(card, currentNodeAtIndex || null);
      }
      // Le stream mis en avant démarre avec le son (c'est celui qu'on a
      // choisi de regarder en grand : rien ne garantirait sinon que ce
      // soit celui qu'on entend) ; sinon, comme avant, le premier stream
      // visible.
      const startsUnmuted = featuredChannel ? channel === featuredChannel : index === 0;
      mountPlayer(channel, startsUnmuted);
    });

    // La tuile "+" reste toujours la dernière tuile de la grille.
    el.playersGrid.appendChild(el.addTile);

    // Bascule entre la grille et le message "aucun stream". La grille reste
    // affichée même sans lecteur si le mode Réorganiser est actif, pour que
    // la tuile "+" reste accessible.
    const hasChannels = visible.length > 0;
    const shouldShowGrid = hasChannels || state.reorderMode;
    el.emptyState.hidden = shouldShowGrid;
    // On ne s'appuie pas sur l'attribut `hidden` seul pour la grille, car
    // elle est en `display: grid` dans le CSS, ce qui prime sur `hidden`.
    el.playersGrid.style.display = shouldShowGrid ? "grid" : "none";

    if (shouldShowGrid) {
      // `visible` est réutilisé tel quel : évite à applyGridLayout() de
      // refiltrer `state.entries` une troisième fois pour ce même rendu
      // (une première fois ci-dessus, une deuxième dans
      // isFeatureSplitActive() ci-dessus, déjà réutilisée grâce au
      // paramètre de cette dernière).
      applyGridLayout(visible);
    }
  }

  /**
   * Applique la classe CSS qui active/désactive le mode "Réorganiser" et
   * met à jour l'état `aria-pressed` du bouton correspondant. Redessine
   * ensuite la grille (le nombre de tuiles change : +1 pour la tuile "+").
   */
  function updateReorderModeUI() {
    el.playersGrid.classList.toggle("reorder-mode", state.reorderMode);
    el.btnToggleReorder.setAttribute("aria-pressed", String(state.reorderMode));
    renderPlayersGrid();
  }

  /* ==========================================================================
   * 7. GLISSER-DÉPOSER (DRAG AND DROP) POUR RÉORGANISER LES LECTEURS
   * ========================================================================== */

  /**
   * Attache les évènements de glisser-déposer natif HTML5 à une carte de
   * lecteur.
   * @param {HTMLElement} card - la carte `.player-card` (cible du drop,
   *   et élément dont on bascule les classes `dragging`/`drag-over`).
   * @param {HTMLElement[]} handles - les éléments depuis lesquels le
   *   glisser-déposer peut être démarré (`draggable="true"`). Il y en a
   *   deux : l'en-tête (barre du haut) et l'overlay `.player-card-dragzone`
   *   qui couvre toute la tuile, pour pouvoir démarrer le drag depuis la
   *   vidéo elle-même et pas seulement depuis la barre supérieure.
   */
  function attachDragEvents(card, handles) {
    handles.forEach((handle) => {
      handle.addEventListener("dragstart", (event) => {
        state.dragSourceChannel = card.dataset.channel;
        card.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.dataset.channel);
      });

      handle.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        state.dragSourceChannel = null;
        // Cherché dans #players-grid plutôt que tout `document` : toutes
        // les `.player-card` y vivent de toute façon, inutile de faire
        // parcourir au moteur de sélection le reste de la page.
        el.playersGrid
          .querySelectorAll(".player-card.drag-over")
          .forEach((c) => c.classList.remove("drag-over"));
      });
    });

    // Le survol et le dépôt, eux, sont écoutés sur la carte entière (ils
    // s'appliquent quel que soit le handle qui a démarré le glisser, et
    // remontent naturellement jusqu'à `card` par bouillonnement des
    // évènements natifs de drag and drop).
    card.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (card.dataset.channel !== state.dragSourceChannel) {
        card.classList.add("drag-over");
      }
    });

    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });

    card.addEventListener("drop", (event) => {
      event.preventDefault();
      card.classList.remove("drag-over");

      const sourceChannel = state.dragSourceChannel;
      const targetChannel = card.dataset.channel;
      if (!sourceChannel || sourceChannel === targetChannel) return;

      reorderChannels(sourceChannel, targetChannel);
    });
  }

  /**
   * Déplace `sourceChannel` à la position de `targetChannel` dans
   * `state.entries` et met à jour le DOM (déplacement de nœud, pas de
   * recréation, pour ne pas recharger les iframes vidéo). Le positionnement
   * de grille de la tuile mise en avant (voir `applyGridLayout()`) ne
   * dépend pas de l'ordre des nœuds dans le DOM (il est posé explicitement
   * par nom de chaîne), donc réordonner n'a pas besoin de le retoucher —
   * et comme le nombre de tuiles ne change pas non plus, `applyGridLayout`
   * n'a pas besoin d'être rappelée du tout ici.
   * @param {string} sourceChannel
   * @param {string} targetChannel
   */
  function reorderChannels(sourceChannel, targetChannel) {
    const fromIndex = state.entries.findIndex((e) => e.name === sourceChannel);
    const toIndex = state.entries.findIndex((e) => e.name === targetChannel);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = state.entries.splice(fromIndex, 1);
    state.entries.splice(toIndex, 0, moved);

    const sourceCard = el.playersGrid.querySelector(
      `.player-card[data-channel="${CSS.escape(sourceChannel)}"]`
    );
    const targetCard = el.playersGrid.querySelector(
      `.player-card[data-channel="${CSS.escape(targetChannel)}"]`
    );
    if (sourceCard && targetCard) {
      if (fromIndex < toIndex) {
        targetCard.after(sourceCard);
      } else {
        targetCard.before(sourceCard);
      }
    }

    writeChannelsToHash();
    persistState();
  }

  /**
   * Correspondance touche flèche -> direction de déplacement, pour
   * `moveChannelByKeyboard()`. Les 4 flèches sont utilisables : la grille
   * étant réordonnée sur un seul axe (l'ordre linéaire de `state.entries`,
   * pas une position 2D ligne/colonne — le nombre de colonnes changeant
   * dynamiquement avec la taille de la fenêtre, une notion de "case du
   * dessus"/"case de droite" ne serait pas stable), haut et gauche
   * avancent la chaîne d'un cran (comme un glisser-déposer vers le
   * lecteur précédent), bas et droite la reculent d'un cran.
   * @type {Record<string, -1|1>}
   */
  const ARROW_KEY_DIRECTIONS = {
    ArrowUp: -1,
    ArrowLeft: -1,
    ArrowDown: 1,
    ArrowRight: 1,
  };

  /**
   * Alternative clavier au glisser-déposer : déplace une chaîne d'un cran
   * dans l'ordre des chaînes VISIBLES (les 4 flèches sur l'en-tête d'un
   * lecteur en mode Réorganiser, voir `createPlayerCard` et
   * `ARROW_KEY_DIRECTIONS`). Ne fait rien si la chaîne est déjà en butée
   * (première/dernière position) : mêmes garde-fous que le
   * glisser-déposer, réutilise `reorderChannels()`.
   * @param {string} channel
   * @param {-1|1} direction -1 = vers le début (plus tôt), 1 = vers la fin
   */
  function moveChannelByKeyboard(channel, direction) {
    const visible = getVisibleChannels();
    const index = visible.indexOf(channel);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= visible.length) return;

    reorderChannels(channel, visible[targetIndex]);
  }

  /* ==========================================================================
   * 8. GESTION DU CHAT
   * ========================================================================== */

  function renderChatSelect() {
    const visible = getVisibleChannels();
    el.chatSelect.innerHTML = "";
    visible.forEach((channel) => {
      const option = document.createElement("option");
      option.value = channel;
      option.textContent = channel;
      el.chatSelect.appendChild(option);
    });

    if (!visible.includes(state.chatChannel)) {
      state.chatChannel = visible[0] || null;
    }
    if (state.chatChannel) {
      el.chatSelect.value = state.chatChannel;
    }
  }

  /**
   * Construit l'URL de l'iframe d'embed de chat Twitch pour une chaîne.
   *
   * Contrairement à la vidéo (`Twitch.Player`), le SDK officiel
   * `embed/v1.js` n'expose PAS de constructeur JS pour un chat autonome
   * (il n'existe pas de `Twitch.Chat` dans l'API — seuls `Twitch.Player`
   * et `Twitch.Embed`, ce dernier combinant vidéo+chat, sont fournis).
   * La méthode documentée par Twitch pour un widget de chat seul est une
   * simple iframe pointant vers cette URL :
   * https://dev.twitch.tv/docs/embed/chat/
   *
   * `darkpopout` bascule le chat sur le thème sombre de Twitch ; on ne
   * l'ajoute qu'en thème sombre pour rester cohérent avec le reste de
   * l'interface (voir `toggleTheme()`, qui redessine le chat au
   * changement de thème).
   * @param {string} channel
   * @returns {string}
   */
  function buildChatEmbedUrl(channel) {
    let url = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${encodeURIComponent(getParentDomain())}`;
    if (state.theme === "dark") {
      url += "&darkpopout";
    }
    return url;
  }

  /**
   * (Re)construit l'iframe du panneau de chat si nécessaire.
   *
   * Volontairement INDÉPENDANT de `state.chatVisible` : le panneau peut
   * être masqué par pur CSS (voir `updateChatPanelVisibility()`) sans que
   * son iframe soit détruite, pour qu'elle continue de tourner "en
   * arrière-plan" (connexion Twitch, session de chat) pendant qu'elle
   * n'est pas affichée — masquer/afficher le panneau ne doit jamais
   * obliger l'utilisateur à se reconnecter.
   *
   * Idempotent : si une iframe existe déjà avec exactement la même URL
   * cible (même chaîne, même thème), elle est laissée telle quelle plutôt
   * que détruite et recréée. Sans cette vérification, le moindre appel
   * (ex. ajout d'une chaîne sans rapport avec le chat affiché, voir
   * `applyEntriesChange()`) recréerait l'iframe et romprait sa session en
   * cours pour rien. Elle n'est donc réellement recréée que lorsque la
   * chaîne de chat ou le thème changent réellement.
   */
  function renderChatOnly() {
    if (!state.chatChannel) {
      el.chatEmbedContainer.innerHTML = "";
      return;
    }

    const targetUrl = buildChatEmbedUrl(state.chatChannel);
    const existingIframe = el.chatEmbedContainer.querySelector("iframe");
    if (existingIframe && existingIframe.src === targetUrl) return;

    // Pas besoin d'attendre `whenTwitchReady()` ici : à la différence du
    // lecteur vidéo, le chat n'utilise pas le SDK JS, seulement une
    // iframe simple, disponible dès que le DOM l'est.
    el.chatEmbedContainer.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = targetUrl;
    iframe.title = `Chat Twitch de ${state.chatChannel}`;
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("scrolling", "yes");
    el.chatEmbedContainer.appendChild(iframe);
  }

  /**
   * Met à jour la visibilité du panneau de chat, puis recalcule la grille :
   * masquer/afficher le chat change la largeur disponible pour les
   * lecteurs, donc leur taille optimale change aussi.
   *
   * Ne touche VOLONTAIREMENT PAS à l'iframe de chat elle-même (voir
   * `renderChatOnly()`) : masquer le panneau n'est qu'un `hidden` CSS
   * (voir `.chat-panel[hidden]` dans style.css), la connexion en cours
   * continue de tourner derrière.
   */
  function updateChatPanelVisibility() {
    el.chatPanel.hidden = !state.chatVisible;
    el.btnToggleChat.setAttribute("aria-pressed", String(state.chatVisible));
    scheduleGridLayout();
  }

  /* ==========================================================================
   * 9. THÈME SOMBRE / CLAIR
   * ========================================================================== */

  /**
   * Applique `state.theme` au document (attribut `data-theme` sur <html>,
   * lu par les variables CSS) et met à jour l'état du bouton.
   */
  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    el.btnToggleTheme.setAttribute("aria-pressed", String(state.theme === "light"));
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    applyTheme();
    persistState();
    // Recharge l'iframe de chat pour appliquer/retirer `darkpopout` et
    // rester cohérent avec le thème de l'appli (voir buildChatEmbedUrl()).
    renderChatOnly();
  }

  /* ==========================================================================
   * 10. AJOUT / VISIBILITÉ / SUPPRESSION DES CHAÎNES CONNUES
   * ========================================================================== */

  function applyEntriesChange() {
    writeChannelsToHash();
    persistState();
    renderPlayersGrid();
    renderChatSelect();
    renderChatOnly();
    // Tient la liste d'auto-complétion à jour dès qu'une chaîne est
    // ajoutée/oubliée (state.entries change de longueur) : sans ça, une
    // chaîne tout juste ajoutée ne serait suggérée qu'à la PROCHAINE
    // ouverture de la modale plutôt qu'immédiatement.
    renderKnownChannelsDatalist();
  }

  function addChannelEntry(rawName) {
    const name = sanitizeChannelName(rawName);
    if (!name) return false;

    const existing = state.entries.find((e) => e.name === name);
    if (existing) {
      existing.visible = true;
    } else {
      state.entries.push({ name, visible: true });
    }

    applyEntriesChange();
    return true;
  }

  function setChannelVisibility(name, visible) {
    const entry = state.entries.find((e) => e.name === name);
    if (!entry) return;
    entry.visible = visible;
    applyEntriesChange();
  }

  function forgetChannelEntry(name) {
    state.entries = state.entries.filter((e) => e.name !== name);
    // Une chaîne oubliée ne peut plus rester "mise en avant".
    if (state.featuredChannel === name) {
      state.featuredChannel = null;
    }
    applyEntriesChange();
    renderModalChannelsList();
  }

  /**
   * Remplit le `<datalist>` d'auto-complétion (`#modal-known-channels`)
   * du champ d'ajout de chaîne, à partir de TOUTES les chaînes déjà
   * connues de ce navigateur (`state.entries`, visibles ou non — pas
   * seulement celles actuellement affichées).
   *
   * Pourquoi seulement les chaînes déjà connues, et pas "n'importe quel
   * streamer Twitch existant" : proposer le catalogue Twitch complet
   * demanderait d'interroger son API en direct (Helix, endpoint "Search
   * Channels"), qui exige TOUJOURS un `Client-Id` ET un jeton OAuth, sans
   * exception — impossible à faire proprement depuis ce code sans
   * réintroduire soit un backend (contraire à l'architecture 100%
   * statique du projet), soit un vrai flux de connexion Twitch côté
   * utilisateur. Voir la section 11 du README pour le détail de cette
   * limite.
   *
   * Triée alphabétiquement pour un parcours prévisible dans la liste
   * déroulante (l'ordre de `state.entries`, lui, reflète l'ordre
   * d'affichage voulu par l'utilisateur — pas pertinent ici).
   */
  function renderKnownChannelsDatalist() {
    const sortedNames = state.entries
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    el.modalKnownChannels.innerHTML = sortedNames
      .map((name) => `<option value="${escapeHtml(name)}"></option>`)
      .join("");
  }

  /** Affiche un message d'erreur sous le champ d'ajout de chaîne. */
  function showModalAddError(message) {
    el.modalAddError.textContent = message;
    el.modalAddError.hidden = false;
    el.modalAddInput.setAttribute("aria-invalid", "true");
  }

  function hideModalAddError() {
    el.modalAddError.hidden = true;
    el.modalAddInput.removeAttribute("aria-invalid");
  }

  function renderModalChannelsList() {
    el.modalChannelsList.innerHTML = "";

    if (state.entries.length === 0) {
      const empty = document.createElement("li");
      empty.className = "modal-channels-empty";
      empty.textContent = "Aucune chaîne pour le moment. Ajoutez-en une ci-dessus.";
      el.modalChannelsList.appendChild(empty);
      return;
    }

    state.entries.forEach((entry) => {
      const row = document.createElement("li");
      row.className = "modal-channel-row";

      const checkboxId = `modal-checkbox-${entry.name}`;
      row.innerHTML = `
        <input type="checkbox" class="modal-channel-checkbox" id="${checkboxId}" ${entry.visible ? "checked" : ""} />
        <label for="${checkboxId}" class="modal-channel-label">${entry.name}</label>
        <button type="button" class="modal-channel-forget" aria-label="Oublier ${entry.name}">×</button>
      `;

      row.querySelector(".modal-channel-checkbox").addEventListener("change", (event) => {
        setChannelVisibility(entry.name, event.target.checked);
      });

      row.querySelector(".modal-channel-forget").addEventListener("click", () => {
        forgetChannelEntry(entry.name);
      });

      el.modalChannelsList.appendChild(row);
    });
  }

  function handleModalAddChannel() {
    const result = validateChannelName(el.modalAddInput.value);
    if (!result.ok) {
      showModalAddError(result.message);
      el.modalAddInput.focus();
      return;
    }

    hideModalAddError();
    addChannelEntry(result.name);
    el.modalAddInput.value = "";
    renderModalChannelsList();
    el.modalAddInput.focus();
  }

  /* ==========================================================================
   * 11. DISPOSITIONS FAVORITES (PRESETS)
   * ========================================================================== */

  /**
   * Génère un identifiant unique pour une disposition favorite. Pas besoin
   * de garanties cryptographiques, juste assez d'entropie pour éviter les
   * collisions entre deux enregistrements successifs dans ce navigateur.
   * @returns {string}
   */
  function generatePresetId() {
    return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function showPresetFeedback(message, isError) {
    el.modalPresetFeedback.textContent = message;
    el.modalPresetFeedback.hidden = false;
    el.modalPresetFeedback.classList.toggle("modal-message--error", isError);
    el.modalPresetFeedback.classList.toggle("modal-message--success", !isError);
  }

  function hidePresetFeedback() {
    el.modalPresetFeedback.hidden = true;
    el.modalPresetFeedback.classList.remove("modal-message--error", "modal-message--success");
  }

  /**
   * Construit l'URL de partage d'une disposition favorite : SES chaînes
   * (`preset.channels`, dans leur ordre), pas forcément celles affichées
   * à l'instant t. Réutilise le même format de hash que `writeChannelsToHash()`
   * (`#chaine1/chaine2/...`), mais construit à partir de `location.origin`
   * + `location.pathname` plutôt que de `location.href`, précisément pour
   * NE PAS reprendre le hash courant.
   * @param {string[]} channels
   * @returns {string}
   */
  function buildPresetShareUrl(channels) {
    return `${window.location.origin}${window.location.pathname}#${channels.join("/")}`;
  }

  function renderPresetsList() {
    el.modalPresetsList.innerHTML = "";

    if (state.presets.length === 0) {
      const empty = document.createElement("li");
      empty.className = "modal-channels-empty";
      empty.textContent = "Aucune disposition enregistrée.";
      el.modalPresetsList.appendChild(empty);
      return;
    }

    state.presets.forEach((preset) => {
      const row = document.createElement("li");
      row.className = "modal-preset-item";
      // `preset.name` est du texte libre saisi par l'utilisateur
      // (contrairement aux noms de chaînes, restreints à [a-z0-9_]) : on
      // l'échappe avant insertion dans le gabarit HTML (voir escapeHtml()).
      const safeName = escapeHtml(preset.name);
      const count = preset.channels.length;
      row.innerHTML = `
        <button type="button" class="modal-preset-apply">${safeName}</button>
        <span class="modal-preset-count">${count} stream${count > 1 ? "s" : ""}</span>
        <button type="button" class="modal-preset-share" aria-label="Copier le lien de la disposition ${safeName}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M9 15l6-6M10.5 7.5l1-1a3.5 3.5 0 015 5l-1 1M13.5 16.5l-1 1a3.5 3.5 0 01-5-5l1-1"
              fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
            />
          </svg>
        </button>
        <button type="button" class="modal-preset-delete" aria-label="Supprimer la disposition ${safeName}">×</button>
      `;

      row.querySelector(".modal-preset-apply").addEventListener("click", () => {
        applyPreset(preset);
      });
      row.querySelector(".modal-preset-share").addEventListener("click", () => {
        copyShareLink(buildPresetShareUrl(preset.channels));
      });
      row.querySelector(".modal-preset-delete").addEventListener("click", () => {
        deletePreset(preset.id);
      });

      el.modalPresetsList.appendChild(row);
    });
  }

  /**
   * Enregistre (ou met à jour si le nom existe déjà, insensible à la
   * casse) une disposition favorite à partir des chaînes actuellement
   * VISIBLES, dans leur ordre d'affichage actuel.
   * @param {string} rawName
   * @returns {{ok: true, message: string} | {ok: false, message: string}}
   */
  function savePresetFromCurrentState(rawName) {
    const name = (rawName || "").trim().slice(0, 40);
    if (!name) {
      return { ok: false, message: "Entrez un nom pour cette disposition." };
    }

    const channels = getVisibleChannels();
    if (channels.length === 0) {
      return { ok: false, message: "Aucun stream affiché à enregistrer." };
    }

    const existing = state.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.channels = channels;
    } else {
      state.presets.push({ id: generatePresetId(), name, channels });
    }

    persistState();
    renderPresetsList();
    return { ok: true, message: `Disposition « ${name} » enregistrée.` };
  }

  /**
   * Applique une disposition favorite : les chaînes qu'elle contient
   * deviennent visibles (dans son ordre), les autres chaînes actuellement
   * connues repassent invisibles SANS être oubliées (même sémantique que
   * décocher une case dans la liste). Une chaîne du preset qui n'a jamais
   * été ajoutée est créée à la volée.
   * @param {{id: string, name: string, channels: string[]}} preset
   */
  function applyPreset(preset) {
    const remaining = state.entries.filter((entry) => !preset.channels.includes(entry.name));
    remaining.forEach((entry) => {
      entry.visible = false;
    });

    const fromPreset = preset.channels.map((name) => {
      const existing = state.entries.find((entry) => entry.name === name);
      if (existing) {
        existing.visible = true;
        return existing;
      }
      return { name, visible: true };
    });

    state.entries = [...fromPreset, ...remaining];
    applyEntriesChange();
    renderModalChannelsList();
  }

  function deletePreset(id) {
    state.presets = state.presets.filter((preset) => preset.id !== id);
    persistState();
    renderPresetsList();
  }

  /* ==========================================================================
   * 12. MODALE "CHANGER LES STREAMS"
   * ========================================================================== */

  function openModal() {
    renderModalChannelsList();
    renderKnownChannelsDatalist();
    hideModalAddError();
    renderPresetsList();
    hidePresetFeedback();
    el.modalOverlay.hidden = false;
    el.modalAddInput.focus();
  }

  function closeModal() {
    el.modalOverlay.hidden = true;
  }

  /* ==========================================================================
   * 13. PARTAGE : COPIER LE LIEN D'UN PRESET + TOAST DE CONFIRMATION
   * ========================================================================== */

  let toastTimeoutId = null;

  /**
   * Affiche un petit message temporaire en bas à droite de l'écran (voir
   * .toast dans style.css), qui disparaît de lui-même après quelques
   * secondes. Chaque appel réinitialise le minuteur : deux confirmations
   * rapprochées ne se coupent donc pas la parole.
   * @param {string} message
   */
  function showToast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    // Force un reflow avant d'ajouter la classe qui déclenche la
    // transition CSS : sans ça, si le toast venait tout juste d'être
    // démasqué (même tick), le navigateur peut fusionner les deux
    // changements de style et sauter l'animation d'entrée.
    void el.toast.offsetWidth;
    el.toast.classList.add("is-visible");

    clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      el.toast.classList.remove("is-visible");
      // Attend la fin de la transition de sortie avant de repasser
      // `hidden`, pour ne pas la couper net.
      setTimeout(() => {
        el.toast.hidden = true;
      }, 200);
    }, 2200);
  }

  /**
   * Repli pour copier du texte dans le presse-papiers quand l'API
   * Clipboard moderne (`navigator.clipboard`) est indisponible — contexte
   * non sécurisé (http:// hors localhost) ou navigateur ancien. Utilise
   * `document.execCommand("copy")`, dépréciée mais encore largement
   * supportée en repli.
   * @param {string} text
   */
  function fallbackCopyToClipboard(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      // Rien de plus à faire : au pire l'utilisateur copiera l'URL
      // manuellement depuis la barre d'adresse.
    }
    document.body.removeChild(textarea);
  }

  /**
   * Copie une URL dans le presse-papiers et affiche un toast de
   * confirmation. Utilisée exclusivement par le bouton de partage de
   * chaque disposition favorite (voir `renderPresetsList()` et
   * `buildPresetShareUrl()`) : il n'y a plus de bouton "Copier le lien"
   * global pour la composition actuellement affichée.
   * @param {string} url
   */
  function copyShareLink(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => showToast("Lien copié dans le presse-papiers."))
        .catch(() => {
          fallbackCopyToClipboard(url);
          showToast("Lien copié dans le presse-papiers.");
        });
    } else {
      fallbackCopyToClipboard(url);
      showToast("Lien copié dans le presse-papiers.");
    }
  }

  /* ==========================================================================
   * 14. INITIALISATION & ÉCOUTEURS D'ÉVÈNEMENTS GLOBAUX
   * ========================================================================== */

  function bindGlobalEvents() {
    // Seuls ces deux points d'entrée ouvrent la modale "Changer les
    // streams" : le bouton de l'état vide (aucun stream configuré) et
    // la tuile "+", visible uniquement en mode Réorganiser.
    el.btnEmptyAdd.addEventListener("click", openModal);
    el.addTile.addEventListener("click", openModal);

    el.btnToggleReorder.addEventListener("click", () => {
      state.reorderMode = !state.reorderMode;
      updateReorderModeUI();
      persistState();
    });

    el.btnToggleChat.addEventListener("click", () => {
      // Bascule purement CSS (voir updateChatPanelVisibility()) : pas
      // d'appel à renderChatOnly() ici, l'iframe déjà montée continue de
      // tourner derrière sans être détruite/recréée à chaque bascule.
      state.chatVisible = !state.chatVisible;
      updateChatPanelVisibility();
      persistState();
    });

    el.btnToggleTheme.addEventListener("click", toggleTheme);

    el.chatSelect.addEventListener("change", (event) => {
      state.chatChannel = event.target.value;
      persistState();
      renderChatOnly();
    });

    el.modalAddBtn.addEventListener("click", handleModalAddChannel);
    el.modalAddInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleModalAddChannel();
      }
    });
    // Efface le message d'erreur dès que l'utilisateur corrige sa saisie,
    // plutôt que d'attendre une nouvelle tentative d'ajout.
    el.modalAddInput.addEventListener("input", hideModalAddError);

    el.modalPresetSaveBtn.addEventListener("click", () => {
      const result = savePresetFromCurrentState(el.modalPresetNameInput.value);
      showPresetFeedback(result.message, !result.ok);
      if (result.ok) {
        el.modalPresetNameInput.value = "";
      }
    });
    el.modalPresetNameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        el.modalPresetSaveBtn.click();
      }
    });

    el.modalConfirm.addEventListener("click", closeModal);

    el.modalOverlay.addEventListener("click", (event) => {
      if (event.target === el.modalOverlay) closeModal();
    });

    window.addEventListener("hashchange", () => {
      const channelsFromHash = readChannelsFromHash();
      if (channelsFromHash.join("/") !== getVisibleChannels().join("/")) {
        channelsFromHash.forEach((name) => addChannelEntry(name));
        state.entries.forEach((entry) => {
          if (entry.visible && !channelsFromHash.includes(entry.name)) {
            entry.visible = false;
          }
        });
        applyEntriesChange();
      }
    });

    // Recalcule la disposition de la grille à chaque changement de taille
    // de son conteneur : redimensionnement de la fenêtre, rotation d'écran,
    // passage en layout mobile (media query), etc. Un ResizeObserver est
    // préféré à un simple écouteur "resize" sur `window` car il détecte
    // aussi les changements de taille dus à des causes internes à la page
    // (ex. le panneau de chat qui apparaît/disparaît change la largeur
    // disponible pour la grille sans que la fenêtre elle-même ne change).
    const resizeObserver = new ResizeObserver(() => {
      scheduleGridLayout();
    });
    resizeObserver.observe(el.playersGrid);
  }

  function init() {
    loadInitialState();
    bindGlobalEvents();
    applyTheme();
    updateChatPanelVisibility();
    updateReorderModeUI(); // applique aussi renderPlayersGrid() + applyGridLayout()
    renderChatSelect();
    renderChatOnly();
    // Pré-remplit l'auto-complétion dès le chargement, avec les chaînes
    // restaurées depuis localStorage (voir loadInitialState()) : sans ça,
    // il faudrait attendre le premier ajout/suppression de cette session
    // pour que la liste apparaisse (applyEntriesChange() la maintient à
    // jour ENSUITE, mais ne s'exécute jamais au tout premier chargement).
    renderKnownChannelsDatalist();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
