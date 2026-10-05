/**
 * ============================================================================
 * StreamWall — i18n.js
 * ----------------------------------------------------------------------------
 * Internationalisation (français / anglais) : TOUS les textes de l'interface
 * qui ne sont pas de la documentation longue vivent dans ce fichier, dans un
 * dictionnaire par langue (`MESSAGES`), et un petit moteur les applique à la
 * page. Le site reste 100 % statique : aucune requête, aucune bibliothèque.
 *
 * Trois façons d'utiliser un texte :
 *
 *  1. Texte STATIQUE (dans index.html) : un attribut `data-i18n="clé"` remplace
 *     le texte de l'élément ; `data-i18n-attr="attribut:clé;autre:clé2"`
 *     remplace des attributs (`aria-label`, `title`, `placeholder`, `content`
 *     des balises <meta>…). Le HTML contient déjà le texte FRANÇAIS : c'est ce
 *     que voient les robots d'indexation et les navigateurs sans JavaScript, et
 *     le français s'affiche sans aucun clignotement. Le dictionnaire français
 *     doit rester identique à ce texte (un test le vérifie).
 *  2. Texte DYNAMIQUE (construit par app.js) : `t("clé", { paramètres })`.
 *  3. Longue documentation (la fenêtre d'aide) : ce n'est PAS dans ce
 *     dictionnaire. index.html en contient deux versions côte à côte, une par
 *     langue (blocs `.help-lang[lang="fr"]` / `[lang="en"]`), dont le CSS
 *     n'affiche que celle de la langue courante (`<html lang>`).
 *
 * Choix de la langue, par ordre de priorité :
 *   1. `?lang=en` (ou `?lang=fr`) dans l'adresse : un lien partagé s'ouvre dans
 *      la langue de celui qui l'a partagé ;
 *   2. le choix mémorisé par le bouton de langue (localStorage) ;
 *   3. sinon le français (langue par défaut), OU celle du navigateur si
 *      `AUTO_DETECT_BROWSER_LANGUAGE` est activé (désactivé : voir cette
 *      constante).
 *
 * Ce script est chargé dans <head> (voir index.html), avant le CSS et app.js :
 * il pose `<html lang>` tout de suite (le CSS de l'aide en dépend), puis
 * applique les textes dès que le DOM est construit, AVANT que app.js ne
 * démarre. app.js s'en sert via `window.StreamWallI18n`.
 * ============================================================================
 */
