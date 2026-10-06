APP_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

/* ────────── Design tokens ────────── */
:root {
  --bg: hsl(0 0% 7%);
  --bg-elev: hsl(0 0% 10%);
  --bg-card: #fdfdfd;
  --fg: hsl(0 0% 93%);
  --fg-muted: hsl(240 5% 64.9%);
  --fg-on-card: #1f1f22;
  --border: hsl(240 3.7% 15.9%);
  --border-card: rgba(212, 212, 216, 0.6);
  --primary: hsl(0 0% 98%);
  --primary-fg: hsl(0 0% 7%);
  --accent-blue: #60a5fa;
  --accent-blue-soft: rgba(96, 165, 250, 0.4);
  --accent-violet: #8b5cf6;
  --accent-cyan: #4cc2ff;
  --accent-green: #10a37f;
  --accent-orange: #d97757;
  --shadow-card: 0 0px 60px -25px #ffffff1f inset, 0px 0px 40px 5px #c6c6c635 inset;
  --shadow-soft: 0 3px 13px 0px #00000020;
  --radius: 0.5rem;
  --radius-card: 1rem;
  --radius-inner: 0.75rem;
}

/* ────────── Background — cloud/ellipse gradient + grid noise ────────── */
html, body, gradio-app {
  background: var(--bg) !important;
  color: var(--fg) !important;
  font-family: 'Space Grotesk', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif !important;
  font-feature-settings: "ss01", "cv01";
  letter-spacing: -0.005em;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse 800px 400px at 30% 20%, rgba(96, 165, 250, 0.08), transparent 60%),
    radial-gradient(ellipse 600px 300px at 70% 60%, rgba(139, 92, 246, 0.06), transparent 60%),
    radial-gradient(ellipse 1000px 500px at 50% 100%, rgba(96, 165, 250, 0.04), transparent 70%);
  filter: blur(40px);
}

body::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(900px circle at center, black, transparent 80%);
  -webkit-mask-image: radial-gradient(900px circle at center, black, transparent 80%);
}

.gradio-container {
  background: transparent !important;
  max-width: 1400px !important;
  margin: 0 auto !important;
  padding: 28px 24px 80px !important;
  position: relative;
  z-index: 1;
}

/* ────────── Hero header ────────── */
#hero {
  position: relative;
  padding: 28px 24px 36px;
  margin-bottom: 32px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border);
  background:
    linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01)),
    var(--bg-elev);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  animation: heroEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
}

#hero::before, #hero::after {
  content: '';
  position: absolute;
  border-radius: 100%;
  filter: blur(60px);
  pointer-events: none;
  opacity: 0.55;
}
#hero::before {
  width: 280px; height: 180px;
  top: -40px; left: -40px;
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.45), rgba(96, 165, 250, 0.18));
}
#hero::after {
  width: 320px; height: 200px;
  bottom: -60px; right: -60px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.40), rgba(96, 165, 250, 0.22));
}

#hero .hero-inner { position: relative; z-index: 2; }
#hero h1 {
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-weight: 800;
  font-size: 2.6rem;
  line-height: 1.05;
  letter-spacing: -0.03em;
  margin: 0 0 6px 0;
  background: linear-gradient(120deg, #fafafa 0%, #c4c4c4 60%, #fafafa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
#hero p {
  color: var(--fg-muted);
  font-size: 0.95rem;
  margin: 0;
  max-width: 720px;
  line-height: 1.55;
}
#hero .badges { margin-top: 14px; display: flex; gap: 8px; flex-wrap: wrap; }
#hero .badge {
  font-size: 0.72rem;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--fg);
  font-weight: 500;
  letter-spacing: 0.01em;
}
#hero .badge.b-blue { background: rgba(96,165,250,0.10); border-color: rgba(96,165,250,0.25); color: #93c5fd; }
#hero .badge.b-violet { background: rgba(139,92,246,0.10); border-color: rgba(139,92,246,0.25); color: #c4b5fd; }
#hero .badge.b-green { background: rgba(16,163,127,0.12); border-color: rgba(16,163,127,0.30); color: #6ee7b7; }

