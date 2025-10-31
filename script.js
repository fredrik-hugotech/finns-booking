/*
 * Klientlogikk for Finns.Fairway bookingløsningen.
 * Håndterer kalender, uke- og dagvisning, valg av halv/full bane
 * og innsending av bestilling til Supabase dersom nøklene er satt.
 */

// TODO: Sett inn egne Supabase-nøkler før produksjon.
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const SUPABASE_SERVICE_ROLE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
const SUPABASE_PLACEHOLDER_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_PLACEHOLDER_ANON = 'YOUR_SUPABASE_ANON_KEY';
const SUPABASE_PLACEHOLDER_SERVICE_ROLE = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

function normaliseConfigValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveSupabaseConfig() {
  const candidates = [];

  if (typeof window !== 'undefined') {
    if (window.SUPABASE_URL || window.SUPABASE_ANON_KEY || window.SUPABASE_SERVICE_ROLE_KEY) {
      candidates.push({
        url: window.SUPABASE_URL,
        key: window.SUPABASE_ANON_KEY || window.SUPABASE_SERVICE_ROLE_KEY,
        type: window.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon',
      });
    }

    if (window.__SUPABASE_CONFIG) {
      candidates.push(window.__SUPABASE_CONFIG);
    }

    const metaUrl = document.querySelector('meta[name="supabase-url"]');
    const metaKey = document.querySelector('meta[name="supabase-anon-key"]');
    const metaServiceRole = document.querySelector('meta[name="supabase-service-role-key"]');
    if (metaUrl || metaKey || metaServiceRole) {
      candidates.push({
        url: metaUrl?.content,
        key: metaKey?.content || metaServiceRole?.content,
        type: metaServiceRole?.content ? 'service_role' : 'anon',
      });
    }

    const configScript = document.getElementById('supabase-config');
    if (configScript?.textContent) {
      try {
        const parsed = JSON.parse(configScript.textContent);
        candidates.push(parsed);
      } catch (error) {
        console.warn('Kunne ikke tolke Supabase-konfigurasjonen som JSON.', error);
      }
    }

    const htmlDataset = document.documentElement?.dataset;
    if (
      htmlDataset &&
      (htmlDataset.supabaseUrl || htmlDataset.supabaseAnonKey || htmlDataset.supabaseServiceRoleKey)
    ) {
      candidates.push({
        url: htmlDataset.supabaseUrl,
        key: htmlDataset.supabaseAnonKey || htmlDataset.supabaseServiceRoleKey,
        type: htmlDataset.supabaseServiceRoleKey ? 'service_role' : 'anon',
      });
    }
  }

  candidates.push({ url: SUPABASE_URL, key: SUPABASE_ANON_KEY, type: 'anon' });
  candidates.push({ url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY, type: 'service_role' });

  for (const candidate of candidates) {
    const url = normaliseConfigValue(
      candidate?.url ?? candidate?.SUPABASE_URL ?? candidate?.supabaseUrl,
    );
    const rawServiceRole =
      candidate?.serviceRoleKey ?? candidate?.SUPABASE_SERVICE_ROLE_KEY ?? candidate?.supabaseServiceRoleKey;
    const rawAnon =
      candidate?.anonKey ?? candidate?.SUPABASE_ANON_KEY ?? candidate?.supabaseAnonKey;
    const key = normaliseConfigValue(
      candidate?.key ?? (candidate?.type === 'service_role' ? rawServiceRole : rawAnon) ?? rawAnon ?? rawServiceRole,
    );
    const type = key === normaliseConfigValue(rawServiceRole) || candidate?.type === 'service_role'
      ? 'service_role'
      : 'anon';
    const isPlaceholder =
      (type === 'anon' && key === SUPABASE_PLACEHOLDER_ANON) ||
      (type === 'service_role' && key === SUPABASE_PLACEHOLDER_SERVICE_ROLE);
    if (url && key && url !== SUPABASE_PLACEHOLDER_URL && !isPlaceholder) {
      return { url, key, type };
    }
  }

  return null;
}

