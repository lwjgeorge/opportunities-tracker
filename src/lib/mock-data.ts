import type {
  Application,
  Company,
  Contact,
  Recruiter,
} from "./types";

/**
 * Stable mock data for UI development. Will be replaced by Drizzle queries
 * once the persistence agent wires the real schema. IDs are deterministic
 * strings (not crypto-random) so dev-server reloads don't shuffle keys.
 */

const NOW = new Date("2026-06-01T12:00:00Z");

export const mockCompanies: Company[] = [
  {
    id: "co_stripe",
    name: "Stripe",
    domain: "stripe.com",
    industry: "Payments",
    headcountBand: "1000-5000",
    hqLocation: "San Francisco, CA",
    lastScrapedAt: NOW,
  },
  {
    id: "co_linear",
    name: "Linear",
    domain: "linear.app",
    industry: "Developer tools",
    headcountBand: "50-200",
    hqLocation: "Remote",
    lastScrapedAt: NOW,
  },
  {
    id: "co_vercel",
    name: "Vercel",
    domain: "vercel.com",
    industry: "Cloud infrastructure",
    headcountBand: "200-1000",
    hqLocation: "San Francisco, CA",
    lastScrapedAt: NOW,
  },
];

export const mockRecruiters: Recruiter[] = [
  {
    id: "rec_priya",
    name: "Priya Shah",
    companyId: "co_stripe",
    email: "priya.shah@stripe.com",
    phone: null,
  },
  {
    id: "rec_jordan",
    name: "Jordan Reyes",
    companyId: "co_linear",
    email: "jordan@linear.app",
    phone: null,
  },
  {
    id: "rec_morgan",
    name: "Morgan Whitfield",
    companyId: "co_vercel",
    email: "morgan.w@vercel.com",
    phone: null,
  },
];

export const mockContacts: Contact[] = [
  {
    id: "ct_alex",
    name: "Alex Kim",
    companyId: "co_stripe",
    role: "Staff Engineer",
    email: "alex.kim@stripe.com",
  },
  {
    id: "ct_sam",
    name: "Sam Petrov",
    companyId: "co_linear",
    role: "Engineering Manager",
    email: "sam@linear.app",
  },
  {
    id: "ct_riley",
    name: "Riley Chen",
    companyId: "co_vercel",
    role: "Director of Engineering",
    email: "riley@vercel.com",
  },
  {
    id: "ct_nadia",
    name: "Nadia Okafor",
    companyId: null,
    role: "Recruiting partner",
    email: "nadia@talentgrove.io",
  },
];

export const mockApplications: Application[] = [
  {
    id: "app_01",
    title: "Senior Software Engineer at Stripe",
    companyId: "co_stripe",
    stage: "applied",
    positionInStage: 0,
    notes: "Submitted via referral from Alex.",
    appliedAt: new Date("2026-05-21T10:00:00Z"),
    createdAt: new Date("2026-05-20T09:00:00Z"),
    updatedAt: new Date("2026-05-21T10:00:00Z"),
  },
  {
    id: "app_02",
    title: "Staff Engineer, Payments at Stripe",
    companyId: "co_stripe",
    stage: "screen",
    positionInStage: 0,
    notes: "Recruiter screen booked for next Tuesday.",
    appliedAt: new Date("2026-05-12T10:00:00Z"),
    createdAt: new Date("2026-05-11T09:00:00Z"),
    updatedAt: new Date("2026-05-28T15:00:00Z"),
  },
  {
    id: "app_03",
    title: "Senior Frontend Engineer at Linear",
    companyId: "co_linear",
    stage: "interview",
    positionInStage: 0,
    notes: "Onsite scheduled. Prep system design.",
    appliedAt: new Date("2026-05-01T10:00:00Z"),
    createdAt: new Date("2026-04-30T09:00:00Z"),
    updatedAt: new Date("2026-05-30T11:00:00Z"),
  },
  {
    id: "app_04",
    title: "Product Engineer at Linear",
    companyId: "co_linear",
    stage: "lead",
    positionInStage: 0,
    notes: "Cold intro from Sam.",
    appliedAt: null,
    createdAt: new Date("2026-05-29T09:00:00Z"),
    updatedAt: new Date("2026-05-29T09:00:00Z"),
  },
  {
    id: "app_05",
    title: "Senior Full Stack Engineer at Vercel",
    companyId: "co_vercel",
    stage: "offer",
    positionInStage: 0,
    notes: "Verbal offer. Awaiting written.",
    appliedAt: new Date("2026-04-10T10:00:00Z"),
    createdAt: new Date("2026-04-09T09:00:00Z"),
    updatedAt: new Date("2026-05-31T17:30:00Z"),
  },
  {
    id: "app_06",
    title: "Platform Engineer at Vercel",
    companyId: "co_vercel",
    stage: "applied",
    positionInStage: 1,
    notes: "Application submitted on the careers page.",
    appliedAt: new Date("2026-05-25T10:00:00Z"),
    createdAt: new Date("2026-05-25T10:00:00Z"),
    updatedAt: new Date("2026-05-25T10:00:00Z"),
  },
  {
    id: "app_07",
    title: "Senior Backend Engineer at Stripe",
    companyId: "co_stripe",
    stage: "closed_lost",
    positionInStage: 0,
    notes: "Passed on after onsite. Feedback: leveling mismatch.",
    appliedAt: new Date("2026-03-15T10:00:00Z"),
    createdAt: new Date("2026-03-14T09:00:00Z"),
    updatedAt: new Date("2026-04-22T11:00:00Z"),
  },
  {
    id: "app_08",
    title: "Founding Engineer at Linear",
    companyId: "co_linear",
    stage: "closed_won",
    positionInStage: 0,
    notes: "Accepted. Start date 2026-07-08.",
    appliedAt: new Date("2026-02-10T10:00:00Z"),
    createdAt: new Date("2026-02-09T09:00:00Z"),
    updatedAt: new Date("2026-05-20T11:00:00Z"),
  },
];

/** Helper for cards: look up a company display name by id. */
export function getCompanyName(companyId: string): string {
  return mockCompanies.find((c) => c.id === companyId)?.name ?? "Unknown";
}
