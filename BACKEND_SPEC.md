
# Backend Plugin Specification

This specification describes the required API endpoints and data structures to power the SlateApp frontend.

## Base URL
`https://api.slateapp.com/v1`

## Authentication
All endpoints require `Authorization: Bearer <token>` header.

## Endpoints

### 1. Resumes
- `GET /resumes`
  - Returns: `Resume[]` (Lightweight list, exclude heavy content like experience bullets for list view if optimizing)
- `GET /resumes/:id`
  - Returns: `Resume` (Full details including analysis, experience, education, skills)
- `POST /resumes/upload`
  - Body: `FormData` (file: .pdf)
  - Process: Uploads to S3 -> Triggers Gemini Parse -> Returns `Resume` object.
- `PUT /resumes/:id`
  - Body: `Partial<Resume>`
  - Use for manual edits in the Editor (e.g., changing personal info, updating specific bullets).
- `POST /resumes/:id/tune`
  - Body: `{ jobDescription: string, targetRole: string }`
  - Returns: `Resume` (New revision tuned for the job, saves as a new revision ID in DB)

### 2. Jobs
- `GET /jobs`
  - Query Params: `q` (search), `location`, `remote` (bool), `minMatch` (int)
  - Returns: `Job[]`
- `GET /jobs/scan`
  - Trigger a background scraper job.
  - Returns: `{ jobId: string, status: 'queued' }`

### 3. Applications
- `GET /applications`
  - Returns: `Application[]` (Hydrated with Job and Resume summaries)
- `POST /applications`
  - Body: `{ jobId: string, resumeId: string, status: string }`
- `PATCH /applications/:id`
  - Body: `{ status: string, notes: string }`
- `POST /applications/export`
  - Returns: CSV File download stream.
- `POST /applications/sync`
  - Trigger Gmail/Outlook integration to find application status updates.

### 4. User / Settings
- `GET /me`
  - Returns: `UserProfile`
- `PATCH /me/preferences`
  - Body: `UserProfile['preferences']`
- `POST /me/api-key`
  - Securely validate and store Gemini API Key (if BYOK model).

## Data Models
Refer to `types.ts` in the frontend codebase for exact TypeScript interfaces. The backend JSON response keys **must** match the frontend interfaces exactly to avoid mapping layers.

### Special Handling
- **Dates**: Store as ISO 8601 strings, frontend formats them relative (e.g., "2 hours ago").
- **Colors/Tags**: Backend should generally just return status strings (e.g., "Applied"), frontend handles color mapping.