const resolvedSupabaseConfig = resolveSupabaseConfig();
const supabaseClient = resolvedSupabaseConfig
  ? supabase.createClient(resolvedSupabaseConfig.url, resolvedSupabaseConfig.key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;

if (!supabaseClient) {
  console.warn(
    'Supabase er ikke konfigurert. Legg inn URL og nøkkel i script.js, via '
      + 'window.SUPABASE_URL/SUPABASE_ANON_KEY eller SUPABASE_SERVICE_ROLE_KEY, '
      + 'data-attributter på <html> eller <meta> tagger.',
  );
}

if (resolvedSupabaseConfig?.type === 'service_role') {
  console.warn(
    'Supabase bruker service role key. Bekreft at denne leveres sikkert fra backend og ikke eksponeres offentlig.',
  );
}

const availableTimes = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
];

const preBookedTimes = [
  // Eksempel: { date: '2025-11-01', time: '16:00', lane: 'full' },
];

const priceFull = 1990;
const priceHalf = 1490;

let selectedSlots = []; // { date, time, lane }
let monthBookings = [];
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let activeDate = formatDate(new Date());
let activeView = 'day';
let activeStep = 1;
let isSubmitting = false;

// DOM-elementer
const monthLabel = document.getElementById('monthLabel');
const monthCalendar = document.getElementById('monthCalendar');
const dayLabel = document.getElementById('dayLabel');
const dayViewPanel = document.getElementById('dayView');
const weekViewPanel = document.getElementById('weekView');
const timesList = document.getElementById('timesList');
const selectedSlotsContainer = document.getElementById('selectedSlots');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const viewToggleButtons = document.querySelectorAll('[data-view]');

const stepElements = Array.from(document.querySelectorAll('.flow-step'));
const progressSteps = Array.from(document.querySelectorAll('.progress-step'));
const step1NextBtn = document.getElementById('step1Next');
const step2BackBtn = document.getElementById('step2Back');
const step2NextBtn = document.getElementById('step2Next');
const step3BackBtn = document.getElementById('step3Back');
const completeBookingBtn = document.getElementById('completeBooking');

const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const clubInput = document.getElementById('club');
const genderSelect = document.getElementById('gender');
const ageInput = document.getElementById('age');
const customerForm = document.getElementById('customerForm');
const summaryMessageBox = document.getElementById('summaryMessage');

const contactFields = [
  nameInput,
  phoneInput,
  emailInput,
  clubInput,
  genderSelect,
  ageInput,
].filter(Boolean);

