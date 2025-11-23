# Slate App

This is my local resume studio app. I keep this repo lightweight so I can iterate on uploads, parsing, and the editor quickly.

Developer quick start

1. Install dependencies

```bash
npm install
```

2. Start the local API dev server (runs on port 3001)

```bash
npm run dev:server
```

3. Start the frontend (Vite)

```bash
npm run dev
```

Open the frontend URL shown by Vite (typically `http://localhost:5173`) and the dev API server will be available at `http://localhost:3001`.

Where to look in the code

- Frontend pages: `pages/Resumes.tsx` (upload UI) and `pages/ResumeDetail.tsx` (editor).
- Server/dev handlers: `api/` and the local router in `server/dev-server.js`.
- Server-side upload & parsing: `api/uploadResume.js` and `api/parseResume.js`.

Notes

- This README focuses on running the project for development. Configuration and deployment details are intentionally minimal here.
- If you want, I can add a short section with recommended environment variables or scaffold SQL for the Supabase tables.

---
an app to help u navigate this crazy job market