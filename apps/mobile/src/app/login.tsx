import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, login } from '@/lib/api';
import { t } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { Button, Field, Panel, Title } from '@/components/ui';
import { colors } from '@/theme';

export default function LoginScreen() {
  const { signedIn } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await login({ login: identifier.trim(), password });
      await signedIn();
      router.replace('/home');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(
        err instanceof ApiError && err.status === 401
          ? t('auth.errorInvalidCredentials')
          : code === 'TOO_MANY_LOGIN_ATTEMPTS'
            ? t('auth.errorTooManyAttempts')
            : code === 'PLAYER_BANNED'
              ? t('auth.bannedTitle')
              : t('auth.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: 2 }}>PENTILIUS</Text>
          </View>
          <Panel>
            <Title>{t('auth.login')}</Title>
            <Field label={t('auth.emailOrUsername')} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" autoCorrect={false} />
            <Field label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry />
            {error && <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>}
            <Button label={t('auth.submit')} onPress={submit} busy={busy} disabled={!identifier || !password} />
          </Panel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
