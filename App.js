import React from 'react';
import { StatusBar, View, Text, StyleSheet, Alert } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/contexts/AuthContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { PrivacyProvider } from './src/contexts/PrivacyContext';
import { AppStoreProvider } from './src/contexts/AppStoreContext';
import AppNavigator from './src/navigation/AppNavigator';
var Updates = require('expo-updates');

// Setup push notifications handler (foreground display + Android channel)
var notifService = require('./src/services/notificationService');
notifService.setNotificationHandler();
notifService.setupNotificationChannel();

// Checar OTA updates ao abrir o app
function checkForOTAUpdate() {
  if (__DEV__) return; // Nao roda em development
  try {
    Updates.checkForUpdateAsync().then(function(result) {
      if (result && result.isAvailable) {
        Updates.fetchUpdateAsync().then(function() {
          Alert.alert(
            'Atualização disponível',
            'Uma nova versão foi baixada. Deseja reiniciar o app agora?',
            [
              { text: 'Depois', style: 'cancel' },
              { text: 'Reiniciar', onPress: function() { Updates.reloadAsync(); } },
            ]
          );
        }).catch(function(e) { console.warn('fetchUpdate error:', e); });
      }
    }).catch(function(e) { console.warn('checkUpdate error:', e); });
  } catch (e) { console.warn('OTA check error:', e); }
}

const C = { bg: '#070a11', accent: '#6C5CE7' };

export default function App() {
  const [fontsLoaded] = useFonts({
    'DMSans-Bold': require('./assets/fonts/DMSans-Bold.ttf'),
    'DMSans-Medium': require('./assets/fonts/DMSans-Medium.ttf'),
    'DMSans-Regular': require('./assets/fonts/DMSans-Regular.ttf'),
    'JetBrainsMono-Regular': require('./assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Bold': require('./assets/fonts/JetBrainsMono-Bold.ttf'),
  });

  // Checar OTA update uma vez ao montar
  React.useEffect(function() { checkForOTAUpdate(); }, []);

  if (!fontsLoaded) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashIcon}>◈</Text>
        <Text style={styles.splashName}>PremioLab</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <AuthProvider>
          <SubscriptionProvider>
            <PrivacyProvider>
              <AppStoreProvider>
                <AppNavigator />
              </AppStoreProvider>
            </PrivacyProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashIcon: {
    fontSize: 48,
    color: C.accent,
    marginBottom: 12,
  },
  splashName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f1f1f4',
    letterSpacing: -0.5,
  },
});