/* ────────── Tabs ────────── */
.tabs > .tab-nav, .tabs .tab-nav, .tab-nav, button.tab-nav-button { background: transparent !important; }
.tab-nav {
  display: flex;
  gap: 4px;
  padding: 6px !important;
  background: var(--bg-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: 12px !important;
  margin-bottom: 18px !important;
  width: fit-content !important;
}
.tab-nav button {
  background: transparent !important;
  color: var(--fg-muted) !important;
  border: none !important;
  border-radius: 8px !important;
  padding: 8px 16px !important;
  font-weight: 500 !important;
  font-size: 0.875rem !important;
  font-family: 'Space Grotesk', sans-serif !important;
  transition: all 0.2s ease !important;
}
.tab-nav button.selected {
  background: rgba(255,255,255,0.06) !important;
  color: var(--fg) !important;
  box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 4px 14px rgba(0,0,0,0.35) !important;
}
.tab-nav button:hover:not(.selected) {
  color: var(--fg) !important;
  background: rgba(255,255,255,0.03) !important;
}

/* ────────── Cards / panels ────────── */
.gr-block, .gr-form, .form, .panel, .gr-panel,
div[class*="block-"], div[class*="form-"] {
  background: var(--bg-elev) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-card) !important;
  box-shadow: var(--shadow-card) !important;
  overflow: hidden;
}

/* Reset double cards */
.gr-block .gr-block, .gr-form .gr-block, .gr-block .gr-form {
  box-shadow: none !important;
  border: none !important;
  background: transparent !important;
}

/* Inner cards / accordions get subtler styling */
.gr-accordion {
  background: rgba(255,255,255,0.02) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-inner) !important;
  margin-top: 10px !important;
}
.gr-accordion summary, .label-wrap {
  font-family: 'Space Grotesk', sans-serif !important;
  font-weight: 600 !important;
  color: var(--fg) !important;
  font-size: 0.85rem !important;
}

/* ────────── Labels & text ────────── */
label, .label-wrap span, .gr-label {
  color: var(--fg) !important;
  font-family: 'Space Grotesk', sans-serif !important;
  font-weight: 500 !important;
  font-size: 0.82rem !important;
  letter-spacing: 0.005em !important;
}
.info, .gr-info, span.info, p.info {
  color: var(--fg-muted) !important;
  font-size: 0.75rem !important;
  font-weight: 400 !important;
}

/* ────────── Buttons ────────── */
button.gr-button, .gr-button {
  font-family: 'Space Grotesk', sans-serif !important;
  font-weight: 500 !important;
  font-size: 0.875rem !important;
  border-radius: 10px !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
  cursor: pointer !important;
  letter-spacing: 0.005em !important;
}

/* Primary button */
button.primary, .gr-button.primary {
  background: linear-gradient(135deg, #fafafa 0%, #e4e4e7 100%) !important;
  color: #0a0a0f !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  box-shadow:
    0 1px 0 rgba(255,255,255,0.4) inset,
    0 4px 14px rgba(0,0,0,0.4),
    0 0 0 1px rgba(255,255,255,0.03) !important;
  font-weight: 600 !important;
  padding: 12px 24px !important;
}
button.primary:hover, .gr-button.primary:hover {
  background: linear-gradient(135deg, #ffffff 0%, #f4f4f5 100%) !important;
  transform: translateY(-1px);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.5) inset,
    0 8px 24px rgba(96, 165, 250, 0.18),
    0 0 0 1px rgba(96, 165, 250, 0.15) !important;
}
button.primary:active, .gr-button.primary:active {
  transform: translateY(0);
}

/* Secondary buttons */
button.secondary, .gr-button.secondary, button:not(.primary) {
  background: rgba(255,255,255,0.04) !important;
  color: var(--fg) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}
button.secondary:hover, .gr-button.secondary:hover, button:not(.primary):not(.tab-nav button):hover {
  background: rgba(255,255,255,0.07) !important;
  border-color: rgba(255,255,255,0.14) !important;
}

/* ────────── Sliders (Win11 style — #4cc2ff thumb) ────────── */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 4px !important;
  border-radius: 10px !important;
  background: rgba(255,255,255,0.10) !important;
  outline: none;
  cursor: pointer;
}
input[type="range"]::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 10px;
  background: rgba(255,255,255,0.10);
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-cyan);
  border: 5px solid #1a1a1a;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 12px rgba(76,194,255,0.35);
  margin-top: -7px;
  transition: border-width 0.1s ease, background 0.1s ease, box-shadow 0.2s ease;
}
input[type="range"]::-webkit-slider-thumb:hover {
  border-width: 4px;
  background: #6ccfff;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.5), 0 0 18px rgba(76,194,255,0.55);
}
input[type="range"]::-webkit-slider-thumb:active {
  border-width: 6px;
  background: #6ccfff;
}

