import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import { useAuth } from '../contexts/AuthContext';
import { C, F, SIZE } from '../theme';
import toastConfig from '../components/ToastConfig';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import HomeScreen from '../screens/home/HomeScreen';
import GestaoScreen from '../screens/gestao/GestaoScreen';
import AssetDetailScreen from '../screens/carteira/AssetDetailScreen';
import AddOperacaoScreen from '../screens/carteira/AddOperacaoScreen';
import OpcoesScreen from '../screens/opcoes/OpcoesScreen';
import AnaliseScreen from '../screens/analise/AnaliseScreen';
import RendaScreen from '../screens/renda/RendaScreen';
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
import HistoricoScreen from '../screens/mais/HistoricoScreen';
import SobreScreen from '../screens/mais/SobreScreen';
import GuiaScreen from '../screens/mais/GuiaScreen';
import AddProventoScreen from '../screens/proventos/AddProventoScreen';
import EditProventoScreen from '../screens/proventos/EditProventoScreen';
import AddSaldoScreen from '../screens/carteira/AddSaldoScreen';
import AddMovimentacaoScreen from '../screens/gestao/AddMovimentacaoScreen';
import ExtratoScreen from '../screens/gestao/ExtratoScreen';
import AddContaScreen from '../screens/gestao/AddContaScreen';

// SafeArea HOC — protege telas stack contra notch/camera/relogio/home indicator
function withSafeArea(Screen) {
  function SafeScreen(props) {
    return (
      <SafeAreaView style={safeStyle} edges={['top', 'bottom']}>
        <Screen navigation={props.navigation} route={props.route} />
      </SafeAreaView>
    );
  }
  return SafeScreen;
}

var safeStyle = { flex: 1, backgroundColor: C.bg };

// Wrapped stack screens (referências estáveis no module level)
var SafeLoginScreen = withSafeArea(LoginScreen);
var SafeOnboardingScreen = withSafeArea(OnboardingScreen);
var SafeAssetDetailScreen = withSafeArea(AssetDetailScreen);
var SafeAddOperacaoScreen = withSafeArea(AddOperacaoScreen);
var SafeConfigMetaScreen = withSafeArea(ConfigMetaScreen);
var SafeConfigCorretorasScreen = withSafeArea(ConfigCorretorasScreen);
var SafeConfigAlertasScreen = withSafeArea(ConfigAlertasScreen);
var SafeConfigSelicScreen = withSafeArea(ConfigSelicScreen);
var SafeAddOpcaoScreen = withSafeArea(AddOpcaoScreen);
var SafeEditOperacaoScreen = withSafeArea(EditOperacaoScreen);
var SafeEditOpcaoScreen = withSafeArea(EditOpcaoScreen);
var SafeAddRendaFixaScreen = withSafeArea(AddRendaFixaScreen);
var SafeRendaFixaScreen = withSafeArea(RendaFixaScreen);
var SafeEditRendaFixaScreen = withSafeArea(EditRendaFixaScreen);
var SafeHistoricoScreen = withSafeArea(HistoricoScreen);
var SafeSobreScreen = withSafeArea(SobreScreen);
var SafeGuiaScreen = withSafeArea(GuiaScreen);
var SafeAddProventoScreen = withSafeArea(AddProventoScreen);
var SafeEditProventoScreen = withSafeArea(EditProventoScreen);
var SafeAddSaldoScreen = withSafeArea(AddSaldoScreen);
var SafeAnaliseScreen = withSafeArea(AnaliseScreen);
var SafeAddMovimentacaoScreen = withSafeArea(AddMovimentacaoScreen);
var SafeExtratoScreen = withSafeArea(ExtratoScreen);
var SafeAddContaScreen = withSafeArea(AddContaScreen);

// Dark Theme
var PremioLabTheme = Object.assign({}, DefaultTheme, {
  dark: true,
  colors: Object.assign({}, DefaultTheme.colors, {
    primary: C.accent,
    background: C.bg,
    card: C.bg,
    text: C.text,
    border: C.border,
    notification: C.red,
  }),
});

// Tab Navigator
var Tab = createBottomTabNavigator();

function TabIcon(props) {
  var iconName = props.focused ? props.iconFocused : props.iconDefault;
  var label = props.label;
  var focused = props.focused;
  var badge = props.badge;
  return (
    <View style={styles.tabItem}>
      <Ionicons name={iconName} size={22} color={focused ? C.accent : C.textTertiary} />
      {badge > 0 && (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>{badge}</Text>
        </View>
      )}
      <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.tabLabel, { color: focused ? C.accent : C.textTertiary }]}>
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
              return <TabIcon iconFocused="home" iconDefault="home-outline" label="Home" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Carteira"
          component={GestaoScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon iconFocused="briefcase" iconDefault="briefcase-outline" label="Carteira" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Opcoes"
          component={OpcoesScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon iconFocused="trending-up" iconDefault="trending-up-outline" label="Opções" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Renda"
          component={RendaScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon iconFocused="cash" iconDefault="cash-outline" label="Renda" focused={p.focused} />;
            },
          }}
        />
        <Tab.Screen
          name="Mais"
          component={MaisScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon iconFocused="ellipsis-horizontal-circle" iconDefault="ellipsis-horizontal-circle-outline" label="Mais" focused={p.focused} />;
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
      <Stack.Screen name="Login" component={SafeLoginScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="AssetDetail" component={SafeAssetDetailScreen} />
      <Stack.Screen name="AddOperacao" component={SafeAddOperacaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ConfigMeta" component={SafeConfigMetaScreen} />
      <Stack.Screen name="ConfigCorretoras" component={SafeConfigCorretorasScreen} />
      <Stack.Screen name="ConfigAlertas" component={SafeConfigAlertasScreen} />
      <Stack.Screen name="ConfigSelic" component={SafeConfigSelicScreen} />
      <Stack.Screen name="AddOpcao" component={SafeAddOpcaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="EditOperacao" component={SafeEditOperacaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="EditOpcao" component={SafeEditOpcaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddRendaFixa" component={SafeAddRendaFixaScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="RendaFixa" component={SafeRendaFixaScreen} />
      <Stack.Screen name="EditRendaFixa" component={SafeEditRendaFixaScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Historico" component={SafeHistoricoScreen} />
      <Stack.Screen name="Sobre" component={SafeSobreScreen} />
      <Stack.Screen name="Guia" component={SafeGuiaScreen} />
      <Stack.Screen name="AddProvento" component={SafeAddProventoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="EditProvento" component={SafeEditProventoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddSaldo" component={SafeAddSaldoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Analise" component={SafeAnaliseScreen} />
      <Stack.Screen name="AddMovimentacao" component={SafeAddMovimentacaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Extrato" component={SafeExtratoScreen} />
      <Stack.Screen name="AddConta" component={SafeAddContaScreen} options={{ animation: 'slide_from_bottom' }} />
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
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={PremioLabTheme}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        {!user ? (
          <AuthStack />
        ) : !onboarded ? (
          <Stack.Navigator screenOptions={screenOptions}>
            <Stack.Screen name="Onboarding" component={SafeOnboardingScreen} />
          </Stack.Navigator>
        ) : (
          <AppStack />
        )}
      </NavigationContainer>
      <Toast config={toastConfig} position="top" topOffset={54} visibilityTime={2200} />
    </View>
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
    gap: 3,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: F.body,
  },
  tabIndicator: {
    width: 18,
    height: 2.5,
    borderRadius: 1.5,
    backgroundColor: C.accent,
    marginTop: 1,
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.red,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBadgeText: {
    fontSize: 10,
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
