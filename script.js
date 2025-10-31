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
// blank, the booking form will still render but bookings will not
// persist across sessions.
let supabase = null;
if (SUPABASE_URL && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
  supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

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

// Store fetched bookings for the currently selected date.
let bookings = [];

// DOM elements
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const laneSelect = document.getElementById('lane');
const nameInput = document.getElementById('name');
const contactInput = document.getElementById('contact');
// Additional form elements for extended booking details
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const clubInput = document.getElementById('club');
const genderSelect = document.getElementById('gender');
const ageInput = document.getElementById('age');
const bookButton = document.getElementById('bookButton');
const messageBox = document.getElementById('message');
const calendarGrid = document.getElementById('calendarGrid');
const yearSpan = document.getElementById('year');

// Set current year in footer
yearSpan.textContent = new Date().getFullYear();

// Populate the date input with today's date as default
const today = new Date().toISOString().split('T')[0];
dateInput.value = today;

// Hook up event listeners
dateInput.addEventListener('change', handleDateOrLaneChange);
laneSelect.addEventListener('change', handleDateOrLaneChange);
bookButton.addEventListener('click', handleBooking);

// Initial render
loadBookings(dateInput.value).then(() => {
  renderCalendar();
});

// Fetch bookings for a specific date from Supabase.  If the client
// is not initialised, resolves with an empty array.
async function loadBookings(date) {
  if (!supabase) {
    bookings = [];
    return;
  }
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('date', date);
  if (error) {
    console.error('Error loading bookings:', error);
    bookings = [];
  } else {
    bookings = data || [];
  }
}

// When the date or lane changes we need to fetch new bookings and
// update the UI.
async function handleDateOrLaneChange() {
  const selectedDate = dateInput.value;
  await loadBookings(selectedDate);
  renderCalendar();
}

// Render the calendar grid based on the selected date and lane.
function renderCalendar() {
  const selectedDate = dateInput.value;
  const selectedLane = laneSelect.value;
  // Clear current grid and time options
  calendarGrid.innerHTML = '';
  timeSelect.innerHTML = '';

  availableTimes.forEach((time) => {
    const slot = document.createElement('div');
    slot.textContent = time;
    slot.classList.add('calendar-slot');
    // Determine if slot is unavailable because of a pre-booking or existing booking
    const isPreBooked = preBookedTimes.some(
      (b) => b.date === selectedDate && b.time === time && (b.lane === selectedLane || b.lane === 'full' || selectedLane === 'full')
    );
    const isBooked = bookings.some(
      (b) => b.date === selectedDate && b.time === time && (b.lane === selectedLane || b.lane === 'full' || selectedLane === 'full')
    );
    const unavailable = isPreBooked || isBooked;
    if (unavailable) {
      slot.classList.add('unavailable');
    } else {
      slot.classList.add('available');
      slot.addEventListener('click', () => {
        timeSelect.value = time;
      });
      // Add to time dropdown
      const opt = document.createElement('option');
      opt.value = time;
      opt.textContent = time;
      timeSelect.appendChild(opt);
    }
    calendarGrid.appendChild(slot);
  });
}

// Handle new booking submission
async function handleBooking() {
  const date = dateInput.value;
  const time = timeSelect.value;
  const lane = laneSelect.value;
  const name = nameInput.value.trim();
  // Collect extended booking details from the form
  const phone = phoneInput.value.trim();
  const email = emailInput.value.trim();
  const club = clubInput.value.trim();
  const gender = genderSelect.value;
  const age = ageInput.value.trim();
  messageBox.textContent = '';
  messageBox.classList.remove('success', 'error');

  if (!date || !time || !lane) {
    messageBox.textContent = 'Vennligst velg dato, tid og banetype.';
    messageBox.classList.add('error');
    return;
  }
  if (!name) {
    messageBox.textContent = 'Vennligst skriv inn ditt navn.';
    messageBox.classList.add('error');
    return;
  }
  // Require phone, email, club, gender and age to be provided
  if (!phone || !email || !club || !gender || !age) {
    messageBox.textContent = 'Vennligst oppgi telefonnummer, e‑post, klubb, kjønn og alder.';
    messageBox.classList.add('error');
    return;
  }

  // Check again if the slot is still available before booking
  const conflictPre = preBookedTimes.some((b) => b.date === date && b.time === time && (b.lane === lane || b.lane === 'full' || lane === 'full'));
  const conflictExisting = bookings.some((b) => b.date === date && b.time === time && (b.lane === lane || b.lane === 'full' || lane === 'full'));
  if (conflictPre || conflictExisting) {
    messageBox.textContent = 'Den valgte tiden er dessverre ikke tilgjengelig.';
    messageBox.classList.add('error');
    return;
  }

  if (!supabase) {
    // If there is no Supabase client configured, store booking only in memory.
    bookings.push({ date, time, lane, name, phone, email, club, gender, age });
    renderCalendar();
    messageBox.textContent = 'Reservasjonen ble registrert (kun lokalt).';
    messageBox.classList.add('success');
    return;
  }
  // Insert the booking into Supabase
  const { error } = await supabase.from('bookings').insert([
    { date, time, lane, name, phone, email, club, gender, age }
  ]);
  if (error) {
    console.error('Error creating booking:', error);
    messageBox.textContent = 'Det oppstod en feil under lagring av reservasjonen.';
    messageBox.classList.add('error');
    return;
  }
  // Update local state and UI
  bookings.push({ date, time, lane, name, phone, email, club, gender, age });
  renderCalendar();
  // Clear form fields
  timeSelect.value = '';
  nameInput.value = '';
  phoneInput.value = '';
  emailInput.value = '';
  clubInput.value = '';
  genderSelect.value = '';
  ageInput.value = '';
  messageBox.textContent = 'Reservasjonen ble registrert!';
  messageBox.classList.add('success');
}