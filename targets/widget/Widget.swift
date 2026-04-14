import WidgetKit
import SwiftUI

// MARK: - Theme Colors (hardcoded to avoid asset catalog issues)

extension Color {
    static let plAccent = Color(red: 108/255, green: 92/255, blue: 231/255)       // #6C5CE7
    static let plBg = Color(red: 7/255, green: 10/255, blue: 17/255)              // #070a11
    static let plCard = Color(red: 13/255, green: 17/255, blue: 23/255)           // #0d1117
    static let plText = Color(red: 241/255, green: 241/255, blue: 244/255)        // #f1f1f4
    static let plTextSec = Color(red: 136/255, green: 136/255, blue: 170/255)     // #8888aa
    static let plGreen = Color(red: 34/255, green: 197/255, blue: 94/255)         // #22C55E
    static let plRed = Color(red: 239/255, green: 68/255, blue: 68/255)           // #EF4444
    static let plYellow = Color(red: 245/255, green: 158/255, blue: 11/255)       // #F59E0B
    static let plCyan = Color(red: 6/255, green: 182/255, blue: 212/255)          // #06B6D4
    static let plFuchsia = Color(red: 232/255, green: 121/255, blue: 249/255)     // #E879F9
}

// ══════════════════════════════════════════════════════════════
// MARK: - Data Models
// ══════════════════════════════════════════════════════════════

// QuickExpense (legacy)
struct WidgetPreset: Codable, Identifiable {
    let id: String
    let label: String
    let valor: Double
    let icone: String
    let cartao_id: String?
    let meio_pagamento: String?
    let conta: String?
}

struct WidgetCartao: Codable {
    let id: String?
    let label: String
    let fatura_total: Double
    let limite: Double
    let vencimento: String
    let moeda: String
}

struct WidgetData: Codable {
    let cartao: WidgetCartao?
    let cartoes: [WidgetCartao]?
    let presets: [WidgetPreset]
    let updated_at: String?

    var allCartoes: [WidgetCartao] {
        if let arr = cartoes, !arr.isEmpty { return arr }
        if let c = cartao, c.id != nil { return [c] }
        return []
    }
}

// Patrimonio
struct HistoryPoint: Codable {
    let d: String
    let v: Double
}

struct PatrimonioData: Codable {
    let total: Double
    let rentabilidadeMes: Double
    let history: [HistoryPoint]
}

// Heatmap
struct HeatmapPosition: Codable {
    let ticker: String
    let change: Double
    let valor: Double
}

struct HeatmapData: Codable {
    let positions: [HeatmapPosition]
}

// Vencimentos
struct VencimentoOpcao: Codable {
    let tipo: String
    let ticker: String
    let base: String
    let strike: Double
    let dte: Int
    // Enriched fields (optional for backward compat with old JSON)
    let direcao: String?
    let premio: Double?
    let quantidade: Double?
    let spot: Double?
    let moneyness: String?
    let distPct: Double?
    let marketPrice: Double?
    let bid: Double?
    let ask: Double?
    let plTotal: Double?
    let plPct: Double?
}

struct VencimentosData: Codable {
    let opcoes: [VencimentoOpcao]
}

// Renda
struct RendaData: Codable {
    let totalMes: Double
    let meta: Double
    let totalMesAnterior: Double
}

// ══════════════════════════════════════════════════════════════
// MARK: - Helpers
// ══════════════════════════════════════════════════════════════

let appGroupDefaults = UserDefaults(suiteName: "group.com.premiotrader.app.data")

func formatCurrency(_ value: Double, moeda: String = "BRL") -> String {
    let symbol: String
    switch moeda {
    case "USD": symbol = "US$"
    case "EUR": symbol = "\u{20AC}"
    case "GBP": symbol = "\u{00A3}"
    default: symbol = "R$"
    }

    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    formatter.locale = Locale(identifier: "pt_BR")
    let formatted = formatter.string(from: NSNumber(value: value)) ?? "0,00"
    return "\(symbol) \(formatted)"
}

func formatCompact(_ value: Double) -> String {
    if value >= 1_000_000 {
        let v = value / 1_000_000
        return String(format: "R$ %.1fM", v)
    } else if value >= 1_000 {
        let v = value / 1_000
        return String(format: "R$ %.1fk", v)
    }
    return formatCurrency(value)
}

func getSelectedCardId() -> String? {
    return appGroupDefaults?.string(forKey: "selectedCardId")
}

