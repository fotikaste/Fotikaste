// Bildschirmtastatur für den Touchscreen der Fotobox (Raspberry Pi im Kiosk-Modus).
// Erscheint automatisch, sobald ein Eingabefeld angetippt wird – Text: Schweizer Anordnung, Zahlen: Ziffernblock.
// Aktiv nur im Kiosk-Modus (sessionStorage «kiosk», gesetzt von /?kiosk=1) oder zum Testen mit ?tastatur=1.
// Kein Zusatzpaket, keine Daten werden irgendwohin geschickt – sie tippt nur in das Feld.
'use strict';
(function () {
  let aktiv = false;
  try {
    if (new URLSearchParams(location.search).has('tastatur')) sessionStorage.setItem('tastatur', '1');
    aktiv = !!(sessionStorage.getItem('kiosk') || sessionStorage.getItem('tastatur'));
  } catch (_) { /* ohne Speicher: aus */ }
  window.Tastatur = {aktiv};
  if (!aktiv) return;

  const css = `
  .bt { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000; background: #dcd8d1; padding: 10px 10px 14px;
    box-shadow: 0 -6px 24px rgba(0,0,0,.18); display: none; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
  .bt.offen { display: block; }
  .bt-reihe { display: flex; gap: 7px; justify-content: center; margin-top: 7px; }
  .bt-reihe:first-child { margin-top: 0; }
  .bt button { all: unset; box-sizing: border-box; flex: 1 1 0; max-width: 86px; height: 58px; border-radius: 9px; background: #fff;
    display: grid; place-items: center; font: 500 24px/1 "Inter", "Segoe UI", system-ui, sans-serif; color: #1f1d1a;
    box-shadow: 0 2px 0 rgba(0,0,0,.18); cursor: pointer; }
  .bt button:active, .bt button.gedrueckt { background: #bdb7ae; }
  .bt button.breit { flex-grow: 1.6; max-width: 140px; font-size: 17px; font-weight: 600; background: #f1efeb; }
  .bt button.leer { flex-grow: 5; max-width: 420px; font-size: 17px; }
  .bt button.ok { background: #2d5bd7; color: #fff; }
  .bt button.an { background: #1f1d1a; color: #fff; }
  .bt.zahlen .bt-reihe button { max-width: 120px; height: 64px; font-size: 28px; }
  .bt.zahlen { padding-left: calc(50% - 200px); padding-right: calc(50% - 200px); }`;
  const stil = document.createElement('style');
  stil.textContent = css;
  document.head.appendChild(stil);

  const tafel = document.createElement('div');
  tafel.className = 'bt';
  document.body.appendChild(tafel);

  const TEXT = [['1','2','3','4','5','6','7','8','9','0','⌫'],
                ['q','w','e','r','t','z','u','i','o','p','ü'],
                ['a','s','d','f','g','h','j','k','l','ö','ä'],
                ['⇧','y','x','c','v','b','n','m',',','.','-']];
  const ZEICHEN = [['1','2','3','4','5','6','7','8','9','0','⌫'],
                   ['!','?','"','\'','(',')','/','\\',':',';','#'],
                   ['+','=','*','%','$','€','_','~','<','>','|'],
                   ['⇧','@','&','«','»','[',']','{','}','^','°']];
  const ZAHLEN = [['1','2','3'], ['4','5','6'], ['7','8','9'], ['⌫','0','↵']];

  let feld = null, gross = false, zeichen = false;

  function istZahl(el) { return el.type === 'number' || el.inputMode === 'numeric' || el.dataset.inputmode === 'numeric'; }
  function taste(t) {
    const anzeige = (gross && t.length === 1) ? t.toUpperCase() : t;
    const klasse = t === '⇧' ? 'breit' + (gross ? ' an' : '') : t === '⌫' ? 'breit' : t === '↵' ? 'ok' : '';
    return `<button type="button" class="${klasse}" data-t="${anzeige.replace(/"/g, '&quot;')}">${anzeige.replace(/</g, '&lt;')}</button>`;
  }
  function zeichnen() {
    if (!feld) return;
    const zahl = istZahl(feld);
    tafel.classList.toggle('zahlen', zahl);
    const reihen = zahl ? ZAHLEN : (zeichen ? ZEICHEN : TEXT);
    let html = reihen.map((r) => `<div class="bt-reihe">${r.map(taste).join('')}</div>`).join('');
    if (!zahl) {
      html += `<div class="bt-reihe"><button type="button" class="breit${zeichen ? ' an' : ''}" data-t="#123">${zeichen ? 'ABC' : '#+='}</button>` +
        `<button type="button" class="leer" data-t=" ">Leerzeichen</button>` +
        `<button type="button" class="breit" data-t="⤓">Ausblenden</button>` +
        `<button type="button" class="breit ok" data-t="↵">OK</button></div>`;
    }
    tafel.innerHTML = html;
  }

  function einfuegen(text) {
    const el = feld;
    if (el.maxLength > 0 && el.value.length >= el.maxLength) return;
    try {
      if (typeof el.selectionStart === 'number') {
        el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end');
      } else { el.value += text; }
    } catch (_) { el.value += text; }   // z. B. type=number kennt keine Cursor-Position
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }
  function loeschen() {
    const el = feld;
    try {
      const a = el.selectionStart, e = el.selectionEnd;
      if (typeof a === 'number') {
        if (a !== e) el.setRangeText('', a, e, 'end');
        else if (a > 0) el.setRangeText('', a - 1, a, 'end');
      } else { el.value = el.value.slice(0, -1); }
    } catch (_) { el.value = el.value.slice(0, -1); }
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }

  function zeigen(el) {
    feld = el; gross = false; zeichen = false;
    zeichnen();
    tafel.classList.add('offen');
    document.body.style.paddingBottom = tafel.offsetHeight + 'px';
    setTimeout(() => el.scrollIntoView({block: 'center', behavior: 'smooth'}), 30);
  }
  function verbergen() {
    tafel.classList.remove('offen');
    document.body.style.paddingBottom = '';
    feld = null;
  }

  // Tasten: pointerdown statt click, damit das Eingabefeld den Fokus behält. touchstart/mousedown
  // zusätzlich abfangen – sonst nimmt ein Tipp auf die Tafel dem Feld den Fokus und die Tastatur ginge zu.
  tafel.addEventListener('touchstart', (e) => e.preventDefault(), {passive: false});
  tafel.addEventListener('mousedown', (e) => e.preventDefault());
  tafel.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button');
    e.preventDefault();
    if (!b || !feld) return;
    b.classList.add('gedrueckt'); setTimeout(() => b.classList.remove('gedrueckt'), 120);
    const t = b.dataset.t;
    if (t === '⌫') loeschen();
    else if (t === '⇧') { gross = !gross; zeichnen(); }
    else if (t === '#123') { zeichen = !zeichen; zeichnen(); }
    else if (t === '⤓') { feld.blur(); verbergen(); }
    else if (t === '↵') {
      const form = feld.form, el = feld;
      el.blur(); verbergen();
      if (form) form.requestSubmit(); else el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    } else {
      einfuegen(t);
      if (gross && !zeichen) { gross = false; zeichnen(); }   // Grossbuchstabe gilt für ein Zeichen
    }
  });

  const TEXTARTEN = ['text', 'password', 'number', 'search', 'email', 'url', 'tel', ''];
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TEXTARTEN.includes(el.type))) {
      if (el.inputMode === 'numeric') el.dataset.inputmode = 'numeric';
      el.inputMode = 'none';   // System-Tastatur unterdrücken, wir haben unsere eigene
      zeigen(el);
    }
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => { if (!tafel.contains(document.activeElement) && document.activeElement?.tagName !== 'INPUT'
                            && document.activeElement?.tagName !== 'TEXTAREA') verbergen(); }, 60);
  });
})();
