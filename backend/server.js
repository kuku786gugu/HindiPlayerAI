import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["audio/mpeg", "audio/mp3", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg"]);
    cb(allowed.has(file.mimetype) ? null : new Error("Upload an audio file (MP3, M4A, WAV, WebM or OGG)"), allowed.has(file.mimetype));
  }
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const required = ["OPENAI_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "APP_API_TOKEN"];
function authorize(req, res, next) {
  const token = req.get("x-app-token");
  if (!token || token !== process.env.APP_API_TOKEN) return res.status(401).json({ error: "Unauthorized" });
  next();
}
app.get("/health", (_req, res) => res.json({ ok: true, service: "Hindi Player AI dubbing API" }));

app.post("/dub", authorize, upload.single("media"), async (req, res) => {
  if (required.some(k => !process.env[k])) return res.status(503).json({ error: "Server API secrets are not configured" });
  if (!req.file) return res.status(400).json({ error: "Upload an audio file using form field 'media'" });
  const tempOutput = path.join(os.tmpdir(), crypto.randomUUID() + ".mp3");
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(req.file.path),
      model: "gpt-transcribe",
      response_format: "json"
    });
    const sourceText = String(transcription.text || "").trim();
    if (!sourceText) return res.status(422).json({ error: "No speech was detected" });

    const translated = await openai.chat.completions.create({
      model: process.env.OPENAI_TRANSLATION_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: "Translate the supplied spoken dialogue into natural, conversational Hindi. Preserve meaning, names, tone and speaker intent. Return only the Hindi translation." },
        { role: "user", content: sourceText }
      ]
    });
    const hindiText = translated.choices[0]?.message?.content?.trim();
    if (!hindiText) throw new Error("Hindi translation was empty");

    const speech = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID)}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: hindiText, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } })
    });
    if (!speech.ok) throw new Error(`ElevenLabs request failed (${speech.status}): ${(await speech.text()).slice(0, 300)}`);
    await fs.writeFile(tempOutput, Buffer.from(await speech.arrayBuffer()));
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", 'attachment; filename="hindi-dub.mp3"');
    res.setHeader("X-Source-Transcript", Buffer.from(sourceText).toString("base64"));
    res.setHeader("X-Hindi-Transcript", Buffer.from(hindiText).toString("base64"));
    res.sendFile(tempOutput);
  } catch (error) {
    console.error("Dubbing failed:", error.message);
    if (!res.headersSent) res.status(502).json({ error: "Dubbing failed", detail: error.message });
  } finally {
    await fs.rm(req.file.path, { force: true }).catch(() => {});
    setTimeout(() => fs.rm(tempOutput, { force: true }).catch(() => {}), 60_000);
  }
});

app.use((err, _req, res, _next) => res.status(err instanceof multer.MulterError ? 413 : 400).json({ error: err.message || "Bad request" }));
const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => console.log(`Dubbing API listening on ${port}`));
