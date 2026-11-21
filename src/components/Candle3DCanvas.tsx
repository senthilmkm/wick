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
import React, { useEffect, useMemo, useRef } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
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
  windIntensity?: number;
  tiltAngle?: number;
  lanternMode?: boolean;
  goalMet?: boolean;
  sedentaryDraft?: boolean;
  candleName?: string;
  maxWaxLayers?: number;
}

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W, 420);
const CANVAS_H = 520;
const CX = CANVAS_W / 2;

const RAIN_DROPS = [
  { dx: -34, phase: 0, length: 14 },
  { dx: -10, phase: 0.33, length: 10 },
  { dx: 12, phase: 0.16, length: 16 },
  { dx: 36, phase: 0.58, length: 11 },
  { dx: -22, phase: 0.74, length: 12 },
];

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
  windIntensity = 0,
  tiltAngle = 0,
  lanternMode = false,
  goalMet = false,
  sedentaryDraft = false,
  candleName,
  maxWaxLayers = 14,
}) => {
  const breath = useSharedValue(1);
  const sway = useSharedValue(0);
  const windTilt = useSharedValue(0);
  const gravityTilt = useSharedValue(0);
  const turbPhase = useSharedValue(0);
  const turbGust = useSharedValue(0);
  const bloom = useSharedValue(1);
  const sparkProgress = useSharedValue(0);
  const smokeDrift = useSharedValue(0);
  const rainFall = useSharedValue(0);
  const prevStepsRef = useRef(snapshot.stepsToday);

  useEffect(() => {
    if (
      snapshot.stepsToday > prevStepsRef.current &&
      snapshot.state !== 'NIGHT_SLEEP' &&
      snapshot.state !== 'UNLIT_MORNING' &&
      snapshot.state !== 'SMOKING_GRACE' &&
      snapshot.state !== 'EXTINGUISHED' &&
      snapshot.state !== 'IGNITING'
    ) {
      sparkProgress.value = 0;
      sparkProgress.value = withTiming(1, { duration: 680, easing: Easing.out(Easing.cubic) });
    }
    prevStepsRef.current = snapshot.stepsToday;
  }, [snapshot.stepsToday, snapshot.state, sparkProgress]);

  useEffect(() => {
    windTilt.value = withSpring(windIntensity, { damping: 9, stiffness: 260 });
  }, [windIntensity, windTilt]);

  useFrameCallback((frameInfo) => {
    'worklet';
    const w = windTilt.value;
    if (w <= 0.02) {
      turbGust.value = 0;
      return;
    }
    const dt = Math.min(0.05, (frameInfo.timeSincePreviousFrame ?? 16) / 1000);
    turbPhase.value += dt * (16 + w * 28);
    turbGust.value =
      Math.sin(turbPhase.value) * 0.65 + Math.cos(turbPhase.value * 1.73) * 0.35;
  });

  useEffect(() => {
    gravityTilt.value = withSpring(tiltAngle, { damping: 14, stiffness: 160 });
  }, [tiltAngle, gravityTilt]);

  useEffect(() => {
    const anxious =
      snapshot.state === 'FLICKERING' ||
      snapshot.state === 'DYING_EMBER' ||
      sedentaryDraft;
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
    }

    if (sedentaryDraft) {
      rainFall.value = 0;
      rainFall.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.linear }), -1, false);
    } else {
      rainFall.value = 0;
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
  }, [snapshot.state, resumeTick, sedentaryDraft, breath, sway, bloom, sparkProgress, smokeDrift, rainFall]);

  const streakScale = Math.min(1, Math.max(0, snapshot.streakDays) / 30);
  const baseCandleH = Math.round(190 + streakScale * 65); // 190px (Day 0) -> 255px (Day 30+)
  const candleHeight = Math.round(baseCandleH - snapshot.meltProgress * (baseCandleH * 0.45));
  const candleW = Math.round(108 + streakScale * 24); // 108px (Day 0) -> 132px (Day 30+)
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

  // Dynamic 3D melting wax drips hugging the outer left & right sides + front
  const activeMelt = Math.max(snapshot.meltProgress, intensity > 0 ? 0.14 : 0);
  const dripLeftLen = Math.round(28 + activeMelt * 76);
  const dripRightLen = Math.round(22 + activeMelt * 62);
  const dripFrontLen = Math.round(18 + activeMelt * 48);

  const dripLeftPath = useMemo(() => {
    const p = Skia.Path.Make();
    const x = candleLeft - 2;
    p.moveTo(x + 2, candleTop + 6);
    p.cubicTo(x - 4, candleTop + dripLeftLen * 0.45, x - 3, candleTop + dripLeftLen - 8, x + 3, candleTop + dripLeftLen);
    p.cubicTo(x + 9, candleTop + dripLeftLen - 6, x + 8, candleTop + dripLeftLen * 0.4, x + 8, candleTop + 6);
    p.close();
    return p;
  }, [candleLeft, candleTop, dripLeftLen]);

  const dripRightPath = useMemo(() => {
    const p = Skia.Path.Make();
    const x = candleLeft + candleW - 6;
    p.moveTo(x, candleTop + 7);
    p.cubicTo(x + 1, candleTop + dripRightLen * 0.4, x + 2, candleTop + dripRightLen - 7, x + 6, candleTop + dripRightLen);
    p.cubicTo(x + 11, candleTop + dripRightLen - 7, x + 11, candleTop + dripRightLen * 0.45, x + 6, candleTop + 7);
    p.close();
    return p;
  }, [candleLeft, candleW, candleTop, dripRightLen]);

  const dripFrontPath = useMemo(() => {
    const p = Skia.Path.Make();
    const x = candleLeft + 34;
    p.moveTo(x, candleTop + 10);
    p.quadTo(x - 4, candleTop + dripFrontLen * 0.72, x + 2.5, candleTop + dripFrontLen);
    p.quadTo(x + 9, candleTop + dripFrontLen * 0.72, x + 6, candleTop + 10);
    p.close();
    return p;
  }, [candleLeft, candleTop, dripFrontLen]);

  // S-curving wispy smoke ribbon for SMOKING_GRACE
  const smokeRibbonPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(CX, flameBaseY - 4);
    p.cubicTo(CX - 14, flameBaseY - 32, CX + 16, flameBaseY - 58, CX - 6, flameBaseY - 92);
    return p;
  }, [flameBaseY]);

  // Curved glass specular highlight streak for GLASS_DOME
  const domeHighlightPath = useMemo(() => {
    const p = Skia.Path.Make();
    const x = CX - 66;
    const topY = candleTop - 92;
    p.moveTo(x + 12, topY);
    p.quadTo(x, topY + 70, x + 4, candleBottom - 16);
    return p;
  }, [candleTop, candleBottom]);

  const flameTransform = useDerivedValue(() => {
    const w = windTilt.value;
    const g = turbGust.value;
    return [
      { translateX: CX },
      { translateY: flameBaseY },
      { rotate: sway.value + w * (0.42 + g * 0.38) + gravityTilt.value },
      { scaleX: (1 + (1 - breath.value) * 0.25 + w * (0.22 + g * 0.14)) * bloom.value },
      { scaleY: Math.max(0.4, breath.value * bloom.value * (1 - w * (0.34 + g * 0.16))) },
      { translateX: -CX },
      { translateY: -flameBaseY },
    ];
  });

  const flameOpacity = useDerivedValue(() => {
    const w = windTilt.value;
    if (w <= 0.02) {
      return 1;
    }
    return Math.max(0.48, 1 - w * (0.22 + Math.abs(turbGust.value) * 0.24));
  });

  const haloTransform = useDerivedValue(() => [
    { translateX: CX },
    { translateY: flameBaseY - flameH * 0.45 },
    { scale: (0.94 + intensity * 0.24 * breath.value) * bloom.value },
    { translateX: -CX },
    { translateY: -(flameBaseY - flameH * 0.45) },
  ]);

  const smokeTransform = useDerivedValue(() => [
    { translateY: -smokeDrift.value * 42 },
    { scaleX: 1 + smokeDrift.value * 0.55 },
  ]);

  const poolShimmerTransform = useDerivedValue(() => [
    { translateX: sway.value * 26 + windTilt.value * 6 },
    { scaleX: 0.92 + breath.value * 0.14 },
  ]);

  const visibleLayers = waxLayers.slice(-Math.max(1, maxWaxLayers));
  const glowColor = isNight ? '#7CC6FE' : theme.ambientGlow;
  const outerColor = isNight ? '#38BDF8' : '#FF7A18';
  const midTopColor = isNight ? '#E0F2FE' : goalMet ? '#FFFBE6' : '#FFE8A3';
  const midBottomColor = isNight
    ? '#0284C7'
    : snapshot.state === 'BLAZING' && !goalMet
      ? '#FF9E2C'
      : snapshot.flameColorHex;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Your wick is ${snapshot.state.toLowerCase().replace('_', ' ')}, ${snapshot.stepsToday} steps today${sedentaryDraft ? ', rain on the flame' : ''}`}
    >
      <View style={styles.canvas}>
        <Canvas style={styles.canvas}>
        {/* 1. 3-Stage Volumetric Room Light Around Flame (Expanded in Lantern Mode) */}
        {intensity > 0 && (
          <Group transform={haloTransform}>
            <Circle cx={CX} cy={flameBaseY - flameH * 0.45} r={lanternMode ? 360 : 245}>
              <RadialGradient
                c={vec(CX, flameBaseY - flameH * 0.45)}
                r={lanternMode ? 360 : 245}
                colors={
                  lanternMode
                    ? ['#FFF6D6CC', '#FF9E2C88', '#FF8C2433', 'transparent']
                    : [
                        `${glowColor}52`,
                        `${glowColor}20`,
                        `${glowColor}08`,
                        'transparent',
                      ]
                }
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
        {intensity > 0 && (
          <Group transform={poolShimmerTransform}>
            <Oval
              x={CX - 16}
              y={candleTop + 1}
              width={32}
              height={6}
              color={isNight ? 'rgba(224,242,254,0.45)' : 'rgba(255,248,220,0.58)'}
            >
              <BlurMask blur={2.5} style="normal" />
            </Oval>
          </Group>
        )}

        {/* Realistic 3D Raised Melting Wax Drips (Shadow + Glossy Wax + Bead Highlight) */}
        <Group transform={[{ translateX: 1.5 }, { translateY: 2 }]}>
          <Path path={dripLeftPath} color="rgba(0,0,0,0.32)">
            <BlurMask blur={2.5} style="normal" />
          </Path>
          <Path path={dripRightPath} color="rgba(0,0,0,0.32)">
            <BlurMask blur={2.5} style="normal" />
          </Path>
          <Path path={dripFrontPath} color="rgba(0,0,0,0.24)">
            <BlurMask blur={2} style="normal" />
          </Path>
        </Group>
        <Path path={dripLeftPath}>
          <LinearGradient
            start={vec(candleLeft - 2, candleTop)}
            end={vec(candleLeft + 6, candleTop + dripLeftLen)}
            colors={['#FFF8EC', '#EDE2D3', '#C9BCAE']}
          />
        </Path>
        <Path path={dripRightPath}>
          <LinearGradient
            start={vec(candleLeft + candleW - 6, candleTop)}
            end={vec(candleLeft + candleW + 4, candleTop + dripRightLen)}
            colors={['#FFF5E4', '#E2D6C6', '#B5A89A']}
          />
        </Path>
        <Path path={dripFrontPath}>
          <LinearGradient
            start={vec(candleLeft + 34, candleTop)}
            end={vec(candleLeft + 38, candleTop + dripFrontLen)}
            colors={['#FFFBF4', '#F3E9DA', '#D8CCBE']}
          />
        </Path>
        <Circle cx={candleLeft + 1} cy={candleTop + dripLeftLen - 4} r={1.8} color="#FFFFFF" opacity={0.75} />
        <Circle cx={candleLeft + candleW} cy={candleTop + dripRightLen - 4} r={1.6} color="#FFFFFF" opacity={0.65} />

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
          <Group transform={flameTransform} opacity={flameOpacity}>
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

        {sedentaryDraft &&
          RAIN_DROPS.map((drop) => (
            <RainDrop
              key={drop.dx}
              fall={rainFall}
              dx={drop.dx}
              phase={drop.phase}
              length={drop.length}
              travel={Math.max(120, flameBaseY - 20)}
            />
          ))}

        {/* Flint & Live Walking Embers */}
        {(snapshot.state === 'IGNITING' || (intensity > 0 && !isNight)) &&
          SPARK_VECTORS.map((sp, i) => (
            <SkiaSpark key={i} progress={sparkProgress} cx={CX} baseY={flameBaseY} dx={sp.dx} dy={sp.dy} />
          ))}

        {/* 4. S-Curving Wispy Smoke Trail in SMOKING_GRACE */}
        {snapshot.state === 'SMOKING_GRACE' && (
          <Group transform={smokeTransform}>
            <Path
              path={smokeRibbonPath}
              color="rgba(180,180,190,0.48)"
              style="stroke"
              strokeWidth={7}
              strokeCap="round"
            >
              <BlurMask blur={6} style="normal" />
            </Path>
            <Circle cx={CX - 4} cy={flameBaseY - 26} r={9} color="rgba(161,161,170,0.34)">
              <BlurMask blur={10} style="normal" />
            </Circle>
          </Group>
        )}

        {/* 5. Glass Dome with Blown-Glass Rim & Specular Reflection (24h Rest Freeze) */}
        {snapshot.state === 'GLASS_DOME' && (
          <Group>
            <RoundedRect
              x={CX - 88}
              y={candleTop - 115}
              width={176}
              height={candleHeight + 130}
              r={88}
              color="rgba(255,255,255,0.06)"
              style="fill"
            />
            <RoundedRect
              x={CX - 88}
              y={candleTop - 115}
              width={176}
              height={candleHeight + 130}
              r={88}
              color="rgba(255,255,255,0.28)"
              style="stroke"
              strokeWidth={1.6}
            />
            <Path
              path={domeHighlightPath}
              style="stroke"
              strokeWidth={4}
              strokeCap="round"
            >
              <LinearGradient
                start={vec(CX - 66, candleTop - 92)}
                end={vec(CX - 62, candleBottom - 16)}
                colors={['rgba(255,255,255,0.38)', 'rgba(255,255,255,0.12)', 'transparent']}
              />
              <BlurMask blur={2} style="normal" />
            </Path>
          </Group>
        )}
        </Canvas>
        {Boolean(candleName?.trim()) && (
          <View
            pointerEvents="none"
            style={[styles.engravedWrap, { top: candleBottom - 26, left: candleLeft, width: candleW }]}
          >
            <Text style={styles.engravedText} numberOfLines={1}>
              {candleName!.trim().slice(0, 12).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const RainDrop: React.FC<{
  fall: { value: number };
  dx: number;
  phase: number;
  length: number;
  travel: number;
}> = ({ fall, dx, phase, length, travel }) => {
  const transform = useDerivedValue(() => {
    const t = (fall.value + phase) % 1;
    return [{ translateY: t * travel }];
  });
  const opacity = useDerivedValue(() => {
    const t = (fall.value + phase) % 1;
    return t < 0.08 || t > 0.88 ? 0 : 0.72;
  });
  return (
    <Group transform={transform} opacity={opacity}>
      <RoundedRect x={CX + dx} y={18} width={1.4} height={length} r={0.7} color="#D7ECFF" />
    </Group>
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
  engravedWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  engravedText: {
    color: 'rgba(74, 58, 44, 0.55)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
});
