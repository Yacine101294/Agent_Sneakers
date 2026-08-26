// Verifie les nouveaux raffles sneakers sur plusieurs sources et notifie via Telegram.
//
// Variables d'environnement requises :
//   TELEGRAM_BOT_TOKEN  -> token du bot (obtenu via @BotFather)
//   TELEGRAM_CHAT_ID    -> id du chat/utilisateur a notifier
//
// Usage local :
//   node --env-file=.env scripts/check-raffles.mjs
//   node --env-file=.env scripts/check-raffles.mjs --test   (envoie un message de test, sans toucher a l'etat)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const STATE_PATH = path.resolve("state", "seen.json");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_SEEN_IDS = 2000; // borne la taille du fichier d'etat dans le temps

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TEST_MODE = process.argv.includes("--test") || process.env.TEST_MODE === "true";

const BRANDS = [
  "Air Jordan",
  "Jordan",
  "Nike SB",
  "Nike",
  "adidas Originals",
  "adidas Consortium",
  "adidas",
  "Yeezy",
  "New Balance",
  "Off-White",
  "ASICS",
  "Puma",
  "Converse",
  "Vans",
  "Reebok",
  "Salomon",
  "Crocs",
];

function decodeHtmlEntities(text) {
  const entities = {
    "&amp;": "&",
    "&#038;": "&",
    "&quot;": '"',
    "&#039;": "'",
    "&apos;": "'",
    "&#8217;": "’",
    "&#8216;": "‘",
    "&#8211;": "-",
    "&#8212;": "-",
    "&nbsp;": " ",
  };
  return text.replace(/&#?\w+;/g, (match) => entities[match] ?? match);
}

function detectBrand(title) {
  for (const brand of BRANDS) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      if (brand === "adidas Originals" || brand === "adidas Consortium") return "adidas";
      return brand;
    }
  }
  return "Autre";
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Fetch de ${url} a echoue: HTTP ${res.status}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Source 1 : raffle-sneakers.com (blog dedie, page d'accueil HTML statique)
// ---------------------------------------------------------------------------
const raffleSneakersSource = {
  name: "raffle-sneakers.com",
  async fetchRaffles() {
    const html = await fetchText("https://raffle-sneakers.com/");
    const raffles = [];
    const articleRe = /<article\s+([^>]*)>([\s\S]*?)<\/article>/g;
    let match;
    while ((match = articleRe.exec(html)) !== null) {
      const [, attrs, body] = match;

      const classAttr = /class="([^"]*)"/.exec(attrs)?.[1] ?? "";
      if (!/category-raffle/.test(classAttr)) continue;

      const idAttr = /data-id="(\d+)"/.exec(attrs)?.[1];
      const linkMatch = /<h2[^>]*>\s*<a href="([^"]+)"[^>]*>([^<]+)<\/a>/.exec(body);
      if (!linkMatch) continue;
      const [, link, rawTitle] = linkMatch;
      const title = decodeHtmlEntities(rawTitle.trim());

      const statusMatch = /w-text-value">([^<]+)<\/span>/.exec(body);
      const imgMatch = /<img[^>]+src="([^"]+)"/.exec(body);

      raffles.push({
        id: idAttr ?? link,
        title,
        brand: detectBrand(title),
        link,
        status: statusMatch ? decodeHtmlEntities(statusMatch[1].trim()) : null,
        image: imgMatch ? imgMatch[1] : null,
      });
    }
    return raffles;
  },
};

// ---------------------------------------------------------------------------
// Source 2 : Tops and Bottoms USA - flux Atom du blog "New Look" (revendeur
// US, raffles maison, un article = un raffle, inscription via un formulaire
// unique sur le site).
// ---------------------------------------------------------------------------
const topsAndBottomsSource = {
  name: "topsandbottomsusa.com",
  async fetchRaffles() {
    const xml = await fetchText("https://www.topsandbottomsusa.com/blogs/new-look.atom");
    const raffles = [];
    const entries = xml.split("<entry>").slice(1);
    for (const entry of entries) {
      if (!/raffle/i.test(entry)) continue; // ce blog ne parle pas que de raffles

      const id = /<id>([^<]+)<\/id>/.exec(entry)?.[1];
      const rawTitle = /<title>([^<]*)<\/title>/.exec(entry)?.[1];
      const link = /<link rel="alternate"[^>]*href="([^"]+)"/.exec(entry)?.[1];
      if (!id || !rawTitle || !link) continue;

      const title = decodeHtmlEntities(rawTitle.trim());
      const imgMatch = /<img[^>]+src="([^"]+)"/.exec(entry);
      let image = imgMatch ? imgMatch[1] : null;
      if (image && image.startsWith("//")) image = "https:" + image;

      raffles.push({
        id,
        title,
        brand: detectBrand(title),
        link,
        status: "Raffle en cours (Tops and Bottoms USA)",
        image,
      });
    }
    return raffles;
  },
};

