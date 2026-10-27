export const PROFILE_FIELDS = [
  { key: 'firstName',  label: 'First name',        keywords: ['first name', 'given name', 'forename'] },
  { key: 'lastName',   label: 'Last name',         keywords: ['last name', 'surname', 'family name'] },
  { key: 'email',      label: 'Email',             keywords: ['email', 'e-mail', 'mail'] },
  { key: 'phone',      label: 'Phone number',      keywords: ['phone', 'mobile', 'contact number', 'telephone', 'tel'] },
  { key: 'fullName',   label: 'Full name',         keywords: ['name', 'applicant', 'candidate'] },
  { key: 'github',     label: 'GitHub',            keywords: ['github', 'git hub'] },
  { key: 'linkedin',   label: 'LinkedIn',          keywords: ['linkedin'] },
  { key: 'portfolio',  label: 'Portfolio / site',  keywords: ['portfolio', 'website', 'personal site', 'blog', 'url', 'homepage'] },
  { key: 'location',   label: 'Location',          keywords: ['location', 'city', 'country', 'address', 'where'] },
  { key: 'headline',   label: 'Headline',          keywords: ['headline', 'designation', 'current title', 'job title'] },
  { key: 'about',      label: 'About / summary',   keywords: ['about', 'summary', 'objective', 'bio', 'profile', 'resume', 'cover letter', 'why'] }
];

// Multi-line fields render as textareas in the editor
export const PROFILE_TEXTAREAS = ['about'];

// A profile is "set up" when at least one of these core fields has a value
export const CORE_PROFILE_KEYS = ['fullName', 'firstName', 'email', 'phone', 'github', 'linkedin'];


// "Last previous company" -> ['last previous company', 'last', 'previous', 'company']
// The whole label plus its significant words, so both "Last previous company"
// and a bare "Company" label on a form still match.
export function deriveKeywords(label) {
  const l = String(label || '').toLowerCase().trim();
  if (!l) return [];
  const words = l.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  return [...new Set([l, ...words])];
}

export function customFieldKeywords(cf) {
  if (cf.keywords && cf.keywords.trim()) {
    return cf.keywords.split(',').map((k) => k.trim()).filter(Boolean);
  }
  return deriveKeywords(cf.label);
}

export function getCustomFields(profile) {
  return Array.isArray(profile && profile.custom) ? profile.custom : [];
}
