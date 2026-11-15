import React, { useState } from 'react';
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing } from '@/constants/theme';

type Point = { t: number; v: number };

type LineChartProps = {
  series: { color: string; points: Point[] }[];
  height: number;
  filled?: boolean;
  formatY?: (v: number) => string;
};

const PAD = { left: 44, right: 8, top: 8, bottom: 20 };

function formatTime(t: number): string {
  const d = new Date(t);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function LineChart({ series, height, filled = false, formatY = v => String(Math.round(v)) }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = series.flatMap(s => s.points);
  const hasData = series.some(s => s.points.length >= 2);

  if (!hasData) {
    return (
      <View style={[styles.empty, { height }]}>
        <Text style={styles.emptyText}>No data</Text>
      </View>
    );
  }

  const minT = Math.min(...all.map(p => p.t));
  const maxT = Math.max(...all.map(p => p.t));
  const maxV = Math.max(...all.map(p => p.v), 0) || 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / maxV) * plotH;
  const baseY = PAD.top + plotH;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {[0, 0.5, 1].map(f => {
            const gy = PAD.top + plotH - f * plotH;
            return (
              <React.Fragment key={f}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={gy} y2={gy} stroke={Colors.bgCardBorder} strokeWidth={1} />
                <SvgText x={PAD.left - 6} y={gy + 3} fontSize={10} fill={Colors.textMuted} textAnchor="end">
                  {formatY(maxV * f)}
                </SvgText>
              </React.Fragment>
            );
          })}
          {series.map((s, i) => {
            if (s.points.length < 2) return null;
            const pts = [...s.points].sort((a, b) => a.t - b.t);
            const line = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
            const area = `${line} L${x(pts[pts.length - 1].t).toFixed(1)} ${baseY} L${x(pts[0].t).toFixed(1)} ${baseY} Z`;
            return (
              <React.Fragment key={i}>
                {filled && <Path d={area} fill={s.color} fillOpacity={0.15} />}
                <Path d={line} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </React.Fragment>
            );
          })}
          <SvgText x={PAD.left} y={height - 4} fontSize={10} fill={Colors.textMuted} textAnchor="start">{formatTime(minT)}</SvgText>
          <SvgText x={width - PAD.right} y={height - 4} fontSize={10} fill={Colors.textMuted} textAnchor="end">{formatTime(maxT)}</SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 12, color: Colors.textMuted, padding: Spacing.lg },
});
