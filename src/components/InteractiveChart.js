import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop, Circle, Line, Rect } from 'react-native-svg';

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
  if (v == null || isNaN(v)) return 'R$ 0';
  return 'R$ ' + Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  var [containerWidth, setContainerWidth] = useState(0);
  var [activeIndex, setActiveIndex] = useState(null);
  var [touching, setTouching] = useState(false);

  var padTop = 10;
  var padBottom = 6;
  var padLeft = 6;
  var padRight = 6;
  var drawH = chartHeight - padTop - padBottom;
  var drawW = containerWidth - padLeft - padRight;

  // Compute points
  var computed = useMemo(function () {
    if (data.length < 2 || drawW <= 0) return { points: [], minV: 0, maxV: 0 };
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

    return { points: points, minV: minV, maxV: maxV, range: range };
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

  // Horizontal grid
  var gridLines = [];
  if (showGrid && computed.range) {
    for (var g = 1; g <= 3; g++) {
      gridLines.push(padTop + (drawH / 4) * g);
    }
  }

  // First and last date labels
  var firstDate = data.length > 0 ? formatDate(data[0].date) : '';
  var lastDate = data.length > 1 ? formatDate(data[data.length - 1].date) : '';

  return (
    <View onLayout={onLayout} style={{ height: chartHeight + 18, width: '100%' }}>
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

              {/* Grid */}
              {gridLines.map(function (y, i) {
                return (
                  <Line key={'g' + i}
                    x1={padLeft} y1={y} x2={containerWidth - padRight} y2={y}
                    stroke="rgba(255,255,255,0.04)" strokeWidth="1"
                  />
                );
              })}

              {/* Area fill */}
              {areaPath ? <Path d={areaPath} fill="url(#chartAreaFill)" /> : null}

              {/* Line */}
              {linePath ? (
                <Path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : null}

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

          {/* Date axis labels */}
          <View style={styles.dateAxis}>
            <Text style={[styles.dateLabel, { fontFamily: fontFamily }]}>{firstDate}</Text>
            <Text style={[styles.dateLabelHint, { fontFamily: fontFamily }]}>
              {ap ? '' : 'arraste para ver valores'}
            </Text>
            <Text style={[styles.dateLabel, { fontFamily: fontFamily }]}>{lastDate}</Text>
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
  var [w, setW] = useState(0);

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginTop: 4,
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
