-- Supabase schema for SlateApp

-- Resumes: store full resume JSON for flexibility
create table if not exists resumes (
  id text primary key,
  data jsonb not null,
  created_at timestamptz default now()
);

-- Applications: track applications tied to resumes and jobs
create table if not exists applications (
  id text primary key,
  job_id text,
  resume_id text references resumes(id) on delete set null,
  status text,
  applied_date date,
  notes text,
  data jsonb,
  created_at timestamptz default now()
);

-- Jobs cache (optional): normalized job info
create table if not exists jobs (
  id text primary key,
  source text,
  title text,
  company text,
  location text,
  url text,
  description text,
  raw jsonb,
  created_at timestamptz default now()
);
