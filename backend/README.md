# Hindi Player AI — Dubbing API

This is the first backend component for AI Hindi voice generation.

## Pipeline
1. OpenAI Whisper transcribes uploaded speech.
2. OpenAI translates the transcript into natural Hindi.
3. ElevenLabs generates Hindi speech.
4. The API returns an MP3 voice track.

## Required server secrets
Copy `.env.example` values into your hosting provider's private environment settings:
- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID` (choose a Hindi-capable voice in ElevenLabs)
- `APP_API_TOKEN` (generate a long random token; this is the app-to-server token, not either provider key)

Never put provider API keys in the Android APK or commit real keys to Git.

## Run locally
```bash
cd backend
cp .env.example .env
# Fill .env privately
npm install
npm start
```

## API
- `GET /health`
- `POST /dub` — multipart form field `media`, header `x-app-token: <APP_API_TOKEN>`. Returns an MP3 and base64 transcript response headers.

Limitations in this first version: returns a separate Hindi voice track; it does not yet mux the track back into the video or preserve segment-level lip sync. Android app integration and end-to-end testing are still required.
