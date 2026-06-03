cask "differ" do
  version "0.1.0"

  on_arm do
    url "https://github.com/peterfei/differ/releases/download/v#{version}/Differ_#{version}_aarch64.dmg"
    sha256 "7a4263e4d468fecf081deb315968f35ab3febd430a8040c877ec9ccb806cdd5b"
  end
  on_intel do
    url "https://github.com/peterfei/differ/releases/download/v#{version}/Differ_#{version}_x64.dmg"
    sha256 "d742d47edfc8defd1f560ef15f6a3dd94da03722327e7e9184ecd476295397db"
  end

  name "Differ"
  desc "A visual diff tool with syntax-aware diffing, directory comparison, and three-way merge support"
  homepage "https://github.com/peterfei/differ"

  app "Differ.app"

  zap trash: [
    "~/Library/Preferences/com.differ.app.plist",
    "~/Library/Saved Application State/com.differ.app.savedState",
  ]
end
