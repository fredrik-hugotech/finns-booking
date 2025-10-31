/*
 * Client‑side logic for the Finns.Fairway booking page.  This script
 * populates the available time slots, fetches existing bookings
 * from Supabase for the chosen date and lane, blocks times that are
 * pre‑booked or already taken, and handles the submission of new
 * bookings.  To use this file you must set SUPABASE_URL and
 * SUPABASE_ANON_KEY to the values from your Supabase project.
 */

// TODO: replace these constants with your own project credentials.
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Initialise Supabase client if credentials are supplied.  If left
// blank, the booking page will still render but bookings will not
// persist across sessions.
const supabaseClient =
  SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL'
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Define the standard time slots (24‑hour format) you wish to offer.
const availableTimes = [
  '08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'
];

// List any pre‑booked times here.  Each entry must include a date
// string (YYYY‑MM‑DD), a time (HH:MM) and a lane type.  Lane
// conflicts are resolved by blocking both halves of a full booking.
const preBookedTimes = [
  // Example: { date: '2025-11-01', time: '16:00', lane: 'full' },
];

// Booking application state
const priceFull = 1990;
const priceHalf = 1490;
let selectedSlots = []; // { date, time, lane }
let monthBookings = []; // bookings loaded for the current month
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

// DOM elements for the new UI
const monthLabel = document.getElementById('monthLabel');
const monthCalendar = document.getElementById('monthCalendar');
const timesList = document.getElementById('timesList');
const selectedSlotsContainer = document.getElementById('selectedSlots');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');

const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const clubInput = document.getElementById('club');
const genderSelect = document.getElementById('gender');
const ageInput = document.getElementById('age');
const submitBookingBtn = document.getElementById('submitBooking');
const summaryMessageBox = document.getElementById('summaryMessage');

/**
 * Load all bookings for the given month (inclusive).
 * If Supabase is not configured, no bookings will be loaded.
 */
async function loadMonthBookings(year, month) {
  if (!supabaseClient) {
    monthBookings = [];
    return;
  }
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .gte('date', startStr)
    .lte('date', endStr);
  if (error) {
    console.error('Error loading month bookings:', error);
    monthBookings = [];
  } else {
    monthBookings = data || [];
  }
}

/**
 * Compute booking status for a given date.
 * Returns "full" if no half-lane units remain, "half" if over 50% booked,
 * otherwise "available".
 */
function computeDateStatus(dateStr) {
  const totalUnits = availableTimes.length * 2;
  let occupiedUnits = 0;
  // Occupy units from preBookedTimes
  preBookedTimes.forEach((b) => {
    if (b.date === dateStr) {
      occupiedUnits += b.lane === 'full' ? 2 : 1;
    }
  });
  // Occupy units from month bookings
  monthBookings.forEach((b) => {
    if (b.date === dateStr) {
      occupiedUnits += b.lane === 'full' ? 2 : 1;
    }
  });
  // Occupy units from current selection
  selectedSlots.forEach((b) => {
    if (b.date === dateStr) {
      occupiedUnits += b.lane === 'full' ? 2 : 1;
    }
  });
  if (occupiedUnits >= totalUnits) return 'full';
  if (occupiedUnits >= totalUnits / 2) return 'half';
  return 'available';
}

/**
 * Render the month calendar grid.
 * Each day cell is colour-coded based on occupancy and clickable to load times.
 */
function renderMonthCalendar() {
  monthCalendar.innerHTML = '';
  const monthNames = [
    'Januar','Februar','Mars','April','Mai','Juni',
    'Juli','August','September','Oktober','November','Desember'
  ];
  monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  const firstDay = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  // Determine Monday-based weekday index (0=Monday)
  const startWeekday = (firstDay.getDay() + 6) % 7;
  // Fill blank cells for days before the 1st
  for (let i = 0; i < startWeekday; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-cell empty';
    monthCalendar.appendChild(blank);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.classList.add('day-cell');
    const status = computeDateStatus(dateStr);
    if (status === 'full') {
      cell.classList.add('full-day');
    } else if (status === 'half') {
      cell.classList.add('half-day');
    } else {
      cell.classList.add('available-day');
    }
    if (selectedSlots.some(s => s.date === dateStr)) {
      cell.classList.add('selected-day');
    }
    cell.textContent = day;
    cell.addEventListener('click', () => {
      loadTimesForDate(dateStr);
    });
    monthCalendar.appendChild(cell);
  }
}