func saveSelectedCardId(_ cardId: String) {
    appGroupDefaults?.set(cardId, forKey: "selectedCardId")
}

func iconForPreset(_ ionicon: String) -> String {
    let map: [String: String] = [
        "restaurant-outline": "fork.knife",
        "cafe-outline": "cup.and.saucer.fill",
        "car-outline": "car.fill",
        "bus-outline": "bus.fill",
        "cart-outline": "cart.fill",
        "film-outline": "film",
        "musical-notes-outline": "music.note",
        "airplane-outline": "airplane",
        "bed-outline": "bed.double.fill",
        "fitness-outline": "figure.run",
        "medkit-outline": "cross.case.fill",
        "school-outline": "graduationcap.fill",
        "shirt-outline": "tshirt.fill",
        "cut-outline": "scissors",
        "paw-outline": "pawprint.fill",
        "game-controller-outline": "gamecontroller.fill",
        "gift-outline": "gift.fill",
        "home-outline": "house.fill",
        "construct-outline": "wrench.fill",
        "ellipsis-horizontal-outline": "ellipsis",
        "card-outline": "creditcard.fill",
        "flash-outline": "bolt.fill",
    ]
    return map[ionicon] ?? "creditcard.fill"
}

// ══════════════════════════════════════════════════════════════
// MARK: - Data Loading (individual keys per widget)
// ══════════════════════════════════════════════════════════════

func loadWidgetData() -> WidgetData {
    guard let jsonStr = appGroupDefaults?.string(forKey: "widgetData"),
          let jsonData = jsonStr.data(using: .utf8) else {
        return WidgetData(cartao: nil, cartoes: nil, presets: [], updated_at: nil)
    }
    do {
        return try JSONDecoder().decode(WidgetData.self, from: jsonData)
    } catch {
        return WidgetData(cartao: nil, cartoes: nil, presets: [], updated_at: nil)
    }
}

func loadPatrimonioData() -> PatrimonioData? {
    guard let jsonStr = appGroupDefaults?.string(forKey: "patrimonioData"),
          let jsonData = jsonStr.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(PatrimonioData.self, from: jsonData)
}

func loadHeatmapData() -> HeatmapData? {
    guard let jsonStr = appGroupDefaults?.string(forKey: "heatmapData"),
          let jsonData = jsonStr.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(HeatmapData.self, from: jsonData)
}

func loadVencimentosData() -> VencimentosData? {
    guard let jsonStr = appGroupDefaults?.string(forKey: "vencimentosData"),
          let jsonData = jsonStr.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(VencimentosData.self, from: jsonData)
}

func loadRendaData() -> RendaData? {
    guard let jsonStr = appGroupDefaults?.string(forKey: "rendaData"),
          let jsonData = jsonStr.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(RendaData.self, from: jsonData)
}

// ══════════════════════════════════════════════════════════════
// MARK: - QuickExpense Widget (existing)
// ══════════════════════════════════════════════════════════════

