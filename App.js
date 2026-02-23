import React from 'react';
import { StatusBar, View, Text, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from './src/contexts/AuthContext';
import { PrivacyProvider } from './src/contexts/PrivacyContext';
import AppNavigator from './src/navigation/AppNavigator';

const C = { bg: '#070a11', accent: '#6C5CE7' };

export default function App() {
  const [fontsLoaded] = useFonts({
    'DMSans-Bold': require('./assets/fonts/DMSans-Bold.ttf'),
    'DMSans-Medium': require('./assets/fonts/DMSans-Medium.ttf'),
    'DMSans-Regular': require('./assets/fonts/DMSans-Regular.ttf'),
    'JetBrainsMono-Regular': require('./assets/fonts/JetBrainsMono-Regular.ttf'),
    'JetBrainsMono-Bold': require('./assets/fonts/JetBrainsMono-Bold.ttf'),
  });

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
          <PrivacyProvider>
            <AppNavigator />
          </PrivacyProvider>
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