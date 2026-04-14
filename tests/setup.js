// ═══════════════════════════════════════════════════════════
// Test Bot — Setup (Supabase client para Node.js)
// ═══════════════════════════════════════════════════════════

var createClient = require('@supabase/supabase-js').createClient;

var SUPABASE_URL = 'https://zephynezarjsxzselozi.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplcGh5bmV6YXJqc3h6c2Vsb3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NTY1NzAsImV4cCI6MjA4NTUzMjU3MH0.2sJi8n2keFXWktDtEEO4yxKO8NsQZwtBpVe3Kihk8bM';

var TEST_EMAIL = 'teste-bot@premiolab.com';
var TEST_PASSWORD = process.env.TEST_BOT_PASSWORD || 'TestBot2026!';

function getTestClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function signIn(supabase) {
  return supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  }).then(function(result) {
    if (result.error) {
      throw new Error('Login falhou: ' + result.error.message);
    }
    return result.data.user.id;
  });
}

// Deleta todos os dados do usuario de teste na ordem certa (RLS)
function cleanup(supabase, userId) {
  var tables = [
    'movimentacoes',
    'proventos',
    'opcoes',
    'operacoes',
    'renda_fixa',
    'cartoes_credito',
    'saldos_corretora',
    'portfolios',
    'indicators',
    'alertas_opcoes',
    'orcamentos',
    'transacoes_recorrentes',
  ];

  var promise = Promise.resolve();
  for (var i = 0; i < tables.length; i++) {
    (function(table) {
      promise = promise.then(function() {
        return supabase.from(table).delete().eq('user_id', userId).then(function(res) {
          if (res.error) {
            console.warn('  Cleanup ' + table + ': ' + res.error.message);
          }
        });
      });
    })(tables[i]);
  }
  return promise;
}

module.exports = {
  getTestClient: getTestClient,
  signIn: signIn,
  cleanup: cleanup,
  SUPABASE_URL: SUPABASE_URL,
  TEST_EMAIL: TEST_EMAIL,
};
