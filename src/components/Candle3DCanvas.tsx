import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
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
}

const SPARK_OFFSETS = [
  { dx: -26, dy: -34 },
  { dx: 24, dy: -30 },
  { dx: -16, dy: -46 },
  { dx: 18, dy: -42 },
  { dx: 0, dy: -52 },
];

export const Candle3DCanvas: React.FC<Candle3DCanvasProps> = ({
  snapshot,
  theme,
  waxLayers,
}) => {
  const flicker = useSharedValue(1);
  const smokeRise = useSharedValue(0);
  const igniteBloom = useSharedValue(1);
  const sparkProgress = useSharedValue(0);

  useEffect(() => {
    const isFlickering = snapshot.state === 'FLICKERING' || snapshot.state === 'DYING_EMBER';
    const duration = isFlickering ? 240 : 900;
    const minScale = isFlickering ? 0.78 : 0.94;

    flicker.value = withRepeat(
      withSequence(
        withTiming(minScale, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.04, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );

    if (snapshot.state === 'IGNITING') {
      igniteBloom.value = 0.15;
      igniteBloom.value = withSequence(
        withSpring(1.32, { damping: 8, stiffness: 180 }),
        withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) })
      );
      sparkProgress.value = 0;
      sparkProgress.value = withDelay(
        40,
        withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) })
      );
    } else {
      igniteBloom.value = 1;
      sparkProgress.value = 0;
    }

    if (snapshot.state === 'SMOKING_GRACE') {
      smokeRise.value = withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
        -1,
        false
      );
    } else {
      smokeRise.value = 0;
    }
  }, [snapshot.state, flicker, smokeRise, igniteBloom, sparkProgress]);

  const flameAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: '6deg' },
      { scaleY: flicker.value * igniteBloom.value },
      { scaleX: (1 + (1 - flicker.value) * 0.35) * igniteBloom.value },
    ],
    opacity: snapshot.flameIntensity > 0 ? 0.85 + snapshot.flameIntensity * 0.15 : 0,
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { scale: (0.95 + snapshot.flameIntensity * 0.45 * flicker.value) * igniteBloom.value },
    ],
    opacity: snapshot.flameIntensity * 0.48,
  }));

  const subsurfaceGlowStyle = useAnimatedStyle(() => ({
    opacity: snapshot.flameIntensity > 0 ? 0.45 + snapshot.flameIntensity * 0.45 : 0,
    transform: [{ scaleX: igniteBloom.value }],
  }));

  const smokeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -smokeRise.value * 70 }],
    opacity: snapshot.state === 'SMOKING_GRACE' ? (1 - smokeRise.value) * 0.65 : 0,
  }));

  const candleHeight = Math.round(210 - snapshot.meltProgress * 95);
  const flameHeight = Math.round(18 + snapshot.flameIntensity * 46);
  const flameWidth = Math.round(12 + snapshot.flameIntensity * 18);
  const visibleLayers = waxLayers.slice(-14);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`Your wick is ${snapshot.state.toLowerCase().replace('_', ' ')}, ${snapshot.stepsToday} steps today`}
    >
      {/* Dynamic 3D Ambient Radial Halo */}
      <Animated.View
        style={[
          styles.ambientHalo,
          { backgroundColor: snapshot.state === 'NIGHT_SLEEP' ? '#7CC6FE' : theme.ambientGlow },
          glowAnimatedStyle,
        ]}
      />

      {/* Glass Dome Overlay (24h Rest Freeze) */}
      {snapshot.state === 'GLASS_DOME' && <View style={styles.glassDome} />}

      {/* Flame / Wick / 3D Flint Sparks / Smoke */}
      <View style={styles.wickArea}>
        {snapshot.state === 'IGNITING' &&
          SPARK_OFFSETS.map((offset, idx) => (
            <SparkParticle key={idx} progress={sparkProgress} dx={offset.dx} dy={offset.dy} />
          ))}

        {snapshot.state === 'SMOKING_GRACE' && (
          <Animated.View style={[styles.smokeWisp, smokeAnimatedStyle]} />
        )}

        {snapshot.flameIntensity > 0 && (
          <Animated.View
            style={[
              styles.flameOuter,
              {
                width: flameWidth,
                height: flameHeight,
                backgroundColor: snapshot.flameColorHex,
                shadowColor: snapshot.flameColorHex,
              },
              flameAnimatedStyle,
            ]}
          >
            <View style={styles.flameCore} />
          </Animated.View>
        )}

        <View
          style={[
            styles.wick,
            snapshot.state === 'SMOKING_GRACE' && styles.wickGlowingTip,
          ]}
        />
      </View>

      {/* 3D Elliptical Wax Top Rim & Subsurface Scattering */}
      <View style={styles.waxTopRim}>
        <Animated.View
          style={[
            styles.subsurfaceGlow,
            { backgroundColor: snapshot.flameColorHex },
            subsurfaceGlowStyle,
          ]}
        />
      </View>

      {/* 3D Wax Cylinder with Specular Shading & Day-N Hardened Layers */}
      <View style={[styles.candleBody, { height: candleHeight }]}>
        <View style={styles.cylinderHighlight} />
        <View style={styles.cylinderShadow} />
        <View style={styles.moltenPool} />
        <View style={styles.layersContainer}>
          {visibleLayers.map((layer) => (
            <View
              key={layer.id}
              style={[
                styles.waxLayerBand,
                {
                  backgroundColor: layer.colorHex,
                  height: Math.max(3, Math.round(layer.thicknessMm * 1.4)),
                },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

const SparkParticle: React.FC<{
  progress: Animated.SharedValue<number>;
  dx: number;
  dy: number;
}> = ({ progress, dx, dy }) => {
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * dx },
      { translateY: progress.value * dy + progress.value * progress.value * 18 },
      { scale: 1 - progress.value * 0.7 },
    ],
    opacity: progress.value > 0 ? 1 - progress.value : 0,
  }));

  return <Animated.View style={[styles.sparkDot, style]} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ambientHalo: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    top: '22%',
  },
  glassDome: {
    position: 'absolute',
    width: 170,
    height: 320,
    borderTopLeftRadius: 85,
    borderTopRightRadius: 85,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  wickArea: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 80,
    marginBottom: -4,
    zIndex: 3,
  },
  sparkDot: {
    position: 'absolute',
    bottom: 14,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFF6D6',
    shadowColor: '#FF9F43',
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  flameOuter: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 26,
  },
  flameCore: {
    width: '45%',
    height: '45%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    opacity: 0.92,
  },
  wick: {
    width: 3,
    height: 14,
    backgroundColor: '#27272A',
    borderRadius: 1.5,
  },
  wickGlowingTip: {
    backgroundColor: '#DC2626',
  },
  smokeWisp: {
    width: 14,
    height: 36,
    borderRadius: 7,
    backgroundColor: 'rgba(161, 161, 170, 0.45)',
    marginBottom: 4,
  },
  waxTopRim: {
    width: 108,
    height: 18,
    borderRadius: 54,
    backgroundColor: '#F5EFE6',
    marginBottom: -9,
    zIndex: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subsurfaceGlow: {
    width: 64,
    height: 12,
    borderRadius: 32,
  },
  candleBody: {
    width: 108,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: '#E7DFD5',
    overflow: 'hidden',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.65,
    shadowRadius: 22,
  },
  cylinderHighlight: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    width: 18,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  cylinderShadow: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  moltenPool: {
    height: 14,
    backgroundColor: '#F5EFE6',
    opacity: 0.85,
  },
  layersContainer: {
    width: '100%',
  },
  waxLayerBand: {
    width: '100%',
    opacity: 0.85,
  },
});
