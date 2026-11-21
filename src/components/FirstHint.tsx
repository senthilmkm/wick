import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface FirstHintProps {
  text: string;
  onDismiss: () => void;
}

export const FirstHint: React.FC<FirstHintProps> = ({ text, onDismiss }) => (
  <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={text}>
    <Text style={styles.text}>{text}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  text: {
    color: '#F5F5F7',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
});
