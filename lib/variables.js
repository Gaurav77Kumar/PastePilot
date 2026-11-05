// PastePilot — snippet variable resolution.
// Supported variables (resolved at fill time):
//   {{date}}       today's date, locale format          {{date+7}} / {{date-1}}
//   {{date:fmt}}   custom format, tokens YYYY YY MMMM MMM MM DD   e.g. {{date:YYYY-MM-DD}}
//   {{time}}       current time, locale format          {{time:HH:mm}} for custom
//   {{year}}       four-digit year
//   {{url}}        URL of the page being filled
//   {{title}}      title of the page being filled
//   {{clipboard}}  current clipboard contents
//   {{cursor}}     where the caret lands after filling (kept until fill)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
const pad2 = (n) => String(n).padStart(2, '0');

// Applies date tokens (YYYY YY MMMM MMM MM DD). Returns null when the format
// contains no date tokens at all, so the caller can fall back to the locale.
function fmtDateTokens(d, fmt) {
  if (!/YYYY|YY|MMMM|MMM|MM|DD/.test(fmt)) return null;
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/YY/g, String(d.getFullYear()).slice(-2))
    .replace(/MMMM/g, MONTHS[d.getMonth()])
    .replace(/MMM/g, MONTHS_SHORT[d.getMonth()])
    .replace(/MM/g, pad2(d.getMonth() + 1))
    .replace(/DD/g, pad2(d.getDate()));
}

// Applies time tokens (HH = 24h hours, mm = minutes). null when no tokens.
function fmtTimeTokens(d, fmt) {
  if (!/HH|mm/.test(fmt)) return null;
  return fmt.replace(/HH/g, pad2(d.getHours())).replace(/mm/g, pad2(d.getMinutes()));
}

function fmtDate(d) {
  try {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return d.toDateString();
  }
}

function fmtTime(d) {
  try {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return d.toTimeString().slice(0, 5);
  }
}

function resolveVars(text, ctx) {
  ctx = ctx || {};
  const now = new Date();
  return text.replace(/\{\{\s*(date|time|year|url|title|clipboard)(?:\s*([+-])\s*(\d+))?(?:\s*:\s*([^{}]+?))?\s*\}\}/gi, (m, name, sign, num, fmt) => {
    switch (name.toLowerCase()) {
      case 'date': {
        const d = new Date(now);
        if (sign && num) {
          const n = parseInt(num, 10) * (sign === '-' ? -1 : 1);
          d.setDate(d.getDate() + n);
        }
        if (fmt) {
          const custom = fmtDateTokens(d, String(fmt).trim());
          if (custom !== null) return custom;
        }
        return fmtDate(d);
      }
      case 'time':
        if (fmt) {
          const custom = fmtTimeTokens(now, String(fmt).trim());
          if (custom !== null) return custom;
        }
        return fmtTime(now);
      case 'year': return String(now.getFullYear());
      case 'url': return ctx.url || '';
      case 'title': return ctx.title || '';
      case 'clipboard': return ctx.clipboardText != null ? ctx.clipboardText : m;
      default: return m;
    }
  });
}

// Splits around the {{cursor}} marker so the fill engine can land the caret there.
function splitCursor(text) {
  const re = /\{\{\s*cursor\s*\}\}/i;
  const m = text.match(re);
  if (!m) return { before: text, after: '', hasCursor: false };
  return {
    before: text.slice(0, m.index),
    after: text.slice(m.index + m[0].length),
    hasCursor: true
  };
}

// {{ask:Label}} — fill-in-the-blank prompts. extractAsks returns the unique
// labels in first-appearance order; substituteAsks replaces every occurrence
// (labels matched case-insensitively) and leaves unmatched blanks untouched.
const ASK_RE = /\{\{\s*ask\s*:\s*([^{}]+?)\s*\}\}/gi;

function extractAsks(text) {
  const out = [];
  const re = new RegExp(ASK_RE.source, 'gi');
  let m;
  while ((m = re.exec(String(text || '')))) {
    const label = m[1].trim();
    if (label && !out.some((x) => x.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  return out;
}

function substituteAsks(text, values) {
  const norm = {};
  for (const k of Object.keys(values || {})) norm[k.toLowerCase()] = values[k];
  return String(text || '').replace(new RegExp(ASK_RE.source, 'gi'), (m, label) => {
    const v = norm[String(label).trim().toLowerCase()];
    return v === undefined ? m : v;
  });
}

export { resolveVars, splitCursor, extractAsks, substituteAsks };