struct QuickExpenseEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct QuickExpenseProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickExpenseEntry {
        QuickExpenseEntry(date: Date(), data: WidgetData(
            cartao: WidgetCartao(id: nil, label: "VISA \u{2022}\u{2022}1234", fatura_total: 2350.00, limite: 5000, vencimento: "10/04", moeda: "BRL"),
            cartoes: nil,
            presets: [
                WidgetPreset(id: "1", label: "Almoço", valor: 35.0, icone: "restaurant-outline", cartao_id: nil, meio_pagamento: nil, conta: nil),
                WidgetPreset(id: "2", label: "Café", valor: 8.0, icone: "cafe-outline", cartao_id: nil, meio_pagamento: nil, conta: nil),
                WidgetPreset(id: "3", label: "Uber", valor: 25.0, icone: "car-outline", cartao_id: nil, meio_pagamento: nil, conta: nil),
                WidgetPreset(id: "4", label: "Mercado", valor: 150.0, icone: "cart-outline", cartao_id: nil, meio_pagamento: nil, conta: nil),
            ],
            updated_at: nil
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (QuickExpenseEntry) -> Void) {
        completion(QuickExpenseEntry(date: Date(), data: loadWidgetData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickExpenseEntry>) -> Void) {
        let entry = QuickExpenseEntry(date: Date(), data: loadWidgetData())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct PresetButtonView: View {
    let preset: WidgetPreset
    let moeda: String

    var isPix: Bool {
        return preset.meio_pagamento == "pix"
    }

    var isDebito: Bool {
        return preset.meio_pagamento == "debito"
    }

    var body: some View {
        Link(destination: URL(string: "premiolab://gasto-rapido/\(preset.id)")!) {
            VStack(spacing: 2) {
                if isPix {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.plGreen)
                } else if isDebito {
                    Image(systemName: "banknote")
                        .font(.system(size: 16))
                        .foregroundColor(.plCyan)
                } else {
                    Image(systemName: iconForPreset(preset.icone))
                        .font(.system(size: 16))
                        .foregroundColor(.plAccent)
                }
                Text(preset.label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.plText)
                    .lineLimit(1)
                Text(formatCurrency(preset.valor, moeda: moeda))
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .foregroundColor(.plTextSec)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.plCard)
            .cornerRadius(8)
        }
    }
}

struct QuickExpenseWidgetView: View {
    let entry: QuickExpenseEntry

    var allCartoes: [WidgetCartao] { entry.data.allCartoes }
    var allPresets: [WidgetPreset] { entry.data.presets }

    var selectedCard: WidgetCartao? {
        let cards = allCartoes
        guard !cards.isEmpty else { return nil }
        if let savedId = getSelectedCardId() {
            for c in cards {
                if c.id == savedId { return c }
            }
        }
        return cards[0]
    }

    var moeda: String { selectedCard?.moeda ?? "BRL" }

    var filteredPresets: [WidgetPreset] {
        guard let card = selectedCard, let cardId = card.id else { return Array(allPresets.prefix(4)) }
        var filtered: [WidgetPreset] = []
        for p in allPresets {
            let meio = p.meio_pagamento ?? "credito"
            if meio == "pix" || meio == "debito" {
                filtered.append(p)
            } else if p.cartao_id == cardId {
                filtered.append(p)
            }
            if filtered.count >= 4 { break }
        }
        if filtered.isEmpty { return Array(allPresets.prefix(4)) }
        return filtered
    }

    var limitePct: Double {
        guard let c = selectedCard, c.limite > 0 else { return 0 }
        return min(c.fatura_total / c.limite, 1.0)
    }

    var body: some View {
        VStack(spacing: 4) {
            // Card selector pills (only when 2+ cards)
            if allCartoes.count > 1 {
                let pills = Array(allCartoes.prefix(3))
                HStack(spacing: 4) {
                    ForEach(0..<pills.count, id: \.self) { idx in
                        let card = pills[idx]
                        let isSelected = card.id == selectedCard?.id
                        Link(destination: URL(string: "premiolab://widget-select-card/\(card.id ?? "")")!) {
                            Text(card.label)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(isSelected ? .plText : .plTextSec)
                                .lineLimit(1)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(isSelected ? Color.plAccent : Color.plCard)
                                .cornerRadius(10)
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal, 6)
            }

            // Card header
            if let c = selectedCard, c.id != nil {
                Link(destination: URL(string: "premiolab://fatura/\(c.id ?? "")")!) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            if allCartoes.count <= 1 {
                                Text(c.label)
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(.plTextSec)
                            }
                            Spacer()
                            if !c.vencimento.isEmpty {
                                Text("Venc \(c.vencimento)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(.plYellow)
                            }
                        }
                        Text(formatCurrency(c.fatura_total, moeda: moeda))
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundColor(.plText)
                        if c.limite > 0 {
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Color.plCard)
                                        .frame(height: 4)
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(limitePct > 0.9 ? Color.plRed : limitePct > 0.7 ? Color.plYellow : Color.plAccent)
                                        .frame(width: geo.size.width * limitePct, height: 4)
                                }
                            }
                            .frame(height: 4)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }
            } else if allPresets.count > 0 {
                Link(destination: URL(string: "premiolab://config-gastos")!) {
                    HStack {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 14))
                            .foregroundColor(.plAccent)
                        Text("Gastos R\u{00E1}pidos")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.plText)
                        Spacer()
                        Image(systemName: "gearshape")
                            .font(.system(size: 12))
                            .foregroundColor(.plTextSec)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }
            } else {
                Link(destination: URL(string: "premiolab://config-gastos")!) {
                    VStack(spacing: 6) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 22))
                            .foregroundColor(.plAccent)
                        Text("Configure gastos r\u{00E1}pidos")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.plTextSec)
                        Text("Toque para configurar")
                            .font(.system(size: 10))
                            .foregroundColor(.plTextSec.opacity(0.6))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                }
            }

            // Preset grid (filtered by selected card)
            if filteredPresets.count > 0 {
                let topRow = Array(filteredPresets.prefix(2))
                let bottomRow = filteredPresets.count > 2 ? Array(filteredPresets[2..<min(4, filteredPresets.count)]) : []

                VStack(spacing: 3) {
                    HStack(spacing: 3) {
                        ForEach(topRow) { preset in
                            PresetButtonView(preset: preset, moeda: moeda)
                        }
                        if topRow.count < 2 { Spacer() }
                    }
                    HStack(spacing: 3) {
                        ForEach(bottomRow) { preset in
                            PresetButtonView(preset: preset, moeda: moeda)
                        }
                        if bottomRow.count < 2 {
                            Link(destination: URL(string: "premiolab://add-gasto")!) {
                                VStack(spacing: 2) {
                                    Image(systemName: "plus")
                                        .font(.system(size: 14))
                                        .foregroundColor(.plAccent)
                                    Text("Outro")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(.plText)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color.plCard)
                                .cornerRadius(8)
                            }
                        }
                        if bottomRow.count < 1 {
                            Link(destination: URL(string: "premiolab://config-gastos")!) {
                                VStack(spacing: 2) {
                                    Image(systemName: "gearshape.fill")
                                        .font(.system(size: 14))
                                        .foregroundColor(.plTextSec)
                                    Text("Config")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(.plTextSec)
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color.plCard)
                                .cornerRadius(8)
                            }
                        }
                    }
                }
                .padding(.horizontal, 4)
            } else {
                Link(destination: URL(string: "premiolab://config-gastos")!) {
                    VStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 20))
                            .foregroundColor(.plAccent)
                        Text("Configure gastos r\u{00E1}pidos")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.plTextSec)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }

            if filteredPresets.count >= 4 {
                HStack(spacing: 4) {
                    Link(destination: URL(string: "premiolab://add-gasto")!) {
                        HStack(spacing: 4) {
                            Image(systemName: "plus").font(.system(size: 10))
                            Text("Outro").font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(.plAccent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(Color.plCard)
                        .cornerRadius(6)
                    }
                    Link(destination: URL(string: "premiolab://config-gastos")!) {
                        HStack(spacing: 4) {
                            Image(systemName: "gearshape.fill").font(.system(size: 10))
                            Text("Config").font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(.plTextSec)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(Color.plCard)
                        .cornerRadius(6)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .padding(6)
    }
}

struct QuickExpenseWidget: Widget {
    let kind: String = "QuickExpenseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickExpenseProvider()) { entry in
            QuickExpenseWidgetView(entry: entry)
                .containerBackground(Color.plBg, for: .widget)
        }
        .configurationDisplayName("Gastos R\u{00E1}pidos")
        .description("Registre gastos via cart\u{00E3}o, PIX ou d\u{00E9}bito")
        .supportedFamilies([.systemMedium])
    }
}

// ══════════════════════════════════════════════════════════════
// MARK: - Patrimonio Widget
// ══════════════════════════════════════════════════════════════

struct PatrimonioEntry: TimelineEntry {
    let date: Date
    let data: PatrimonioData?
}

struct PatrimonioProvider: TimelineProvider {
    func placeholder(in context: Context) -> PatrimonioEntry {
        PatrimonioEntry(date: Date(), data: PatrimonioData(
            total: 245000,
            rentabilidadeMes: 2.35,
            history: [
                HistoryPoint(d: "2026-02-01", v: 230000),
                HistoryPoint(d: "2026-02-08", v: 232000),
                HistoryPoint(d: "2026-02-15", v: 238000),
                HistoryPoint(d: "2026-02-22", v: 240000),
                HistoryPoint(d: "2026-03-01", v: 245000),
            ]
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (PatrimonioEntry) -> Void) {
        completion(PatrimonioEntry(date: Date(), data: loadPatrimonioData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PatrimonioEntry>) -> Void) {
        let entry = PatrimonioEntry(date: Date(), data: loadPatrimonioData())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct SparklineShape: Shape {
    let values: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard values.count > 1 else { return path }
        let minVal = values.min() ?? 0
        let maxVal = values.max() ?? 1
        let safeRange = (maxVal - minVal) > 0 ? (maxVal - minVal) : 1
        let stepX = rect.width / CGFloat(values.count - 1)

        for i in 0..<values.count {
            let x = CGFloat(i) * stepX
            let y = rect.height - (CGFloat((values[i] - minVal) / safeRange) * rect.height)
            if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
            else { path.addLine(to: CGPoint(x: x, y: y)) }
        }
        return path
    }
}

struct SparklineAreaShape: Shape {
    let values: [Double]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard values.count > 1 else { return path }
        let minVal = values.min() ?? 0
        let maxVal = values.max() ?? 1
        let safeRange = (maxVal - minVal) > 0 ? (maxVal - minVal) : 1
        let stepX = rect.width / CGFloat(values.count - 1)

        path.move(to: CGPoint(x: 0, y: rect.height))
        for i in 0..<values.count {
            let x = CGFloat(i) * stepX
            let y = rect.height - (CGFloat((values[i] - minVal) / safeRange) * rect.height)
            path.addLine(to: CGPoint(x: x, y: y))
        }
        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.closeSubpath()
        return path
    }
}

struct PatrimonioWidgetView: View {
    let entry: PatrimonioEntry
    @Environment(\.widgetFamily) var family

    var data: PatrimonioData? { entry.data }

    var rentColor: Color {
        guard let d = data else { return .plTextSec }
        return d.rentabilidadeMes >= 0 ? .plGreen : .plRed
    }

    var rentSign: String {
        guard let d = data else { return "" }
        return d.rentabilidadeMes >= 0 ? "+" : ""
    }

    var body: some View {
        if let d = data {
            Link(destination: URL(string: "premiolab://tab/home")!) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.system(size: 12))
                            .foregroundColor(.plAccent)
                        Text("PATRIM\u{00D4}NIO")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.plTextSec)
                            .tracking(1)
                        Spacer()
                        Text("\(rentSign)\(String(format: "%.1f", d.rentabilidadeMes))%")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundColor(rentColor)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(rentColor.opacity(0.15))
                            .cornerRadius(4)
                    }

                    Text(formatCompact(d.total))
                        .font(.system(size: family == .systemSmall ? 20 : 24, weight: .bold, design: .monospaced))
                        .foregroundColor(.plText)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)

                    if family == .systemMedium && d.history.count > 1 {
                        let vals = d.history.map { $0.v }
                        ZStack {
                            SparklineAreaShape(values: vals)
                                .fill(
                                    LinearGradient(
                                        gradient: Gradient(colors: [Color.plAccent.opacity(0.3), Color.plAccent.opacity(0.02)]),
                                        startPoint: .top, endPoint: .bottom
                                    )
                                )
                            SparklineShape(values: vals)
                                .stroke(Color.plAccent, lineWidth: 1.5)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .padding(.top, 2)
                    }

                    Spacer(minLength: 0)

                    Text("Rent. m\u{00EA}s")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.plTextSec.opacity(0.6))
                }
                .padding(12)
            }
        } else {
            Link(destination: URL(string: "premiolab://tab/home")!) {
                VStack(spacing: 8) {
                    Image(systemName: "chart.line.uptrend.xyaxis")
                        .font(.system(size: 28))
                        .foregroundColor(.plAccent.opacity(0.5))
                    Text("Abra o app para\ncarregar dados")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.plTextSec)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(12)
            }
        }
    }
}

