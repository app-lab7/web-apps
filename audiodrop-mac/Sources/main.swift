import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private let urlField = NSTextField()
    private let folderField = NSTextField()
    private let formatPopup = NSPopUpButton()
    private let qualityPopup = NSPopUpButton()
    private let permissionCheck = NSButton(checkboxWithTitle: "このコンテンツを保存するために必要な権利・許可を持っています", target: nil, action: nil)
    private let downloadButton = NSButton(title: "音声を保存", target: nil, action: nil)
    private let progress = NSProgressIndicator()
    private let statusLabel = NSTextField(labelWithString: "YouTube URLを貼り付けてください")

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        buildWindow()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func label(_ text: String) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = .systemFont(ofSize: 13, weight: .medium)
        field.translatesAutoresizingMaskIntoConstraints = false
        return field
    }

    private func buildWindow() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 720, height: 520), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "AudioDrop"
        window.center()
        window.isReleasedWhenClosed = false
        guard let c = window.contentView else { return }

        let title = NSTextField(labelWithString: "AudioDrop")
        title.font = .boldSystemFont(ofSize: 26)
        title.translatesAutoresizingMaskIntoConstraints = false
        let sub = NSTextField(labelWithString: "許可されたYouTube音源を、音声ファイルとして保存")
        sub.textColor = .secondaryLabelColor
        sub.translatesAutoresizingMaskIntoConstraints = false
        let ul = label("YouTube URL")
        urlField.placeholderString = "https://www.youtube.com/watch?v=..."
        urlField.translatesAutoresizingMaskIntoConstraints = false
        let fl = label("保存先")
        folderField.stringValue = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first?.path ?? NSHomeDirectory() + "/Downloads"
        folderField.translatesAutoresizingMaskIntoConstraints = false
        let choose = NSButton(title: "選択", target: self, action: #selector(chooseFolder))
        choose.translatesAutoresizingMaskIntoConstraints = false
        let fmtl = label("形式")
        formatPopup.addItems(withTitles: ["MP3", "M4A"])
        formatPopup.translatesAutoresizingMaskIntoConstraints = false
        let ql = label("MP3音質")
        qualityPopup.addItems(withTitles: ["128 kbps", "192 kbps", "256 kbps", "320 kbps"])
        qualityPopup.selectItem(withTitle: "192 kbps")
        qualityPopup.translatesAutoresizingMaskIntoConstraints = false
        permissionCheck.translatesAutoresizingMaskIntoConstraints = false
        let note = NSTextField(wrappingLabelWithString: "自分の投稿・権利者から許可を得た音源・明示的にダウンロードが許可されたコンテンツにのみ使用してください。")
        note.textColor = .secondaryLabelColor
        note.font = .systemFont(ofSize: 11)
        note.translatesAutoresizingMaskIntoConstraints = false
        downloadButton.target = self
        downloadButton.action = #selector(startDownload)
        downloadButton.keyEquivalent = "\r"
        downloadButton.translatesAutoresizingMaskIntoConstraints = false
        progress.style = .spinning
        progress.controlSize = .small
        progress.isDisplayedWhenStopped = false
        progress.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        [title, sub, ul, urlField, fl, folderField, choose, fmtl, formatPopup, ql, qualityPopup, permissionCheck, note, downloadButton, progress, statusLabel].forEach { c.addSubview($0) }

        NSLayoutConstraint.activate([
            title.leadingAnchor.constraint(equalTo: c.leadingAnchor, constant: 28), title.topAnchor.constraint(equalTo: c.topAnchor, constant: 26),
            sub.leadingAnchor.constraint(equalTo: title.leadingAnchor), sub.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 3),
            ul.leadingAnchor.constraint(equalTo: title.leadingAnchor), ul.topAnchor.constraint(equalTo: sub.bottomAnchor, constant: 28),
            urlField.leadingAnchor.constraint(equalTo: title.leadingAnchor), urlField.trailingAnchor.constraint(equalTo: c.trailingAnchor, constant: -28), urlField.topAnchor.constraint(equalTo: ul.bottomAnchor, constant: 7), urlField.heightAnchor.constraint(equalToConstant: 30),
            fl.leadingAnchor.constraint(equalTo: title.leadingAnchor), fl.topAnchor.constraint(equalTo: urlField.bottomAnchor, constant: 19),
            folderField.leadingAnchor.constraint(equalTo: title.leadingAnchor), folderField.topAnchor.constraint(equalTo: fl.bottomAnchor, constant: 7), folderField.heightAnchor.constraint(equalToConstant: 30),
            choose.leadingAnchor.constraint(equalTo: folderField.trailingAnchor, constant: 8), choose.trailingAnchor.constraint(equalTo: c.trailingAnchor, constant: -28), choose.centerYAnchor.constraint(equalTo: folderField.centerYAnchor), choose.widthAnchor.constraint(equalToConstant: 78),
            fmtl.leadingAnchor.constraint(equalTo: title.leadingAnchor), fmtl.topAnchor.constraint(equalTo: folderField.bottomAnchor, constant: 20),
            formatPopup.leadingAnchor.constraint(equalTo: title.leadingAnchor), formatPopup.topAnchor.constraint(equalTo: fmtl.bottomAnchor, constant: 6), formatPopup.widthAnchor.constraint(equalToConstant: 150),
            ql.leadingAnchor.constraint(equalTo: c.centerXAnchor, constant: 8), ql.topAnchor.constraint(equalTo: fmtl.topAnchor),
            qualityPopup.leadingAnchor.constraint(equalTo: ql.leadingAnchor), qualityPopup.topAnchor.constraint(equalTo: ql.bottomAnchor, constant: 6), qualityPopup.widthAnchor.constraint(equalToConstant: 150),
            permissionCheck.leadingAnchor.constraint(equalTo: title.leadingAnchor), permissionCheck.topAnchor.constraint(equalTo: formatPopup.bottomAnchor, constant: 28),
            note.leadingAnchor.constraint(equalTo: title.leadingAnchor), note.trailingAnchor.constraint(equalTo: c.trailingAnchor, constant: -28), note.topAnchor.constraint(equalTo: permissionCheck.bottomAnchor, constant: 7),
            downloadButton.leadingAnchor.constraint(equalTo: title.leadingAnchor), downloadButton.trailingAnchor.constraint(equalTo: c.trailingAnchor, constant: -28), downloadButton.topAnchor.constraint(equalTo: note.bottomAnchor, constant: 22), downloadButton.heightAnchor.constraint(equalToConstant: 38),
            progress.leadingAnchor.constraint(equalTo: title.leadingAnchor), progress.topAnchor.constraint(equalTo: downloadButton.bottomAnchor, constant: 17),
            statusLabel.leadingAnchor.constraint(equalTo: progress.trailingAnchor, constant: 8), statusLabel.centerYAnchor.constraint(equalTo: progress.centerYAnchor)
        ])
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(urlField)
    }

    @objc private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url { folderField.stringValue = url.path }
    }

    @objc private func startDownload() {
        let raw = urlField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let u = URL(string: raw), let h = u.host?.lowercased(), h == "youtu.be" || h == "youtube.com" || h.hasSuffix(".youtube.com") else {
            alert("YouTube URLを確認してください", "youtube.com または youtu.be のURLを入力してください。")
            return
        }
        guard permissionCheck.state == .on else {
            alert("権利・許可の確認が必要です", "必要な権利・許可を持っている場合のみチェックしてください。")
            return
        }
        let dir = folderField.stringValue
        downloadButton.isEnabled = false
        progress.startAnimation(nil)
        statusLabel.stringValue = "音声を取得しています…"
        let fmt = formatPopup.titleOfSelectedItem == "M4A" ? "m4a" : "mp3"
        let q = qualityPopup.titleOfSelectedItem?.components(separatedBy: " ").first ?? "192"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in self?.run(raw, dir, fmt, q) }
    }

    private func run(_ url: String, _ dir: String, _ fmt: String, _ quality: String) {
        guard let r = Bundle.main.resourceURL else { finish("Resourcesを読み込めません。"); return }
        let ytdlp = r.appendingPathComponent("bin/yt-dlp").path
        let ffmpegDir = r.appendingPathComponent("bin").path
        let p = Process()
        p.executableURL = URL(fileURLWithPath: ytdlp)
        var args = ["--no-playlist", "--no-overwrites", "--ffmpeg-location", ffmpegDir, "-o", dir + "/%(title)s [%(id)s].%(ext)s"]
        if fmt == "mp3" { args += ["-x", "--audio-format", "mp3", "--audio-quality", quality + "K"] }
        else { args += ["-x", "--audio-format", "m4a"] }
        args.append(url)
        p.arguments = args
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        do {
            try p.run()
            p.waitUntilExit()
            let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            if p.terminationStatus == 0 {
                DispatchQueue.main.async { [weak self] in
                    self?.progress.stopAnimation(nil)
                    self?.downloadButton.isEnabled = true
                    self?.statusLabel.stringValue = "保存しました"
                    self?.alert("保存しました", "音声ファイルを保存しました。\n\n保存先:\n" + dir)
                }
            } else { finish(String(out.suffix(1600))) }
        } catch { finish(error.localizedDescription) }
    }

    private func finish(_ errorText: String) {
        DispatchQueue.main.async { [weak self] in
            self?.progress.stopAnimation(nil)
            self?.downloadButton.isEnabled = true
            self?.statusLabel.stringValue = "保存できませんでした"
            self?.alert("保存に失敗しました", errorText)
        }
    }

    private func alert(_ title: String, _ message: String) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = message
        a.addButton(withTitle: "OK")
        a.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
