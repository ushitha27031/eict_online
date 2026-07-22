# Emotion Reader

Real-time facial expression detection that runs entirely in your browser — no
server-side AI, no data leaves your machine. Built with [face-api.js](https://github.com/justadudewhohacks/face-api.js)
(TensorFlow.js under the hood).

It detects 7 raw expressions — **happy, sad, angry, neutral, surprised, fearful,
disgusted** — and groups them into the buckets you asked for: **Happy / Sad /
Angry / Other**, while still showing the full probability breakdown.

## Run it

Browsers block camera access on plain `file://` pages, so you need a tiny local
server (this also matches what you asked for — "run in local server at web
browser"). Pick whichever you have installed:

**Python (usually already installed):**
```bash
cd emotion-detector
python3 -m http.server 8000
```

**Node.js:**
```bash
cd emotion-detector
npx serve -l 8000
```

Then open **http://localhost:8000** in Chrome, Edge, or Firefox, click
**Start camera**, and allow camera access when prompted.

## How it works

1. `lib/face-api.min.js` is the face-api.js library (loaded locally, no CDN needed).
2. `models/` holds three pretrained model files, loaded once on page load:
   - `tiny_face_detector` — finds the face location
   - `face_landmark_68` — locates 68 facial landmark points
   - `face_expression` — classifies expression from the face + landmarks
3. Every ~120ms, a video frame is run through the models. The bounding box,
   landmark points, and readout panel update live. The frame color and glow
   shift to match the dominant emotion.
4. Everything runs on-device via TensorFlow.js (WebGL backend) — this is
   sometimes called "affective computing" or "emotional computing": using a
   camera to infer emotional state in real time.

## Files

```
emotion-detector/
├── index.html          page structure
├── style.css            HUD-style UI
├── script.js            camera + detection logic
├── lib/
│   └── face-api.min.js  face-api.js library
└── models/               pretrained weights (~900 KB total)
```

## Notes

- Works best in good, even lighting with your face reasonably centered.
- The "confidence" shown is the model's probability score for the top
  detected expression, not a claim of certainty about how you actually feel.
- Multiple faces are tracked at once (see "Faces tracked"); the readout panel
  reports on the largest face in frame.
- If you see "Camera access denied," check your browser's site permissions
  for `localhost` and make sure no other app is holding the webcam.
