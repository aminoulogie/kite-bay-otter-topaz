# Build the SOMA 1.1.0 IPA

This Linux environment cannot run `xcodebuild`. Sync on a Mac, then Archive.

```bash
git clone -b grok-version https://github.com/aminoulogie/kite-bay-otter-topaz.git soma
cd soma
npm install
npm run ios:sync
cd ios/App
pod install
open App.xcworkspace
```

Xcode: team signing, bundle `io.github.aminoulogie.soma`, version **1.1.0**, Product → Archive → Distribute.
After install, clear old site data so the demo 2300 kcal weeks are gone.
