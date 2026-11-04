# GlydriftStore (StoreKit 2) — iOS app setup

1. `npm run ios:add` (first time) and open the project with `npm run ios:open`.
2. Drag `GlydriftStorePlugin.swift` into **App/App** (target: App, "Copy items if needed").
3. Register the plugin: add `MyViewController.swift` to App/App:

   ```swift
   import Capacitor

   class MyViewController: CAPBridgeViewController {
       override open func capacitorDidLoad() {
           bridge?.registerPluginInstance(GlydriftStorePlugin())
       }
   }
   ```

   In `Main.storyboard`, select the Bridge View Controller and set its **Custom Class** to
   `MyViewController`.
4. Xcode → target App → **Signing & Capabilities** → add **In-App Purchase** and
   **Sign in with Apple**.
5. Sign in with Apple also needs the community plugin's native side:
   `npm i @capacitor-community/apple-sign-in && npx cap sync ios` (the game calls it as
   `SignInWithApple`; nothing else to code).

See `docs/ACCOUNTS_AND_PASS_SETUP.md` for App Store Connect and Supabase.
