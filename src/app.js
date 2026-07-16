import { fetchParcelContext } from './fme-placeholder.js';

const state = {
  step: 'landing',
  rules: null,
  context: {},
  route: {},
  theme: null,
  answers: {},
  filter: ''
};

const app = document.getElementById('app');
init();

async function init() {
  try {
    const response = await fetch('data/rules.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`rules.json kon niet worden geladen (${response.status})`);
    state.rules = await response.json();
    sanitizeDummyRules();
    renderLanding();
  } catch (error) {
    app.innerHTML = `<section class="panel result bad"><h1>De checker kon niet starten</h1><p>${escapeHtml(error.message)}</p></section>`;
    console.error(error);
  }
}

function sanitizeDummyRules() {
  state.rules.contextQuestions = (state.rules.contextQuestions || []).filter(question => question.id !== 'gis_mer');
  state.rules.globalChecks = (state.rules.globalChecks || []).filter(check => check.id !== 'impact_study' && !Object.prototype.hasOwnProperty.call(check.when || {}, 'gis_mer'));
  for (const check of state.rules.globalChecks) {
    if (Array.isArray(check.unknowns)) check.unknowns = check.unknowns.filter(field => field !== 'gis_mer');
  }
}

function stepper(active) {
  const steps = [
    ['landing', 'Adres & context'],
    ['route', 'Projectcontext'],
    ['themes', 'Thema'],
    ['checklist', 'Checklist'],
    ['result', 'Conclusie']
  ];
  return `<nav class="stepper" aria-label="Stappen">${steps.map(([id, label]) => `<span class="step ${id === active ? 'active' : ''}">${label}</span>`).join('')}</nav>`;
}

function renderLanding() {
  state.step = 'landing';
  app.innerHTML = `${stepper('landing')}
    <section class="hero">
      <h1>Controleer of een handeling mogelijk vrijgesteld is</h1>
      <p class="lead">Vul eerst het adres en de algemene context in. Deze dummyversie werkt zonder automatische FME-koppeling.</p>
    </section>
    <section class="panel" style="margin-top:1rem">
      <h2>Adres en algemene context</h2>
      <form id="contextForm" class="grid grid-2">
        ${state.rules.contextQuestions.map(q => renderField(q, state.context)).join('')}
        <div class="actions"><button class="btn blue" type="submit">Ga naar projectcontext</button></div>
      </form>
    </section>`;

  document.getElementById('contextForm').addEventListener('submit', async event => {
    event.preventDefault();
    state.context = readForm(event.target);
    try {
      const gis = await fetchParcelContext(state.context.address || '');
      if (gis?.context) state.context = { ...state.context, ...gis.context };
    } catch (error) {
      console.warn('FME-placeholder gaf geen context terug.', error);
    }
    renderRoute();
  });
}

function renderRoute() {
  state.step = 'route';
  app.innerHTML = `${stepper('route')}
    <section class="panel">
      <h1>Waarover gaat de handeling?</h1>
      <p class="muted">Deze keuze bepaalt welke thema's en vragen relevant zijn.</p>
      <form id="routeForm">
        <div id="routeFields"></div>
        <div class="actions">
          <button class="btn blue" type="submit">Toon relevante thema's</button>
          <button class="btn secondary" type="button" id="backLanding">Terug</button>
        </div>
      </form>
    </section>`;

  const form = document.getElementById('routeForm');
  form.addEventListener('change', () => {
    state.route = { ...state.route, ...readForm(form) };
    renderDynamicFields('routeFields', state.rules.routeQuestions || [], state.route, 'routeForm');
  });
  renderDynamicFields('routeFields', state.rules.routeQuestions || [], state.route, 'routeForm');
  document.getElementById('backLanding').onclick = renderLanding;
  form.addEventListener('submit', event => {
    event.preventDefault();
    state.route = readForm(form);
    if (!state.route.project_context || state.route.project_context === 'onbekend') {
      alert('Kies eerst waarop de handeling betrekking heeft.');
      return;
    }
    renderThemes();
  });
}

function renderThemes() {
  state.step = 'themes';
  const query = state.filter.trim().toLowerCase();
  const themes = state.rules.themes.filter(theme => routeMatches(theme.route, state.route)).filter(theme => {
    const haystack = [theme.title, theme.chapter, theme.article, ...(theme.tags || []), theme.passText, ...(theme.questions || []).map(q => q.label), ...(theme.questions || []).flatMap(q => q.options || [])].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  app.innerHTML = `${stepper('themes')}
    <section class="panel">
      <h1>Wat wil de burger doen?</h1>
      <p class="muted">Er worden alleen thema's getoond die passen bij de gekozen projectcontext.</p>
      <input class="searchbar" id="filter" placeholder="Zoek op gevel, boom, publiciteit, telecom..." value="${escapeHtml(state.filter)}">
      <div class="grid grid-3">
        ${themes.length ? themes.map(theme => `<button class="card tile" data-theme="${escapeHtml(theme.id)}"><span class="chapter">${escapeHtml(theme.chapter)} - ${escapeHtml(theme.article)}</span><h3>${escapeHtml(theme.title)}</h3><p class="small">${escapeHtml(theme.passText)}</p></button>`).join('') : '<p>Geen thema gevonden voor deze projectcontext of zoekterm.</p>'}
      </div>
      <div class="actions">
        <button class="btn secondary" id="backRoute">Projectcontext aanpassen</button>
        <button class="btn secondary" id="backLanding">Adres en context aanpassen</button>
      </div>
    </section>`;

  const filter = document.getElementById('filter');
  filter.addEventListener('input', event => {
    const cursor = event.target.selectionStart;
    state.filter = event.target.value;
    renderThemes();
    requestAnimationFrame(() => {
      const next = document.getElementById('filter');
      next?.focus();
      next?.setSelectionRange(cursor, cursor);
    });
  });
  document.getElementById('backRoute').onclick = renderRoute;
  document.getElementById('backLanding').onclick = renderLanding;
  document.querySelectorAll('[data-theme]').forEach(button => {
    button.onclick = () => {
      state.theme = state.rules.themes.find(theme => theme.id === button.dataset.theme);
      state.answers = {};
      renderChecklist();
    };
  });
}

function renderChecklist() {
  state.step = 'checklist';
  const theme = state.theme;
  app.innerHTML = `${stepper('checklist')}
    <section class="panel">
      <span class="pill">${escapeHtml(theme.chapter)} - ${escapeHtml(theme.article)}</span>
      <h1>${escapeHtml(theme.title)}</h1>
      <p>${escapeHtml(theme.passText)}</p>
      <form id="checkForm">
        <div id="checkFields"></div>
        <div class="actions">
          <button class="btn blue" type="submit">Maak conclusie</button>
          <button class="btn secondary" type="button" id="backThemes">Terug naar thema's</button>
        </div>
      </form>
    </section>`;

  const form = document.getElementById('checkForm');
  const redraw = () => {
    state.answers = { ...state.answers, ...readForm(form) };
    const questions = getAllApplicableQuestions(state.answers);
    renderDynamicFields('checkFields', questions, state.answers, 'checkForm');
  };
  form.addEventListener('change', redraw);
  redraw();

  document.getElementById('backThemes').onclick = renderThemes;
  form.addEventListener('submit', event => {
    event.preventDefault();
    state.answers = readForm(form);
    renderResult();
  });
}

function getActiveAbrIds(answers = state.answers) {
  const ids = new Set(state.theme?.abr || []);
  for (const link of state.theme?.conditionalAbr || []) {
    if (conditionObjectMatches(link.when || {}, answers)) ids.add(link.include);
  }
  return [...ids].filter(id => state.rules.abrChecks[id]);
}

function getAllApplicableQuestions(answers = state.answers) {
  const direct = state.theme?.questions || [];
  const abr = getActiveAbrIds(answers).flatMap(id => state.rules.abrChecks[id]?.questions || []);
  return [...direct, ...abr];
}

function getVisibleQuestions(answers = state.answers) {
  return getAllApplicableQuestions(answers).filter(question => questionVisible(question, answers));
}

function renderDynamicFields(containerId, questions, values, formId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const visible = questions.filter(question => questionVisible(question, values));
  container.innerHTML = visible.map(question => `<div class="answer-row">${renderField(question, values)}</div>`).join('');
  hydrateForm(formId, values);
}

function questionVisible(question, answers) {
  if (question.showWhen && !conditionObjectMatches(question.showWhen, answers)) return false;
  if (question.showWhenIncludes && !conditionIncludesMatches(question.showWhenIncludes, answers)) return false;
  if (question.showWhenAll && !question.showWhenAll.every(condition => singleConditionMatches(condition, answers))) return false;
  if (question.showWhenAny && !question.showWhenAny.some(condition => singleConditionMatches(condition, answers))) return false;
  return true;
}

function conditionObjectMatches(condition, answers) {
  return Object.entries(condition || {}).every(([field, expected]) => valueMatches(answers[field], expected));
}

function conditionIncludesMatches(condition, answers) {
  return Object.entries(condition || {}).every(([field, expected]) => asArray(answers[field]).includes(String(expected)));
}

function singleConditionMatches(condition, answers) {
  const value = answers[condition.field];
  if (isUnknown(value)) return false;
  if ('equals' in condition) return valueMatches(value, condition.equals);
  if ('includes' in condition) return asArray(value).includes(String(condition.includes));
  if ('in' in condition) return asArray(condition.in).some(candidate => valueMatches(value, candidate));
  if ('greaterThan' in condition) return numeric(value) > Number(condition.greaterThan);
  if ('greaterThanOrEqual' in condition) return numeric(value) >= Number(condition.greaterThanOrEqual);
  if ('lessThan' in condition) return numeric(value) < Number(condition.lessThan);
  if ('lessThanOrEqual' in condition) return numeric(value) <= Number(condition.lessThanOrEqual);
  if ('equalsNumber' in condition) return numeric(value) === Number(condition.equalsNumber);
  return false;
}

function valueMatches(actual, expected) {
  if (Array.isArray(expected)) return expected.some(item => valueMatches(actual, item));
  if (Array.isArray(actual)) return actual.includes(String(expected));
  return String(actual ?? '') === String(expected ?? '');
}

function routeMatches(route, values) {
  if (!route) return true;
  return Object.entries(route).every(([field, allowed]) => {
    if (field === 'mixed_building_part' && values.project_context !== 'een gemengd gebouw met een woonfunctie en een andere functie') return true;
    return valueMatches(values[field], allowed);
  });
}

function renderResult() {
  const evaluation = evaluate();
  const cls = evaluation.status === 'vrijgesteld' ? 'ok' : evaluation.status === 'niet vrijgesteld' ? 'bad' : '';
  const copyText = buildCopyText(evaluation);
  app.innerHTML = `${stepper('result')}
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
  document.getElementById('new').onclick = () => {
    state.context = {};
    state.route = {};
    state.theme = null;
    state.answers = {};
    state.filter = '';
    renderLanding();
  };
}

function evaluate() {
  const reasons = [];
  const markers = { not: false, research: false, additional: false };
  const answers = state.answers;
  const theme = state.theme;
  const visibleQuestions = getVisibleQuestions(answers);
  const visibleIds = new Set(visibleQuestions.map(question => question.id));

  const add = (kind, reason, resultMode = null) => {
    if (!reason || reasons.includes(reason)) return;
    reasons.push(reason);
    if (kind === 'research') markers.research = true;
    else if (resultMode === 'additional_regulation') markers.additional = true;
    else markers.not = true;
  };

  for (const check of state.rules.globalChecks || []) {
    if (check.when && conditionObjectMatches(check.when, state.context)) add(check.kind, check.reason);
    if (check.unknowns?.some(field => isUnknown(state.context[field]))) add('research', check.reason);
  }

  for (const question of visibleQuestions) {
    if (isUnknown(answers[question.id])) add('research', `Nog in te vullen: ${question.label}`);
  }

  const fail = (id, wanted, reason) => {
    if (visibleIds.has(id) && !isUnknown(answers[id]) && answers[id] !== wanted) add('not', reason);
  };
  fail('legal', 'ja', 'De bestaande toestand is niet hoofdzakelijk vergund of vergund geacht.');
  fail('building_not_house', 'ja', 'De gekozen route geldt alleen voor een gebouw of gebouwdeel dat geen woning is.');
  fail('function_change', 'nee', 'Er wordt een vergunningsplichtige functiewijziging doorgevoerd.');
  fail('housing_units', 'ja', 'Het aantal woongelegenheden blijft niet gelijk.');
  fail('within_30m', 'ja', 'De handeling wordt niet volledig binnen de vereiste straal van 30 meter uitgevoerd.');
  fail('rain_own', 'ja', 'Het hemelwater blijft niet op eigen terrein.');
  fail('deforestation', 'nee', 'De handeling gaat gepaard met ontbossing of een uitgesloten wijziging.');
  fail('visible_road', 'nee', 'De plaatsing of opslag is zichtbaar vanaf de openbare weg.');
  fail('actual_living', 'nee', 'In de verplaatsbare inrichting wordt gewoond.');
  fail('forest', 'nee', 'Een boom die deel uitmaakt van een bos valt niet onder deze eenvoudige vrijstellingsroute.');
  fail('permeable_replaced', 'nee', 'Waterdoorlatende verharding wordt vervangen door niet-waterdoorlatende verharding.');
  fail('publicity_regulation', 'ja', 'De publiciteit voldoet niet aan de Publiciteitsverordening.');
  fail('creates_building', 'nee', 'Voor deze telecomvrijstelling mag geen gebouw worden opgericht.');
  fail('heritage_object', 'nee', 'Er is erfgoedwaarde of inventariscontext bij de afbraak.');

  numericMax('insulation_cm', 26, 'De buitenisolatie inclusief afwerking is dikker dan 26 cm.');
  numericMax('area_total', inferAreaMax(theme.id), `De opgegeven oppervlakte overschrijdt de richtdrempel voor ${theme.article}.`);
  numericMax('height', inferHeightMax(theme.id), `De opgegeven hoogte overschrijdt de richtdrempel voor ${theme.article}.`);
  
  numericMax('volume', inferVolumeMax(theme.id), `Het opgegeven volume overschrijdt de richtdrempel voor ${theme.article}.`);
  numericMax('periods_30', 4, 'De vier periodes van 30 dagen per kalenderjaar worden overschreden.');
  numericMax('duration_years', 2, 'De maximale duur voor tijdelijke verplaatsbare constructies tijdens werken wordt overschreden.');

  evaluateDeclarativeRules(theme.rules, add, answers);
  for (const abrId of getActiveAbrIds(answers)) evaluateAbr(abrId, add, answers, visibleIds);
  evaluateTemporaryAndIndustry(add, answers, theme.id);

  if (!reasons.length) reasons.push(theme.passText);
  const status = markers.not || markers.additional ? 'niet vrijgesteld' : markers.research ? 'bijkomend onderzoek nodig' : 'vrijgesteld';
  const summary = status === 'vrijgesteld'
    ? 'Op basis van de ingevulde gegevens valt de handeling onder een vrijstelling en zijn geen strijdigheden met de opgenomen Gentse controles vastgesteld.'
    : status === 'niet vrijgesteld'
      ? 'Op basis van de ingevulde gegevens is de eenvoudige vrijstellingsroute niet toepasbaar of wordt niet voldaan aan een opgenomen aanvullende Gentse regel.'
      : 'De ingevulde gegevens volstaan nog niet voor een definitieve uitspraak.';
  return { status, summary, reasons };

  function numericMax(id, max, reason) {
    if (!max || !visibleIds.has(id) || isUnknown(answers[id])) return;
    if (numeric(answers[id]) > max) add('not', reason);
  }
}

function evaluateDeclarativeRules(rules, add, answers) {
  if (!rules) return;
  for (const rule of rules.notConditions || []) if (ruleMatches(rule, answers)) add('not', rule.reason);
  for (const rule of rules.researchConditions || []) if (ruleMatches(rule, answers)) add('research', rule.reason);
  for (const rule of rules.simpleRouteStops || []) if (singleConditionMatches(rule, answers)) add('not', rule.reason);
  for (const rule of rules.failConditions || []) if (singleConditionMatches(rule, answers)) add('not', 'De ingevoerde situatie voldoet niet aan een toepasselijke Gentse woonkwaliteitsvoorwaarde.', 'additional_regulation');
  if (rules.seaportOpenMaxHeightM && state.context.zone === 'afgebakend zeehavengebied' && ['open'].includes(answers.fence_openness) && !isUnknown(answers.fence_height)) { if (numeric(answers.fence_height) > rules.seaportOpenMaxHeightM) add('not', `De open afsluiting of toegangspoort is hoger dan ${rules.seaportOpenMaxHeightM} meter.`); return; } for (const rule of rules.heightRules || []) {
    if (conditionObjectMatches(rule.when || {}, answers) && !isUnknown(answers.fence_height) && numeric(answers.fence_height) > rule.maxHeightM) {
      add('not', `De afsluiting of toegangspoort is hoger dan de toegelaten ${rule.maxHeightM} meter.`);
    }
  }
}

function ruleMatches(rule, answers) {
  if (rule.all) return rule.all.every(condition => singleConditionMatches(condition, answers));
  if (rule.any) return rule.any.some(condition => singleConditionMatches(condition, answers));
  return singleConditionMatches(rule, answers);
}

function evaluateAbr(id, add, a, visibleIds) {
  const block = state.rules.abrChecks[id];
  const additional = block?.resultMode === 'additional_regulation' ? 'additional_regulation' : null;
  const abrFail = reason => add('not', reason || block?.fail, additional);

  if (id === 'treeGent' && ((numeric(a.abr_tree_circ_1m) >= 50) || (numeric(a.abr_tree_circ_base) >= 75))) abrFail(block.fail);
  if (id === 'drivewayGent') {
    if (numeric(a.abr_driveway_count) > 1 && state.context.zone !== 'afgebakend zeehavengebied') abrFail('ABR: buiten het zeehavengebied is standaard maximaal één oprit toegestaan.');
    if (numeric(a.abr_driveway_slope) > 4) abrFail('ABR: de oprit heeft in de eerste 5 meter vanaf de rooilijn meer dan 4% helling.');
    if (a.abr_driveway_autofree === 'ja') abrFail('ABR: een nieuwe oprit naar private parkeerplaatsen in autovrij gebied is niet toegestaan.');
    const road = numeric(a.abr_driveway_road_width), width = numeric(a.abr_driveway_width);
    if (road && width) {
      const max = road <= 4 ? 4.5 : road <= 4.5 ? 4 : road <= 5.5 ? 3.5 : 3;
      if (width > max) abrFail(`ABR: bij deze rijwegbreedte is de oprit aan de rooilijn maximaal ${max} meter breed.`);
    }
  }
  if (id === 'pavingGent' && (a.abr_paving_minimal === 'nee' || a.abr_paving_infiltration === 'nee')) abrFail(block.fail);
  if (id === 'ditchGent' && (numeric(a.abr_ditch_length) > 5 || a.abr_ditch_one === 'nee' || a.abr_ditch_connections === 'ja')) abrFail(block.fail);
  if (id === 'horecaGent' && a.abr_horeca_change === 'ja') abrFail(block.fail);
  if (id === 'facadeStreetGent') evaluateFacadeStreet(block, abrFail, add, a);
  if (id === 'facadeInsulationGent') {
    if (numeric(a.abr_insulation_rooilijn_exceed_cm) > block.rules.rooilijnExceedMaxCm) abrFail(`De totale rooilijnoverschrijding door isolatie en afwerking is groter dan ${block.rules.rooilijnExceedMaxCm} cm.`);
    if (numeric(a.abr_insulation_small_elements_cm) > block.rules.smallConstructiveElementsBeyondInsulationMaxCm) abrFail(`Kleinschalige constructieve elementen springen meer dan ${block.rules.smallConstructiveElementsBeyondInsulationMaxCm} cm voorbij de gevelisolatie.`);
  }
  if (id === 'housingQualityGent') evaluateHousingQuality(block, abrFail, add, a, visibleIds);
}

function evaluateFacadeStreet(block, fail, add, a) {
  if (a.abr_contact_street_ok === 'nee') fail('De werken aan de garage of garagepoort voldoen niet aan ABR artikel 2.5.');
  if (a.abr_shopfront_closure === 'ja') fail('De etalage van de handelsruimte krijgt een gesloten gevelafsluiting, in strijd met ABR artikel 2.6.');
  if (a.abr_projection_new_or_stability !== 'ja') return;
  if (a.abr_projection_facade_on_building_line === 'nee') add('research', 'De voorgevel staat niet tegen de rooilijn. De toepasselijkheid van ABR artikel 2.7 moet afzonderlijk worden beoordeeld.');
  const height = numeric(a.abr_projection_height_m), depth = numeric(a.abr_projection_depth_cm);
  const band = block.article27Rules.heightBands.find(item => height >= item.minHeightM && (item.maxHeightM === null || height < item.maxHeightM));
  if (band?.contextAssessmentRequired) {
    if (a.abr_projection_context_ok_above_4m === 'nee') fail('De uitsprong vanaf 4 meter hoogte is niet verenigbaar met de plaatselijke context of het bestemmingsplan.');
    if (isUnknown(a.abr_projection_context_ok_above_4m)) add('research', 'De uitsprong vanaf 4 meter hoogte vereist een beoordeling van de plaatselijke context en het bestemmingsplan.');
  } else if (band && depth) {
    const max = a.abr_projection_element_type === 'constructief element' ? band.constructiveMaxCm : band.nonConstructiveMaxCm;
    if (max != null && depth > max) fail(`De uitsprong bedraagt ${depth} cm, terwijl op deze hoogte maximaal ${max} cm is toegelaten.`);
  }
  if (a.abr_projection_full_facade === 'ja' && a.abr_projection_facade_insulation !== 'ja') fail('Een volledig gevelvlak kraagt uit voorbij de rooilijn zonder dat dit uitsluitend het gevolg is van voorgevelisolatie.');
  if (numeric(a.abr_projection_beyond_insulation_cm) > block.article27Rules.smallConstructiveElementsBeyondInsulationMaxCm) fail('Kleinschalige constructieve elementen springen te ver voorbij de voorgevelisolatie.');
  const sideRule = block.article27Rules.sideBoundaryRule;
  if (a.abr_projection_attached_building === 'ja' && a.abr_projection_element_type === 'constructief element' && depth > sideRule.projectionMoreThanCm && numeric(a.abr_projection_side_distance_cm) < sideRule.minimumDistanceCm) {
    fail(`De constructieve uitsprong moet minstens ${sideRule.minimumDistanceCm} cm van de zijdelingse perceelsgrens blijven.`);
  }
}

function evaluateHousingQuality(block, fail, add, a, visibleIds) {
  const threshold = block.rules.thresholds;
  if (a.abr_inside_housing_type_change === 'ja') add('not', 'Het woningtype of de woonvorm wijzigt. Deze ingreep valt niet onder de eenvoudige vrijstellingsroute voor binnenverbouwingen.');
  const type = a.abr_inside_existing_housing_type;
  const bedrooms = numeric(a.abr_inside_bedroom_count);
  let livingMin = threshold.livingRoomMinM2;
  if (a.abr_inside_kitchen_integrated === 'ja' && bedrooms !== 1) livingMin += threshold.livingRoomWithIntegratedKitchenExtraM2;
  if (visibleIds.has('abr_inside_living_area_m2') && numeric(a.abr_inside_living_area_m2) < livingMin) fail(`De woonkamer is kleiner dan de vereiste ${livingMin} m².`);
  if (visibleIds.has('abr_inside_separate_kitchen_area_m2') && numeric(a.abr_inside_separate_kitchen_area_m2) < threshold.separateKitchenMinM2) fail(`De afzonderlijke keuken is kleiner dan ${threshold.separateKitchenMinM2} m².`);
  if (visibleIds.has('abr_inside_first_bedroom_area_m2') && numeric(a.abr_inside_first_bedroom_area_m2) < threshold.firstBedroomMinM2) fail(`De eerste slaapkamer is kleiner dan ${threshold.firstBedroomMinM2} m².`);
  if (visibleIds.has('abr_inside_smallest_other_bedroom_area_m2') && numeric(a.abr_inside_smallest_other_bedroom_area_m2) < threshold.otherBedroomMinM2) fail(`Een bijkomende slaapkamer is kleiner dan ${threshold.otherBedroomMinM2} m².`);
  if (visibleIds.has('abr_inside_storage_area_m2') && numeric(a.abr_inside_storage_area_m2) < threshold.storageMinM2) fail(`De individuele berging is kleiner dan ${threshold.storageMinM2} m².`);
  if (visibleIds.has('abr_inside_min_clear_height_m') && numeric(a.abr_inside_min_clear_height_m) < threshold.clearHeightRenovationMinM) fail(`De vrije hoogte is kleiner dan ${threshold.clearHeightRenovationMinM} meter.`);
  if (type === 'studio' && visibleIds.has('abr_inside_studio_area_m2') && numeric(a.abr_inside_studio_area_m2) < threshold.studioMinM2) fail(`De studio is kleiner dan ${threshold.studioMinM2} m².`);
  if (['kamer in een kamerwoning', 'kamer in een hospitawoning'].includes(type) && visibleIds.has('abr_inside_room_area_m2')) {
    let minimum = threshold.roomBaseMinM2;
    if (a.abr_inside_room_private_kitchen === 'ja') minimum += threshold.roomExtraPerPrivateFacilityM2;
    if (a.abr_inside_room_private_bathroom === 'ja') minimum += threshold.roomExtraPerPrivateFacilityM2;
    if (numeric(a.abr_inside_room_area_m2) < minimum) fail(`De kamer is kleiner dan de vereiste ${minimum} m² voor de opgegeven private voorzieningen.`);
  }
  if (visibleIds.has('abr_inside_daylight_opening_area_m2')) {
    const roomType = a.abr_inside_daylight_room_type;
    const ratio = threshold.daylightRatio[roomType];
    if (ratio) {
      const relativeMin = numeric(a.abr_inside_daylight_room_area_m2) * ratio;
      const absoluteMin = threshold.daylightAbsoluteMinimumM2[roomType] || 0;
      const required = Math.max(relativeMin, absoluteMin);
      if (numeric(a.abr_inside_daylight_opening_area_m2) < required) fail(`De bruikbare daglichtopening is kleiner dan de berekende minimumoppervlakte van ${required.toFixed(2)} m².`);
    }
  }
}

function evaluateTemporaryAndIndustry(add, a, themeId) {
  if (themeId === 'tijdelijk' && a.temp_action === 'tijdelijke constructie/evenement') {
    if (a.vulnerable_area_type === 'ander ruimtelijk kwetsbaar gebied') add('not', 'De tijdelijke constructie ligt in ruimtelijk kwetsbaar gebied dat geen parkgebied is.');
  }
  if (themeId === 'industrie_constructie' && a.nearby_vulnerable_area_type === 'ander ruimtelijk kwetsbaar gebied') {
    const distance = numeric(a.distance_vulnerable_area);
    const limit = a.industry_action === 'constructie zonder gebouw/verharding' ? 30 : a.industry_action === 'verharding' ? 10 : null;
    if (limit && distance < limit) add('not', `De handeling ligt op minder dan ${limit} meter van ruimtelijk kwetsbaar gebied dat geen parkgebied is.`);
  }
}

function inferAreaMax(id) {
  if (id.includes('niet_overdekt')) return 80;
  if (id.includes('bijgebouw')) return 40;
  if (id === 'woning_afvalhouder') return 10;
  if (id === 'andere_afvalhouder') return 20;
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
  return `Beste\n\nWe hebben de vraag getoetst aan het Vrijstellingsbesluit en de opgenomen Gentse controles.\n\nHandeling: ${state.theme.title}\nAdres/perceel: ${state.context.address || 'niet ingevuld'}\nProjectcontext: ${state.route.project_context || 'niet ingevuld'}\n\nConclusie: ${evaluation.status.toUpperCase()}\n\nMotivering:\n- ${evaluation.reasons.join('\n- ')}\n\nDeze beoordeling is gebaseerd op de ingevulde gegevens. Andere regelgeving, burgerrechtelijke aspecten, erfgoedtoelatingen, milieuregels en uitvoeringsvoorwaarden kunnen nog van toepassing zijn.\n\nMet vriendelijke groeten`;
}

function renderField(question, values = {}) {
  const unit = question.unit ? ` <span class="hint">(${escapeHtml(question.unit)})</span>` : '';
  const help = question.helpText ? `<p class="hint">${escapeHtml(question.helpText)}</p>` : '';
  const imagePlaceholder = question.helpImagePlaceholder ? `<div class="help-image-placeholder" data-image-id="${escapeHtml(question.helpImagePlaceholder.id)}" role="img" aria-label="${escapeHtml(question.helpImagePlaceholder.alt)}"><span>Illustratie wordt later toegevoegd</span></div>` : '';
  const value = values[question.id];

  if (question.type === 'text') return `<div><label for="${question.id}">${escapeHtml(question.label)}${unit}</label><input id="${question.id}" name="${question.id}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(question.placeholder || '')}">${help}${imagePlaceholder}</div>`;
  if (question.type === 'number') return `<div><label for="${question.id}">${escapeHtml(question.label)}${unit}</label><input id="${question.id}" name="${question.id}" value="${escapeHtml(value ?? '')}" inputmode="decimal" type="number" step="any">${help}${imagePlaceholder}</div>`;
  if (question.type === 'multiselect') {
    const selected = new Set(asArray(value));
    return `<fieldset><legend>${escapeHtml(question.label)}${unit}</legend>${(question.options || []).map(option => `<label class="check-option"><input type="checkbox" name="${question.id}" value="${escapeHtml(option)}" ${selected.has(option) ? 'checked' : ''}> ${escapeHtml(option)}</label>`).join('')}${help}${imagePlaceholder}</fieldset>`;
  }
  return `<div><label for="${question.id}">${escapeHtml(question.label)}${unit}</label><select id="${question.id}" name="${question.id}">${(question.options || ['onbekend', 'ja', 'nee']).map(option => `<option value="${escapeHtml(option)}" ${String(value ?? '') === String(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>${help}${imagePlaceholder}</div>`;
}

function hydrateForm(id, data) {
  const form = document.getElementById(id);
  if (!form) return;
  for (const [key, raw] of Object.entries(data || {})) {
    const elements = form.elements[key];
    if (!elements) continue;
    const values = asArray(raw);
    if (typeof elements.length === 'number' && !elements.tagName) {
      [...elements].forEach(element => { if (element.type === 'checkbox') element.checked = values.includes(element.value); });
    } else if (elements.type === 'checkbox') elements.checked = values.includes(elements.value);
    else elements.value = raw;
  }
}

function readForm(form) {
  const data = {};
  const formData = new FormData(form);
  for (const [key, value] of formData.entries()) {
    if (Object.prototype.hasOwnProperty.call(data, key)) data[key] = asArray(data[key]).concat(String(value));
    else data[key] = String(value);
  }
  return data;
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null || value === '') return [];
  return [String(value)];
}
function isUnknown(value) {
  return value == null || value === '' || value === 'onbekend' || (Array.isArray(value) && value.length === 0);
}
function numeric(value) {
  if (value == null || value === '') return 0;
  return Number(String(value).replace(',', '.')) || 0;
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
