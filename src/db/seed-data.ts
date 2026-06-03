/**
 * Demo dataset for `src/db/seed.ts`. Lives in its own module so tests can
 * assert referential integrity, stage coverage, and lowercasing without
 * needing a live Postgres connection.
 *
 * Foreign keys are expressed by *array index* here (e.g. `contactIndex`,
 * `companyIndex`). The seed script resolves these to the real serial IDs
 * after the parent rows have been inserted.
 */
import type {
  ApplicationStage,
} from "@/lib/types";

/** Reference timestamp used to keep `appliedAt` values reproducible. */
const NOW = new Date("2026-06-01T12:00:00Z");

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

export interface SeedCompany {
  name: string;
  website: string;
  careersUrl: string;
  notes?: string;
}

export interface SeedContact {
  name: string;
  email: string;
  notes?: string;
}

export interface SeedRecruiter {
  /** Index into {@link seedContacts}. */
  contactIndex: number;
  agency: string | null;
  notes?: string;
}

export interface SeedRelationship {
  contactIndex: number;
  companyIndex: number;
  role: string;
  notes?: string;
}

export interface SeedApplication {
  title: string;
  companyIndex: number;
  recruiterIndex: number | null;
  primaryContactIndex: number | null;
  location: string;
  salaryNote: string;
  stage: ApplicationStage;
  positionInStage: number;
  appliedAt: Date | null;
  notes?: string;
}

export interface SeedEmailAllowlist {
  kind: "domain" | "address";
  value: string;
  notes?: string;
}

export interface SeedEmailEvent {
  providerMessageId: string;
  threadId: string;
  sender: string;
  subject: string;
  sentAt: Date;
  applicationIndex: number | null;
}

export const seedCompanies: SeedCompany[] = [
  {
    name: "Stripe",
    website: "https://stripe.com",
    careersUrl: "https://stripe.com/jobs",
    notes: "Payments platform. Strong referral path via Alex.",
  },
  {
    name: "Linear",
    website: "https://linear.app",
    careersUrl: "https://linear.app/careers",
    notes: "Remote-first issue tracker. Engineering-led culture.",
  },
  {
    name: "Anthropic",
    website: "https://anthropic.com",
    careersUrl: "https://anthropic.com/careers",
    notes: "AI safety research lab.",
  },
  {
    name: "Vercel",
    website: "https://vercel.com",
    careersUrl: "https://vercel.com/careers",
    notes: "Frontend cloud + Next.js maintainers.",
  },
  {
    name: "Neon",
    website: "https://neon.tech",
    careersUrl: "https://neon.tech/careers",
    notes: "Serverless Postgres.",
  },
];

export const seedContacts: SeedContact[] = [
  {
    name: "Alex Kim",
    email: "alex.kim@stripe.com",
    notes: "Staff engineer on the payments core team. Warm referral.",
  },
  {
    name: "Sam Petrov",
    email: "sam@linear.app",
    notes: "EM for the issues product. Met at a conference.",
  },
  {
    name: "Riley Chen",
    email: "riley@vercel.com",
    notes: "Director of Engineering. Friend-of-a-friend intro.",
  },
  {
    name: "Nadia Okafor",
    email: "nadia@anthropic.com",
    notes: "Researcher; introduced via an open-source maintainer.",
  },
];

export const seedRecruiters: SeedRecruiter[] = [
  {
    // Priya Shah (in-house at Stripe) — shares contact[0]'s slot conceptually,
    // but recruiters get their own contact row in this dataset.
    contactIndex: 0,
    agency: null,
    notes: "In-house recruiter, Stripe.",
  },
  {
    contactIndex: 1,
    agency: null,
    notes: "In-house talent partner, Linear.",
  },
  {
    contactIndex: 2,
    agency: "TalentGrove",
    notes: "External agency recruiter sourcing for Vercel + Neon.",
  },
];

export const seedRelationships: SeedRelationship[] = [
  {
    contactIndex: 0,
    companyIndex: 0,
    role: "Staff Engineer",
    notes: "Internal referrer.",
  },
  {
    contactIndex: 1,
    companyIndex: 1,
    role: "Engineering Manager",
  },
  {
    contactIndex: 2,
    companyIndex: 3,
    role: "Director of Engineering",
  },
  {
    contactIndex: 3,
    companyIndex: 2,
    role: "Research Scientist",
  },
];

/**
 * 10 applications across all 7 stages:
 *   lead: 2, applied: 2, screen: 2, interview: 1, offer: 1,
 *   closed_won: 1, closed_lost: 1.
 *
 * `positionInStage` is sequential per stage starting at 0.
 * `appliedAt` is null for `lead`, otherwise a date that scales with stage age
 * (later stages = earlier applications).
 */
