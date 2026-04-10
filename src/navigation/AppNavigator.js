import React from 'react';
import { View, Text, StyleSheet, StatusBar, Platform, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Toast from 'react-native-toast-message';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { C, F, SIZE } from '../theme';
import toastConfig from '../components/ToastConfig';
import { getGastosRapidos, executeGastoRapido, getCartoes } from '../services/database';
import widgetBridge from '../services/widgetBridge';

// Lock app to portrait globally (landscape only in specific modals)
ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(function() {});

// Screens
import LoginScreen from '../screens/auth/LoginScreen';
import OnboardingScreen from '../screens/auth/OnboardingScreen';
import GestaoScreen from '../screens/gestao/GestaoScreen';
import AssetDetailScreen from '../screens/carteira/AssetDetailScreen';
import AddOperacaoScreen from '../screens/carteira/AddOperacaoScreen';
import OpcoesScreen from '../screens/opcoes/OpcoesScreen';
import AnaliseScreen from '../screens/analise/AnaliseScreen';
import MaisScreen from '../screens/mais/MaisScreen';
import ConfigMetaScreen from '../screens/mais/config/ConfigMetaScreen';
import ConfigCorretorasScreen from '../screens/mais/config/ConfigCorretorasScreen';
import ConfigAlertasScreen from '../screens/mais/config/ConfigAlertasScreen';
import AddOpcaoScreen from '../screens/opcoes/AddOpcaoScreen';
import AddAlertaPrecoScreen from '../screens/carteira/AddAlertaPrecoScreen';
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
import EditMovimentacaoScreen from '../screens/gestao/EditMovimentacaoScreen';
import ExtratoScreen from '../screens/gestao/ExtratoScreen';
import AddContaScreen from '../screens/gestao/AddContaScreen';
import ImportOperacoesScreen from '../screens/carteira/ImportOperacoesScreen';
import OrcamentoScreen from '../screens/gestao/OrcamentoScreen';
import RecorrentesScreen from '../screens/gestao/RecorrentesScreen';
import AddRecorrenteScreen from '../screens/gestao/AddRecorrenteScreen';
import AddCartaoScreen from '../screens/gestao/AddCartaoScreen';
import FaturaScreen from '../screens/gestao/FaturaScreen';
import ConfigGastosRapidosScreen from '../screens/gestao/ConfigGastosRapidosScreen';
import AddGastoRapidoScreen from '../screens/gestao/AddGastoRapidoScreen';
import RecuperarSenhaScreen from '../screens/auth/RecuperarSenhaScreen';
import ProfileScreen from '../screens/mais/ProfileScreen';
import PaywallScreen from '../screens/mais/PaywallScreen';
import SimuladorFIIScreen from '../screens/simulador-fii/SimuladorFIIScreen';
import CalendarioRendaScreen from '../screens/renda/CalendarioRendaScreen';
import GeradorRendaScreen from '../screens/renda/GeradorRendaScreen';
import AcoesScreen from '../screens/acoes/AcoesScreen';
import RendaHomeScreen from '../screens/renda/RendaHomeScreen';
import ConfigPortfoliosScreen from '../screens/mais/config/ConfigPortfoliosScreen';
import ConfigPerfilInvestidorScreen from '../screens/mais/config/ConfigPerfilInvestidorScreen';
import BackupScreen from '../screens/mais/config/BackupScreen';

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
var SafeAddOpcaoScreen = withSafeArea(AddOpcaoScreen);
var SafeAddAlertaPrecoScreen = withSafeArea(AddAlertaPrecoScreen);
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
var SafeEditMovimentacaoScreen = withSafeArea(EditMovimentacaoScreen);
var SafeExtratoScreen = withSafeArea(ExtratoScreen);
var SafeAddContaScreen = withSafeArea(AddContaScreen);
var SafeImportOperacoesScreen = withSafeArea(ImportOperacoesScreen);
var SafeOrcamentoScreen = withSafeArea(OrcamentoScreen);
var SafeRecorrentesScreen = withSafeArea(RecorrentesScreen);
var SafeAddRecorrenteScreen = withSafeArea(AddRecorrenteScreen);
var SafeAddCartaoScreen = withSafeArea(AddCartaoScreen);
var SafeFaturaScreen = withSafeArea(FaturaScreen);
var SafeConfigGastosRapidosScreen = withSafeArea(ConfigGastosRapidosScreen);
var SafeAddGastoRapidoScreen = withSafeArea(AddGastoRapidoScreen);
var SafeRecuperarSenhaScreen = withSafeArea(RecuperarSenhaScreen);
var SafeProfileScreen = withSafeArea(ProfileScreen);
var SafePaywallScreen = withSafeArea(PaywallScreen);
var SafeConfigPortfoliosScreen = withSafeArea(ConfigPortfoliosScreen);
var SafeBackupScreen = withSafeArea(BackupScreen);
var SafeConfigPerfilInvestidorScreen = withSafeArea(ConfigPerfilInvestidorScreen);
var SafeSimuladorFIIScreen = withSafeArea(SimuladorFIIScreen);
var SafeCalendarioRendaScreen = withSafeArea(CalendarioRendaScreen);
var SafeGeradorRendaScreen = withSafeArea(GeradorRendaScreen);
var SafeAcoesScreen = withSafeArea(AcoesScreen);

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
        {/* Tab 1 — Renda (ex-Home) — Fase E reescrita */}
        <Tab.Screen
          name="Home"
          component={RendaHomeScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon iconFocused="cash" iconDefault="cash-outline" label="Renda" focused={p.focused} />;
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
          name="Acoes"
          component={AcoesScreen}
          options={{
            tabBarIcon: function(p) {
              return <TabIcon iconFocused="rocket" iconDefault="rocket-outline" label="Ações" focused={p.focused} />;
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

var navigationRef = createNavigationContainerRef();

var screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: C.bg },
  animation: 'slide_from_right',
};

// Deep linking config
var linkingConfig = {
  prefixes: ['premiolab://'],
  config: {
    screens: {
      // Tab navigation via deep links (premiolab://tab/home etc)
      MainTabs: {
        path: 'tab',
        screens: {
          Home: 'home',
          Carteira: 'carteira',
          Opcoes: 'opcoes',
          Renda: 'renda',
          Mais: 'mais',
        },
      },
      // Routes handled by the root Stack.Navigator (AppStack)
      // React Navigation matches these screen names directly
      AddMovimentacao: 'add-gasto',
      ConfigGastosRapidos: 'config-gastos',
      Fatura: {
        path: 'fatura/:cartaoId',
      },
    },
  },
  // Custom handler: intercept gasto-rapido URLs before React Navigation
  subscribe: function(listener) {
    var linkingSub = Linking.addEventListener('url', function(event) {
      var url = event.url || '';
      if (url.indexOf('premiolab://gasto-rapido/') === 0) {
        handleGastoRapidoDeepLink(url);
        return; // don't pass to React Navigation
      }
      if (url.indexOf('premiolab://widget-select-card/') === 0) {
        handleWidgetSelectCard(url);
        return;
      }
      // For widget screens (fatura, add-gasto, config-gastos): navigate manually
      // to ensure MainTabs is in the stack (so back button + tab bar work)
      if (url.indexOf('premiolab://fatura/') === 0 ||
          url === 'premiolab://add-gasto' ||
          url === 'premiolab://config-gastos') {
        handleWidgetScreenDeepLink(url);
        return;
      }
      listener(url);
    });
    return function() {
      linkingSub.remove();
    };
  },
  getInitialURL: async function() {
    var url = await Linking.getInitialURL();
    if (url && url.indexOf('premiolab://gasto-rapido/') === 0) {
      // Delay to let app initialize, then handle
      setTimeout(function() { handleGastoRapidoDeepLink(url); }, 1500);
      return null; // don't let React Navigation handle it
    }
    if (url && url.indexOf('premiolab://widget-select-card/') === 0) {
      setTimeout(function() { handleWidgetSelectCard(url); }, 500);
      return null;
    }
    // For widget screens: navigate manually after app initializes
    if (url && (url.indexOf('premiolab://fatura/') === 0 ||
        url === 'premiolab://add-gasto' ||
        url === 'premiolab://config-gastos')) {
      setTimeout(function() { handleWidgetScreenDeepLink(url); }, 1500);
      return null;
    }
    return url;
  },
};

// Handle gasto-rapido deep link: execute preset + show toast
function handleGastoRapidoDeepLink(url) {
  var presetId = url.replace('premiolab://gasto-rapido/', '');
  if (!presetId) return;

  // Need userId — get from auth context via global ref
  var userId = _deepLinkUserId;
  if (!userId) return;

  getGastosRapidos(userId).then(function(res) {
    var presets = (res && res.data) || [];
    var preset = null;
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === presetId) {
        preset = presets[i];
        break;
      }
    }
    if (!preset) {
      Toast.show({ type: 'error', text1: 'Gasto não encontrado' });
      return;
    }
    // Validate cartão exists for credit presets
    var meio = preset.meio_pagamento || 'credito';
    if (meio === 'credito' && preset.cartao_id) {
      getCartoes(userId).then(function(cartoesRes) {
        var cards = (cartoesRes && cartoesRes.data) || [];
        var cardExists = false;
        for (var ci = 0; ci < cards.length; ci++) {
          if (cards[ci].id === preset.cartao_id) { cardExists = true; break; }
        }
        if (!cardExists) {
          Toast.show({ type: 'error', text1: 'Cartão não encontrado', text2: 'Edite o gasto rápido e selecione outro cartão' });
          return;
        }
        doExecuteGasto(userId, preset);
      }).catch(function() { doExecuteGasto(userId, preset); });
      return;
    }
    doExecuteGasto(userId, preset);
  }).catch(function() {});
}

function doExecuteGasto(userId, preset) {
  executeGastoRapido(userId, preset).then(function(result) {
    if (result && result.error) {
      Toast.show({ type: 'error', text1: result.error.message || 'Erro ao registrar gasto' });
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(function() {});
      var meio = preset.meio_pagamento || 'credito';
      var meioLabel = meio === 'pix' ? ' via PIX' : meio === 'debito' ? ' via Débito' : '';
      Toast.show({
        type: 'success',
        text1: preset.label + ' registrado' + meioLabel,
        text2: 'R$ ' + (preset.valor || 0).toFixed(2).replace('.', ','),
      });
    }
  }).catch(function() {
    Toast.show({ type: 'error', text1: 'Erro ao registrar gasto' });
  });
}

// Handle widget card selection deep link: save selectedCardId + reload widget
function handleWidgetSelectCard(url) {
  var cardId = url.replace('premiolab://widget-select-card/', '');
  if (!cardId) return;
  widgetBridge.saveToAppGroup('selectedCardId', cardId).then(function() {
    // Trigger iOS widget timeline reload so pill updates without waiting
    if (Platform.OS === 'ios') {
      try {
        var ExtensionStorage = require('expo-modules-core').requireNativeModule('ExtensionStorage');
        if (ExtensionStorage && ExtensionStorage.reloadWidget) {
          ExtensionStorage.reloadWidget('QuickExpenseWidget');
        }
      } catch (e) { /* not available */ }
    }
  }).catch(function() {});
}

// Handle deep links to screens that need MainTabs underneath (back + tab bar)
function handleWidgetScreenDeepLink(url) {
  if (!navigationRef.isReady()) {
    // Retry after a short delay if nav not ready
    setTimeout(function() { handleWidgetScreenDeepLink(url); }, 500);
    return;
  }
  // Ensure MainTabs is the base, then push the target screen on top
  var nav = navigationRef;
  var state = nav.getState();
  var hasMainTabs = state && state.routes && state.routes.length > 0 && state.routes[0].name === 'MainTabs';
  if (!hasMainTabs) {
    nav.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }
  // Navigate after a tick to ensure MainTabs is rendered
  setTimeout(function() {
    if (url.indexOf('premiolab://fatura/') === 0) {
      var cartaoId = url.replace('premiolab://fatura/', '');
      nav.navigate('Fatura', { cartaoId: cartaoId });
    } else if (url === 'premiolab://add-gasto') {
      nav.navigate('AddMovimentacao');
    } else if (url === 'premiolab://config-gastos') {
      nav.navigate('ConfigGastosRapidos');
    }
  }, hasMainTabs ? 0 : 300);
}

var _deepLinkUserId = null;

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Login" component={SafeLoginScreen} />
      <Stack.Screen name="RecuperarSenha" component={SafeRecuperarSenhaScreen} />
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
      <Stack.Screen name="AddOpcao" component={SafeAddOpcaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddAlertaPreco" component={SafeAddAlertaPrecoScreen} options={{ animation: 'slide_from_bottom' }} />
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
      <Stack.Screen name="EditMovimentacao" component={SafeEditMovimentacaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Extrato" component={SafeExtratoScreen} />
      <Stack.Screen name="AddConta" component={SafeAddContaScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ImportOperacoes" component={SafeImportOperacoesScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Orcamento" component={SafeOrcamentoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Recorrentes" component={SafeRecorrentesScreen} />
      <Stack.Screen name="AddRecorrente" component={SafeAddRecorrenteScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddCartao" component={SafeAddCartaoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Fatura" component={SafeFaturaScreen} />
      <Stack.Screen name="ConfigGastosRapidos" component={SafeConfigGastosRapidosScreen} />
      <Stack.Screen name="AddGastoRapido" component={SafeAddGastoRapidoScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="Profile" component={SafeProfileScreen} />
      <Stack.Screen name="Paywall" component={SafePaywallScreen} />
      <Stack.Screen name="ConfigPortfolios" component={SafeConfigPortfoliosScreen} />
      <Stack.Screen name="Backup" component={SafeBackupScreen} />
      <Stack.Screen name="ConfigPerfilInvestidor" component={SafeConfigPerfilInvestidorScreen} />
      <Stack.Screen name="SimuladorFII" component={SafeSimuladorFIIScreen} />
      <Stack.Screen name="CalendarioRenda" component={SafeCalendarioRendaScreen} />
      <Stack.Screen name="GeradorRenda" component={SafeGeradorRendaScreen} />
    </Stack.Navigator>
  );
}

// Root Navigator
export default function AppNavigator() {
  var auth = useAuth();
  var user = auth.user;
  var loading = auth.loading;
  var onboarded = auth.onboarded;

  // Keep userId available for deep link handler
  _deepLinkUserId = (user && user.id) || null;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>◈</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <NavigationContainer theme={PremioLabTheme} ref={navigationRef} linking={linkingConfig}>
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
