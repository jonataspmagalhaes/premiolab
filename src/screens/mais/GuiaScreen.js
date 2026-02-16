import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { C, F, SIZE } from '../../theme';
import { Glass, Badge, SectionLabel } from '../../components';

var GUIAS = {
  covered_call: {
    title: 'Covered Call',
    subtitle: 'Venda coberta de CALL',
    icon: '◈',
    color: C.fiis,
    sections: [
      {
        title: 'O QUE É',
        content: 'A venda coberta (covered call) consiste em vender opções de compra (CALL) sobre ações que você já possui em carteira. Você recebe um prêmio pela venda da opção, gerando renda extra.',
      },
      {
        title: 'QUANDO USAR',
        content: 'Use quando você tem ações em carteira e acredita que o preço vai ficar estável ou subir moderadamente. Ideal para gerar renda mensal sobre posições de longo prazo.',
      },
      {
        title: 'COMO FUNCIONA',
        items: [
          '1. Tenha 100 ações do ativo (1 lote)',
          '2. Venda 1 CALL com strike acima do preço atual',
          '3. Receba o prêmio imediatamente',
          '4. Se o preço ficar abaixo do strike no vencimento: opção expira e você fica com o prêmio',
          '5. Se o preço ultrapassar o strike: você vende as ações pelo strike + fica com o prêmio',
        ],
      },
      {
        title: 'EXEMPLO PRÁTICO',
        content: 'Você tem 100 PETR4 a R$ 36,00.\nVende 1 CALL PETRB38 (strike R$ 38) por R$ 0,80.\nRecebe: R$ 80,00 de prêmio.\n\nCenário 1 - PETR4 fecha a R$ 35: opção expira, você fica com R$ 80.\nCenário 2 - PETR4 fecha a R$ 40: vende a R$ 38, lucro de R$ 200 + R$ 80 de prêmio = R$ 280.',
      },
      {
        title: 'RISCOS',
        items: [
          'Limita o ganho se a ação subir muito (você vende no strike)',
          'Se a ação cair, o prêmio ameniza mas não protege totalmente',
          'Custo de oportunidade se a ação disparar',
        ],
      },
      {
        title: 'DICAS',
        items: [
          'Escolha strikes OTM (fora do dinheiro) de 5-10% acima',
          'Prefira vencimentos de 30-45 dias (melhor theta decay)',
          'Evite vender antes de resultados ou eventos importantes',
          'Monitore o DTE e considere rolar se precisar',
        ],
      },
    ],
  },
  csp: {
    title: 'Cash Secured Put',
    subtitle: 'Venda de PUT com caixa',
    icon: '◈',
    color: C.opcoes,
    sections: [
      {
        title: 'O QUE É',
        content: 'A venda de PUT com caixa (Cash Secured Put) consiste em vender opções de venda (PUT) sobre ativos que você gostaria de comprar, mantendo o capital reservado para a compra caso seja exercido.',
      },
      {
        title: 'QUANDO USAR',
        content: 'Use quando você quer comprar uma ação mas acha que o preço atual está alto. A CSP permite ser "pago para esperar" enquanto define o preço de entrada.',
      },
      {
        title: 'COMO FUNCIONA',
        items: [
          '1. Identifique uma ação que você quer comprar',
          '2. Venda 1 PUT com strike no preço desejado de compra',
          '3. Mantenha o capital em caixa (strike x 100)',
          '4. Receba o prêmio imediatamente',
          '5. Se a ação ficar acima do strike: opção expira e você fica com o prêmio',
          '6. Se a ação cair abaixo do strike: você compra pelo strike (preço desejado) + fica com o prêmio',
        ],
      },
      {
        title: 'EXEMPLO PRÁTICO',
        content: 'VALE3 está a R$ 68,00 e você quer comprar a R$ 65.\nVende 1 PUT VALEO65 por R$ 1,20.\nRecebe: R$ 120,00 de prêmio.\nReserva: R$ 6.500 em caixa.\n\nCenário 1 - VALE3 fica a R$ 70: opção expira, você fica com R$ 120.\nCenário 2 - VALE3 cai a R$ 62: você compra a R$ 65, custo real R$ 63,80 (desconto do prêmio).',
      },
      {
        title: 'RISCOS',
        items: [
          'Se a ação cair muito, você compra acima do mercado',
          'Capital fica reservado durante o período',
          'Prejuízo ilimitado se a ação cair a zero (raro)',
        ],
      },
      {
        title: 'DICAS',
        items: [
          'Escolha strikes ITM ou ATM para maior prêmio',
          'Só faça CSP em ações que você realmente quer ter',
          'Prefira vencimentos curtos (20-30 dias)',
          'Combine com covered call após ser exercido (Wheel)',
        ],
      },
    ],
  },
  wheel: {
    title: 'Wheel Strategy',
    subtitle: 'Estratégia da roda',
    icon: '◈',
    color: C.etfs,
    sections: [
      {
        title: 'O QUE É',
        content: 'A Wheel Strategy combina CSP e Covered Call em um ciclo contínuo de geração de renda. É considerada uma das estratégias mais consistentes para investidores de opções.',
      },
      {
        title: 'O CICLO',
        items: [
          '1. FASE CSP: Venda PUTs no ativo desejado e receba prêmios',
          '2. EXERCÍCIO: Se exercido, compre as ações pelo strike',
          '3. FASE CC: Com as ações, venda CALLs cobertas e receba prêmios',
          '4. EXERCÍCIO: Se exercido, venda as ações pelo strike',
          '5. REPITA: Volte ao passo 1 com o capital + prêmios acumulados',
        ],
      },
      {
        title: 'POR QUE FUNCIONA',
        content: 'A estratégia gera renda em qualquer cenário:\n- Mercado lateral: opções expiram e você coleta prêmios\n- Mercado em alta: CALLs são exercidas com lucro\n- Mercado em baixa: PUTs são exercidas e você acumula ações com desconto\n\nO theta decay (decaimento temporal) trabalha a seu favor em todas as fases.',
      },
      {
        title: 'EXEMPLO COMPLETO',
        content: 'Mês 1: Vende PUT PETR4 strike R$35 \u2192 prêmio R$100\nMês 2: Exercido, compra 100 PETR4 a R$35 (custo real R$34)\nMês 3: Vende CALL strike R$37 \u2192 prêmio R$90\nMês 4: Exercido, vende 100 PETR4 a R$37\nLucro: R$200 (ações) + R$190 (prêmios) = R$390\nVolte ao Mês 1.',
      },
      {
        title: 'CRITÉRIOS DE SELEÇÃO',
        items: [
          'Ações com boa liquidez em opções',
          'Empresas que você gostaria de ter em carteira',
          'IV (volatilidade implícita) acima de 25%',
          'Preço acessível (para manter lotes de 100)',
          'Sem eventos corporativos próximos',
        ],
      },
      {
        title: 'DICAS AVANÇADAS',
        items: [
          'Mantenha um registro de todas as operações no PremioLab',
          'Monitore o retorno anualizado vs CDI na aba Análise',
          'Use a regra dos 30 DTE para melhor theta',
          'Considere rolar opções quando faltam 7-10 dias',
          'Nunca aloque mais de 20% do capital em um único ativo',
        ],
      },
    ],
  },
};

