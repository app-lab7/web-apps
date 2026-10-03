# Bye Bye BLUE Editor v5.4 — supplied JIZURA MV Studio integration

The v5.3 editor remains the primary, v47-specific interface. No production MV file is modified.

Reused from the supplied jizura-mv-studio.zip:
- Actual JIZURA mainDraw / ENTER / EXIT registry, already contained in the production core bundles. The bbEditorial adapter now optionally calls that pipeline. Default is no additional native effect.
- src/14_studio_media.js: fadeAlpha and drawBand, copied into studio-band.js.
- src/11_export.js: MP4 WebCodecs encoding, audio encoding, codec retry, block storage, cancellation; copied into studio-export.js with one async frame hook to composite original v47 video and editor overlay.
- vendor/mp4-muxer.min.js, licenses and third-party notices.

Native effect selections require Apply. Shakes, spins, flashes and background camera effects are not offered in the dedicated editor. Generic new-project functionality remains outside this integration.

Data:
- v5.4 stores {base: ByeByeBLUE_v47, overrides: {photos, lyrics, bands}}.
- v5.3 / v5 JSON and v5.3 browser saves are migrated without rewriting the old save key.
- Supplied Studio JSON with source=bye-bye-blue supports known photo/lyric/overlay properties. Unsupported layouts, effects, video backgrounds and local asset blobs are reported. This is not a lossless import of every generic JIZURA project.
- Studio defaults (1.025 cover scale, 0.006 micro-pan, 0.065 legacy letterInterval) are normalized to avoid adding false edits to all clips.
- Original video is used for untouched output frames; changed photo/lyric intervals still rely on earlier production sources and can differ from v47 corrections. Independent band overlays preserve the video underneath.

Export:
- 540p and 1080p, 30 fps, whole MV / selected interval / six seconds near the playhead.
- Export requires selecting the original v47 MP4; preview needs no upload. GitHub release media can be played but cannot be fetched for export because of CORS. The selected file supplies soundtrack and untouched frames.
- Verified in the cloud browser: 2.12-second selected interval, 960x540 H.264 video with Opus audio. Audio codec depends on browser support; full-length 1080p export has not been verified.
- This work reuses the engine rather than inventing JIZURA-like presets. See JIZURA-LICENSE.txt and JIZURA-THIRD-PARTY-NOTICES.txt.
