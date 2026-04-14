var Notifications = null;
try { Notifications = require('expo-notifications'); } catch (e) {}

var Platform = require('react-native').Platform;
var supabase = require('../config/supabase').supabase;

// ============================================================
// registerForPushNotifications
// Solicita permissão e retorna o Expo Push Token (string)
// ============================================================
function registerForPushNotifications() {
  if (!Notifications) {
    return Promise.resolve(null);
  }

  return Notifications.getPermissionsAsync().then(function (status) {
    var finalStatus = status.status;
    if (finalStatus !== 'granted') {
      return Notifications.requestPermissionsAsync().then(function (reqResult) {
        finalStatus = reqResult.status;
        if (finalStatus !== 'granted') {
          console.warn('notificationService: permissão de notificação negada');
          return null;
        }
        return _getToken();
      });
    }
    return _getToken();
  }).catch(function (err) {
    console.warn('notificationService: erro ao registrar push', err);
    return null;
  });
}

function _getToken() {
  if (!Notifications) return Promise.resolve(null);
  return Notifications.getExpoPushTokenAsync({
    projectId: '73b5eb16-af07-43cd-bc76-159fc4e46da9'
  }).then(function (tokenData) {
    return tokenData && tokenData.data ? tokenData.data : null;
  });
}

// ============================================================
// savePushToken
// Upsert do token na tabela push_tokens via Supabase
// ============================================================
function savePushToken(userId, token, platform) {
  if (!token || !userId) return Promise.resolve(null);
  var plat = platform || (Platform.OS === 'ios' ? 'ios' : 'android');

  return supabase
    .from('push_tokens')
    .upsert({
      user_id: userId,
      token: token,
      platform: plat,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,token' })
    .then(function (res) {
      if (res.error) {
        console.warn('notificationService: erro ao salvar token', res.error);
      }
      return res;
    });
}

// ============================================================
// scheduleOptionExpiryNotifications
// Agenda notificações locais para opções vencendo em 1, 3, 7 dias
// ============================================================
function scheduleOptionExpiryNotifications(opcoes) {
  if (!Notifications) return Promise.resolve();
  if (!opcoes || opcoes.length === 0) return Promise.resolve();

  return Notifications.cancelAllScheduledNotificationsAsync().then(function () {
    var now = new Date();
    var promises = [];

    for (var i = 0; i < opcoes.length; i++) {
      var op = opcoes[i];
      if (!op || !op.vencimento) continue;
      if (op.status && op.status !== 'ativa') continue;

      var venc = new Date(op.vencimento + 'T12:00:00Z');
      var diffMs = venc.getTime() - now.getTime();
      var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      var triggers = [7, 3, 1];
      for (var t = 0; t < triggers.length; t++) {
        var daysBefore = triggers[t];
        if (diffDays <= daysBefore) continue;

        var triggerDate = new Date(venc.getTime());
        triggerDate.setDate(triggerDate.getDate() - daysBefore);
        // 9h BRT = 12h UTC
        triggerDate.setUTCHours(12, 0, 0, 0);

        var secsFromNow = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
        if (secsFromNow <= 0) continue;

        var tickerLabel = op.ticker_opcao || op.ativo_base || 'Opção';
        var tipoLabel = op.tipo === 'call' ? 'CALL' : 'PUT';
        var strikeLabel = op.strike ? ' strike R$ ' + Number(op.strike).toFixed(2) : '';

        var title = 'Opção vencendo em ' + daysBefore + (daysBefore === 1 ? ' dia' : ' dias');
        var body = tickerLabel + ' ' + tipoLabel + strikeLabel;

        promises.push(
          Notifications.scheduleNotificationAsync({
            content: {
              title: title,
              body: body,
              data: { type: 'opcao_expiry', opcao_id: op.id },
              sound: 'default'
            },
            trigger: { type: 'timeInterval', seconds: secsFromNow, repeats: false }
          })
        );
      }
    }

    return Promise.all(promises);
  }).catch(function (err) {
    console.warn('notificationService: erro ao agendar notif opções', err);
  });
}

// ============================================================
// scheduleRFExpiryNotifications
// Agenda notificações locais para renda fixa vencendo em 1, 7 dias
// ============================================================
function scheduleRFExpiryNotifications(rendaFixa) {
  if (!Notifications) return Promise.resolve();
  if (!rendaFixa || rendaFixa.length === 0) return Promise.resolve();

  var now = new Date();
  var promises = [];

  for (var i = 0; i < rendaFixa.length; i++) {
    var rf = rendaFixa[i];
    if (!rf || !rf.vencimento) continue;

    var venc = new Date(rf.vencimento + 'T12:00:00Z');
    var diffMs = venc.getTime() - now.getTime();
    var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    var triggers = [7, 1];
    for (var t = 0; t < triggers.length; t++) {
      var daysBefore = triggers[t];
      if (diffDays <= daysBefore) continue;

      var triggerDate = new Date(venc.getTime());
      triggerDate.setDate(triggerDate.getDate() - daysBefore);
      triggerDate.setUTCHours(12, 0, 0, 0);

      var secsFromNow = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
      if (secsFromNow <= 0) continue;

      var tipoLabel = rf.tipo || 'Renda Fixa';
      var emissorLabel = rf.emissor || '';
      var valorLabel = rf.valor_aplicado ? ' R$ ' + Number(rf.valor_aplicado).toFixed(2) : '';

      var title = 'Renda fixa vencendo em ' + daysBefore + (daysBefore === 1 ? ' dia' : ' dias');
      var body = tipoLabel.toUpperCase();
      if (emissorLabel) {
        body = body + ' - ' + emissorLabel;
      }
      body = body + valorLabel;

      promises.push(
        Notifications.scheduleNotificationAsync({
          content: {
            title: title,
            body: body,
            data: { type: 'rf_expiry', rf_id: rf.id },
            sound: 'default'
          },
          trigger: { type: 'timeInterval', seconds: secsFromNow, repeats: false }
        })
      );
    }
  }

  if (promises.length === 0) return Promise.resolve();

  return Promise.all(promises).catch(function (err) {
    console.warn('notificationService: erro ao agendar notif RF', err);
  });
}

// ============================================================
// checkPriceAlerts
// Verifica alertas de opções contra dados em cache do OpLab
// Retorna array de alertas disparados (não envia notificação)
// ============================================================
function checkPriceAlerts(userId, alertasOpcoes, chainsCache) {
  if (!alertasOpcoes || alertasOpcoes.length === 0) return [];
  if (!chainsCache) return [];

  var triggered = [];

  for (var i = 0; i < alertasOpcoes.length; i++) {
    var alerta = alertasOpcoes[i];
    if (!alerta || !alerta.ativo || alerta.disparado) continue;

    var chain = chainsCache[alerta.ativo_base];
    if (!chain || !chain.series) continue;

    var optionData = _findOptionInChain(chain, alerta.ticker_opcao);
    if (!optionData) continue;

    var tipoAlerta = alerta.tipo_alerta;
    var valorAlvo = Number(alerta.valor_alvo);
    var direcao = alerta.direcao;
    var fired = false;
    var valorAtual = null;
    var descricao = '';

    if (tipoAlerta === 'preco') {
      var bid = optionData.bid || 0;
      var ask = optionData.ask || 0;
      var mid = (bid + ask) / 2;
      valorAtual = mid;

      if (direcao === 'acima' && mid >= valorAlvo) {
        fired = true;
        descricao = 'Preço atingiu R$ ' + mid.toFixed(2) + ' (alvo: R$ ' + valorAlvo.toFixed(2) + ')';
      } else if (direcao === 'abaixo' && mid <= valorAlvo) {
        fired = true;
        descricao = 'Preço caiu para R$ ' + mid.toFixed(2) + ' (alvo: R$ ' + valorAlvo.toFixed(2) + ')';
      }
    }

    if (tipoAlerta === 'divergencia') {
      var bidD = optionData.bid || 0;
      var askD = optionData.ask || 0;
      var midD = (bidD + askD) / 2;
      var bsPrice = optionData.bs_price || optionData.close || 0;

      if (bsPrice > 0) {
        var divPct = Math.abs(midD - bsPrice) / bsPrice * 100;
        valorAtual = divPct;

        if (direcao === 'acima' && divPct >= valorAlvo) {
          fired = true;
          descricao = 'Divergência de ' + divPct.toFixed(1) + '% entre real (R$ ' + midD.toFixed(2) + ') e teórico (R$ ' + bsPrice.toFixed(2) + ')';
        } else if (direcao === 'abaixo' && divPct <= valorAlvo) {
          fired = true;
          descricao = 'Divergência reduziu para ' + divPct.toFixed(1) + '%';
        }
      }
    }

    if (tipoAlerta === 'iv') {
      var iv = optionData.iv || 0;
      valorAtual = iv;

      if (direcao === 'acima' && iv >= valorAlvo) {
        fired = true;
        descricao = 'IV atingiu ' + iv.toFixed(1) + '% (alvo: ' + valorAlvo.toFixed(1) + '%)';
      } else if (direcao === 'abaixo' && iv <= valorAlvo) {
        fired = true;
        descricao = 'IV caiu para ' + iv.toFixed(1) + '% (alvo: ' + valorAlvo.toFixed(1) + '%)';
      }
    }

    if (tipoAlerta === 'volume') {
      var vol = optionData.volume || 0;
      valorAtual = vol;

      if (direcao === 'acima' && vol >= valorAlvo) {
        fired = true;
        descricao = 'Volume atingiu ' + vol + ' (alvo: ' + valorAlvo + ')';
      } else if (direcao === 'abaixo' && vol <= valorAlvo) {
        fired = true;
        descricao = 'Volume caiu para ' + vol + ' (alvo: ' + valorAlvo + ')';
      }
    }

    if (fired) {
      triggered.push({
        alerta_id: alerta.id,
        ticker_opcao: alerta.ticker_opcao,
        ativo_base: alerta.ativo_base,
        tipo_alerta: tipoAlerta,
        valor_alvo: valorAlvo,
        valor_atual: valorAtual,
        direcao: direcao,
        descricao: descricao
      });
    }
  }

  return triggered;
}

// Helper: busca dados de uma opção específica na cadeia
function _findOptionInChain(chain, tickerOpcao) {
  if (!chain || !chain.series || !tickerOpcao) return null;

  var ticker = tickerOpcao.toUpperCase().trim();

  for (var s = 0; s < chain.series.length; s++) {
    var serie = chain.series[s];
    if (!serie || !serie.strikes) continue;

    for (var k = 0; k < serie.strikes.length; k++) {
      var row = serie.strikes[k];
      if (!row) continue;

      var call = row.call;
      var put = row.put;

      if (call && call.symbol && call.symbol.toUpperCase() === ticker) {
        return call;
      }
      if (put && put.symbol && put.symbol.toUpperCase() === ticker) {
        return put;
      }
    }
  }

  return null;
}

// ============================================================
// sendLocalNotification
// Envia notificação local imediata
// ============================================================
function sendLocalNotification(title, body, data) {
  if (!Notifications) return Promise.resolve(null);

  return Notifications.scheduleNotificationAsync({
    content: {
      title: title,
      body: body,
      data: data || {},
      sound: 'default'
    },
    trigger: null
  }).catch(function (err) {
    console.warn('notificationService: erro ao enviar notificação local', err);
    return null;
  });
}

// ============================================================
// setupNotificationChannel
// Configura canal de notificação no Android
// ============================================================
function setupNotificationChannel() {
  if (!Notifications) return Promise.resolve();
  if (Platform.OS !== 'android') return Promise.resolve();

  return Notifications.setNotificationChannelAsync('default', {
    name: 'PremioLab',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default'
  }).catch(function (err) {
    console.warn('notificationService: erro ao configurar canal Android', err);
  });
}

// ============================================================
// setNotificationHandler
// Define handler global para exibir notificações em foreground
// ============================================================
function setNotificationHandler() {
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: function () {
      return Promise.resolve({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false
      });
    }
  });
}

// ============================================================
// Exports
// ============================================================
module.exports = {
  registerForPushNotifications: registerForPushNotifications,
  savePushToken: savePushToken,
  scheduleOptionExpiryNotifications: scheduleOptionExpiryNotifications,
  scheduleRFExpiryNotifications: scheduleRFExpiryNotifications,
  checkPriceAlerts: checkPriceAlerts,
  sendLocalNotification: sendLocalNotification,
  setupNotificationChannel: setupNotificationChannel,
  setNotificationHandler: setNotificationHandler
};
