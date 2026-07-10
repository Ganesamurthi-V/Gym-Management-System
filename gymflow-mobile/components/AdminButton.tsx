import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius, Spacing } from '@/constants/theme';

type AdminButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'ghost' | 'success';
  style?: ViewStyle;
};

const variantMap = {
  primary: {
    bg: Colors.indigo,
    text: '#fff',
    pressedBg: '#6366f1',
  },
  danger: {
    bg: Colors.redBg,
    text: Colors.red,
    pressedBg: 'rgba(248,113,113,0.2)',
  },
  success: {
    bg: Colors.emeraldBg,
    text: Colors.emerald,
    pressedBg: 'rgba(52,211,153,0.2)',
  },
  ghost: {
    bg: 'transparent',
    text: Colors.textSecondary,
    pressedBg: 'rgba(255,255,255,0.05)',
  },
};

export function AdminButton({ label, onPress, loading, disabled, variant = 'primary', style }: AdminButtonProps) {
  const v = variantMap[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.button,
        { backgroundColor: v.bg },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <Text style={[styles.label, { color: v.text }]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.45,
  },
});
