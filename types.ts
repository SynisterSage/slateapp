
export enum AppView {
  DASHBOARD = 'DASHBOARD',
  RESUMES = 'RESUMES',
  JOBS = 'JOBS',
  APPLICATIONS = 'APPLICATIONS',
  SETTINGS = 'SETTINGS',
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

export interface ResumeRevision {
  id: string;
  name: string;
  createdAt: string;
  score?: number;
  tags: string[];
  contentSummary: string;
}

export interface AnalysisIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'impact' | 'brevity' | 'style' | 'ats';
  title: string;
  description: string;
  suggestion?: string;
  // For mock interaction: what field does this fix update?
  fixAction?: {
    targetSection: 'experience' | 'summary';
    targetId?: string; // if experience
    newContent: string | string[]; // The content to replace/append
  };
}

export interface ResumeAnalysis {
  overallScore: number;
  categories: {
    impact: number;
    brevity: number;
    style: number;
    ats: number;
  };
  issues: AnalysisIssue[];
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
