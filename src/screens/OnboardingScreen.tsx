import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface OnboardingScreenProps {
  initialGoal: number;
  onComplete: (dailyStepGoal: number) => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  initialGoal,
  onComplete,
}) => {
  const [goal, setGoal] = useState(initialGoal);

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.brand}>wick</Text>
        <Text style={styles.headline}>Keep your wick lit.</Text>
        <Text style={styles.body}>
          One living candle that glows brightly as you walk. All Apple Health data stays privately
          on your iPhone.
        </Text>
        <View style={styles.goalPicker}>
          <Pressable
            style={styles.stepBtn}
            onPress={() => setGoal((g) => Math.max(2000, g - 1000))}
          >
            <Text style={styles.stepBtnText}>-</Text>
          </Pressable>
          <Text style={styles.goalNum}>{goal.toLocaleString('en-US')} steps / day</Text>
          <Pressable
            style={styles.stepBtn}
            onPress={() => setGoal((g) => Math.min(20000, g + 1000))}
          >
            <Text style={styles.stepBtnText}>+</Text>
          </Pressable>
        </View>
        <Pressable style={styles.primaryBtn} onPress={() => onComplete(goal)}>
          <Text style={styles.primaryText}>Light My Candle</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    gap: 18,
  },
  brand: {
    color: '#FF9F43',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  headline: {
    color: '#F5F5F7',
    fontSize: 32,
    fontWeight: '700',
  },
  body: {
    color: '#A1A1AA',
    fontSize: 16,
    lineHeight: 24,
  },
  goalPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#F5F5F7', fontSize: 20, fontWeight: '700' },
  goalNum: { color: '#FF9F43', fontSize: 18, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: '#FF9F43',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: {
    color: '#0A0A0C',
    fontSize: 16,
    fontWeight: '700',
  },
});
