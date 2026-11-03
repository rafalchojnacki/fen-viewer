import { StockfishEngine } from './stockfish.js';
import { loadMaia, scoreMoves } from './maia.js';
import { el, positionPopover, segmentedGroup } from '../ui.js';
import { setSplitEnabled } from '../sidebar-split.js';
import {
  applyUci,
  formatPercent,
  formatScore,
  lossBand,
  lossForLine,
  sideToMoveOf,
  uciLineToSan,
  uciToSan,
  wdlFromWhite,
} from './format.js';
import {
  LINE_COUNTS,
  MASTER_RANGES,
  QUALITY_LEVELS,
  RATINGS,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from './settings.js';

const DOTS = 5;
// Plies shown in the continuation line, after the best move.
const CONTINUATION_PLIES = 6;

const MIB = 1024 * 1024;

// Progress bar for the Maia model download (see loadMaia in maia.js). Shown only
// during the download phase: a determinate fill when the total size is known,
// and an indeterminate sweep otherwise.
function maiaProgressElement(status) {
  const wrap = el('div', 'eval-progress');
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-label', 'Loading Maia3 model');
  const label = el('p', 'eval-empty eval-progress-label');
  const track = el('div', 'eval-progress-track');
  track.append(el('div', 'eval-progress-fill'));
  wrap.append(label, track);
  updateMaiaProgress(wrap, status);
  return wrap;
}

// Column labels for the evaluation rows. The Move column has no label. Widths
// mirror the .eval-* classes used in buildLine, so the labels line up with the values.
function columnHeader() {
  const header = el('div', 'eval-columns');
  header.setAttribute('aria-hidden', 'true');
  const label = (text) => el('span', 'eval-col-label', text);
  header.append(
    el('span', 'eval-col eval-col-move'),
    el('span', 'eval-col eval-col-score'),
    el('span', 'eval-col eval-col-wdl'),
    el('span', 'eval-col eval-col-circles'),
  );
  const [, score, wdl, circles] = header.children;
  score.append(label('Score'));
  wdl.append(label('Peer results'));
  circles.append(label('Masters'));
  return header;
}

// Determinate bar showing how much of the Stockfish node budget is searched.
function analysisProgressElement(fraction) {
  const wrap = el('div', 'eval-progress eval-progress-analysis');
  wrap.setAttribute('role', 'progressbar');
  wrap.setAttribute('aria-label', 'Analysis progress');
  wrap.setAttribute('aria-valuemin', '0');
  wrap.setAttribute('aria-valuemax', '100');
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  wrap.setAttribute('aria-valuenow', String(percent));
  const track = el('div', 'eval-progress-track');
  const fill = el('div', 'eval-progress-fill');
  fill.style.width = `${percent}%`;
  track.append(fill);
  wrap.append(track);
  return wrap;
}

function updateMaiaProgress(wrap, status) {
  const label = wrap.querySelector('.eval-progress-label');
  const fill = wrap.querySelector('.eval-progress-fill');
  const determinate = status.phase === 'download' && status.total > 0;
  wrap.classList.toggle('indeterminate', !determinate);
  if (determinate) {
    const fraction = Math.min(1, status.loaded / status.total);
    fill.style.width = `${(fraction * 100).toFixed(1)}%`;
    wrap.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    label.textContent = `Downloading… ${(status.loaded / MIB).toFixed(1)} of ${(status.total / MIB).toFixed(1)} MB`;
  } else {
    fill.style.width = '';
    wrap.removeAttribute('aria-valuenow');
    label.textContent = 'Downloading…';
  }
}

// The evaluation panel lives in the side panel's analysis section.
// Views:
//   off        panel disabled
//   searching  Stockfish is streaming lines (placeholders for Maia parts)
//   scoring    Stockfish done, Maia is scoring the moves
//   done       everything available
//   error      something failed
export class EvalPanel {
  constructor(doc = document) {
    this.toggle = doc.getElementById('eval-toggle');
    this.settingsBtn = doc.getElementById('eval-settings-btn');
    this.settingsMenu = doc.getElementById('eval-settings');
    this.ratingBtn = doc.getElementById('eval-rating-btn');
    this.ratingLabel = doc.getElementById('eval-rating-label');
    this.ratingList = doc.getElementById('eval-rating-list');
    this.section = doc.getElementById('eval-section');
    this.body = doc.getElementById('eval-body');

    this.settings = loadSettings();
    this.enabled = false;
    this.fen = null;
    this.engine = null;
    this.runId = 0;
    this.view = null;

    this.buildControls(doc);
    this.syncControls();
    this.bind();
    this.render();
  }

  buildControls(doc) {
    this.linesGroup = segmentedGroup(
      doc.getElementById('eval-lines'),
      LINE_COUNTS.map((count) => ({ value: count, label: String(count) })),
      (value) => this.updateSettings({ lines: value }),
    );
    this.qualityGroup = segmentedGroup(
      doc.getElementById('eval-quality'),
      Object.entries(QUALITY_LEVELS).map(([key, level]) => ({ value: key, label: level.label })),
      (value) => this.updateSettings({ quality: value }),
    );
    this.masterGroup = segmentedGroup(
      doc.getElementById('eval-master'),
      MASTER_RANGES.map((range) => ({ value: range.value, label: range.label })),
      (value) => this.updateSettings({ master: value }),
    );
    this.ratingItems = RATINGS.map((rating) => {
      const item = el('li', 'eval-dd-item', String(rating));
      item.setAttribute('role', 'option');
      item.dataset.value = String(rating);
      item.addEventListener('click', () => {
        this.closeRatingList();
        this.updateSettings({ rating });
      });
      this.ratingList.append(item);
      return item;
    });
  }

  bind() {
    this.toggle.addEventListener('change', () => this.setEnabled(this.toggle.checked));

    this.settingsBtn.addEventListener('click', () => this.toggleSettingsMenu());
    window.addEventListener('resize', () => {
      if (!this.settingsMenu.hidden) positionPopover(this.settingsMenu, this.settingsBtn);
    });

    this.ratingBtn.addEventListener('click', () => {
      if (this.ratingList.hidden) this.openRatingList();
      else this.closeRatingList();
    });

    document.addEventListener('click', (event) => {
      if (
        !this.settingsMenu.hidden &&
        !this.settingsMenu.contains(event.target) &&
        !this.settingsBtn.contains(event.target)
      ) {
        this.closeSettingsMenu();
      }
      if (!this.ratingList.hidden && !this.ratingBtn.parentElement.contains(event.target)) {
        this.closeRatingList();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.ratingList.hidden) {
        this.closeRatingList();
      }
    });
  }

  openRatingList() {
    this.ratingList.hidden = false;
    this.ratingBtn.setAttribute('aria-expanded', 'true');
    this.ratingItems.find((item) => item.dataset.value === String(this.settings.rating))?.scrollIntoView({ block: 'nearest' });
  }

  closeRatingList() {
    this.ratingList.hidden = true;
    this.ratingBtn.setAttribute('aria-expanded', 'false');
  }

  toggleSettingsMenu() {
    if (this.settingsMenu.hidden) {
      positionPopover(this.settingsMenu, this.settingsBtn);
      this.settingsMenu.hidden = false;
      this.settingsBtn.setAttribute('aria-expanded', 'true');
    } else {
      this.closeSettingsMenu();
    }
  }

  closeSettingsMenu() {
    this.settingsMenu.hidden = true;
    this.settingsBtn.setAttribute('aria-expanded', 'false');
  }

  // Called from the main board refresh; a no-op when the position did not change.
  setFen(fen) {
    if (fen === this.fen) return;
    this.fen = fen;
    if (this.enabled) this.run();
  }

  toggleEnabled() {
    this.setEnabled(!this.enabled);
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    this.toggle.checked = this.enabled;
    if (this.enabled) {
      this.run();
    } else {
      this.runId += 1;
      this.engine?.cancel();
      this.view = null;
      this.render();
    }
  }

  updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    saveSettings(this.settings);
    this.syncControls();
    if (this.enabled) this.run();
  }

  syncControls() {
    this.linesGroup.setValue(this.settings.lines);
    this.qualityGroup.setValue(this.settings.quality);
    this.masterGroup.setValue(String(this.settings.master));
    this.ratingLabel.textContent = String(this.settings.rating);
    this.ratingItems.forEach((item) => {
      const selected = item.dataset.value === String(this.settings.rating);
      item.setAttribute('aria-selected', String(selected));
      item.classList.toggle('selected', selected);
    });
  }

  async run() {
    const runId = ++this.runId;
    const fen = this.fen;
    if (!this.enabled || !fen) {
      this.render();
      return;
    }

    this.engine ??= new StockfishEngine();
    const { lines: count, quality, rating, master } = this.settings;
    this.view = { state: 'searching', fen, lines: [], progress: 0 };
    this.render();

    const result = await this.engine.analyze({
      fen,
      multiPV: count,
      nodes: QUALITY_LEVELS[quality].nodes,
      onUpdate: (lines) => {
        if (runId !== this.runId) return;
        this.view = { ...this.view, state: 'searching', fen, lines };
        this.render();
      },
      onProgress: (progress) => {
        if (runId !== this.runId) return;
        this.view = { ...this.view, progress };
        this.render();
      },
    });
    if (runId !== this.runId) return;
    if (result.error) {
      this.view = { state: 'error', fen, message: `Engine failed: ${result.error.message}` };
      this.render();
      return;
    }
    if (result.cancelled) return;

    if (!result.lines.length) {
      this.view = { state: 'done', fen, lines: [], scored: null, message: 'No legal moves.' };
      this.render();
      return;
    }

    this.view = { state: 'scoring', fen, lines: result.lines, scored: null, maia: { phase: 'download', loaded: 0, total: 0 } };
    this.render();

    try {
      await loadMaia((status) => this.onMaiaStatus(runId, status));
      const moves = result.lines.map((line) => {
        const uci = line.pv[0];
        return { uci, childFen: uci ? applyUci(fen, uci) : null };
      });
      const ratings = MASTER_RANGES.find((range) => range.value === master).ratings;
      const scored = await scoreMoves({ fen, moves, rating, ratings });
      if (runId !== this.runId) return;
        this.view = { state: 'done', fen, lines: result.lines, scored };
    } catch (error) {
      if (runId !== this.runId) return;
        this.view = {
        state: 'done',
        fen,
        lines: result.lines,
        scored: null,
        message: `Maia3 failed: ${error.message}`,
      };
    }
    this.render();
  }

  // Called by loadMaia while the model downloads or prepares. Updates the
  // progress bar in place; re-renders only if the bar isn't on screen yet.
  onMaiaStatus(runId, status) {
    if (runId !== this.runId || this.view?.state !== 'scoring') return;
    this.view = { ...this.view, maia: status };
    if (status.phase !== 'download') {
      // Preparing: hide the bar. The render below leaves the slot out.
      if (this.maiaProgress?.isConnected) this.maiaProgress.remove();
      this.maiaProgress = null;
      return;
    }
    if (this.maiaProgress?.isConnected) {
      updateMaiaProgress(this.maiaProgress, status);
    } else {
      this.render();
    }
  }

  render() {
    this.maiaProgress = null;
    this.toggle.checked = this.enabled;
    // Collapse the section to its header while evaluation is off.
    this.section.classList.toggle('collapsed', !this.enabled);
    setSplitEnabled(this.enabled);
    this.settingsBtn.setAttribute('aria-pressed', String(!this.settingsMenu.hidden));
    this.body.replaceChildren();

    if (!this.enabled) {
      this.body.append(el('p', 'eval-empty', 'Evaluation is off. Press E to show it.'));
      return;
    }

    if (!this.view || !this.view.fen) {
      this.renderPlaceholders();
      return;
    }

    const { view } = this;
    if (view.state === 'error') {
      this.body.append(el('p', 'eval-empty eval-error', view.message));
      return;
    }

    if (view.state === 'done' && view.lines.length === 0) {
      this.body.append(el('p', 'eval-empty', view.message));
      return;
    }

    if (view.state === 'scoring' && view.maia?.phase === 'download') {
      this.maiaProgress = maiaProgressElement(view.maia);
      this.body.append(this.maiaProgress);
    }

    this.body.append(this.progressSlot(view));

    const lines = view.lines;
    const scoredAll = view.state === 'done' ? view.scored : null;
    if (lines.length) this.body.append(columnHeader());
    const rows = Math.max(this.settings.lines, lines.length);
    for (let index = 0; index < rows; index += 1) {
      const line = lines[index];
      if (!line) {
        this.body.append(this.placeholderLine());
        continue;
      }
      this.body.append(
        this.buildLine(view.fen, lines, index, scoredAll?.moves[index] ?? null, scoredAll?.topProbability ?? null, view.state === 'done'),
      );
    }

    if (view.message && view.state === 'done') {
      this.body.append(el('p', 'eval-empty eval-error', view.message));
    }
  }

  // Fixed-height slot for the analysis bar. It is kept in every state so the
  // rows below do not move when the bar appears or disappears.
  progressSlot(view) {
    const slot = el('div', 'eval-progress-slot');
    if (view?.state === 'searching') slot.append(analysisProgressElement(view.progress ?? 0));
    return slot;
  }

  renderPlaceholders() {
    this.body.append(this.progressSlot(null));
    for (let index = 0; index < this.settings.lines; index += 1) {
      this.body.append(this.placeholderLine());
    }
  }

  placeholderLine() {
    const row = el('div', 'eval-line eval-line-pending');
    row.setAttribute('aria-hidden', 'true');
    const primary = el('div', 'eval-primary');
    primary.append(
      el('span', 'eval-skeleton eval-skeleton-move'),
      el('span', 'eval-skeleton eval-skeleton-score'),
      el('span', 'eval-skeleton eval-skeleton-wdl'),
      el('span', 'eval-skeleton eval-skeleton-circles'),
    );
    row.append(primary, el('div', 'eval-skeleton eval-skeleton-cont'));
    return row;
  }

  buildLine(fen, lines, index, scored, topProbability, complete) {
    const line = lines[index];
    const row = el('div', 'eval-line');
    const best = lines[0];
    const band = lossBand(lossForLine(best.score, line.score));
    row.style.setProperty('--eval-tint', `var(--glyph-tint-${band.tint})`);

    const uci = line.pv[0];
    const san = uci ? uciToSan(fen, uci) : null;
    const primary = el('div', 'eval-primary');
    primary.append(el('span', 'eval-move', san ?? '—'));
    primary.append(el('span', 'eval-score', formatScore(line.score, sideToMoveOf(fen))));

    if (complete) {
      primary.append(this.buildWdl(fen, scored));
    } else {
      primary.append(el('span', 'eval-skeleton eval-skeleton-wdl'));
    }

    primary.append(this.buildCircles(scored, topProbability, complete));
    row.append(primary);

    const afterFirst = uci ? applyUci(fen, uci) : null;
    const continuation = afterFirst ? uciLineToSan(afterFirst, line.pv.slice(1), CONTINUATION_PLIES) : '';
    row.append(el('div', 'eval-continuation', continuation));
    return row;
  }

  // Circles are scaled against the most probable move in the position, so that
  // move always shows all DOTS filled.
  buildCircles(scored, topProbability, complete) {
    if (!complete) return el('span', 'eval-skeleton eval-skeleton-circles');
    const circles = el('span', 'eval-circles');
    if (!scored || scored.probability === null || !topProbability) {
      circles.append(el('span', 'eval-empty-inline', '—'));
      return circles;
    }
    const count = Math.min(DOTS, Math.max(1, Math.round((scored.probability / topProbability) * DOTS)));
    circles.setAttribute('role', 'img');
    circles.setAttribute('aria-label', `Probability ${count} of ${DOTS}`);
    circles.title = formatPercent(scored.probability);
    for (let i = 0; i < DOTS; i += 1) {
      circles.append(el('span', i < count ? 'eval-dot eval-dot-on' : 'eval-dot'));
    }
    return circles;
  }

  buildWdl(fen, scored) {
    const wrap = el('div', 'eval-wdl-wrap');
    if (!scored || !scored.wdl) {
      wrap.append(el('div', 'eval-empty-inline', '—'));
      return wrap;
    }
    const mover = sideToMoveOf(fen);
    const white = wdlFromWhite(scored.wdl, mover);
    const bar = el('div', 'eval-wdl');
    bar.setAttribute('role', 'img');
    const summary = `White ${formatPercent(white.win)} · Draw ${formatPercent(white.draw)} · Black ${formatPercent(white.loss)}`;
    bar.setAttribute('aria-label', `White win ${formatPercent(white.win)}, draw ${formatPercent(white.draw)}, black win ${formatPercent(white.loss)}`);
    bar.title = summary;
    for (const [key, cls] of [
      ['win', 'eval-wdl-w'],
      ['draw', 'eval-wdl-d'],
      ['loss', 'eval-wdl-b'],
    ]) {
      const segment = el('span', cls);
      segment.style.width = formatPercent(white[key]);
      bar.append(segment);
    }
    wrap.append(bar);
    return wrap;
  }
}

export const evalPanel = new EvalPanel();
