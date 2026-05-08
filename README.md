# Attachments Autopilot

> Auto-creates queryable twin markdown notes for non-markdown attachments — so your images, PDFs, videos, and audio files become first-class notes that show up in Obsidian Bases.

## What it does

In Obsidian, attachments (PNG, JPG, PDF, MP4, MP3, …) live in your vault but they're not first-class notes. They don't show up in Dataview queries, they're invisible to Bases, and you can't add metadata to them.

**Attachments Autopilot** fixes this by automatically creating a "twin" markdown note next to every attachment:

```
attachments/
├── photo.png
├── recording.mp3
├── slides.pdf
└── twin/
    ├── photo.png.md          ← twin notes
    ├── recording.mp3.md
    ├── slides.pdf.md
    └── preview/
        ├── slides.pdf.png    ← page-1 thumbnail
        ├── recording.mp3.svg ← audio icon
        └── (images use the source itself, no duplicate)
```

Each twin contains three frontmatter properties pointing at the source and a generated preview:

```yaml
---
attachment-ref: "[[attachments/photo.png]]"
attachment-type: png
attachment-prev: "[[attachments/photo.png]]"
---
```

You can then query, filter, and visualize all your attachments via Bases — including a built-in cards view with thumbnails.

## Why

Attachments aren't first-class in Obsidian. Twins are sidecar markdown notes that make them queryable, taggable, and visible in Bases — without altering the attachments themselves.

## Features

- **Automatic** — drops, renames, deletes are all picked up by the vault watcher; no manual sync.
- **Preview generators**
  - Images (PNG, JPG, JPEG, WebP, GIF, BMP) → self-reference (the source IS the preview, no duplicate file)
  - PDFs → page-1 PNG thumbnail (via pdfjs)
  - Videos (MP4, MOV, WebM, M4V, OGV) → short animated GIF (via gifenc)
  - Audio (MP3, WAV, M4A, OGG, FLAC, AAC, OPUS) → SVG icon
- **Bulk-friendly** — drop 200 files at once; each one gets its own twin without duplicates.
- **Templater integration (optional)** — apply a Templater template to new twins; bulk drops show a confirmation modal.
- **Bases integration** — generates a ready-to-use `.base` file with a cards view that thumbnails every attachment.
- **Mobile + desktop** — same code path on iOS, Android, macOS, Windows, Linux.
- **i18n** — English, Spanish, German, French, Chinese.

## Installation

### Via BRAT (current path while in beta)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) community plugin.
2. In BRAT settings, click **Add Beta Plugin**.
3. Paste: `https://github.com/mikes-cafe/obsidian-attachments-autopilot`
4. Enable Attachments Autopilot under *Settings → Community plugins*.

### Via the Community Plugins directory

*Coming soon — pending review.*

### Manually

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/mikes-cafe/obsidian-attachments-autopilot/releases).
2. Drop both into `<your-vault>/.obsidian/plugins/attachments-autopilot/`.
3. Enable the plugin under *Settings → Community plugins*.

## Usage

Once enabled, **drop a file into your attachment folder** and the plugin does the rest. The twin and its preview appear within ~1 second.

### Commands

Open the command palette (`Ctrl/Cmd-P`) and search for "Attachments Autopilot":

- **Generate twins for orphan attachments** — finds attachments without twins (e.g. files added while the plugin was disabled) and creates the missing twins.
- **Generate previews for twins without one** — generates missing previews for existing twins. Useful after upgrading or after a preview-format change.
- **Import files from device** — opens the OS file picker; selected files are copied into the attachment folder and twinned automatically. Handy on mobile.
- **Generate base file with twins** — creates an `<attachmentFolder>.base` file at the vault root with a Bases cards view showing every attachment.

### Settings

- **Attachment folder** — read-only mirror of your Obsidian setting (*Settings → Files & Links → Default location for new attachments*). The plugin watches this folder.
- **Default twin template** — optional Templater template applied to new twins. Requires the [Templater](https://github.com/SilentVoid13/Templater) community plugin.

## Compatibility

- Obsidian **1.6.0** or newer
- Desktop: macOS, Windows, Linux
- Mobile: iOS, Android
- Bases core plugin **enabled** is required for the *Generate base file* command (the plugin shows a notice if it isn't)
- Templater community plugin is optional (enables custom twin templates)

## Acknowledgements

- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF page rendering
- [gifenc](https://github.com/mattdesl/gifenc) — animated GIF encoding for video previews
- The Obsidian team for the plugin API

## License

[MIT](LICENSE) © mikes-cafe
