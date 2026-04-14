// daily-backup — Supabase Edge Function
// Roda diariamente 2h BRT (5h UTC) via pg_cron
// Faz snapshot completo dos dados de cada usuario ativo (retencao 30 dias)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Tabelas para backup (ordem importa para restore — dependencias primeiro)
const TABLES = [
  "portfolios",
  "operacoes",
  "opcoes",
  "renda_fixa",
  "proventos",
  "movimentacoes",
  "saldos_corretora",
  "cartoes_credito",
  "orcamentos",
  "transacoes_recorrentes",
  "alertas_config",
  "indicators",
  "rebalance_targets",
  "alertas_opcoes",
];

async function backupUser(userId: string, backupDate: string): Promise<{ tables: Record<string, number>; sizeBytes: number }> {
  const dados: Record<string, unknown[]> = {};
  const tablesCount: Record<string, number> = {};

  // Buscar profile separadamente (id = user_id)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  dados["profiles"] = profile ? [profile] : [];
  tablesCount["profiles"] = profile ? 1 : 0;

  // Buscar todas as tabelas em paralelo
  const promises = TABLES.map(async (table) => {
    const { data } = await supabase
      .from(table)
      .select("*")
      .eq("user_id", userId);
    return { table, data: data || [] };
  });

  const results = await Promise.all(promises);
  for (const r of results) {
    dados[r.table] = r.data;
    tablesCount[r.table] = r.data.length;
  }

  // Calcular tamanho aproximado
  const jsonStr = JSON.stringify(dados);
  const sizeBytes = new TextEncoder().encode(jsonStr).length;

  // Upsert backup (UNIQUE user_id + backup_date)
  const { error } = await supabase.from("user_backups").upsert(
    {
      user_id: userId,
      backup_date: backupDate,
      dados: dados,
      tabelas_count: tablesCount,
      size_bytes: sizeBytes,
    },
    { onConflict: "user_id,backup_date" }
  );

  if (error) {
    console.error("Backup failed for user " + userId + ":", error.message);
  }

  return { tables: tablesCount, sizeBytes };
}

Deno.serve(async (req) => {
  try {
    const today = new Date().toISOString().substring(0, 10);

    // Buscar usuarios ativos (que tem profile)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id");

    if (profilesError || !profiles) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch profiles", details: profilesError?.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    let backed = 0;
    let skipped = 0;
    let totalSize = 0;

    // Processar usuarios em batches de 5 para nao sobrecarregar
    const batchSize = 5;
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);
      const batchPromises = batch.map(async (p) => {
        try {
          // Verificar se usuario tem dados (pelo menos 1 operacao ou 1 saldo)
          const { count: opsCount } = await supabase
            .from("operacoes")
            .select("id", { count: "exact", head: true })
            .eq("user_id", p.id);

          const { count: saldosCount } = await supabase
            .from("saldos_corretora")
            .select("id", { count: "exact", head: true })
            .eq("user_id", p.id);

          if ((opsCount || 0) === 0 && (saldosCount || 0) === 0) {
            skipped++;
            return;
          }

          const result = await backupUser(p.id, today);
          backed++;
          totalSize += result.sizeBytes;
        } catch (e) {
          console.error("Backup error for user " + p.id + ":", e);
        }
      });
      await Promise.all(batchPromises);
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        users_backed: backed,
        users_skipped: skipped,
        total_size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
