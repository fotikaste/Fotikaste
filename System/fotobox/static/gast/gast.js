// Gästeoberfläche der Fotobox – Bedienung per Touchscreen (seit 2026-11-17 keine physischen Tasten mehr).
// Jede Ansicht legt fest, welche Knöpfe erscheinen: links (Nebenaktion), Mitte (Hauptaktion), rechts (Nebenaktion).
// Die Tastatur (Pfeile, Enter) funktioniert zum Testen am PC weiterhin.
// Die eigentlichen Regeln (Wiederholungen, Doppeldruck, Kontingent) prüft zusätzlich der Server.
'use strict';

const $ = (s) => document.querySelector(s);
const buehne = $('#buehne');
const tasten = [...document.querySelectorAll('.taste')];

let konfig = null;
let sitzung = null;          // Kennung der laufenden Sitzung
let belegung = [null, null, null];
let gesperrt = true;         // verhindert Doppelauslösung
let ansicht = null;
let inaktivAktiv = false;
let inaktivTimer = null, nochdaTimer = null, autoTimer = null, sperrTimer = null;
const EINGABESPERRE_MS = 500;

// ---------------- Server-Aufrufe ----------------
async function api(pfad, daten) {
  const opt = daten === undefined ? {} : {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(daten)};
  let r;
  try { r = await fetch(pfad, opt); }
  catch { throw {fehler: 'verbindung'}; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw {fehler: j.fehler || 'intern'};
  return j;
}

// ---------------- Thema ----------------
function themaAnwenden(k) {
  const root = document.documentElement.style;
  for (const [n, w] of Object.entries(k.thema.farben)) root.setProperty('--' + n, w);
  const schriftName = {'GreatVibes-Regular.ttf': 'Great Vibes', 'Parisienne-Regular.ttf': 'Parisienne',
    'Pacifico-Regular.ttf': 'Pacifico', 'PinyonScript-Regular.ttf': 'Pinyon Script'}[k.thema.schrift];
  root.setProperty('--name-font', `"${schriftName}"`);
  root.setProperty('--name-gr', k.thema.name_gr + 'rem');
  buehne.dataset.deko = k.thema.deko;
  for (const el of document.querySelectorAll('[data-feld]')) el.textContent = k.veranstaltung[el.dataset.feld] || '';
  $('.karte-rahmen').style.aspectRatio = String(k.seitenverhaeltnis);
  buehne.classList.add('bereit');
}

function schneeErzeugen() {
  const s = $('#schnee');
  for (let i = 0; i < 40; i++) {
    const f = document.createElement('i');
    f.style.left = Math.random() * 100 + '%';
    f.style.animationDuration = 9 + Math.random() * 10 + 's';
    f.style.animationDelay = -Math.random() * 18 + 's';
    s.appendChild(f);
  }
}

// ---------------- Ansichten und Knöpfe ----------------
// t = [links, mitte, rechts]; jeder Knopf: {text, los, aus} oder null (nicht angezeigt)
function zeige(name, t = [null, null, null], {inaktiv = false} = {}) {
  clearTimeout(autoTimer);
  if (name !== 'countdown') liveStop();   // Livebild nur beim Ausrichten und im Countdown
  for (const el of document.querySelectorAll('.ansicht')) el.classList.toggle('sichtbar', el.dataset.ansicht === name);
  ansicht = name;
  buehne.dataset.ansicht = name;
  belegung = t;
  $('#leiste').classList.remove('versteckt');
  tasten.forEach((el, i) => {
    const b = t[i];
    el.classList.toggle('leer', !b);
    el.classList.toggle('haupt', i === 1 && !!b);
    el.classList.toggle('aus', !!(b && b.aus));
    el.classList.remove('gedrueckt');
    el.querySelector('.beschriftung').textContent = b ? b.text : '';
  });
  // Kurze Eingabesperre nach jedem Wechsel: Ein doppeltes Antippen darf nicht
  // versehentlich auch die nächste Ansicht bestätigen.
  gesperrt = true;
  clearTimeout(sperrTimer);
  sperrTimer = setTimeout(() => { gesperrt = false; }, EINGABESPERRE_MS);
  inaktivAktiv = inaktiv;
  inaktivNeuStarten();
}

function druecke(i) {
  // Während «Noch da?» sichtbar ist, bestätigt jede Berührung nur die Anwesenheit
  if (!$('#nochda').hidden) { nochdaSchliessen(); return; }
  inaktivNeuStarten();
  const b = belegung[i];
  if (gesperrt || !b || b.aus) return;
  gesperrt = true;                       // jede Ansicht reagiert nur EINMAL
  tasten[i].classList.add('gedrueckt');
  b.los();
}

const TASTEN = {ArrowLeft: 0, '1': 0, a: 0, Enter: 1, ' ': 1, ArrowDown: 1, '2': 1, s: 1, ArrowRight: 2, '3': 2, d: 2};
// Kiosk-Modus (Raspberry Pi): kein Mauszeiger. Betreiber mit Tastatur: Strg+Umschalt+B öffnet den Betrieb.
try { if (new URLSearchParams(location.search).has('kiosk')) sessionStorage.setItem('kiosk', '1'); } catch (_) {}
try { if (sessionStorage.getItem('kiosk')) document.documentElement.classList.add('kiosk'); } catch (_) {}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') { location.href = '/betrieb'; return; }
  if (e.repeat) return;                  // gedrückt gehaltene Taste nicht wiederholen
  if (e.key in TASTEN) { e.preventDefault(); druecke(TASTEN[e.key]); }
});
tasten.forEach((el, i) => el.addEventListener('click', (e) => { e.stopPropagation(); druecke(i); }));
document.addEventListener('contextmenu', (e) => e.preventDefault());

