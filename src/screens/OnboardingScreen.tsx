import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NAME_PRESETS = ['Solace', 'Hearth', 'Ember', 'Dawn'];

interface OnboardingScreenProps {
  initialGoal: number;
  initialCandleName?: string;
  onComplete: (dailyStepGoal: number, candleName?: string) => void;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({
  initialGoal,
  initialCandleName = '',
  onComplete,
}) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 700;
  const [goal, setGoal] = useState(initialGoal);
  const [candleName, setCandleName] = useState(initialCandleName);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Math.max(20, insets.top + 12),
            paddingBottom: Math.max(24, insets.bottom + 16),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, compact && { gap: 12 }]}>
        <Text style={styles.brand}>wick</Text>
        <Text style={styles.headline}>Keep your wick lit.</Text>
        <Text style={styles.body}>
          One living candle that glows brightly as you walk. All Apple Health data stays privately
          on your iPhone.
        </Text>
        <View style={styles.presetRow}>
          {[5000, 8000, 10000].map((preset) => (
            <Pressable
              key={preset}
              style={[styles.presetBtn, goal === preset && styles.presetBtnActive]}
              onPress={() => setGoal(preset)}
            >
              <Text style={[styles.presetText, goal === preset && styles.presetTextActive]}>
                {preset / 1000}k
              </Text>
            </Pressable>
          ))}
        </View>
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
        <TextInput
          style={styles.nameInput}
          value={candleName}
          onChangeText={(t) => setCandleName(t.slice(0, 12))}
          placeholder="Name your candle (optional)"
          placeholderTextColor="#71717A"
          maxLength={12}
          returnKeyType="done"
        />
        <View style={styles.presetRow}>
          {NAME_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={[styles.presetBtn, candleName === preset && styles.presetBtnActive]}
              onPress={() => setCandleName(preset)}
            >
              <Text style={[styles.presetText, candleName === preset && styles.presetTextActive]}>
                {preset}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => onComplete(goal, candleName.trim() || undefined)}
        >
          <Text style={styles.primaryText}>Light My Candle</Text>
        </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  scrollContent: {
    flexGrow: 1,
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
  presetRow: {
    flexDirection: 'row',
    gap: 10,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  presetBtnActive: {
    backgroundColor: 'rgba(255,159,67,0.2)',
    borderWidth: 1,
    borderColor: '#FF9F43',
  },
  presetText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '700',
  },
  presetTextActive: {
    color: '#FF9F43',
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
  nameInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#F5F5F7',
    fontSize: 14,
    textAlign: 'center',
  },
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
