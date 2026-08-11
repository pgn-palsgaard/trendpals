// Documentation-only map of what each app role can reach.
// Enforcement lives in src/App.jsx — this config describes it for admins.

export const ROLES = ['admin', 'user', 'submitter', 'reviewer'];

export const ROLE_LABELS = {
  admin: 'Admin',
  user: 'Read-only user',
  submitter: 'Submitter',
  reviewer: 'SME reviewer',
};

export const ROLE_BADGE_CLASS = {
  admin: 'badge-blue',
  user: 'badge-draft',
  submitter: 'badge-pending',
  reviewer: 'badge-approved',
};

export const ACCESS_MAP = [
  {
    role: 'admin',
    ui: 'Full admin workspace with the complete sidebar.',
    routes: ['Everything — Projects, Briefs, Reports, Trends, Themes, Sources, GNPD, Agent Activity, Users'],
  },
  {
    role: 'user',
    ui: 'Admin shell with a reduced sidebar — read-only libraries only.',
    routes: ['/TrendLibrary', '/Reports', '/ThemeLibrary', '/ThemeMatrix', '/ReportsLibrary'],
  },
  {
    role: 'submitter',
    ui: 'Lightweight submitter shell — header only, no sidebar.',
    routes: ['/SubmitBrief', '/Profile'],
  },
  {
    role: 'reviewer',
    ui: 'Minimal reviewer shell — the SME review portal only.',
    routes: ['/review'],
  },
];

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || 'No role yet';
}