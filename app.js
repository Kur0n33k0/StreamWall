/**
 * ============================================================================
 * StreamWall — app.js
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
 *      avant"/« × ») et les poignées de redimensionnement. En dehors de ce
 *      mode, seules les vidéos sont visibles, pour un visionnage sans
 *      distraction. Le bouton "+" du menu, TOUJOURS affiché (mode Réorganiser
 *      ou non), ouvre la fenêtre "Changer les streams" : il n'y a plus de
 *      tuile "+" dans la zone des lecteurs.
 *   4. Réorganisation des lecteurs par glisser-déposer (drag and drop natif
 *      HTML5, sans librairie tierce, démarrable depuis n'importe quel point
 *      de la tuile), ou au clavier (les 4 flèches sur l'en-tête d'un lecteur
 *      en mode "Réorganiser" — haut/gauche pour avancer, bas/droite pour
 *      reculer dans l'ordre d'affichage).
 *   5. Mise en avant de streams (bouton étoile dans l'en-tête, mode
 *      "Réorganiser") : jusqu'à deux streams occupent chacun, par défaut,
 *      EXACTEMENT un quart de la zone vidéo, en haut (le premier à gauche, le
 *      second à sa droite), et tous les autres streams se redisposent
 *      automatiquement autour (voir `getDefaultPins` et `solveLayout`).
 *   6. Bascule de thème sombre/clair (bouton tout à droite du menu),
 *      sombre par défaut.
 *   7. Disposition des lecteurs calculée DYNAMIQUEMENT en JavaScript, sous
 *      forme d'un pavage de cellules (voir l'en-tête de la section 5) : les
 *      tuiles occupent TOUJOURS 100% de l'espace disponible, quel que soit
 *      leur nombre, sans jamais provoquer de défilement.
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
 *      actuellement affichée — avec son ordre, les streams mis en avant et la
 *      taille ajustée à la main de chaque tuile — peut être enregistrée sous
 *      un nom, pour être rappelée en un clic plus tard (sauvegardé en
 *      localStorage). Chaque preset a son propre bouton de partage (copie un
 *      lien pointant vers SES chaînes seulement — ni favoris ni tailles —,
 *      indépendamment de ce qui est affiché à l'instant t).
 *  11. Redimensionnement manuel (mode "Réorganiser" uniquement) : chaque tuile
 *      a une poignée dans CHACUN de ses quatre angles ; tirer l'une d'elles
 *      (souris, doigt, ou flèches du clavier) agrandit ou réduit la tuile en
 *      largeur et en hauteur, le coin opposé restant fixe, et TOUTES
 *      les autres se réorganisent autour d'elle en gardant une taille à peu
 *      près égale, en remplissant toujours 100% de l'espace (voir l'en-tête
 *      de la section 5). Les tailles sont mémorisées (localStorage) par
 *      combinaison "nombre de favoris + nombre de streams" ; le bouton
 *      "Réinitialiser la vue" les remet par défaut.
 *  12. Fenêtre d'aide (bouton « i » du menu) : texte et captures d'écran
 *      statiques écrits dans index.html (#help-overlay) ; ce fichier n'en gère
 *      que l'ouverture/fermeture, le focus clavier et le sommaire (voir la
 *      section 14).
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
  /** Dispositions ajustées à la main (épingles par emplacement) — voir section 5. */
  const STORAGE_KEY_LAYOUTS = "streamwall:layouts";

  /** Écart (en pixels) entre les tuiles. Uniquement utilisé par le calcul de
   *  disposition en JavaScript (section 5) : la zone vidéo n'est plus une
   *  grille CSS, donc plus aucune propriété `gap` à garder en phase. C'est
   *  aussi l'épaisseur de la poignée de redimensionnement placée dans
   *  chaque écart. */
  const GRID_GAP = 4;

  /** Ratio largeur/hauteur cible pour chaque tuile (format vidéo standard). */
  const TILE_ASPECT_RATIO = 16 / 9;

  /** Nombre maximum de streams pouvant être mis en avant simultanément —
   *  voir `toggleFeaturedChannel()` (section 6) et `getDefaultPins()`
   *  (section 5). */
  const MAX_FEATURED_CHANNELS = 2;

  /** Part de la largeur donnée au stream mis en avant quand UN SEUL autre
   *  stream l'accompagne (disposition par défaut, voir
   *  `getDefaultPins()`). Le quart supérieur gauche habituel n'y est pas
   *  applicable : il laisserait du vide autour de l'unique autre tuile. */
  const FEATURED_SOLO_RATIO = 0.6;

  /** Taille minimale (en pixels) que TOUTES les tuiles gardent lors d'un
   *  redimensionnement manuel : on refuse d'agrandir une tuile au point de
   *  réduire une autre en dessous (voir `isValidSlotCell()`), de sorte
   *  qu'aucune ne devienne illisible. La hauteur suit le format 16:9 de la
   *  largeur. */
  const MIN_TILE_WIDTH = 120;
  const MIN_TILE_HEIGHT = 68;

  /** Distance (en pixels) sous laquelle le coin qu'on tire s'"aimante" au
   *  bord de la zone : pour atteindre facilement toute la largeur ou toute
   *  la hauteur (voir `getCellForCorner()`). */
  const RESIZE_SNAP_DISTANCE = 14;

  /** Fraction de la zone dont une flèche du clavier déplace le coin d'une
   *  tuile dont la poignée a le focus (multipliée par 5 avec Maj). */
  const RESIZE_KEYBOARD_STEP = 0.02;

  /** Nombre maximum de dispositions manuelles conservées en localStorage
   *  (une par combinaison "nombre de favoris + nombre de streams") : les
   *  plus anciennes sont évincées au-delà. */
  const MAX_STORED_LAYOUTS = 20;

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
   *                 les en-têtes de lecteurs et les poignées de
   *                 redimensionnement)
   * - theme       : "dark" ou "light".
   * - dragSourceChannel : mémorise la carte en cours de déplacement pendant
   *                       un drag and drop.
   * - presets     : dispositions favorites, sous la forme
   *                 `{ id: string, name: string, channels: string[],
   *                 layout?: { featured: string[], pins: Record<number, Pin> } }[]`
   *                 (voir section 11). `layout`, les streams mis en avant et
   *                 les tailles ajustées à la main au moment de
   *                 l'enregistrement, est absent des dispositions créées
   *                 avant qu'elles ne retiennent les tailles.
   * - featuredChannels : tableau ORDONNÉ des chaînes actuellement mises en
   *                 avant, DEUX au maximum (voir `MAX_FEATURED_CHANNELS`
   *                 et `isFeatureSplitActive()`, section 3). L'ordre
   *                 importe : la première occupe le quart supérieur
   *                 gauche (et démarre avec le son, voir
   *                 `renderPlayersGrid()`), la seconde (s'il y en a une)
   *                 le quart supérieur droit, juste à côté.
   */
  const state = {
    entries: [],
    players: new Map(),
    chatVisible: false,
    chatChannel: null,
    reorderMode: false,
    theme: "dark",
    dragSourceChannel: null,
    presets: [],
    featuredChannels: [],
  };

  /* ==========================================================================
   * 2. RÉFÉRENCES AUX ÉLÉMENTS DU DOM
   * ========================================================================== */

  const el = {
    playersGrid: document.getElementById("players-grid"),
    chatPanel: document.getElementById("chat-panel"),
    chatSelect: document.getElementById("chat-channel-select"),
    chatEmbedContainer: document.getElementById("chat-embed-container"),
    emptyState: document.getElementById("empty-state"),
    // Bouton "+" du menu, TOUJOURS affiché (mode Réorganiser ou non) : il
    // ouvre la fenêtre "Changer les streams" (voir openModal()). L'autre
    // point d'entrée est le bouton de l'état vide (btnEmptyAdd, plus bas),
    // quand aucun stream n'est affiché. Pas de bouton "Copier le lien" dans
    // le menu : le partage se fait par preset (voir modalPresetsList,
    // section 11).
    btnAdd: document.getElementById("btn-add"),
    btnToggleReorder: document.getElementById("btn-toggle-reorder"),
    // "Réinitialiser la vue" : visible uniquement en mode Réorganiser, actif
    // seulement quand la disposition affichée a été ajustée à la main (voir
    // applyGridLayout() et resetManualLayout(), section 5).
    btnResetLayout: document.getElementById("btn-reset-layout"),
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
    // renderKnownChannelsDatalist() (section 11 de documentation.md).
    modalKnownChannels: document.getElementById("modal-known-channels"),
    modalPresetNameInput: document.getElementById("modal-preset-name-input"),
    modalPresetSaveBtn: document.getElementById("modal-preset-save-btn"),
    modalPresetFeedback: document.getElementById("modal-preset-feedback"),
    modalPresetsList: document.getElementById("modal-presets-list"),
    modalConfirm: document.getElementById("modal-confirm"),
    // Fenêtre d'aide (bouton « i » de l'en-tête), voir la section 14.
    btnHelp: document.getElementById("btn-help"),
    helpOverlay: document.getElementById("help-overlay"),
    helpDialog: document.getElementById("help-dialog"),
    helpClose: document.getElementById("help-close"),
    // Zone de l'aide qui défile, ses sections, et les rubriques du sommaire
    // (chacune porte `data-help-target` = l'id de la section visée).
    helpBody: document.getElementById("help-body"),
    helpSections: Array.from(document.querySelectorAll(".help-section")),
    helpTocLinks: Array.from(document.querySelectorAll(".help-toc-link")),
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
   * Sous-ensemble de `state.featuredChannels` réellement exploitable :
   * uniquement les chaînes encore VISIBLES, dans le même ordre (l'ordre
   * décide qui occupe le quart supérieur gauche vs droit, voir
   * `applyGridLayout()`, et qui démarre avec le son, voir
   * `renderPlayersGrid()`). Une chaîne mise en avant puis décochée (ou
   * oubliée) reste dans `state.featuredChannels` tant qu'elle n'est pas
   * explicitement retirée (bouton étoile) — SAUF via `forgetChannelEntry()`
   * qui la retire définitivement — mais n'a plus d'effet visuel tant
   * qu'elle n'est pas re-visible : ce filtre est ce qui l'exclut du calcul
   * à chaque rendu, sans avoir à la retirer activement de l'état.
   * @param {string[]} [visibleChannels] - voir `getVisibleChannels()`.
   * @returns {string[]}
   */
  function getActiveFeaturedChannels(visibleChannels) {
    const visible = visibleChannels || getVisibleChannels();
    return state.featuredChannels.filter((channel) => visible.includes(channel));
  }

  /**
   * Indique si la mise en avant doit s'appliquer visuellement (une ou
   * deux tuiles occupant chacune un quart de la zone, en haut, voir
   * `getDefaultPins()`, section 5). Il faut :
   *  - qu'au moins une chaîne mise en avant soit encore visible (voir
   *    `getActiveFeaturedChannels()`) ;
   *  - qu'il reste au moins une AUTRE chaîne visible à côté d'elle(s),
   *    sinon la mise en avant n'a pas de sens (rien avec quoi "partager"
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
    const active = getActiveFeaturedChannels(visible);
    return active.length > 0 && visible.length > active.length;
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
      localStorage.setItem(STORAGE_KEY_FEATURED, JSON.stringify(state.featuredChannels));
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
      // `savedVisible === null` : première visite, rien encore en
      // localStorage — le chat démarre alors MASQUÉ par défaut (voir
      // aussi `state.chatVisible` plus haut et `#chat-panel` dans
      // index.html, qui porte `hidden` dès le HTML pour éviter un flash
      // de panneau visible avant que ce script ne s'exécute).
      const savedVisible = localStorage.getItem(STORAGE_KEY_CHAT_VISIBLE);
      state.chatVisible = savedVisible === null ? false : JSON.parse(savedVisible);
    } catch (err) {
      state.chatVisible = false;
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
    // Écarte les dispositions illisibles, et la partie "tailles" de celles
    // dont elle est corrompue (voir sanitizePresets(), section 11).
    state.presets = sanitizePresets(state.presets);

    try {
      // Une version antérieure de StreamWall stockait ici une simple
      // chaîne de caractères (un seul stream pouvait être mis en avant),
      // pas un JSON valide : `JSON.parse()` échoue alors proprement sur
      // cette ancienne valeur et tombe dans le `catch` ci-dessous, qui
      // repart simplement sans aucune mise en avant — migration silencieuse
      // sans planter, au prix de perdre ce seul réglage lors de la mise à
      // jour (compromis largement acceptable pour un état aussi mineur).
      const savedFeatured = localStorage.getItem(STORAGE_KEY_FEATURED);
      state.featuredChannels = savedFeatured ? JSON.parse(savedFeatured) : [];
    } catch (err) {
      state.featuredChannels = [];
    }
    if (!Array.isArray(state.featuredChannels)) state.featuredChannels = [];
    // Défense en profondeur si le localStorage a été modifié manuellement
    // (ou date d'une ancienne version stockant une simple chaîne) : ne
    // jamais dépasser MAX_FEATURED_CHANNELS.
    state.featuredChannels = state.featuredChannels
      .filter((channel) => typeof channel === "string")
      .slice(0, MAX_FEATURED_CHANNELS);

    const visible = getVisibleChannels();
    if (!visible.includes(state.chatChannel)) {
      state.chatChannel = visible[0] || null;
    }

    writeChannelsToHash();
  }

  /* ==========================================================================
   * 5. DISPOSITION DES TUILES : 100% DE L'ESPACE, TAILLES AJUSTABLES PAR L'ANGLE
   * ========================================================================== */

  /*
   * MODÈLE DE DISPOSITION (à lire en premier)
   *
   * La zone vidéo est PAVÉE en CELLULES : des rectangles qui se touchent,
   * sans trou ni chevauchement, et dont la réunion est exactement la zone
   * entière. Chaque tuile occupe une cellule (elle en est la version
   * réduite de `GRID_GAP / 2` sur chaque côté qui touche une autre tuile :
   * c'est ce qui crée l'écart entre deux tuiles voisines). Comme les
   * cellules pavent toute la zone, les tuiles remplissent TOUJOURS 100% de
   * l'espace disponible, quel que soit leur nombre, quelles que soient
   * leurs tailles : aucune case vide.
   *
   * EMPLACEMENTS. Les streams visibles occupent des EMPLACEMENTS numérotés :
   * d'abord les streams mis en avant (dans l'ordre de
   * `state.featuredChannels`), puis tous les autres dans l'ordre
   * d'affichage. Le stream n°i s'affiche dans l'emplacement n°i. Réordonner
   * les streams (glisser-déposer, flèches) échange donc des emplacements
   * sans toucher aux tailles : elles appartiennent aux EMPLACEMENTS, pas
   * aux chaînes.
   *
   * ÉPINGLES ET TUILES LIBRES. Un emplacement est soit ÉPINGLÉ, soit LIBRE :
   *  - une ÉPINGLE (`Pin`) est un rectangle voulu, en FRACTIONS de la zone
   *    (`x0`, `y0`, `x1`, `y1` entre 0 et 1) — jamais des pixels, pour
   *    survivre telles quelles à un redimensionnement de la fenêtre, à
   *    l'ouverture du chat, etc. Les streams mis en avant sont épinglés par
   *    défaut (le quart supérieur gauche pour un seul, les deux quarts
   *    supérieurs pour deux : voir `getDefaultPins()`), et tout emplacement
   *    que l'utilisateur redimensionne à la main le devient à son tour ;
   *  - un emplacement LIBRE n'impose rien : le solveur (voir plus bas) lui
   *    donne la place qui reste, en gardant les tuiles libres de taille à
   *    peu près ÉGALE entre elles.
   *
   * LE SOLVEUR (`solveLayout()`) découpe récursivement la zone en deux par
   * une coupe horizontale ou verticale (une "partition guillotine"). Une
   * coupe passe toujours par le bord d'une épingle, sans jamais en
   * traverser une : les épingles sont donc respectées exactement, tant qu'il
   * reste assez de tuiles libres pour remplir l'espace autour. Les tuiles
   * libres sont réparties entre les deux côtés au prorata de leur espace
   * LIBRE (surface moins celle des épingles), de façon à ce que les tuiles
   * aient des surfaces les plus proches possible d'un côté à l'autre ; une
   * région sans épingle est remplie par une grille régulière
   * (`evenGridCells()`). C'est ce qui fait que, quand on agrandit une
   * tuile, TOUTES les autres se réorganisent autour d'elle en gardant une
   * taille comparable, au lieu que seules les voisines rétrécissent.
   * Quand il ne reste pas assez de tuiles libres pour remplir l'espace
   * autour d'une épingle, celle-ci est étirée jusqu'au bord de sa région
   * (elle ne peut pas laisser de trou). Le solveur REVIENT EN ARRIÈRE quand
   * une répartition des tuiles libres mène à une impasse plus bas, et,
   * s'il n'existe vraiment aucune disposition qui respecte toutes les
   * épingles, abandonne les moins prioritaires une à une (voir
   * `solveLayout()`) plutôt que de laisser un trou. Pour une disposition
   * ajustée à la main, il COMPARE en plus plusieurs stratégies (ordre des
   * coupes, marges fines avalées ou non : voir `LAYOUT_STRATEGIES`) et garde
   * celle dont la plus petite VIDÉO est la plus grande : c'est ce qui évite
   * qu'une tuile agrandie laisse à côté d'elle une "lamelle" (une tuile
   * étroite ou aplatie dont la vidéo 16:9 est minuscule) alors que les autres
   * rangées gardent de grandes tuiles.
   *
   * DISPOSITION PAR DÉFAUT OU MANUELLE. Tant que l'utilisateur n'a rien
   * redimensionné, les épingles sont celles par défaut (aucune sans mise en
   * avant : tout est libre) et la disposition est recalculée à chaque fois
   * d'après la taille de la zone. Au premier redimensionnement, les
   * épingles en vigueur sont FIGÉES et mémorisées (`manualLayouts`,
   * persisté en localStorage) sous une signature
   * `"<favoris>:<emplacements>"` (voir `getLayoutSignature()`) : elles sont
   * réutilisées tant que le nombre de streams ET de favoris reste le même,
   * et retrouvées si on revient plus tard à cette combinaison. Le bouton
   * "Réinitialiser la vue" les oublie.
   *
   * LE REDIMENSIONNEMENT n'existe qu'en mode Réorganiser, via une poignée
   * dans chacun des quatre angles de chaque tuile (voir la fin de cette
   * section).
   */

  /**
   * @typedef {{x: number, y: number, w: number, h: number}} Rect
   * @typedef {{x0: number, y0: number, x1: number, y1: number}} Pin
   */

  /** Tolérance (en pixels) des comparaisons de coordonnées. */
  const LAYOUT_EPSILON = 0.5;

  /** Taille minimale d'une CELLULE : celle d'une tuile, plus l'écart. */
  const MIN_CELL_WIDTH = MIN_TILE_WIDTH + GRID_GAP;
  const MIN_CELL_HEIGHT = MIN_TILE_HEIGHT + GRID_GAP;

  /** Nombre maximum de répartitions de tuiles libres essayées pour une même
   *  coupe, de la meilleure à la moins bonne (voir `allocationOptions()`). */
  const MAX_ALLOCATION_OPTIONS = 4;

  /**
   * Stratégies que `solveLayout()` compare quand des tuiles ont été
   * redimensionnées à la main : il garde celle qui donne la plus grande
   * PLUS PETITE VIDÉO (voir `getFreeVideoQuality()`).
   *  - `axes` : l'ordre dans lequel les coupes sont essayées. Horizontales
   *    d'abord donne des bandes pleine largeur au-dessus et en dessous d'une
   *    tuile ; verticales d'abord, des colonnes pleine hauteur à sa gauche et
   *    à sa droite. Selon la position de la tuile, l'un des deux évite des
   *    tuiles très aplaties ;
   *  - `snapVideoWidth` : si une marge entre une tuile redimensionnée et le
   *    bord de sa région ne laisserait à une tuile libre qu'une vidéo plus
   *    étroite que cela (en pixels), la marge est AVALÉE par la tuile
   *    redimensionnée (elle s'étire jusqu'au bord) au lieu de recevoir une
   *    tuile libre. 0 : seules les marges trop fines pour une tuile (voir
   *    `fitPinnedCell()`). Une marge à peine assez large pour une tuile donne
   *    une LAMELLE (par exemple 150 × 300 px, dont la vidéo 16:9 ne fait que
   *    150 × 84) : mieux vaut, si la comparaison le montre, que la tuile
   *    s'étire. Deux niveaux (170 et 220 px), volontairement modestes :
   *    l'étirement est un "aimant" qui empêche de laisser une marge plus fine
   *    que lui, et un aimant trop fort donnerait l'impression qu'un
   *    glissement ne fait rien (le seuil est de toute façon plafonné à 14% de
   *    la zone, voir `getSnapForVideoWidth()`).
   * L'ordre est celui de préférence : à qualité (presque) égale, la première
   * gagne, donc la disposition la plus proche de ce que l'utilisateur a
   * demandé.
   */
  const LAYOUT_STRATEGIES = [
    { axes: ["y", "x"], snapVideoWidth: 0 },
    { axes: ["x", "y"], snapVideoWidth: 0 },
    { axes: ["y", "x"], snapVideoWidth: 170 },
    { axes: ["x", "y"], snapVideoWidth: 170 },
    { axes: ["y", "x"], snapVideoWidth: 220 },
    { axes: ["x", "y"], snapVideoWidth: 220 },
  ];

  /** Une stratégie n'est retenue au détriment d'une plus préférée que si sa
   *  plus petite vidéo est au moins de 3% plus grande : évite de changer de
   *  disposition pour un gain négligeable. */
  const STRATEGY_MIN_GAIN = 1.03;

  /** Nombre maximum d'appels récursifs de `solveRegion()` par tentative :
   *  borne le retour en arrière pour qu'un cas pathologique ne puisse jamais
   *  figer la page. Très largement suffisant en pratique (une disposition
   *  ordinaire en demande quelques dizaines). */
  const SOLVER_BUDGET = 600;

  /** Borne `value` entre `min` et `max`. */
  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * Détermine, pour un nombre de tuiles donné et un espace donné, le nombre
   * de colonnes/lignes qui se rapproche le plus d'une disposition "au format
   * vidéo standard" (16:9 par tuile).
   *
   * Cette fonction ne fixe PAS la taille finale des tuiles : elle sert
   * uniquement à CHOISIR le nombre de rangées d'une grille régulière (voir
   * `evenGridCells()`). Pour départager les candidats, on simule la taille
   * qu'aurait une tuile 16:9 dans chaque grille candidate (en la contraignant
   * par la dimension la plus limitante de sa cellule) et on retient celle
   * qui donnerait la plus grande tuile : un bon indicateur de "quelle
   * disposition ressemble le plus à une vraie grille vidéo".
   *
   * Principe : pour chaque nombre de colonnes possible (de 1 à N), on en
   * déduit le nombre de lignes nécessaires (arrondi supérieur), puis la
   * taille que prendrait une tuile 16:9 dans la cellule résultante.
   *
   * @param {number} containerWidth  largeur disponible en pixels
   * @param {number} containerHeight hauteur disponible en pixels
   * @param {number} itemCount       nombre de tuiles à placer
   * @param {number} gap             écart entre tuiles en pixels
   * @param {number} aspectRatio     ratio largeur/hauteur cible d'une tuile
   * @returns {{cols:number, rows:number, tileWidth:number, tileHeight:number}|null}
   *   `tileWidth`/`tileHeight` ne sont que la taille SIMULÉE ayant servi à
   *   départager les candidats.
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

  /* ---- Géométrie des cellules ---- */

  /**
   * Convertit une épingle (fractions) en cellule (pixels).
   * @param {Pin} pin
   * @param {number} width
   * @param {number} height
   * @returns {Rect}
   */
  function pinToCell(pin, width, height) {
    return {
      x: pin.x0 * width,
      y: pin.y0 * height,
      w: (pin.x1 - pin.x0) * width,
      h: (pin.y1 - pin.y0) * height,
    };
  }

  /**
   * Convertit une cellule (pixels) en épingle (fractions).
   * @param {Rect} cell
   * @param {number} width
   * @param {number} height
   * @returns {Pin}
   */
  function cellToPin(cell, width, height) {
    return {
      x0: cell.x / width,
      y0: cell.y / height,
      x1: (cell.x + cell.w) / width,
      y1: (cell.y + cell.h) / height,
    };
  }

  /** Deux cellules se chevauchent-elles (surface commune non nulle) ? */
  function cellsOverlap(a, b) {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return overlapX > LAYOUT_EPSILON && overlapY > LAYOUT_EPSILON;
  }

  /**
   * La tuile d'une cellule : la cellule, réduite de la moitié de l'écart sur
   * chaque côté qui touche une AUTRE cellule (pas sur ceux qui touchent le
   * bord de la zone). Deux tuiles voisines sont ainsi séparées d'un écart
   * `GRID_GAP` exact, et les tuiles collées au bord de la zone n'ont aucune
   * marge de plus que le padding du conteneur.
   * @param {Rect} cell
   * @param {number} width largeur de la zone
   * @param {number} height hauteur de la zone
   * @returns {Rect}
   */
  function cellToTile(cell, width, height) {
    const half = GRID_GAP / 2;
    const left = cell.x > LAYOUT_EPSILON ? half : 0;
    const top = cell.y > LAYOUT_EPSILON ? half : 0;
    const right = cell.x + cell.w < width - LAYOUT_EPSILON ? half : 0;
    const bottom = cell.y + cell.h < height - LAYOUT_EPSILON ? half : 0;
    return {
      x: cell.x + left,
      y: cell.y + top,
      w: Math.max(0, cell.w - left - right),
      h: Math.max(0, cell.h - top - bottom),
    };
  }

  /**
   * Pave `region` avec `count` cellules régulières : des rangées de hauteur
   * égale, chacune découpée en cellules de largeur égale. Le nombre de
   * rangées vient de `computeBestGrid()` (la grille qui donnerait les plus
   * grandes tuiles 16:9 pour cet espace). Les `count` cellules sont réparties
   * aussi également que possible sur les rangées (5 sur 2 rangées : 3 + 2 ;
   * 7 sur 3 : 3 + 2 + 2), et chaque rangée occupe toute la largeur — d'où les
   * 100% de l'espace, même quand `count` n'est pas un produit rond.
   * @param {Rect} region
   * @param {number} count nombre de cellules (≥ 1)
   * @returns {Rect[]} dans l'ordre de lecture (haut en bas, gauche à droite)
   */
  function evenGridCells(region, count) {
    const grid = computeBestGrid(region.w, region.h, count, GRID_GAP, TILE_ASPECT_RATIO);
    // Repli (région minuscule où aucune grille ne tient) : à peu près carrée.
    const rows = grid ? grid.rows : Math.ceil(Math.sqrt(count));

    // Les `extra` premières rangées reçoivent une cellule de plus. `base`
    // vaut toujours au moins 1, car `rows` = ceil(count / cols) ≤ count.
    const base = Math.floor(count / rows);
    const extra = count % rows;

    const cells = [];
    for (let row = 0; row < rows; row++) {
      const inRow = base + (row < extra ? 1 : 0);
      const top = region.y + (region.h * row) / rows;
      const bottom = region.y + (region.h * (row + 1)) / rows;
      for (let col = 0; col < inRow; col++) {
        const left = region.x + (region.w * col) / inRow;
        const right = region.x + (region.w * (col + 1)) / inRow;
        cells.push({ x: left, y: top, w: right - left, h: bottom - top });
      }
    }
    return cells;
  }

  /* ---- Le solveur ---- */

  /**
   * Ramène une épingle (en pixels) dans `region` et la rend exploitable :
   *  - bornée à la région ;
   *  - agrandie à la taille minimale d'une cellule si elle est plus petite ;
   *  - "aimantée" au bord de la région dès que la marge qui reste de ce côté
   *    est plus mince que `snap` — par défaut une cellule : une telle marge ne
   *    pourrait de toute façon pas accueillir une tuile, elle ne serait que
   *    du vide. Un seuil plus grand (voir `LAYOUT_STRATEGIES`) avale aussi les
   *    marges qui ne donneraient qu'une lamelle.
   * @param {Rect} cell
   * @param {Rect} region
   * @param {{w: number, h: number}} [snap] largeur/hauteur de marge en dessous
   *   desquelles la tuile est aimantée au bord
   * @returns {Rect}
   */
  function fitPinnedCell(cell, region, snap = { w: MIN_CELL_WIDTH, h: MIN_CELL_HEIGHT }) {
    const regionRight = region.x + region.w;
    const regionBottom = region.y + region.h;

    let x0 = clampNumber(cell.x, region.x, regionRight);
    let x1 = clampNumber(cell.x + cell.w, region.x, regionRight);
    let y0 = clampNumber(cell.y, region.y, regionBottom);
    let y1 = clampNumber(cell.y + cell.h, region.y, regionBottom);

    if (x1 - x0 < MIN_CELL_WIDTH) {
      x1 = Math.min(regionRight, x0 + MIN_CELL_WIDTH);
      x0 = Math.max(region.x, x1 - MIN_CELL_WIDTH);
    }
    if (y1 - y0 < MIN_CELL_HEIGHT) {
      y1 = Math.min(regionBottom, y0 + MIN_CELL_HEIGHT);
      y0 = Math.max(region.y, y1 - MIN_CELL_HEIGHT);
    }

    if (x0 - region.x < snap.w) x0 = region.x;
    if (regionRight - x1 < snap.w) x1 = regionRight;
    if (y0 - region.y < snap.h) y0 = region.y;
    if (regionBottom - y1 < snap.h) y1 = regionBottom;

    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Les deux régions produites par une coupe de `region` selon `axis`, à la
   * coordonnée `at` : `"y"` = coupe horizontale (A en haut, B en bas), `"x"` =
   * coupe verticale (A à gauche, B à droite).
   * @param {Rect} region
   * @param {"x"|"y"} axis
   * @param {number} at
   * @returns {[Rect, Rect]}
   */
  function splitRegion(region, axis, at) {
    return axis === "y"
      ? [
          { x: region.x, y: region.y, w: region.w, h: at - region.y },
          { x: region.x, y: at, w: region.w, h: region.y + region.h - at },
        ]
      : [
          { x: region.x, y: region.y, w: at - region.x, h: region.h },
          { x: at, y: region.y, w: region.x + region.w - at, h: region.h },
        ];
  }

  /**
   * Les coupes candidates d'une région, dans l'ordre de préférence. Les
   * candidats sont les bords des épingles (une coupe y est collée à l'épingle,
   * sans la déformer), essayés d'abord à l'horizontale, de haut en bas, puis à
   * la verticale, de gauche à droite : c'est ce qui donne, pour un favori dans
   * le coin supérieur gauche, une région à sa droite puis une région en
   * dessous. Une coupe qui traverserait une épingle, ou qui laisserait moins
   * d'une cellule minimale d'un côté, n'est pas candidate.
   *
   * @param {Rect} region
   * @param {{cell: Rect}[]} pinned les épingles de la région (déjà ajustées)
   * @param {("x"|"y")[]} [axes] l'ordre dans lequel essayer les axes (voir
   *   `LAYOUT_STRATEGIES`)
   * @returns {Generator<{axis: "x"|"y", at: number, before: {cell: Rect}[],
   *   after: {cell: Rect}[], regionBefore: Rect, regionAfter: Rect}>}
   */
  function* candidateCuts(region, pinned, axes = ["y", "x"]) {
    for (const axis of axes) {
      const start = axis === "y" ? "y" : "x";
      const size = axis === "y" ? "h" : "w";
      const minSide = axis === "y" ? MIN_CELL_HEIGHT : MIN_CELL_WIDTH;
      const low = region[start] + minSide;
      const high = region[start] + region[size] - minSide;

      // Les bords des épingles, dédoublonnés (au centième de pixel), triés.
      const edges = new Set();
      pinned.forEach(({ cell }) => {
        edges.add(Math.round(cell[start] * 100) / 100);
        edges.add(Math.round((cell[start] + cell[size]) * 100) / 100);
      });

      for (const at of [...edges].sort((a, b) => a - b)) {
        if (at < low - LAYOUT_EPSILON || at > high + LAYOUT_EPSILON) continue;

        const before = pinned.filter(({ cell }) => cell[start] + cell[size] <= at + LAYOUT_EPSILON);
        const after = pinned.filter(({ cell }) => cell[start] >= at - LAYOUT_EPSILON);
        // Une épingle qui n'est d'aucun côté est traversée par la coupe.
        if (before.length + after.length !== pinned.length) continue;

        const [regionBefore, regionAfter] = splitRegion(region, axis, at);
        yield { axis, at, before, after, regionBefore, regionAfter };
      }
    }
  }

  /**
   * Combien de zones libres (donc de tuiles libres, au minimum une chacune)
   * faut-il pour remplir `region` autour des épingles `cells` ? Une région
   * sans épingle est une zone ; une région exactement remplie par une épingle
   * n'en a aucune ; sinon on suit la même première coupe que le solveur et on
   * additionne les deux côtés. Par exemple une épingle au milieu d'une bande
   * laisse une zone à sa gauche ET une à sa droite : il en faut deux, pas une
   * (c'est ce que la surface libre seule ne dit pas).
   * @param {Rect} region
   * @param {Rect[]} cells épingles de la région (en pixels)
   * @param {LayoutStrategy} strategy
   * @returns {number}
   */
  function countFreeRegions(region, cells, strategy) {
    if (cells.length === 0) return 1;
    const fitted = cells.map((cell) => fitPinnedCell(cell, region, strategy.snap));
    if (
      fitted.length === 1 &&
      fitted[0].w >= region.w - LAYOUT_EPSILON &&
      fitted[0].h >= region.h - LAYOUT_EPSILON
    ) {
      return 0;
    }
    for (const cut of candidateCuts(region, fitted.map((cell) => ({ cell })), strategy.axes)) {
      return (
        countFreeRegions(cut.regionBefore, cut.before.map((entry) => entry.cell), strategy) +
        countFreeRegions(cut.regionAfter, cut.after.map((entry) => entry.cell), strategy)
      );
    }
    return 0;
  }

  /**
   * Les répartitions possibles de `autoCount` tuiles libres entre les deux
   * côtés d'une coupe, de la meilleure à la moins bonne (au plus
   * `MAX_ALLOCATION_OPTIONS`). La meilleure est celle qui donne aux tuiles
   * des surfaces les plus proches possible d'un côté à l'autre ; les
   * suivantes ne servent que si la meilleure échoue plus bas dans la
   * récursion (voir `solveRegion()`).
   *
   * Pour chaque côté, `need` est le nombre de zones libres à remplir (voir
   * `countFreeRegions()`) :
   *  - un côté qui n'en a AUCUNE (ses épingles le remplissent) ne peut pas
   *    recevoir de tuile libre : elle n'aurait nulle part où aller ;
   *  - un côté SANS épingle doit recevoir au moins une tuile libre
   *    (contrainte dure : sinon il resterait vide) ;
   *  - un côté qui a des épingles devrait en recevoir au moins `need`, sinon
   *    une zone libre serait perdue (une épingle y serait étirée pour la
   *    combler : contrainte souple, qu'on n'écarte qu'en dernier recours, et
   *    d'autant plus fort que le manque est grand) ;
   *  - entre les répartitions restantes, on classe par rapport croissant
   *    entre la plus grande et la plus petite surface de tuile.
   *
   * @param {{need: number, free: number, pinned: boolean}} sideA le côté A :
   *   zones libres à remplir, surface libre, contient-il des épingles ?
   * @param {{need: number, free: number, pinned: boolean}} sideB idem pour B
   * @param {number} autoCount nombre de tuiles libres à répartir
   * @returns {{autosA: number, autosB: number}[]} vide si la coupe est
   *   irréalisable (pas assez de tuiles libres pour les côtés qui en exigent)
   */
  function allocationOptions(sideA, sideB, autoCount) {
    const minAutosA = sideA.pinned ? 0 : 1;
    const minAutosB = sideB.pinned ? 0 : 1;
    const maxAutosA = sideA.need === 0 ? 0 : autoCount;
    const maxAutosB = sideB.need === 0 ? 0 : autoCount;

    const options = [];
    for (let autosA = minAutosA; autosA <= Math.min(maxAutosA, autoCount - minAutosB); autosA++) {
      const autosB = autoCount - autosA;
      if (autosB > maxAutosB) continue;

      // Chaque zone libre qui reste sans tuile est un manque.
      const shortfall = Math.max(0, sideA.need - autosA) + Math.max(0, sideB.need - autosB);
      let cost = 1e9 * shortfall;

      const perTile = [];
      if (autosA > 0) perTile.push(sideA.free / autosA);
      if (autosB > 0) perTile.push(sideB.free / autosB);
      if (perTile.length === 2) {
        const smallest = Math.min(...perTile);
        cost += smallest > 0 ? Math.max(...perTile) / smallest : 1e6;
      }

      options.push({ autosA, autosB, cost });
    }
    return options.sort((a, b) => a.cost - b.cost).slice(0, MAX_ALLOCATION_OPTIONS);
  }

  /**
   * Les coupes possibles d'une région, dans l'ordre de préférence (voir
   * `candidateCuts()`), chacune avec ses répartitions des tuiles libres (voir
   * `allocationOptions()`).
   *
   * @param {Rect} region
   * @param {{index: number, cell: Rect|null}[]} entries
   * @param {LayoutStrategy} strategy
   * @returns {Generator<{axis: "x"|"y", at: number, autosA: number}>}
   */
  function* cutOptions(region, entries, strategy) {
    const pinned = entries.filter((entry) => entry.cell);
    const autoCount = entries.length - pinned.length;

    for (const cut of candidateCuts(region, pinned, strategy.axes)) {
      // Surface libre de chaque côté : celle de la sous-région moins celle des
      // épingles telles qu'elles y seront AJUSTÉES (fitPinnedCell aimante au
      // bord une épingle dont la marge est plus mince qu'une cellule : elle
      // occupe alors davantage que sa taille d'origine).
      const describe = (side, list) => {
        const cells = list.map((entry) => entry.cell);
        const occupied = cells.reduce((sum, cell) => {
          const fitted = fitPinnedCell(cell, side, strategy.snap);
          return sum + fitted.w * fitted.h;
        }, 0);
        return {
          need: countFreeRegions(side, cells, strategy),
          free: Math.max(0, side.w * side.h - occupied),
          pinned: list.length > 0,
        };
      };

      for (const option of allocationOptions(
        describe(cut.regionBefore, cut.before),
        describe(cut.regionAfter, cut.after),
        autoCount
      )) {
        yield { axis: cut.axis, at: cut.at, autosA: option.autosA };
      }
    }
  }

  /**
   * Pave `region` avec les tuiles de `entries`. Récursif : voir le bloc
   * d'en-tête de cette section pour le principe.
   *
   * Le solveur revient en arrière : la première coupe (et la première
   * répartition des tuiles libres) est essayée jusqu'au bout, et si l'une des
   * deux sous-régions ne peut pas être pavée (par exemple parce qu'on y a
   * envoyé une tuile libre alors que les épingles ajustées n'y laissent
   * aucune place), on essaie la suivante. Le nombre d'appels est borné par
   * `budget` pour qu'un cas pathologique ne puisse jamais figer la page.
   *
   * @param {Rect} region
   * @param {{index: number, cell: Rect|null}[]} entries les emplacements de
   *   cette région, dans l'ordre ; `cell` est l'épingle en pixels, ou `null`
   *   pour un emplacement libre
   * @param {{left: number}} budget nombre d'appels encore autorisés
   * @param {LayoutStrategy} strategy ordre des coupes et seuil d'aimantation
   * @returns {[number, Rect][]|null} la cellule de chaque emplacement
   *   (`[index, cellule]`), ou `null` si les épingles ne peuvent pas être
   *   respectées dans cette région
   */
  function solveRegion(region, entries, budget, strategy) {
    if (--budget.left < 0) return null;
    if (entries.length === 0) return [];
    if (entries.length === 1) {
      // Un seul emplacement : il prend toute la région (une épingle plus
      // petite est étirée, elle ne peut pas laisser de trou).
      return [[entries[0].index, region]];
    }

    if (!entries.some((entry) => entry.cell)) {
      // Aucune épingle : une grille régulière.
      return evenGridCells(region, entries.length).map((cell, i) => [entries[i].index, cell]);
    }

    const fitted = entries.map((entry) =>
      entry.cell ? { index: entry.index, cell: fitPinnedCell(entry.cell, region, strategy.snap) } : entry
    );

    for (const { axis, at, autosA } of cutOptions(region, fitted, strategy)) {
      const [regionA, regionB] = splitRegion(region, axis, at);

      // Répartition des emplacements, en conservant leur ordre : une épingle
      // va du côté où elle se trouve, les tuiles libres sont attribuées dans
      // l'ordre, `autosA` premières au côté A.
      const start = axis === "y" ? "y" : "x";
      const size = axis === "y" ? "h" : "w";
      const listA = [];
      const listB = [];
      let autosLeftForA = autosA;
      fitted.forEach((entry) => {
        if (entry.cell) {
          (entry.cell[start] + entry.cell[size] <= at + LAYOUT_EPSILON ? listA : listB).push(entry);
        } else if (autosLeftForA > 0) {
          autosLeftForA--;
          listA.push(entry);
        } else {
          listB.push(entry);
        }
      });

      const partA = solveRegion(regionA, listA, budget, strategy);
      if (!partA) continue;
      const partB = solveRegion(regionB, listB, budget, strategy);
      if (!partB) continue;
      return partA.concat(partB);
    }
    return null;
  }

  /**
   * @typedef {{axes: ("x"|"y")[], snap: {w: number, h: number}}} LayoutStrategy
   */

  /**
   * Largeur et hauteur de marge (en pixels) en dessous desquelles une tuile
   * redimensionnée avale la marge, pour qu'une tuile libre y ait une vidéo
   * d'au moins `videoWidth` pixels de large (voir `LAYOUT_STRATEGIES`). Une
   * tuile qui reçoit une vidéo de cette largeur a la hauteur correspondante
   * en 16:9 ; le seuil est plafonné à 14% de la zone, pour les petites
   * fenêtres. Jamais en dessous d'une cellule minimale.
   * @param {number} videoWidth
   * @param {number} zoneWidth
   * @returns {{w: number, h: number}}
   */
  function getSnapForVideoWidth(videoWidth, zoneWidth) {
    if (videoWidth <= 0) return { w: MIN_CELL_WIDTH, h: MIN_CELL_HEIGHT };
    const video = Math.min(videoWidth, 0.14 * zoneWidth);
    return {
      w: Math.max(MIN_CELL_WIDTH, video + GRID_GAP),
      h: Math.max(MIN_CELL_HEIGHT, video / TILE_ASPECT_RATIO + GRID_GAP),
    };
  }

  /**
   * Qualité d'une disposition pour ce qui compte à l'écran : la largeur de la
   * plus petite VIDÉO parmi les tuiles LIBRES (celles que le solveur place,
   * pas celles que l'utilisateur a tirées). La vidéo Twitch garde son format
   * 16:9 dans la tuile : une tuile très étroite ou très aplatie a beau avoir
   * une surface honnête, sa vidéo est minuscule (une lamelle de 150 × 300 px
   * n'affiche qu'une vidéo de 150 × 84). On prend donc, pour chaque tuile, la
   * largeur de la plus grande vidéo 16:9 qui y tient, et on retient la plus
   * petite. `Infinity` s'il n'y a aucune tuile libre.
   * @param {Rect[]} cells
   * @param {(Pin|null)[]} pinsBySlot
   * @param {number} width
   * @param {number} height
   * @returns {number}
   */
  function getFreeVideoQuality(cells, pinsBySlot, width, height) {
    let quality = Infinity;
    cells.forEach((cell, slot) => {
      if (pinsBySlot[slot]) return;
      const tile = cellToTile(cell, width, height);
      quality = Math.min(quality, tile.w, tile.h * TILE_ASPECT_RATIO);
    });
    return quality;
  }

  /**
   * Calcule la cellule de chaque emplacement.
   *
   * Si les épingles ne peuvent pas toutes être respectées (peu de tuiles
   * libres pour remplir l'espace autour, épingles qui se chevauchent dans un
   * stockage modifié à la main, disposition qu'un découpage en deux ne sait
   * pas produire…), on abandonne les MOINS prioritaires une à une, jusqu'à
   * trouver une disposition qui pave la zone. Jamais de trou : sans aucune
   * épingle, la disposition est toujours possible. Par défaut, la priorité est
   * l'ordre des emplacements (les favoris, aux premiers numéros, en dernier
   * abandonnés) ; `priority` la modifie, en tête les emplacements à garder
   * coûte que coûte (voir `isValidSlotCell()` : la tuile qu'on est en train de
   * tirer).
   *
   * Avec `explore`, plusieurs stratégies sont comparées (voir
   * `LAYOUT_STRATEGIES`) : on garde celle qui conserve le plus d'épingles,
   * puis celle dont la plus petite vidéo est la plus grande
   * (`getFreeVideoQuality()`). C'est ce qui évite les lamelles quand une
   * tuile est agrandie ailleurs qu'au bord. Sans `explore`, seule la première
   * stratégie est essayée : c'est la disposition par défaut d'un ou deux
   * favoris, qui garde toujours le même dessin.
   *
   * @param {(Pin|null)[]} pinsBySlot une épingle (fractions) ou `null` par
   *   emplacement, dans l'ordre des emplacements
   * @param {number} width largeur de la zone (pixels)
   * @param {number} height hauteur de la zone (pixels)
   * @param {boolean} [explore] comparer plusieurs stratégies (dispositions
   *   ajustées à la main) plutôt qu'appliquer la première
   * @param {number[]} [priority] emplacements à garder en priorité, du plus
   *   prioritaire au moins prioritaire ; les autres suivent dans l'ordre des
   *   emplacements
   * @returns {{cells: Rect[], complete: boolean, keptSlots: number[]}} une
   *   cellule par emplacement, dans le même ordre ; `complete` est `false` si
   *   des épingles ont dû être abandonnées, et `keptSlots` liste celles qui
   *   ont été respectées
   */
  function solveLayout(pinsBySlot, width, height, explore = false, priority = []) {
    let complete = true;

    // Ordre de priorité des épingles : `priority` d'abord, puis les autres
    // par numéro d'emplacement.
    const pinnedSlots = pinsBySlot.map((pin, slot) => (pin ? slot : -1)).filter((slot) => slot >= 0);
    const order = [
      ...priority.filter((slot) => pinnedSlots.includes(slot)),
      ...pinnedSlots.filter((slot) => !priority.includes(slot)),
    ];

    // Une épingle qui en chevauche une AUTRE, plus prioritaire, est abandonnée
    // d'office : deux épingles ne peuvent pas occuper la même place. (Ne
    // devrait arriver qu'avec un stockage modifié à la main : un
    // redimensionnement n'en produit jamais.)
    const kept = [];
    const cellBySlot = new Map();
    order.forEach((slot) => {
      const cell = pinToCell(pinsBySlot[slot], width, height);
      if (kept.some((other) => cellsOverlap(other, cell))) {
        complete = false;
      } else {
        kept.push(cell);
        cellBySlot.set(slot, cell);
      }
    });
    const entries = pinsBySlot.map((_, index) => ({ index, cell: cellBySlot.get(index) || null }));
    const honorable = order.filter((slot) => cellBySlot.has(slot));

    const root = { x: 0, y: 0, w: width, h: height };
    const strategies = (explore && honorable.length > 0 ? LAYOUT_STRATEGIES : LAYOUT_STRATEGIES.slice(0, 1)).map(
      (strategy) => ({
        axes: strategy.axes,
        snap: getSnapForVideoWidth(strategy.snapVideoWidth, width),
      })
    );

    let best = null;
    for (const strategy of strategies) {
      // Pour cette stratégie : la disposition qui garde le plus d'épingles
      // possible, en abandonnant d'abord les moins prioritaires.
      let attempt = null;
      for (let keep = honorable.length; keep >= 0 && !attempt; keep--) {
        const active = new Set(honorable.slice(0, keep));
        const trial = entries.map((entry) => (active.has(entry.index) ? entry : { index: entry.index, cell: null }));
        const pairs = solveRegion(root, trial, { left: SOLVER_BUDGET }, strategy);
        if (pairs) {
          const cells = new Array(pinsBySlot.length);
          pairs.forEach(([index, cell]) => {
            cells[index] = cell;
          });
          const slots = trial.map((entry) => (entry.cell ? pinsBySlot[entry.index] : null));
          attempt = { cells, keep, quality: getFreeVideoQuality(cells, slots, width, height) };
        }
      }
      if (!attempt) continue;
      if (
        !best ||
        attempt.keep > best.keep ||
        (attempt.keep === best.keep && attempt.quality > best.quality * STRATEGY_MIN_GAIN)
      ) {
        best = attempt;
      }
    }

    if (best) {
      return {
        cells: best.cells,
        complete: complete && best.keep === honorable.length,
        keptSlots: honorable.slice(0, best.keep),
      };
    }
    // Inatteignable : avec `keep = 0` (aucune épingle), `solveRegion` réussit
    // toujours. Garde-fou pour ne jamais renvoyer un tableau incomplet.
    return { cells: evenGridCells(root, pinsBySlot.length), complete: false, keptSlots: [] };
  }

  /**
   * Note de lisibilité d'une disposition : le plus petit rapport, sur toutes
   * les tuiles, entre leur taille et la taille minimale (120 × 68 px).
   * Supérieure ou égale à 1 quand toutes les tuiles sont au moins de la
   * taille minimale.
   * @param {Rect[]} cells
   * @param {number} width
   * @param {number} height
   * @returns {number}
   */
  function getLayoutScore(cells, width, height) {
    let score = Infinity;
    cells.forEach((cell) => {
      const tile = cellToTile(cell, width, height);
      score = Math.min(score, tile.w / MIN_TILE_WIDTH, tile.h / MIN_TILE_HEIGHT);
    });
    return score;
  }

  /**
   * Épingles par défaut : celles des streams mis en avant, placés en tête
   * des emplacements (voir l'en-tête de section).
   *  - deux favoris : les deux quarts supérieurs, côte à côte ;
   *  - un favori et au moins deux autres streams : le quart supérieur
   *    gauche ;
   *  - un favori et un seul autre stream : `FEATURED_SOLO_RATIO` de la
   *    largeur, sur toute la hauteur (un quart laisserait du vide autour de
   *    l'unique autre tuile, alors que la zone doit être remplie à 100%) ;
   *  - aucun favori : aucune épingle, tout est libre.
   * Le solveur en déduit le reste : par exemple, autour du quart supérieur
   * gauche, une région à droite (un quart de la surface) et une en dessous
   * (une moitié), entre lesquelles les autres streams sont répartis au
   * prorata de leur surface.
   *
   * @param {number} featuredCount nombre de streams mis en avant (0, 1 ou 2)
   * @param {number} slotCount nombre total d'emplacements
   * @returns {Record<number, Pin>} épingles par numéro d'emplacement
   */
  function getDefaultPins(featuredCount, slotCount) {
    if (featuredCount === 2) {
      return {
        0: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 },
        1: { x0: 0.5, y0: 0, x1: 1, y1: 0.5 },
      };
    }
    if (featuredCount === 1) {
      const othersCount = slotCount - 1;
      return othersCount === 1
        ? { 0: { x0: 0, y0: 0, x1: FEATURED_SOLO_RATIO, y1: 1 } }
        : { 0: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 } };
    }
    return {};
  }

  /**
   * Épingles (objet emplacement -> épingle) sous forme de tableau, un
   * élément par emplacement (`null` pour un emplacement libre).
   * @param {Record<number, Pin>} pins
   * @param {number} slotCount
   * @returns {(Pin|null)[]}
   */
  function pinsToArray(pins, slotCount) {
    return Array.from({ length: slotCount }, (_, slot) => pins[slot] || null);
  }

  /**
   * Lit la taille utile (hors padding) d'un élément, ainsi que le décalage
   * du padding : les enfants en `position: absolute` sont placés depuis le
   * bord du padding, pas depuis celui de la zone utile.
   * @param {HTMLElement} element
   * @returns {{width:number, height:number, offsetX:number, offsetY:number}}
   */
  function getInnerSize(element) {
    const style = window.getComputedStyle(element);
    const paddingLeft = parseFloat(style.paddingLeft);
    const paddingTop = parseFloat(style.paddingTop);
    const paddingX = paddingLeft + parseFloat(style.paddingRight);
    const paddingY = paddingTop + parseFloat(style.paddingBottom);
    return {
      width: element.clientWidth - paddingX,
      height: element.clientHeight - paddingY,
      offsetX: paddingLeft,
      offsetY: paddingTop,
    };
  }

  /**
   * Convertit un rectangle (relatif à la zone utile) en boîte CSS en pixels
   * entiers, décalée du padding. On arrondit les BORDS et non les tailles :
   * deux tuiles voisines s'appuient alors sur les mêmes pixels de séparation,
   * sans jamais se chevaucher ni laisser de fente supplémentaire (l'écart
   * `GRID_GAP / 2` étant entier de chaque côté, l'écart reste exactement
   * `GRID_GAP` après arrondi).
   * @param {Rect} rect
   * @param {number} offsetX
   * @param {number} offsetY
   * @returns {{left:number, top:number, width:number, height:number}}
   */
  function toPixelBox(rect, offsetX, offsetY) {
    const left = Math.round(offsetX + rect.x);
    const top = Math.round(offsetY + rect.y);
    const right = Math.round(offsetX + rect.x + rect.w);
    const bottom = Math.round(offsetY + rect.y + rect.h);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  /**
   * Applique une boîte en pixels à un élément positionné en absolu.
   * @param {HTMLElement} element
   * @param {{left:number, top:number, width:number, height:number}} box
   */
  function placeBox(element, box) {
    element.style.left = `${box.left}px`;
    element.style.top = `${box.top}px`;
    element.style.width = `${box.width}px`;
    element.style.height = `${box.height}px`;
  }

  /* ---- Mémorisation des dispositions ajustées à la main ---- */

  /**
   * Dispositions figées par un redimensionnement manuel :
   * signature (voir `getLayoutSignature()`) -> épingles par numéro
   * d'emplacement. L'ordre d'insertion sert à évincer les plus anciennes
   * (voir `saveManualLayouts()`).
   * @type {Map<string, Record<number, Pin>>}
   */
  const manualLayouts = new Map();

  /**
   * Clé sous laquelle une disposition manuelle est mémorisée : le nombre de
   * favoris actifs et le nombre d'emplacements (streams visibles). Deux
   * configurations qui partagent ces deux nombres ont exactement les mêmes
   * emplacements possibles, donc les mêmes tailles s'y appliquent — quelles
   * que soient les chaînes concernées, puisque les tailles appartiennent aux
   * EMPLACEMENTS (voir l'en-tête de section). Le mode Réorganiser n'en fait
   * volontairement pas partie : il ne change ni le nombre ni la place des
   * emplacements (la zone ne contient que les tuiles des streams).
   * @param {number} featuredCount
   * @param {number} slotCount
   * @returns {string}
   */
  function getLayoutSignature(featuredCount, slotCount) {
    return `${featuredCount}:${slotCount}`;
  }

  /**
   * Signature de la disposition qu'affichent, EN CE MOMENT, les streams
   * visibles avec leurs favoris actifs : celle sous laquelle `manualLayouts`
   * mémorise leurs tailles ajustées à la main. Même règle que
   * `applyGridLayout()` : une mise en avant sans autre stream à côté d'elle
   * n'est pas active (voir `isFeatureSplitActive()`). Utilisée par les
   * dispositions favorites, qui enregistrent puis restaurent ces tailles
   * (section 11).
   * @returns {string|null} `null` s'il n'y a aucun stream visible
   */
  function getCurrentLayoutSignature() {
    const visible = getVisibleChannels();
    if (visible.length === 0) return null;
    const activeFeatured = isFeatureSplitActive(visible) ? getActiveFeaturedChannels(visible) : [];
    return getLayoutSignature(activeFeatured.length, visible.length);
  }

  /**
   * Copie profonde d'un ensemble d'épingles (numéro d'emplacement ->
   * rectangle en fractions). Indispensable quand on le passe d'un endroit à
   * un autre (disposition favorite <-> `manualLayouts`) : un redimensionnement
   * modifie les épingles EN PLACE, et partager le même objet ferait changer
   * la disposition favorite en douce, sans qu'on l'ait enregistrée.
   * @param {Record<number, Pin>} pins
   * @returns {Record<number, Pin>}
   */
  function copyPins(pins) {
    const copy = {};
    Object.entries(pins).forEach(([slot, pin]) => {
      copy[slot] = { x0: pin.x0, y0: pin.y0, x1: pin.x1, y1: pin.y1 };
    });
    return copy;
  }

  /**
   * Vérifie qu'une valeur relue depuis localStorage est bien une épingle
   * exploitable : quatre fractions finies, dans la zone, formant un
   * rectangle non vide.
   * @param {unknown} pin
   * @returns {boolean}
   */
  function isValidPin(pin) {
    if (pin === null || typeof pin !== "object") return false;
    const { x0, y0, x1, y1 } = pin;
    return (
      [x0, y0, x1, y1].every((value) => typeof value === "number" && Number.isFinite(value)) &&
      x0 >= 0 &&
      y0 >= 0 &&
      x1 <= 1 &&
      y1 <= 1 &&
      x0 < x1 &&
      y0 < y1
    );
  }

  /**
   * Recharge `manualLayouts` depuis localStorage. Toute entrée invalide (clé
   * mal formée, épingle hors zone ou corrompue, numéro d'emplacement qui ne
   * correspond pas à la signature, ancien format d'une version précédente)
   * est simplement ignorée : on retombe alors sur la disposition par défaut,
   * sans jamais planter.
   */
  function loadManualLayouts() {
    manualLayouts.clear();
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LAYOUTS);
      const parsed = saved ? JSON.parse(saved) : null;
      if (!parsed || typeof parsed !== "object") return;

      Object.entries(parsed).forEach(([signature, pins]) => {
        const match = /^([0-2]):(\d+)$/.exec(signature);
        if (!match || pins === null || typeof pins !== "object") return;
        const slotCount = Number(match[2]);

        const entries = Object.entries(pins);
        const valid =
          entries.length > 0 &&
          entries.every(([slot, pin]) => /^\d+$/.test(slot) && Number(slot) < slotCount && isValidPin(pin));
        if (valid) manualLayouts.set(signature, pins);
      });
    } catch (err) {
      manualLayouts.clear();
    }
  }

  /**
   * Écrit `manualLayouts` en localStorage, en ne gardant que les
   * `MAX_STORED_LAYOUTS` plus récentes (une même signature ré-enregistrée
   * repasse en fin de liste, donc "récente").
   */
  function saveManualLayouts() {
    while (manualLayouts.size > MAX_STORED_LAYOUTS) {
      manualLayouts.delete(manualLayouts.keys().next().value);
    }
    try {
      localStorage.setItem(STORAGE_KEY_LAYOUTS, JSON.stringify(Object.fromEntries(manualLayouts)));
    } catch (err) {
      console.warn("StreamWall: impossible d'écrire dans localStorage.", err);
    }
  }

  /* ---- Application de la disposition au DOM ---- */

  /**
   * Résultat du dernier `applyGridLayout()`, relu par les gestionnaires de
   * redimensionnement (voir plus bas) pour savoir sur quoi ils agissent.
   * `pins` est l'objet des épingles EN VIGUEUR : celui de `manualLayouts` si
   * la disposition est manuelle, sinon celui, par défaut, construit pour ce
   * calcul — et c'est ce même objet qu'on fige puis modifie au premier
   * redimensionnement (voir `freezeCurrentLayout()`).
   * `keptSlots` : les épingles que le solveur a réellement respectées (les
   * autres, "fantômes", ne sont plus affichées : voir `getTrialPins()`).
   * Vaut `null` tant qu'aucune disposition n'a été calculée, et quand aucun
   * stream n'est affiché.
   * @type {{signature: string, pins: Record<number, Pin>, isManual: boolean,
   *         cells: Rect[], keptSlots: number[], width: number, height: number,
   *         offsetX: number, offsetY: number,
   *         slotByChannel: Map<string, number>}|null}
   */
  let currentLayout = null;

  /**
   * Parmi les QUATRE poignées d'angle d'une tuile (toutes utilisables à la
   * souris et au doigt), celle qui est aussi atteignable au CLAVIER (Tab) :
   * l'angle qui regarde vers le CENTRE de la zone (`"br"` pour une tuile de
   * la moitié supérieure gauche, `"bl"` pour la supérieure droite, `"tr"`
   * pour l'inférieure gauche, `"tl"` pour l'inférieure droite). Une tuile ne
   * peut pas s'agrandir vers l'extérieur de la zone : c'est vers le centre
   * qu'elle grandit, donc c'est l'angle le plus utile. Les trois autres
   * poignées ont `tabindex="-1"` : les garder toutes dans l'ordre de
   * tabulation ferait quatre arrêts par tuile, pour un résultat redondant
   * (les flèches déplacent le coin dans toutes les directions).
   * @param {Rect} cell
   * @param {number} width
   * @param {number} height
   * @returns {"tl"|"tr"|"bl"|"br"}
   */
  function getKeyboardGripCorner(cell, width, height) {
    const vertical = cell.y + cell.h / 2 <= height / 2 ? "b" : "t";
    const horizontal = cell.x + cell.w / 2 <= width / 2 ? "r" : "l";
    return vertical + horizontal;
  }

  /**
   * Recalcule et applique la disposition en fonction de l'espace
   * actuellement disponible : chaque carte reçoit son rectangle en pixels
   * (`left`/`top`/`width`/`height`, en `position: absolute` dans
   * `#players-grid`).
   *
   * Les tuiles remplissent TOUJOURS 100% de la largeur et de la hauteur de
   * `#players-grid` (voir l'en-tête de section), quel que soit leur nombre :
   * aucune marge vide ne peut apparaître. Si un emplacement n'est pas
   * exactement 16:9, c'est le lecteur Twitch LUI-MÊME qui affiche
   * d'éventuelles bandes noires à l'intérieur de sa propre iframe
   * (comportement standard d'un player vidéo embarqué) — un compromis
   * largement préférable à de l'espace perdu sur toute la page.
   *
   * Déroulement :
   *  1. les épingles : la disposition manuelle mémorisée pour cette
   *     signature si elle existe, sinon celles par défaut ;
   *  2. les cellules (`solveLayout()`), donc les tuiles, puis attribution des
   *     chaînes : favoris d'abord, autres ensuite ;
   *  3. la poignée de chaque tuile atteignable au clavier, et l'état du
   *     bouton "Réinitialiser la vue".
   *
   * Le mode Réorganiser ne change RIEN à ce calcul : la zone ne contient que
   * les tuiles des streams (le bouton "+" qui ajoute un stream est dans le
   * menu, pas dans la zone), donc leur disposition est la même avec et sans
   * ce mode.
   *
   * Appelée après chaque changement pouvant affecter le nombre de tuiles,
   * leur ordre ou l'espace disponible : ajout/suppression de chaîne,
   * réorganisation, bascule du mode Réorganiser, du chat, mise en avant,
   * redimensionnement d'une tuile, et à chaque redimensionnement de la zone
   * (voir le ResizeObserver plus bas).
   *
   * @param {string[]} [visibleChannels] - résultat déjà calculé de
   *   `getVisibleChannels()`, à passer quand l'appelant l'a déjà sous la
   *   main (voir `renderPlayersGrid()`, qui l'a systématiquement) pour ne
   *   pas refiltrer `state.entries` une deuxième fois pour rien. Recalculé
   *   ici si omis (cas des appels déclenchés par `scheduleGridLayout()` :
   *   redimensionnement, bascule du panneau de chat, glissement d'une
   *   poignée — aucun n'a de liste sous la main).
   */
  function applyGridLayout(visibleChannels) {
    const visible = visibleChannels || getVisibleChannels();
    const activeFeatured = isFeatureSplitActive(visible) ? getActiveFeaturedChannels(visible) : [];
    const slotCount = visible.length;

    if (slotCount === 0) {
      // Aucun stream : la zone est masquée au profit du message "aucun
      // stream" (voir renderPlayersGrid()), il n'y a rien à disposer — ni
      // à réinitialiser.
      currentLayout = null;
      if (el.btnResetLayout) {
        el.btnResetLayout.hidden = !state.reorderMode;
        el.btnResetLayout.disabled = true;
      }
      return;
    }

    const { width, height, offsetX, offsetY } = getInnerSize(el.playersGrid);
    if (width <= 0 || height <= 0) return;

    // 1. Les épingles : celles de la disposition manuelle mémorisée pour
    // cette combinaison si elle existe, sinon celles par défaut.
    const signature = getLayoutSignature(activeFeatured.length, slotCount);
    const manual = manualLayouts.get(signature);
    const isManual = Boolean(manual);
    const pins = manual || getDefaultPins(activeFeatured.length, slotCount);

    // 2. Les cellules, puis les chaînes dans les emplacements : les favoris
    // (dans l'ordre de `state.featuredChannels`) d'abord, les autres ensuite
    // dans l'ordre d'affichage.
    // Une disposition ajustée à la main compare plusieurs stratégies pour éviter
    // les tuiles réduites à une lamelle ; la disposition par défaut garde la
    // première (voir solveLayout()).
    const { cells, keptSlots } = solveLayout(pinsToArray(pins, slotCount), width, height, isManual);
    const tiles = cells.map((cell) => cellToTile(cell, width, height));
    const channelsBySlot = [
      ...activeFeatured,
      ...visible.filter((channel) => !activeFeatured.includes(channel)),
    ];

    const slotByChannel = new Map();
    const cardsByChannel = new Map(
      Array.from(el.playersGrid.querySelectorAll(".player-card[data-channel]")).map((card) => [
        card.dataset.channel,
        card,
      ])
    );
    channelsBySlot.forEach((channel, slot) => {
      slotByChannel.set(channel, slot);
      const card = cardsByChannel.get(channel);
      if (!card) return;
      placeBox(card, toPixelBox(tiles[slot], offsetX, offsetY));
      // 3. Seule la poignée qui regarde vers le centre est dans l'ordre de
      // tabulation (voir getKeyboardGripCorner()) ; on n'écrit `tabIndex`
      // que s'il change, ce calcul étant refait à chaque déplacement du
      // pointeur pendant un redimensionnement.
      const keyboardCorner = getKeyboardGripCorner(cells[slot], width, height);
      card.querySelectorAll(".player-card-resize").forEach((grip) => {
        const tabIndex = grip.dataset.corner === keyboardCorner ? 0 : -1;
        if (grip.tabIndex !== tabIndex) grip.tabIndex = tabIndex;
      });
    });
    currentLayout = { signature, pins, isManual, cells, keptSlots, width, height, offsetX, offsetY, slotByChannel };

    // Le bouton n'existe qu'en mode Réorganiser (comme le redimensionnement
    // lui-même) ; inutilisable tant qu'aucune taille n'a été modifiée.
    if (el.btnResetLayout) {
      el.btnResetLayout.hidden = !state.reorderMode;
      el.btnResetLayout.disabled = !isManual;
    }
  }

  /**
   * Programme un recalcul de la disposition au prochain rendu du navigateur.
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

  /* ---- Redimensionnement par l'angle (mode Réorganiser uniquement) ---- */

  /** Les bords d'un rectangle : `{x0, y0, x1, y1}` (plus commode que `{x, y, w, h}`
   *  pour raisonner sur les bords partagés entre deux tuiles). */
  function toEdges(rect) {
    return { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h };
  }

  /** Inverse de `toEdges()`. */
  function fromEdges(edges) {
    return { x: edges.x0, y: edges.y0, w: edges.x1 - edges.x0, h: edges.y1 - edges.y0 };
  }

  /** Deux rectangles (en bords) ont-ils une surface commune non nulle ? */
  function edgesOverlap(a, b) {
    return (
      Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > LAYOUT_EPSILON &&
      Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > LAYOUT_EPSILON
    );
  }

  /**
   * La plus grande partie rectangulaire de `rect` qui ne touche pas
   * `obstacle` : ce qui reste à gauche, à droite, au-dessus ou en dessous de
   * l'obstacle, en ne gardant que les parties qui restent au moins d'une
   * cellule minimale. `null` si aucune n'est assez grande (l'obstacle
   * recouvre presque tout).
   * @param {{x0: number, y0: number, x1: number, y1: number}} rect
   * @param {{x0: number, y0: number, x1: number, y1: number}} obstacle
   * @returns {{x0: number, y0: number, x1: number, y1: number}|null}
   */
  function largestRectAvoiding(rect, obstacle) {
    const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
    const candidates = [
      { ...rect, x1: Math.min(rect.x1, obstacle.x0) },
      { ...rect, x0: Math.max(rect.x0, obstacle.x1) },
      { ...rect, y1: Math.min(rect.y1, obstacle.y0) },
      { ...rect, y0: Math.max(rect.y0, obstacle.y1) },
    ].filter(
      (c) => c.x1 - c.x0 >= MIN_CELL_WIDTH - LAYOUT_EPSILON && c.y1 - c.y0 >= MIN_CELL_HEIGHT - LAYOUT_EPSILON
    );
    return candidates.length ? candidates.reduce((best, c) => (area(c) > area(best) ? c : best)) : null;
  }

  /**
   * Si `neighbor` COLLE un bord de la tuile redimensionnée (`before` : sa
   * cellule avant le geste), renvoie le bord du voisin qui doit suivre, avec
   * sa nouvelle valeur (le bord correspondant de `after`, la cellule voulue de
   * la tuile) ; sinon `null`.
   *
   * "Coller" = toucher un bord ET avoir tout son côté en regard contenu dans
   * celui de la tuile (un voisin plus long que la tuile ne suit pas : il n'est
   * que poussé, voir `getTrialPins()`). Les deux tuiles se comportent alors
   * comme de part et d'autre d'un séparateur : tirer le bord partagé
   * agrandit l'une ET réduit l'autre — et, dans l'autre sens, le voisin
   * reprend la place que la tuile libère au lieu de laisser un trou.
   *
   * Seul CE bord change : les trois autres restent ceux de l'épingle du
   * voisin, ce qui compte. Le voisin est repéré d'après sa cellule AFFICHÉE
   * (ce que voit l'utilisateur), mais sa cellule affichée peut avoir été
   * étirée par le solveur — par exemple jusqu'en bas de la tuile tant que la
   * bande qui les sépare est trop fine pour une tuile. Réécrire l'épingle du
   * voisin d'après sa cellule affichée y figerait cet étirement, qui
   * s'accumulerait au fil du geste.
   * @param {{x0: number, y0: number, x1: number, y1: number}} neighbor cellule affichée
   * @param {{x0: number, y0: number, x1: number, y1: number}} before
   * @param {{x0: number, y0: number, x1: number, y1: number}} after
   * @returns {{edge: "x0"|"y0"|"x1"|"y1", value: number}|null}
   */
  function glueNeighbor(neighbor, before, after) {
    const eps = LAYOUT_EPSILON;
    const inside = (a0, a1, b0, b1) => a0 >= b0 - eps && a1 <= b1 + eps;
    if (Math.abs(neighbor.x0 - before.x1) <= eps && inside(neighbor.y0, neighbor.y1, before.y0, before.y1)) {
      return { edge: "x0", value: after.x1 };
    }
    if (Math.abs(neighbor.x1 - before.x0) <= eps && inside(neighbor.y0, neighbor.y1, before.y0, before.y1)) {
      return { edge: "x1", value: after.x0 };
    }
    if (Math.abs(neighbor.y0 - before.y1) <= eps && inside(neighbor.x0, neighbor.x1, before.x0, before.x1)) {
      return { edge: "y0", value: after.y1 };
    }
    if (Math.abs(neighbor.y1 - before.y0) <= eps && inside(neighbor.x0, neighbor.x1, before.x0, before.x1)) {
      return { edge: "y1", value: after.y0 };
    }
    return null;
  }

  /**
   * Les épingles que la disposition aurait si l'emplacement `slot` occupait
   * `cell`, ou `null` si c'est impossible. Les AUTRES tuiles épinglées ne
   * sont pas des obstacles infranchissables : elles s'adaptent, dans cet
   * ordre.
   *  1. Une tuile épinglée qui COLLE un bord déplacé de la tuile le suit (voir
   *     `glueNeighbor()`). C'est ce qui permet d'élargir l'un des deux
   *     favoris, qui occupent ensemble toute la largeur : l'autre rétrécit du
   *     même côté, et reprend la place si on réduit le premier.
   *  2. Une tuile épinglée que la tuile recouvrirait quand même (elle n'est
   *     pas voisine, ou plus longue que la tuile) est POUSSÉE : elle est
   *     réduite à sa plus grande partie qui ne touche pas la tuile (voir
   *     `largestRectAvoiding()`).
   * Une tuile ainsi adaptée doit garder au moins une cellule minimale, sinon
   * la disposition est refusée : c'est la tuile qu'on tire qui s'arrête, pas
   * les autres qui disparaissent. Les épingles qui n'ont pas à bouger ne sont
   * pas réécrites. Les épingles "fantômes" (que le solveur n'a pas pu
   * respecter, voir `keptSlots`) sont oubliées.
   * @param {NonNullable<typeof currentLayout>} layout
   * @param {number} slot
   * @param {Rect} cell
   * @returns {Record<number, Pin>|null}
   */
  function getTrialPins(layout, slot, cell) {
    const { pins, cells, width, height } = layout;
    const trial = { ...pins, [slot]: cellToPin(cell, width, height) };
    const before = toEdges(cells[slot]);
    const after = toEdges(cell);

    for (const key of Object.keys(pins)) {
      const other = Number(key);
      if (other === slot) continue;

      // Une épingle que le solveur n'a pas pu respecter (elle n'est plus
      // affichée) n'est plus qu'un fantôme : elle ne doit pas bloquer un
      // nouveau redimensionnement. On l'oublie.
      if (layout.keptSlots && !layout.keptSlots.includes(other)) {
        delete trial[other];
        continue;
      }

      let rect = toEdges(pinToCell(pins[other], width, height));
      let changed = false;

      // 1. Un voisin collé au bord déplacé le suit : on repère le voisin
      // d'après sa cellule AFFICHÉE, mais on ne déplace que ce bord de son
      // ÉPINGLE (voir glueNeighbor() pour la raison).
      const glued = glueNeighbor(toEdges(cells[other]), before, after);
      if (glued && Math.abs(rect[glued.edge] - glued.value) > 1e-6) {
        rect = { ...rect, [glued.edge]: glued.value };
        changed = true;
      }

      // 2. Ce qui est encore recouvert est poussé.
      if (edgesOverlap(rect, after)) {
        rect = largestRectAvoiding(rect, after);
        if (!rect) return null;
        changed = true;
      }

      if (changed) {
        if (rect.x1 - rect.x0 < MIN_CELL_WIDTH - LAYOUT_EPSILON || rect.y1 - rect.y0 < MIN_CELL_HEIGHT - LAYOUT_EPSILON) {
          return null;
        }
        trial[other] = cellToPin(fromEdges(rect), width, height);
      }
    }
    return trial;
  }

  /**
   * Une disposition où l'emplacement `slot` occupe `cell` est-elle valable ?
   * Il faut :
   *  - que les autres tuiles épinglées puissent s'adapter (voir
   *    `getTrialPins()` : elles suivent un bord partagé ou cèdent la place,
   *    sans descendre sous la taille minimale) ;
   *  - que le solveur respecte l'épingle de CETTE tuile. Les épingles plus
   *    anciennes, elles, sont moins prioritaires : si elles ne peuvent plus
   *    toutes coexister avec elle, elles cèdent (et sont oubliées, voir
   *    `resizeSlotTo()`) plutôt que de bloquer le geste en cours ;
   *  - que toutes les tuiles restent lisibles : au moins `minScore` fois la
   *    taille minimale (voir `getLayoutScore()`). C'est ce qui empêche
   *    d'agrandir une tuile jusqu'à réduire les autres à rien.
   * @param {NonNullable<typeof currentLayout>} layout
   * @param {number} slot
   * @param {Rect} cell
   * @param {number} minScore
   * @returns {boolean}
   */
  function isValidSlotCell(layout, slot, cell, minScore) {
    const { width, height, cells } = layout;

    const trial = getTrialPins(layout, slot, cell);
    if (!trial) return false;

    const result = solveLayout(pinsToArray(trial, cells.length), width, height, true, [slot]);
    // Petite tolérance : à lisibilité égale, un arrondi ne doit pas invalider.
    return result.keptSlots.includes(slot) && getLayoutScore(result.cells, width, height) >= minScore - 1e-6;
  }

  /**
   * Point de la cellule `from` vers la cellule `to`, à la fraction `t`
   * (0 = `from`, 1 = `to`) : les quatre bords sont interpolés.
   */
  function interpolateCell(from, to, t) {
    const lerp = (a, b) => a + (b - a) * t;
    const x0 = lerp(from.x, to.x);
    const y0 = lerp(from.y, to.y);
    const x1 = lerp(from.x + from.w, to.x + to.w);
    const y1 = lerp(from.y + from.h, to.y + to.h);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Fige la disposition affichée en disposition MANUELLE : à partir de là,
   * ses épingles (celles-là mêmes qu'on est en train de modifier) sont
   * mémorisées sous leur signature et réutilisées à chaque calcul au lieu
   * d'être reconstruites par défaut. Sans effet si elle l'est déjà. Appelée
   * seulement quand une taille change réellement — un simple clic sur une
   * poignée ne fige donc rien.
   */
  function freezeCurrentLayout() {
    if (!currentLayout || currentLayout.isManual) return;
    manualLayouts.set(currentLayout.signature, currentLayout.pins);
    currentLayout.isManual = true;
  }

  /**
   * Redimensionne l'emplacement `slot` pour que sa cellule devienne `target`,
   * ou, si `target` n'est pas valable, la plus grande cellule valable sur le
   * chemin de la cellule actuelle vers `target` (recherche par dichotomie sur
   * l'interpolation des bords) : la tuile s'arrête au dernier point possible
   * au lieu de bloquer net, même quand le pointeur a sauté au-delà. Les
   * autres tuiles épinglées s'adaptent (voir `getTrialPins()`). Ne fait rien
   * si le résultat est la cellule actuelle.
   *
   * @param {number} slot
   * @param {Rect} target cellule voulue (pixels, repère de la zone utile)
   * @param {number} minScore lisibilité minimale à respecter
   * @returns {boolean} vrai si la disposition a changé
   */
  function resizeSlotTo(slot, target, minScore) {
    const layout = currentLayout;
    if (!layout) return false;
    const current = layout.cells[slot];

    let next = target;
    if (!isValidSlotCell(layout, slot, target, minScore)) {
      let valid = 0;
      let invalid = 1;
      for (let step = 0; step < 10; step++) {
        const middle = (valid + invalid) / 2;
        if (isValidSlotCell(layout, slot, interpolateCell(current, target, middle), minScore)) {
          valid = middle;
        } else {
          invalid = middle;
        }
      }
      next = interpolateCell(current, target, valid);
    }

    const unchanged =
      Math.abs(next.x - current.x) < 1 &&
      Math.abs(next.y - current.y) < 1 &&
      Math.abs(next.w - current.w) < 1 &&
      Math.abs(next.h - current.h) < 1;
    if (unchanged) return false;

    freezeCurrentLayout();
    // Les épingles de la tuile ET celles des voisins qui l'ont suivie ou cédé
    // la place (`getTrialPins()`), moins celles que le solveur ne peut plus
    // respecter avec elle (`isValidSlotCell()`) : ces dernières deviennent des
    // tuiles libres. On écrit dans l'objet même de `layout.pins`, qui est
    // celui mémorisé par `freezeCurrentLayout()`.
    const trial = getTrialPins(layout, slot, next) || { [slot]: cellToPin(next, layout.width, layout.height) };
    const { keptSlots } = solveLayout(pinsToArray(trial, layout.cells.length), layout.width, layout.height, true, [slot]);
    Object.keys(trial).forEach((key) => {
      if (!keptSlots.includes(Number(key))) delete trial[key];
    });
    Object.keys(layout.pins).forEach((key) => delete layout.pins[key]);
    Object.assign(layout.pins, trial);
    return true;
  }

  /**
   * Cellule voulue quand le coin `corner` de la cellule `cell` est amené au
   * point `point` : le coin OPPOSÉ reste fixe, le point est borné à la zone,
   * "aimanté" aux bords de la zone à moins de `RESIZE_SNAP_DISTANCE` (pour
   * atteindre facilement toute la largeur ou toute la hauteur) et gardé à
   * distance d'au moins une cellule minimale du coin fixe.
   * @param {Rect} cell cellule actuelle
   * @param {"tl"|"tr"|"bl"|"br"} corner coin tiré
   * @param {{x: number, y: number}} point nouvelle position du coin tiré
   * @param {number} width largeur de la zone
   * @param {number} height hauteur de la zone
   * @returns {Rect}
   */
  function getCellForCorner(cell, corner, point, width, height) {
    const dragsLeft = corner.includes("l");
    const dragsTop = corner.includes("t");
    const anchorX = dragsLeft ? cell.x + cell.w : cell.x;
    const anchorY = dragsTop ? cell.y + cell.h : cell.y;

    const snap = (value, max) =>
      value < RESIZE_SNAP_DISTANCE ? 0 : value > max - RESIZE_SNAP_DISTANCE ? max : value;
    let x = snap(clampNumber(point.x, 0, width), width);
    let y = snap(clampNumber(point.y, 0, height), height);

    x = dragsLeft ? Math.min(x, anchorX - MIN_CELL_WIDTH) : Math.max(x, anchorX + MIN_CELL_WIDTH);
    y = dragsTop ? Math.min(y, anchorY - MIN_CELL_HEIGHT) : Math.max(y, anchorY + MIN_CELL_HEIGHT);
    x = clampNumber(x, 0, width);
    y = clampNumber(y, 0, height);

    return {
      x: Math.min(anchorX, x),
      y: Math.min(anchorY, y),
      w: Math.abs(x - anchorX),
      h: Math.abs(y - anchorY),
    };
  }

  /**
   * Coin (repère de la zone utile) de la cellule qu'on tire.
   * @param {Rect} cell
   * @param {"tl"|"tr"|"bl"|"br"} corner
   */
  function getCornerPoint(cell, corner) {
    return {
      x: corner.includes("l") ? cell.x : cell.x + cell.w,
      y: corner.includes("t") ? cell.y : cell.y + cell.h,
    };
  }

  /**
   * Glissement en cours : l'emplacement et le coin tirés, l'écart entre le
   * pointeur et le coin au moment de la saisie (pour que la tuile ne "saute"
   * pas sous le curseur), l'origine de la zone utile à l'écran et la
   * lisibilité minimale à respecter (voir `onGripPointerDown()`).
   * @type {{pointerId: number, slot: number, corner: string, offset: {x: number, y: number},
   *         origin: {x: number, y: number}, minScore: number, moved: boolean,
   *         grip: HTMLElement}|null}
   */
  let gripDrag = null;

  function onGripPointerDown(event) {
    // Le redimensionnement n'existe qu'en mode Réorganiser (les poignées sont
    // de toute façon masquées en CSS hors de ce mode : double garde).
    if (!state.reorderMode || event.button !== 0 || !currentLayout) return;
    const grip = event.target.closest(".player-card-resize");
    if (!grip) return;
    const slot = currentLayout.slotByChannel.get(grip.closest(".player-card").dataset.channel);
    if (slot === undefined) return;

    // Évite la sélection de texte et le glisser natif pendant le geste.
    event.preventDefault();
    // La capture du pointeur redirige tous les évènements suivants vers la
    // poignée, même quand le curseur passe au-dessus d'une iframe Twitch
    // (qui les avalerait sinon).
    grip.setPointerCapture(event.pointerId);

    const { cells, width, height, offsetX, offsetY } = currentLayout;
    const corner = grip.dataset.corner;
    const gripRect = el.playersGrid.getBoundingClientRect();
    const origin = { x: gripRect.left + offsetX, y: gripRect.top + offsetY };
    const cornerPoint = getCornerPoint(cells[slot], corner);
    gripDrag = {
      pointerId: event.pointerId,
      slot,
      corner,
      offset: { x: event.clientX - origin.x - cornerPoint.x, y: event.clientY - origin.y - cornerPoint.y },
      origin,
      // On ne demande pas mieux que la lisibilité de départ : si la
      // disposition par défaut a déjà des tuiles plus petites que le
      // minimum (beaucoup de streams sur un petit écran), on n'empire pas.
      minScore: Math.min(1, getLayoutScore(cells, width, height)),
      moved: false,
      grip,
    };
    grip.classList.add("is-active");
    // Voir style.css : neutralise les iframes pendant le geste, et impose le
    // curseur de redimensionnement partout.
    const cursorClass = corner === "br" || corner === "tl" ? "nwse" : "nesw";
    el.playersGrid.classList.add("is-resizing", `is-resizing--${cursorClass}`);
  }

  function onGripPointerMove(event) {
    if (!gripDrag || event.pointerId !== gripDrag.pointerId || !currentLayout) return;
    const { slot, corner, offset, origin, minScore } = gripDrag;
    const { cells, width, height } = currentLayout;

    const point = { x: event.clientX - origin.x - offset.x, y: event.clientY - origin.y - offset.y };
    const target = getCellForCorner(cells[slot], corner, point, width, height);
    if (resizeSlotTo(slot, target, minScore)) {
      gripDrag.moved = true;
      // Recalcul IMMÉDIAT (pas via `scheduleGridLayout()`) : `currentLayout`,
      // donc la base du déplacement suivant, reste ainsi toujours cohérent
      // avec ce qui est affiché. Le coût est négligeable (au plus quelques
      // dizaines de tuiles).
      applyGridLayout();
    }
  }

  function endGripDrag(event) {
    if (!gripDrag || event.pointerId !== gripDrag.pointerId) return;
    const { grip, moved, pointerId } = gripDrag;
    gripDrag = null;

    grip.classList.remove("is-active");
    el.playersGrid.classList.remove("is-resizing", "is-resizing--nwse", "is-resizing--nesw");
    if (grip.hasPointerCapture(pointerId)) grip.releasePointerCapture(pointerId);

    // On n'écrit qu'à la fin du geste, pas à chaque déplacement.
    if (moved) saveManualLayouts();
  }

  /**
   * Alternative clavier au glissement : les flèches déplacent le coin de la
   * tuile (droite = le coin va vers la droite, etc.) de
   * `RESIZE_KEYBOARD_STEP` de la zone ; Maj multiplie le pas par 5.
   */
  function onGripKeyDown(event) {
    if (!state.reorderMode || !currentLayout) return;
    const grip = event.target.closest(".player-card-resize");
    if (!grip) return;

    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;

    const slot = currentLayout.slotByChannel.get(grip.closest(".player-card").dataset.channel);
    if (slot === undefined) return;
    event.preventDefault();

    const { cells, width, height } = currentLayout;
    const corner = grip.dataset.corner;
    const step = RESIZE_KEYBOARD_STEP * (event.shiftKey ? 5 : 1);
    const from = getCornerPoint(cells[slot], corner);
    const point = { x: from.x + move[0] * step * width, y: from.y + move[1] * step * height };
    const target = getCellForCorner(cells[slot], corner, point, width, height);

    if (resizeSlotTo(slot, target, Math.min(1, getLayoutScore(cells, width, height)))) {
      saveManualLayouts();
      applyGridLayout();
    }
  }

  /**
   * Bouton "Réinitialiser la vue" (mode Réorganiser) : oublie la disposition
   * manuelle de la configuration affichée (nombre de streams et de
   * favoris) et revient à la disposition par défaut. Les dispositions
   * mémorisées pour d'AUTRES configurations ne sont pas touchées.
   */
  function resetManualLayout() {
    if (!currentLayout) return;
    manualLayouts.delete(currentLayout.signature);
    saveManualLayouts();
    applyGridLayout();
  }

  /* ==========================================================================
   * 6. RENDU DES LECTEURS VIDÉO
   * ========================================================================== */

  /**
   * Bascule la mise en avant d'une chaîne : jusqu'à `MAX_FEATURED_CHANNELS`
   * (2) streams peuvent être mis en avant SIMULTANÉMENT (voir
   * `state.featuredChannels`). Cliquer sur l'étoile d'une chaîne déjà mise
   * en avant l'enlève ; en cliquer une nouvelle l'AJOUTE (ne remplace plus
   * silencieusement l'ancienne, contrairement à l'ancienne version à un
   * seul stream) tant que la limite n'est pas atteinte. Au-delà, le clic
   * est ignoré et un toast explique qu'il faut d'abord en retirer une —
   * plutôt qu'un remplacement silencieux du premier choix, qui surprendrait
   * l'utilisateur en lui faisant perdre un choix sans avertissement.
   * @param {string} channel
   */
  function toggleFeaturedChannel(channel) {
    if (state.featuredChannels.includes(channel)) {
      state.featuredChannels = state.featuredChannels.filter((ch) => ch !== channel);
    } else if (state.featuredChannels.length < MAX_FEATURED_CHANNELS) {
      state.featuredChannels = [...state.featuredChannels, channel];
    } else {
      showToast(
        `${MAX_FEATURED_CHANNELS} streams peuvent être mis en avant au maximum — désélectionnez-en un d'abord.`
      );
      return;
    }
    persistState();
    renderPlayersGrid();
  }

  /**
   * Met à jour l'apparence (icône ★/☆, aria-pressed, aria-label) du
   * bouton "mettre en avant" d'une carte. Comme jusqu'à
   * `MAX_FEATURED_CHANNELS` streams peuvent être mis en avant à la fois,
   * cette fonction est appelée pour CHAQUE carte à chaque rendu (voir
   * `renderPlayersGrid()`), afin que l'icône de chacune reflète fidèlement
   * `state.featuredChannels`.
   * @param {HTMLElement} card
   * @param {string} channel
   */
  function updateFeatureButtonUI(card, channel) {
    const button = card.querySelector(".player-card-feature");
    if (!button) return;
    const isFeatured = state.featuredChannels.includes(channel);
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
      <!--
        Poignées de redimensionnement, une dans CHACUN des quatre angles de
        la tuile ("data-corner" : tl = haut gauche, tr = haut droit, bl = bas
        gauche, br = bas droit). Mode Réorganiser uniquement : masquées en
        CSS sinon — voir .player-card-resize dans style.css. Tirer un coin
        agrandit ou réduit la tuile en largeur ET en hauteur d'un seul
        geste, le coin OPPOSÉ restant fixe ; les flèches du clavier
        déplacent aussi le coin d'une poignée qui a le focus. Toutes sont
        actives à la souris et au doigt ; seule celle qui regarde vers le
        centre de la zone est dans l'ordre de tabulation (tabindex 0, posé
        par applyGridLayout() via getKeyboardGripCorner()), les trois autres
        ont tabindex -1.
      -->
      <div class="player-card-resize" role="button" tabindex="-1" data-corner="tl"
        aria-label="Redimensionner ${channel} par son coin haut gauche : glisser, ou flèches du clavier"></div>
      <div class="player-card-resize" role="button" tabindex="-1" data-corner="tr"
        aria-label="Redimensionner ${channel} par son coin haut droit : glisser, ou flèches du clavier"></div>
      <div class="player-card-resize" role="button" tabindex="-1" data-corner="bl"
        aria-label="Redimensionner ${channel} par son coin bas gauche : glisser, ou flèches du clavier"></div>
      <div class="player-card-resize" role="button" tabindex="-1" data-corner="br"
        aria-label="Redimensionner ${channel} par son coin bas droit : glisser, ou flèches du clavier"></div>
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
   * Redessine la zone de lecteurs pour correspondre aux chaînes
   * actuellement visibles, et recalcule la disposition (position et taille
   * de chaque tuile) via `applyGridLayout`.
   *
   * Toutes les cartes — y compris celles des streams mis en avant — restent
   * dans le MÊME conteneur (`#players-grid`) et gardent leur position dans
   * le DOM dérivée de `state.entries`. Cet ordre ne décide plus de
   * l'emplacement visuel d'une tuile (`applyGridLayout()` pose le rectangle
   * de chacune explicitement, en `position: absolute`), mais il reste
   * l'ordre de lecture et de tabulation au clavier — d'où le maintien de
   * cet ordre dans le DOM. Il compte aussi ici : les cartes DOIVENT rester
   * les premiers enfants du conteneur, dans l'ordre, pour que la recherche
   * par index ci-dessous fonctionne (la zone ne contient plus d'autre
   * enfant que les cartes).
   */
  function renderPlayersGrid() {
    const visible = getVisibleChannels();
    const activeFeatured = isFeatureSplitActive(visible) ? getActiveFeaturedChannels(visible) : [];

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
      // Le PREMIER stream mis en avant (state.featuredChannels[0], pas
      // n'importe lequel des deux) démarre avec le son : avec deux
      // streams mis en avant, laisser le son actif sur les DEUX serait
      // très perturbant (deux flux audio superposés) — un seul à la fois,
      // toujours le même par convention (le "principal", en haut). Sans
      // mise en avant, comme avant : le premier stream visible.
      const startsUnmuted = activeFeatured.length > 0 ? channel === activeFeatured[0] : index === 0;
      mountPlayer(channel, startsUnmuted);
    });

    // Bascule entre la zone de lecteurs et le message "aucun stream", dans
    // les DEUX modes (Réorganiser ou non) : ajouter un stream passe par le
    // bouton "+" du menu (toujours affiché) ou par celui du message, donc la
    // zone n'a plus à rester affichée sans lecteur pour porter une tuile
    // d'ajout.
    const hasChannels = visible.length > 0;
    el.emptyState.hidden = hasChannels;
    // On ne s'appuie pas sur l'attribut `hidden` seul pour la zone, car
    // elle a un `display` explicite dans le CSS, ce qui prime sur `hidden`.
    el.playersGrid.style.display = hasChannels ? "block" : "none";

    // Appelée même sans stream : applyGridLayout() remet alors à zéro l'état
    // du bouton "Réinitialiser la vue" (sinon il resterait actif pour une
    // disposition qui n'existe plus). `visible` est réutilisé tel quel :
    // évite à applyGridLayout() de refiltrer `state.entries` une troisième
    // fois pour ce même rendu (une première fois ci-dessus, une deuxième
    // dans isFeatureSplitActive() ci-dessus, déjà réutilisée grâce au
    // paramètre de cette dernière).
    applyGridLayout(visible);
  }

  /**
   * Applique la classe CSS qui active/désactive le mode "Réorganiser" et
   * met à jour l'état `aria-pressed` du bouton correspondant. Redessine
   * ensuite la zone : les en-têtes et les poignées de redimensionnement
   * apparaissent ou disparaissent, sans changer la place ni la taille
   * d'aucune tuile.
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
   * recréation, pour ne pas recharger les iframes vidéo), puis recalcule la
   * disposition : l'emplacement d'une tuile dépend de sa position dans
   * l'ordre des chaînes visibles (les streams mis en avant mis à part, voir
   * `applyGridLayout()`), donc les deux chaînes échangent leurs
   * emplacements. Les TAILLES, elles, restent celles des emplacements
   * (les épingles ne sont pas touchées, voir l'en-tête de la section 5) : le
   * nombre de tuiles ne change pas, une disposition ajustée à la main reste
   * donc valable telle quelle.
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

    applyGridLayout();
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
    state.featuredChannels = state.featuredChannels.filter((channel) => channel !== name);
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
   * utilisateur. Voir la section 11 de documentation.md pour le détail de cette
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
   * Une disposition favorite retient, en plus de ses chaînes (`channels`, dans
   * leur ordre d'affichage), la DISPOSITION des tuiles au moment de
   * l'enregistrement (`layout`) :
   *  - `featured` : les streams mis en avant (étoiles) parmi ses chaînes, dans
   *    l'ordre de `state.featuredChannels` — c'est cet ordre qui donne le
   *    numéro d'emplacement de chaque favori (voir `applyGridLayout()`) ;
   *  - `pins` : les tailles ajustées à la main, sous la même forme que dans
   *    `manualLayouts` (numéro d'emplacement -> rectangle en fractions de la
   *    zone, voir la section 5). `{}` = la disposition par défaut, sans rien
   *    redimensionné.
   * Les tailles appartiennent aux EMPLACEMENTS et non aux chaînes (section 5) ;
   * comme la disposition retient aussi l'ordre des chaînes et leurs favoris,
   * chaque tuile retrouve exactement la même place et la même taille quand on
   * l'applique. Les dispositions enregistrées avant cette fonctionnalité n'ont
   * pas de `layout` : elles ne rétablissent que leurs chaînes, comme avant.
   * @typedef {{featured: string[], pins: Record<number, Pin>}} PresetLayout
   */

  /**
   * Vérifie la partie `layout` d'une disposition favorite relue depuis
   * localStorage : des favoris qui sont bien parmi ses chaînes (au plus
   * `MAX_FEATURED_CHANNELS`, sans doublon), et des épingles valides
   * (`isValidPin()`) dont le numéro d'emplacement existe. Même exigence que
   * `loadManualLayouts()` pour les dispositions ajustées à la main.
   * @param {{channels: string[], layout: unknown}} preset
   * @returns {boolean}
   */
  function isValidPresetLayout(preset) {
    const layout = preset.layout;
    if (layout === null || typeof layout !== "object") return false;

    const { featured, pins } = layout;
    const featuredOk =
      Array.isArray(featured) &&
      featured.length <= MAX_FEATURED_CHANNELS &&
      featured.every((channel, index) => preset.channels.includes(channel) && featured.indexOf(channel) === index);
    if (!featuredOk) return false;

    if (pins === null || typeof pins !== "object" || Array.isArray(pins)) return false;
    return Object.entries(pins).every(
      ([slot, pin]) => /^\d+$/.test(slot) && Number(slot) < preset.channels.length && isValidPin(pin)
    );
  }

  /**
   * Nettoie la liste des dispositions favorites relue depuis localStorage,
   * sans jamais planter : écarte les entrées inexploitables (ni nom ni liste
   * de chaînes), et, pour les autres, retire `layout` s'il est corrompu — la
   * disposition ne rétablira alors que ses chaînes, comme une ancienne.
   * @param {unknown[]} presets
   * @returns {Array<{id: string, name: string, channels: string[], layout?: PresetLayout}>}
   */
  function sanitizePresets(presets) {
    return presets.filter((preset) => {
      if (preset === null || typeof preset !== "object") return false;
      if (typeof preset.name !== "string" || !Array.isArray(preset.channels)) return false;
      if (!preset.channels.every((channel) => typeof channel === "string")) return false;
      if (preset.layout !== undefined && !isValidPresetLayout(preset)) delete preset.layout;
      return true;
    });
  }

  /**
   * Indique si une disposition favorite retient des tailles AJUSTÉES À LA MAIN
   * (au moins une épingle). Une disposition enregistrée avec la disposition
   * par défaut a bien un `layout`, mais sans épingle : rien de particulier
   * à signaler dans la liste.
   * @param {{layout?: PresetLayout}} preset
   * @returns {boolean}
   */
  function hasCustomSizes(preset) {
    return Boolean(preset.layout) && Object.keys(preset.layout.pins).length > 0;
  }

  /**
   * Relève la disposition des tuiles affichées en ce moment : les favoris
   * actifs (streams visibles mis en avant, dans l'ordre des emplacements) et
   * les tailles ajustées à la main mémorisées pour cette combinaison
   * (`manualLayouts`, voir `getCurrentLayoutSignature()`). Sans redimensionnement
   * manuel, `pins` est vide : la disposition par défaut.
   * @returns {PresetLayout}
   */
  function captureCurrentLayout() {
    const signature = getCurrentLayoutSignature();
    const manual = signature === null ? undefined : manualLayouts.get(signature);
    return {
      featured: getActiveFeaturedChannels(getVisibleChannels()),
      pins: manual ? copyPins(manual) : {},
    };
  }

  /**
   * Rétablit la disposition des tuiles d'une disposition favorite. À appeler
   * APRÈS avoir mis à jour `state.entries` (les chaînes visibles et leur
   * ordre) : la signature de la combinaison en dépend.
   *  - les favoris (étoiles) deviennent exactement ceux enregistrés : c'est
   *    ce qui ramène chaque favori à son emplacement ;
   *  - les tailles de la combinaison remplacent celles qui y étaient
   *    mémorisées (`manualLayouts`), ou, si la disposition avait été
   *    enregistrée sans redimensionnement, les effacent : on retrouve la
   *    disposition par défaut. Comme toute disposition ajustée, elles sont
   *    ensuite écrites en localStorage (`saveManualLayouts()`).
   * Les épingles sont COPIÉES (voir `copyPins()`), pour qu'un
   * redimensionnement ultérieur ne modifie pas la disposition favorite.
   * @param {{channels: string[], layout: PresetLayout}} preset
   */
  function applyPresetLayout(preset) {
    const { featured, pins } = preset.layout;
    state.featuredChannels = featured
      .filter((channel) => preset.channels.includes(channel))
      .slice(0, MAX_FEATURED_CHANNELS);

    const signature = getCurrentLayoutSignature();
    if (signature === null) return;
    // `delete` puis `set` : la combinaison repasse en fin de liste, donc
    // "récente" pour l'éviction (voir saveManualLayouts()).
    manualLayouts.delete(signature);
    if (Object.keys(pins).length > 0) manualLayouts.set(signature, copyPins(pins));
    saveManualLayouts();
  }

  /**
   * Construit l'URL de partage d'une disposition favorite : SES chaînes
   * (`preset.channels`, dans leur ordre), pas forcément celles affichées
   * à l'instant t. Réutilise le même format de hash que `writeChannelsToHash()`
   * (`#chaine1/chaine2/...`), mais construit à partir de `location.origin`
   * + `location.pathname` plutôt que de `location.href`, précisément pour
   * NE PAS reprendre le hash courant. Le lien ne porte que les CHAÎNES : les
   * favoris et les tailles de la disposition restent dans ce navigateur (le
   * hash d'URL ne connaît, comme toujours, que les chaînes visibles).
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
      // Infobulle du nom : ce que rétablit un clic. Les dispositions
      // enregistrées avant que les tailles ne soient retenues (sans `layout`)
      // ne rétablissent que leurs chaînes.
      const applyTitle = preset.layout
        ? "Appliquer : streams, streams mis en avant et taille des tuiles"
        : "Appliquer : streams seulement (taille des tuiles et mises en avant inchangées)";
      // Pastille discrète quand la disposition retient des tailles ajustées à
      // la main (icône : une grande tuile et deux petites).
      const sizesBadge = hasCustomSizes(preset)
        ? `<span class="modal-preset-layout" role="img" aria-label="Taille des tuiles mémorisée"
            title="Taille des tuiles mémorisée">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linejoin="round">
              <rect x="3.5" y="4.5" width="10" height="15" rx="1.5" />
              <rect x="16" y="4.5" width="4.5" height="6.5" rx="1.2" />
              <rect x="16" y="13" width="4.5" height="6.5" rx="1.2" />
            </svg>
          </span>`
        : "";
      row.innerHTML = `
        <button type="button" class="modal-preset-apply" title="${applyTitle}">${safeName}</button>
        ${sizesBadge}
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
   * VISIBLES, dans leur ordre d'affichage actuel, avec la disposition de leurs
   * tuiles : les streams mis en avant et les tailles ajustées à la main
   * (voir `captureCurrentLayout()`). Mettre à jour une disposition ancienne
   * (sans `layout`) lui fait retenir les tailles à son tour.
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

    const layout = captureCurrentLayout();
    const existing = state.presets.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.channels = channels;
      existing.layout = layout;
    } else {
      state.presets.push({ id: generatePresetId(), name, channels, layout });
    }

    persistState();
    renderPresetsList();

    // Le message dit ce qui a été retenu en plus des chaînes (rien à en dire
    // pour une disposition par défaut sans favori).
    const extras = [];
    if (layout.featured.length > 0) extras.push("les streams mis en avant");
    if (Object.keys(layout.pins).length > 0) extras.push("la taille des tuiles");
    const suffix = extras.length > 0 ? `, avec ${extras.join(" et ")}` : "";
    return { ok: true, message: `Disposition « ${name} » enregistrée${suffix}.` };
  }

  /**
   * Applique une disposition favorite : les chaînes qu'elle contient
   * deviennent visibles (dans son ordre), les autres chaînes actuellement
   * connues repassent invisibles SANS être oubliées (même sémantique que
   * décocher une case dans la liste). Une chaîne du preset qui n'a jamais
   * été ajoutée est créée à la volée. Si la disposition retient la disposition
   * des tuiles (`layout`), ses streams mis en avant et ses tailles sont
   * rétablis aussi (voir `applyPresetLayout()`) ; sinon, favoris et tailles
   * actuels ne sont pas touchés.
   * @param {{id: string, name: string, channels: string[], layout?: PresetLayout}} preset
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
    // Après `state.entries` (la signature de la combinaison en dépend) et avant
    // le rendu, qui lit les favoris et les tailles.
    if (preset.layout) applyPresetLayout(preset);
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

  /**
   * La touche Échap ferme la modale "Changer les streams", comme le bouton
   * « Valider » et un clic sur le fond assombri (le focus n'est pas rendu à
   * l'élément qui l'a ouverte, comme pour ces deux autres moyens de la
   * fermer). Même geste que pour la fenêtre d'aide (section 14).
   * @param {KeyboardEvent} event
   */
  function onModalKeyDown(event) {
    if (event.key === "Escape" && !el.modalOverlay.hidden) {
      event.preventDefault();
      closeModal();
    }
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
   * 14. FENÊTRE D'AIDE
   * ========================================================================== */

  /*
   * La fenêtre d'aide (#help-overlay dans index.html, ouverte par le bouton
   * « i » #btn-help de l'en-tête) est du HTML STATIQUE : texte et captures
   * d'écran sont écrits directement dans la page, rien n'est construit ici.
   * Ce code ne gère que le confort d'usage d'une boîte de dialogue :
   *  - ouverture / fermeture (bouton « × », clic à côté, touche Échap) ;
   *  - le focus clavier : il entre dans la fenêtre à l'ouverture, y reste
   *    tant qu'elle est ouverte (Tab boucle à l'intérieur) et revient au
   *    bouton d'aide à la fermeture — sans quoi on tabulerait dans la page
   *    cachée derrière ;
   *  - le sommaire : un clic sur une rubrique fait défiler le contenu jusqu'à
   *    sa section, et la rubrique de la section affichée est mise en
   *    évidence pendant le défilement.
   * Le sommaire et les renvois internes sont des boutons (`data-help-target`),
   * PAS des liens "#ancre" : le hash de l'adresse contient la liste des streams
   * (voir readChannelsFromHash(), section 4), un lien "#help-add" l'écraserait
   * et ferait changer les streams affichés.
   * La fenêtre d'aide est indépendante de la modale "Changer les streams"
   * (section 12) : les deux ont leur propre fond assombri, et comme chacune
   * recouvre toute la page, une seule peut être atteinte à la fois.
   */

  /** Élément qui avait le focus avant l'ouverture (en pratique le bouton
   *  d'aide), pour le lui rendre à la fermeture. */
  let helpReturnFocusTo = null;

  /** Vrai tant qu'une mise à jour du sommaire est déjà planifiée (voir
   *  scheduleHelpTocUpdate()). */
  let helpTocUpdateScheduled = false;

  /** Distance (en pixels) sous le haut de la zone de lecture à partir de
   *  laquelle une section est considérée comme "la section courante" : une
   *  marge, pour que la rubrique change un peu AVANT que le titre de la
   *  suivante n'atteigne le bord. */
  const HELP_TOC_OFFSET = 40;

  /**
   * @returns {boolean} vrai si la fenêtre d'aide est affichée
   */
  function isHelpOpen() {
    return !el.helpOverlay.hidden;
  }

  /**
   * Ouvre la fenêtre d'aide, au début de son contenu, et y place le focus.
   */
  function openHelp() {
    if (isHelpOpen()) return;

    helpReturnFocusTo = document.activeElement;
    el.helpOverlay.hidden = false;
    // Toujours repartir du début, même si la fenêtre avait été fermée plus
    // bas (`behavior: "instant"` : sans l'animation douce du sommaire).
    el.helpBody.scrollTo({ top: 0, behavior: "instant" });
    updateHelpToc();
    // Le focus va sur la boîte elle-même (tabindex="-1") : un lecteur
    // d'écran annonce alors son titre, et le premier Tab tombe sur le
    // bouton « × », ce qui est bien l'ordre de lecture.
    el.helpDialog.focus();
  }

  /**
   * Ferme la fenêtre d'aide et rend le focus à l'élément qui l'avait avant
   * l'ouverture (si celui-ci existe encore).
   */
  function closeHelp() {
    if (!isHelpOpen()) return;

    el.helpOverlay.hidden = true;
    if (helpReturnFocusTo && document.contains(helpReturnFocusTo)) {
      helpReturnFocusTo.focus();
    }
    helpReturnFocusTo = null;
  }

  /**
   * Fait défiler le contenu de l'aide jusqu'à la section `id` et lui donne le
   * focus, pour que la touche Tab continue à partir de son texte (et non
   * depuis le sommaire) et qu'un lecteur d'écran l'annonce.
   * @param {string} id identifiant d'une `.help-section`
   */
  function scrollToHelpSection(id) {
    const section = el.helpSections.find((candidate) => candidate.id === id);
    if (!section) return;

    // `scrollIntoView` respecte le `scroll-behavior` de .help-body (doux, sauf
    // si l'utilisateur a demandé moins d'animations, voir style.css).
    section.scrollIntoView({ block: "start" });
    // tabindex -1 : focalisable par programme seulement (pas dans l'ordre de
    // tabulation) ; `preventScroll` : `scrollIntoView` vient de s'en charger.
    section.setAttribute("tabindex", "-1");
    section.focus({ preventScroll: true });
  }

  /**
   * Met en évidence dans le sommaire la rubrique de la section actuellement
   * lue : la dernière dont le haut a atteint le haut de la zone de lecture.
   * Tout en bas du contenu, c'est la dernière section qui l'emporte : les
   * dernières sections sont trop courtes pour jamais atteindre le haut.
   */
  function updateHelpToc() {
    if (el.helpSections.length === 0) return;

    const bodyTop = el.helpBody.getBoundingClientRect().top;
    let current = el.helpSections[0];
    el.helpSections.forEach((section) => {
      if (section.getBoundingClientRect().top - bodyTop <= HELP_TOC_OFFSET) current = section;
    });
    const atBottom = el.helpBody.scrollTop + el.helpBody.clientHeight >= el.helpBody.scrollHeight - 2;
    if (atBottom) current = el.helpSections[el.helpSections.length - 1];

    el.helpTocLinks.forEach((link) => {
      if (link.dataset.helpTarget === current.id) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  /**
   * Planifie updateHelpToc() au prochain rendu au plus : l'évènement `scroll`
   * part très souvent pendant un défilement, mais le sommaire n'a besoin
   * d'être recalculé qu'une fois par image affichée.
   */
  function scheduleHelpTocUpdate() {
    if (helpTocUpdateScheduled) return;
    helpTocUpdateScheduled = true;
    requestAnimationFrame(() => {
      helpTocUpdateScheduled = false;
      updateHelpToc();
    });
  }

  /**
   * Clavier, tant que la fenêtre d'aide est ouverte :
   *  - Échap la ferme ;
   *  - Tab / Maj+Tab bouclent entre ses éléments focalisables (piège à focus),
   *    car `aria-modal` seul n'empêche pas tous les navigateurs de tabuler
   *    dans la page située derrière.
   * Écouteur posé sur `document` (voir bindGlobalEvents()) : il fonctionne
   * quel que soit l'élément qui a le focus, y compris juste après un clic sur
   * un texte de la fenêtre.
   * @param {KeyboardEvent} event
   */
  function onHelpKeyDown(event) {
    if (!isHelpOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeHelp();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      el.helpDialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((node) => !node.disabled && node.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    // La boîte elle-même a le focus juste après l'ouverture (ni premier ni
    // dernier élément) : Maj+Tab y va vers le DERNIER élément.
    if (event.shiftKey && (active === first || active === el.helpDialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ==========================================================================
   * 15. INITIALISATION & ÉCOUTEURS D'ÉVÈNEMENTS GLOBAUX
   * ========================================================================== */

  function bindGlobalEvents() {
    // Seuls ces deux points d'entrée ouvrent la modale "Changer les
    // streams" : le bouton "+" du menu, toujours affiché (mode Réorganiser
    // ou non), et le bouton de l'état vide (aucun stream configuré).
    el.btnAdd.addEventListener("click", openModal);
    el.btnEmptyAdd.addEventListener("click", openModal);

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

    // Fenêtre d'aide (section 14) : ouverture par le bouton « i », fermeture
    // par « × » ou un clic sur le fond assombri (pas sur la boîte elle-même :
    // `event.target` est alors la boîte ou l'un de ses enfants), et Échap.
    el.btnHelp.addEventListener("click", openHelp);
    el.helpClose.addEventListener("click", closeHelp);
    el.helpOverlay.addEventListener("click", (event) => {
      if (event.target === el.helpOverlay) closeHelp();
    });
    document.addEventListener("keydown", onHelpKeyDown);
    // Sommaire et renvois internes : un seul écouteur (délégation) pour tous
    // les éléments `data-help-target` de la fenêtre.
    el.helpDialog.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-help-target]");
      if (trigger) scrollToHelpSection(trigger.dataset.helpTarget);
    });
    el.helpBody.addEventListener("scroll", scheduleHelpTocUpdate, { passive: true });

    // Redimensionnement par l'angle (section 5, mode Réorganiser uniquement).
    // Les évènements du pointeur sont écoutés sur la zone entière (délégation)
    // plutôt que sur chaque poignée : il n'y a qu'un jeu d'écouteurs quel que
    // soit le nombre de tuiles, et grâce à la capture du pointeur (voir
    // onGripPointerDown()) les évènements de déplacement/relâchement d'un
    // glissement en cours y remontent même quand le curseur survole une
    // iframe Twitch. `lostpointercapture` couvre le cas où la capture est
    // retirée sans `pointerup` (tuile supprimée en cours de glissement, par
    // exemple).
    el.playersGrid.addEventListener("pointerdown", onGripPointerDown);
    el.playersGrid.addEventListener("pointermove", onGripPointerMove);
    el.playersGrid.addEventListener("pointerup", endGripDrag);
    el.playersGrid.addEventListener("pointercancel", endGripDrag);
    el.playersGrid.addEventListener("lostpointercapture", endGripDrag);
    el.playersGrid.addEventListener("keydown", onGripKeyDown);
    el.btnResetLayout.addEventListener("click", resetManualLayout);

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
    document.addEventListener("keydown", onModalKeyDown);

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
    // Avant le premier rendu (updateReorderModeUI() plus bas appelle
    // applyGridLayout()) : les tailles ajustées à la main lors d'une visite
    // précédente doivent déjà être connues à ce moment-là.
    loadManualLayouts();
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
