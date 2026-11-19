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
}

const { width: SCREEN_W } = Dimensions.get('window');
const CANVAS_W = Math.min(SCREEN_W, 420);
const CANVAS_H = 520;
const CX = CANVAS_W / 2;

function createTeardropPath(cx: number, baseY: number, w: number, h: number) {
  const p = Skia.Path.Make();
  p.moveTo(cx, baseY - h);
  p.cubicTo(
    cx + w * 0.55,
    baseY - h * 0.55,
    cx + w * 0.72,
    baseY - h * 0.14,
    cx,
    baseY
  );
  p.cubicTo(
    cx - w * 0.72,
    baseY - h * 0.14,
    cx - w * 0.55,
    baseY - h * 0.55,
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
}) => {
  const breath = useSharedValue(1);
  const sway = useSharedValue(0);
  const bloom = useSharedValue(1);
  const smokeDrift = useSharedValue(0);

  useEffect(() => {
    const anxious = snapshot.state === 'FLICKERING' || snapshot.state === 'DYING_EMBER';
    const breathMs = anxious ? 260 : 1200;
    const minBreath = anxious ? 0.82 : 0.94;

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
        withTiming(anxious ? -0.09 : -0.03, {
          duration: anxious ? 210 : 1500,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(anxious ? 0.09 : 0.03, {
          duration: anxious ? 230 : 1700,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      true
    );

    if (snapshot.state === 'IGNITING') {
      bloom.value = 0.2;
      bloom.value = withSequence(
        withSpring(1.28, { damping: 9, stiffness: 170 }),
        withTiming(1, { duration: 480, easing: Easing.out(Easing.quad) })
      );
    } else {
      bloom.value = 1;
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
  }, [snapshot.state, breath, sway, bloom, smokeDrift]);

  const candleHeight = Math.round(230 - snapshot.meltProgress * 105);
  const candleW = 118;
  const candleLeft = CX - candleW / 2;
  const candleBottom = CANVAS_H - 36;
  const candleTop = candleBottom - candleHeight;
  const wickBaseY = candleTop + 6;
  const flameBaseY = wickBaseY - 14;

  const intensity = snapshot.flameIntensity;
  const isNight = snapshot.state === 'NIGHT_SLEEP';
  const flameH = Math.round(28 + intensity * 56);
  const flameW = Math.round(18 + intensity * 24);

  const outerFlamePath = useMemo(
    () => createTeardropPath(CX, flameBaseY, flameW * 1.15, flameH * 1.08),
    [flameBaseY, flameW, flameH]
  );
  const midFlamePath = useMemo(
    () => createTeardropPath(CX, flameBaseY, flameW * 0.85, flameH * 0.92),
    [flameBaseY, flameW, flameH]
  );
  const innerCorePath = useMemo(
    () => createTeardropPath(CX, flameBaseY - 3, flameW * 0.42, flameH * 0.52),
    [flameBaseY, flameW, flameH]
  );
  const blueBasePath = useMemo(
    () => createTeardropPath(CX, flameBaseY + 1, flameW * 0.48, flameH * 0.22),
    [flameBaseY, flameW, flameH]
  );

  const dripPath = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(candleLeft + 22, candleTop + 10);
    p.quadTo(candleLeft + 18, candleTop + 36, candleLeft + 23, candleTop + 46);
    p.quadTo(candleLeft + 28, candleTop + 36, candleLeft + 27, candleTop + 10);
    p.close();
    return p;
  }, [candleLeft, candleTop]);

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
    { scale: (0.94 + intensity * 0.22 * breath.value) * bloom.value },
    { translateX: -CX },
    { translateY: -(flameBaseY - flameH * 0.45) },
  ]);

  const smokeTransform = useDerivedValue(() => [
    { translateY: -smokeDrift.value * 76 },
    { scaleX: 1 + smokeDrift.value * 0.8 },
  ]);

  const visibleLayers = waxLayers.slice(-14);
  const glowColor = isNight ? '#7CC6FE' : theme.ambientGlow;
  const outerColor = isNight ? '#38BDF8' : '#FF7A18';
  const midTopColor = isNight ? '#E0F2FE' : '#FFF9E2';
  const midBottomColor = isNight ? '#0284C7' : snapshot.flameColorHex;

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Your wick is ${snapshot.state.toLowerCase().replace('_', ' ')}, ${snapshot.stepsToday} steps today`}
    >
      <Canvas style={styles.canvas}>
        {/* 1. Wide Volumetric Room Light Halo */}
        {intensity > 0 && (
          <Group transform={haloTransform}>
            <Circle cx={CX} cy={flameBaseY - flameH * 0.45} r={210}>
              <RadialGradient
                c={vec(CX, flameBaseY - flameH * 0.45)}
                r={210}
                colors={[
                  `${glowColor}55`,
                  `${glowColor}22`,
                  `${glowColor}08`,
                  'transparent',
                ]}
              />
            </Circle>
            <Circle cx={CX} cy={flameBaseY - flameH * 0.4} r={74}>
              <RadialGradient
                c={vec(CX, flameBaseY - flameH * 0.4)}
                r={74}
                colors={[
                  isNight ? 'rgba(186,230,253,0.45)' : 'rgba(255,244,214,0.52)',
                  isNight ? 'rgba(56,189,248,0.18)' : 'rgba(255,140,36,0.22)',
                  'transparent',
                ]}
              />
              <BlurMask blur={24} style="normal" />
            </Circle>
          </Group>
        )}

        {/* 2. 3D Wax Cylinder with Cylindrical Shading & Subsurface Scattering */}
        <RoundedRect
          x={candleLeft}
          y={candleTop}
          width={candleW}
          height={candleHeight}
          r={16}
        >
          <LinearGradient
            start={vec(candleLeft, candleTop)}
            end={vec(candleLeft + candleW, candleTop)}
            colors={['#9E9386', '#EFE7DC', '#FAF6F0', '#DDD3C5', '#7F756A']}
            positions={[0, 0.22, 0.42, 0.78, 1]}
          />
        </RoundedRect>

        {/* Hardened Day-N Wax Bands */}
        {visibleLayers.map((layer, idx) => {
          const bandH = Math.max(4, Math.round(layer.thicknessMm * 1.6));
          const bandY = candleBottom - 10 - (idx + 1) * (bandH + 1);
          if (bandY <= candleTop + 28) {
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

        {/* Subsurface Scattering (warm light penetrating top of wax) */}
        {intensity > 0 && (
          <RoundedRect
            x={candleLeft}
            y={candleTop}
            width={candleW}
            height={58}
            r={16}
          >
            <RadialGradient
              c={vec(CX, candleTop + 6)}
              r={68}
              colors={[
                isNight ? 'rgba(124,198,254,0.45)' : 'rgba(255,180,70,0.58)',
                isNight ? 'rgba(124,198,254,0.12)' : 'rgba(255,120,20,0.16)',
                'transparent',
              ]}
            />
          </RoundedRect>
        )}

        {/* 3D Elliptical Wax Top Rim & Molten Pool */}
        <Oval x={candleLeft} y={candleTop - 8} width={candleW} height={22} color="#E8DFD3" />
        <Oval x={candleLeft + 8} y={candleTop - 4} width={candleW - 16} height={15}>
          <RadialGradient
            c={vec(CX, candleTop + 4)}
            r={52}
            colors={[
              intensity > 0 ? (isNight ? '#BAE6FD' : '#FFE8B6') : '#D4C8BA',
              '#E5DACD',
              '#C7BBAE',
            ]}
          />
        </Oval>

        {/* Realistic Wax Drip */}
        <Path path={dripPath} color="#F3ECE2" opacity={0.92} />

        {/* Braided Wick */}
        <RoundedRect
          x={CX - 1.5}
          y={wickBaseY - 14}
          width={3}
          height={16}
          r={1.5}
          color={snapshot.state === 'SMOKING_GRACE' ? '#DC2626' : '#27272A'}
        />

        {/* 3. Photorealistic Multi-Layer Flame */}
        {intensity > 0 && (
          <Group transform={flameTransform}>
            {/* Outer warm bloom */}
            <Path path={outerFlamePath} color={outerColor} opacity={0.55}>
              <BlurMask blur={14} style="normal" />
            </Path>
            {/* Mid golden-amber teardrop */}
            <Path path={midFlamePath}>
              <LinearGradient
                start={vec(CX, flameBaseY - flameH)}
                end={vec(CX, flameBaseY)}
                colors={[midTopColor, '#FFB703', midBottomColor]}
              />
            </Path>
            {/* Incandescent white-hot core */}
            <Path path={innerCorePath} color="#FFFFFF" opacity={0.95}>
              <BlurMask blur={3} style="normal" />
            </Path>
            {/* Authentic blue flame base right at the wick */}
            <Path path={blueBasePath} color="#3B82F6" opacity={0.55}>
              <BlurMask blur={4} style="normal" />
            </Path>
          </Group>
        )}

        {/* 4. Rising Smoke Wisp in SMOKING_GRACE */}
        {snapshot.state === 'SMOKING_GRACE' && (
          <Group transform={smokeTransform}>
            <Circle cx={CX} cy={flameBaseY - 14} r={10} color="rgba(161,161,170,0.4)">
              <BlurMask blur={10} style="normal" />
            </Circle>
          </Group>
        )}

        {/* 5. Glass Dome (24h Rest Freeze) */}
        {snapshot.state === 'GLASS_DOME' && (
          <RoundedRect
            x={CX - 86}
            y={candleTop - 110}
            width={172}
            height={candleHeight + 124}
            r={86}
            color="rgba(255,255,255,0.06)"
            style="fill"
          />
        )}
      </Canvas>
    </View>
  );
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
