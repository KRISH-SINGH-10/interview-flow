# Interview Flow: AI Mock Interview Coach

A browser app for practising job interviews out loud. You enter the role you want and paste your resume; an AI interviewer (Google Gemini) asks questions by voice, listens to your answers, and follows up. While you talk, your webcam tracks eye contact, and at the end you get a report you can download as a PDF.

## Features

- **Voice interview:** the browser's speech recognition hears your answer; Gemini writes the next question from your role, resume and the conversation so far; the browser reads it aloud.
- **Eye contact tracking:** MediaPipe Face Mesh runs on the webcam feed and shows a live eye-contact percentage.
- **Live signals:** a nervousness graph and a 0–100 "Hireability Index" that rises with strong answers and steady eye contact.
- **Session report:** strong areas, eye contact and the final score, downloadable as a PDF.

## Tech

React 19, Vite, Tailwind CSS, Google Gemini API, MediaPipe Face Mesh, Web Speech API, Recharts.

## Run it locally

```bash
npm install
echo "VITE_GEMINI_API_KEY=your_key_here" > .env
npm run dev
```

Open the local URL in Chrome and allow the microphone and camera.

Author: Krish Singh
