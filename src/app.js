import { fetchParcelContext } from './fme-placeholder.js';

const state = {
  step: 'landing',
  rules: null,
  context: {},
  theme: null,
  answers: {},
  filter: ''
};

const app = document.getElementById('app');

init();

async function init() {
  try {
    const response = await fetch('data/rules.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`rules.json kon niet geladen worden: ${response.status}`);
    state.rules = await response.json();
    renderLanding();
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <section class="panel result bad">
        <span class="pill bad">FOUT</span>
        <h1>De checker kon niet laden</h1>
        <p>Controleer of <code>data/rules.json</code> geldige JSON bevat en of je de app via een lokale server opent.</p>
        <pre>${escapeHtml(error.message)}</pre>
      </section>`;
  }
}

function stepper(active) {
  const steps = [
    ['landing', 'Adres & context'],
    ['themes', 'Thema'],
    ['checklist', 'Checklist'],
    ['result', 'Conclusie']
  ];

  return `<nav class="stepper" aria-label="Stappen">${steps
    .map(([id, label]) => `<span class="step ${id === active ? 'active' : ''}">${label}</span>`)
    .join('')}</nav>`;
}

function renderLanding() {
  state.step = 'landing';

  app.innerHTML = `
    ${stepper('landing')}
    <section class="hero">
      <h1>Controleer of een handeling mogelijk vrijgesteld is</h1>
      <p class="lead">Geef eerst een adres in. In deze prototypeversie vraagt de app de planologische context manueel op. Later vult FME/GIS deze velden automatisch aan.</p>
    </section>
    <section class="panel" style="margin-top:1rem">
      <h2>Adres en context</h2>
      <form id="contextForm" class="grid grid-2">
        ${state.rules.contextQuestions.map(renderField).join('')}
        <div class="actions">
          <button class="btn blue" type="submit">Ga naar themakeuze</button>
        </div>
      </form>
      <p class="footer-note">FME-placeholder actief: <code>src/fme-placeholder.js</code>. Nu wordt alleen een dummy-context gebruikt.</p>
    </section>`;

  hydrateForm('contextForm', state.context);

  document.getElementById('contextForm').addEventListener('submit', async event => {
    event.preventDefault();
    state.context = readForm(event.target);

    const gis = await fetchParcelContext(state.context.address || '');
    if (gis?.context) state.context = { ...state.context, ...gis.context };

    renderThemes();
  });
}

function renderThemes() {
  state.step = 'themes';

  const filter = state.filter.trim().toLowerCase();
  const themes = state.rules.themes.filter(theme => themeMatchesFilter(theme, filter));

  app.innerHTML = `
    ${stepper('themes')}
    <section class="panel">
      <h1>Wat wil de burger doen?</h1>
      <p class="muted">Kies het thema dat het best aansluit. Alle hoofdstukken van het Vrijstellingsbesluit zijn opgenomen.</p>
      <input class="searchbar" id="filter" placeholder="Zoek op gevel, isolatie, boom, publiciteit, telecom..." value="${escapeHtml(state.filter)}" autocomplete="off">
      <div class="grid grid-3" id="themeGrid">
        ${themes.length ? themes.map(renderThemeTile).join('') : '<p class="muted">Geen thema gevonden. Probeer een andere zoekterm.</p>'}
      </div>
      <div class="actions">
        <button class="btn secondary" id="back">Terug</button>
      </div>
    </section>`;

  const filterInput = document.getElementById('filter');
  filterInput.addEventListener('input', event => {
    const cursorPos = event.target.selectionStart;
    state.filter = event.target.value;
    renderThemes();

    requestAnimationFrame(() => {
      const input = document.getElementById('filter');
      if (input) {
        input.focus();
        input.setSelectionRange(cursorPos, cursorPos);
      }
    });
  });

  document.getElementById('back').onclick = renderLanding;
  document.querySelectorAll('[data-theme]').forEach(button => {
    button.onclick = () => {
      state.theme = state.rules.themes.find(theme => theme.id === button.dataset.theme);
      state.answers = {};
      renderChecklist();
    };
  });
}

function themeMatchesFilter(theme, filter) {
  if (!filter) return true;

  const questionText = (theme.questions || [])
    .map(question => `${question.label || ''} ${(question.options || []).join(' ')}`)
    .join(' ');

  const haystack = [
    theme.id,
    theme.title,
    theme.chapter,
    theme.article,
    theme.passText,
    ...(theme.tags || []),
    questionText
  ].join(' ').toLowerCase();

  return haystack.includes(filter);
}

function renderThemeTile(theme) {
  return `
    <button class="card tile" data-theme="${theme.id}">
      <span class="chapter">${theme.chapter} - ${theme.article}</span>
      <h3>${escapeHtml(theme.title)}</h3>
      <p class="small">${escapeHtml(theme.passText)}</p>
    </button>`;
}

function renderChecklist() {
  const theme = state.theme;
  const abrQuestions = (theme.abr || []).flatMap(id => state.rules.abrChecks[id]?.questions || []);
  const questions = [...theme.questions, ...abrQuestions];

  app.innerHTML = `
    ${stepper('checklist')}
    <section class="panel">
      <span class="pill">${theme.chapter} - ${theme.article}</span>
      <h1>${escapeHtml(theme.title)}</h1>
      <p>${escapeHtml(theme.passText)}</p>
      <form id="checkForm">
        ${questions.map(question => `<div class="answer-row">${renderField(question)}</div>`).join('')}
        <div class="actions">
          <button class="btn blue" type="submit">Maak conclusie</button>
          <button class="btn secondary" type="button" id="backThemes">Terug naar thema's</button>
        </div>
      </form>
    </section>`;

  hydrateForm('checkForm', state.answers);
  document.getElementById('backThemes').onclick = renderThemes;
  document.getElementById('checkForm').addEventListener('submit', event => {
    event.preventDefault();
    state.answers = readForm(event.target);
    renderResult();
  });
}

function renderResult() {
  const evaluation = evaluate();
  const cls = evaluation.status === 'vrijgesteld' ? 'ok' : evaluation.status === 'niet vrijgesteld' ? 'bad' : '';
  const copyText = buildCopyText(evaluation);

  app.innerHTML = `
    ${stepper('result')}
    <section class="panel result ${cls}">
      <span class="pill ${cls || 'warn'}">${evaluation.status.toUpperCase()}</span>
      <h1>Conclusie</h1>
      <p>${escapeHtml(evaluation.summary)}</p>
      <h2>Redenen</h2>
      <ul>${evaluation.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
      <h2>Kopieerbare basistekst</h2>
      <div class="copybox" id="copyText">${escapeHtml(copyText)}</div>
      <div class="actions">
        <button class="btn blue" id="copyBtn">Kopieer tekst</button>
        <button class="btn secondary" id="edit">Checklist aanpassen</button>
        <button class="btn secondary" id="new">Nieuwe check</button>
      </div>
    </section>`;

  document.getElementById('copyBtn').onclick = async () => {
    await navigator.clipboard.writeText(copyText);
    document.getElementById('copyBtn').textContent = 'Gekopieerd';
  };

  document.getElementById('edit').onclick = renderChecklist;
  document.getElementById('new').onclick = resetCheck;
}

function resetCheck() {
  state.context = {};
  state.theme = null;
  state.answers = {};
  state.filter = '';
  renderLanding();
}

function evaluate() {
  const reasons = [];
  let not = false;
  let research = false;

  for (const globalCheck of state.rules.globalChecks) {
    if (globalCheck.when && Object.entries(globalCheck.when).every(([key, value]) => state.context[key] === value)) {
      reasons.push(globalCheck.reason);
      if (globalCheck.kind === 'not') not = true;
    }

    if (globalCheck.unknowns && globalCheck.unknowns.some(key => !state.context[key] || state.context[key] === 'onbekend')) {
      reasons.push(globalCheck.reason);
      research = true;
    }
  }

  const a = state.answers;
  const t = state.theme;

  for (const value of Object.values(a)) {
    if (value === 'onbekend' || value === '') research = true;
  }

  const ynFail = (id, wanted, text) => {
    if (a[id] && a[id] !== wanted && a[id] !== 'onbekend') {
      not = true;
      reasons.push(text);
    }
  };

  ynFail('legal', 'ja', 'De bestaande toestand is niet hoofdzakelijk vergund of vergund geacht.');
  ynFail('mainlyPermitted', 'ja', 'De woning is niet hoofdzakelijk vergund of vergund geacht.');
  ynFail('function_change', 'nee', 'Er wordt een vergunningsplichtige functiewijziging doorgevoerd.');
  ynFail('housing_units', 'ja', 'Het aantal woongelegenheden blijft niet gelijk.');
  ynFail('rain_own', 'ja', 'Het hemelwater blijft niet op eigen terrein.');
  ynFail('deforestation', 'nee', 'De handeling gaat gepaard met ontbossing of een uitgesloten wijziging.');
  ynFail('heritage_visible', 'nee', 'Erfgoed- of UNESCO-context blokkeert deze zichtbare handeling in de vrijstellingslogica.');
  ynFail('cross_rooilijn', 'nee', 'De rooilijn wordt overschreden.');
  ynFail('visible_road', 'nee', 'De plaatsing of opslag is zichtbaar vanaf de openbare weg.');
  ynFail('actual_living', 'nee', 'De verplaatsbare inrichting wordt effectief bewoond.');
  ynFail('forest', 'nee', 'Bomen in bos vallen buiten deze vrijstelling.');
  ynFail('permeable_replaced', 'nee', 'Waterdoorlatende verharding wordt vervangen door niet-waterdoorlatende verharding.');
  ynFail('publicity_regulation', 'ja', 'De publiciteit voldoet niet aan de Publiciteitsverordening.');
  ynFail('creates_building', 'nee', 'Voor deze telecomvrijstelling mag geen gebouw worden opgericht.');
  ynFail('heritage_object', 'nee', 'Er is erfgoedwaarde of inventariscontext bij de afbraak.');

  // Specifieke controle tijdelijke handelingen / pop-up per goed.
  if (t.id === 'tijdelijk') {
    const previousPeriods = Number(a.previous_popup_periods_30 || 0);
    const requestedPeriods = Number(a.periods_30 || 0);
    const totalPeriods = previousPeriods + requestedPeriods;

    if (a.previous_popup_same_good === 'onbekend') {
      research = true;
      reasons.push('Het is niet duidelijk of er dit kalenderjaar al een pop-up of tijdelijke functiewijziging op hetzelfde goed is geweest.');
    }

    if (a.previous_popup_same_good === 'ja' && !a.previous_popup_periods_30) {
      research = true;
      reasons.push('Het aantal eerder gebruikte periodes van 30 dagen op hetzelfde goed is nog niet ingevuld.');
    }

    if (totalPeriods > 4) {
      not = true;
      reasons.push('Op hetzelfde goed worden meer dan 4 periodes van 30 aaneengesloten dagen per kalenderjaar gebruikt. Daardoor valt de tijdelijke handeling niet onder de vrijstelling.');
    }
  }

  // Specifieke controle bomen in Gent.
  if (t.id === 'groen_boom') {
    if (a.tree_circumference_1m && +a.tree_circumference_1m >= 50) {
      not = true;
      reasons.push('De stamomtrek van de boom is minstens 50 cm op 1 meter hoogte. In Gent is de handeling daardoor vergunningsplichtig.');
    }

    if (a.tree_circumference_base && +a.tree_circumference_base >= 75) {
      not = true;
      reasons.push('De stamomtrek van de boom is minstens 75 cm aan het maaiveld. In Gent is de handeling daardoor vergunningsplichtig.');
    }
  }

  // Specifieke controle warmtepomp/airco bij woningen.
  if (t.id === 'woning_airco') {
    const distance = Number(a.airco_distance);

    if (a.airco_place === 'ander') {
      not = true;
      reasons.push('Het buitendeel van de warmtepomp of airco wordt niet geplaatst in de tuin, op een gevel of op een plat dak.');
    }

    if (!a.airco_distance && a.airco_against_wall !== 'ja') {
      research = true;
      reasons.push('De afstand van het buitendeel tot de perceelsgrens is nog niet ingevuld.');
    }

    if (a.airco_against_wall === 'onbekend') {
      research = true;
      reasons.push('Het is nog niet duidelijk of het buitendeel tegen een bestaande scheidingsmuur wordt geplaatst.');
    }

    if (a.airco_against_wall === 'ja') {
      // Vrijgesteld op basis van plaatsing tegen bestaande scheidingsmuur.
    } else if (a.airco_distance && distance >= 2) {
      // Vrijgesteld op basis van afstand van minstens 2 meter.
    } else if (a.airco_distance && distance > 0 && distance < 2) {
      not = true;
      reasons.push('Het buitendeel staat op meer dan 0 meter en minder dan 2 meter van de perceelsgrens. Daardoor valt de plaatsing niet onder de vrijstelling.');
    } else if (a.airco_distance && distance === 0 && a.airco_against_wall === 'nee') {
      not = true;
      reasons.push('Het buitendeel staat op de perceelsgrens, maar wordt niet tegen een bestaande scheidingsmuur geplaatst. Daardoor valt de plaatsing niet onder de vrijstelling.');
    }
  }

  // Specifieke controle zonnepanelen/zonneboiler bij woningen.
  if (t.id === 'woning_zonnepanelen') {
    if (a.placementType === 'op een andere plaats') {
      not = true;
      reasons.push('De zonnepanelen of zonneboiler worden niet geplaatst volgens een plaatsingswijze die in artikel 2.1, 3° is opgenomen.');
    }

    if (a.placementType === 'op een plat dak' && +a.heightAboveRoofEdgeM > 1) {
      not = true;
      reasons.push('Bij plaatsing op een plat dak mogen zonnepanelen of zonneboilers maximaal 1 meter boven de dakrand uitkomen.');
    }

    if (a.placementType === 'op een gevel' && +a.facadeAreaM2 > 4) {
      not = true;
      reasons.push('Bij plaatsing op een gevel is de vrijstelling beperkt tot maximaal 4 m² per gevel.');
    }

    if (
      (a.placementType === 'op een gevel' || a.placementType === 'aan een balkonafsluiting') &&
      a.worldHeritageZone === 'ja'
    ) {
      not = true;
      reasons.push('Voor plaatsing op een gevel of balkonafsluiting geldt de vrijstelling niet in werelderfgoed of in een bufferzone van werelderfgoed.');
    }

    if (
      (a.placementType === 'op een gevel' || a.placementType === 'aan een balkonafsluiting') &&
      a.inventoryHeritageNotProtected === 'ja'
    ) {
      not = true;
      reasons.push('Voor plaatsing op een gevel of balkonafsluiting geldt de vrijstelling niet bij een gebouw op de vastgestelde inventaris van bouwkundig erfgoed dat niet beschermd is.');
    }
  }

  numMax('insulation_cm', 26, 'De buitenisolatie is dikker dan 26 cm.');
  numMax('area_total', inferAreaMax(t.id), `De opgegeven oppervlakte overschrijdt de richtdrempel voor ${t.article}.`);
  numMax('height', inferHeightMax(t.id), `De opgegeven hoogte overschrijdt de richtdrempel voor ${t.article}.`);
  numMax('above_ridge', 3, 'De technische constructie steekt meer dan 3 m boven de nok uit.');
  numMax('volume', inferVolumeMax(t.id), `Het opgegeven volume overschrijdt de richtdrempel voor ${t.article}.`);
  numMax('periods_30', 4, 'De 4 periodes van 30 dagen per kalenderjaar worden overschreden.');
  numMax('duration_years', 2, 'De maximale duur voor tijdelijke verplaatsbare constructies tijdens werken wordt overschreden.');
  numMax('relief_cm', 50, 'De reliëfwijziging is 50 cm of meer waar de kleine vrijstelling dat beperkt.');

  // ABR checks.
  if ((+a.abr_tree_circ_1m >= 50) || (+a.abr_tree_circ_base >= 75)) {
    not = true;
    reasons.push(state.rules.abrChecks.treeGent.fail);
  }

  if (+a.abr_driveway_count > 1 && state.context.zone !== 'afgebakend zeehavengebied') {
    not = true;
    reasons.push('ABR: buiten zeehavengebied is standaard maximaal één oprit toegestaan.');
  }

  if (+a.abr_driveway_slope > 4) {
    not = true;
    reasons.push('ABR: de oprit heeft in de eerste 5 m vanaf de rooilijn meer dan 4% helling.');
  }

  if (a.abr_driveway_autofree === 'ja') {
    not = true;
    reasons.push('ABR: nieuwe opritten naar private parkeerplaatsen in autovrij gebied zijn niet toegestaan.');
  }

  const road = +a.abr_driveway_road_width;
  const width = +a.abr_driveway_width;

  if (road && width) {
    const max = road <= 4
      ? 4.5
      : road <= 4.5
        ? 4
        : road <= 5.5
          ? 3.5
          : 3;

    if (width > max) {
      not = true;
      reasons.push(`ABR: bij deze rijwegbreedte is de oprit aan de rooilijn maximaal ${max} m.`);
    }
  }

  if (a.abr_roof_flat === 'ja' && +a.abr_roof_area > 6 && a.abr_roof_solution === 'nee') {
    not = true;
    reasons.push(state.rules.abrChecks.greenRoofGent.fail);
  }

  if (a.abr_paving_minimal === 'nee' || a.abr_paving_infiltration === 'nee') {
    not = true;
    reasons.push(state.rules.abrChecks.pavingGent.fail);
  }

  if (+a.abr_ditch_length > 5 || a.abr_ditch_one === 'nee' || a.abr_ditch_connections === 'ja') {
    not = true;
    reasons.push(state.rules.abrChecks.ditchGent.fail);
  }

  if (a.abr_horeca_change === 'ja') {
    not = true;
    reasons.push(state.rules.abrChecks.horecaGent.fail);
  }

  if (!reasons.length) reasons.push(t.passText);

  const status = not ? 'niet vrijgesteld' : research ? 'bijkomend onderzoek nodig' : 'vrijgesteld';
  const summary = status === 'vrijgesteld'
    ? 'Op basis van de ingevulde gegevens valt de handeling onder een vrijstelling.'
    : status === 'niet vrijgesteld'
      ? 'Op basis van de ingevulde gegevens is een omgevingsvergunning voor stedenbouwkundige handelingen nodig.'
      : 'De ingevulde gegevens volstaan nog niet voor een definitieve uitspraak.';

  return { status, summary, reasons };

  function numMax(id, max, text) {
    if (!max) return;
    const value = +a[id];
    if (value && value > max) {
      not = true;
      reasons.push(text);
    }
  }
}

function inferAreaMax(id) {
  if (id.includes('niet_overdekt')) return 80;
  if (id.includes('bijgebouw')) return 40;
  if (id.includes('woning_laad_afval')) return 10;
  if (id.includes('andere_gebouwen')) return 20;
  if (id.includes('openbaar_domein')) return 300;
  if (id.includes('algemeen_belang')) return 250;
  if (id.includes('divers')) return 100;
  return null;
}

function inferHeightMax(id) {
  if (id.includes('bijgebouw') || id.includes('tijdelijk')) return 3.5;
  if (id.includes('openbaar_domein')) return 5;
  return null;
}

function inferVolumeMax(id) {
  if (id.includes('woning_opslag')) return 10;
  if (id.includes('algemeen_belang')) return 30;
  if (id.includes('landbouw')) return 200;
  return null;
}

function buildCopyText(evaluation) {
  return `Beste\n\nWe hebben de vraag getoetst aan het Vrijstellingsbesluit en de relevante Gentse ABR-controles.\n\nHandeling: ${state.theme.title}\nAdres/perceel: ${state.context.address || 'niet ingevuld'}\n\nConclusie: ${evaluation.status.toUpperCase()}\n\nMotivering:\n- ${evaluation.reasons.join('\n- ')}\n\nDeze beoordeling is gebaseerd op de ingevulde gegevens. Andere regelgeving, burgerrechtelijke aspecten, erfgoedtoelatingen, milieuregels en uitvoeringsvoorwaarden blijven mogelijk van toepassing.\n\nMet vriendelijke groeten`;
}

function renderField(question) {
  const unit = question.unit ? ` <span class="hint">(${question.unit})</span>` : '';

  if (question.type === 'text') {
    return `<div><label for="${question.id}">${escapeHtml(question.label)}${unit}</label><input id="${question.id}" name="${question.id}" placeholder="${escapeHtml(question.placeholder || '')}"></div>`;
  }

  if (question.type === 'number') {
    return `<div><label for="${question.id}">${escapeHtml(question.label)}${unit}</label><input id="${question.id}" name="${question.id}" inputmode="decimal" type="number" step="any"></div>`;
  }

  return `<div><label for="${question.id}">${escapeHtml(question.label)}${unit}</label><select id="${question.id}" name="${question.id}">${(question.options || ['onbekend', 'ja', 'nee']).map(option => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}</select></div>`;
}

function hydrateForm(id, data) {
  const form = document.getElementById(id);
  Object.entries(data || {}).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}