const weekdayNamesShort = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const monthNames = [
  'Januar',
  'Februar',
  'Mars',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const statusText = {
  available: 'Ledig',
  partial: 'Halv bane ledig',
  full: 'Opptatt',
};

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function parseDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDisplayDate(dateStr) {
  const date = parseDate(dateStr);
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }
  return new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

async function loadMonthBookings(year, month) {
  if (!supabaseClient) {
    monthBookings = [];
    return;
  }
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  const startStr = formatDate(startDate);
  const endStr = formatDate(endDate);
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .gte('date', startStr)
    .lte('date', endStr);
  if (error) {
    console.error('Feil ved henting av bestillinger:', error);
    monthBookings = [];
  } else {
    monthBookings = data || [];
  }
}

function ensureActiveDateInMonth() {
  const active = parseDate(activeDate);
  if (active.getFullYear() !== currentYear || active.getMonth() !== currentMonth) {
    activeDate = formatDate(new Date(currentYear, currentMonth, 1));
  }
}

function computeDateStatus(dateStr) {
  const totalUnits = availableTimes.length * 2;
  let occupiedUnits = 0;
  [...preBookedTimes, ...monthBookings, ...selectedSlots].forEach((booking) => {
    if (booking.date === dateStr) {
      occupiedUnits += booking.lane === 'full' ? 2 : 1;
    }
  });
  if (occupiedUnits >= totalUnits) return 'full';
  if (occupiedUnits >= totalUnits / 2) return 'half';
  return 'available';
}

function getTimeStatus(dateStr, time, { includePending = true } = {}) {
  let occupied = 0;
  const pending = includePending ? selectedSlots : [];
  [...preBookedTimes, ...monthBookings, ...pending].forEach((booking) => {
    if (booking.date === dateStr && booking.time === time) {
      occupied += booking.lane === 'full' ? 2 : 1;
    }
  });
  const available = Math.max(0, 2 - occupied);
  if (available === 0) return { status: 'full', available };
  if (available === 1) return { status: 'partial', available };
  return { status: 'available', available };
}

function renderMonthCalendar() {
  if (!monthCalendar) return;
  monthCalendar.innerHTML = '';
  monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  const firstDay = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7; // mandag = 0

  for (let i = 0; i < startWeekday; i += 1) {
    const blank = document.createElement('div');
    blank.className = 'day-cell empty';
    monthCalendar.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.classList.add('day-cell');
    const status = computeDateStatus(dateStr);
    if (status === 'full') {
      cell.classList.add('full-day');
      cell.disabled = true;
    } else if (status === 'half') {
      cell.classList.add('half-day');
    } else {
      cell.classList.add('available-day');
    }
    if (dateStr === activeDate) {
      cell.classList.add('selected-day');
    }
    if (selectedSlots.some((slot) => slot.date === dateStr)) {
      cell.classList.add('has-selection');
    }
    cell.textContent = day;
    cell.addEventListener('click', () => {
      setActiveDate(dateStr);
      if (status !== 'full') {
        setActiveView('day');
        focusDayPanel();
      }
    });
    monthCalendar.appendChild(cell);
  }
}

function renderDayView() {
  if (!timesList) return;
  timesList.innerHTML = '';
  const dateObj = parseDate(activeDate);
  if (Number.isNaN(dateObj.getTime())) {
    timesList.textContent = 'Velg en dato for å se tilgjengelige tider.';
    return;
  }
  const formatter = new Intl.DateTimeFormat('nb-NO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  if (dayLabel) {
    const formatted = capitalise(formatter.format(dateObj));
    dayLabel.textContent = formatted;
  }

  availableTimes.forEach((time) => {
    const { status, available } = getTimeStatus(activeDate, time);
    const userHasHalf = selectedSlots.some((slot) => slot.date === activeDate && slot.time === time && slot.lane === 'half');
    const userHasFull = selectedSlots.some((slot) => slot.date === activeDate && slot.time === time && slot.lane === 'full');
    const row = document.createElement('div');
    row.className = 'time-row';
    if (status === 'full' || userHasFull) {
      row.classList.add('disabled');
    }

    const label = document.createElement('div');
    label.className = 'time-label';
    label.textContent = time;

    const actions = document.createElement('div');
    actions.className = 'time-actions';

    const chip = document.createElement('span');
    chip.className = 'status-chip';
    if (userHasFull) {
      chip.classList.add('reserved');
      chip.textContent = 'Din reservasjon';
    } else if (userHasHalf) {
      chip.classList.add('reserved');
      chip.textContent = 'Din halv bane';
    } else {
      if (status === 'partial') {
        chip.classList.add('partial');
      } else if (status === 'full') {
        chip.classList.add('full');
      }
      chip.textContent = statusText[status];
    }
    actions.appendChild(chip);

    const halfBtn = document.createElement('button');
    halfBtn.type = 'button';
    halfBtn.className = 'time-button half';
    halfBtn.textContent = 'Halv bane';
    halfBtn.disabled = available < 1 || userHasHalf || userHasFull;
    if (!halfBtn.disabled) {
      halfBtn.addEventListener('click', () => addSlot(activeDate, time, 'half'));
    }

    const fullBtn = document.createElement('button');
    fullBtn.type = 'button';
    fullBtn.className = 'time-button full';
    fullBtn.textContent = 'Full bane';
    fullBtn.disabled = available < 2 || userHasFull || userHasHalf;
    if (!fullBtn.disabled) {
      fullBtn.addEventListener('click', () => addSlot(activeDate, time, 'full'));
    }

    actions.appendChild(halfBtn);
    actions.appendChild(fullBtn);

    row.appendChild(label);
    row.appendChild(actions);
    timesList.appendChild(row);
  });
}

function getWeekDays(dateStr) {
  const current = parseDate(dateStr);
  const currentWeekday = (current.getDay() + 6) % 7;
  const monday = new Date(current);
  monday.setDate(current.getDate() - currentWeekday);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    const dayNumber = String(day.getDate()).padStart(2, '0');
    const monthNumber = String(day.getMonth() + 1).padStart(2, '0');
    return {
      date: day,
      dateStr: formatDate(day),
      short: weekdayNamesShort[index],
      displayDate: `${dayNumber}.${monthNumber}`,
    };
  });
}

