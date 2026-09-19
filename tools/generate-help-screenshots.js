#!/usr/bin/env node
/**
 * ============================================================================
 * StreamWall — tools/generate-help-screenshots.js
 * ----------------------------------------------------------------------------
 * OUTIL DE DÉVELOPPEMENT, facultatif : il n'est PAS nécessaire pour faire
 * tourner le site (qui reste 100% statique, sans étape de build).
 *
 * Génère les captures d'écran affichées dans la fenêtre d'aide (bouton ⓘ,
 * voir #help-overlay dans index.html) : les fichiers `assets/help/*.png`.
 * À relancer quand l'interface change, pour que l'aide ne montre pas une
 * ancienne version du site.
 *
 * Comment ça marche : il ouvre le VRAI site dans un Chrome sans fenêtre
 * (headless), le met dans chaque état à illustrer en remplissant le
 * localStorage (chaînes, favoris, mode Réorganiser, tailles ajustées,
 * thème…), puis prend une capture. Deux choses sont simulées, faute de
 * pouvoir charger Twitch :
 *  - les lecteurs vidéo : des images factices ("exemple_un", "EN DIRECT")
 *    remplacent les iframes Twitch. On ne montre donc aucun vrai stream ;
 *  - le chat : quelques messages factices.
 * Les numéros ①②③… sont ajoutés par le script (pastilles violettes posées
 * sur les éléments à expliquer) : ils correspondent aux légendes de l'aide.
 *
 * Utilisation :
 *   1. servir le site (voir documentation.md, "Lancer le projet en local") :  python3 -m http.server 8080
 *   2. installer la seule dépendance, hors du projet de préférence :
 *        npm install puppeteer-core          (dans un dossier temporaire)
 *      puis lancer le script avec ce dossier dans NODE_PATH, ou installer
 *      `puppeteer-core` dans le dossier du projet (supprimez-le ensuite :
 *      `node_modules/` n'a rien à faire dans le dépôt) ;
 *   3. node tools/generate-help-screenshots.js
 * Variables d'environnement facultatives :
 *   STREAMWALL_URL  adresse du site      (défaut http://localhost:8080/index.html)
 *   CHROME_PATH     chemin de Chrome/Edge (détecté automatiquement sinon)
 * ============================================================================
 */

const fs = require("fs");
const path = require("path");

let puppeteer;
try {
  puppeteer = require("puppeteer-core");
} catch (err) {
  console.error(
    "puppeteer-core est introuvable. Installez-le (npm install puppeteer-core), " +
      "dans le projet ou dans un dossier temporaire référencé par NODE_PATH."
  );
  process.exit(1);
}

const SITE_URL = process.env.STREAMWALL_URL || "http://localhost:8080/index.html";
const OUT_DIR = path.join(__dirname, "..", "assets", "help");

/** Cherche un Chrome/Edge installé (ou utilise CHROME_PATH). */
function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    console.error("Aucun Chrome/Edge trouvé : indiquez son chemin dans CHROME_PATH.");
    process.exit(1);
  }
  return found;
}

/** Noms de chaînes FICTIFS affichés dans les captures. */
const NAMES = ["exemple_un", "exemple_deux", "exemple_trois", "exemple_quatre", "exemple_cinq", "exemple_six"];

/**
 * Ouvre le site dans un état donné.
 * @param {import("puppeteer-core").Browser} browser
 * @param {object} options
 * @param {number} options.width largeur de la fenêtre
 * @param {number} options.height hauteur de la fenêtre
 * @param {number} [options.scale] facteur d'échelle (2 = capture nette "retina")
 * @param {"dark"|"light"} [options.theme]
 * @param {string[]} [options.channels] chaînes visibles
 * @param {string[]} [options.hidden] chaînes connues mais décochées
 * @param {string[]} [options.featured] chaînes mises en avant
 * @param {boolean} [options.reorder] mode Réorganiser actif
 * @param {boolean} [options.chat] panneau de chat visible
 * @param {object} [options.layouts] tailles ajustées (`streamwall:layouts`)
 * @param {object[]} [options.presets] dispositions favorites enregistrées
 */