/**
 * Render available time options for a specific date.
 * For each time, show buttons to select half or full lane, based on availability.
 */
function loadTimesForDate(dateStr) {
  timesList.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = `Tilgjengelige tider ${dateStr}`;
  timesList.appendChild(heading);
  let any = false;
  availableTimes.forEach((time) => {
    // Determine occupied units for this time
    let occupied = 0;
    preBookedTimes.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += b.lane === 'full' ? 2 : 1;
      }
    });
    monthBookings.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += b.lane === 'full' ? 2 : 1;
      }
    });
    selectedSlots.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += b.lane === 'full' ? 2 : 1;
      }
    });
    const avail = 2 - occupied;
    if (avail <= 0) {
      // Fully booked; do not show options
      return;
    }
    any = true;
    const row = document.createElement('div');
    row.classList.add('time-row');
    const label = document.createElement('span');
    label.textContent = time;
    row.appendChild(label);
    // Half lane button
    const halfBtn = document.createElement('button');
    halfBtn.textContent = 'Halv';
    halfBtn.classList.add('time-button','half');
    if (avail >= 1) {
      halfBtn.addEventListener('click', () => {
        addSlot(dateStr, time, 'half');
      });
    } else {
      halfBtn.disabled = true;
    }
    // full lane button
    const fullBtn = document.createElement('button');
    fullBtn.textContent = 'Full';
    fullBtn.classList.add('time-button','full');
    if (avail >= 2) {
      fullBtn.addEventListener('click', () => {
        addSlot(dateStr, time, 'full');
      });
    } else {
      fullBtn.disabled = true;
    }
    row.appendChild(halfBtn);
    row.appendChild(fullBtn);
    timesList.appendChild(row);
  });
  if (!any) {
    const p = document.createElement('p');
    p.textContent = 'Ingen ledige tider denne dagen.';
    timesList.appendChild(p);
  }
}

/**
 * Add a slot to the user's selection.
 * Updates the summary, calendar and times list.
 */
function addSlot(dateStr, time, lane) {
  // Add slot to selections
  selectedSlots.push({ date: dateStr, time, lane });
  updateSummary();
  renderMonthCalendar();
  loadTimesForDate(dateStr);
}

/**
 * Update the selected slots summary with price calculation.
 */
