// marketStatusService.js — Verifica se a B3 está aberta
// Horários oficiais + feriados 2025-2026 hardcoded
// Fonte: b3.com.br/calendario + ANBIMA
// Timezone: sempre usa America/Sao_Paulo independente do fuso do dispositivo

// Feriados nacionais onde a B3 NÃO abre (YYYY-MM-DD)
var B3_HOLIDAYS = {
  // 2025
  '2025-01-01': 'Confraternização Universal',
  '2025-03-03': 'Carnaval',
  '2025-03-04': 'Carnaval',
  '2025-04-18': 'Sexta-feira Santa',
  '2025-04-21': 'Tiradentes',
  '2025-05-01': 'Dia do Trabalho',
  '2025-06-19': 'Corpus Christi',
  '2025-09-07': 'Independência do Brasil',
  '2025-10-12': 'Nossa Sra. Aparecida',
  '2025-11-02': 'Finados',
  '2025-11-15': 'Proclamação da República',
  '2025-11-20': 'Consciência Negra',
  '2025-12-24': 'Véspera de Natal',
  '2025-12-25': 'Natal',
  '2025-12-31': 'Véspera de Ano Novo',
  // 2026
  '2026-01-01': 'Confraternização Universal',
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-04-03': 'Sexta-feira Santa',
  '2026-04-21': 'Tiradentes',
  '2026-05-01': 'Dia do Trabalho',
  '2026-06-04': 'Corpus Christi',
  '2026-09-07': 'Independência do Brasil',
  '2026-10-12': 'Nossa Sra. Aparecida',
  '2026-11-02': 'Finados',
  '2026-11-15': 'Proclamação da República',
  '2026-11-20': 'Consciência Negra',
  '2026-12-24': 'Véspera de Natal',
  '2026-12-25': 'Natal',
  '2026-12-31': 'Véspera de Ano Novo',
};

// Quarta-feira de Cinzas: abertura especial às 13h (em vez de 10h)
var ASH_WEDNESDAY = {
  '2025-03-05': true,
  '2026-02-18': true,
};

// Horário regular B3 (equities): 10:00 - 17:55 BRT
var REGULAR_OPEN_HOUR = 10;
var REGULAR_OPEN_MIN = 0;
var REGULAR_CLOSE_HOUR = 17;
var REGULAR_CLOSE_MIN = 55;
var ASH_OPEN_HOUR = 13;
var ASH_OPEN_MIN = 0;

// Extrai data/hora em BRT usando Intl.DateTimeFormat (funciona em qualquer fuso)
// Retorna { year, month, day, hour, minute, dayOfWeek, dateStr }
function getBRTComponents() {
  var now = new Date();

  // Usa Intl para obter componentes no fuso de São Paulo
  // Isso funciona corretamente independente do timezone do dispositivo
  try {
    var fmt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    var parts = fmt.formatToParts(now);
    var vals = {};
    for (var i = 0; i < parts.length; i++) {
      vals[parts[i].type] = parts[i].value;
    }
    var year = parseInt(vals.year, 10);
    var month = parseInt(vals.month, 10);
    var day = parseInt(vals.day, 10);
    var hour = parseInt(vals.hour, 10);
    var minute = parseInt(vals.minute, 10);

    // dayOfWeek: precisamos reconstruir a data para obter o dia da semana
    // Usa Date.UTC para evitar ambiguidade de timezone
    var reconstructed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    var dayOfWeek = reconstructed.getUTCDay();

    var dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');

    return {
      year: year,
      month: month,
      day: day,
      hour: hour,
      minute: minute,
      dayOfWeek: dayOfWeek,
      dateStr: dateStr,
    };
  } catch (e) {
    // Fallback: calcular manualmente UTC-3 (caso Intl não suportado)
    var utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    var brt = new Date(utcMs - (3 * 3600000));
    var y = brt.getFullYear();
    var m = brt.getMonth() + 1;
    var d = brt.getDate();
    return {
      year: y,
      month: m,
      day: d,
      hour: brt.getHours(),
      minute: brt.getMinutes(),
      dayOfWeek: brt.getDay(),
      dateStr: y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'),
    };
  }
}

// Retorna status do mercado B3
// { isOpen: bool, reason: string, opensAt: string|null, closesAt: string|null }
function getB3Status() {
  var brt = getBRTComponents();
  var dateStr = brt.dateStr;
  var dayOfWeek = brt.dayOfWeek; // 0=Dom, 6=Sab
  var timeMin = brt.hour * 60 + brt.minute;

  // Fim de semana
  if (dayOfWeek === 0) {
    return { isOpen: false, reason: 'Domingo', opensAt: null, closesAt: null };
  }
  if (dayOfWeek === 6) {
    return { isOpen: false, reason: 'Sábado', opensAt: null, closesAt: null };
  }

  // Feriado
  var holiday = B3_HOLIDAYS[dateStr];
  if (holiday) {
    return { isOpen: false, reason: holiday, opensAt: null, closesAt: null };
  }

  // Quarta-feira de cinzas (abertura especial 13h)
  var isAsh = ASH_WEDNESDAY[dateStr] || false;
  var openMin = isAsh ? (ASH_OPEN_HOUR * 60 + ASH_OPEN_MIN) : (REGULAR_OPEN_HOUR * 60 + REGULAR_OPEN_MIN);
  var closeMin = REGULAR_CLOSE_HOUR * 60 + REGULAR_CLOSE_MIN;

  var openStr = isAsh ? '13:00' : '10:00';
  var closeStr = '17:55';

  if (timeMin < openMin) {
    return { isOpen: false, reason: 'Abre às ' + openStr, opensAt: openStr, closesAt: closeStr };
  }
  if (timeMin >= closeMin) {
    return { isOpen: false, reason: 'Fechou às ' + closeStr, opensAt: null, closesAt: closeStr };
  }

  return { isOpen: true, reason: isAsh ? 'Horário especial (cinzas)' : 'Aberto até ' + closeStr, opensAt: openStr, closesAt: closeStr };
}

// Simples: retorna true/false
function isB3Open() {
  return getB3Status().isOpen;
}

module.exports = {
  getB3Status: getB3Status,
  isB3Open: isB3Open,
  B3_HOLIDAYS: B3_HOLIDAYS,
};