(function () {
  "use strict";

  /** Langues disponibles. Ajouter une langue = ajouter son dictionnaire
   *  dans `MESSAGES`, son code ici, et une version de l'aide dans index.html. */
  const SUPPORTED_LANGUAGES = ["fr", "en"];

  /** Langue du site sans choix explicite : celle du HTML statique. */
  const DEFAULT_LANGUAGE = "fr";

  /** Clé localStorage du choix de langue (comme les autres : préfixe
   *  "streamwall:", voir STORAGE_KEY_* dans app.js). */
  const STORAGE_KEY_LANG = "streamwall:lang";

  /** Nom du paramètre d'adresse (`?lang=en`). */
  const URL_PARAM_LANG = "lang";

  /**
   * À la première visite (aucun `?lang=` ni choix mémorisé), faut-il prendre
   * la langue du NAVIGATEUR ? Désactivé volontairement : les robots
   * d'indexation se présentent en anglais, ils verraient donc la version
   * anglaise à la place de la française sur l'adresse principale, et tout le
   * travail de référencement en français (titre, description…) serait perdu.
   * Un visiteur anglophone choisit sa langue avec le bouton "FR / EN" du menu.
   * Passer à `true` pour détecter la langue du navigateur (français si elle
   * commence par "fr", anglais sinon).
   */
  const AUTO_DETECT_BROWSER_LANGUAGE = false;

  /* ==========================================================================
   * DICTIONNAIRES
   * --------------------------------------------------------------------------
   * Convention des clés : "zone.élément" (ex. "menu.add.label"). Les valeurs
   * peuvent contenir des paramètres `{nom}` (remplacés par t()) ; une clé au
   * pluriel a deux variantes, `clé.one` et `clé.other` (voir t()).
   * Les deux dictionnaires DOIVENT avoir exactement les mêmes clés, avec les
   * mêmes paramètres (un test le vérifie).
   * ========================================================================== */
  const MESSAGES = {
    fr: {
      /* ---- Métadonnées de la page ---- */
      "meta.title": "StreamWall — Regardez plusieurs streams Twitch en même temps",
      "meta.description":
        "StreamWall affiche plusieurs streams Twitch en même temps sur une seule page : mur redimensionnable, chat intégré, thèmes clair et sombre, sans compte.",
      "meta.ogLocale": "fr_FR",
      "meta.ogLocaleAlt": "en_US",
      "meta.imageAlt": "Aperçu de StreamWall : plusieurs streams Twitch côte à côte",

      /* ---- En-tête ---- */
      "brand.tagline": "— Regardez plusieurs streams Twitch en même temps",
      "menu.aria": "Menu principal",
      "menu.add.label": "Ajouter un stream (ouvre la fenêtre Changer les streams)",
      "menu.add.title": "Ajouter un stream",
      "menu.reorder": "Réorganiser",
      "menu.reset": "Réinitialiser la vue",
      "menu.reset.title": "Remet la taille de tous les streams à sa valeur par défaut",
      "menu.templates": "Modèles de disposition",
      "menu.chat.extra": "Afficher/Masquer le ",
      "menu.chat.word": "chat",
      "menu.chat.label": "Afficher/Masquer le chat",
      "menu.help.label": "Aide : découvrir les options de StreamWall",
      "menu.help.title": "Aide",
      // Le bouton de langue montre l'AUTRE langue (celle vers laquelle il bascule).
      "menu.lang.text": "EN",
      "menu.lang.title": "English",
      "menu.lang.label": "Passer le site en anglais (English)",
      "menu.theme.label": "Basculer entre le thème sombre et le thème clair",
      "menu.github.label": "Code source de StreamWall sur GitHub (s'ouvre dans un nouvel onglet)",
      "menu.github.title": "Code source sur GitHub",

      /* ---- Zone des streams, état vide (page d'accueil) ---- */
      "grid.aria": "Streams en cours",
      "empty.title": "Regardez plusieurs streams Twitch en même temps",
      "empty.text":
        "Aucun stream n'est affiché pour l'instant. Ajoutez des chaînes Twitch pour commencer à les regarder en simultané.",
      "empty.f1": "Toutes les tuiles se partagent 100 % de l'écran, sans case vide ni défilement.",
      "empty.f2": "Réorganisez, mettez en avant et redimensionnez chaque stream à la souris.",
      "empty.f3": "Enregistrez vos dispositions favorites et partagez un lien vers vos streams.",
      "empty.f4": "Chat Twitch intégré, thèmes clair et sombre, aide en ligne.",
      "empty.f5": "Sans compte, sans serveur : tout reste dans votre navigateur.",
      "empty.button": "Ajouter des streams",

      /* ---- Chat ---- */
      "chat.label": "Chat de :",
      "chat.iframeTitle": "Chat Twitch de {channel}",
      "chat.keep.label": "Garder chargé",
      "chat.keep.title": "Garde ce chat connecté en arrière-plan quand vous passez à un autre chat : il ne sera pas rechargé en y revenant.",

      /* ---- Cartes des streams ---- */
      "card.header": "{channel} — glisser-déposer, ou flèches du clavier, pour réorganiser",
      "card.remove": "Retirer {channel} de la grille",
      "card.feature.on": "Ne plus mettre {channel} en avant",
      "card.feature.off": "Mettre {channel} en avant",
      "card.resize.tl": "Redimensionner {channel} par son coin haut gauche : glisser, ou flèches du clavier",
      "card.resize.tr": "Redimensionner {channel} par son coin haut droit : glisser, ou flèches du clavier",
      "card.resize.bl": "Redimensionner {channel} par son coin bas gauche : glisser, ou flèches du clavier",
      "card.resize.br": "Redimensionner {channel} par son coin bas droit : glisser, ou flèches du clavier",
      "card.main": "Stream principal",
      "card.promote": "Mettre {channel} en principal (l'échanger avec le stream de la vignette principale)",
      "card.promote.title": "Mettre en principal",

      /* ---- Fenêtre « Changer les streams » ---- */
      "modal.title": "Changer les streams",
      "modal.help":
        "Cochez une chaîne pour l'afficher, décochez-la pour la retirer de la grille (elle reste dans la liste pour la recocher plus tard). Utilisez le bouton « × » pour l'oublier définitivement.",
      "modal.add.placeholder": "Nom de la chaîne (ex. zerator)",
      "modal.add.button": "Ajouter",
      "modal.channels.empty": "Aucune chaîne pour le moment. Ajoutez-en une ci-dessus.",
      "modal.channel.forget": "Oublier {channel}",
      "modal.presets.title": "Dispositions favorites",
      "modal.presets.help":
        "Retient les streams affichés, leur ordre, ceux mis en avant (★) et la taille de chaque tuile. Un clic sur son nom rétablit tout cela.",
      "modal.presets.placeholder": "Nom de la disposition (ex. Soirée ranked)",
      "modal.presets.save": "Enregistrer",
      "modal.templates.title": "Modèles de disposition",
      "modal.templates.help":
        "Un modèle ne retient que la forme des tuiles, avec une vignette principale. Appliqué, il répartit vos streams sur ses vignettes — le stream principal dans la principale — et désactive ceux en trop. La couronne en haut à droite d'une tuile la bascule ensuite en principal, sans changer la disposition.",
      "modal.templates.create": "Créer un modèle",
      "modal.templates.createHelp": "Passe en mode Réorganiser et ouvre le panneau des modèles : arrangez le mur, puis enregistrez-le.",
      "modal.tabs.aria": "Dispositions",
      "modal.confirm": "Valider",

      /* ---- Dispositions favorites (liste et messages) ---- */
      "preset.empty": "Aucune disposition enregistrée.",
      "preset.count.one": "{count} stream",
      "preset.count.other": "{count} streams",
      "preset.sizes": "Taille des tuiles mémorisée",
      "preset.apply.full": "Appliquer : streams, streams mis en avant et taille des tuiles",
      "preset.apply.legacy": "Appliquer : streams seulement (taille des tuiles et mises en avant inchangées)",
      "preset.share": "Copier le lien de la disposition {name}",
      "preset.delete": "Supprimer la disposition {name}",
      "preset.error.name": "Entrez un nom pour cette disposition.",
      "preset.error.noStream": "Aucun stream affiché à enregistrer.",
      "preset.saved": "Disposition « {name} » enregistrée.",
      "preset.saved.with": "Disposition « {name} » enregistrée, avec {extras}.",
      "preset.extra.featured": "les streams mis en avant",
      "preset.extra.sizes": "la taille des tuiles",
      "preset.extra.and": " et ",
      "preset.makeTemplate": "Créer un modèle de disposition d'après {name}",
      "preset.makeTemplate.title": "Créer un modèle d'après cette disposition",
      "preset.makeTemplate.error": "Il faut au moins {min} streams dans une disposition pour en faire un modèle.",

      /* ---- Modèles de disposition (liste, éditeur, messages) ---- */
      "template.empty": "Aucun modèle enregistré.",
      "template.count.one": "{count} vignette",
      "template.count.other": "{count} vignettes",
      "template.apply": "Appliquer : répartir les streams affichés sur ce modèle",
      "template.active": "Modèle appliqué à l'écran (cliquer pour le réappliquer)",
      "template.share": "Copier le lien du modèle {name}",
      "template.delete": "Supprimer le modèle {name}",
      "template.edit": "Modifier le modèle {name}",
      "template.edit.title": "Modifier : l'applique et passe en mode Réorganiser",
      "template.builtin.duo": "Côte à côte",
      "template.builtin.main2": "Principal + 2",
      "template.builtin.main3right": "Principal + 3 à droite",
      "template.builtin.main3bottom": "Principal + 3 en bas",
      "template.builtin.grid4": "2 × 2",
      "template.builtin.main5": "Principal + 5",
      "template.builtin.grid6": "3 × 2",
      "template.builtin.main7": "Principal + 7",
      "template.builtin.grid9": "3 × 3",
      "template.shared.defaultName": "Modèle partagé",
      "template.gallery.item.one": "{label} ({count} vignette)",
      "template.gallery.item.other": "{label} ({count} vignettes)",
      "template.error.name": "Entrez un nom pour ce modèle.",
      "template.error.duplicate": "Un autre modèle s'appelle déjà « {name} ».",
      "template.saved.one": "Modèle « {name} » enregistré : {count} vignette.",
      "template.saved.other": "Modèle « {name} » enregistré : {count} vignettes.",
      "template.applied": "Modèle « {name} » appliqué.",
      "template.applied.disabled.one": "{count} stream en trop a été désactivé.",
      "template.applied.disabled.other": "{count} streams en trop ont été désactivés.",
      "template.applied.revived.one": "{count} stream masqué a été réaffiché pour le remplir.",
      "template.applied.revived.other": "{count} streams masqués ont été réaffichés pour le remplir.",
      "template.error.notEnough.one":
        "Le modèle « {name} » compte {slots} vignettes : ajoutez encore {count} stream pour l'appliquer.",
      "template.error.notEnough.other":
        "Le modèle « {name} » compte {slots} vignettes : ajoutez encore {count} streams pour l'appliquer.",

      /* ---- Barre des modèles (mode Réorganiser) ---- */
      "templatePanel.title": "Modèles de disposition",
      "templatePanel.help":
        "Choisissez une disposition conseillée ou ajustez les tuiles, puis enregistrez-la comme modèle. La tuile du stream principal (couronne) devient la vignette principale.",
      "templatePanel.gallery": "Dispositions conseillées :",
      "templatePanel.placeholder": "Nom du modèle",
      "templatePanel.save": "Enregistrer le modèle",
      "templatePanel.editing": "Modification de « {name} »",
      "templatePanel.started":
        "Arrangez le mur (ou choisissez une disposition conseillée), puis enregistrez. Le premier stream mis en avant (★) est le principal.",
      "templatePanel.error.fewStreams": "Il faut de {min} à {max} streams affichés pour enregistrer un modèle.",

      /* ---- Ouverture d'un lien de partage qui porte une disposition ---- */
      "share.template.applied": "Modèle « {name} » reçu et appliqué : il est dans vos modèles de disposition.",
      "share.template.saved.one":
        "Modèle « {name} » reçu et ajouté à vos modèles : il manque {count} stream pour l'appliquer.",
      "share.template.saved.other":
        "Modèle « {name} » reçu et ajouté à vos modèles : il manque {count} streams pour l'appliquer.",
      "share.layout.applied": "Disposition partagée appliquée, avec ses streams mis en avant et la taille de ses tuiles.",
      "share.invalid": "Ce lien contient une disposition illisible : elle a été ignorée.",

      /* ---- Validation d'un nom de chaîne ---- */
      "error.channel.empty": "Entrez un nom de chaîne.",
      "error.channel.chars": "Nom invalide : uniquement lettres, chiffres et underscore.",
      "error.channel.length": "Nom invalide : les noms Twitch font entre 4 et 25 caractères.",

      /* ---- Messages passagers (toast) ---- */
      "toast.featuredMax":
        "{max} streams peuvent être mis en avant au maximum — désélectionnez-en un d'abord.",
      "toast.linkCopied": "Lien copié dans le presse-papiers.",

      /* ---- Fenêtre d'aide (le contenu long est dans index.html) ---- */
      "help.title": "Aide — les options de StreamWall",
      "help.close": "Fermer l'aide",
      "help.toc.aria": "Sommaire de l'aide",
      "help.toc.intro": "Pour commencer",
      "help.toc.menu": "Le menu du haut",
      "help.toc.add": "Ajouter des streams",
      "help.toc.wall": "Le mur et le son",
      "help.toc.reorder": "Mode Réorganiser",
      "help.toc.favorites": "Mettre en avant",
      "help.toc.resize": "Redimensionner",
      "help.toc.chat": "Le chat",
      "help.toc.presets": "Dispositions favorites",
      "help.toc.templates": "Modèles de disposition",
      "help.toc.theme": "Thème clair / sombre",
      "help.toc.keyboard": "Clavier et écran tactile",
      "help.toc.data": "Vos données",
      "help.toc.versions": "Historique des versions",
    },

    en: {
      /* ---- Page metadata ---- */
      "meta.title": "StreamWall — Watch multiple Twitch streams at once",
      "meta.description":
        "StreamWall shows several Twitch streams at once on a single page: resizable wall, built-in chat, light and dark themes, no account needed.",
      "meta.ogLocale": "en_US",
      "meta.ogLocaleAlt": "fr_FR",
      "meta.imageAlt": "StreamWall preview: several Twitch streams side by side",

      /* ---- Header ---- */
      "brand.tagline": "— Watch multiple Twitch streams at once",
      "menu.aria": "Main menu",
      "menu.add.label": "Add a stream (opens the Change streams window)",
      "menu.add.title": "Add a stream",
      "menu.reorder": "Rearrange",
      "menu.reset": "Reset view",
      "menu.reset.title": "Resets every stream to its default size",
      "menu.templates": "Layout templates",
      "menu.chat.extra": "Show/Hide ",
      "menu.chat.word": "chat",
      "menu.chat.label": "Show/Hide chat",
      "menu.help.label": "Help: discover StreamWall's options",
      "menu.help.title": "Help",
      "menu.lang.text": "FR",
      "menu.lang.title": "Français",
      "menu.lang.label": "Switch the site to French (Français)",
      "menu.theme.label": "Switch between the dark and light themes",
      "menu.github.label": "StreamWall source code on GitHub (opens in a new tab)",
      "menu.github.title": "Source code on GitHub",

      /* ---- Streams area, empty state (home page) ---- */
      "grid.aria": "Streams being watched",
      "empty.title": "Watch multiple Twitch streams at once",
      "empty.text":
        "No stream is displayed yet. Add Twitch channels to start watching them at the same time.",
      "empty.f1": "Tiles share 100% of the screen, with no empty space and no scrolling.",
      "empty.f2": "Rearrange, feature and resize each stream with your mouse.",
      "empty.f3": "Save your favorite layouts and share a link to your streams.",
      "empty.f4": "Built-in Twitch chat, light and dark themes, online help.",
      "empty.f5": "No account, no server: everything stays in your browser.",
      "empty.button": "Add streams",

      /* ---- Chat ---- */
      "chat.label": "Chat for:",
      "chat.iframeTitle": "Twitch chat of {channel}",
      "chat.keep.label": "Keep loaded",
      "chat.keep.title": "Keeps this chat connected in the background when you switch to another chat: it will not reload when you come back.",

      /* ---- Stream cards ---- */
      "card.header": "{channel} — drag and drop, or use the arrow keys, to rearrange",
      "card.remove": "Remove {channel} from the grid",
      "card.feature.on": "Stop featuring {channel}",
      "card.feature.off": "Feature {channel}",
      "card.resize.tl": "Resize {channel} from its top-left corner: drag, or use the arrow keys",
      "card.resize.tr": "Resize {channel} from its top-right corner: drag, or use the arrow keys",
      "card.resize.bl": "Resize {channel} from its bottom-left corner: drag, or use the arrow keys",
      "card.resize.br": "Resize {channel} from its bottom-right corner: drag, or use the arrow keys",
      "card.main": "Main stream",
      "card.promote": "Make {channel} the main stream (swap it with the stream in the main tile)",
      "card.promote.title": "Make main",

      /* ---- "Change streams" window ---- */
      "modal.title": "Change streams",
      "modal.help":
        "Tick a channel to show it, untick it to remove it from the grid (it stays in the list so you can tick it again later). Use the “×” button to forget it for good.",
      "modal.add.placeholder": "Channel name (e.g. zerator)",
      "modal.add.button": "Add",
      "modal.channels.empty": "No channels yet. Add one above.",
      "modal.channel.forget": "Forget {channel}",
      "modal.presets.title": "Favorite layouts",
      "modal.presets.help":
        "Remembers the displayed streams, their order, the featured ones (★) and the size of each tile. Click a layout's name to restore all of it.",
      "modal.presets.placeholder": "Layout name (e.g. Ranked night)",
      "modal.presets.save": "Save",
      "modal.templates.title": "Layout templates",
      "modal.templates.help":
        "A template only remembers the shape of the tiles, with one main tile. Applied, it spreads your streams over its tiles — the main stream in the main tile — and turns off the extra ones. The crown at the top right of a tile then makes it the main stream, without changing the layout.",
      "modal.templates.create": "Create a template",
      "modal.templates.createHelp": "Switches to Rearrange mode and opens the templates panel: arrange the wall, then save it.",
      "modal.tabs.aria": "Layouts",
      "modal.confirm": "Done",

      /* ---- Favorite layouts (list and messages) ---- */
      "preset.empty": "No saved layout yet.",
      "preset.count.one": "{count} stream",
      "preset.count.other": "{count} streams",
      "preset.sizes": "Tile sizes remembered",
      "preset.apply.full": "Apply: streams, featured streams and tile sizes",
      "preset.apply.legacy": "Apply: streams only (tile sizes and featured streams unchanged)",
      "preset.share": "Copy the link to the layout {name}",
      "preset.delete": "Delete the layout {name}",
      "preset.error.name": "Enter a name for this layout.",
      "preset.error.noStream": "No displayed stream to save.",
      "preset.saved": "Layout “{name}” saved.",
      "preset.saved.with": "Layout “{name}” saved, with {extras}.",
      "preset.extra.featured": "the featured streams",
      "preset.extra.sizes": "the tile sizes",
      "preset.extra.and": " and ",
      "preset.makeTemplate": "Create a layout template from {name}",
      "preset.makeTemplate.title": "Create a template from this layout",
      "preset.makeTemplate.error": "A layout needs at least {min} streams to become a template.",

      /* ---- Layout templates (list, editor, messages) ---- */
      "template.empty": "No saved template yet.",
      "template.count.one": "{count} tile",
      "template.count.other": "{count} tiles",
      "template.apply": "Apply: spread the displayed streams over this template",
      "template.active": "Template applied to the screen (click to apply it again)",
      "template.share": "Copy the link to the template {name}",
      "template.delete": "Delete the template {name}",
      "template.edit": "Edit the template {name}",
      "template.edit.title": "Edit: applies it and switches to Rearrange mode",
      "template.builtin.duo": "Side by side",
      "template.builtin.main2": "Main + 2",
      "template.builtin.main3right": "Main + 3 on the right",
      "template.builtin.main3bottom": "Main + 3 below",
      "template.builtin.grid4": "2 × 2",
      "template.builtin.main5": "Main + 5",
      "template.builtin.grid6": "3 × 2",
      "template.builtin.main7": "Main + 7",
      "template.builtin.grid9": "3 × 3",
      "template.shared.defaultName": "Shared template",
      "template.gallery.item.one": "{label} ({count} tile)",
      "template.gallery.item.other": "{label} ({count} tiles)",
      "template.error.name": "Enter a name for this template.",
      "template.error.duplicate": "Another template is already called “{name}”.",
      "template.saved.one": "Template “{name}” saved: {count} tile.",
      "template.saved.other": "Template “{name}” saved: {count} tiles.",
      "template.applied": "Template “{name}” applied.",
      "template.applied.disabled.one": "{count} extra stream was turned off.",
      "template.applied.disabled.other": "{count} extra streams were turned off.",
      "template.applied.revived.one": "{count} hidden stream was shown again to fill it.",
      "template.applied.revived.other": "{count} hidden streams were shown again to fill it.",
      "template.error.notEnough.one":
        "The template “{name}” has {slots} tiles: add {count} more stream to apply it.",
      "template.error.notEnough.other":
        "The template “{name}” has {slots} tiles: add {count} more streams to apply it.",

      /* ---- Templates bar (Rearrange mode) ---- */
      "templatePanel.title": "Layout templates",
      "templatePanel.help":
        "Pick a suggested layout or adjust the tiles, then save it as a template. The main stream's tile (crown) becomes the main tile.",
      "templatePanel.gallery": "Suggested layouts:",
      "templatePanel.placeholder": "Template name",
      "templatePanel.save": "Save template",
      "templatePanel.editing": "Editing “{name}”",
      "templatePanel.started":
        "Arrange the wall (or pick a suggested layout), then save. The first featured stream (★) is the main one.",
      "templatePanel.error.fewStreams": "You need {min} to {max} displayed streams to save a template.",

      /* ---- Opening a share link that carries a layout ---- */
      "share.template.applied": "Template “{name}” received and applied: it is in your layout templates.",
      "share.template.saved.one":
        "Template “{name}” received and added to your templates: {count} more stream is needed to apply it.",
      "share.template.saved.other":
        "Template “{name}” received and added to your templates: {count} more streams are needed to apply it.",
      "share.layout.applied": "Shared layout applied, with its featured streams and its tile sizes.",
      "share.invalid": "This link carries an unreadable layout: it was ignored.",

      /* ---- Channel name validation ---- */
      "error.channel.empty": "Enter a channel name.",
      "error.channel.chars": "Invalid name: letters, digits and underscores only.",
      "error.channel.length": "Invalid name: Twitch names are 4 to 25 characters long.",

      /* ---- Transient messages (toast) ---- */
      "toast.featuredMax": "At most {max} streams can be featured — unfeature one first.",
      "toast.linkCopied": "Link copied to the clipboard.",

      /* ---- Help window (the long content is in index.html) ---- */
      "help.title": "Help — StreamWall's options",
      "help.close": "Close help",
      "help.toc.aria": "Help contents",
      "help.toc.intro": "Getting started",
      "help.toc.menu": "The top menu",
      "help.toc.add": "Adding streams",
      "help.toc.wall": "The wall and sound",
      "help.toc.reorder": "Rearrange mode",
      "help.toc.favorites": "Featuring streams",
      "help.toc.resize": "Resizing",
      "help.toc.chat": "The chat",
      "help.toc.presets": "Favorite layouts",
      "help.toc.templates": "Layout templates",
      "help.toc.theme": "Light / dark theme",
      "help.toc.keyboard": "Keyboard and touch",
      "help.toc.data": "Your data",
      "help.toc.versions": "Version history",
    },
  };

  /* ==========================================================================
   * ÉTAT ET OUTILS
   * ========================================================================== */

  /** Langue courante ("fr" ou "en"). */
  let currentLanguage = DEFAULT_LANGUAGE;

  /** Règles de pluriel de la langue courante (`Intl.PluralRules`) : le
   *  français traite 0 et 1 au singulier, l'anglais seulement 1. */
  let pluralRules = new Intl.PluralRules(DEFAULT_LANGUAGE);

  /** Fonctions à rappeler après un changement de langue (voir onChange()). */
  const changeListeners = [];

  /**
   * @param {unknown} language
   * @returns {boolean} vrai si `language` est une langue disponible
   */
  function isSupported(language) {
    return typeof language === "string" && SUPPORTED_LANGUAGES.includes(language);
  }

  /**
   * Lit `?lang=` dans l'adresse.
   * @returns {string|null} la langue demandée, ou null si absente/inconnue
   */
  function readLanguageFromUrl() {
    try {
      const value = new URLSearchParams(window.location.search).get(URL_PARAM_LANG);
      return isSupported(value) ? value : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Lit le choix mémorisé (localStorage peut être indisponible : navigation
   * privée stricte, données bloquées…).
   * @returns {string|null}
   */
  function readStoredLanguage() {
    try {
      const value = localStorage.getItem(STORAGE_KEY_LANG);
      return isSupported(value) ? value : null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Langue du navigateur ramenée à l'une des nôtres : français si elle
   * commence par "fr", anglais sinon.
   * @returns {string}
   */
  function detectBrowserLanguage() {
    const preferred = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    return preferred.toLowerCase().startsWith("fr") ? "fr" : "en";
  }

  /**
   * Détermine la langue au chargement (voir l'en-tête du fichier pour l'ordre
   * de priorité).
   * @returns {string}
   */
  function resolveInitialLanguage() {
    return (
      readLanguageFromUrl() ||
      readStoredLanguage() ||
      (AUTO_DETECT_BROWSER_LANGUAGE ? detectBrowserLanguage() : DEFAULT_LANGUAGE)
    );
  }

  /**
   * Traduit une clé dans la langue courante. Un texte manquant dans la langue
   * courante retombe sur le français, puis sur la clé elle-même (visible à
   * l'écran : un oubli se voit tout de suite).
   *
   * - `{nom}` est remplacé par `params.nom` ;
   * - si `params.count` est un nombre, la clé est cherchée avec le suffixe du
   *   pluriel (`clé.one` ou `clé.other`, selon les règles de la langue).
   *
   * Le résultat est du TEXTE BRUT : un appelant qui l'insère dans du HTML
   * (`innerHTML`) doit échapper les paramètres qu'il fournit.
   * @param {string} key
   * @param {Record<string, string|number>} [params]
   * @returns {string}
   */
  function t(key, params) {
    const dictionary = MESSAGES[currentLanguage] || MESSAGES[DEFAULT_LANGUAGE];
    let entryKey = key;
    if (params && typeof params.count === "number") {
      const pluralKey = `${key}.${pluralRules.select(params.count)}`;
      entryKey = pluralKey in dictionary ? pluralKey : `${key}.other`;
    }
    let text = dictionary[entryKey];
    if (text === undefined) text = MESSAGES[DEFAULT_LANGUAGE][entryKey];
    if (text === undefined) return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
  }

  /**
   * Applique les textes de la langue courante aux éléments marqués
   * `data-i18n` (texte) et `data-i18n-attr` (attributs) sous `root`. Les
   * balises de <head> (<title>, <meta>) sont incluses quand `root` est le
   * document.
   * @param {ParentNode} [root]
   */
  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    scope.querySelectorAll("[data-i18n-attr]").forEach((node) => {
      node.dataset.i18nAttr.split(";").forEach((pair) => {
        const separator = pair.indexOf(":");
        if (separator === -1) return;
        node.setAttribute(pair.slice(0, separator).trim(), t(pair.slice(separator + 1).trim()));
      });
    });
  }

  /**
   * Reporte la langue courante dans l'adresse : `?lang=en` pour l'anglais,
   * rien pour le français (langue par défaut). Le hash (liste des streams) et
   * le chemin sont conservés. `replaceState` : pas d'entrée d'historique en
   * plus.
   */
  function syncUrlParameter() {
    try {
      const url = new URL(window.location.href);
      if (currentLanguage === DEFAULT_LANGUAGE) {
        url.searchParams.delete(URL_PARAM_LANG);
      } else {
        url.searchParams.set(URL_PARAM_LANG, currentLanguage);
      }
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch (err) {
      // Adresse non modifiable (aperçu, iframe sandboxée…) : sans importance.
    }
  }

  /**
   * Change de langue : met à jour `<html lang>`, les règles de pluriel, les
   * textes statiques, la mémoire (localStorage) et l'adresse, puis prévient
   * ceux qui se sont abonnés avec onChange() (app.js y refait ses textes
   * dynamiques).
   * @param {string} language
   * @returns {boolean} faux si la langue n'existe pas
   */
  function setLanguage(language) {
    if (!isSupported(language)) return false;

    currentLanguage = language;
    pluralRules = new Intl.PluralRules(language);
    document.documentElement.lang = language;
    applyTranslations();

    try {
      localStorage.setItem(STORAGE_KEY_LANG, language);
    } catch (err) {
      console.warn("StreamWall: impossible d'écrire dans localStorage.", err);
    }
    syncUrlParameter();

    changeListeners.forEach((listener) => listener(language));
    return true;
  }

  /**
   * S'abonne aux changements de langue.
   * @param {(language: string) => void} listener
   */
  function onChange(listener) {
    changeListeners.push(listener);
  }

  /**
   * @returns {string} l'autre langue (celle vers laquelle bascule le bouton
   *   de langue) ; avec deux langues, il n'y en a qu'une.
   */
  function getAlternateLanguage() {
    return SUPPORTED_LANGUAGES.find((language) => language !== currentLanguage) || DEFAULT_LANGUAGE;
  }

  /* ==========================================================================
   * INITIALISATION
   * ========================================================================== */

  currentLanguage = resolveInitialLanguage();
  pluralRules = new Intl.PluralRules(currentLanguage);
  document.documentElement.lang = currentLanguage;

  // Une langue demandée par l'adresse devient le choix mémorisé (le lien
  // partagé "?lang=en" est un choix explicite).
  if (readLanguageFromUrl()) {
    try {
      localStorage.setItem(STORAGE_KEY_LANG, currentLanguage);
    } catch (err) {
      // localStorage indisponible : la langue de l'adresse vaut pour cette visite.
    }
  }

  // Les textes statiques sont appliqués dès que le DOM est construit (ce script
  // est dans <head> : à cet instant, la page n'existe pas encore). Le français
  // est déjà dans le HTML : rien à faire pour lui, ce qui évite tout travail
  // (et tout clignotement) pour la langue par défaut.
  function applyInitialTranslations() {
    if (currentLanguage !== DEFAULT_LANGUAGE) applyTranslations();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyInitialTranslations);
  } else {
    applyInitialTranslations();
  }

  window.StreamWallI18n = {
    t,
    setLanguage,
    onChange,
    applyTranslations,
    getAlternateLanguage,
    getLanguage: () => currentLanguage,
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    MESSAGES,
  };
})();