async function openSite(browser, options) {
  const page = await browser.newPage();
  await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: options.scale || 1 });

  // Le SDK Twitch, les iframes de chat, etc. ne sont pas chargés : les
  // captures sont déterministes et ne dépendent pas du réseau.
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const sameSite = request.url().startsWith(new URL(SITE_URL).origin);
    if (sameSite) request.continue();
    else request.abort();
  });

  await page.evaluateOnNewDocument((state) => {
    localStorage.clear();
    const entries = [
      ...state.channels.map((name) => ({ name, visible: true })),
      ...(state.hidden || []).map((name) => ({ name, visible: false })),
    ];
    localStorage.setItem("streamwall:entries", JSON.stringify(entries));
    localStorage.setItem("streamwall:featuredChannel", JSON.stringify(state.featured || []));
    localStorage.setItem("streamwall:reorderMode", JSON.stringify(Boolean(state.reorder)));
    localStorage.setItem("streamwall:chatVisible", JSON.stringify(Boolean(state.chat)));
    localStorage.setItem("streamwall:chatChannel", state.channels[0] || "");
    localStorage.setItem("streamwall:theme", state.theme || "dark");
    localStorage.setItem("streamwall:presets", JSON.stringify(state.presets || []));
    if (state.layouts) localStorage.setItem("streamwall:layouts", JSON.stringify(state.layouts));
  }, options);

  await page.goto(SITE_URL, { waitUntil: "load" });
  await pause(500);
  return page;
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Remplace les lecteurs Twitch par des images factices : un dégradé coloré,
 * un badge "EN DIRECT" et le nom de la chaîne (fictive).
 */
async function mockPlayers(page) {
  await page.addStyleTag({
    content: `
      .mock-stream { position: absolute; inset: 0; overflow: hidden; font-family: system-ui, sans-serif;
        background: linear-gradient(135deg, hsl(var(--h) 50% 30%), hsl(calc(var(--h) + 45) 55% 15%)); color: #fff; }
      .mock-stream::before, .mock-stream::after { content: ""; position: absolute; border-radius: 50%;
        background: hsla(var(--h), 80%, 70%, 0.14); }
      .mock-stream::before { width: 55%; aspect-ratio: 1; left: -12%; top: 30%; }
      .mock-stream::after { width: 40%; aspect-ratio: 1; right: -8%; top: -18%; }
      .mock-live { position: absolute; left: 10px; bottom: 10px; background: #e91916; border-radius: 3px;
        font-size: 11px; font-weight: 700; padding: 2px 6px; letter-spacing: .4px; z-index: 1; }
      .mock-name { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: clamp(14px, 2.6vw, 26px); font-weight: 700; text-shadow: 0 1px 6px rgba(0,0,0,.5); z-index: 1; }
    `,
  });
  await page.evaluate(() => {
    let index = 0;
    document.querySelectorAll(".player-card[data-channel]").forEach((card) => {
      const video = card.querySelector(".player-card-video");
      const hue = [210, 285, 150, 20, 330, 60][index++ % 6];
      video.innerHTML =
        `<div class="mock-stream" style="--h:${hue}"><span class="mock-name">${card.dataset.channel}</span>` +
        `<span class="mock-live">EN DIRECT</span></div>`;
    });
  });
}

/** Quelques messages de chat factices dans le panneau de chat. */
async function mockChat(page) {
  await page.evaluate(() => {
    const lines = [
      ["alice", "#bf94ff", "Salut tout le monde !"],
      ["bob_42", "#00ad03", "Quelqu'un a vu la fin de la partie ?"],
      ["chloe", "#ff7f50", "Trop fort ce passage 😮"],
      ["dave", "#1e90ff", "On reste jusqu'à la fin ce soir"],
      ["emma_tv", "#ff69b4", "Le son est parfait chez moi"],
      ["fabien", "#daa520", "GG !"],
      ["alice", "#bf94ff", "À demain pour la suite"],
    ];
    const box = document.getElementById("chat-embed-container");
    box.innerHTML =
      '<div style="padding:12px;font:13px/1.5 system-ui,sans-serif;color:var(--text-primary)">' +
      lines.map(([who, color, text]) => `<div style="margin-bottom:6px"><b style="color:${color}">${who}</b> : ${text}</div>`).join("") +
      "</div>";
  });
}

/**
 * Pose des pastilles numérotées ①②③… sur des éléments de la page.
 * @param {import("puppeteer-core").Page} page
 * @param {{selector: string, n: number, place?: string, dx?: number, dy?: number, index?: number}[]} specs
 *   `place` : où poser la pastille par rapport à l'élément — "below" (dessous,
 *   centrée), "above", "left" (à gauche, centrée en hauteur), "center",
 *   "topleft", "bottomright", "bottomleft", "topright" ; `dx`/`dy` : décalage
 *   fin en pixels (le choix se fait pour ne masquer aucun texte) ; `index` : quel élément
 *   quand le sélecteur en désigne plusieurs (0 par défaut).
 */
