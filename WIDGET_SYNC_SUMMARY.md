# Widget Bridge Synchronization - Current Implementation

## Overview
The widget bridge synchronizes data between the React Native app and native iOS/Android widgets. Currently, it only syncs **credit card quick expense data** (cartão, fatura total, limite, vencimento, and quick expense presets).

## Current Architecture

### Files Involved
- **`src/services/widgetBridge.js`** (152 lines) - Core bridge service
- **`src/screens/home/HomeScreen.js`** - Imports and calls on app load
- **`src/screens/gestao/AddMovimentacaoScreen.js`** - Calls after saving transaction
- **`src/screens/gestao/AddCartaoScreen.js`** - Calls after creating/editing card
- **`src/screens/gestao/AddGastoRapidoScreen.js`** - Calls after saving quick expense preset
- **`src/screens/gestao/ConfigGastosRapidosScreen.js`** - Calls after deleting/reordering presets
- **`src/screens/gestao/FaturaScreen.js`** - Calls after paying invoice

### widgetBridge.js - Main Functions

#### 1. `updateWidgetData(cartao, faturaTotal, limite, vencimento, moeda, presets)`
- **Purpose**: Build and save widget payload to storage
- **Steps**:
  1. Calls `buildWidgetPayload()` to structure data
  2. Calls `saveWidgetData()` to persist
- **Platform Support**:
  - iOS: Saves to NSUserDefaults via App Group `group.com.premiotrader.app.data`
  - Android: Calls `requestWidgetUpdate()` for QuickExpenseWidget

#### 2. `updateWidgetFromContext(userId, database, currencyService)` 
- **Purpose**: Unified sync function - fetch app state and update widget
- **Implementation** (lines 108-144):
  ```javascript
  1. Get all user cards: database.getCartoes(userId)
  2. If empty, return (no cards = no widget to update)
  3. Use first card (linha 119)
  4. Get current month fatura: database.getFatura(userId, cartao.id, mes, ano)
  5. Get quick expense presets: database.getGastosRapidos(userId)
  6. Get currency symbol: currencyService.getSymbol(cartao.moeda)
  7. Call updateWidgetData() with all data
  ```
- **Error Handling**: Catches all errors silently (widget is best-effort)

#### 3. `saveWidgetData(data)` 
- Saves to AsyncStorage (all platforms)
- iOS: Also saves to App Group UserDefaults
- Android: Requests widget update trigger
- **Note**: Errors are silent by design (best-effort)

#### 4. Helper Functions
- `buildWidgetPayload()` - Structures data for widget
- `getWidgetData()` - Retrieves from AsyncStorage
- `saveWidgetData()` - Persists to storage + native APIs

## Current Call Pattern

### In HomeScreen.js (line 230)
```javascript
// Fire-and-forget: sync widget data
widgetBridge.updateWidgetFromContext(user.id, database, currencyService).catch(function(e) {
  console.warn('Home widget sync failed:', e);
});
```
- Called after core app loads
- Passes imported modules directly: `database`, `currencyService`
- Errors logged as warnings

### In Other Screens (e.g., AddMovimentacaoScreen.js line 323)
```javascript
// Fire-and-forget: sync widget data
widgetBridge.updateWidgetFromContext(user.id, databaseModule, currencyServiceModule).catch(function() {});
```
- Called after successful data mutations
- Passes module imports: `databaseModule`, `currencyServiceModule`
- Errors silently ignored

## Current Data Structure

Widget payload (from `buildWidgetPayload()`):
```javascript
{
  cartao: {
    id: string,
    label: string,              // "VISA ••1234"
    fatura_total: number,       // current month invoice total
    limite: number,             // card limit
    vencimento: string,         // due date
    moeda: string              // "BRL" or foreign currency code
  },
  presets: [                     // Quick expense presets (max 4)
    {
      id: string,
      label: string,
      valor: number,
      icone: string,
      cartao_id: string
    }
  ],
  updated_at: string            // ISO timestamp
}
```

## Key Observations

1. **Single Card Only**: Widget always uses the first active card
2. **Silent Failures**: All errors are caught and ignored (best-effort design)
3. **No Data Validation**: Widget doesn't validate before persisting
4. **Minimal Data**: Only syncs card and quick expense data (no portfolio, options, income, etc.)
5. **Fire-and-Forget**: All calls are async without awaiting results
6. **Module Passing**: Requires passing `database` and `currencyService` modules to avoid circular dependencies

## Current Limitations

- Cannot extend to sync portfolio data (getDashboard) without major refactor
- Cannot enable quick access to portfolio summary from widget
- Cannot show options data or income data on widget
- No caching of dashboard data between calls
- Module dependencies passed explicitly (not ideal from architecture perspective)

## Test Pattern

HomeScreen imports as:
```javascript
import * as database from '../../services/database';
import * as currencyService from '../../services/currencyService';
```

Then passes directly:
```javascript
widgetBridge.updateWidgetFromContext(user.id, database, currencyService)
```

Other screens do the same with renamed imports (databaseModule, currencyServiceModule).