// Startseite: der grosse Knopf – oder ein Tipp irgendwo auf den Bildschirm – startet.
// «Noch da?»: ein Tipp irgendwo bestätigt die Anwesenheit.
buehne.addEventListener('click', () => {
  if (!$('#nochda').hidden) { nochdaSchliessen(); return; }
  if (ansicht === 'start' && !betriebGeoeffnet) druecke(1);
});

// Ohne Tastatur: Namen oben auf der Startseite 3 Sekunden gedrückt halten → «Internet einrichten» (Kunden-Code);
// von dort führt ein Link zur Betriebsseite (Betreiber-PIN).
let betriebTimer = null, betriebGeoeffnet = false;
const kopf = $('.kopf');
kopf.addEventListener('pointerdown', () => {
  clearTimeout(betriebTimer);
  betriebTimer = setTimeout(() => { betriebGeoeffnet = true; location.href = '/internet'; }, 3000);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) kopf.addEventListener(ev, () => clearTimeout(betriebTimer));

// ---------------- Inaktivität ----------------
function inaktivNeuStarten() {
  clearTimeout(inaktivTimer);
  if (inaktivAktiv && konfig) inaktivTimer = setTimeout(nochdaZeigen, konfig.inaktiv_s * 1000);
}
function nochdaZeigen() {
  let rest = konfig.inaktiv_warnung_s;
  $('#nochda-zahl').textContent = rest;
  $('#nochda').hidden = false;
  nochdaTimer = setInterval(() => {
    rest -= 1;
    $('#nochda-zahl').textContent = rest;
    if (rest <= 0) { nochdaSchliessen(); beenden('inaktiv'); }
  }, 1000);
}
function nochdaSchliessen() {
  clearInterval(nochdaTimer);
  $('#nochda').hidden = true;
  inaktivNeuStarten();
}

// ---------------- Ablauf ----------------
async function startbildschirm() {
  sitzung = null;
  const bild = $('#vorschau-bild');
  bild.removeAttribute('src');           // Foto der vorherigen Gäste sofort entfernen
  $('#qr').innerHTML = '';                 // ebenso ihren QR-Code
  try { konfig = await api('/api/konfig'); themaAnwenden(konfig); }
  catch { buehne.classList.add('bereit'); /* alte Konfiguration weiterverwenden */ }
  // Auf der Startseite gibt es nur den grossen Knopf in der Mitte (keine Knopfleiste unten)
  zeige('start', [null, {text: 'Foto machen', los: starten}, null]);
  $('#leiste').classList.add('versteckt');
}

async function starten() {
  zeige('laden', undefined);
  $('#laden-text').textContent = 'Einen Moment …';
  try {
    const s = await api('/api/sitzung', {anfrage_id: crypto.randomUUID()});
    sitzung = s.id;
    await countdownUndAufnahme();
  } catch (e) { fehler(e.fehler); }
}

function warte(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ---------------- Livebild ----------------
// Holt laufend Einzelbilder vom Server und zeichnet sie gespiegelt (wie ein Spiegel).
// Fällt das Livebild aus, geht der Ablauf einfach ohne weiter – es blockiert nie die Aufnahme.
let liveToken = 0;
let stillhalten = false;   // während die Kamera scharfstellt und auslöst

function liveStop() { liveToken++; }

function liveAus() {
  liveStop();
  $('#countdown').classList.remove('mit-livebild');
}

async function liveSchleife() {
  const token = ++liveToken;
  const canvas = $('#live-bild');
  const ctx = canvas.getContext('2d');
  let fehlversuche = 0;
  while (token === liveToken) {
    const t0 = performance.now();
    try {
      const r = await fetch(`/api/sitzung/${sitzung}/livebild.jpg?t=${Date.now()}`);
      if (!r.ok) throw new Error(r.status);
      const bild = await createImageBitmap(await r.blob());
      if (token !== liveToken) return;
      if (canvas.width !== bild.width) { canvas.width = bild.width; canvas.height = bild.height; }
      ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);   // spiegeln
      ctx.drawImage(bild, 0, 0);
      fehlversuche = 0;
    } catch {
      // Während des Auslösens kann das Livebild kurz stocken – dann nicht ausblenden
      if (++fehlversuche >= 8 && !stillhalten) { liveAus(); return; }
    }
    await warte(Math.max(0, 90 - (performance.now() - t0)));   // höchstens ca. 11 Bilder/s
  }
}

function rahmenSetzen() {
  const a = konfig.ausschnitt;
  Object.assign($('#live-rahmen').style, {left: a.x * 100 + '%', top: a.y * 100 + '%', width: a.w * 100 + '%', height: a.h * 100 + '%'});
}

// Schritt 1: Ausrichten. Mit Livebild sehen sich die Gäste im Rahmen und starten selbst.
// Ohne Livebild geht es wie bisher direkt in den Countdown.
async function countdownUndAufnahme() {
  const zahl = $('#zahl');
  zahl.classList.add('leer');
  $('#countdown-text').textContent = 'Einen Moment …';
  $('#countdown').classList.remove('mit-livebild');
  zeige('countdown');
  let mitLive = false;
  try { mitLive = (await api(`/api/sitzung/${sitzung}/livebild`, {})).livebild; } catch { mitLive = false; }
  if (!mitLive) return countdownStarten();
  rahmenSetzen();
  $('#countdown').classList.add('mit-livebild');
  $('#countdown-text').textContent = 'Stellt euch in den Rahmen – dann auf «Countdown starten» tippen';
  liveSchleife();
  zeige('countdown', [
    {text: 'Abbrechen', los: () => beenden('abgebrochen')},
    {text: 'Countdown starten', los: countdownStarten},
    null,
  ], {inaktiv: true});
}

// Schritt 2: Countdown (über dem Livebild, falls vorhanden) und Aufnahme
async function countdownStarten() {
  zeige('countdown');
  $('#countdown-text').textContent = 'Schau in die Kamera';
  // Während der Countdown läuft, stellt die Kamera schon scharf – bei «0» löst sie sofort aus.
  if ($('#countdown').classList.contains('mit-livebild')) api(`/api/sitzung/${sitzung}/fokus`, {}).catch(() => {});
  const zahl = $('#zahl');
  zahl.classList.remove('leer');
  for (let n = konfig.countdown_s; n >= 1; n--) {
    zahl.textContent = n;
    zahl.classList.remove('puls'); void zahl.offsetWidth; zahl.classList.add('puls');
    await warte(1000);
  }
  // Die Kamera stellt nach dem Countdown noch scharf und löst erst dann aus (bis zu einigen
  // Sekunden). Darum bitten wir freundlich ums Stillhalten, bis das Foto wirklich im Kasten ist.
  const mitLive = $('#countdown').classList.contains('mit-livebild');
  stillhalten = true;
  if (mitLive) {
    zahl.classList.add('leer');
    $('#countdown-text').textContent = 'Die Kamera stellt scharf';
    $('#countdown').classList.add('stillhalten');
  } else {
    zeige('laden');
    $('#laden-text').textContent = 'Bitte noch einen Moment stillhalten …';
  }
  try {
    const erg = await api(`/api/sitzung/${sitzung}/aufnahme`, {});
    blitz();                               // erst jetzt ist das Foto wirklich gemacht
    stillhalten = false;
    $('#countdown').classList.remove('stillhalten');
    liveStop();
    zeige('laden');
    $('#laden-text').textContent = 'Geschafft! Dein Foto wird vorbereitet …';
    await bildLaden(`/api/sitzung/${sitzung}/vorschau.jpg?n=${erg.aufnahme}`);
    vorschau(erg.wiederholungen_uebrig);
  } catch (e) {
    stillhalten = false;
    $('#countdown').classList.remove('stillhalten');
    fehler(e.fehler);
  }
}

function blitz() {
  const b = $('#blitz');
  b.classList.remove('an'); void b.offsetWidth; b.classList.add('an');
  setTimeout(() => b.classList.remove('an'), 700);
}

function bildLaden(url) {
  return new Promise((ok, nein) => {
    const img = $('#vorschau-bild');
    img.onload = () => ok();
    img.onerror = () => nein({fehler: 'speichern'});
    img.src = url;
  });
}

function vorschau(wiederholungenUebrig) {
  const druckMoeglich = konfig.druck_verbleibend > 0;
  $('#vorschau-info').textContent = druckMoeglich ? '' : 'Drucken ist gerade leider nicht möglich.';
  zeige('vorschau', [
    wiederholungenUebrig > 0 ? {text: 'Nochmal', los: countdownUndAufnahme} : null,
    {text: 'Drucken', aus: !druckMoeglich, los: () => (konfig.max_abzuege > 1 ? anzahlWaehlen() : drucken(1))},
    {text: 'Fertig', los: () => danke(false)},
  ], {inaktiv: true});
}

function anzahlWaehlen(n = 1) {
  const max = Math.min(konfig.max_abzuege, konfig.druck_verbleibend);
  $('#anzahl').textContent = n;
  $('#anzahl-info').textContent = `Höchstens ${max} ${max === 1 ? 'Abzug' : 'Abzüge'}`;
  zeige('anzahl', [
    {text: '−  Weniger', aus: n <= 1, los: () => anzahlWaehlen(n - 1)},
    {text: n === 1 ? '1 Abzug drucken' : `${n} Abzüge drucken`, los: () => drucken(n)},
    {text: 'Mehr  +', aus: n >= max, los: () => anzahlWaehlen(n + 1)},
  ], {inaktiv: true});
}

async function drucken(n) {
  zeige('druck');
  try {
    const a = await api(`/api/sitzung/${sitzung}/drucken`, {abzuege: n});
    const ende = Date.now() + 150000;
    let status = a.status;
    while (status === 'angefordert' || status === 'warteschlange') {
      if (Date.now() > ende) { status = 'unbekannt'; break; }
      await warte(700);
      status = (await api(`/api/druck/${a.auftrag_id}`)).status;
    }
    if (status === 'erfolgreich') danke(true, n);
    else druckProblem();
  } catch (e) {
    if (e.fehler === 'kontingent') { konfig.druck_verbleibend = 0; fehler('kontingent'); }
    else druckProblem();
  }
}

function druckProblem() {
  // Gäste erfahren nur, was sie tun sollen. Den Fehler sieht der Betreiber im Betriebsbereich.
  $('#fehler-titel').textContent = 'Fast geschafft';
  $('#fehler-text').textContent = 'Dein Foto ist gespeichert. Der Drucker braucht kurz Hilfe – bitte melde dich beim Team, wir drucken es für dich nach.';
  zeige('fehler', [null, {text: 'Verstanden', los: () => beenden('beendet')}, null]);
  autoTimer = setTimeout(() => beenden('beendet'), 20000);
}

// Abschluss: je nach Einstellung erst fragen, ob der Gast sein Foto aufs Handy möchte.
function danke(gedruckt, n = 1) {
  const modus = konfig.galerie_modus;
  if (modus === 'immer') return handyQr(gedruckt, n);
  if (modus !== 'nachfrage') return dankeAnzeigen(gedruckt, n);
  $('#handy-frage-text').textContent =
    `Du bekommst einen QR-Code. Das Foto ist dann ${konfig.galerie_tage} Tage online abrufbar – nur mit diesem Code.`;
  zeige('handy-frage', [
    {text: 'Nein, danke', los: () => dankeAnzeigen(gedruckt, n)},
    {text: 'Ja, aufs Handy', los: () => handyQr(gedruckt, n)},
    null,
  ], {inaktiv: true});
}

async function handyQr(gedruckt, n) {
  zeige('laden');
  $('#laden-text').textContent = 'Einen Moment …';
  try {
    const erg = await api(`/api/sitzung/${sitzung}/handy`, {});
    $('#qr').innerHTML = erg.qr_svg;                     // vom Server erzeugte Grafik
    $('#qr-sim').hidden = !erg.simuliert;
    $('#handy-text').textContent = `Mit der Handykamera scannen. Das Foto ist ${erg.tage} Tage online – nur mit diesem Code.`;
    $('#handy-druck').textContent = gedruckt
      ? (n === 1 ? 'Dein Ausdruck liegt unten im Fach.' : `Deine ${n} Ausdrucke liegen unten im Fach.`) : '';
    zeige('handy', [null, {text: 'Fertig', los: () => beenden('beendet')}, null]);
    autoTimer = setTimeout(() => beenden('beendet'), 60000);   // genug Zeit zum Scannen
  } catch {
    dankeAnzeigen(gedruckt, n, 'Fürs Handy hat es gerade leider nicht geklappt.');
  }
}

function dankeAnzeigen(gedruckt, n = 1, zusatz = '') {
  $('#fertig-titel').textContent = 'Danke!';
  $('#fertig-text').textContent = gedruckt
    ? (n === 1 ? 'Bitte nimm dein Foto unten aus der Box.' : `Bitte nimm deine ${n} Fotos unten aus der Box.`)
    : 'Schön, dass du dabei warst.';
  if (zusatz) $('#fertig-text').textContent += ' ' + zusatz;
  $('#qr').innerHTML = '';                 // QR-Code der vorherigen Gäste nie stehen lassen
  zeige('fertig');
  autoTimer = setTimeout(() => beenden('beendet'), (gedruckt ? konfig.abschluss_s : 4) * 1000);
}

async function beenden(grund) {
  clearTimeout(autoTimer);
  const sid = sitzung;
  sitzung = null;
  if (sid) { try { await api(`/api/sitzung/${sid}/ende`, {grund}); } catch { /* egal: Server beendet sie beim nächsten Start */ } }
  startbildschirm();
}

const FEHLERTEXTE = {
  kamera_nicht_bereit: ['Kurze Pause', 'Die Kamera ist gerade nicht bereit. Bitte melde dich beim Team.'],
  kamera_nicht_verbunden: ['Kurze Pause', 'Die Kamera ist gerade nicht erreichbar. Versuch es gleich nochmal.'],
  kamera_zeitueberschreitung: ['Kurze Pause', 'Die Kamera hat nicht reagiert. Versuch es gleich nochmal.'],
  kamera_fehler: ['Kurze Pause', 'Das Foto hat nicht geklappt. Versuch es gleich nochmal.'],
  kamera_falsche_kamera: ['Kurze Pause', 'Die Kamera ist gerade nicht erreichbar. Versuch es gleich nochmal.'],
  speicher_voll: ['Kurze Pause', 'Die Fotobox braucht kurz Hilfe. Bitte melde dich beim Team.'],
  speichern: ['Kurze Pause', 'Das Foto konnte nicht gespeichert werden. Bitte melde dich beim Team.'],
  kontingent: ['Drucken nicht mehr möglich', 'Für diese Veranstaltung sind keine Abzüge mehr verfügbar.'],
};

function fehler(code) {
  const [titel, text] = FEHLERTEXTE[code] || ['Kurze Pause', 'Etwas hat nicht geklappt. Versuch es gleich nochmal.'];
  $('#fehler-titel').textContent = titel;
  $('#fehler-text').textContent = text;
  const nochmalMoeglich = sitzung && code && code.startsWith('kamera_') && code !== 'kamera_nicht_bereit';
  zeige('fehler', [
    {text: 'Abbrechen', los: () => beenden('abgebrochen')},
    nochmalMoeglich ? {text: 'Nochmal versuchen', los: countdownUndAufnahme} : {text: 'Zum Start', los: () => beenden('abgebrochen')},
    null,
  ], {inaktiv: true});
}

schneeErzeugen();
startbildschirm();
