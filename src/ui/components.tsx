import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import type { DocumentStatus } from '../core/types';
import type { Copy } from '../i18n';
import { colors, styles as s } from './theme';

export function Button({
  children, onPress, variant = 'primary', disabled = false, loading = false, label,
}: {
  children: string | string[];
  onPress(): void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  label?: string;
}) {
  const text = Array.isArray(children) ? children.join('') : children;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? text}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === 'secondary' && s.buttonSecondary,
        variant === 'quiet' && s.buttonQuiet,
        variant === 'danger' && s.buttonDanger,
        (disabled || loading) && s.disabled,
        pressed && s.pressed,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={variant === 'primary' ? '#FFFFFF' : colors.teal} />}
      <Text style={[s.buttonText, variant === 'secondary' && s.buttonSecondaryText, variant === 'quiet' && s.buttonQuietText]}>{text}</Text>
    </Pressable>
  );
}

export function Chip({ children, selected, onPress, disabled = false }: {
  children: string; selected: boolean; onPress(): void; disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.chip, selected && s.chipActive, disabled && s.disabled, pressed && s.pressed]}
    >
      <Text style={[s.chipText, selected && s.chipTextActive]}>{children}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, multiline, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#8391A2"
        selectionColor={colors.teal}
        autoCapitalize="sentences"
        {...props}
        multiline={multiline}
        style={[s.input, multiline && s.inputMultiline, props.style]}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function StatusBadge({ status, copy }: { status: DocumentStatus; copy: Copy }) {
  const tint = status === 'review'
    ? { backgroundColor: colors.amberSoft }
    : status === 'archived' ? { backgroundColor: colors.tealSoft } : undefined;
  const ink = status === 'review'
    ? { color: colors.amber }
    : status === 'archived' ? { color: colors.teal } : undefined;
  return <View style={[s.badge, tint]}><Text style={[s.badgeText, ink]}>{copy[status]}</Text></View>;
}

export function Message({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <View style={error ? s.error : s.success} accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite">
      <Text selectable style={error ? s.errorText : s.successText}>{text}</Text>
    </View>
  );
}

export function EmptyState({ title, description, action, onAction, glyph = '▤' }: {
  title: string; description: string; action?: string; onAction?(): void; glyph?: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Text style={s.emptyIconText} accessible={false}>{glyph}</Text></View>
      <Text accessibilityRole="header" style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyDescription}>{description}</Text>
      {action && onAction && <Button onPress={onAction}>{action}</Button>}
    </View>
  );
}

export function Dialog({ title, copy, onClose, children, footer, busy = false, compact = false, message }: {
  title: string; copy: Copy; onClose(): void; children: ReactNode; footer?: ReactNode; busy?: boolean; compact?: boolean;
  message?: { text: string; error?: boolean };
}) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
        <View accessibilityViewIsModal style={[s.modalPanel, compact && { maxWidth: 470 }]}>
          <View style={s.modalHeader}>
            <Text accessibilityRole="header" style={s.modalTitle}>{title}</Text>
            <Button onPress={onClose} variant="quiet" disabled={busy} label={copy.close}>✕</Button>
          </View>
          {message && <View style={{ paddingHorizontal: 21, paddingTop: 12 }}><Message text={message.text} error={message.error} /></View>}
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.modalContent}>
            {children}
          </ScrollView>
          {footer && <View style={s.modalFooter}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PrivacyNotice({ copy }: { copy: Copy }) {
  return (
    <View style={s.notice}>
      <Text style={s.noticeTitle}>{copy.privacyTitle}</Text>
      <Text style={s.noticeText}>{copy.privacyDescription}</Text>
    </View>
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