function renderWeekView() {
  if (!weekViewPanel) return;
  weekViewPanel.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'week-grid';

  const weekDays = getWeekDays(activeDate);

  const headerBlank = document.createElement('div');
  headerBlank.className = 'week-grid-header';
  headerBlank.textContent = 'Tid';
  wrapper.appendChild(headerBlank);

  weekDays.forEach((day) => {
    const header = document.createElement('div');
    header.className = 'week-grid-header';
    header.innerHTML = `<span class="weekday">${day.short}</span><span class="date">${day.displayDate}</span>`;
    if (day.dateStr === activeDate) {
      header.classList.add('active');
    }
    wrapper.appendChild(header);
  });

  availableTimes.forEach((time) => {
    const timeCell = document.createElement('div');
    timeCell.className = 'week-grid-time';
    timeCell.textContent = time;
    wrapper.appendChild(timeCell);

    weekDays.forEach((day) => {
      const { status } = getTimeStatus(day.dateStr, time);
      const slotButton = document.createElement('button');
      slotButton.type = 'button';
      slotButton.className = `week-slot status-${status}`;
      slotButton.textContent = statusText[status];
      slotButton.title = `${day.short} ${day.displayDate} kl. ${time}: ${statusText[status]}`;
      if (day.dateStr === activeDate) {
        slotButton.classList.add('active-day');
      }
      if (status === 'full') {
        slotButton.disabled = true;
        slotButton.setAttribute('aria-disabled', 'true');
      } else {
        slotButton.addEventListener('click', () => {
          setActiveDate(day.dateStr);
          setActiveView('day');
          focusDayPanel();
        });
      }
      wrapper.appendChild(slotButton);
    });
  });

  weekViewPanel.appendChild(wrapper);
}

function addSlot(dateStr, time, lane) {
  if (selectedSlots.some((slot) => slot.date === dateStr && slot.time === time && slot.lane === lane)) {
    return;
  }
  selectedSlots.push({ date: dateStr, time, lane });
  updateSummary();
  renderMonthCalendar();
  renderDayView();
  renderWeekView();
}

function updateSummary() {
  if (!selectedSlotsContainer) return;
  selectedSlotsContainer.innerHTML = '';

  if (selectedSlots.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'Ingen tider valgt ennå.';
    selectedSlotsContainer.appendChild(emptyMessage);
    updateStepControls();
    return;
  }

  selectedSlots.sort((a, b) => {
    if (a.date === b.date) {
      return a.time.localeCompare(b.time);
    }
    return a.date.localeCompare(b.date);
  });

  const list = document.createElement('ul');
  let total = 0;

  selectedSlots.forEach((slot, index) => {
    const li = document.createElement('li');
    const slotInfo = document.createElement('div');
    slotInfo.innerHTML = `<strong>${formatDisplayDate(slot.date)}</strong> kl. ${slot.time} – ${slot.lane === 'full' ? 'Full bane' : 'Halv bane'}`;
    const price = slot.lane === 'full' ? priceFull : priceHalf;
    total += price;

    const priceLabel = document.createElement('span');
    priceLabel.textContent = `${price} kr`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-button';
    removeBtn.textContent = 'Fjern';
    removeBtn.addEventListener('click', () => {
      selectedSlots.splice(index, 1);
      updateSummary();
      renderMonthCalendar();
      renderDayView();
      renderWeekView();
    });

    li.appendChild(slotInfo);
    li.appendChild(priceLabel);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });

  selectedSlotsContainer.appendChild(list);
  const totalEl = document.createElement('p');
  totalEl.className = 'total-price';
  totalEl.textContent = `Total pris: ${total} kr`;
  selectedSlotsContainer.appendChild(totalEl);

  updateStepControls();
}