function updateSummary() {
  selectedSlotsContainer.innerHTML = '';
  if (selectedSlots.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'Ingen tider valgt ennå.';
    selectedSlotsContainer.appendChild(p);
    return;
  }
  const list = document.createElement('ul');
  let total = 0;
  selectedSlots.forEach((slot, index) => {
    const li = document.createElement('li');
    const price = slot.lane === 'full' ? priceFull : priceHalf;
    total += price;
    li.textContent = `${slot.date} kl ${slot.time} – ${slot.lane === 'full' ? 'Full bane' : 'Halv bane'} (${price} kr) `;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Fjern';
    removeBtn.classList.add('remove-button');
    removeBtn.addEventListener('click', () => {
      selectedSlots.splice(index, 1);
      updateSummary();
      renderMonthCalendar();
      loadTimesForDate(slot.date);
    });
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
  selectedSlotsContainer.appendChild(list);
  const totalEl = document.createElement('p');
  totalEl.classList.add('total-price');
  totalEl.textContent = `Total pris: ${total} kr`;
  selectedSlotsContainer.appendChild(totalEl);
}

/**
 * Finalise the booking: validates input, checks availability, inserts into Supabase.
 */
async function submitBooking() {
  summaryMessageBox.textContent = '';
  summaryMessageBox.classList.remove('success','error');
  if (selectedSlots.length === 0) {
    summaryMessageBox.textContent = 'Du har ikke valgt noen tider.';
    summaryMessageBox.classList.add('error');
    return;
  }
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const email = emailInput.value.trim();
  const club = clubInput.value.trim();
  const gender = genderSelect.value;
  const age = ageInput.value.trim();
  if (!name || !phone || !email || !club || !gender || !age) {
    summaryMessageBox.textContent = 'Vennligst fyll ut alle personopplysninger.';
    summaryMessageBox.classList.add('error');
    return;
  }
  // Check availability for each selected slot again
  let unavailable = false;
  selectedSlots.forEach((slot) => {
    let occupied = 0;
    preBookedTimes.forEach((b) => {
      if (b.date === slot.date && b.time === slot.time) {
        occupied += b.lane === 'full' ? 2 : 1;
      }
    });
    monthBookings.forEach((b) => {
      if (b.date === slot.date && b.time === slot.time) {
        occupied += b.lane === 'full' ? 2 : 1;
      }
    });
    const available = 2 - occupied;
    const needed = slot.lane === 'full' ? 2 : 1;
    if (available < needed) {
      unavailable = true;
    }
  });
  if (unavailable) {
    summaryMessageBox.textContent = 'En eller flere av de valgte tidene er ikke lenger tilgjengelige.';
    summaryMessageBox.classList.add('error');
    return;
  }
  // Save to Supabase
  if (supabaseClient) {
    const insertData = selectedSlots.map((slot) => ({
      date: slot.date,
      time: slot.time,
      lane: slot.lane,
      name,
      phone,
      email,
      club,
      gender,
      age
    }));
    const { error } = await supabaseClient.from('bookings').insert(insertData);
    if (error) {
      console.error('Error inserting bookings:', error);
      summaryMessageBox.textContent = 'Det oppstod en feil under lagring av bestillingen.';
      summaryMessageBox.classList.add('error');
      return;
    }
    // Refresh month bookings so the calendar updates
    await loadMonthBookings(currentYear, currentMonth);
  } else {
    // If Supabase isn't configured, just add to monthBookings in memory
    selectedSlots.forEach((slot) => {
      monthBookings.push({ date: slot.date, time: slot.time, lane: slot.lane });
    });
  }
  // Clear selection and form
  selectedSlots = [];
  updateSummary();
  renderMonthCalendar();
  timesList.innerHTML = '';
  nameInput.value = '';
  phoneInput.value = '';
  emailInput.value = '';
  clubInput.value = '';
  genderSelect.value = '';
  ageInput.value = '';
  summaryMessageBox.textContent = 'Bestillingen er sendt! Vennligst betal via Vipps.';
  summaryMessageBox.classList.add('success');
}

// Event listeners for month navigation and booking submission
prevMonthBtn.addEventListener('click', async () => {
  if (currentMonth === 0) {
    currentMonth = 11;
    currentYear -= 1;
  } else {
    currentMonth -= 1;
  }
  await loadMonthBookings(currentYear, currentMonth);
  renderMonthCalendar();
  timesList.innerHTML = '';
});
nextMonthBtn.addEventListener('click', async () => {
  if (currentMonth === 11) {
    currentMonth = 0;
    currentYear += 1;
  } else {
    currentMonth += 1;
  }
  await loadMonthBookings(currentYear, currentMonth);
  renderMonthCalendar();
  timesList.innerHTML = '';
});

submitBookingBtn.addEventListener('click', submitBooking);

// Initialise the page by loading the current month's bookings and rendering the calendar
(async function init() {
  await loadMonthBookings(currentYear, currentMonth);
  renderMonthCalendar();
})();

// Set current year in footer
const yearSpan = document.getElementById('year');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}