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
        title: 'O QUE E',
        content: 'A venda coberta (covered call) consiste em vender opcoes de compra (CALL) sobre acoes que voce ja possui em carteira. Voce recebe um premio pela venda da opcao, gerando renda extra.',
      },
      {
        title: 'QUANDO USAR',
        content: 'Use quando voce tem acoes em carteira e acredita que o preco vai ficar estavel ou subir moderadamente. Ideal para gerar renda mensal sobre posicoes de longo prazo.',
      },
      {
        title: 'COMO FUNCIONA',
        items: [
          '1. Tenha 100 acoes do ativo (1 lote)',
          '2. Venda 1 CALL com strike acima do preco atual',
          '3. Receba o premio imediatamente',
          '4. Se o preco ficar abaixo do strike no vencimento: opcao expira e voce fica com o premio',
          '5. Se o preco ultrapassar o strike: voce vende as acoes pelo strike + fica com o premio',
        ],
      },
      {
        title: 'EXEMPLO PRATICO',
        content: 'Voce tem 100 PETR4 a R$ 36,00.\nVende 1 CALL PETRB38 (strike R$ 38) por R$ 0,80.\nRecebe: R$ 80,00 de premio.\n\nCenario 1 - PETR4 fecha a R$ 35: opcao expira, voce fica com R$ 80.\nCenario 2 - PETR4 fecha a R$ 40: vende a R$ 38, lucro de R$ 200 + R$ 80 de premio = R$ 280.',
      },
      {
        title: 'RISCOS',
        items: [
          'Limita o ganho se a acao subir muito (voce vende no strike)',
          'Se a acao cair, o premio ameniza mas nao protege totalmente',
          'Custo de oportunidade se a acao disparar',
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
        title: 'O QUE E',
        content: 'A venda de PUT com caixa (Cash Secured Put) consiste em vender opcoes de venda (PUT) sobre ativos que voce gostaria de comprar, mantendo o capital reservado para a compra caso seja exercido.',
      },
      {
        title: 'QUANDO USAR',
        content: 'Use quando voce quer comprar uma acao mas acha que o preco atual esta alto. A CSP permite ser "pago para esperar" enquanto define o preco de entrada.',
      },
      {
        title: 'COMO FUNCIONA',
        items: [
          '1. Identifique uma acao que voce quer comprar',
          '2. Venda 1 PUT com strike no preco desejado de compra',
          '3. Mantenha o capital em caixa (strike x 100)',
          '4. Receba o premio imediatamente',
          '5. Se a acao ficar acima do strike: opcao expira e voce fica com o premio',
          '6. Se a acao cair abaixo do strike: voce compra pelo strike (preco desejado) + fica com o premio',
        ],
      },
      {
        title: 'EXEMPLO PRATICO',
        content: 'VALE3 esta a R$ 68,00 e voce quer comprar a R$ 65.\nVende 1 PUT VALEO65 por R$ 1,20.\nRecebe: R$ 120,00 de premio.\nReserva: R$ 6.500 em caixa.\n\nCenario 1 - VALE3 fica a R$ 70: opcao expira, voce fica com R$ 120.\nCenario 2 - VALE3 cai a R$ 62: voce compra a R$ 65, custo real R$ 63,80 (desconto do premio).',
      },
      {
        title: 'RISCOS',
        items: [
          'Se a acao cair muito, voce compra acima do mercado',
          'Capital fica reservado durante o periodo',
          'Prejuizo ilimitado se a acao cair a zero (raro)',
        ],
      },
      {
        title: 'DICAS',
        items: [
          'Escolha strikes ITM ou ATM para maior premio',
          'So faca CSP em acoes que voce realmente quer ter',
          'Prefira vencimentos curtos (20-30 dias)',
          'Combine com covered call apos ser exercido (Wheel)',
        ],
      },
    ],
  },
  wheel: {
    title: 'Wheel Strategy',
    subtitle: 'Estrategia da roda',
    icon: '◈',
    color: C.etfs,
    sections: [
      {
        title: 'O QUE E',
        content: 'A Wheel Strategy combina CSP e Covered Call em um ciclo continuo de geracao de renda. E considerada uma das estrategias mais consistentes para investidores de opcoes.',
      },
      {
        title: 'O CICLO',
        items: [
          '1. FASE CSP: Venda PUTs no ativo desejado e receba premios',
          '2. EXERCICIO: Se exercido, compre as acoes pelo strike',
          '3. FASE CC: Com as acoes, venda CALLs cobertas e receba premios',
          '4. EXERCICIO: Se exercido, venda as acoes pelo strike',
          '5. REPITA: Volte ao passo 1 com o capital + premios acumulados',
        ],
      },
      {
        title: 'POR QUE FUNCIONA',
        content: 'A estrategia gera renda em qualquer cenario:\n- Mercado lateral: opcoes expiram e voce coleta premios\n- Mercado em alta: CALLs sao exercidas com lucro\n- Mercado em baixa: PUTs sao exercidas e voce acumula acoes com desconto\n\nO theta decay (decaimento temporal) trabalha a seu favor em todas as fases.',
      },
      {
        title: 'EXEMPLO COMPLETO',
        content: 'Mes 1: Vende PUT PETR4 strike R$35 → premio R$100\nMes 2: Exercido, compra 100 PETR4 a R$35 (custo real R$34)\nMes 3: Vende CALL strike R$37 → premio R$90\nMes 4: Exercido, vende 100 PETR4 a R$37\nLucro: R$200 (acoes) + R$190 (premios) = R$390\nVolte ao Mes 1.',
      },
      {
        title: 'CRITERIOS DE SELECAO',
        items: [
          'Acoes com boa liquidez em opcoes',
          'Empresas que voce gostaria de ter em carteira',
          'IV (volatilidade implicita) acima de 25%',
          'Preco acessivel (para manter lotes de 100)',
          'Sem eventos corporativos proximos',
        ],
      },
      {
        title: 'DICAS AVANCADAS',
        items: [
          'Mantenha um registro de todas as operacoes no PremioLab',
          'Monitore o retorno anualizado vs CDI na aba Analise',
          'Use a regra dos 30 DTE para melhor theta',
          'Considere rolar opcoes quando faltam 7-10 dias',
          'Nunca aloce mais de 20% do capital em um unico ativo',
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
                        <Text style={{ fontSize: 9, color: guia.color, marginTop: 1 }}>●</Text>
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
  secTitle: { fontSize: 9, fontWeight: '700', color: C.dim, fontFamily: F.mono, letterSpacing: 0.6 },
  secBody: { paddingHorizontal: 12, paddingBottom: 12 },
  secContent: { fontSize: 11, color: C.sub, fontFamily: F.body, lineHeight: 18 },
  secItem: { fontSize: 10, color: C.sub, fontFamily: F.body, flex: 1, lineHeight: 16 },
});