function isContactInfoComplete() {
  return contactFields.every((field) => field && field.value && field.value.trim().length > 0);
}

function getContactInfo() {
  const info = {
    name: nameInput?.value.trim() || '',
    phone: phoneInput?.value.trim() || '',
    email: emailInput?.value.trim() || '',
    club: clubInput?.value.trim() || '',
    gender: genderSelect?.value || '',
  };

  const ageRaw = ageInput?.value;
  const parsedAge = ageRaw !== undefined && ageRaw !== null ? Number.parseInt(ageRaw, 10) : NaN;
  if (Number.isNaN(parsedAge)) {
    return { ok: false, message: 'Vennligst oppgi alder som et heltall.' };
  }
  if (parsedAge < 0 || parsedAge > 120) {
    return { ok: false, message: 'Alder må være mellom 0 og 120 år.' };
  }

  return { ok: true, data: { ...info, age: parsedAge } };
}

function updateStepControls() {
  if (step1NextBtn) {
    step1NextBtn.disabled = selectedSlots.length === 0;
  }
  if (step2NextBtn) {
    step2NextBtn.disabled = !isContactInfoComplete();
  }
}

function displaySummaryMessage(type, message) {
  if (!summaryMessageBox) return;
  summaryMessageBox.textContent = message;
  summaryMessageBox.classList.remove('success', 'error');
  if (type) {
    summaryMessageBox.classList.add(type);
  }
}

function showStep(step) {
  activeStep = step;
  stepElements.forEach((element) => {
    element.classList.toggle('active', Number(element.dataset.step) === step);
  });
  progressSteps.forEach((element) => {
    const stepNumber = Number(element.dataset.step);
    element.classList.toggle('active', stepNumber === step);
    element.classList.toggle('completed', stepNumber < step);
  });
}

async function setActiveDate(dateStr) {
  activeDate = dateStr;
  const date = parseDate(dateStr);
  let needsReload = false;
  if (!Number.isNaN(date.getTime())) {
    if (date.getFullYear() !== currentYear || date.getMonth() !== currentMonth) {
      currentYear = date.getFullYear();
      currentMonth = date.getMonth();
      needsReload = true;
    }
  }
  if (needsReload) {
    await loadMonthBookings(currentYear, currentMonth);
  }
  renderMonthCalendar();
  renderDayView();
  renderWeekView();
}

function setActiveView(view) {
  activeView = view;
  viewToggleButtons.forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
  if (dayViewPanel) {
    dayViewPanel.classList.toggle('active', view === 'day');
  }
  if (weekViewPanel) {
    weekViewPanel.classList.toggle('active', view === 'week');
  }
}

