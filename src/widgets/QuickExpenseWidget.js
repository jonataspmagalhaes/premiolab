// ═══════════════════════════════════════════════════════════
// Android Widget — Gastos Rápidos
// Usa react-native-android-widget (FlexWidget/TextWidget)
// ═══════════════════════════════════════════════════════════

import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

// Cores do tema
var BG = '#070a11';
var CARD_BG = '#0d1117';
var TEXT = '#f1f1f4';
var TEXT_SEC = '#8888aa';
var ACCENT = '#6C5CE7';
var RED = '#EF4444';
var YELLOW = '#F59E0B';
var GREEN = '#22C55E';

function formatCurrency(value, moeda) {
  var symbol = 'R$';
  if (moeda === 'USD') symbol = 'US$';
  if (moeda === 'EUR') symbol = '€';
  if (moeda === 'GBP') symbol = '£';
  var num = (value || 0).toFixed(2).replace('.', ',');
  // Add thousand separators
  var parts = num.split(',');
  var intPart = parts[0];
  var decPart = parts[1];
  var formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return symbol + ' ' + formatted + ',' + decPart;
}

function PresetButton(props) {
  var preset = props.preset;
  var moeda = props.moeda;

  return (
    <FlexWidget
      style={{
        flex: 1,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: CARD_BG,
        borderRadius: 8,
        padding: 4,
        height: 56,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'premiolab://gasto-rapido/' + preset.id }}
    >
      <TextWidget
        text={preset.label || 'Gasto'}
        style={{
          fontSize: 11,
          color: TEXT,
          fontWeight: '600',
        }}
      />
      <TextWidget
        text={formatCurrency(preset.valor, moeda)}
        style={{
          fontSize: 9,
          color: TEXT_SEC,
        }}
      />
    </FlexWidget>
  );
}

function ActionButton(props) {
  return (
    <FlexWidget
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: CARD_BG,
        borderRadius: 6,
        padding: 4,
        height: 28,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: props.uri }}
    >
      <TextWidget
        text={props.label}
        style={{
          fontSize: 10,
          color: props.color || TEXT_SEC,
          fontWeight: '500',
        }}
      />
    </FlexWidget>
  );
}

export default function QuickExpenseWidget(props) {
  var data = props.data || {};
  var cartao = data.cartao || {};
  var presets = data.presets || [];
  var moeda = cartao.moeda || 'BRL';

  var limitePct = 0;
  if (cartao.limite && cartao.limite > 0) {
    limitePct = Math.min((cartao.fatura_total || 0) / cartao.limite, 1);
  }
  var barColor = limitePct > 0.9 ? RED : (limitePct > 0.7 ? YELLOW : ACCENT);

  var hasCard = cartao.id != null;
  var hasPresets = presets.length > 0;

  return (
    <FlexWidget
      style={{
        flexDirection: 'column',
        backgroundColor: BG,
        height: 'match_parent',
        width: 'match_parent',
        padding: 8,
        flexGap: 4,
      }}
    >
      {/* Header: Fatura info */}
      {hasCard ? (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            padding: 4,
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'premiolab://fatura/' + (cartao.id || '') }}
        >
          <FlexWidget
            style={{
              flexDirection: 'row',
              width: 'match_parent',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text={cartao.label || 'Cartão'}
              style={{ fontSize: 11, color: TEXT_SEC, fontWeight: '600' }}
            />
            {cartao.vencimento ? (
              <TextWidget
                text={'Venc ' + cartao.vencimento}
                style={{ fontSize: 10, color: YELLOW, fontWeight: '500' }}
              />
            ) : null}
          </FlexWidget>
          <TextWidget
            text={formatCurrency(cartao.fatura_total, moeda)}
            style={{ fontSize: 18, color: TEXT, fontWeight: '700' }}
          />
          {cartao.limite > 0 ? (
            <FlexWidget
              style={{
                flexDirection: 'row',
                width: 'match_parent',
                height: 4,
                backgroundColor: CARD_BG,
                borderRadius: 2,
              }}
            >
              <FlexWidget
                style={{
                  width: Math.round(limitePct * 100) + '%',
                  height: 4,
                  backgroundColor: barColor,
                  borderRadius: 2,
                }}
              />
            </FlexWidget>
          ) : null}
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: 'match_parent',
            alignItems: 'center',
            padding: 8,
          }}
          clickAction="OPEN_APP"
        >
          <TextWidget
            text="Configure um cartão"
            style={{ fontSize: 12, color: TEXT_SEC }}
          />
        </FlexWidget>
      )}

      {/* Preset Grid */}
      {hasPresets ? (
        <FlexWidget
          style={{
            flexDirection: 'column',
            width: 'match_parent',
            flex: 1,
            flexGap: 3,
          }}
        >
          {/* Row 1 */}
          <FlexWidget
            style={{
              flexDirection: 'row',
              width: 'match_parent',
              flex: 1,
              flexGap: 3,
            }}
          >
            {presets[0] ? <PresetButton preset={presets[0]} moeda={moeda} /> : null}
            {presets[1] ? <PresetButton preset={presets[1]} moeda={moeda} /> : (
              <FlexWidget style={{ flex: 1 }} />
            )}
          </FlexWidget>
          {/* Row 2 */}
          <FlexWidget
            style={{
              flexDirection: 'row',
              width: 'match_parent',
              flex: 1,
              flexGap: 3,
            }}
          >
            {presets[2] ? <PresetButton preset={presets[2]} moeda={moeda} /> : null}
            {presets[3] ? <PresetButton preset={presets[3]} moeda={moeda} /> : (
              presets.length < 4 ? (
                <FlexWidget
                  style={{
                    flex: 1,
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: CARD_BG,
                    borderRadius: 8,
                    height: 56,
                  }}
                  clickAction="OPEN_URI"
                  clickActionData={{ uri: 'premiolab://add-gasto' }}
                >
                  <TextWidget
                    text="+ Outro"
                    style={{ fontSize: 11, color: ACCENT, fontWeight: '600' }}
                  />
                </FlexWidget>
              ) : null
            )}
          </FlexWidget>
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: 'match_parent',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'premiolab://config-gastos' }}
        >
          <TextWidget
            text="Configure gastos rápidos"
            style={{ fontSize: 11, color: TEXT_SEC }}
          />
        </FlexWidget>
      )}

      {/* Footer: Outro + Config */}
      {presets.length >= 4 ? (
        <FlexWidget
          style={{
            flexDirection: 'row',
            width: 'match_parent',
            flexGap: 4,
          }}
        >
          <ActionButton label="+ Outro" uri="premiolab://add-gasto" color={ACCENT} />
          <ActionButton label="Config" uri="premiolab://config-gastos" color={TEXT_SEC} />
        </FlexWidget>
      ) : (
        presets.length > 0 ? (
          <FlexWidget
            style={{
              flexDirection: 'row',
              width: 'match_parent',
              flexGap: 4,
            }}
          >
            <ActionButton label="+ Outro" uri="premiolab://add-gasto" color={ACCENT} />
            <ActionButton label="Config" uri="premiolab://config-gastos" color={TEXT_SEC} />
          </FlexWidget>
        ) : null
      )}
    </FlexWidget>
  );
}
