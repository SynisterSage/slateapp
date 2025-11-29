
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  RESUMES = 'RESUMES',
  JOBS = 'JOBS',
  APPLICATIONS = 'APPLICATIONS',
  SETTINGS = 'SETTINGS',
  SUPPORT = 'SUPPORT',
  DOCS = 'DOCS',
  GUIDES = 'GUIDES',
  WHATS_NEW = 'WHATS_NEW',
  API_DOCS = 'API_DOCS',
  LEGAL = 'LEGAL',
  SEARCH = 'SEARCH',
  RESUME_DETAIL = 'RESUME_DETAIL'
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  plan: 'free' | 'pro' | 'enterprise';
  preferences: {
    theme: 'light' | 'dark';
    emailNotifications: boolean;
    pushNotifications: boolean;
    marketingEmails: boolean;
    jobTitle: string;
    location: string;
  };
  apiUsage: {
    used: number;
    limit: number;
  };
}

export interface Skill {
  name: string;
  level: 'Beginner' | 'Intermediate' | 'Expert';
}

export interface Language {
  name: string;
  proficiency?: 'Basic' | 'Conversational' | 'Intermediate' | 'Fluent' | 'Native';
}

export interface WorkExperience {
  id: string;
  role: string;
  company: string;
  date: string;
  bullets: string[];
}

export interface Education {
  id: string;
  degree: string;
  school: string;
  date: string;
}

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  summary: string;
}

// Parsed resume shape produced by parsers / AI. Keep permissive to
// allow different providers to include different fields.
export interface ParsedResume {
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
  summary?: string;
  text?: string; // full extracted text
  skillsText?: string;
  skills?: Array<{ name?: string; level?: string }> | string[];
  experience?: any[];
  education?: any[];
  languages?: any[];
  interests?: any[];
  [key: string]: any;
}

export interface ResumeRevision {
  id: string;
  name: string;
  createdAt: string;
  score?: number;
  tags: string[];
  contentSummary: string;
  // Parsed representation produced by the resume parser (optional)
  parsed?: ParsedResume | any;
}

export interface AnalysisIssue {
  id: string;
  // allow common severities used across AI heuristics
  severity: 'critical' | 'major' | 'minor' | 'warning' | 'info' | string;
  // category can be arbitrary (e.g., 'contact', 'bullets', 'skills', 'reverseChron')
  category: string;
  title: string;
  description: string;
  suggestion?: string;
  // For mock interaction: what field does this fix update?
  fixAction?: {
    targetSection: 'experience' | 'summary' | 'skills' | 'languages' | 'interests' | 'personalInfo' | string;
    targetId?: string; // if experience
    newContent: string | string[]; // The content to replace/append
  };
}

export interface ResumeAnalysis {
  overallScore: number;
  // categories may be absent or partially populated depending on the analysis
  // flexible mapping of category name -> score (0-100)
  categories?: Record<string, number>;
  issues: AnalysisIssue[];
  // rawOutput can hold AI/provider debug output
  rawOutput?: any;
}

export interface Resume {
  id: string;
  userId?: string; // Foreign Key
  title: string;
  fileName: string;
  lastUpdated: string;
  
  // Structured Data for Editor
  personalInfo: PersonalInfo;
  skills: Skill[];
  languages?: Language[];
  interests?: string[];
  experience: WorkExperience[];
  education: Education[];

  revisions: ResumeRevision[];
  analysis?: ResumeAnalysis;
}

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  matchScore: number;
  salary?: string;
  postedAt: string;
  description: string;
  status?: 'New' | 'Applied' | 'Interviewing' | 'Offer';
  tags?: string[];
  sourceUrl?: string;
  // Provider-specific aliases and raw payload for robustness
  url?: string;
  apply_url?: string;
  link?: string;
  contact_name?: string;
  contract_time?: string;
  raw?: any;
  // Optional, parsed fields extracted from HTML descriptions
  responsibilities?: string[];
  requirements?: string[];
  benefits?: string[];
  cleanDescription?: string;
  employmentType?: string; // e.g. Full-time, Contract
  seniority?: string; // e.g. Senior, Junior
  skills?: string[];
  source?: string;
}

export interface Application {
  id: string;
  userId?: string; // Foreign Key
  jobId: string;
  resumeId: string;
  status: 'Applied' | 'Interviewing' | 'Rejected' | 'Offer';
  appliedDate: string;
  notes: string;
  lastActivity?: string;
}

export type NotificationPriority = 'info' | 'important' | 'critical';

export interface NotificationPayload {
  // free-form JSON payload for richer actions (e.g., {emailId, jobId, resumeId})
  [key: string]: any;
}

export interface Notification {
  id: string; // uuid
  userId?: string; // recipient user id
  type: string; // e.g., 'resume_parsed', 'application_submitted', 'new_message'
  priority: NotificationPriority;
  title: string;
  message: string;
  url?: string; // optional deep link in the app
  payload?: NotificationPayload;
  isRead?: boolean;
  createdAt: string;
  expiresAt?: string;
}
