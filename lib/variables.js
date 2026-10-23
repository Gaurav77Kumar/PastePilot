// PastePilot — snippet variable resolution.
// Supported variables (resolved at fill time):
//   {{date}}       today's date, locale format          {{date+7}} / {{date-1}}
//   {{time}}       current time, locale format
//   {{year}}       four-digit year
//   {{url}}        URL of the page being filled
//   {{title}}      title of the page being filled
//   {{clipboard}}  current clipboard contents
//   {{cursor}}     where the caret lands after filling (kept until fill)

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
  return text.replace(/\{\{\s*(date|time|year|url|title|clipboard)(?:\s*([+-])\s*(\d+))?\s*\}\}/gi, (m, name, sign, num) => {
    switch (name.toLowerCase()) {
      case 'date': {
        const d = new Date(now);
        if (sign && num) {
          const n = parseInt(num, 10) * (sign === '-' ? -1 : 1);
          d.setDate(d.getDate() + n);
        }
        return fmtDate(d);
      }
      case 'time': return fmtTime(now);
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

export { resolveVars, splitCursor };
