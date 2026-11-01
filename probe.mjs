import { generateText } from "ai";
const ids = process.argv.slice(2);
for (const id of ids) {
  try {
    const r = await generateText({ model: id, prompt: "Vastaa yhdellä lyhyellä lauseella suomeksi: mitä kuuluu?", maxOutputTokens: 40 });
    console.log("OK  ", id, "|", r.text.replace(/\s+/g, " ").slice(0, 80));
  } catch (e) { console.log("NO  ", id, "|", (e.message || "").slice(0, 90)); }
}