async function addCallouts(page, specs) {
  await page.evaluate((list) => {
    const SIZE = 24;
    list.forEach((spec) => {
      const all = document.querySelectorAll(spec.selector);
      const target = all[spec.index || 0];
      if (!target) throw new Error("Élément introuvable pour la pastille : " + spec.selector);
      const r = target.getBoundingClientRect();
      const place = spec.place || "below";
      let x = r.left + r.width / 2;
      let y = r.top + r.height / 2;
      if (place === "below") y = r.bottom + SIZE / 2 + 4;
      if (place === "above") y = r.top - SIZE / 2 - 4;
      if (place === "left") x = r.left - SIZE / 2 - 4;
      if (place === "topleft") { x = r.left; y = r.top; }
      if (place === "topright") { x = r.right; y = r.top; }
      if (place === "bottomleft") { x = r.left; y = r.bottom; }
      if (place === "bottomright") { x = r.right; y = r.bottom; }
      x += spec.dx || 0;
      y += spec.dy || 0;
      const badge = document.createElement("div");
      badge.dataset.callout = "1"; // repère pour pouvoir les retirer (clearCallouts)
      badge.textContent = String(spec.n);
      badge.style.cssText =
        `position:fixed;z-index:99999;left:${x - SIZE / 2}px;top:${y - SIZE / 2}px;width:${SIZE}px;height:${SIZE}px;` +
        "border-radius:50%;background:#9147ff;color:#fff;font:700 13px/24px system-ui,sans-serif;text-align:center;" +
        "box-shadow:0 0 0 2px #fff,0 2px 8px rgba(0,0,0,.45);pointer-events:none;";
      document.body.appendChild(badge);
    });
  }, specs);
}

/** Retire toutes les pastilles posées par addCallouts(). */
async function clearCallouts(page) {
  await page.evaluate(() => document.querySelectorAll("[data-callout]").forEach((node) => node.remove()));
}

