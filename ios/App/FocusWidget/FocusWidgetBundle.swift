//
//  FocusWidgetBundle.swift
//
//  Entry point of the FocusWidget extension. It holds one thing: the focus
//  Live Activity. There is no home-screen widget here on purpose — the lock
//  screen and the Dynamic Island are where a running timer belongs.
//
//  The extension's deployment target is iOS 16.2 (see docs/LIVE-ACTIVITIES.md),
//  so nothing in it needs an availability check. The APP still runs on 13.
//

import SwiftUI
import WidgetKit

@main
struct FocusWidgetBundle: WidgetBundle {
    var body: some Widget {
        FocusLiveActivity()
    }
}
