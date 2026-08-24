// Aide a recuperer votre TELEGRAM_CHAT_ID.
// 1) Envoyez d'abord un message (ex: "salut") a votre bot depuis Telegram.
// 2) Lancez : node --env-file=.env scripts/get-chat-id.mjs
//    (ou definissez TELEGRAM_BOT_TOKEN dans votre environnement avant de lancer)

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Definissez TELEGRAM_BOT_TOKEN avant de lancer ce script.");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
const data = await res.json();

if (!data.ok) {
  console.error("Erreur API Telegram:", data.description);
  process.exit(1);
}

if (data.result.length === 0) {
  console.log(
    "Aucun message recu par le bot pour l'instant.\n" +
      "-> Ouvrez Telegram, cherchez votre bot, et envoyez-lui n'importe quel message, puis relancez ce script."
  );
  process.exit(0);
}

console.log("Chat(s) trouve(s) :\n");
for (const update of data.result) {
  const chat = update.message?.chat ?? update.channel_post?.chat;
  if (chat) {
    console.log(`  chat_id = ${chat.id}   (${chat.type}, ${chat.first_name ?? chat.title ?? ""})`);
  }
}
console.log("\nCopiez le chat_id correspondant a votre conversation dans TELEGRAM_CHAT_ID.");
