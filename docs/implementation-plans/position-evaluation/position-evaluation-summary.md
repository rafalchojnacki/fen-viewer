# Position evaluation: summary

Status: implemented in the working tree, not committed.

## Goal

Show engine and human-model evaluation for the board position in the side panel. All analysis runs in the browser. Engine and model files are committed under `public/`, so the app works offline after load.

## Licensing

- The repository is licensed under AGPL-3.0-or-later (`LICENSE`).
- Bundled third-party files are listed in `THIRD_PARTY_NOTICES.md`:
  - Stockfish 18 lite single-threaded WASM (GPL-3.0), `public/engine/`.
  - Maia3-23M ONNX export (AGPL-3.0), `public/models/maia3_23m.onnx`.
- Runtime npm dependencies: `maia3-js` (MIT), `onnxruntime-web` (MIT).

## Panel

Location: the top section of the side panel (the former "Analysis coming soon" block).

- Header: "Evaluation" label, toggle switch and settings button at the top right.
- Settings popover:
  - Lines: segmented toggle 1 to 5 (default 3).
  - Analysis: segmented toggle Fast (1M nodes) or Standard (10M nodes). Default Fast.
  - Peer rating: custom dropdown, 600 to 2600 in steps of 100 (default 1500).
- Settings persist in `localStorage` under `fen-viewer.eval`. The toggle is always off after page load.
- Key `E` toggles the panel (ignored while typing in an input).

Each line shows:

- Primary row, left to right: best move (SAN), score in pawns from White's view with one decimal (`+0.3`; mates as `#5` / `-#3`), win/draw/loss bar (no text labels; hover for values), probability circles (1 to 5). Text is regular weight.
- Small row: continuation (the rest of the Stockfish PV, in SAN, up to 7 plies, with move numbers before White moves only).

Placeholders: shimmer blocks replace any element that has no data yet. WDL and circles show placeholders until Maia finishes, while engine scores stream in.

Status line: shows only the Maia3 model download percentage and the "Scoring with Maia3…" message. Depth and settings are not shown.

## Calculations

- Stockfish 18 `lite-single` build: `MultiPV` set from the line count, `go nodes` from the quality setting. Lines stream as depth increases.
- Probability circles: average of Maia3-23M move probability over ratings 2200, 2300, 2400, 2500, 2600. Scaled against the most probable legal move in the position (`pMax`, over all moves, not only the displayed lines): `count = max(1, round(p / pMax * 5))`. The most probable move always shows 5 filled circles.
- Win/draw/loss bar: Maia3-23M WDL for the position after the line's move, scored at the settings rating (both sides at that rating). Converted to White's view.
- Move colors: centipawns lost by the line relative to the best line, for the side to move (internal only; the panel does not display centipawns). Bands use the move-list glyph tints:
  - up to 10 cp: green (Best)
  - up to 50 cp: teal (Good)
  - up to 150 cp: yellow (Inaccuracy)
  - up to 300 cp: orange (Mistake)
  - above 300 cp: red (Blunder)
  - Mates are converted to large centipawn values.

## Engine handling

- Stockfish runs in a Web Worker (`src/eval/stockfish.js`). Only one search runs at a time: a new request sends `stop`, waits for `bestmove`, and then starts. Only the newest pending request is kept.
- Maia3 loads lazily on first analysis (`src/eval/maia.js`), with progress shown in the status line. Model is about 92 MB.
- Positions changed during a search cancel the previous result.

## Files

- `src/eval/format.js`: UCI info parsing, score formatting, circles, bands, WDL flipping, SAN helpers.
- `src/eval/stockfish.js`: Stockfish worker wrapper.
- `src/eval/maia.js`: Maia3 loading and scoring.
- `src/eval/settings.js`: settings defaults, validation, persistence.
- `src/eval/panel.js`: panel rendering, settings, run/cancel logic.
- `src/main.js`: `E` key handler and `evalPanel.setFen()` in `refresh()`.
- `src/style.css`: panel styles at the end of the file.
- `index.html`: panel markup.

## Verification performed

- `npm run build` passes.
- Pure helpers checked in Node (score parsing, mate formatting, bands, WDL, SAN).
- Maia3-23M ONNX checked in Node for sane output on the start position and castling key format (`e1g1`, `e1c1`) matching Stockfish UCI.
- Headless Firefox:
  - Panel off after load, `E` turns it on.
  - Streaming Stockfish lines, then Maia circles and WDL.
  - Rating setting persists across reload.
  - Position import during search cancels the old result; new results are for the new position.
  - No console errors.
  - Screenshot checked.

## Known limitations and open items

- Default layout shows about two lines before scrolling inside the panel.
- Maia3-23M was verified in Node and in Firefox; not validated against the Python reference beyond the upstream model card.
- The 92 MB model and Stockfish WASM are in git history once committed; GitHub warns above 50 MB per file.
- Centipawn bands are a first pass; thresholds are constants in `src/eval/format.js` (`LOSS_BANDS`).
