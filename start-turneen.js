const SUPABASE_URL = 'https://bpbqcqqlqrdruxbottdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwYnFjcXFscXJkcnV4Ym90dGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5MDAzNTAsImV4cCI6MjA3NzQ3NjM1MH0.kxHA7ta7ld95-PDhVEDvkgxJ-BhHjI0Zn2fwWv7LFNc';

const ARRANGEMENT = {
  trening: '',
  seminar: ''
};

const ARSKULL_FRA = 2006;
const ARSKULL_TIL = 2021;

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

document.querySelectorAll('[data-event]').forEach((el) => {
  const text = ARRANGEMENT[el.dataset.event];
  if (text) {
    el.textContent = text;
    el.hidden = false;
  }
});

const arskullSelect = document.getElementById('t-arskull');
for (let y = ARSKULL_TIL; y >= ARSKULL_FRA; y--) {
  arskullSelect.add(new Option(String(y), String(y)));
}

const tabs = document.querySelectorAll('[data-tab]');

function showTab(name) {
  tabs.forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(active));
    tab.classList.toggle('active', active);
    document.getElementById(`panel-${tab.dataset.tab}`).hidden = !active;
  });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    history.replaceState(null, '', `#${tab.dataset.tab}`);
    showTab(tab.dataset.tab);
  });
});

const tabFromHash = () => (location.hash === '#seminar' ? 'seminar' : 'trening');
window.addEventListener('hashchange', () => showTab(tabFromHash()));
showTab(tabFromHash());

function setupForm(arrangement, { validate, payload, doneText, keepOnAgain = [] }) {
  const panel = document.getElementById(`panel-${arrangement}`);
  const form = panel.querySelector('form');
  const errorBox = form.querySelector('.st-error');
  const submitBtn = form.querySelector('.st-submit');
  const done = panel.querySelector('.st-done');

  form.addEventListener('input', (e) => {
    e.target.classList.remove('invalid');
    errorBox.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    Object.keys(values).forEach((k) => (values[k] = String(values[k]).trim()));

    const problems = validate(values);
    form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
    if (problems.length) {
      problems.forEach(([field]) => form.elements[field].classList.add('invalid'));
      form.elements[problems[0][0]].focus();
      errorBox.textContent = problems[0][1];
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sender …';
    const { error } = await supabaseClient
      .from('start_turne_pameldinger')
      .insert({ arrangement, ...payload(values) });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Meld på';

    if (error) {
      console.error('Påmelding feilet:', error);
      errorBox.textContent = 'Noe gikk galt. Sjekk nettet og prøv igjen.';
      return;
    }

    done.querySelector('.st-done-text').textContent = doneText(values);
    form.hidden = true;
    done.hidden = false;
    done.querySelector('.st-again').focus();
  });

  done.querySelector('.st-again').addEventListener('click', () => {
    const kept = Object.fromEntries(keepOnAgain.map((k) => [k, form.elements[k].value]));
    form.reset();
    Object.entries(kept).forEach(([k, v]) => (form.elements[k].value = v));
    done.hidden = true;
    form.hidden = false;
    form.elements[0].focus();
  });
}

setupForm('trening', {
  validate: (v) => {
    const p = [];
    if (v.deltaker_navn.length < 2) p.push(['deltaker_navn', 'Skriv inn navnet til deltakeren.']);
    if (!v.arskull) p.push(['arskull', 'Velg årskull.']);
    if (!EMAIL_RE.test(v.foresatt_epost)) p.push(['foresatt_epost', 'Skriv inn en gyldig e-post til foresatt.']);
    return p;
  },
  payload: (v) => ({
    deltaker_navn: v.deltaker_navn,
    arskull: Number(v.arskull),
    foresatt_epost: v.foresatt_epost.toLowerCase()
  }),
  doneText: (v) => `${v.deltaker_navn} (${v.arskull}) er meldt på treningen. Vi tar kontakt på ${v.foresatt_epost}.`,
  keepOnAgain: ['foresatt_epost']
});

setupForm('seminar', {
  validate: (v) => {
    const p = [];
    if (v.deltaker_navn.length < 2) p.push(['deltaker_navn', 'Skriv inn navnet ditt.']);
    if (!EMAIL_RE.test(v.deltaker_epost)) p.push(['deltaker_epost', 'Skriv inn en gyldig e-postadresse.']);
    return p;
  },
  payload: (v) => ({
    deltaker_navn: v.deltaker_navn,
    deltaker_epost: v.deltaker_epost.toLowerCase()
  }),
  doneText: (v) => `${v.deltaker_navn} er meldt på seminaret. Vi tar kontakt på ${v.deltaker_epost}.`
});
