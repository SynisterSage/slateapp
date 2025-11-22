
# SlateApp Development Roadmap

This document outlines the step-by-step plan to transition SlateApp from a mock-data prototype to a fully functional, production-ready application.

## Current State (Prototype Complete)
- **Frontend**: React + Tailwind (Zinc/Purple theme) via CDN.
- **Key Features**: 
  - Drag-and-drop Resume Upload.
  - Resume Analysis Dashboard.
  - Job Board with Filters.
  - Kanban Board for Applications.
  - PDF Export simulation (via Print).
  - Dark/Light Mode.

## Phase 1: Backend Foundation (Weeks 1-2)

- [ ] **Database Schema**: Implement PostgreSQL schema based on `types.ts` (Users, Resumes, Jobs, Applications).
- [ ] **API Setup**: Initialize Node.js/Express or Next.js API routes.
- [ ] **Authentication**: Replace local state auth with NextAuth.js or Clerk (OAuth Google/GitHub).
- [ ] **File Storage**: Set up S3 or R2 bucket for PDF storage.

## Phase 2: Core Functionality (Weeks 3-4)

- [ ] **Resume Parsing**: Connect `Resumes.tsx` upload to a PDF parser (e.g., pdf-parse) + Gemini API to extract JSON structure.
- [ ] **Job Board Integration**: Replace `MOCK_JOBS` with a real scraper or API (e.g., LinkedIn, Indeed, or JSearch API).
- [ ] **Resume Tuning Engine**: Implement the logic in `ResumeDetail.tsx` to actually call Gemini 1.5 Pro to rewrite bullets based on Job Description.
- [ ] **PDF Generation**: Replace browser `window.print()` with a server-side PDF generator (e.g., react-pdf or Puppeteer) for pixel-perfect exports.

## Phase 3: AI & Intelligence (Weeks 5-6)

- [ ] **Match Scoring**: Implement vector embeddings (Pinecone/pgvector) to semantically match Resumes to Jobs (`matchScore`).
- [ ] **Cover Letter Gen**: Add a "Generate Cover Letter" button in the Application flow.
- [ ] **Interview Prep**: Add a chat interface using Gemini to mock interview based on the specific Job ID.

## Phase 4: Polish & Deployment (Week 7)

- [ ] **Real-time Notifications**: Hook up `Settings.tsx` preferences to a mailing service (Resend/SendGrid).
- [ ] **Mobile Responsiveness**: Audit all grids for mobile view (current `max-w-7xl` is good, but check tables).
- [ ] **Performance**: Implement React Query for caching and SWR.

## Developer Notes

- The frontend utilizes Tailwind CSS with a specific Purple/Zinc theme. `slate` colors are remapped to `zinc` in `tailwind.config` to ensure neutral gray tones.
- `mockData.ts` should be deprecated in favor of API hooks (`useResumes`, `useJobs`).