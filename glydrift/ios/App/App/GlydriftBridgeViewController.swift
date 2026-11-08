import Capacitor
import UIKit

/// The Capacitor web view host for Glydrift. Registers the app's own native plugin
/// (GlydriftStore, StoreKit 2 for Drift Pass+ — source in glydrift/ios-plugin/) and keeps the
/// game full screen with no status bar.
class GlydriftBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GlydriftStorePlugin())
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }
}
