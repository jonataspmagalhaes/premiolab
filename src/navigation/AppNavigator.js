import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { C, F, SIZE } from '../theme';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import HomeScreen from '../screens/home/HomeScreen';
import CarteiraScreen from '../screens/carteira/CarteiraScreen';
import AssetDetailScreen from '../screens/carteira/AssetDetailScreen';
import AddOperacaoScreen from '../screens/carteira/AddOperacaoScreen';
import OpcoesScreen from '../screens/opcoes/OpcoesScreen';
import AnaliseScreen from '../screens/analise/AnaliseScreen';
import MaisScreen from '../screens/mais/MaisScreen';
import ConfigMetaScreen from '../screens/mais/config/ConfigMetaScreen';
import ConfigCorretorasScreen from '../screens/mais/config/ConfigCorretorasScreen';
import ConfigAlertasScreen from '../screens/mais/config/ConfigAlertasScreen';
import ConfigSelicScreen from '../screens/mais/config/ConfigSelicScreen';
import AddOpcaoScreen from '../screens/opcoes/AddOpcaoScreen';
import EditOperacaoScreen from '../screens/carteira/EditOperacaoScreen';
import EditOpcaoScreen from '../screens/opcoes/EditOpcaoScreen';
import AddRendaFixaScreen from '../screens/rf/AddRendaFixaScreen';
import RendaFixaScreen from '../screens/rf/RendaFixaScreen';
import EditRendaFixaScreen from '../screens/rf/EditRendaFixaScreen';
// Dark Theme
var PremioLabTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,    primary: C.accent,
    background: C.bg,
    card: C.bg,
    text: C.text,
    border: C.border,
    notification: C.red,
  },
};

// Tab Navigator
var Tab = createBottomTabNavigator();

function TabIcon(props) {
  var icon = props.icon;
  var label = props.label;
  var focused = props.focused;
  var badge = props.badge;
  return (
    <View style={styles.tabItem}>
      <Text style={[styles.tabIcon, { color: focused ? C.accent : C.dim }]}>
        {icon}
      </Text>
      {badge > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.tabLabel, { color: focused ? C.accent : C.dim }]}>
        {label}
      </Text>
      {focused && <View style={styles.tabIndicator} />}
    </View>
  );
}

function MainTabs() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: false,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon icon="⌂" label="Home" focused={p.focused} badge={2} />;
            },
          }}
        />
        <Tab.Screen
          name="Carteira"
          component={CarteiraScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon icon="◫" label="Carteira" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Opcoes"
          component={OpcoesScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon icon="⚡" label="Opções" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Analise"
          component={AnaliseScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon icon="◎" label="Análise" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Mais"
          component={MaisScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon icon="≡" label="Mais" focused={p.focused} />;
            },
          }}
        />
      </Tab.Navigator>
    </SafeAreaView>
  );
}

// Stack Navigator
var Stack = createNativeStackNavigator();

var screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: C.bg },
  animation: 'slide_from_right',
};

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Login" component={LoginScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AssetDetail" component={AssetDetailScreen} />
      <Stack.Screen name="AddOperacao" component={AddOperacaoScreen} />
      <Stack.Screen name="ConfigMeta" component={ConfigMetaScreen} />
      <Stack.Screen name="ConfigCorretoras" component={ConfigCorretorasScreen} />
      <Stack.Screen name="ConfigAlertas" component={ConfigAlertasScreen} />
      <Stack.Screen name="ConfigSelic" component={ConfigSelicScreen} />
      <Stack.Screen name="AddOpcao" component={AddOpcaoScreen} />
               <Stack.Screen name="EditOperacao" component={EditOperacaoScreen} />
              <Stack.Screen name="EditOpcao" component={EditOpcaoScreen} />
             <Stack.Screen name="AddRendaFixa" component={AddRendaFixaScreen} />
            <Stack.Screen name="RendaFixa" component={RendaFixaScreen} />
            <Stack.Screen name="EditRendaFixa" component={EditRendaFixaScreen} />
    </Stack.Navigator>
  );
}

// Root Navigator
export default function AppNavigator() {
  var auth = useAuth();
  var user = auth.user;
  var loading = auth.loading;
  var onboarded = auth.onboarded;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>◈</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={PremioLabTheme}>
      {!user ? (
        <AuthStack />
      ) : !onboarded ? (
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </Stack.Navigator>
      ) : (
        <AppStack />
      )}
    </NavigationContainer>
  );
}

// Styles
var styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(7,10,17,0.92)',
    borderTopWidth: 1,
    borderTopColor: C.border,
    height: SIZE.tabBarHeight,
    paddingBottom: 8,
    paddingTop: 5,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 17,
  },
  tabLabel: {
    fontSize: 8,
    fontWeight: '600',
    fontFamily: F.body,
  },
  tabIndicator: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.accent,
    marginTop: 1,
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: 'white',
    fontFamily: F.mono,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 40,
    color: C.accent,
  },
});
