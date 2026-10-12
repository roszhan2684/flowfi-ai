import type { ISODate } from "./dates";
import type { Minor } from "./money";

export type BusinessUse = "business" | "personal" | "mixed" | "unknown";

export type Workspace = {
  id: string;
  name: string;
  type: "freelancer" | "small_business";
  currency: "USD";
  timezone: string;
  asOf: ISODate;
  syncedAt: string;
  safetyFloorMinor: Minor;
  reserveTargetMinor: Minor;
  fictional: true;
};

export type FinancialAccount = {
  id: string;
  workspaceId: string;
  provider: "demo" | "plaid";
  name: string;
  mask: string;
  type: "depository" | "credit";
  subtype: "checking" | "savings" | "credit card";
  /** For depository: cleared balance. For credit: amount owed. */
  balanceMinor: Minor;
  role?: "operating" | "reserve";
};

export type NormalizedTransaction = {
  id: string;
  workspaceId: string;
  accountId: string;
  provider: "plaid" | "demo";
  providerTransactionId: string;
  /** Positive = money in, negative = money out (from the account holder's view). */
  amountMinor: Minor;
  currency: "USD";
  occurredAt: ISODate;
  pending: boolean;
  merchantName: string;
  description?: string;
  category: string;
  kind: "income" | "expense" | "transfer" | "card_payment";
  businessUse: BusinessUse;
  provenance: { source: string; syncedAt: string };
};

export type InvoiceStatus = "open" | "paid" | "partial" | "late" | "disputed";

export type Invoice = {
  id: string;
  number: string;
  workspaceId: string;
  client: string;
  amountMinor: Minor;
  issuedAt: ISODate;
  dueDate: ISODate;
  status: InvoiceStatus;
  paidAt?: ISODate;
  /** Filled by the late-risk heuristic for open invoices. */
  expectedDate?: ISODate;
  confidence?: number;
  followUpDraftId?: string;
};

export type CashObligation = {
  id: string;
  name: string;
  amountMinor: Minor;
  expectedDate: ISODate;
  kind: "card_payment" | "bill" | "contractor" | "tax";
  note?: string;
};

export type RecurringStream = {
  key: string;
  merchant: string;
  direction: "inflow" | "outflow";
  cadence: "monthly";
  anchorDay: number;
  expectedAmountMinor: Minor;
  previousAmountMinor: Minor;
  lastDate: ISODate;
  nextDate: ISODate;
  occurrences: number;
  confidence: number;
  category: string;
  transactionIds: string[];
};
