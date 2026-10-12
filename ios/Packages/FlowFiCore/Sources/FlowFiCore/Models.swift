public enum BusinessUse: String, Sendable, CaseIterable, Codable {
    case business, personal, mixed, unknown
}

public struct Workspace: Sendable, Codable {
    public let id: String
    public let name: String
    public let asOf: ISODate
    public let syncedAt: String
    public let safetyFloorMinor: Minor
    public let reserveTargetMinor: Minor
}

public struct FinancialAccount: Sendable, Codable, Identifiable {
    public enum Kind: String, Sendable, Codable { case depository, credit }
    public enum Role: String, Sendable, Codable { case operating, reserve }
    public let id: String
    public let name: String
    public let mask: String
    public let type: Kind
    public let subtype: String
    /// Depository: cleared balance. Credit: amount owed.
    public let balanceMinor: Minor
    public let role: Role?
}

public struct Transaction: Sendable, Codable, Identifiable, Equatable {
    public enum Kind: String, Sendable, Codable { case income, expense, transfer, cardPayment }
    public let id: String
    public let accountId: String
    public let providerTransactionId: String
    /// Positive = money in, negative = money out.
    public let amountMinor: Minor
    public let occurredAt: ISODate
    public let pending: Bool
    public let merchantName: String
    public let description: String?
    public var category: String
    public let kind: Kind
    public var businessUse: BusinessUse
    public let source: String
    public let syncedAt: String
}

public enum InvoiceStatus: String, Sendable, Codable { case open, paid, partial, late, disputed }

public struct Invoice: Sendable, Codable, Identifiable, Equatable {
    public let id: String
    public let number: String
    public let client: String
    public let amountMinor: Minor
    public let issuedAt: ISODate
    public let dueDate: ISODate
    public var status: InvoiceStatus
    public let paidAt: ISODate?
    public var expectedDate: ISODate?
    public var confidence: Double?
    public var followUpDraftId: String?
}

public struct CashObligation: Sendable, Codable, Identifiable {
    public let id: String
    public let name: String
    public let amountMinor: Minor
    public let expectedDate: ISODate
    public let note: String?
}

public struct RecurringStream: Sendable, Codable, Identifiable, Equatable {
    public enum Direction: String, Sendable, Codable { case inflow, outflow }
    public var id: String { key }
    public let key: String
    public let merchant: String
    public let direction: Direction
    public let anchorDay: Int
    public let expectedAmountMinor: Minor
    public let previousAmountMinor: Minor
    public let lastDate: ISODate
    public let nextDate: ISODate
    public let occurrences: Int
    public let confidence: Double
    public let category: String
    public let transactionIds: [String]
}

public struct DemoData: Sendable {
    public let workspace: Workspace
    public let accounts: [FinancialAccount]
    public let transactions: [Transaction]
    public let invoices: [Invoice]
    public let obligations: [CashObligation]
}