/** Enregistre une capture (zone `clip` ou page entière). */
async function shoot(page, file, clip) {
  const target = path.join(OUT_DIR, file);
  await page.screenshot({ path: target, type: "png", clip });
  const kb = Math.round(fs.statSync(target).size / 1024);
  const size = clip ? `${clip.width}x${clip.height} (x${page.viewport().deviceScaleFactor})` : "page entière";
  console.log(`  ${file.padEnd(24)} ${size.padEnd(20)} ${kb} Ko`);
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ["--no-sandbox"] });
  console.log("Génération des captures d'aide dans", OUT_DIR);

  // 1. Le menu de l'en-tête ---------------------------------------------------
  {
    const page = await openSite(browser, { width: 760, height: 240, scale: 2, channels: NAMES.slice(0, 2) });
    await addCallouts(page, [
      { selector: "#btn-add", n: 1 },
      { selector: "#btn-toggle-reorder", n: 2 },
      { selector: "#btn-toggle-chat", n: 3 },
      { selector: "#btn-help", n: 4 },
      { selector: "#btn-toggle-theme", n: 5 },
    ]);
    await shoot(page, "help-header.png", { x: 0, y: 0, width: 760, height: 96 });
    await page.close();
  }

  // 2. Vue normale : que des vidéos ---------------------------------------------
  {
    const page = await openSite(browser, { width: 1100, height: 620, channels: NAMES.slice(0, 4) });
    await mockPlayers(page);
    await shoot(page, "help-wall.png");
    await page.close();
  }

  // 3. Mode Réorganiser -----------------------------------------------------------
  {
    const page = await openSite(browser, { width: 1100, height: 620, channels: NAMES.slice(0, 4), reorder: true });
    await mockPlayers(page);
    await addCallouts(page, [
      { selector: '.player-card[data-channel="exemple_un"] .drag-handle', n: 1, place: "below", dy: 12 },
      { selector: '.player-card[data-channel="exemple_deux"] .player-card-feature', n: 2, place: "below", dy: 6 },
      { selector: '.player-card[data-channel="exemple_trois"] .player-card-remove', n: 3, place: "below", dy: 6 },
      { selector: '.player-card[data-channel="exemple_un"] .player-card-resize[data-corner="br"]', n: 4, place: "topleft", dx: -14, dy: -14 },
    ]);
    await shoot(page, "help-reorder.png");
    await page.close();
  }

  // 4. La fenêtre « Changer les streams » : deux captures ---------------------------
  //    (haut : saisie + liste des chaînes ; bas : dispositions favorites). Les
  //    deux viennent de la même fenêtre, ouverte une seule fois ; les pastilles
  //    sont numérotées à partir de 1 dans chacune, comme les légendes de l'aide.
  {
    // Une disposition qui retient des tailles ajustées à la main (`layout.pins`,
    // ici une grande tuile en haut à gauche) : la liste affiche alors l'icône de
    // tuiles. Même format que celui de l'application (voir la section 11 d'app.js).
    const presets = [
      {
        id: "demo",
        name: "Soirée entre amis",
        channels: NAMES.slice(0, 3),
        layout: { featured: [], pins: { 0: { x0: 0, y0: 0, x1: 0.6, y1: 0.7 } } },
      },
    ];
    const page = await openSite(browser, {
      width: 720, height: 900, scale: 2, channels: NAMES.slice(0, 3), hidden: [NAMES[3]], reorder: true, presets,
    });
    await page.click("#btn-add");
    await pause(300);
    const modal = await page.$(".modal");
    const box = await modal.boundingBox();
    const rectOf = (selector) =>
      page.$eval(selector, (node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      });
    const margin = 24; // laisse voir les pastilles posées à cheval sur le bord gauche

    // Haut : du sommet de la fenêtre au bas de la liste des chaînes.
    await addCallouts(page, [
      { selector: "#modal-add-input", n: 1, place: "left" },
      { selector: ".modal-channel-checkbox", index: 3, n: 2, place: "left" },
      { selector: ".modal-channel-forget", index: 3, n: 3, place: "left" },
    ]);
    const list = await rectOf("#modal-channels-list");
    await shoot(page, "help-add-streams.png", {
      x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: list.bottom - box.y + 2 * margin,
    });

    // Bas : on retire les pastilles du haut, puis on pose celles des dispositions.
    await clearCallouts(page);
    await addCallouts(page, [
      { selector: "#modal-preset-name-input", n: 1, place: "left" },
      { selector: ".modal-preset-apply", n: 2, place: "left" },
      { selector: ".modal-preset-layout", n: 3, place: "below", dy: 6 },
      { selector: ".modal-preset-share", n: 4, place: "topleft", dx: 8, dy: -10 },
    ]);
    const title = await rectOf(".modal-subtitle");
    await shoot(page, "help-presets.png", {
      x: box.x - margin, y: title.top - 20, width: box.width + 2 * margin, height: box.y + box.height - title.top + 20 + margin,
    });
    await page.close();
  }

  // 5. Deux streams mis en avant ------------------------------------------------
  {
    const page = await openSite(browser, {
      width: 1100, height: 620, channels: NAMES.slice(0, 6), featured: [NAMES[0], NAMES[1]], reorder: true,
    });
    await mockPlayers(page);
    await addCallouts(page, [
      { selector: '.player-card[data-channel="exemple_un"] .player-card-feature', n: 1, place: "below", dy: 6 },
      { selector: '.player-card[data-channel="exemple_deux"] .player-card-feature', n: 2, place: "below", dy: 6 },
    ]);
    await shoot(page, "help-favorites.png");
    await page.close();
  }

  // 6. Redimensionnement par les angles -----------------------------------------
  {
    const layouts = { "0:5": { 0: { x0: 0, y0: 0, x1: 0.58, y1: 0.66 } } };
    const page = await openSite(browser, {
      width: 1100, height: 620, channels: NAMES.slice(0, 5), reorder: true, layouts,
    });
    await mockPlayers(page);
    await addCallouts(page, [
      { selector: '.player-card[data-channel="exemple_un"] .player-card-resize[data-corner="br"]', n: 1, place: "topleft", dx: -16, dy: -16 },
      { selector: '.player-card[data-channel="exemple_deux"] .player-card-video', n: 2, place: "topleft", dx: 30, dy: 62 },
      // dx : sous le bord droit du bouton, là où la barre de la tuile voisine est vide
      { selector: "#btn-reset-layout", n: 3, dx: 68 },
    ]);
    await shoot(page, "help-resize.png");
    await page.close();
  }

  // 7. Le chat ----------------------------------------------------------------------
  {
    const page = await openSite(browser, { width: 1100, height: 620, channels: NAMES.slice(0, 3), chat: true });
    await mockPlayers(page);
    await mockChat(page);
    await addCallouts(page, [
      { selector: "#btn-toggle-chat", n: 1 },
      { selector: "#chat-channel-select", n: 2, place: "below", dx: 70 },
      { selector: "#chat-embed-container", n: 3, place: "center", dy: -20 },
    ]);
    await shoot(page, "help-chat.png");
    await page.close();
  }

  // 8. Thème clair ------------------------------------------------------------------
  {
    const page = await openSite(browser, { width: 1100, height: 620, channels: NAMES.slice(0, 4), theme: "light" });
    await mockPlayers(page);
    await addCallouts(page, [
      { selector: ".brand-logo--light", n: 1 },
      { selector: "#btn-toggle-theme", n: 2 },
    ]);
    await shoot(page, "help-light-theme.png");
    await page.close();
  }

  await browser.close();
  console.log("Terminé.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
