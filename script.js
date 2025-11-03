/*
 * Client‑side logic for the Finns.Fairway booking page.  This script
 * populates the available time slots, fetches existing bookings
 * from Supabase for the chosen date and lane, blocks times that are
 * pre‑booked or already taken, and handles the submission of new
 * bookings.  To use this file you must set SUPABASE_URL and
 * SUPABASE_ANON_KEY to the values from your Supabase project.
 */

// TODO: replace these constants with your own project credentials.
const SUPABASE_URL = 'https://bpbqcqqlqrdruxbottdn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwYnFjcXFscXJkcnV4Ym90dGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE5MDAzNTAsImV4cCI6MjA3NzQ3NjM1MH0.kxHA7ta7ld95-PDhVEDvkgxJ-BhHjI0Zn2fwWv7LFNc';

// Initialise Supabase client if credentials are supplied.  If left
// blank, the booking page will still render but bookings will not
// persist across sessions.
const supabaseClient =
  SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL'
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Define the standard time slots (24‑hour format) you wish to offer.
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
  '20:00'
];

function formatTimeInterval(startTime) {
  if (!startTime) return '';
  const [hourStr, minuteStr] = startTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const endTotalMinutes = hour * 60 + minute + 60;
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(hour)}:${pad(minute)}-${pad(endHour)}:${pad(endMinute)}`;
}

// List any pre‑booked times here.  Each entry must include a date
// string (YYYY‑MM‑DD), a time (HH:MM) and a lane type.  Lane
// conflicts are resolved by blocking both halves of a full booking.
const preBookedTimes = [
  // Example: { date: '2025-11-01', time: '16:00', lane: 'full' },
];

const FULL_LANE_VALUES = new Set(['full', 'full bane', 'full lane']);
const HALF_LANE_VALUES = new Set(['half', 'half lane', 'halv', 'halv bane']);

function normalizeLane(lane) {
  if (!lane) return '';
  const value = String(lane).trim().toLowerCase();
  if (FULL_LANE_VALUES.has(value)) return 'full';
  if (HALF_LANE_VALUES.has(value)) return 'half';
  return value;
}

function laneUnits(lane) {
  return normalizeLane(lane) === 'full' ? 2 : 1;
}

// Booking application state
const priceFull = 1990;
const priceHalf = 1490;
let selectedSlots = []; // { date, time, lane }
let monthBookings = []; // bookings loaded for the current month
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let activeDate = null;

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
const confirmationScreen = document.getElementById('confirmationScreen');
const confirmationSlotsList = document.getElementById('confirmationSlots');
const confirmationTotal = document.getElementById('confirmationTotal');
const confirmationBackBtn = document.getElementById('confirmationBack');
let showBookedDetails = false;

/**
 * Load all bookings for the given month (inclusive).
 * If Supabase is not configured, no bookings will be loaded.
 */
async function loadMonthBookings(year, month) {
  if (!supabaseClient) {
    monthBookings = [];
    return;
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pad = (value) => String(value).padStart(2, '0');
  const startStr = `${year}-${pad(month + 1)}-01`;
  const endStr = `${year}-${pad(month + 1)}-${pad(daysInMonth)}`;
  const { data, error } = await supabaseClient
    .from('bookings')
    .select('*')
    .gte('date', startStr)
    .lte('date', endStr);
  if (error) {
    console.error('Error loading month bookings:', error);
    monthBookings = [];
  } else {
    monthBookings = (data || []).map((booking) => ({
      ...booking,
      lane: normalizeLane(booking.lane)
    }));
  }
}

/**
 * Compute booking status for a given date.
 * Counts occupancy per time slot (capped at two units) so a day only
 * registers as full when every available slot is taken. Returns "full" if
 * no half-lane units remain, "half" if over 50% booked, otherwise
 * "available".
 */
function computeDateStatus(dateStr) {
  const totalUnits = availableTimes.length * 2;
  let occupiedUnits = 0;

  availableTimes.forEach((time) => {
    let timeUnits = 0;
    preBookedTimes.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        timeUnits += laneUnits(b.lane);
      }
    });
    monthBookings.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        timeUnits += laneUnits(b.lane);
      }
    });
    selectedSlots.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        timeUnits += laneUnits(b.lane);
      }
    });
    occupiedUnits += Math.min(timeUnits, 2);
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
  const dayNames = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
  monthLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  dayNames.forEach((name) => {
    const headerCell = document.createElement('div');
    headerCell.className = 'day-cell day-name';
    headerCell.textContent = name;
    monthCalendar.appendChild(headerCell);
  });
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
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.classList.add('day-cell');
    const status = computeDateStatus(dateStr);
    const statusLabel =
      status === 'full' ? 'fullbooket' : status === 'half' ? 'begrenset kapasitet' : 'ledig kapasitet';
    let ariaLabel = `${day}. ${monthNames[currentMonth]}`;
    if (dateStr === todayStr) {
      cell.classList.add('today');
      ariaLabel = `I dag, ${ariaLabel}`;
    }
    cell.setAttribute('aria-label', `${ariaLabel} – ${statusLabel}`);
    if (status === 'full') {
      cell.classList.add('full-day');
    } else if (status === 'half') {
      cell.classList.add('half-day');
    } else {
      cell.classList.add('available-day');
    }
    if (activeDate === dateStr) {
      cell.classList.add('active-day');
    }
    if (selectedSlots.some(s => s.date === dateStr)) {
      cell.classList.add('selected-day');
    }
    cell.textContent = day;
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', status === 'full' ? '-1' : '0');
    if (status === 'full') {
      cell.setAttribute('aria-disabled', 'true');
    } else {
      cell.addEventListener('click', () => {
        loadTimesForDate(dateStr);
      });
      cell.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          loadTimesForDate(dateStr);
        }
      });
    }
    monthCalendar.appendChild(cell);
  }
}

/**
 * Render available time options for a specific date.
 * For each time, show buttons to select half or full lane, based on availability.
 */
function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function loadTimesForDate(dateStr) {
  activeDate = dateStr;
  renderMonthCalendar();
  timesList.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = `Tilgjengelige tider – ${formatDateLabel(dateStr)}`;
  timesList.appendChild(heading);

  const namedBookings = monthBookings
    .filter((booking) => {
      if (booking.date !== dateStr) {
        return false;
      }
      const nameText = String(booking.name ?? '').trim();
      return nameText !== '';
    })
    .map((booking) => ({
      ...booking,
      lane: normalizeLane(booking.lane),
      name: String(booking.name ?? '').trim()
    }));

  if (namedBookings.length === 0) {
    showBookedDetails = false;
  }

  if (namedBookings.length > 0) {
    const toggleWrapper = document.createElement('div');
    toggleWrapper.classList.add('bookings-toggle');
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.classList.add('booking-toggle-button');
    toggleBtn.textContent = showBookedDetails ? 'Skjul bookede tider' : 'Vis bookede tider';
    toggleBtn.setAttribute('aria-pressed', showBookedDetails ? 'true' : 'false');
    toggleBtn.addEventListener('click', () => {
      showBookedDetails = !showBookedDetails;
      loadTimesForDate(dateStr);
    });
    toggleWrapper.appendChild(toggleBtn);
    timesList.appendChild(toggleWrapper);
  }

  const bookingsByTime = namedBookings.reduce((acc, booking) => {
    if (!acc[booking.time]) {
      acc[booking.time] = [];
    }
    acc[booking.time].push(booking);
    return acc;
  }, {});

  let hasAvailable = false;
  availableTimes.forEach((time) => {
    // Determine occupied units for this time
    let occupied = 0;
    preBookedTimes.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += laneUnits(b.lane);
      }
    });
    monthBookings.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += laneUnits(b.lane);
      }
    });
    selectedSlots.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += laneUnits(b.lane);
      }
    });
    const avail = 2 - occupied;
    if (avail > 0) {
      hasAvailable = true;
    }
    if (avail <= 0 && !showBookedDetails) {
      return;
    }

    const row = document.createElement('div');
    row.classList.add('time-row');
    if (avail <= 0) {
      row.classList.add('time-row-unavailable');
    }
    const label = document.createElement('span');
    label.textContent = formatTimeInterval(time);
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
      halfBtn.setAttribute('aria-disabled', 'true');
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
      fullBtn.setAttribute('aria-disabled', 'true');
    }

    if (avail <= 0) {
      halfBtn.classList.add('disabled');
      fullBtn.classList.add('disabled');
    }
    row.appendChild(halfBtn);
    row.appendChild(fullBtn);

    const bookingsForTime = (bookingsByTime[time] || [])
      .slice()
      .sort((a, b) => {
        const laneDiff = laneUnits(b.lane) - laneUnits(a.lane);
        if (laneDiff !== 0) {
          return laneDiff;
        }
        return a.name.localeCompare(b.name);
      });
    if (showBookedDetails && bookingsForTime.length > 0) {
      const bookedList = document.createElement('ul');
      bookedList.classList.add('time-bookings');
      bookingsForTime.forEach((booking) => {
        const item = document.createElement('li');
        item.classList.add('time-booking-item');
        const laneLabel = booking.lane === 'full' ? 'Full bane' : 'Halv bane';
        item.textContent = `${laneLabel}: ${booking.name}`;
        bookedList.appendChild(item);
      });
      row.appendChild(bookedList);
    }
    timesList.appendChild(row);
  });
  if (!hasAvailable) {
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
  const laneValue = normalizeLane(lane) || lane;
  selectedSlots.push({ date: dateStr, time, lane: laneValue });
  updateSummary();
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
    const laneType = normalizeLane(slot.lane);
    const laneLabel = laneType === 'full' ? 'Full bane' : 'Halv bane';
    const price = laneType === 'full' ? priceFull : priceHalf;
    total += price;
    li.textContent = `${slot.date} kl ${formatTimeInterval(slot.time)} – ${laneLabel} (${price} kr) `;
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Fjern';
    removeBtn.classList.add('remove-button');
    removeBtn.addEventListener('click', () => {
      selectedSlots.splice(index, 1);
      updateSummary();
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
        occupied += laneUnits(b.lane);
      }
    });
    monthBookings.forEach((b) => {
      if (b.date === slot.date && b.time === slot.time) {
        occupied += laneUnits(b.lane);
      }
    });
    const available = 2 - occupied;
    const needed = laneUnits(slot.lane);
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
      lane: normalizeLane(slot.lane) || slot.lane,
      name,
      phone,
      email,
      club,
      gender,
      age
    }));
    const { error } = await supabaseClient.from('bookings').insert(insertData, { returning: 'minimal' });
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
      monthBookings.push({
        date: slot.date,
        time: slot.time,
        lane: normalizeLane(slot.lane),
        name,
        phone,
        email,
        club,
        gender,
        age
      });
    });
  }
  const confirmedSlots = selectedSlots.map((slot) => ({ ...slot }));
  // Clear selection and form
  selectedSlots = [];
  activeDate = null;
  showBookedDetails = false;
  updateSummary();
  renderMonthCalendar();
  timesList.innerHTML = '';
  nameInput.value = '';
  phoneInput.value = '';
  emailInput.value = '';
  clubInput.value = '';
  genderSelect.value = '';
  ageInput.value = '';
  summaryMessageBox.textContent = '';
  summaryMessageBox.classList.remove('success', 'error');
  showConfirmation(confirmedSlots);
}

function showConfirmation(slots) {
  if (!confirmationScreen || !confirmationSlotsList || !confirmationTotal) {
    return;
  }
  confirmationSlotsList.innerHTML = '';
  let total = 0;
  if (slots.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Ingen tider registrert.';
    confirmationSlotsList.appendChild(li);
    confirmationTotal.textContent = '';
  } else {
    slots.forEach((slot) => {
      const laneType = normalizeLane(slot.lane);
      const lane = laneType === 'full' ? 'Full bane' : 'Halv bane';
      const price = laneType === 'full' ? priceFull : priceHalf;
      total += price;
      const li = document.createElement('li');
      li.textContent = `${formatDateLabel(slot.date)} kl ${formatTimeInterval(slot.time)} – ${lane} (${price} kr)`;
      confirmationSlotsList.appendChild(li);
    });
    confirmationTotal.textContent = `Total sum: ${total} kr`;
  }
  confirmationScreen.hidden = false;
  document.body.classList.add('has-overlay');
  if (confirmationBackBtn) {
    confirmationBackBtn.focus();
  }
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
  activeDate = null;
  showBookedDetails = false;
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
  activeDate = null;
  showBookedDetails = false;
  renderMonthCalendar();
  timesList.innerHTML = '';
});

submitBookingBtn.addEventListener('click', submitBooking);

if (confirmationBackBtn) {
  confirmationBackBtn.addEventListener('click', () => {
    confirmationScreen.hidden = true;
    document.body.classList.remove('has-overlay');
    confirmationSlotsList.innerHTML = '';
    confirmationTotal.textContent = '';
  });
}

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
