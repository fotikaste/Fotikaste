// Gästeoberfläche der Fotobox.
// Jede Ansicht legt fest, was die drei Tasten (links, Mitte, rechts) bewirken.
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

// ---------------- Ansichten und Tasten ----------------
// t = [links, mitte, rechts]; jede Taste: {text, los, aus} oder null (unsichtbar)
function zeige(name, t = [null, null, null], {inaktiv = false} = {}) {
  clearTimeout(autoTimer);
  for (const el of document.querySelectorAll('.ansicht')) el.classList.toggle('sichtbar', el.dataset.ansicht === name);
  ansicht = name;
  belegung = t;
  tasten.forEach((el, i) => {
    const b = t[i];
    el.classList.toggle('leer', !b);
    el.classList.toggle('haupt', i === 1 && !!b);
    el.classList.toggle('aus', !!(b && b.aus));
    el.classList.remove('gedrueckt', 'still');
    el.querySelector('.beschriftung').textContent = b ? b.text : '';
  });
  // Kurze Eingabesperre nach jedem Wechsel: Ein doppelter Tastendruck darf nicht
  // versehentlich auch die nächste Ansicht bestätigen.
  gesperrt = true;
  clearTimeout(sperrTimer);
  sperrTimer = setTimeout(() => { gesperrt = false; }, EINGABESPERRE_MS);
  inaktivAktiv = inaktiv;
  inaktivNeuStarten();
}

function druecke(i) {
  // Während «Noch da?» sichtbar ist, bestätigt jede Taste nur die Anwesenheit
  if (!$('#nochda').hidden) { nochdaSchliessen(); return; }
  inaktivNeuStarten();
  const b = belegung[i];
  if (gesperrt || !b || b.aus) return;
  gesperrt = true;                       // jede Ansicht reagiert nur EINMAL
  tasten[i].classList.add('gedrueckt');
  b.los();
}

const TASTEN = {ArrowLeft: 0, '1': 0, a: 0, Enter: 1, ' ': 1, ArrowDown: 1, '2': 1, s: 1, ArrowRight: 2, '3': 2, d: 2};
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;                  // gedrückt gehaltene Taste nicht wiederholen
  if (e.key in TASTEN) { e.preventDefault(); druecke(TASTEN[e.key]); }
});
tasten.forEach((el, i) => el.addEventListener('click', () => druecke(i)));
document.addEventListener('contextmenu', (e) => e.preventDefault());

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
  try { konfig = await api('/api/konfig'); themaAnwenden(konfig); }
  catch { /* alte Konfiguration weiterverwenden */ }
  const los = {text: 'Start', los: starten};
  zeige('start', [{text: '', los: starten}, los, {text: '', los: starten}]);
  tasten[0].classList.add('still'); tasten[2].classList.add('still');
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

async function countdownUndAufnahme() {
  zeige('countdown');
  const zahl = $('#zahl');
  for (let n = konfig.countdown_s; n >= 1; n--) {
    zahl.textContent = n;
    zahl.classList.remove('puls'); void zahl.offsetWidth; zahl.classList.add('puls');
    await warte(1000);
  }
  $('#blitz').classList.remove('an'); void $('#blitz').offsetWidth; $('#blitz').classList.add('an');
  setTimeout(() => $('#blitz').classList.remove('an'), 700);
  zeige('laden');
  $('#laden-text').textContent = 'Dein Foto wird geladen …';
  try {
    const erg = await api(`/api/sitzung/${sitzung}/aufnahme`, {});
    await bildLaden(`/api/sitzung/${sitzung}/vorschau.jpg?n=${erg.aufnahme}`);
    vorschau(erg.wiederholungen_uebrig);
  } catch (e) { fehler(e.fehler); }
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
    {text: wiederholungenUebrig > 0 ? 'Nochmal' : 'Nochmal (aufgebraucht)', aus: wiederholungenUebrig <= 0,
     los: countdownUndAufnahme},
    {text: 'Drucken', aus: !druckMoeglich, los: () => (konfig.max_abzuege > 1 ? anzahlWaehlen() : drucken(1))},
    {text: 'Fertig', los: () => danke(false)},
  ], {inaktiv: true});
}

function anzahlWaehlen(n = 1) {
  const max = Math.min(konfig.max_abzuege, konfig.druck_verbleibend);
  $('#anzahl').textContent = n;
  $('#anzahl-info').textContent = `Höchstens ${max} ${max === 1 ? 'Abzug' : 'Abzüge'}`;
  zeige('anzahl', [
    {text: 'Weniger', aus: n <= 1, los: () => anzahlWaehlen(n - 1)},
    {text: `${n} drucken`, los: () => drucken(n)},
    {text: 'Mehr', aus: n >= max, los: () => anzahlWaehlen(n + 1)},
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

function danke(gedruckt, n = 1) {
  $('#fertig-titel').textContent = 'Danke!';
  $('#fertig-text').textContent = gedruckt
    ? (n === 1 ? 'Bitte nimm dein Foto unten aus der Box.' : `Bitte nimm deine ${n} Fotos unten aus der Box.`)
    : 'Schön, dass du dabei warst.';
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