struct PatrimonioWidget: Widget {
    let kind: String = "PatrimonioWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PatrimonioProvider()) { entry in
            PatrimonioWidgetView(entry: entry)
                .containerBackground(Color.plBg, for: .widget)
        }
        .configurationDisplayName("Patrim\u{00F4}nio")
        .description("Valor total e rentabilidade do m\u{00EA}s")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ══════════════════════════════════════════════════════════════
// MARK: - Heatmap Widget
// ══════════════════════════════════════════════════════════════

struct HeatmapEntry: TimelineEntry {
    let date: Date
    let data: HeatmapData?
}

struct HeatmapProvider: TimelineProvider {
    func placeholder(in context: Context) -> HeatmapEntry {
        HeatmapEntry(date: Date(), data: HeatmapData(positions: [
            HeatmapPosition(ticker: "PETR4", change: 2.35, valor: 45000),
            HeatmapPosition(ticker: "VALE3", change: -1.20, valor: 38000),
            HeatmapPosition(ticker: "ITUB4", change: 0.85, valor: 32000),
            HeatmapPosition(ticker: "BBDC4", change: -0.45, valor: 28000),
            HeatmapPosition(ticker: "WEGE3", change: 1.50, valor: 22000),
            HeatmapPosition(ticker: "RENT3", change: -2.10, valor: 18000),
            HeatmapPosition(ticker: "HGLG11", change: 0.30, valor: 15000),
            HeatmapPosition(ticker: "AAPL", change: 3.20, valor: 12000),
        ]))
    }

