# Third-party notices

This repository is licensed under the GNU Affero General Public License v3.0 or later (see `LICENSE`).
It includes or uses the following third-party components.

## Bundled in `public/`

| Component | Path | License | Source |
|---|---|---|---|
| Stockfish 18 (lite, single-threaded), WASM build | `public/engine/stockfish-18-lite-single.js`, `public/engine/stockfish-18-lite-single.wasm` | GPL-3.0 (text: https://www.gnu.org/licenses/gpl-3.0.txt) | npm `stockfish@18.0.8`, https://github.com/nmrugg/stockfish.js |
| Maia3-23M, ONNX export (fp32) | `public/models/maia3_23m.onnx`, `public/models/maia3_23m.onnx.json` | AGPL-3.0 (per the model card of the export) | https://huggingface.co/cemoss17/maia3-onnx (upstream weights: https://huggingface.co/UofTCSSLab/Maia3-23M, CSSLab/maia3) |

## Runtime dependencies (npm, bundled into the app build)

| Package | License |
|---|---|
| `maia3-js` 0.2.0 (inference wrapper) | MIT |
| `onnxruntime-web` | MIT |
| `chess.js` | BSD-2-Clause |
| `@lichess-org/chessground` | GPL-3.0-or-later |
| `@fontsource/geist-mono` | OFL-1.1 |

## Notes

- The Maia3 weights and the Stockfish binary are redistributed unmodified; their license texts and source locations are listed above.
- Any hosted copy of this app must make its complete corresponding source available under AGPL-3.0 (section 13 of the license).