export default function GuiaScreen(props) {
  var navigation = props.navigation;
  var route = props.route;
  var guiaKey = route.params ? route.params.guia : 'covered_call';
  var guia = GUIAS[guiaKey] || GUIAS.covered_call;

  var _expanded = useState({}); var expanded = _expanded[0]; var setExpanded = _expanded[1];

  function toggleSection(idx) {
    var next = {};
    Object.keys(expanded).forEach(function(k) { next[k] = expanded[k]; });
    next[idx] = !next[idx];
    setExpanded(next);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={function() { navigation.goBack(); }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Guia</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Hero */}
      <Glass glow={guia.color} padding={16}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 28 }}>{guia.icon}</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, fontFamily: F.display }}>
            {guia.title}
          </Text>
          <Text style={{ fontSize: 11, color: C.sub, fontFamily: F.body }}>
            {guia.subtitle}
          </Text>
        </View>
      </Glass>

      {/* Sections */}
      {guia.sections.map(function(sec, idx) {
        var isOpen = expanded[idx] !== false; // default open
        return (
          <Glass key={idx} padding={0}>
            <TouchableOpacity
              style={styles.secHeader}
              activeOpacity={0.7}
              onPress={function() { toggleSection(idx); }}
            >
              <Text style={styles.secTitle}>{sec.title}</Text>
              <Text style={{ fontSize: 12, color: C.dim }}>{isOpen ? '−' : '+'}</Text>
            </TouchableOpacity>
            {isOpen && (
              <View style={styles.secBody}>
                {sec.content ? (
                  <Text style={styles.secContent}>{sec.content}</Text>
                ) : null}
                {sec.items ? (
                  sec.items.map(function(item, ii) {
                    return (
                      <View key={ii} style={{ flexDirection: 'row', gap: 6, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 11, color: guia.color, marginTop: 1 }}>●</Text>
                        <Text style={styles.secItem}>{item}</Text>
                      </View>
                    );
                  })
                ) : null}
              </View>
            )}
          </Glass>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: SIZE.gap },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  back: { fontSize: 28, color: C.accent, fontWeight: '300' },
  title: { fontSize: 18, fontWeight: '800', color: C.text, fontFamily: F.display },
  secHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
  secTitle: { fontSize: 11, fontWeight: '700', color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  secBody: { paddingHorizontal: 12, paddingBottom: 12 },
  secContent: { fontSize: 13, color: C.sub, fontFamily: F.body, lineHeight: 20 },
  secItem: { fontSize: 12, color: C.sub, fontFamily: F.body, flex: 1, lineHeight: 18 },
});