/* ────────── Text inputs / dropdowns / textareas ────────── */
input[type="text"], input[type="number"], textarea, select,
.gr-input, .gr-textbox, .gr-dropdown input {
  background: rgba(0,0,0,0.25) !important;
  color: var(--fg) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 10px !important;
  font-family: 'Space Grotesk', sans-serif !important;
  font-size: 0.875rem !important;
  padding: 10px 14px !important;
  transition: border-color 0.2s, box-shadow 0.2s;
}
input[type="text"]:focus, input[type="number"]:focus, textarea:focus,
.gr-input:focus, .gr-textbox:focus {
  border-color: rgba(96, 165, 250, 0.5) !important;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.15) !important;
  outline: none !important;
}

/* Dropdown menu items */
ul.options li, .gr-dropdown ul li {
  background: var(--bg-elev) !important;
  color: var(--fg) !important;
  font-family: 'Space Grotesk', sans-serif !important;
}

/* ────────── Radio / Checkbox ────────── */
.gr-radio label, .gr-checkbox label {
  background: rgba(255,255,255,0.03) !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 10px !important;
  padding: 8px 14px !important;
  font-family: 'Space Grotesk', sans-serif !important;
  color: var(--fg-muted) !important;
  transition: all 0.2s ease !important;
}
.gr-radio label:hover, .gr-checkbox label:hover {
  border-color: rgba(96,165,250,0.30) !important;
  color: var(--fg) !important;
}
.gr-radio input:checked + *, .gr-radio label.selected {
  background: rgba(96,165,250,0.10) !important;
  border-color: rgba(96,165,250,0.40) !important;
  color: #93c5fd !important;
}

/* ────────── Image/file upload areas ────────── */
.gr-image, .image-frame, .file, .file-preview, .upload-container {
  background: rgba(0,0,0,0.3) !important;
  border: 1.5px dashed rgba(255,255,255,0.10) !important;
  border-radius: var(--radius-inner) !important;
}
.gr-image:hover, .image-frame:hover, .file:hover {
  border-color: rgba(96,165,250,0.30) !important;
}

/* Image preview itself (rendered output) */
.gr-image img, .image img {
  border-radius: var(--radius-inner) !important;
  background:
    repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%) 50% / 24px 24px;
}

/* ────────── Status markdown ────────── */
.gr-markdown, .markdown {
  font-family: 'Space Grotesk', sans-serif !important;
  color: var(--fg) !important;
  font-size: 0.85rem !important;
}
.gr-markdown code, .markdown code {
  background: rgba(255,255,255,0.06) !important;
  padding: 2px 6px !important;
  border-radius: 4px !important;
  font-size: 0.78rem !important;
  color: #93c5fd !important;
}
.status-ok { color: #6ee7b7; font-weight: 600; }

/* ────────── Color picker ────────── */
.gr-colorpicker input {
  border-radius: 8px !important;
  padding: 4px !important;
}

/* ────────── Footer ────────── */
#footer {
  margin-top: 32px;
  padding: 18px 0;
  text-align: center;
  color: var(--fg-muted);
  font-size: 0.75rem;
  font-family: 'Space Grotesk', sans-serif;
  letter-spacing: 0.02em;
  border-top: 1px solid var(--border);
}
#footer code {
  background: rgba(255,255,255,0.06);
  padding: 2px 8px;
  border-radius: 4px;
  color: #93c5fd;
  font-size: 0.7rem;
}

/* ────────── Scrollbar ────────── */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); background-clip: padding-box; border: 2px solid transparent; }

/* ────────── Animations (mimicking Framer Motion entry patterns) ────────── */
@keyframes heroEnter {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes fadeRight {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.tab-nav { animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.1s; }
.tabitem { animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.2s; }
.gr-row > .gr-column:nth-child(1) > .gr-block { animation: fadeLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.25s; }
.gr-row > .gr-column:nth-child(2) > .gr-block { animation: fadeRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; animation-delay: 0.3s; }

/* Loading shimmer on processing buttons */
button.primary.processing::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
  animation: shimmer 1.5s infinite;
}

/* ────────── Misc Gradio cleanup ────────── */
.gradio-container .footer, .built-with, footer { display: none !important; }
.gr-block.padded { padding: 18px !important; }
.gr-row { gap: 16px !important; }
"""


HERO_HTML = """
<div id="hero">
  <div class="hero-inner">
    <h1>Sharpz</h1>
    <p>
      Remoção de fundo de alta fidelidade com <b>luma keying</b> (Unmult) para neon/glow
      e <b>segmentação AI</b> (BiRefNet · ISNet · U2Net) para fotos. Vetorização PNG → SVG
      com dois traces simultâneos: um <b>com fundo</b> e um <b>clean transparente</b>.
    </p>
    <div class="badges">
      <span class="badge b-blue">Luma Keying</span>
      <span class="badge b-violet">BiRefNet</span>
    </div>
  </div>
</div>
"""
