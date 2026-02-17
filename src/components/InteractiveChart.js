import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

/**
 * InteractiveChart — touch-draggable line chart with tooltip
 * Works inside ScrollView by using onResponder* instead of PanResponder
 *
 * Props:
 *   data:         [{ date: 'YYYY-MM-DD' | Date, value: number }]
 *   color:        line color (default '#0ea5e9')
 *   height:       chart height (default 120)
 *   showGrid:     show horizontal grid lines (default true)
 *   formatValue:  fn(value) => string
 *   formatDate:   fn(dateStr) => string
 *   fontFamily:   font for labels
 *   label:        optional text shown top-left when no tooltip active
 */

function formatBRL(v) {
  if (v == null || isNaN(v)) return 'R$ 0,00';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAxisValue(v) {
  if (v == null || isNaN(v)) return '0';
  var abs = Math.abs(v);
  if (abs >= 1000000) return (v / 1000000).toFixed(1).replace('.', ',') + 'M';
  if (abs >= 1000) return (v / 1000).toFixed(0) + 'k';
  return v.toFixed(0);
}

function isSunday(dateStr) {
  var dt = typeof dateStr === 'string' ? new Date(dateStr + 'T12:00:00') : dateStr;
  return dt.getDay() === 0;
}

function getWeekKey(dateStr) {
  var dt = typeof dateStr === 'string' ? new Date(dateStr + 'T12:00:00') : dateStr;
  var year = dt.getFullYear();
  var jan1 = new Date(year, 0, 1);
  var dayOfYear = Math.floor((dt - jan1) / 86400000) + 1;
  var weekNum = Math.ceil(dayOfYear / 7);
  return year + '-W' + weekNum;
}

function formatDateDefault(d) {
  if (!d) return '';
  var dt = typeof d === 'string' ? new Date(d + 'T12:00:00') : d;
  var dia = dt.getDate().toString().padStart(2, '0');
  var meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return dia + ' ' + meses[dt.getMonth()];
}

// Smooth cubic bezier path
function buildPath(points) {
  if (points.length < 2) return '';
  var d = 'M ' + points[0].x + ' ' + points[0].y;
  for (var i = 1; i < points.length; i++) {
    var prev = points[i - 1];
    var cur = points[i];
    var cpx = (prev.x + cur.x) / 2;
    d += ' C ' + cpx + ' ' + prev.y + ', ' + cpx + ' ' + cur.y + ', ' + cur.x + ' ' + cur.y;
  }
  return d;
}

// Area fill path
function buildAreaPath(points, bottomY) {
  if (points.length < 2) return '';
  var linePath = buildPath(points);
  var lastX = points[points.length - 1].x;
  var firstX = points[0].x;
  return linePath + ' L ' + lastX + ' ' + bottomY + ' L ' + firstX + ' ' + bottomY + ' Z';
}

export default function InteractiveChart(props) {
  var data = props.data || [];
  var color = props.color || '#0ea5e9';
  var chartHeight = props.height || 120;
  var showGrid = props.showGrid !== false;
  var formatValue = props.formatValue || formatBRL;
  var formatDate = props.formatDate || formatDateDefault;
  var fontFamily = props.fontFamily || undefined;
  var label = props.label || null;
  var onTouchStateChange = props.onTouchStateChange || null;

  var _cw = useState(0); var containerWidth = _cw[0]; var setContainerWidth = _cw[1];
  var _ai = useState(null); var activeIndex = _ai[0]; var setActiveIndex = _ai[1];
  var _touch = useState(false); var touching = _touch[0]; var setTouching = _touch[1];

  var padTop = 10;
  var padBottom = 6;
  var padLeft = 40;
  var padRight = 6;
  var drawH = chartHeight - padTop - padBottom;
  var drawW = containerWidth - padLeft - padRight;

  // Compute points + weekly markers
  var computed = useMemo(function () {
    if (data.length < 2 || drawW <= 0) return { points: [], minV: 0, maxV: 0, weeklyIndices: [], yLabels: [] };
    var values = data.map(function (d) { return d.value; });
    var minV = Math.min.apply(null, values);
    var maxV = Math.max.apply(null, values);
    var range = maxV - minV || 1;
    var pad = range * 0.08;
    minV -= pad;
    maxV += pad;
    range = maxV - minV;

    var points = data.map(function (d, i) {
      var x = padLeft + (i / (data.length - 1)) * drawW;
      var y = padTop + drawH - ((d.value - minV) / range) * drawH;
      return { x: x, y: y, value: d.value, date: d.date, index: i };
    });

    // Find last data point of each week
    var weeklyIndices = [];
    var lastWeek = '';
    for (var w = 0; w < data.length; w++) {
      var wk = getWeekKey(data[w].date);
      if (wk !== lastWeek && lastWeek !== '') {
        weeklyIndices.push(w - 1);
      }
      lastWeek = wk;
    }
    weeklyIndices.push(data.length - 1);

    // Y-axis labels (3 values: bottom, middle, top)
    var yLabels = [];
    for (var yl = 0; yl <= 3; yl++) {
      var valAtGrid = minV + (range * (3 - yl) / 3);
      var yPos = padTop + (drawH / 3) * yl;
      yLabels.push({ y: yPos, label: formatAxisValue(valAtGrid) });
    }

    return { points: points, minV: minV, maxV: maxV, range: range, weeklyIndices: weeklyIndices, yLabels: yLabels };
  }, [data, drawW, drawH]);

  var points = computed.points;

  // Find closest point to X coordinate
  function findClosest(touchX) {
    if (points.length === 0) return null;
    var closest = 0;
    var minDist = Infinity;
    for (var i = 0; i < points.length; i++) {
      var dist = Math.abs(points[i].x - touchX);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }

  function getX(evt) {
    return evt.nativeEvent.locationX;
  }

  // Responder events — these work inside ScrollView
  var responderHandlers = {
    onStartShouldSetResponder: function () { return true; },
    onMoveShouldSetResponder: function () { return true; },
    onResponderTerminationRequest: function () { return false; },
    onResponderGrant: function (evt) {
      setTouching(true);
      if (onTouchStateChange) onTouchStateChange(true);
      setActiveIndex(findClosest(getX(evt)));
    },
    onResponderMove: function (evt) {
      setActiveIndex(findClosest(getX(evt)));
    },
    onResponderRelease: function () {
      setTouching(false);
      if (onTouchStateChange) onTouchStateChange(false);
      // Keep tooltip visible briefly
      setTimeout(function () {
        setActiveIndex(function (prev) {
          return prev;
        });
      }, 100);
      setTimeout(function () {
        setTouching(function (t) {
          if (!t) setActiveIndex(null);
          return t;
        });
      }, 2000);
    },
    onResponderTerminate: function () {
      setTouching(false);
      if (onTouchStateChange) onTouchStateChange(false);
      setActiveIndex(null);
    },
  };

  var onLayout = function (e) {
    setContainerWidth(e.nativeEvent.layout.width);
  };

  if (data.length < 2) {
    return (
      <View style={{ height: chartHeight, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontFamily: fontFamily }}>
          Dados insuficientes
        </Text>
      </View>
    );
  }

  var linePath = points.length >= 2 ? buildPath(points) : '';
  var areaPath = points.length >= 2 ? buildAreaPath(points, chartHeight - padBottom) : '';

  // Active point
  var ap = activeIndex != null && points[activeIndex] ? points[activeIndex] : null;

  // Tooltip position
  var tooltipW = 140;
  var tooltipX = ap
    ? Math.max(4, Math.min(ap.x - tooltipW / 2, containerWidth - tooltipW - 4))
    : 0;
  var tooltipAbove = ap && ap.y > chartHeight * 0.45;

  // Y-axis grid + labels
  var yLabels = computed.yLabels || [];

  // Weekly markers
  var weeklyIndices = computed.weeklyIndices || [];

  // X-axis date labels from weekly points (max 5 to avoid crowding)
  var xLabels = [];
  if (weeklyIndices.length > 0 && points.length > 0) {
    var step = Math.max(1, Math.floor(weeklyIndices.length / 5));
    for (var xl = 0; xl < weeklyIndices.length; xl += step) {
      var wi = weeklyIndices[xl];
      if (points[wi]) {
        xLabels.push({ x: points[wi].x, label: formatDate(data[wi].date) });
      }
    }
    // Always include last point
    var lastWi = weeklyIndices[weeklyIndices.length - 1];
    if (xLabels.length === 0 || xLabels[xLabels.length - 1].x !== points[lastWi].x) {
      xLabels.push({ x: points[lastWi].x, label: formatDate(data[lastWi].date) });
    }
  }

  return (
    <View onLayout={onLayout} style={{ height: chartHeight + 22, width: '100%' }}>
      {containerWidth > 0 ? (
        <View>
          {/* Touch area */}
          <View {...responderHandlers} style={{ height: chartHeight }}>
            <Svg width={containerWidth} height={chartHeight}>
              <Defs>
                <SvgGrad id="chartAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={color} stopOpacity="0.25" />
                  <Stop offset="0.7" stopColor={color} stopOpacity="0.05" />
                  <Stop offset="1" stopColor={color} stopOpacity="0" />
                </SvgGrad>
              </Defs>

              {/* Invisible touch target covering the whole area */}
              <Rect x="0" y="0" width={containerWidth} height={chartHeight} fill="transparent" />

              {/* Y-axis grid lines + labels */}
              {yLabels.map(function (yl, i) {
                return (
                  <React.Fragment key={'yl' + i}>
                    <Line
                      x1={padLeft} y1={yl.y} x2={containerWidth - padRight} y2={yl.y}
                      stroke="rgba(255,255,255,0.05)" strokeWidth="1"
                    />
                    <SvgText
                      x={padLeft - 4} y={yl.y + 3}
                      fill="rgba(255,255,255,0.25)"
                      fontSize="8"
                      fontFamily={fontFamily}
                      textAnchor="end"
                    >{yl.label}</SvgText>
                  </React.Fragment>
                );
              })}

              {/* Area fill */}
              {areaPath ? <Path d={areaPath} fill="url(#chartAreaFill)" /> : null}

              {/* Line */}
              {linePath ? (
                <Path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              ) : null}

              {/* Weekly dots */}
              {weeklyIndices.map(function (wi) {
                var wp = points[wi];
                if (!wp) return null;
                return (
                  <React.Fragment key={'wd' + wi}>
                    <Circle cx={wp.x} cy={wp.y} r="4" fill={color} opacity="0.2" />
                    <Circle cx={wp.x} cy={wp.y} r="2.5" fill={color} opacity="0.8" />
                  </React.Fragment>
                );
              })}

              {/* Active cursor line */}
              {ap ? (
                <Line
                  x1={ap.x} y1={padTop - 2}
                  x2={ap.x} y2={chartHeight - padBottom + 2}
                  stroke="rgba(255,255,255,0.15)" strokeWidth="1"
                />
              ) : null}

              {/* Active dot — outer glow */}
              {ap ? (
                <Circle cx={ap.x} cy={ap.y} r="8" fill={color} opacity="0.15" />
              ) : null}
              {/* Active dot — ring */}
              {ap ? (
                <Circle cx={ap.x} cy={ap.y} r="5" fill="none" stroke={color} strokeWidth="2" />
              ) : null}
              {/* Active dot — center */}
              {ap ? (
                <Circle cx={ap.x} cy={ap.y} r="2.5" fill="#fff" />
              ) : null}
            </Svg>

            {/* Tooltip overlay */}
            {ap ? (
              <View style={[
                styles.tooltip,
                {
                  left: tooltipX,
                  top: tooltipAbove ? Math.max(2, ap.y - 56) : ap.y + 16,
                  borderColor: color + '50',
                  shadowColor: color,
                },
              ]}>
                <Text style={[styles.tooltipValue, { color: color, fontFamily: fontFamily }]}>
                  {formatValue(ap.value)}
                </Text>
                <Text style={[styles.tooltipDate, { fontFamily: fontFamily }]}>
                  {formatDate(ap.date)}
                </Text>
              </View>
            ) : null}

            {/* Hint text when not touching */}
            {!ap && label ? (
              <View style={styles.hintWrap}>
                <Text style={[styles.hintText, { fontFamily: fontFamily }]}>
                  {label}
                </Text>
              </View>
            ) : null}
          </View>

          {/* X-axis date labels */}
          <View style={styles.dateAxis}>
            {xLabels.map(function (xl, i) {
              return (
                <Text key={'xl' + i} style={[styles.dateLabel, {
                  fontFamily: fontFamily,
                  position: 'absolute',
                  left: xl.x - 16,
                }]}>{xl.label}</Text>
              );
            })}
            {!ap ? (
              <Text style={[styles.dateLabelHint, { fontFamily: fontFamily, textAlign: 'center', flex: 1 }]}>
                arraste para ver valores
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * MiniLineChart — small non-interactive line for asset rows
 * Props: data (number[]), color, height
 */
export function MiniLineChart(props) {
  var data = props.data || [];
  var color = props.color || '#0ea5e9';
  var h = props.height || 24;
  var _w = useState(0); var w = _w[0]; var setW = _w[1];

  if (data.length < 2) return <View style={{ height: h }} />;

  var onLayout = function (e) { setW(e.nativeEvent.layout.width); };

  var minV = Math.min.apply(null, data);
  var maxV = Math.max.apply(null, data);
  var range = maxV - minV || 1;

  var pathD = '';
  if (w > 0) {
    var pts = data.map(function (v, i) {
      var x = (i / (data.length - 1)) * w;
      var y = 2 + (h - 4) - ((v - minV) / range) * (h - 4);
      return { x: x, y: y };
    });
    pathD = 'M ' + pts[0].x + ' ' + pts[0].y;
    for (var i = 1; i < pts.length; i++) {
      var cpx = (pts[i - 1].x + pts[i].x) / 2;
      pathD += ' C ' + cpx + ' ' + pts[i - 1].y + ', ' + cpx + ' ' + pts[i].y + ', ' + pts[i].x + ' ' + pts[i].y;
    }
  }

  return (
    <View onLayout={onLayout} style={{ height: h, width: '100%' }}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          <Path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.7"
          />
        </Svg>
      ) : null}
    </View>
  );
}

var styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    backgroundColor: 'rgba(10,10,18,0.95)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    minWidth: 110,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tooltipDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  hintWrap: {
    position: 'absolute',
    bottom: 6,
    right: 8,
  },
  hintText: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.15)',
    letterSpacing: 0.5,
  },
  dateAxis: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 16,
    marginTop: 4,
    position: 'relative',
  },
  dateLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 0.5,
  },
  dateLabelHint: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.12)',
    letterSpacing: 0.5,
  },
});
