import WidgetKit
import SwiftUI

// MARK: - Data Model

struct WidgetPreset: Codable, Identifiable {
    let id: String
    let label: String
    let valor: Double
    let icone: String
    let cartao_id: String?
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
    let presets: [WidgetPreset]
    let updated_at: String?
}

// MARK: - Timeline Entry

struct QuickExpenseEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

// MARK: - Helpers

func formatCurrency(_ value: Double, moeda: String) -> String {
    let symbol: String
    switch moeda {
    case "USD": symbol = "US$"
    case "EUR": symbol = "€"
    case "GBP": symbol = "£"
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

func iconForPreset(_ ionicon: String) -> String {
    // Map Ionicons names to SF Symbols
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

// MARK: - Data Loading

func loadWidgetData() -> WidgetData {
    let defaults = UserDefaults(suiteName: "group.com.premiotrader.app.data")
    guard let jsonStr = defaults?.string(forKey: "widgetData"),
          let jsonData = jsonStr.data(using: .utf8) else {
        return WidgetData(
            cartao: nil,
            presets: [],
            updated_at: nil
        )
    }

    do {
        let decoded = try JSONDecoder().decode(WidgetData.self, from: jsonData)
        return decoded
    } catch {
        return WidgetData(cartao: nil, presets: [], updated_at: nil)
    }
}

// MARK: - Timeline Provider

struct QuickExpenseProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickExpenseEntry {
        QuickExpenseEntry(date: Date(), data: WidgetData(
            cartao: WidgetCartao(id: nil, label: "VISA ••1234", fatura_total: 2350.00, limite: 5000, vencimento: "10/04", moeda: "BRL"),
            presets: [
                WidgetPreset(id: "1", label: "Almoço", valor: 35.0, icone: "restaurant-outline", cartao_id: nil),
                WidgetPreset(id: "2", label: "Café", valor: 8.0, icone: "cafe-outline", cartao_id: nil),
                WidgetPreset(id: "3", label: "Uber", valor: 25.0, icone: "car-outline", cartao_id: nil),
                WidgetPreset(id: "4", label: "Mercado", valor: 150.0, icone: "cart-outline", cartao_id: nil),
            ],
            updated_at: nil
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (QuickExpenseEntry) -> Void) {
        let data = loadWidgetData()
        completion(QuickExpenseEntry(date: Date(), data: data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickExpenseEntry>) -> Void) {
        let data = loadWidgetData()
        let entry = QuickExpenseEntry(date: Date(), data: data)
        // Refresh every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - Widget Views

struct PresetButtonView: View {
    let preset: WidgetPreset
    let moeda: String

    var body: some View {
        Link(destination: URL(string: "premiolab://gasto-rapido/\(preset.id)")!) {
            VStack(spacing: 2) {
                Image(systemName: iconForPreset(preset.icone))
                    .font(.system(size: 16))
                    .foregroundColor(Color("AccentColor"))
                Text(preset.label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Color("TextPrimary"))
                    .lineLimit(1)
                Text(formatCurrency(preset.valor, moeda: moeda))
                    .font(.system(size: 9, weight: .regular, design: .monospaced))
                    .foregroundColor(Color("TextSecondary"))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color("CardBg"))
            .cornerRadius(8)
        }
    }
}

struct QuickExpenseWidgetView: View {
    let entry: QuickExpenseEntry

    var cartao: WidgetCartao? { entry.data.cartao }
    var presets: [WidgetPreset] { entry.data.presets }
    var moeda: String { cartao?.moeda ?? "BRL" }

    var limitePct: Double {
        guard let c = cartao, c.limite > 0 else { return 0 }
        return min(c.fatura_total / c.limite, 1.0)
    }

    var body: some View {
        VStack(spacing: 4) {
            // ── Header: Fatura info ──
            if let c = cartao, c.id != nil {
                Link(destination: URL(string: "premiolab://fatura/\(c.id ?? "")")!) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(c.label)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(Color("TextSecondary"))
                            Spacer()
                            if !c.vencimento.isEmpty {
                                Text("Venc \(c.vencimento)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Color("YellowColor"))
                            }
                        }
                        Text(formatCurrency(c.fatura_total, moeda: moeda))
                            .font(.system(size: 18, weight: .bold, design: .monospaced))
                            .foregroundColor(Color("TextPrimary"))
                        if c.limite > 0 {
                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Color("CardBg"))
                                        .frame(height: 4)
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(limitePct > 0.9 ? Color("RedColor") : limitePct > 0.7 ? Color("YellowColor") : Color("AccentColor"))
                                        .frame(width: geo.size.width * limitePct, height: 4)
                                }
                            }
                            .frame(height: 4)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }
            } else {
                // No card configured
                Text("Configure um cartão")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color("TextSecondary"))
                    .padding(.vertical, 6)
            }

            // ── Presets Grid 2x2 ──
            if presets.count > 0 {
                let topRow = Array(presets.prefix(2))
                let bottomRow = presets.count > 2 ? Array(presets[2..<min(4, presets.count)]) : []

                VStack(spacing: 3) {
                    HStack(spacing: 3) {
                        ForEach(topRow) { preset in
                            PresetButtonView(preset: preset, moeda: moeda)
                        }
                        if topRow.count < 2 {
                            Spacer()
                        }
                    }
                    HStack(spacing: 3) {
                        ForEach(bottomRow) { preset in
                            PresetButtonView(preset: preset, moeda: moeda)
                        }
                        // Fill remaining with Outro / Config
                        if bottomRow.count < 2 {
                            Link(destination: URL(string: "premiolab://add-gasto")!) {
                                VStack(spacing: 2) {
                                    Image(systemName: "plus")
                                        .font(.system(size: 14))
                                        .foregroundColor(Color("AccentColor"))
                                    Text("Outro")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(Color("TextPrimary"))
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color("CardBg"))
                                .cornerRadius(8)
                            }
                        }
                        if bottomRow.count < 1 {
                            Link(destination: URL(string: "premiolab://config-gastos")!) {
                                VStack(spacing: 2) {
                                    Image(systemName: "gearshape.fill")
                                        .font(.system(size: 14))
                                        .foregroundColor(Color("TextSecondary"))
                                    Text("Config")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(Color("TextSecondary"))
                                }
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Color("CardBg"))
                                .cornerRadius(8)
                            }
                        }
                    }
                }
                .padding(.horizontal, 4)
            } else {
                // No presets — show CTA
                Link(destination: URL(string: "premiolab://config-gastos")!) {
                    VStack(spacing: 4) {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 20))
                            .foregroundColor(Color("AccentColor"))
                        Text("Configure gastos rápidos")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color("TextSecondary"))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }

            // ── Footer: Outro + Config (when 4 presets fill the grid) ──
            if presets.count >= 4 {
                HStack(spacing: 4) {
                    Link(destination: URL(string: "premiolab://add-gasto")!) {
                        HStack(spacing: 4) {
                            Image(systemName: "plus")
                                .font(.system(size: 10))
                            Text("Outro")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(Color("AccentColor"))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(Color("CardBg"))
                        .cornerRadius(6)
                    }
                    Link(destination: URL(string: "premiolab://config-gastos")!) {
                        HStack(spacing: 4) {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 10))
                            Text("Config")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundColor(Color("TextSecondary"))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 4)
                        .background(Color("CardBg"))
                        .cornerRadius(6)
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .padding(6)
    }
}

// MARK: - Widget Configuration

@main
struct PremioLabWidget: Widget {
    let kind: String = "PremioLabWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickExpenseProvider()) { entry in
            QuickExpenseWidgetView(entry: entry)
                .containerBackground(Color("WidgetBackground"), for: .widget)
        }
        .configurationDisplayName("PremioLab Gastos")
        .description("Registre gastos rapidamente no cartão de crédito")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Preview

struct PremioLabWidget_Previews: PreviewProvider {
    static var previews: some View {
        QuickExpenseWidgetView(entry: QuickExpenseEntry(
            date: Date(),
            data: WidgetData(
                cartao: WidgetCartao(id: "123", label: "VISA ••1234", fatura_total: 2350.00, limite: 5000, vencimento: "10/04", moeda: "BRL"),
                presets: [
                    WidgetPreset(id: "1", label: "Almoço", valor: 35.0, icone: "restaurant-outline", cartao_id: nil),
                    WidgetPreset(id: "2", label: "Café", valor: 8.0, icone: "cafe-outline", cartao_id: nil),
                    WidgetPreset(id: "3", label: "Uber", valor: 25.0, icone: "car-outline", cartao_id: nil),
                    WidgetPreset(id: "4", label: "Mercado", valor: 150.0, icone: "cart-outline", cartao_id: nil),
                ],
                updated_at: nil
            )
        ))
        .previewContext(WidgetPreviewContext(family: .systemMedium))
    }
}
