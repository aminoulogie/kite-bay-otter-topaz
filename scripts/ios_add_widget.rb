# Adds the SomaWidgets home-screen widget extension to the Xcode project.
#
# Run once; the result is committed. Kept so the target can be rebuilt the
# same way if the project is ever regenerated. Idempotent: does nothing when
# the target is already there.
#
#   gem install xcodeproj && ruby scripts/ios_add_widget.rb
require "xcodeproj"

path = File.expand_path("../ios/App/App.xcodeproj", __dir__)
project = Xcodeproj::Project.open(path)
if project.targets.any? { |t| t.name == "SomaWidgets" }
  puts "SomaWidgets already present"
  exit 0
end

app = project.targets.find { |t| t.name == "App" } or abort("no App target")
app_id = app.build_configurations.first.build_settings["PRODUCT_BUNDLE_IDENTIFIER"]

widget = project.new_target(:app_extension, "SomaWidgets", :ios, "16.0", nil, :swift)

group = project.main_group.new_group("SomaWidgets", "SomaWidgets")
store = group.new_reference("RingsStore.swift")
views = group.new_reference("SomaWidgets.swift")
group.new_reference("Info.plist")
group.new_reference("SomaWidgets.entitlements")
widget.add_file_references([store, views])
widget.add_system_frameworks(%w[WidgetKit SwiftUI])

# The app writes what the widget reads, through the same code.
app_group = project.main_group.children.find { |g| g.respond_to?(:path) && g.path == "App" } or abort("no App group")
bridge = app_group.new_reference("WidgetBridgePlugin.swift")
app_group.new_reference("App.entitlements")
app.add_file_references([bridge, store])

widget.build_configurations.each do |c|
  s = c.build_settings
  s["PRODUCT_BUNDLE_IDENTIFIER"] = "#{app_id}.widgets"
  s["PRODUCT_NAME"] = "$(TARGET_NAME)"
  s["INFOPLIST_FILE"] = "SomaWidgets/Info.plist"
  s["GENERATE_INFOPLIST_FILE"] = "NO"
  s["CODE_SIGN_ENTITLEMENTS"] = "SomaWidgets/SomaWidgets.entitlements"
  s["SWIFT_VERSION"] = "5.0"
  s["TARGETED_DEVICE_FAMILY"] = "1,2"
  s["IPHONEOS_DEPLOYMENT_TARGET"] = "16.0"
  s["SKIP_INSTALL"] = "YES"
  s["APPLICATION_EXTENSION_API_ONLY"] = "YES"
  s["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"]
  s["MARKETING_VERSION"] = "1.0"
  s["CURRENT_PROJECT_VERSION"] = "1"
  s["DEVELOPMENT_LANGUAGE"] = "en"
end
app.build_configurations.each do |c|
  c.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
end

app.add_dependency(widget)
embed = app.new_copy_files_build_phase("Embed Foundation Extensions")
embed.symbol_dst_subfolder_spec = :plug_ins
bf = embed.add_file_reference(widget.product_reference)
bf.settings = { "ATTRIBUTES" => ["RemoveHeaderMapsOnCopy"] }

project.save
puts "Added SomaWidgets (#{app_id}.widgets)"
