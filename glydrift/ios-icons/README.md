# Glydrift app icon (iOS)

`AppIcon.appiconset/` holds every iPhone and iPad icon slot, plus the 1024×1024 App Store icon. Each one is made from the same 32×32 pixel art (`marketing/icon/glydrift-icon-32-source.png`), so it's crisp at every size. All are RGB PNGs with no transparency and square corners, because iOS rounds the corners itself.

**In Xcode**, after `npx cap add ios` / `npx cap sync ios`:

1. In Finder, open `ios/App/App/Assets.xcassets/`.
2. Replace the `AppIcon.appiconset` folder there with this one.
3. In Xcode, check **App → Assets → AppIcon**: every slot should be filled. Build.

The web icons (favicon, home-screen and Android maskable icons) are in `public/` and ship with the site.
