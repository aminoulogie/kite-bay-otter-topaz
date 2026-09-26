//
//  SomaBridgeViewController.swift
//
//  The stock Capacitor view controller, plus the one thing it cannot do on its
//  own: register a plugin that lives in this project rather than in an npm
//  package. Main.storyboard points at this class instead of
//  CAPBridgeViewController for exactly that reason.
//

import UIKit
import Capacitor

class SomaBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SomaFocusPlugin())
    }
}
