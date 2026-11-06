// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE.
// GlydriftStore — StoreKit 2 bridge for the Glydrift Capacitor app (Drift Pass+).
//
// Add this file to the iOS app target (App/App), then register it in your bridge view
// controller (see ios-plugin/README.md). The web game calls it as registerPlugin("GlydriftStore").
//
//   purchase({ productId, appAccountToken }) → { transactionId, productId } | { cancelled: true }
//   restore() → { transactions: [{ transactionId, productId }] }
//
// The game never trusts this result on its own: it sends the transaction id to the Supabase
// Edge Function "verify-purchase", which asks Apple's App Store Server API before unlocking.
import Capacitor
import StoreKit

@objc(GlydriftStorePlugin)
public class GlydriftStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GlydriftStorePlugin"
    public let jsName = "GlydriftStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }
        // ties the purchase to the player's account (checked again on the server)
        let token = call.getString("appAccountToken").flatMap { UUID(uuidString: $0) }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("Drift Pass+ isn't available in the App Store right now.")
                    return
                }
                var options: Set<Product.PurchaseOption> = []
                if let token { options.insert(.appAccountToken(token)) }
                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // non-consumable: it stays in Transaction.currentEntitlements for RESTORE
                        await transaction.finish()
                        call.resolve([
                            "transactionId": String(transaction.id),
                            "productId": transaction.productID,
                        ])
                    case .unverified(_, let error):
                        call.reject("The App Store couldn't verify this purchase: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["cancelled": true])
                case .pending:
                    // Ask to Buy / payment approval: it arrives later via RESTORE PURCHASES
                    call.resolve(["cancelled": true, "pending": true])
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task {
            try? await AppStore.sync() // refreshes the receipt (may ask the player to sign in)
            var list: [[String: Any]] = []
            for await result in Transaction.currentEntitlements {
                if case .verified(let transaction) = result, transaction.revocationDate == nil {
                    list.append([
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID,
                    ])
                }
            }
            call.resolve(["transactions": list])
        }
    }
}