const SOURCES = [raffleSneakersSource, topsAndBottomsSource];

async function loadState() {
  try {
    const raw = await readFile(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return { initialized: false, seenIds: [] };
    throw err;
  }
}

async function saveState(state) {
  await mkdir(path.dirname(STATE_PATH), { recursive: true });
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function sendTelegramMessage({ brand, title, link, image, status }) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN et TELEGRAM_CHAT_ID doivent etre definis.");
  }

  const caption =
    `🆕 <b>Nouveau raffle sneakers !</b>\n\n` +
    `👟 <b>Marque :</b> ${escapeHtml(brand)}\n` +
    `📦 <b>Modele :</b> ${escapeHtml(title)}\n` +
    (status ? `📋 <b>Statut :</b> ${escapeHtml(status)}\n` : "") +
    `🔗 <b>Inscription :</b> ${link}`;

  const base = `https://api.telegram.org/bot${BOT_TOKEN}`;

  if (image) {
    const res = await fetch(`${base}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        photo: image,
        caption,
        parse_mode: "HTML",
      }),
    });
    const data = await res.json();
    if (data.ok) return;
    console.warn(`sendPhoto a echoue (${data.description}), repli sur sendMessage.`);
  }

  const res = await fetch(`${base}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: caption,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Echec envoi Telegram: ${data.description}`);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchAllRaffles() {
  const results = await Promise.allSettled(SOURCES.map((s) => s.fetchRaffles()));
  const raffles = [];
  results.forEach((result, i) => {
    const source = SOURCES[i];
    if (result.status === "fulfilled") {
      console.log(`  - ${source.name}: ${result.value.length} raffle(s)`);
      raffles.push(...result.value);
    } else {
      console.error(`  - ${source.name}: ECHEC (${result.reason?.message ?? result.reason})`);
    }
  });
  return raffles;
}

async function main() {
  if (TEST_MODE) {
    console.log("Mode test : envoi d'un message Telegram de verification...");
    await sendTelegramMessage({
      brand: "Test",
      title: "Message de test - Sneaker Raffle Watcher",
      link: "https://raffle-sneakers.com/",
      image: null,
      status: "Connexion Telegram OK ✅",
    });
    console.log("Message de test envoye avec succes.");
    return;
  }

  console.log("Recuperation des raffles sur toutes les sources...");
  const raffles = await fetchAllRaffles();
  console.log(`${raffles.length} raffle(s) trouve(s) au total.`);

  const state = await loadState();
  const seen = new Set(state.seenIds);

  if (!state.initialized) {
    console.log(
      "Premiere execution : initialisation de l'etat sans notification (evite de spammer les raffles deja en cours)."
    );
    const seenIds = raffles.map((r) => r.id).slice(0, MAX_SEEN_IDS);
    await saveState({ initialized: true, seenIds });
    console.log(`${seenIds.length} raffle(s) enregistre(s) comme deja connus.`);
    return;
  }

  const newRaffles = raffles.filter((r) => !seen.has(r.id));
  console.log(`${newRaffles.length} nouveau(x) raffle(s) detecte(s).`);

  for (const raffle of newRaffles) {
    console.log(`-> Notification: [${raffle.brand}] ${raffle.title}`);
    try {
      await sendTelegramMessage(raffle);
    } catch (err) {
      console.error(`Echec de notification pour "${raffle.title}": ${err.message}`);
    }
  }

  const updatedIds = Array.from(new Set([...raffles.map((r) => r.id), ...state.seenIds])).slice(
    0,
    MAX_SEEN_IDS
  );
  await saveState({ initialized: true, seenIds: updatedIds });
  console.log("Etat mis a jour.");
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