    func getSnapshot(in context: Context, completion: @escaping (HeatmapEntry) -> Void) {
        completion(HeatmapEntry(date: Date(), data: loadHeatmapData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HeatmapEntry>) -> Void) {
        let entry = HeatmapEntry(date: Date(), data: loadHeatmapData())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

func tileColor(_ change: Double) -> Color {
    let intensity = min(abs(change) / 5.0, 1.0)
    if change >= 0 {
        return Color(red: 34/255 * intensity, green: 197/255 * intensity, blue: 94/255 * intensity).opacity(0.3 + intensity * 0.5)
    } else {
        return Color(red: 239/255 * intensity, green: 68/255 * intensity, blue: 68/255 * intensity).opacity(0.3 + intensity * 0.5)
    }
}

struct HeatmapTileView: View {
    let position: HeatmapPosition

    var changeStr: String {
        let sign = position.change >= 0 ? "+" : ""
        return "\(sign)\(String(format: "%.1f", position.change))%"
    }

    var body: some View {
        VStack(spacing: 1) {
            Text(position.ticker)
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(changeStr)
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.9))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(tileColor(position.change))
        .cornerRadius(4)
    }
}

struct HeatmapWidgetView: View {
    let entry: HeatmapEntry

    var positions: [HeatmapPosition] { entry.data?.positions ?? [] }

    var body: some View {
        if positions.count > 0 {
            Link(destination: URL(string: "premiolab://tab/carteira")!) {
                VStack(spacing: 4) {
                    HStack {
                        Image(systemName: "square.grid.2x2.fill")
                            .font(.system(size: 11))
                            .foregroundColor(.plAccent)
                        Text("CARTEIRA")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.plTextSec)
                            .tracking(1)
                        Spacer()
                        Text("Varia\u{00E7}\u{00E3}o dia")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.plTextSec.opacity(0.6))
                    }
                    .padding(.horizontal, 2)

                    let topRow = Array(positions.prefix(4))
                    let bottomRow = positions.count > 4 ? Array(positions[4..<min(8, positions.count)]) : []

                    VStack(spacing: 3) {
                        HStack(spacing: 3) {
                            ForEach(0..<topRow.count, id: \.self) { i in
                                HeatmapTileView(position: topRow[i])
                            }
                            if topRow.count < 4 {
                                ForEach(0..<(4 - topRow.count), id: \.self) { _ in
                                    Color.plCard.opacity(0.3).cornerRadius(4)
                                }
                            }
                        }
                        if bottomRow.count > 0 {
                            HStack(spacing: 3) {
                                ForEach(0..<bottomRow.count, id: \.self) { i in
                                    HeatmapTileView(position: bottomRow[i])
                                }
                                if bottomRow.count < 4 {
                                    ForEach(0..<(4 - bottomRow.count), id: \.self) { _ in
                                        Color.plCard.opacity(0.3).cornerRadius(4)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(8)
            }
        } else {
            Link(destination: URL(string: "premiolab://tab/carteira")!) {
                VStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2")
                        .font(.system(size: 28))
                        .foregroundColor(.plAccent.opacity(0.5))
                    Text("Adicione ativos na\ncarteira para ver aqui")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.plTextSec)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(12)
            }
        }
    }
}

struct HeatmapWidget: Widget {
    let kind: String = "HeatmapWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HeatmapProvider()) { entry in
            HeatmapWidgetView(entry: entry)
                .containerBackground(Color.plBg, for: .widget)
        }
        .configurationDisplayName("Carteira Heatmap")
        .description("Varia\u{00E7}\u{00E3}o di\u{00E1}ria das principais posi\u{00E7}\u{00F5}es")
        .supportedFamilies([.systemMedium])
    }
}

// ══════════════════════════════════════════════════════════════
// MARK: - Vencimentos Widget
// ══════════════════════════════════════════════════════════════

struct VencimentosEntry: TimelineEntry {
    let date: Date
    let data: VencimentosData?
}

struct VencimentosProvider: TimelineProvider {
    func placeholder(in context: Context) -> VencimentosEntry {
        VencimentosEntry(date: Date(), data: VencimentosData(opcoes: [
            VencimentoOpcao(tipo: "CALL", ticker: "PETRH325", base: "PETR4", strike: 32.50, dte: 5,
                            direcao: "venda", premio: 1.25, quantidade: 200, spot: 33.88,
                            moneyness: "ITM", distPct: 4.25, marketPrice: 0.82, bid: 0.78, ask: 0.85,
                            plTotal: 86.00, plPct: 34.4),
            VencimentoOpcao(tipo: "PUT", ticker: "VALET280", base: "VALE3", strike: 58.00, dte: 12,
                            direcao: "venda", premio: 0.95, quantidade: 100, spot: 55.20,
                            moneyness: "OTM", distPct: -4.83, marketPrice: 1.10, bid: 1.05, ask: 1.15,
                            plTotal: -15.00, plPct: -15.8),
        ]))
    }

    func getSnapshot(in context: Context, completion: @escaping (VencimentosEntry) -> Void) {
        completion(VencimentosEntry(date: Date(), data: loadVencimentosData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VencimentosEntry>) -> Void) {
        let entry = VencimentosEntry(date: Date(), data: loadVencimentosData())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

func dteColor(_ dte: Int) -> Color {
    if dte <= 7 { return .plRed }
    if dte <= 15 { return .plYellow }
    return .plGreen
}

struct VencimentoRowView: View {
    let opcao: VencimentoOpcao

    var tipoColor: Color { opcao.tipo == "CALL" ? .plAccent : .plYellow }
    var isVenda: Bool { (opcao.direcao ?? "venda") == "venda" }
    var dirLabel: String { isVenda ? "V" : "C" }
    var dirColor: Color { isVenda ? .plYellow : .plCyan }

    var moneynessColor: Color {
        guard let m = opcao.moneyness else { return .plTextSec }
        if m == "ATM" { return .plYellow }
        if m == "ITM" { return isVenda ? .plRed : .plGreen }
        return isVenda ? .plGreen : .plRed
    }

    var plColor: Color {
        guard let pl = opcao.plTotal else { return .plTextSec }
        return pl >= 0 ? .plGreen : .plRed
    }

    var body: some View {
        // Single compact line: [V] [CALL] PETR4 K32.50  [5d]  R$+86
        HStack(spacing: 3) {
            Text(dirLabel)
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(dirColor)
                .padding(.horizontal, 2)
                .padding(.vertical, 1)
                .background(dirColor.opacity(0.15))
                .cornerRadius(3)

            Text(opcao.tipo)
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(tipoColor)
                .padding(.horizontal, 2)
                .padding(.vertical, 1)
                .background(tipoColor.opacity(0.15))
                .cornerRadius(3)

            Text(opcao.base)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.plText)
                .lineLimit(1)

            Text("K\(String(format: "%.2f", opcao.strike))")
                .font(.system(size: 8, weight: .medium, design: .monospaced))
                .foregroundColor(.plTextSec)
                .lineLimit(1)

            if let qty = opcao.quantidade, qty > 0 {
                Text("\(String(format: "%.0f", qty))x")
                    .font(.system(size: 8, weight: .medium, design: .monospaced))
                    .foregroundColor(.plTextSec.opacity(0.7))
            }

            Spacer(minLength: 2)

            Text("\(opcao.dte)d")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(dteColor(opcao.dte))
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background(dteColor(opcao.dte).opacity(0.15))
                .cornerRadius(3)

            if let pl = opcao.plTotal {
                let sign = pl >= 0 ? "+" : ""
                Text("R$\(sign)\(String(format: "%.0f", pl))")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(plColor)
                    .lineLimit(1)
            } else {
                Text("--")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.plTextSec.opacity(0.5))
            }
        }
    }
}

struct VencimentosWidgetView: View {
    let entry: VencimentosEntry

    var opcoes: [VencimentoOpcao] { Array((entry.data?.opcoes ?? []).prefix(3)) }

    var body: some View {
        if opcoes.count > 0 {
            Link(destination: URL(string: "premiolab://tab/opcoes")!) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Image(systemName: "clock.badge.exclamationmark")
                            .font(.system(size: 10))
                            .foregroundColor(.plAccent)
                        Text("VENCIMENTOS")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(.plTextSec)
                            .tracking(1)
                        Spacer()
                        Text("Pr\u{00F3}ximas op\u{00E7}\u{00F5}es")
                            .font(.system(size: 8, weight: .medium))
                            .foregroundColor(.plTextSec.opacity(0.6))
                    }

                    ForEach(0..<opcoes.count, id: \.self) { i in
                        VencimentoRowView(opcao: opcoes[i])
                        if i < opcoes.count - 1 {
                            Divider().background(Color.plTextSec.opacity(0.15))
                        }
                    }

                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
            }
        } else {
            Link(destination: URL(string: "premiolab://tab/opcoes")!) {
                VStack(spacing: 8) {
                    Image(systemName: "clock")
                        .font(.system(size: 28))
                        .foregroundColor(.plAccent.opacity(0.5))
                    Text("Nenhuma op\u{00E7}\u{00E3}o ativa")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.plTextSec)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(12)
            }
        }
    }
}

struct VencimentosWidget: Widget {
    let kind: String = "VencimentosWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VencimentosProvider()) { entry in
            VencimentosWidgetView(entry: entry)
                .containerBackground(Color.plBg, for: .widget)
        }
        .configurationDisplayName("Vencimentos")
        .description("Pr\u{00F3}ximas op\u{00E7}\u{00F5}es a vencer com DTE")
        .supportedFamilies([.systemMedium])
    }
}