function focusDayPanel() {
  if (dayViewPanel) {
    dayViewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function submitBooking() {
  if (isSubmitting) return;
  displaySummaryMessage(null, '');

  if (selectedSlots.length === 0) {
    displaySummaryMessage('error', 'Du har ikke valgt noen tider.');
    showStep(1);
    return;
  }

  if (!isContactInfoComplete()) {
    displaySummaryMessage('error', 'Vennligst fyll ut kontaktinformasjonen.');
    showStep(2);
    return;
  }

  const contactInfoResult = getContactInfo();
  if (!contactInfoResult.ok) {
    displaySummaryMessage('error', contactInfoResult.message);
    showStep(2);
    return;
  }

  if (!supabaseClient) {
    displaySummaryMessage(
      'error',
      'Kan ikke fullføre bestillingen fordi Supabase-nøkler mangler. Sett inn gyldig URL og anon key.',
    );
    return;
  }

  // Sjekk tilgjengelighet igjen
  let unavailable = false;

  const monthCache = new Map();
  const ensureMonthData = async (dateStr) => {
    const dateObj = parseDate(dateStr);
    if (Number.isNaN(dateObj.getTime())) {
      return;
    }
    const key = `${dateObj.getFullYear()}-${dateObj.getMonth()}`;
    if (monthCache.has(key)) {
      monthBookings = monthCache.get(key);
      return;
    }
    await loadMonthBookings(dateObj.getFullYear(), dateObj.getMonth());
    monthCache.set(key, monthBookings.slice());
  };

  for (const slot of selectedSlots) {
    // Sørg for at vi har ferske data fra Supabase for måneden før vi sjekker
    await ensureMonthData(slot.date);
    const { available } = getTimeStatus(slot.date, slot.time, { includePending: false });
    const needed = slot.lane === 'full' ? 2 : 1;
    if (available < needed) {
      unavailable = true;
      break;
    }
  }

  // Sett tilbake kalenderdataene til aktiv måned slik at visningen holder seg i synk
  await ensureMonthData(formatDate(new Date(currentYear, currentMonth, 1)));

  if (unavailable) {
    displaySummaryMessage('error', 'En eller flere av de valgte tidene er ikke lenger tilgjengelige.');
    return;
  }

  isSubmitting = true;
  if (completeBookingBtn) {
    completeBookingBtn.disabled = true;
  }

  const contactInfo = contactInfoResult.data;
  const insertData = selectedSlots.map((slot) => ({
    date: slot.date,
    time: slot.time,
    lane: slot.lane,
    ...contactInfo,
  }));
  const { error } = await supabaseClient.from('bookings').insert(insertData);
  if (error) {
    console.error('Feil under lagring av bestilling:', error);
    displaySummaryMessage(
      'error',
      'Det oppstod en feil under lagring av bestillingen. Prøv igjen.',
    );
    isSubmitting = false;
    if (completeBookingBtn) {
      completeBookingBtn.disabled = false;
    }
    return;
  }
  await loadMonthBookings(currentYear, currentMonth);

  selectedSlots = [];
  if (customerForm) {
    customerForm.reset();
  }
  updateSummary();
  ensureActiveDateInMonth();
  renderMonthCalendar();
  renderDayView();
  renderWeekView();
  updateStepControls();

  displaySummaryMessage('success', 'Bestillingen er sendt! Vennligst betal via Vipps.');
  isSubmitting = false;
  if (completeBookingBtn) {
    completeBookingBtn.disabled = false;
  }
}

if (customerForm) {
  customerForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}

if (prevMonthBtn) {
  prevMonthBtn.addEventListener('click', async () => {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear -= 1;
    } else {
      currentMonth -= 1;
    }
    await loadMonthBookings(currentYear, currentMonth);
    ensureActiveDateInMonth();
    renderMonthCalendar();
    renderDayView();
    renderWeekView();
  });
}

if (nextMonthBtn) {
  nextMonthBtn.addEventListener('click', async () => {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear += 1;
    } else {
      currentMonth += 1;
    }
    await loadMonthBookings(currentYear, currentMonth);
    ensureActiveDateInMonth();
    renderMonthCalendar();
    renderDayView();
    renderWeekView();
  });
}

viewToggleButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const view = button.dataset.view;
    if (view) {
      setActiveView(view);
    }
  });
});

if (step1NextBtn) {
  step1NextBtn.addEventListener('click', () => {
    if (!step1NextBtn.disabled) {
      showStep(2);
    }
  });
}

if (step2BackBtn) {
  step2BackBtn.addEventListener('click', () => showStep(1));
}

if (step2NextBtn) {
  step2NextBtn.addEventListener('click', () => {
    if (!step2NextBtn.disabled) {
      showStep(3);
    }
  });
}

if (step3BackBtn) {
  step3BackBtn.addEventListener('click', () => showStep(2));
}

if (completeBookingBtn) {
  completeBookingBtn.addEventListener('click', submitBooking);
}

contactFields.forEach((field) => {
  field.addEventListener('input', updateStepControls);
  field.addEventListener('change', updateStepControls);
});

(async function init() {
  await loadMonthBookings(currentYear, currentMonth);
  ensureActiveDateInMonth();
  renderMonthCalendar();
  setActiveView(activeView);
  renderDayView();
  renderWeekView();
  updateSummary();
  updateStepControls();
  showStep(activeStep);
})();

const yearSpan = document.getElementById('year');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}
