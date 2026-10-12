import Testing
@testable import FlowFiCore

/// The Swift engine must reproduce the web engine's numbers exactly
/// (same fixture, same rules). Values below come from tests/core.test.ts.
@Suite struct ParityTests {
    let s = Engine.snapshot()

    @Test func startsAt12180() { #expect(s.availableMinor == 1_218_000) }
    @Test func datasetMatchesWeb() {
        #expect(s.transactions.count == 168)
        #expect(s.transactions.first?.id == "txn_0168")
    }
    @Test func baseBreachesOnOct23() {
        #expect(s.base.breach?.firstDate == "2026-10-23")
        #expect(s.base.minPoint.balanceMinor == 483_668)
        #expect(s.base.variableDailyMinor == 3_803)
        #expect(s.base.endBalanceMinor == 1_556_811)
    }
    @Test func driversMatch() {
        #expect(s.base.drivers.map(\.impactMinor) == [-680_000, -520_000, -396_000, -41_833])
        #expect(s.base.drivers[0].name == "INV-104 expected Oct 30, due Oct 20")
    }
    @Test func flowScoreMatches() {
        #expect(s.flowScore.score == 47)
        #expect(s.flowScore.band == "Watch")
        #expect(s.flowScore.factors.map(\.points) == [9, 20, 0, 9, 3, 6])
    }
    @Test func onTimeScenario() {
        let t = Engine.snapshot(SnapshotOptions(assumptions: [.invoiceOnDue(invoiceId: "inv_104")]))
        #expect(t.base.breach == nil)
        #expect(t.base.minPoint.balanceMinor == 1_163_668)
        #expect(t.flowScore.score == 63)
    }
    @Test func scenariosAreOrdered() {
        for i in s.base.points.indices {
            #expect(s.forecasts[.conservative]!.points[i].balanceMinor <= s.base.points[i].balanceMinor)
            #expect(s.forecasts[.optimistic]!.points[i].balanceMinor >= s.base.points[i].balanceMinor)
        }
        #expect(s.forecasts[.conservative]!.minPoint.balanceMinor == 473_207)
        #expect(s.forecasts[.optimistic]!.minPoint.balanceMinor == 489_938)
    }
    @Test func alertsMatch() {
        #expect(s.alerts.map(\.kind) == [.cashThreshold, .invoiceRisk, .unusualSpending, .subscriptionIncrease, .taxReserveGap])
        #expect(Engine.snapshot(SnapshotOptions(simulateStale: true)).alerts.first?.kind == .syncStale)
    }
    @Test func spendingMatches() {
        #expect(s.spending.currentMinor == 510_580)
        #expect(s.spending.previousMinor == 113_610)
        #expect(s.spending.changePct == 349.4)
    }
}