export const seedApplications: SeedApplication[] = [
  // --- lead (2) ---
  {
    title: "Senior Software Engineer",
    companyIndex: 2, // Anthropic
    recruiterIndex: null,
    primaryContactIndex: 3,
    location: "San Francisco, CA",
    salaryNote: "$200k-$260k base + equity (estimated)",
    stage: "lead",
    positionInStage: 0,
    appliedAt: null,
    notes: "Cold intro pending; waiting on Nadia's reply.",
  },
  {
    title: "Founding Platform Engineer",
    companyIndex: 4, // Neon
    recruiterIndex: 2,
    primaryContactIndex: null,
    location: "Remote",
    salaryNote: "Equity-heavy, base TBD",
    stage: "lead",
    positionInStage: 1,
    appliedAt: null,
    notes: "Recruiter outreach; haven't decided whether to engage.",
  },
  // --- applied (2) ---
  {
    title: "Senior Backend Engineer",
    companyIndex: 0, // Stripe
    recruiterIndex: 0,
    primaryContactIndex: 0,
    location: "San Francisco, CA / Remote",
    salaryNote: "$220k base + RSU",
    stage: "applied",
    positionInStage: 0,
    appliedAt: daysAgo(4),
    notes: "Submitted via Alex's referral link.",
  },
  {
    title: "Senior Full Stack Engineer",
    companyIndex: 3, // Vercel
    recruiterIndex: 2,
    primaryContactIndex: 2,
    location: "Remote",
    salaryNote: "$210k base + equity",
    stage: "applied",
    positionInStage: 1,
    appliedAt: daysAgo(6),
    notes: "Application submitted on the careers page.",
  },
  // --- screen (2) ---
  {
    title: "Staff Engineer, Payments",
    companyIndex: 0, // Stripe
    recruiterIndex: 0,
    primaryContactIndex: 0,
    location: "San Francisco, CA",
    salaryNote: "$280k base + RSU",
    stage: "screen",
    positionInStage: 0,
    appliedAt: daysAgo(14),
    notes: "Recruiter screen booked for next Tuesday.",
  },
  {
    title: "Senior Frontend Engineer",
    companyIndex: 1, // Linear
    recruiterIndex: 1,
    primaryContactIndex: 1,
    location: "Remote",
    salaryNote: "$200k base + equity",
    stage: "screen",
    positionInStage: 1,
    appliedAt: daysAgo(10),
    notes: "Initial chat done. Tech screen scheduled.",
  },
  // --- interview (1) ---
  {
    title: "Senior Product Engineer",
    companyIndex: 1, // Linear
    recruiterIndex: 1,
    primaryContactIndex: 1,
    location: "Remote",
    salaryNote: "$215k base + equity",
    stage: "interview",
    positionInStage: 0,
    appliedAt: daysAgo(28),
    notes: "Onsite next week. System design + product loop.",
  },
  // --- offer (1) ---
  {
    title: "Senior Full Stack Engineer",
    companyIndex: 3, // Vercel
    recruiterIndex: 2,
    primaryContactIndex: 2,
    location: "Remote",
    salaryNote: "Verbal: $230k base + 0.05% equity",
    stage: "offer",
    positionInStage: 0,
    appliedAt: daysAgo(45),
    notes: "Verbal offer in. Awaiting written.",
  },
  // --- closed_won (1) ---
  {
    title: "Founding Engineer",
    companyIndex: 1, // Linear
    recruiterIndex: 1,
    primaryContactIndex: 1,
    location: "Remote",
    salaryNote: "$240k base + 0.5% equity",
    stage: "closed_won",
    positionInStage: 0,
    appliedAt: daysAgo(110),
    notes: "Accepted. Start date 2026-07-08.",
  },
  // --- closed_lost (1) ---
  {
    title: "Senior Backend Engineer",
    companyIndex: 0, // Stripe
    recruiterIndex: 0,
    primaryContactIndex: 0,
    location: "San Francisco, CA",
    salaryNote: "$220k base",
    stage: "closed_lost",
    positionInStage: 0,
    appliedAt: daysAgo(80),
    notes: "Passed at onsite. Feedback: leveling mismatch.",
  },
];

/**
 * Allowlist values MUST be lowercase — the schema doesn't enforce it, the
 * convention does. Tests verify this.
 */
export const seedEmailAllowlist: SeedEmailAllowlist[] = [
  {
    kind: "domain",
    value: "greenhouse.io",
    notes: "Greenhouse ATS notifications.",
  },
  {
    kind: "address",
    value: "recruiter@stripe.com",
    notes: "Stripe in-house recruiter direct.",
  },
];

export const seedEmailEvents: SeedEmailEvent[] = [
  {
    providerMessageId: "gmail-msg-001",
    threadId: "gmail-thr-001",
    sender: "recruiter@stripe.com",
    subject: "Re: Senior Backend Engineer — scheduling next steps",
    sentAt: daysAgo(2),
    applicationIndex: 2, // Stripe Senior Backend (applied)
  },
  {
    providerMessageId: "gmail-msg-002",
    threadId: "gmail-thr-002",
    sender: "no-reply@greenhouse.io",
    subject: "Application received: Senior Full Stack Engineer at Vercel",
    sentAt: daysAgo(6),
    applicationIndex: 3, // Vercel applied
  },
  {
    providerMessageId: "gmail-msg-003",
    threadId: "gmail-thr-003",
    sender: "priya.shah@stripe.com",
    subject: "Staff Engineer, Payments — onsite logistics",
    sentAt: daysAgo(5),
    applicationIndex: 4, // Stripe Staff (screen)
  },
  {
    providerMessageId: "gmail-msg-004",
    threadId: "gmail-thr-004",
    sender: "sam@linear.app",
    subject: "Great chatting today",
    sentAt: daysAgo(8),
    applicationIndex: null,
  },
  {
    providerMessageId: "gmail-msg-005",
    threadId: "gmail-thr-005",
    sender: "nadia@anthropic.com",
    subject: "Re: intro",
    sentAt: daysAgo(11),
    applicationIndex: null,
  },
  {
    providerMessageId: "gmail-msg-006",
    threadId: "gmail-thr-006",
    sender: "no-reply@greenhouse.io",
    subject: "Status update: Senior Frontend Engineer at Linear",
    sentAt: daysAgo(9),
    applicationIndex: null,
  },
];
