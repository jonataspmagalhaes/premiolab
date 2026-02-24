// Parse date string as local noon to avoid timezone off-by-one
// new Date("2026-03-20") creates UTC midnight = Mar 19 21:00 BRT
// new Date("2026-03-20T12:00:00") creates local noon = correct date
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  var s = String(dateStr).substring(0, 10);
  return new Date(s + 'T12:00:00');
}

// Format date string as DD/MM/YYYY without timezone issues
function formatDateBR(dateStr) {
  if (!dateStr) return '';
  var s = String(dateStr).substring(0, 10);
  var parts = s.split('-');
  if (parts.length !== 3) return s;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

module.exports = {
  parseLocalDate: parseLocalDate,
  formatDateBR: formatDateBR,
};
