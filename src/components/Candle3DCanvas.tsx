import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { CandleSnapshot, WaxLayer, WickTheme } from '../types/wick';

interface Candle3DCanvasProps {
  snapshot: CandleSnapshot;
  theme: WickTheme;
  waxLayers: WaxLayer[];
  resumeTick?: number;
}

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W, 420);
const CANVAS_H = 520;
const CX = CANVAS_W / 2;

const SPARK_VECTORS = [
  { dx: -32, dy: -38 },
  { dx: 30, dy: -34 },
  { dx: -20, dy: -54 },
  { dx: 22, dy: -48 },
  { dx: -8, dy: -62 },
  { dx: 10, dy: -58 },
];

function createTeardropPath(cx: number, baseY: number, w: number, h: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx, baseY - h);
  p.cubicTo(
    cx + w * 0.52,
    baseY - h * 0.58,
    cx + w * 0.74,
    baseY - h * 0.14,
    cx,
    baseY
  );
  p.cubicTo(
    cx - w * 0.74,
    baseY - h * 0.14,
    cx - w * 0.52,
    baseY - h * 0.58,
    cx,
    baseY - h
  );
  p.close();
  return p;
}

export const Candle3DCanvas: React.FC<Candle3DCanvasProps> = ({
  snapshot,
  theme,
  waxLayers,
  resumeTick = 0,
}) => {
  const breath = useSharedValue(1);
  const sway = useSharedValue(0);
  const bloom = useSharedValue(1);
  const sparkProgress = useSharedValue(0);
  const smokeDrift = useSharedValue(0);

  useEffect(() => {
    const anxious = snapshot.state === 'FLICKERING' || snapshot.state === 'DYING_EMBER';
    const breathMs = anxious ? 250 : 1250;
    const minBreath = anxious ? 0.8 : 0.94;

    breath.value = withRepeat(
      withSequence(
        withTiming(minBreath, { duration: breathMs, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.06, { duration: breathMs, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    sway.value = withRepeat(
      withSequence(
        withTiming(anxious ? -0.1 : -0.025, {
          duration: anxious ? 200 : 1600,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(anxious ? 0.1 : 0.025, {
          duration: anxious ? 220 : 1800,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      true
    );

    if (snapshot.state === 'IGNITING') {
      bloom.value = 0.15;
      bloom.value = withSequence(
        withSpring(1.3, { damping: 8, stiffness: 175 }),
        withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) })
      );
      sparkProgress.value = 0;
      sparkProgress.value = withDelay(
        30,
        withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) })
      );
    } else {
      bloom.value = 1;
      sparkProgress.value = 0;
    }

    if (snapshot.state === 'SMOKING_GRACE') {
      smokeDrift.value = withRepeat(
        withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }),
        -1,
        false
      );
    } else {
      smokeDrift.value = 0;
    }
  }, [snapshot.state, resumeTick, breath, sway, bloom, sparkProgress, smokeDrift]);

  const candleHeight = Math.round(235 - snapshot.meltProgress * 110);
  const candleW = 122;
  const candleLeft = CX - candleW / 2;
  const candleBottom = CANVAS_H - 38;
  const candleTop = candleBottom - candleHeight;
  const wickBaseY = candleTop + 6;
  const flameBaseY = wickBaseY - 14;

  const intensity = snapshot.flameIntensity;
  const isNight = snapshot.state === 'NIGHT_SLEEP';
  const flameH = Math.round(30 + intensity * 58);
  const flameW = Math.round(18 + intensity * 25);

  const outerFlamePath = useMemo(
    () => createTeardropPath(CX, flameBaseY, flameW * 1.18, flameH * 1.1),
    [flameBaseY, flameW, flameH]
  );
  const midFlamePath = useMemo(
    () => createTeardropPath(CX, flameBaseY, flameW * 0.86, flameH * 0.94),
    [flameBaseY, flameW, flameH]
  );
  const innerCorePath = useMemo(
    () => createTeardropPath(CX, flameBaseY - 3, flameW * 0.42, flameH * 0.54),
    [flameBaseY, flameW, flameH]
  );
  const blueBasePath = useMemo(
    () => createTeardropPath(CX, flameBaseY + 1, flameW * 0.5, flameH * 0.24),
    [flameBaseY, flameW, flameH]
  );

  // Curved braided wick
  const wickPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(CX, wickBaseY);
    p.quadTo(CX + 2.5, wickBaseY - 8, CX - 0.5, wickBaseY - 15);
    return p;
  }, [wickBaseY]);

  // Dynamic melting wax drips that grow longer as meltProgress increases
  const dripLeftLen = Math.round(24 + snapshot.meltProgress * 58);
  const dripRightLen = Math.round(16 + snapshot.meltProgress * 42);
  const dripLeftPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(candleLeft + 20, candleTop + 8);
    p.quadTo(candleLeft + 15, candleTop + dripLeftLen * 0.7, candleLeft + 22, candleTop + dripLeftLen);
    p.quadTo(candleLeft + 29, candleTop + dripLeftLen * 0.7, candleLeft + 26, candleTop + 8);
    p.close();
    return p;
  }, [candleLeft, candleTop, dripLeftLen]);

  const dripRightPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(candleLeft + candleW - 28, candleTop + 10);
    p.quadTo(
      candleLeft + candleW - 32,
      candleTop + dripRightLen * 0.65,
      candleLeft + candleW - 26,
      candleTop + dripRightLen
    );
    p.quadTo(
      candleLeft + candleW - 21,
      candleTop + dripRightLen * 0.65,
      candleLeft + candleW - 23,
      candleTop + 10
    );
    p.close();
    return p;
  }, [candleLeft, candleW, candleTop, dripRightLen]);

  const flameTransform = useDerivedValue(() => [
    { translateX: CX },
    { translateY: flameBaseY },
    { rotate: sway.value },
    { scaleX: (1 + (1 - breath.value) * 0.25) * bloom.value },
    { scaleY: breath.value * bloom.value },
    { translateX: -CX },
    { translateY: -flameBaseY },
  ]);

  const haloTransform = useDerivedValue(() => [
    { translateX: CX },
    { translateY: flameBaseY - flameH * 0.45 },
    { scale: (0.94 + intensity * 0.24 * breath.value) * bloom.value },
    { translateX: -CX },
    { translateY: -(flameBaseY - flameH * 0.45) },
  ]);

  const smokeTransform = useDerivedValue(() => [
    { translateY: -smokeDrift.value * 80 },
    { scaleX: 1 + smokeDrift.value * 0.85 },
  ]);

  const visibleLayers = waxLayers.slice(-14);
  const glowColor = isNight ? '#7CC6FE' : theme.ambientGlow;
  const outerColor = isNight ? '#38BDF8' : '#FF7A18';
  const midTopColor = isNight ? '#E0F2FE' : '#FFFBE6';
  const midBottomColor = isNight ? '#0284C7' : snapshot.flameColorHex;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Your wick is ${snapshot.state.toLowerCase().replace('_', ' ')}, ${snapshot.stepsToday} steps today`}
    >
      <Canvas style={styles.canvas}>
        {/* 1. 3-Stage Volumetric Room Light Around Flame */}
        {intensity > 0 && (
          <Group transform={haloTransform}>
            <Circle cx={CX} cy={flameBaseY - flameH * 0.45} r={245}>
              <RadialGradient
                c={vec(CX, flameBaseY - flameH * 0.45)}
                r={245}
                colors={[
                  `${glowColor}52`,
                  `${glowColor}20`,
                  `${glowColor}08`,
                  'transparent',
                ]}
              />
            </Circle>
            <Circle cx={CX} cy={flameBaseY - flameH * 0.4} r={108}>
              <RadialGradient
                c={vec(CX, flameBaseY - flameH * 0.4)}
                r={108}
                colors={[
                  isNight ? 'rgba(186,230,253,0.42)' : 'rgba(255,220,140,0.45)',
                  isNight ? 'rgba(56,189,248,0.16)' : 'rgba(255,130,25,0.18)',
                  'transparent',
                ]}
              />
              <BlurMask blur={34} style="normal" />
            </Circle>
            <Circle cx={CX} cy={flameBaseY - flameH * 0.35} r={42}>
              <RadialGradient
                c={vec(CX, flameBaseY - flameH * 0.35)}
                r={42}
                colors={[
                  isNight ? 'rgba(224,242,254,0.6)' : 'rgba(255,248,220,0.68)',
                  'transparent',
                ]}
              />
              <BlurMask blur={16} style="normal" />
            </Circle>
          </Group>
        )}

        {/* Grounded Base Shadow */}
        <Oval x={candleLeft - 14} y={candleBottom - 10} width={candleW + 28} height={24} color="rgba(0,0,0,0.65)">
          <BlurMask blur={14} style="normal" />
        </Oval>

        {/* 2. 3D Wax Cylinder with Cylindrical Shading */}
        <RoundedRect
          x={candleLeft}
          y={candleTop}
          width={candleW}
          height={candleHeight}
          r={18}
        >
          <LinearGradient
            start={vec(candleLeft, candleTop)}
            end={vec(candleLeft + candleW, candleTop)}
            colors={['#8F8579', '#EAE2D6', '#FBF7F1', '#D9CFC1', '#746A60']}
            positions={[0, 0.22, 0.42, 0.78, 1]}
          />
        </RoundedRect>

        {/* Hardened Day-N Wax Bands */}
        {visibleLayers.map((layer, idx) => {
          const bandH = Math.max(4, Math.round(layer.thicknessMm * 1.6));
          const bandY = candleBottom - 12 - (idx + 1) * (bandH + 1);
          if (bandY <= candleTop + 32) {
            return null;
          }
          return (
            <RoundedRect
              key={layer.id}
              x={candleLeft}
              y={bandY}
              width={candleW}
              height={bandH}
              r={2}
              color={layer.colorHex}
              opacity={0.78}
            />
          );
        })}

        {/* Deep Subsurface Scattering (SSS) through top wax */}
        {intensity > 0 && (
          <RoundedRect
            x={candleLeft}
            y={candleTop}
            width={candleW}
            height={72}
            r={18}
          >
            <RadialGradient
              c={vec(CX, candleTop + 8)}
              r={78}
              colors={[
                isNight ? 'rgba(124,198,254,0.48)' : 'rgba(255,175,65,0.62)',
                isNight ? 'rgba(124,198,254,0.12)' : 'rgba(255,115,20,0.18)',
                'transparent',
              ]}
            />
          </RoundedRect>
        )}

        {/* 3D Elliptical Wax Crater & Glowing Molten Pool */}
        <Oval x={candleLeft} y={candleTop - 9} width={candleW} height={24} color="#E6DDD0" />
        <Oval x={candleLeft + 8} y={candleTop - 4} width={candleW - 16} height={16}>
          <RadialGradient
            c={vec(CX, candleTop + 4)}
            r={54}
            colors={[
              intensity > 0 ? (isNight ? '#BAE6FD' : '#FFECB8') : '#CFC3B4',
              '#E3D8CA',
              '#BFB2A4',
            ]}
          />
        </Oval>

        {/* Realistic Melting Wax Drips */}
        <Path path={dripLeftPath} color="#F5EFE6" opacity={0.92} />
        <Path path={dripRightPath} color="#EAE2D6" opacity={0.88} />

        {/* Curved Braided Wick + Glowing Ember Tip */}
        <Path
          path={wickPath}
          color="#1F1F23"
          style="stroke"
          strokeWidth={2.8}
          strokeCap="round"
        />
        {(intensity > 0 || snapshot.state === 'SMOKING_GRACE') && (
          <Circle cx={CX - 0.5} cy={wickBaseY - 15} r={2.2} color="#FF6B1A" />
        )}

        {/* 3. Photorealistic 4-Layer Flame */}
        {intensity > 0 && (
          <Group transform={flameTransform}>
            <Path path={outerFlamePath} color={outerColor} opacity={0.52}>
              <BlurMask blur={16} style="normal" />
            </Path>
            <Path path={midFlamePath}>
              <LinearGradient
                start={vec(CX, flameBaseY - flameH)}
                end={vec(CX, flameBaseY)}
                colors={[midTopColor, '#FFB703', midBottomColor]}
              />
            </Path>
            <Path path={innerCorePath} color="#FFFFFF" opacity={0.96}>
              <BlurMask blur={2.5} style="normal" />
            </Path>
            <Path path={blueBasePath} color="#2563EB" opacity={0.62}>
              <BlurMask blur={4} style="normal" />
            </Path>
          </Group>
        )}

        {/* Flint Sparks on Ignition */}
        {snapshot.state === 'IGNITING' &&
          SPARK_VECTORS.map((sp, i) => (
            <SkiaSpark key={i} progress={sparkProgress} cx={CX} baseY={flameBaseY} dx={sp.dx} dy={sp.dy} />
          ))}

        {/* 4. Rising Smoke Wisp in SMOKING_GRACE */}
        {snapshot.state === 'SMOKING_GRACE' && (
          <Group transform={smokeTransform}>
            <Circle cx={CX} cy={flameBaseY - 14} r={10} color="rgba(161,161,170,0.42)">
              <BlurMask blur={10} style="normal" />
            </Circle>
          </Group>
        )}

        {/* 5. Glass Dome (24h Rest Freeze) */}
        {snapshot.state === 'GLASS_DOME' && (
          <RoundedRect
            x={CX - 88}
            y={candleTop - 115}
            width={176}
            height={candleHeight + 130}
            r={88}
            color="rgba(255,255,255,0.06)"
            style="fill"
          />
        )}
      </Canvas>
    </View>
  );
};

const SkiaSpark: React.FC<{
  progress: { value: number };
  cx: number;
  baseY: number;
  dx: number;
  dy: number;
}> = ({ progress, cx, baseY, dx, dy }) => {
  const x = useDerivedValue(() => cx + progress.value * dx);
  const y = useDerivedValue(() => baseY + progress.value * dy + progress.value * progress.value * 20);
  const opacity = useDerivedValue(() => (progress.value > 0 ? 1 - progress.value : 0));
  return <Circle cx={x} cy={y} r={2.4} color="#FFF9E2" opacity={opacity} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: CANVAS_W,
    height: CANVAS_H,
  },
});