// ══════════════════════════════════════════════════════════════
// MARK: - Renda Widget
// ══════════════════════════════════════════════════════════════

struct RendaEntry: TimelineEntry {
    let date: Date
    let data: RendaData?
}

struct RendaProvider: TimelineProvider {
    func placeholder(in context: Context) -> RendaEntry {
        RendaEntry(date: Date(), data: RendaData(totalMes: 4250, meta: 6000, totalMesAnterior: 3800))
    }

    func getSnapshot(in context: Context, completion: @escaping (RendaEntry) -> Void) {
        completion(RendaEntry(date: Date(), data: loadRendaData()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RendaEntry>) -> Void) {
        let entry = RendaEntry(date: Date(), data: loadRendaData())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct RendaWidgetView: View {
    let entry: RendaEntry

    var data: RendaData? { entry.data }

    var progressPct: Double {
        guard let d = data, d.meta > 0 else { return 0 }
        return min(d.totalMes / d.meta, 1.0)
    }

    var comparePct: Double {
        guard let d = data, d.totalMesAnterior > 0 else { return 0 }
        return ((d.totalMes - d.totalMesAnterior) / d.totalMesAnterior) * 100
    }

    var compareColor: Color { comparePct >= 0 ? .plGreen : .plRed }
    var compareSign: String { comparePct >= 0 ? "+" : "" }

    var body: some View {
        if let d = data {
            Link(destination: URL(string: "premiolab://tab/renda")!) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Image(systemName: "banknote")
                            .font(.system(size: 11))
                            .foregroundColor(.plGreen)
                        Text("RENDA")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.plTextSec)
                            .tracking(1)
                        Spacer()
                    }

                    Text(formatCurrency(d.totalMes))
                        .font(.system(size: 20, weight: .bold, design: .monospaced))
                        .foregroundColor(.plText)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(Color.plCard)
                                .frame(height: 6)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(progressPct >= 1.0 ? Color.plGreen : Color.plAccent)
                                .frame(width: geo.size.width * progressPct, height: 6)
                        }
                    }
                    .frame(height: 6)

                    HStack {
                        Text("\(Int(progressPct * 100))% da meta")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.plTextSec)
                        Spacer()
                        if d.totalMesAnterior > 0 {
                            Text("\(compareSign)\(String(format: "%.0f", comparePct))%")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(compareColor)
                        }
                    }

                    Spacer(minLength: 0)
                }
                .padding(12)
            }
        } else {
            Link(destination: URL(string: "premiolab://tab/renda")!) {
                VStack(spacing: 8) {
                    Image(systemName: "banknote")
                        .font(.system(size: 28))
                        .foregroundColor(.plGreen.opacity(0.5))
                    Text("Abra o app para\ncarregar dados")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.plTextSec)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(12)
            }
        }
    }
}

struct RendaWidget: Widget {
    let kind: String = "RendaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RendaProvider()) { entry in
            RendaWidgetView(entry: entry)
                .containerBackground(Color.plBg, for: .widget)
        }
        .configurationDisplayName("Renda do M\u{00EA}s")
        .description("Renda mensal com progresso da meta")
        .supportedFamilies([.systemSmall])
    }
}

// ══════════════════════════════════════════════════════════════
// MARK: - Widget Bundle
// ══════════════════════════════════════════════════════════════

@main
struct PremioLabWidgetBundle: WidgetBundle {
    var body: some Widget {
        QuickExpenseWidget()
        PatrimonioWidget()
        HeatmapWidget()
        VencimentosWidget()
        RendaWidget()
    }
}
