import Capacitor
import UIKit

/**
 * The app's root view controller. Exists only to register plugins that live
 * inside this project rather than in an npm package — FaceDepthPlugin — since
 * Capacitor discovers packaged plugins automatically but local ones must be
 * handed to the bridge here.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FaceDepthPlugin())
    }
}
