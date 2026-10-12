import Foundation
import LocalAuthentication
import Security

/// Native security boundary (spec §10): Keychain-backed secrets + device
/// authentication. Never stores provider access tokens — only local app state
/// appropriate to the client. Does not use the Secure Enclave directly.
final class FlowFiSecureVault: @unchecked Sendable {
    private let service = "dev.roszhan.flowfi.vault"
    private static let lockKey = "app_lock_enabled"
    private static let installKey = "install_secret"

    enum Biometry: String { case faceID = "Face ID", touchID = "Touch ID", opticID = "Optic ID", passcodeOnly = "Device passcode", none = "Unavailable" }

    init() {
        // A per-install random secret proves the Keychain round-trip and could
        // wrap local caches. It never leaves the device.
        if getSecret(Self.installKey) == nil {
            var bytes = [UInt8](repeating: 0, count: 32)
            _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
            setSecret(Self.installKey, Data(bytes).base64EncodedString())
        }
    }

    // MARK: Keychain

    @discardableResult
    func setSecret(_ key: String, _ value: String) -> Bool {
        deleteSecret(key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    func getSecret(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    func deleteSecret(_ key: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        let s = SecItemDelete(query as CFDictionary)
        return s == errSecSuccess || s == errSecItemNotFound
    }

    var hasInstallSecret: Bool { getSecret(Self.installKey) != nil }

    var appLockEnabled: Bool {
        get { getSecret(Self.lockKey) == "1" }
        set { if newValue { setSecret(Self.lockKey, "1") } else { deleteSecret(Self.lockKey) } }
    }

    // MARK: LocalAuthentication

    func biometricAvailability() -> Biometry {
        let ctx = LAContext()
        var err: NSError?
        if ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) {
            switch ctx.biometryType {
            case .faceID: return .faceID
            case .touchID: return .touchID
            case .opticID: return .opticID
            default: break
            }
        }
        return ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) ? .passcodeOnly : .none
    }

    /// Fails closed: any error or cancellation returns false.
    func authenticate(reason: String) async -> Bool {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Use Passcode"
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return false }
        do { return try await ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) }
        catch { return false }
    }
}
