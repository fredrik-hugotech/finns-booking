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

const AUTH_USERNAME = 'finnsfairway';
const AUTH_PASSWORD = '12345';

let isAuthenticated = false;
let bookingInitialised = false;

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('loginForm');
const loginUsernameInput = document.getElementById('loginUsername');
const loginPasswordInput = document.getElementById('loginPassword');
const loginErrorBox = document.getElementById('loginError');
const loginToggleBtn = document.getElementById('loginToggle');
const loginCancelBtn = document.getElementById('loginCancel');
const myBookingsOverlay = document.getElementById('myBookingsOverlay');
const myBookingsToggleBtn = document.getElementById('myBookingsToggle');
const myBookingsCloseBtn = document.getElementById('myBookingsClose');
const myBookingsForm = document.getElementById('myBookingsForm');
const myBookingsPhoneInput = document.getElementById('myBookingsPhone');
const myBookingsEmailInput = document.getElementById('myBookingsEmail');
const myBookingsListContainer = document.getElementById('myBookingsList');
const myBookingsFeedback = document.getElementById('myBookingsFeedback');
const publicPage = document.querySelector('.page');
const adminPanel = document.getElementById('adminPanel');
const adminCloseBtn = document.getElementById('adminClose');
const adminLogoutBtn = document.getElementById('adminLogout');

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let loginOverlayTrigger = null;
let loginFocusTrapCleanup = null;
let myBookingsOverlayTrigger = null;
let myBookingsFocusTrapCleanup = null;

const CALENDAR_BUCKET = 'booking-calendar';
const CALENDAR_FILENAME = 'bookings.ics';
let calendarSignedUrl = null;
let calendarBucketEnsured = false;
let calendarStorageDisabled = false;

const ADMIN_NOTIFICATION_RECIPIENTS = [
  'post@finnsfairway.no',
  'fredrik@finnsfairway.no'
];
const ADMIN_NOTIFICATION_FUNCTION_NAME = 'send-booking-notification';
const ADMIN_NOTIFICATION_TABLE = 'booking_notifications';

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
  '20:00',
  '21:00',
  '22:00'
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

function addHourToTime(startTime) {
  if (!startTime) return '00:00';
  const [hourStr, minuteStr] = startTime.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const endTotalMinutes = hour * 60 + minute + 60;
  const endHour = Math.floor(endTotalMinutes / 60) % 24;
  const endMinute = endTotalMinutes % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(endHour)}:${pad(endMinute)}`;
}

function normalisePhone(value) {
  if (value == null) return '';
  const input = String(value).trim();
  if (!input) {
    return '';
  }
  const digitsOnly = input.replace(/\D+/g, '');
  return digitsOnly;
}

function extractPhoneDigits(value) {
  if (value == null) return '';
  return String(value)
    .trim()
    .replace(/\D+/g, '');
}

function phonesMatch(a, b) {
  const digitsA = extractPhoneDigits(a);
  const digitsB = extractPhoneDigits(b);
  if (!digitsA || !digitsB) {
    return false;
  }
  if (digitsA === digitsB) {
    return true;
  }
  return digitsA.endsWith(digitsB) || digitsB.endsWith(digitsA);
}

function normaliseTimeValue(value) {
  if (value == null) {
    return '';
  }
  const parts = String(value).trim().split(':');
  if (!parts.length) {
    return '';
  }
  const hours = String(parts[0] ?? '').padStart(2, '0');
  const minutes = String(parts[1] ?? '00').padStart(2, '0');
  return `${hours}:${minutes}`;
}

function buildTimeQueryValues(value) {
  const base = normaliseTimeValue(value);
  if (!base) {
    return [];
  }
  const withSeconds = `${base}:00`;
  return withSeconds === base ? [base] : [base, withSeconds];
}

function lanesEquivalent(a, b) {
  return normalizeLane(a) === normalizeLane(b);
}

function laneAliasValues(lane) {
  const normalised = normalizeLane(lane);
  if (!normalised) {
    return [];
  }
  if (normalised === 'full') {
    return ['full', 'full bane', 'full lane'];
  }
  if (normalised === 'half') {
    return ['half', 'halv', 'halv bane', 'half lane'];
  }
  return [normalised];
}

function parseDateParts(dateStr) {
  if (!dateStr) {
    return null;
  }
  const [yearStr, monthStr, dayStr] = String(dateStr).split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const day = Number(dayStr);
  if ([year, monthIndex, day].some((part) => Number.isNaN(part))) {
    return null;
  }
  return { year, monthIndex, day };
}

async function locateBookingByContact(booking) {
  if (!booking) {
    return null;
  }
  const dateStr = String(booking.date || '').trim();
  const timeStr = normaliseTimeValue(booking.time);
  const laneValue = normalizeLane(booking.lane);
  if (!dateStr || !timeStr || !laneValue) {
    return null;
  }

  const parsedDate = parseDateParts(dateStr);
  if (!parsedDate) {
    return null;
  }

  const { year, monthIndex } = parsedDate;
  let monthData = [];
  if (year === currentYear && monthIndex === currentMonth) {
    monthData = monthBookings.slice();
  } else if (adminBookings.length && year === adminYear && monthIndex === adminMonth) {
    monthData = adminBookings.slice();
  } else {
    monthData = await fetchMonthBookings(year, monthIndex);
  }

  const targetEmail = String(booking.email || '').trim().toLowerCase();
  const targetPhone = normalisePhone(booking.phone);

  return (monthData || []).find((entry) => {
    if (!entry) {
      return false;
    }
    const entryDate = String(entry.date || '').trim();
    const entryTime = normaliseTimeValue(entry.time);
    if (entryDate !== dateStr) {
      return false;
    }
    if (entryTime !== timeStr) {
      return false;
    }
    if (!lanesEquivalent(entry.lane, laneValue)) {
      return false;
    }
    const entryPhone = normalisePhone(entry.phone);
    const entryEmail = String(entry.email || '').trim().toLowerCase();
    const phoneMatches = targetPhone && entryPhone && phonesMatch(entryPhone, targetPhone);
    const emailMatches = targetEmail && entryEmail && entryEmail === targetEmail;
    return phoneMatches || emailMatches;
  }) || null;
}

async function deleteBookingByIdentity(booking) {
  if (!supabaseClient || !booking) {
    return null;
  }
  const dateStr = String(booking.date || '').trim();
  const timeValues = buildTimeQueryValues(booking.time);
  const laneValues = laneAliasValues(booking.lane);
  const phoneValue = normalisePhone(booking.phone);
  const emailValue = String(booking.email || '').trim();

  if (!dateStr || !timeValues.length || !laneValues.length) {
    return null;
  }

  const contactCombos = [];
  if (phoneValue && emailValue) {
    contactCombos.push({ phone: phoneValue, email: emailValue });
  }
  if (phoneValue) {
    contactCombos.push({ phone: phoneValue });
  }
  if (emailValue) {
    contactCombos.push({ email: emailValue });
  }

  for (const timeValue of timeValues) {
    for (const combo of contactCombos) {
      let query = supabaseClient.from('bookings').delete().eq('date', dateStr).eq('time', timeValue);
      if (laneValues.length === 1) {
        query = query.eq('lane', laneValues[0]);
      } else if (laneValues.length > 1) {
        query = query.in('lane', laneValues);
      }
      if (combo.phone) {
        query = query.eq('phone', combo.phone);
      }
      if (combo.email) {
        query = query.eq('email', combo.email);
      }
      const result = await query.select('id');
      if (result.error) {
        throw result.error;
      }
      if (result.data && result.data.length) {
        return result;
      }
    }
  }

  const located = await locateBookingByContact(booking);
  if (located && located.id != null) {
    const retry = await supabaseClient.from('bookings').delete().eq('id', located.id).select('id');
    if (retry.error) {
      throw retry.error;
    }
    if (retry.data && retry.data.length) {
      return retry;
    }
  }

  return null;
}

function getBookingDateTime(booking) {
  if (!booking || !booking.date) return null;
  const [yearStr, monthStr, dayStr] = booking.date.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if ([year, month, day].some((part) => Number.isNaN(part))) {
    return null;
  }
  const [hourStr = '0', minuteStr = '0'] = String(booking.time || '00:00').split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  return new Date(year, month - 1, day, Number.isNaN(hour) ? 0 : hour, Number.isNaN(minute) ? 0 : minute);
}

function filterActiveBookings(bookings) {
  if (!Array.isArray(bookings)) {
    return [];
  }
  const now = new Date();
  return bookings
    .filter((booking) => {
      const start = getBookingDateTime(booking);
      return start && start.getTime() >= now.getTime();
    })
    .sort((a, b) => {
      const startA = getBookingDateTime(a)?.getTime() ?? 0;
      const startB = getBookingDateTime(b)?.getTime() ?? 0;
      if (startA !== startB) {
        return startA - startB;
      }
      const laneA = laneUnits(normalizeLane(a?.lane));
      const laneB = laneUnits(normalizeLane(b?.lane));
      if (laneA !== laneB) {
        return laneB - laneA;
      }
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
}

function gatherAllKnownBookings() {
  const combined = [...monthBookings, ...adminBookings];
  const unique = new Map();
  combined.forEach((booking) => {
    if (!booking) return;
    const key = booking.id != null ? `id:${booking.id}` : `${booking.date}|${booking.time}|${booking.name}|${booking.phone}|${booking.email}|${booking.lane}`;
    if (!unique.has(key)) {
      unique.set(key, booking);
    }
  });
  return Array.from(unique.values());
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

function formatGenderLabel(value) {
  if (!value) return '';
  const normalized = String(value).trim();
  if (!normalized) return '';
  const lower = normalized.toLowerCase();
  if (lower === 'mann') return 'Mann';
  if (lower === 'kvinne') return 'Kvinne';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

let seasonMonths = [];
let seasonMonthIndex = 0;
let adminSeasonMonthIndex = 0;
let currentYear = 0;
let currentMonth = 0;
let adminYear = 0;
let adminMonth = 0;
let activeDate = null;
let adminActiveDate = null;

function buildSeasonMonths() {
  return [
    { year: 2025, month: 11 },
    { year: 2026, month: 0 },
    { year: 2026, month: 1 },
    { year: 2026, month: 2 }
  ];
}

function findSeasonMonthIndex(year, month, monthsList = seasonMonths) {
  if (!Array.isArray(monthsList)) {
    return -1;
  }
  return monthsList.findIndex((entry) => entry.year === year && entry.month === month);
}

function selectSeasonMonth(index) {
  if (!Array.isArray(seasonMonths) || seasonMonths.length === 0) {
    seasonMonthIndex = 0;
    return;
  }
  const clampedIndex = Math.min(Math.max(index, 0), seasonMonths.length - 1);
  seasonMonthIndex = clampedIndex;
  const entry = seasonMonths[clampedIndex];
  currentYear = entry.year;
  currentMonth = entry.month;
}

function selectAdminSeasonMonth(index) {
  if (!Array.isArray(seasonMonths) || seasonMonths.length === 0) {
    adminSeasonMonthIndex = 0;
    return;
  }
  const clampedIndex = Math.min(Math.max(index, 0), seasonMonths.length - 1);
  adminSeasonMonthIndex = clampedIndex;
  const entry = seasonMonths[clampedIndex];
  adminYear = entry.year;
  adminMonth = entry.month;
}

function getSeasonStartDate() {
  if (!seasonMonths.length) {
    return null;
  }
  const first = seasonMonths[0];
  return new Date(first.year, first.month, 1);
}

function getSeasonEndDate() {
  if (!seasonMonths.length) {
    return null;
  }
  const last = seasonMonths[seasonMonths.length - 1];
  return new Date(last.year, last.month + 1, 0);
}

function isDateWithinSeasonRange(date) {
  if (!(date instanceof Date)) {
    return false;
  }
  const seasonStart = getSeasonStartDate();
  const seasonEnd = getSeasonEndDate();
  if (!seasonStart || !seasonEnd) {
    return false;
  }
  const endBoundary = new Date(
    seasonEnd.getFullYear(),
    seasonEnd.getMonth(),
    seasonEnd.getDate(),
    23,
    59,
    59,
    999
  );
  return date.getTime() >= seasonStart.getTime() && date.getTime() <= endBoundary.getTime();
}

function isDateWithinSeasonString(dateStr) {
  if (!dateStr) {
    return false;
  }
  const parts = dateStr.split('-').map((part) => Number(part));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }
  const [year, month, day] = parts;
  return isDateWithinSeasonRange(new Date(year, month - 1, day));
}

function formatDateFromParts(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateToISO(date) {
  if (!(date instanceof Date)) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function recalculateSeason(referenceDate = new Date()) {
  const previousPublic = { year: currentYear, month: currentMonth };
  const previousAdmin = { year: adminYear, month: adminMonth };
  const previousActiveDate = activeDate;
  const previousAdminActive = adminActiveDate;

  const nextSeasonMonths = buildSeasonMonths();
  seasonMonths = nextSeasonMonths;

  let newPublicIndex = findSeasonMonthIndex(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    nextSeasonMonths
  );
  if (newPublicIndex === -1) {
    newPublicIndex = findSeasonMonthIndex(previousPublic.year, previousPublic.month, nextSeasonMonths);
  }
  if (newPublicIndex === -1) {
    newPublicIndex = 0;
  }
  selectSeasonMonth(newPublicIndex);

  let newAdminIndex = findSeasonMonthIndex(previousAdmin.year, previousAdmin.month, nextSeasonMonths);
  if (newAdminIndex === -1) {
    newAdminIndex = seasonMonthIndex;
  }
  selectAdminSeasonMonth(newAdminIndex);

  if (previousActiveDate && !isDateWithinSeasonString(previousActiveDate)) {
    const defaultDate = formatDateFromParts(currentYear, currentMonth, 1);
    activeDate = defaultDate;
  }
  if (previousAdminActive && !isDateWithinSeasonString(previousAdminActive)) {
    const defaultAdminDate = formatDateFromParts(adminYear, adminMonth, 1);
    adminActiveDate = defaultAdminDate;
  }
}

// Booking application state
const priceFull = 1990;
const priceHalf = 1490;
let selectedSlots = []; // { date, time, lane }
let monthBookings = []; // bookings loaded for the current month
let adminBookings = [];
let myBookings = [];
let myBookingsCredentials = null;
let myBookingsLoaded = false;
let showInlineBookings = false;
const MY_BOOKINGS_LOOKAHEAD_MONTHS = 36; // look ahead up to three years for self-service searches

recalculateSeason();

function isAdminViewActive() {
  return Boolean(isAuthenticated && adminPanel && !adminPanel.hidden);
}

function shouldShowInlineBookings() {
  return isAdminViewActive() || (isAuthenticated && showInlineBookings);
}

function isInlineBookingMode() {
  return Boolean(isAuthenticated && showInlineBookings && !isAdminViewActive());
}

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
const adminMonthLabel = document.getElementById('adminMonthLabel');
const adminMonthCalendar = document.getElementById('adminMonthCalendar');
const adminTimesList = document.getElementById('adminTimesList');
const adminPrevMonthBtn = document.getElementById('adminPrevMonth');
const adminNextMonthBtn = document.getElementById('adminNextMonth');

function updateBodyOverlayState() {
  const hasOverlayVisible = Boolean(
    (loginOverlay && !loginOverlay.hidden) ||
      (confirmationScreen && !confirmationScreen.hidden) ||
      (myBookingsOverlay && !myBookingsOverlay.hidden)
  );
  if (hasOverlayVisible) {
    document.body.classList.add('has-overlay');
  } else {
    document.body.classList.remove('has-overlay');
  }
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter((element) => {
    if (element.hasAttribute('disabled')) {
      return false;
    }
    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    return true;
  });
}

function activateFocusTrap(container) {
  const focusableElements = getFocusableElements(container);
  if (!focusableElements.length) {
    return () => {};
  }
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  const handleKeydown = (event) => {
    if (event.key !== 'Tab') {
      return;
    }
    if (focusableElements.length === 1) {
      event.preventDefault();
      firstElement.focus();
      return;
    }
    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }
    if (document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  container.addEventListener('keydown', handleKeydown);

  return () => {
    container.removeEventListener('keydown', handleKeydown);
  };
}

function escapeICS(text) {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function formatICSDateTimeLocal(dateStr, timeStr) {
  if (!dateStr || !timeStr) return '';
  const date = dateStr.replace(/-/g, '');
  const time = timeStr.replace(':', '');
  return `${date}T${time}00`;
}

function formatICSDateTimeUTC(dateObj) {
  const pad = (value) => String(value).padStart(2, '0');
  const year = dateObj.getUTCFullYear();
  const month = pad(dateObj.getUTCMonth() + 1);
  const day = pad(dateObj.getUTCDate());
  const hours = pad(dateObj.getUTCHours());
  const minutes = pad(dateObj.getUTCMinutes());
  const seconds = pad(dateObj.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

async function ensureCalendarBucket() {
  if (calendarBucketEnsured || calendarStorageDisabled || !supabaseClient) {
    return calendarBucketEnsured;
  }
  try {
    const { data, error } = await supabaseClient.storage.getBucket(CALENDAR_BUCKET);
    if (data && !error) {
      calendarBucketEnsured = true;
      return true;
    }
  } catch (err) {
    console.warn('Kunne ikke hente kalenderbøtte:', err);
  }
  try {
    const { error: createError } = await supabaseClient.storage.createBucket(CALENDAR_BUCKET, {
      public: false
    });
    if (createError) {
      const message = String(createError.message || createError).toLowerCase();
      const blockedByPolicy =
        message.includes('row-level security') ||
        message.includes('not authorized') ||
        message.includes('permission');
      if (!message.includes('exists')) {
        if (blockedByPolicy) {
          console.info(
            'Manglende rettigheter til å opprette kalenderbøtte. Hopper over kalenderfeed.'
          );
          calendarStorageDisabled = true;
        } else {
          console.error('Feil ved opprettelse av kalenderbøtte:', createError);
        }
        return false;
      }
    }
    calendarBucketEnsured = true;
    return true;
  } catch (err) {
    const message = String(err?.message || err).toLowerCase();
    if (message.includes('row-level security') || message.includes('permission')) {
      console.info('Manglende rettigheter til å opprette kalenderbøtte. Hopper over kalenderfeed.');
      calendarStorageDisabled = true;
      return false;
    }
    console.error('Uventet feil ved opprettelse av kalenderbøtte:', err);
    return false;
  }
}

function generateCalendarFeed(bookings) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finns Fairway//Booking Calendar//NO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Finns Fairway Booking',
    'X-WR-TIMEZONE:Europe/Oslo',
    'BEGIN:VTIMEZONE',
    'TZID:Europe/Oslo',
    'X-LIC-LOCATION:Europe/Oslo',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0200',
    'TZNAME:CEST',
    'DTSTART:19700329T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:+0200',
    'TZOFFSETTO:+0100',
    'TZNAME:CET',
    'DTSTART:19701025T030000',
    'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  const nowStamp = formatICSDateTimeUTC(new Date());

  bookings.forEach((booking, index) => {
    if (!booking.date || !booking.time) return;
    const laneType = normalizeLane(booking.lane);
    const laneLabel = laneType === 'full' ? 'Full bane' : 'Halv bane';
    const start = formatICSDateTimeLocal(booking.date, booking.time);
    const end = formatICSDateTimeLocal(booking.date, addHourToTime(booking.time));
    const summary = `${laneLabel} – ${booking.name || 'Ukjent'}`;
    const genderLabel = formatGenderLabel(booking.gender);
    const detailsList = [
      booking.name ? `Navn: ${booking.name}` : null,
      booking.email ? `E-post: ${booking.email}` : null,
      booking.phone ? `Telefon: ${booking.phone}` : null,
      genderLabel ? `Kjønn: ${genderLabel}` : null,
      booking.age ? `Årskull: ${booking.age}` : null,
      booking.club ? `Klubb: ${booking.club}` : null
    ]
      .filter(Boolean)
      .join('\n');
    const details = detailsList || 'Ingen detaljer registrert.';
    const uidSource = booking.id
      ? `booking-${booking.id}`
      : `booking-${booking.date}-${booking.time}-${index}`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeICS(uidSource)}@finnsfairway.no`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;TZID=Europe/Oslo:${start}`);
    lines.push(`DTEND;TZID=Europe/Oslo:${end}`);
    lines.push(`SUMMARY:${escapeICS(summary)}`);
    lines.push(`DESCRIPTION:${escapeICS(details)}`);
    lines.push('LOCATION:Sparebanken Norge Arena');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

async function refreshCalendarFeed() {
  if (!supabaseClient) return;
  if (calendarStorageDisabled) {
    return;
  }
  try {
    const { data, error } = await supabaseClient
      .from('bookings')
      .select('*')
      .order('date', { ascending: true })
      .order('time', { ascending: true });
    if (error) {
      console.error('Kunne ikke laste bookinger for kalender:', error);
      return;
    }
    const normalized = (data || []).map((booking) => ({
      ...booking,
      lane: normalizeLane(booking.lane)
    }));
    const icsContent = generateCalendarFeed(normalized);
    const bucketReady = await ensureCalendarBucket();
    if (!bucketReady) {
      if (!calendarStorageDisabled) {
        console.warn('Kalenderbøtte ikke klar, hopper over oppdatering.');
      }
      return;
    }
    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const { error: uploadError } = await supabaseClient.storage
      .from(CALENDAR_BUCKET)
      .upload(CALENDAR_FILENAME, blob, {
        upsert: true,
        contentType: 'text/calendar'
      });
    if (uploadError) {
      console.error('Feil ved opplasting av kalenderfil:', uploadError);
      return;
    }
    const { data: signedData, error: signedError } = await supabaseClient.storage
      .from(CALENDAR_BUCKET)
      .createSignedUrl(CALENDAR_FILENAME, 60 * 60 * 24 * 30);
    if (signedError) {
      console.error('Kunne ikke lage delt lenke til kalenderfilen:', signedError);
      return;
    }
    calendarSignedUrl = signedData?.signedUrl || null;
    if (calendarSignedUrl) {
      if (typeof window !== 'undefined') {
        window.bookingCalendarLink = calendarSignedUrl;
      }
      console.info('Kalender oppdatert. Del denne lenken med Google Kalender:', calendarSignedUrl);
    }
  } catch (err) {
    console.error('Uventet feil ved oppdatering av kalenderen:', err);
  }
}

/**
 * Load all bookings for the given month (inclusive).
 * If Supabase is not configured, no bookings will be loaded.
 */
async function fetchMonthBookings(year, month) {
  if (!supabaseClient) {
    return [];
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
    return [];
  }
  return (data || []).map((booking) => ({
    ...booking,
    lane: normalizeLane(booking.lane)
  }));
}

async function loadMonthBookings(year, month) {
  const seasonIndex = findSeasonMonthIndex(year, month);
  if (seasonIndex !== -1) {
    selectSeasonMonth(seasonIndex);
  }
  monthBookings = await fetchMonthBookings(year, month);
}

/**
 * Compute booking status for a given date.
 * Counts occupancy per time slot (capped at two units) so a day only
 * registers as full when every available slot is taken. Returns "full" if
 * no half-lane units remain, "half" if over 50% booked, otherwise
 * "available".
 */
function calculateDateOccupancyDetails(dateStr, bookings, includeSelections) {
  const totalUnits = availableTimes.length * 2;
  let occupiedUnits = 0;

  availableTimes.forEach((time) => {
    let timeUnits = 0;
    preBookedTimes.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        timeUnits += laneUnits(b.lane);
      }
    });
    bookings.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        timeUnits += laneUnits(b.lane);
      }
    });
    if (includeSelections) {
      selectedSlots.forEach((b) => {
        if (b.date === dateStr && b.time === time) {
          timeUnits += laneUnits(b.lane);
        }
      });
    }
    occupiedUnits += Math.min(timeUnits, 2);
  });

  const percent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  return { occupiedUnits, totalUnits, percent };
}

function computeDateStatusFromBookings(dateStr, bookings, includeSelections) {
  const { occupiedUnits, totalUnits } = calculateDateOccupancyDetails(
    dateStr,
    bookings,
    includeSelections
  );

  if (occupiedUnits >= totalUnits) return 'full';
  if (occupiedUnits >= totalUnits / 2) return 'half';
  return 'available';
}

function computeDateStatus(dateStr) {
  return computeDateStatusFromBookings(dateStr, monthBookings, true);
}

function determineOccupancyTier(percent) {
  const numeric = Number(percent);
  const value = Number.isFinite(numeric) ? numeric : 0;
  if (value >= 100) return 'occupancy-tier-full';
  if (value >= 75) return 'occupancy-tier-very-high';
  if (value >= 50) return 'occupancy-tier-high';
  if (value >= 25) return 'occupancy-tier-medium';
  if (value > 0) return 'occupancy-tier-low';
  return 'occupancy-tier-empty';
}

function calculateTimeAvailability(dateStr, time, bookings, includeSelections) {
  let occupied = 0;
  preBookedTimes.forEach((b) => {
    if (b.date === dateStr && b.time === time) {
      occupied += laneUnits(b.lane);
    }
  });
  bookings.forEach((b) => {
    if (b.date === dateStr && b.time === time) {
      occupied += laneUnits(b.lane);
    }
  });
  if (includeSelections) {
    selectedSlots.forEach((b) => {
      if (b.date === dateStr && b.time === time) {
        occupied += laneUnits(b.lane);
      }
    });
  }
  return Math.max(0, 2 - occupied);
}

function updateMonthNavButtons() {
  if (prevMonthBtn) {
    const atStart = seasonMonthIndex <= 0;
    prevMonthBtn.disabled = atStart;
    prevMonthBtn.setAttribute('aria-disabled', atStart ? 'true' : 'false');
  }
  if (nextMonthBtn) {
    const atEnd = seasonMonthIndex >= seasonMonths.length - 1;
    nextMonthBtn.disabled = atEnd;
    nextMonthBtn.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
  }
}

/**
 * Render the month calendar grid.
 * Each day cell is colour-coded based on occupancy and clickable to load times.
 */
function renderMonthCalendar() {
  monthCalendar.innerHTML = '';
  updateMonthNavButtons();
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
    const occupancyDetails = calculateDateOccupancyDetails(dateStr, monthBookings, true);
    const occupancyTierClass = determineOccupancyTier(occupancyDetails.percent);
    const statusLabel =
      status === 'full' ? 'fullbooket' : status === 'half' ? 'begrenset kapasitet' : 'ledig kapasitet';
    let ariaLabel = `${day}. ${monthNames[currentMonth]}`;
    if (dateStr === todayStr) {
      cell.classList.add('today');
      ariaLabel = `I dag, ${ariaLabel}`;
    }
    cell.setAttribute(
      'aria-label',
      `${ariaLabel} – ${statusLabel} – ${occupancyDetails.percent}% booket`
    );
    if (status === 'full') {
      cell.classList.add('full-day');
    } else if (status === 'half') {
      cell.classList.add('half-day');
    } else {
      cell.classList.add('available-day');
    }
    cell.classList.add(occupancyTierClass);
    if (activeDate === dateStr) {
      cell.classList.add('active-day');
    }
    if (selectedSlots.some((s) => s.date === dateStr)) {
      cell.classList.add('selected-day');
    }
    const dayNumber = document.createElement('span');
    dayNumber.classList.add('day-number');
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    const occupancyIndicator = document.createElement('span');
    occupancyIndicator.classList.add('day-occupancy');
    occupancyIndicator.textContent = `${occupancyDetails.percent}%`;
    cell.appendChild(occupancyIndicator);

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

function createBookingMetaElement(entries) {
  if (!entries || entries.length === 0) {
    return null;
  }
  const container = document.createElement('div');
  container.classList.add('booking-meta');
  entries.forEach((entry) => {
    if (!entry) {
      return;
    }
    const value = String(entry.value ?? '').trim();
    if (!value) {
      return;
    }
    const pill = document.createElement('span');
    pill.classList.add('booking-pill');
    if (Array.isArray(entry.classes)) {
      entry.classes.forEach((cls) => pill.classList.add(cls));
    }
    if (entry.data && typeof entry.data === 'object') {
      Object.entries(entry.data).forEach(([key, dataValue]) => {
        if (dataValue != null) {
          pill.dataset[key] = dataValue;
        }
      });
    }
    const label = entry.label ? `${entry.label}: ` : '';
    pill.textContent = `${label}${value}`;
    container.appendChild(pill);
  });
  if (!container.childNodes.length) {
    return null;
  }
  return container;
}

function loadTimesForDate(dateStr) {
  activeDate = dateStr;
  renderMonthCalendar();
  timesList.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = `Tilgjengelige tider – ${formatDateLabel(dateStr)}`;
  timesList.appendChild(heading);

  const bookingsForDate = monthBookings
    .filter((booking) => booking.date === dateStr)
    .map((booking) => ({
      ...booking,
      lane: normalizeLane(booking.lane),
      name: String(booking.name ?? '').trim(),
      email: String(booking.email ?? '').trim(),
      phone: String(booking.phone ?? '').trim(),
      club: String(booking.club ?? '').trim(),
      gender: String(booking.gender ?? '').trim(),
      age: String(booking.age ?? '').trim()
    }));

  const bookingsByTime = bookingsForDate.reduce((acc, booking) => {
    if (!acc[booking.time]) {
      acc[booking.time] = [];
    }
    acc[booking.time].push(booking);
    return acc;
  }, {});

  const allowInlineToggle = isAuthenticated && !isAdminViewActive();
  if (allowInlineToggle) {
    const controls = document.createElement('div');
    controls.classList.add('times-filters');

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'inlineBookingsToggle';
    toggleBtn.classList.add('times-filter-toggle');
    toggleBtn.setAttribute('aria-pressed', showInlineBookings ? 'true' : 'false');
    toggleBtn.textContent = showInlineBookings ? 'Skjul bookede tider' : 'Vis bookede tider';
    toggleBtn.addEventListener('click', () => {
      const shouldRestoreFocus = document.activeElement === toggleBtn;
      showInlineBookings = !showInlineBookings;
      loadTimesForDate(dateStr);
      if (shouldRestoreFocus) {
        requestAnimationFrame(() => {
          document.getElementById('inlineBookingsToggle')?.focus();
        });
      }
    });

    controls.appendChild(toggleBtn);

    if (showInlineBookings) {
      const hint = document.createElement('span');
      hint.classList.add('times-filter-hint');
      hint.textContent = 'Bookede tider er markert i rødt.';
      controls.appendChild(hint);
    }

    timesList.appendChild(controls);
  }

  const showBookings = shouldShowInlineBookings();
  const inlineMode = isInlineBookingMode();
  let hasAvailable = false;
  availableTimes.forEach((time) => {
    const avail = calculateTimeAvailability(dateStr, time, monthBookings, true);
    if (avail > 0) {
      hasAvailable = true;
    }
    if (!showBookings && avail <= 0) {
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
    if (showBookings && bookingsForTime.length > 0) {
      if (inlineMode) {
        row.classList.add('time-row-inline');
      }
      const bookedList = document.createElement('ul');
      bookedList.classList.add('time-bookings');
      if (inlineMode) {
        bookedList.classList.add('time-bookings-inline');
      }
      bookingsForTime.forEach((booking) => {
        const item = document.createElement('li');
        item.classList.add('time-booking-item');
        if (inlineMode) {
          item.classList.add('time-booking-item-inline');
        }
        const laneLabel = booking.lane === 'full' ? 'Full bane' : 'Halv bane';
        const nameText = booking.name || 'Ukjent navn';

        const header = document.createElement('div');
        header.classList.add('booking-main');
        if (inlineMode) {
          const timeBadge = document.createElement('span');
          timeBadge.classList.add('booking-time');
          timeBadge.textContent = formatTimeInterval(time);
          header.appendChild(timeBadge);
        }

        const laneSpan = document.createElement('span');
        laneSpan.classList.add('booking-lane', 'booking-pill');
        laneSpan.textContent = laneLabel;

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('booking-name');
        nameSpan.textContent = nameText;

        header.appendChild(laneSpan);
        header.appendChild(nameSpan);
        item.appendChild(header);

        const metaEntries = [];
        if (booking.club) {
          metaEntries.push({ label: 'Klubb', value: booking.club });
        }
        if (booking.gender) {
          metaEntries.push({ label: 'Kjønn', value: formatGenderLabel(booking.gender) });
        }
        if (booking.age) {
          metaEntries.push({ label: 'Årskull', value: booking.age });
        }
        if (booking.email) {
          metaEntries.push({
            label: 'E-post',
            value: booking.email,
            classes: ['booking-contact'],
            data: { type: 'E-post' }
          });
        }
        if (booking.phone) {
          metaEntries.push({
            label: 'Telefon',
            value: booking.phone,
            classes: ['booking-contact'],
            data: { type: 'Telefon' }
          });
        }
        const meta = createBookingMetaElement(metaEntries);
        if (meta) {
          item.appendChild(meta);
        }

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

function resetAdminTimesList() {
  if (!adminTimesList) return;
  adminTimesList.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = 'Velg en dato i kalenderen for å se bookinger.';
  adminTimesList.appendChild(p);
}

function isDateInMonth(dateStr, year, month) {
  if (!dateStr) return false;
  const [y, m] = dateStr.split('-').map((part) => Number(part));
  return y === year && m === month + 1;
}

function updateAdminMonthNavButtons() {
  if (adminPrevMonthBtn) {
    const atStart = adminSeasonMonthIndex <= 0;
    adminPrevMonthBtn.disabled = atStart;
    adminPrevMonthBtn.setAttribute('aria-disabled', atStart ? 'true' : 'false');
  }
  if (adminNextMonthBtn) {
    const atEnd = adminSeasonMonthIndex >= seasonMonths.length - 1;
    adminNextMonthBtn.disabled = atEnd;
    adminNextMonthBtn.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
  }
}

function renderAdminMonthCalendar() {
  if (!adminMonthCalendar || !adminMonthLabel) return;
  adminMonthCalendar.innerHTML = '';
  updateAdminMonthNavButtons();
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
    'Desember'
  ];
  const dayNames = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
  adminMonthLabel.textContent = `${monthNames[adminMonth]} ${adminYear}`;
  dayNames.forEach((name) => {
    const headerCell = document.createElement('div');
    headerCell.className = 'day-cell day-name';
    headerCell.textContent = name;
    adminMonthCalendar.appendChild(headerCell);
  });
  const firstDay = new Date(adminYear, adminMonth, 1);
  const daysInMonth = new Date(adminYear, adminMonth + 1, 0).getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < startWeekday; i++) {
    const blank = document.createElement('div');
    blank.className = 'day-cell empty';
    adminMonthCalendar.appendChild(blank);
  }
  const todayStr = todayDateString();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${adminYear}-${String(adminMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cell = document.createElement('div');
    cell.classList.add('day-cell');
    const status = computeDateStatusFromBookings(dateStr, adminBookings, false);
    const occupancyDetails = calculateDateOccupancyDetails(dateStr, adminBookings, false);
    const occupancyTierClass = determineOccupancyTier(occupancyDetails.percent);
    if (status === 'full') {
      cell.classList.add('full-day');
    } else if (status === 'half') {
      cell.classList.add('half-day');
    } else {
      cell.classList.add('available-day');
    }
    cell.classList.add(occupancyTierClass);
    if (dateStr === todayStr) {
      cell.classList.add('today');
    }
    if (adminActiveDate === dateStr) {
      cell.classList.add('active-day');
    }
    const dayNumber = document.createElement('span');
    dayNumber.classList.add('day-number');
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    const occupancyIndicator = document.createElement('span');
    occupancyIndicator.classList.add('day-occupancy');
    occupancyIndicator.textContent = `${occupancyDetails.percent}%`;
    cell.appendChild(occupancyIndicator);

    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    cell.addEventListener('click', () => {
      loadAdminTimesForDate(dateStr);
    });
    cell.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        loadAdminTimesForDate(dateStr);
      }
    });
    adminMonthCalendar.appendChild(cell);
  }
}

function loadAdminTimesForDate(dateStr) {
  if (!adminTimesList) return;
  adminActiveDate = dateStr;
  renderAdminMonthCalendar();
  adminTimesList.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = `Bookinger – ${formatDateLabel(dateStr)}`;
  adminTimesList.appendChild(heading);

  const bookingsForDate = adminBookings
    .filter((booking) => booking.date === dateStr)
    .map((booking) => ({
      ...booking,
      lane: normalizeLane(booking.lane),
      name: String(booking.name ?? '').trim(),
      email: String(booking.email ?? '').trim(),
      phone: String(booking.phone ?? '').trim(),
      club: String(booking.club ?? '').trim(),
      gender: String(booking.gender ?? '').trim(),
      age: String(booking.age ?? '').trim()
    }));

  const bookingsByTime = bookingsForDate.reduce((acc, booking) => {
    if (!acc[booking.time]) {
      acc[booking.time] = [];
    }
    acc[booking.time].push(booking);
    return acc;
  }, {});

  availableTimes.forEach((time) => {
    const row = document.createElement('div');
    row.classList.add('time-row', 'admin-view');
    const label = document.createElement('span');
    label.textContent = formatTimeInterval(time);
    row.appendChild(label);

    const remaining = calculateTimeAvailability(dateStr, time, adminBookings, false);
    const statusSpan = document.createElement('span');
    statusSpan.classList.add('time-status');
    if (remaining === 2) {
      statusSpan.classList.add('available');
      statusSpan.textContent = 'Ledig';
    } else if (remaining === 1) {
      statusSpan.classList.add('limited');
      statusSpan.textContent = 'Delvis ledig';
    } else {
      statusSpan.classList.add('full');
      statusSpan.textContent = 'Fullbooket';
    }
    row.appendChild(statusSpan);

    const list = document.createElement('ul');
    list.classList.add('time-bookings');

    const prebookedEntries = preBookedTimes
      .filter((booking) => booking.date === dateStr && booking.time === time)
      .map((booking) => ({
        lane: normalizeLane(booking.lane),
        name: booking.name || 'Internt reservert',
        email: booking.email || '',
        phone: booking.phone || '',
        note: booking.note || 'Forhåndsblokkert tid',
        type: 'prebooked'
      }));

    const bookingsForTime = (bookingsByTime[time] || []).map((booking) => ({
      ...booking,
      type: 'booking'
    }));

    const combined = [...prebookedEntries, ...bookingsForTime].sort((a, b) => {
      const laneDiff = laneUnits(b.lane) - laneUnits(a.lane);
      if (laneDiff !== 0) {
        return laneDiff;
      }
      return (a.name || '').localeCompare(b.name || '');
    });

    if (combined.length > 0) {
      combined.forEach((entry) => {
        const item = document.createElement('li');
        item.classList.add('time-booking-item');
        const laneLabel = entry.lane === 'full' ? 'Full bane' : 'Halv bane';
        const nameText = entry.name || 'Ukjent navn';
        const header = document.createElement('div');
        header.classList.add('booking-main');

        const laneSpan = document.createElement('span');
        laneSpan.classList.add('booking-lane', 'booking-pill');
        laneSpan.textContent = laneLabel;

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('booking-name');
        nameSpan.textContent = nameText;

        header.appendChild(laneSpan);
        header.appendChild(nameSpan);
        item.appendChild(header);

        const metaEntries = [];
        if (entry.club) {
          metaEntries.push({ label: 'Klubb', value: entry.club });
        }
        if (entry.gender) {
          metaEntries.push({ label: 'Kjønn', value: formatGenderLabel(entry.gender) });
        }
        if (entry.age) {
          metaEntries.push({ label: 'Årskull', value: entry.age });
        }
        if (entry.email) {
          metaEntries.push({
            label: 'E-post',
            value: entry.email,
            classes: ['booking-contact'],
            data: { type: 'E-post' }
          });
        }
        if (entry.phone) {
          metaEntries.push({
            label: 'Telefon',
            value: entry.phone,
            classes: ['booking-contact'],
            data: { type: 'Telefon' }
          });
        }
        const meta = createBookingMetaElement(metaEntries);
        if (meta) {
          item.appendChild(meta);
        }
        if (entry.type === 'prebooked' && entry.note) {
          const noteSpan = document.createElement('p');
          noteSpan.classList.add('booking-note');
          noteSpan.textContent = entry.note;
          item.appendChild(noteSpan);
        }
        list.appendChild(item);
      });
      row.appendChild(list);
    } else {
      const noBooking = document.createElement('p');
      noBooking.textContent = 'Ingen bookinger registrert.';
      noBooking.classList.add('booking-note');
      row.appendChild(noBooking);
    }

    adminTimesList.appendChild(row);
  });
}

async function loadAdminMonth(year, month) {
  adminYear = year;
  adminMonth = month;
  const seasonIndex = findSeasonMonthIndex(year, month);
  if (seasonIndex !== -1) {
    adminSeasonMonthIndex = seasonIndex;
  }
  if (adminYear === currentYear && adminMonth === currentMonth) {
    adminBookings = monthBookings.slice();
  } else {
    adminBookings = await fetchMonthBookings(adminYear, adminMonth);
  }
  if (!isDateInMonth(adminActiveDate, adminYear, adminMonth)) {
    adminActiveDate = null;
  }
  renderAdminMonthCalendar();
  if (adminActiveDate) {
    loadAdminTimesForDate(adminActiveDate);
  } else {
    resetAdminTimesList();
  }
}

function updateMyBookingsFeedback(message, type) {
  if (!myBookingsFeedback) return;
  myBookingsFeedback.textContent = message || '';
  myBookingsFeedback.classList.remove('is-error', 'is-success');
  if (type === 'error') {
    myBookingsFeedback.classList.add('is-error');
  } else if (type === 'success') {
    myBookingsFeedback.classList.add('is-success');
  }
}

function buildCancellationMailto(booking) {
  const baseEmail = 'post@finnsfairway.no';
  if (!booking) {
    return `mailto:${baseEmail}`;
  }

  const laneType = normalizeLane(booking.lane);
  const laneLabel = laneType === 'full' ? 'Full bane' : laneType === 'half' ? 'Halv bane' : String(booking.lane || '');
  const dateLabel = formatDateLabel(booking.date);
  const fullDateLabel = formatDateWithYear(booking.date);
  const timeLabel = formatTimeInterval(booking.time);

  const subjectParts = ['Kansellering'];
  if (dateLabel) {
    subjectParts.push(dateLabel);
  }
  if (timeLabel) {
    subjectParts.push(timeLabel);
  }

  const bodyLines = [
    'Hei Finns Fairway,',
    '',
    'Jeg ønsker å kansellere følgende booking:',
  ];

  if (fullDateLabel) {
    bodyLines.push(`Dato: ${fullDateLabel}`);
  }
  if (timeLabel) {
    bodyLines.push(`Tid: ${timeLabel}`);
  }
  if (laneLabel) {
    bodyLines.push(`Bane: ${laneLabel}`);
  }

  const nameValue = String(booking.name ?? '').trim();
  if (nameValue) {
    bodyLines.push(`Navn: ${nameValue}`);
  }
  const clubValue = String(booking.club ?? '').trim();
  if (clubValue) {
    bodyLines.push(`Klubb: ${clubValue}`);
  }
  const genderValue = String(booking.gender ?? '').trim();
  if (genderValue) {
    bodyLines.push(`Kjønn: ${formatGenderLabel(genderValue)}`);
  }
  const ageValue = String(booking.age ?? '').trim();
  if (ageValue) {
    bodyLines.push(`Årskull: ${ageValue}`);
  }
  const emailValue = String(booking.email ?? '').trim();
  if (emailValue) {
    bodyLines.push(`E-post: ${emailValue}`);
  }
  const phoneValue = String(booking.phone ?? '').trim();
  if (phoneValue) {
    bodyLines.push(`Telefon: ${phoneValue}`);
  }

  bodyLines.push('', 'Jeg er kjent med at kanselleringen ikke gir refusjon, men frigjør banen for andre lag.', '', 'Mvh');

  const subject = encodeURIComponent(subjectParts.filter(Boolean).join(' – '));
  const body = encodeURIComponent(bodyLines.join('\n'));
  return `mailto:${baseEmail}?subject=${subject}&body=${body}`;
}

function formatDateWithYear(dateStr) {
  if (!dateStr) {
    return '';
  }
  const [year, month, day] = String(dateStr)
    .split('-')
    .map((part) => Number(part));
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return '';
  }
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('nb-NO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function buildNotificationSlotEntry(slot) {
  if (!slot) {
    return null;
  }
  const dateStr = String(slot.date || '').trim();
  const timeValue = normaliseTimeValue(slot.time);
  if (!dateStr || !timeValue) {
    return null;
  }
  const normalisedLane = normalizeLane(slot.lane);
  const laneLabel =
    normalisedLane === 'full'
      ? 'Full bane'
      : normalisedLane === 'half'
      ? 'Halv bane'
      : String(slot.lane || '');
  return {
    date: dateStr,
    dateLabel: formatDateLabel(dateStr),
    dateWithYear: formatDateWithYear(dateStr),
    time: timeValue,
    timeLabel: formatTimeInterval(timeValue),
    lane: normalisedLane,
    laneLabel
  };
}

function buildNotificationContactPayload(contact) {
  if (!contact) {
    return {
      name: '',
      email: '',
      phone: '',
      phoneDigits: '',
      club: '',
      gender: '',
      genderLabel: '',
      age: ''
    };
  }
  const name = String(contact.name || '').trim();
  const email = String(contact.email || '').trim();
  const phone = String(contact.phone || '').trim();
  const phoneDigits = normalisePhone(contact.phone || contact.phoneDigits || '');
  const club = String(contact.club || '').trim();
  const gender = String(contact.gender || '').trim();
  const age = String(contact.age || '').trim();
  return {
    name,
    email,
    phone,
    phoneDigits,
    club,
    gender,
    genderLabel: formatGenderLabel(gender),
    age
  };
}

function buildBookingNotificationMessage(contact, slotEntries) {
  const lines = ['Hei Finns Fairway,', '', 'Det er registrert en ny booking i Sparebanken Norge Arena.', ''];
  if (contact?.name) {
    lines.push(`Navn: ${contact.name}`);
  }
  if (contact?.club) {
    lines.push(`Klubb: ${contact.club}`);
  }
  if (contact?.genderLabel) {
    lines.push(`Kjønn: ${contact.genderLabel}`);
  }
  if (contact?.age) {
    lines.push(`Årskull: ${contact.age}`);
  }
  if (contact?.email) {
    lines.push(`E-post: ${contact.email}`);
  }
  if (contact?.phone) {
    lines.push(`Telefon: ${contact.phone}`);
  }
  if (!slotEntries || slotEntries.length === 0) {
    lines.push('', 'Ingen tider ble registrert på bestillingen.');
  } else {
    lines.push('', slotEntries.length === 1 ? 'Booking:' : 'Bookinger:');
    slotEntries.forEach((entry) => {
      const dateLabel = entry.dateWithYear || entry.dateLabel || entry.date;
      const timeLabel = entry.timeLabel || entry.time;
      lines.push(`- ${dateLabel} kl ${timeLabel} – ${entry.laneLabel}`);
    });
  }
  lines.push('', 'Skann Vipps-QR-koden for å bekrefte reservasjonen.');
  return lines.join('\n');
}

async function notifyAdminsOfBooking(contactDetails, slots) {
  if (!supabaseClient || !Array.isArray(slots) || slots.length === 0) {
    return false;
  }

  const recipients = (ADMIN_NOTIFICATION_RECIPIENTS || [])
    .map((email) => String(email || '').trim())
    .filter((email, index, array) => email && array.indexOf(email) === index);

  if (recipients.length === 0) {
    return false;
  }

  const slotEntries = slots.map(buildNotificationSlotEntry).filter(Boolean);
  if (!slotEntries.length) {
    return false;
  }

  const contact = buildNotificationContactPayload(contactDetails);
  const body = buildBookingNotificationMessage(contact, slotEntries);
  const payload = {
    recipients,
    contact,
    slots: slotEntries,
    subject: 'Ny booking registrert',
    body,
    createdAt: new Date().toISOString()
  };

  let handled = false;
  const functionsClient = supabaseClient?.functions;
  if (functionsClient && typeof functionsClient.invoke === 'function') {
    try {
      const { error } = await functionsClient.invoke(ADMIN_NOTIFICATION_FUNCTION_NAME, { body: payload });
      if (error) {
        throw error;
      }
      handled = true;
    } catch (error) {
      console.warn('Klarte ikke å sende e-postvarsel via Edge Function:', error?.message || error);
    }
  }

  if (!handled) {
    try {
      const insertPayload = {
        recipients,
        subject: payload.subject,
        body: payload.body,
        contact,
        slots: slotEntries,
        created_at: payload.createdAt
      };
      const { error } = await supabaseClient
        .from(ADMIN_NOTIFICATION_TABLE)
        .insert(insertPayload, { returning: 'minimal' });
      if (error) {
        throw error;
      }
      handled = true;
    } catch (error) {
      console.warn('Kunne ikke lagre e-postvarsel for oppfølging:', error?.message || error);
    }
  }

  return handled;
}

function renderMyBookings() {
  if (!myBookingsListContainer) return;
  myBookingsListContainer.innerHTML = '';
  if (!myBookings.length) {
    const message = document.createElement('p');
    message.classList.add('my-booking-empty');
    if (myBookingsLoaded) {
      message.textContent = 'Ingen aktive bookinger ble funnet.';
    } else {
      message.textContent = 'Fyll ut telefonnummer eller e-post for å vise dine bookinger.';
    }
    myBookingsListContainer.appendChild(message);
    return;
  }
  const list = document.createElement('ul');
  list.classList.add('my-bookings-items');
  myBookings.forEach((booking) => {
    const normalizedLane = normalizeLane(booking.lane);
    const laneLabel = normalizedLane === 'full' ? 'Full bane' : 'Halv bane';
    const item = document.createElement('li');
    item.classList.add('my-booking-item');

    const header = document.createElement('div');
    header.classList.add('my-booking-header');

    const title = document.createElement('p');
    title.classList.add('my-booking-title');
    title.textContent = `${formatDateLabel(booking.date)} kl ${formatTimeInterval(booking.time)} – ${laneLabel}`;
    header.appendChild(title);

    const actionBtn = document.createElement('a');
    actionBtn.classList.add('my-booking-action');
    actionBtn.textContent = 'Send kansellering';
    actionBtn.href = buildCancellationMailto(booking);
    actionBtn.rel = 'noopener noreferrer';
    header.appendChild(actionBtn);

    item.appendChild(header);

    const metaEntries = [];
    const nameValue = String(booking.name ?? '').trim();
    if (nameValue) {
      metaEntries.push({ label: 'Navn', value: nameValue });
    }
    const clubValue = String(booking.club ?? '').trim();
    if (clubValue) {
      metaEntries.push({ label: 'Klubb', value: clubValue });
    }
    const genderValue = String(booking.gender ?? '').trim();
    if (genderValue) {
      metaEntries.push({ label: 'Kjønn', value: formatGenderLabel(genderValue) });
    }
    const ageValue = String(booking.age ?? '').trim();
    if (ageValue) {
      metaEntries.push({ label: 'Årskull', value: ageValue });
    }
    const emailValue = String(booking.email ?? '').trim();
    if (emailValue) {
      metaEntries.push({ label: 'E-post', value: emailValue, classes: ['booking-contact'], data: { type: 'E-post' } });
    }
    const phoneValue = String(booking.phone ?? '').trim();
    if (phoneValue) {
      metaEntries.push({ label: 'Telefon', value: phoneValue, classes: ['booking-contact'], data: { type: 'Telefon' } });
    }

    const meta = createBookingMetaElement(metaEntries);
    if (meta) {
      meta.classList.add('my-booking-meta');
      item.appendChild(meta);
    }

    const reminder = document.createElement('p');
    reminder.classList.add('my-booking-reminder');
    reminder.textContent = 'Send kanselleringen for å frigjøre banen for andre. Ingen refusjon ved kansellering.';
    item.appendChild(reminder);

    list.appendChild(item);
  });

  myBookingsListContainer.appendChild(list);
}

async function fetchMyBookings(email, phone) {
  const sanitizedEmail = String(email || '').trim();
  const sanitizedPhone = normalisePhone(phone);
  const hasEmail = Boolean(sanitizedEmail);
  const hasPhone = Boolean(sanitizedPhone);
  if (!hasEmail && !hasPhone) {
    return [];
  }

  const emailLower = sanitizedEmail.toLowerCase();
  const matchesFilter = (booking) => {
    if (!booking) {
      return false;
    }
    const matchesEmail = hasEmail
      ? String(booking.email || '').trim().toLowerCase() === emailLower
      : false;
    const matchesPhone = hasPhone ? phonesMatch(booking.phone, sanitizedPhone) : false;
    return (hasEmail && matchesEmail) || (hasPhone && matchesPhone);
  };

  if (!supabaseClient) {
    return gatherAllKnownBookings().filter(matchesFilter);
  }

  const baseDate = new Date();
  const startYear = baseDate.getFullYear();
  const startMonth = baseDate.getMonth();
  const monthPromises = [];
  const monthKeys = new Set();

  for (let offset = 0; offset <= MY_BOOKINGS_LOOKAHEAD_MONTHS; offset += 1) {
    const target = new Date(startYear, startMonth + offset, 1);
    const year = target.getFullYear();
    const month = target.getMonth();
    const key = `${year}-${month}`;
    if (monthKeys.has(key)) {
      continue;
    }
    monthKeys.add(key);

    if (year === currentYear && month === currentMonth) {
      monthPromises.push(Promise.resolve(monthBookings.slice()));
    } else if (adminBookings.length && year === adminYear && month === adminMonth) {
      monthPromises.push(Promise.resolve(adminBookings.slice()));
    } else {
      monthPromises.push(fetchMonthBookings(year, month));
    }
  }

  const monthResults = await Promise.all(monthPromises);
  const collected = [];
  const seen = new Set();

  monthResults.forEach((monthData) => {
    (monthData || []).forEach((booking) => {
      if (!matchesFilter(booking)) {
        return;
      }
      const key =
        booking.id != null
          ? `id:${booking.id}`
          : `${booking.date}|${booking.time}|${booking.name}|${booking.phone}|${booking.email}|${booking.lane}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      collected.push({
        ...booking,
        lane: normalizeLane(booking.lane)
      });
    });
  });

  return collected;
}

async function loadMyBookings(reuseCredentials = false, options = {}) {
  const { silent = false } = options;
  let email;
  let phone;
  if (reuseCredentials && myBookingsCredentials) {
    email = myBookingsCredentials.email;
    phone = myBookingsCredentials.phone;
    if (myBookingsEmailInput) {
      myBookingsEmailInput.value = email;
    }
    if (myBookingsPhoneInput) {
      myBookingsPhoneInput.value = phone;
    }
    myBookingsLoaded = true;
  } else {
    email = String(myBookingsEmailInput?.value || '').trim();
    phone = normalisePhone(myBookingsPhoneInput?.value || '');
    if (!email && !phone) {
      updateMyBookingsFeedback('Fyll ut telefonnummer eller e-post for å hente dine bookinger.', 'error');
      return false;
    }
    myBookingsCredentials = { email, phone };
    if (myBookingsPhoneInput) {
      myBookingsPhoneInput.value = phone;
    }
    myBookingsLoaded = true;
  }

  if (!silent) {
    updateMyBookingsFeedback('Henter aktive bookinger …', null);
  }

  try {
    const bookings = await fetchMyBookings(email, phone);
    myBookings = filterActiveBookings(bookings).map((booking) => ({
      ...booking,
      lane: normalizeLane(booking.lane)
    }));
    renderMyBookings();
    if (!silent) {
      if (!myBookings.length) {
        updateMyBookingsFeedback('Ingen aktive bookinger ble funnet for denne kombinasjonen.', null);
      } else {
        updateMyBookingsFeedback(
          `Fant ${myBookings.length} aktiv${myBookings.length === 1 ? '' : 'e'} booking${
            myBookings.length === 1 ? '' : 'er'
          }.`,
          'success'
        );
      }
    }
    return true;
  } catch (error) {
    console.error('Feil ved henting av bookinger:', error);
    updateMyBookingsFeedback('Kunne ikke hente bookingene. Kontroller opplysningene og prøv igjen.', 'error');
    return false;
  }
}

function isMyBookingsOpen() {
  return Boolean(myBookingsOverlay && !myBookingsOverlay.hidden);
}

async function refreshMyBookingsIfOpen() {
  if (!isMyBookingsOpen() || !myBookingsCredentials) {
    return;
  }
  await loadMyBookings(true, { silent: true });
}

function openLoginOverlay(triggerElement = null) {
  if (!loginOverlay) {
    return;
  }
  if (!loginOverlay.hidden) {
    if (triggerElement) {
      loginOverlayTrigger = triggerElement;
    }
    return;
  }
  loginOverlayTrigger = triggerElement || loginOverlayTrigger || document.activeElement;
  loginOverlay.hidden = false;
  updateBodyOverlayState();
  if (loginFocusTrapCleanup) {
    loginFocusTrapCleanup();
  }
  loginFocusTrapCleanup = activateFocusTrap(loginOverlay);
  requestAnimationFrame(() => {
    const focusTarget =
      (loginUsernameInput && !loginUsernameInput.value && loginUsernameInput) ||
      (loginPasswordInput && !loginPasswordInput.value && loginPasswordInput) ||
      getFocusableElements(loginOverlay)[0];
    focusTarget?.focus();
  });
}

function closeLoginOverlay(options = {}) {
  const { restoreFocus = true } = options;
  if (!loginOverlay || loginOverlay.hidden) {
    if (loginFocusTrapCleanup) {
      loginFocusTrapCleanup();
      loginFocusTrapCleanup = null;
    }
    return;
  }
  loginOverlay.hidden = true;
  if (loginFocusTrapCleanup) {
    loginFocusTrapCleanup();
    loginFocusTrapCleanup = null;
  }
  updateBodyOverlayState();
  const focusTarget = loginOverlayTrigger || loginToggleBtn;
  loginOverlayTrigger = null;
  if (restoreFocus && focusTarget && typeof focusTarget.focus === 'function') {
    focusTarget.focus();
  }
}

function openMyBookingsOverlay(triggerElement = null) {
  if (!myBookingsOverlay) {
    return;
  }
  if (!myBookingsOverlay.hidden) {
    if (triggerElement) {
      myBookingsOverlayTrigger = triggerElement;
    }
    return;
  }
  myBookingsOverlayTrigger = triggerElement || myBookingsOverlayTrigger || document.activeElement;
  myBookingsOverlay.hidden = false;
  myBookingsOverlay.scrollTop = 0;
  updateMyBookingsFeedback('', null);
  renderMyBookings();
  updateBodyOverlayState();
  if (myBookingsFocusTrapCleanup) {
    myBookingsFocusTrapCleanup();
  }
  myBookingsFocusTrapCleanup = activateFocusTrap(myBookingsOverlay);
  requestAnimationFrame(() => {
    const focusTarget =
      (myBookingsPhoneInput && !myBookingsPhoneInput.value && myBookingsPhoneInput) ||
      (myBookingsEmailInput && !myBookingsEmailInput.value && myBookingsEmailInput) ||
      getFocusableElements(myBookingsOverlay)[0];
    focusTarget?.focus();
  });
}

function closeMyBookingsOverlay(options = {}) {
  const { restoreFocus = true } = options;
  if (!myBookingsOverlay || myBookingsOverlay.hidden) {
    if (myBookingsFocusTrapCleanup) {
      myBookingsFocusTrapCleanup();
      myBookingsFocusTrapCleanup = null;
    }
    return;
  }
  myBookingsOverlay.hidden = true;
  myBookingsOverlay.scrollTop = 0;
  if (myBookingsFocusTrapCleanup) {
    myBookingsFocusTrapCleanup();
    myBookingsFocusTrapCleanup = null;
  }
  updateBodyOverlayState();
  const focusTarget = myBookingsOverlayTrigger || myBookingsToggleBtn;
  myBookingsOverlayTrigger = null;
  if (restoreFocus && focusTarget && typeof focusTarget.focus === 'function') {
    focusTarget.focus();
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
  const normalisedPhoneValue = normalisePhone(phone);
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
  const contactDetails = {
    name,
    phone,
    phoneDigits: normalisedPhoneValue,
    email,
    club,
    gender,
    age
  };
  // Save to Supabase
  if (supabaseClient) {
    const insertData = selectedSlots.map((slot) => ({
      date: slot.date,
      time: slot.time,
      lane: normalizeLane(slot.lane) || slot.lane,
      name: contactDetails.name,
      phone: contactDetails.phoneDigits,
      email: contactDetails.email,
      club: contactDetails.club,
      gender: contactDetails.gender,
      age: contactDetails.age
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
    await refreshCalendarFeed();
    if (isAdminViewActive()) {
      if (adminYear === currentYear && adminMonth === currentMonth) {
        adminBookings = monthBookings.slice();
      } else {
        adminBookings = await fetchMonthBookings(adminYear, adminMonth);
      }
      renderAdminMonthCalendar();
      if (adminActiveDate) {
        loadAdminTimesForDate(adminActiveDate);
      } else {
        resetAdminTimesList();
      }
    }
  } else {
    // If Supabase isn't configured, just add to monthBookings in memory
    selectedSlots.forEach((slot) => {
      monthBookings.push({
        date: slot.date,
        time: slot.time,
        lane: normalizeLane(slot.lane),
        name: contactDetails.name,
        phone: contactDetails.phoneDigits,
        email: contactDetails.email,
        club: contactDetails.club,
        gender: contactDetails.gender,
        age: contactDetails.age
      });
    });
    if (isAdminViewActive()) {
      if (adminYear === currentYear && adminMonth === currentMonth) {
        adminBookings = monthBookings.slice();
      }
      renderAdminMonthCalendar();
      if (adminActiveDate) {
        loadAdminTimesForDate(adminActiveDate);
      } else {
        resetAdminTimesList();
      }
    }
  }
  const confirmedSlots = selectedSlots.map((slot) => ({ ...slot }));
  try {
    await notifyAdminsOfBooking(contactDetails, confirmedSlots);
  } catch (notificationError) {
    console.warn('Kunne ikke sende varsel om ny booking:', notificationError?.message || notificationError);
  }
  await refreshMyBookingsIfOpen();
  // Clear selection and form
  selectedSlots = [];
  activeDate = null;
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
  updateBodyOverlayState();
  if (confirmationBackBtn) {
    confirmationBackBtn.focus();
  }
}

// Event listeners for month navigation and booking submission
prevMonthBtn.addEventListener('click', async () => {
  if (seasonMonthIndex <= 0) {
    return;
  }
  selectSeasonMonth(seasonMonthIndex - 1);
  await loadMonthBookings(currentYear, currentMonth);
  activeDate = null;
  renderMonthCalendar();
  timesList.innerHTML = '';
});
nextMonthBtn.addEventListener('click', async () => {
  if (seasonMonthIndex >= seasonMonths.length - 1) {
    return;
  }
  selectSeasonMonth(seasonMonthIndex + 1);
  await loadMonthBookings(currentYear, currentMonth);
  activeDate = null;
  renderMonthCalendar();
  timesList.innerHTML = '';
});

submitBookingBtn.addEventListener('click', submitBooking);

if (confirmationBackBtn) {
  confirmationBackBtn.addEventListener('click', () => {
    confirmationScreen.hidden = true;
    updateBodyOverlayState();
    confirmationSlotsList.innerHTML = '';
    confirmationTotal.textContent = '';
  });
}

// Hent og oppdater kalenderen periodisk (uten innlogging)
const POLL_INTERVAL_MS = 30000; // 30 sekunder
let pollTimer = null;

function startCalendarPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      recalculateSeason(new Date());
      await loadMonthBookings(currentYear, currentMonth);
      if (activeDate) {
        loadTimesForDate(activeDate);
      } else {
        renderMonthCalendar();
      }
      if (isAdminViewActive()) {
        if (adminYear === currentYear && adminMonth === currentMonth) {
          adminBookings = monthBookings.slice();
        } else {
          adminBookings = await fetchMonthBookings(adminYear, adminMonth);
        }
        renderAdminMonthCalendar();
        if (adminActiveDate) {
          loadAdminTimesForDate(adminActiveDate);
        } else {
          resetAdminTimesList();
        }
      }
    } catch (e) {
      console.debug('Polling-feil (ignoreres):', e?.message || e);
    }
    await refreshMyBookingsIfOpen();
  }, POLL_INTERVAL_MS);
}

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    recalculateSeason(new Date());
    await loadMonthBookings(currentYear, currentMonth);
    if (activeDate) {
      loadTimesForDate(activeDate);
    } else {
      renderMonthCalendar();
    }
    if (isAdminViewActive()) {
      if (adminYear === currentYear && adminMonth === currentMonth) {
        adminBookings = monthBookings.slice();
      } else {
        adminBookings = await fetchMonthBookings(adminYear, adminMonth);
      }
      renderAdminMonthCalendar();
      if (adminActiveDate) {
        loadAdminTimesForDate(adminActiveDate);
      } else {
        resetAdminTimesList();
      }
    }
    await refreshMyBookingsIfOpen();
  }
});

function todayDateString() {
  return formatDateToISO(new Date());
}

async function initBooking() {
  if (bookingInitialised) {
    return;
  }
  bookingInitialised = true;
  try {
    const today = new Date();
    recalculateSeason(today);
    await loadMonthBookings(currentYear, currentMonth);
    await refreshCalendarFeed();
    const initialDate = isDateWithinSeasonRange(today)
      ? formatDateToISO(today)
      : formatDateFromParts(currentYear, currentMonth, 1);
    loadTimesForDate(initialDate);
    startCalendarPolling();
  } catch (error) {
    bookingInitialised = false;
    console.error('Kunne ikke initialisere kalenderen:', error);
    throw error;
  }
}

async function initAdminView() {
  const today = new Date();
  const todayIndex = findSeasonMonthIndex(today.getFullYear(), today.getMonth());
  if (todayIndex !== -1) {
    selectAdminSeasonMonth(todayIndex);
    adminActiveDate = formatDateToISO(today);
  } else {
    selectAdminSeasonMonth(seasonMonthIndex);
    adminActiveDate = formatDateFromParts(adminYear, adminMonth, 1);
  }
  await loadAdminMonth(adminYear, adminMonth);
  if (!adminActiveDate || !isDateInMonth(adminActiveDate, adminYear, adminMonth)) {
    adminActiveDate = formatDateFromParts(adminYear, adminMonth, 1);
  }
  if (adminActiveDate) {
    loadAdminTimesForDate(adminActiveDate);
  } else {
    resetAdminTimesList();
  }
  if (adminPanel) {
    adminPanel.scrollTop = 0;
  }
}

function closeAdminView(options = {}) {
  const { logout = false } = options;
  if (adminPanel) {
    adminPanel.hidden = true;
  }
  if (publicPage) {
    publicPage.hidden = false;
  }
  adminActiveDate = null;
  resetAdminTimesList();
  updateBodyOverlayState();

  if (logout) {
    isAuthenticated = false;
    showInlineBookings = false;
    closeLoginOverlay({ restoreFocus: false });
    if (loginErrorBox) {
      loginErrorBox.textContent = '';
    }
    if (loginForm) {
      loginForm.reset();
    }
    loginUsernameInput.value = '';
    loginPasswordInput.value = '';
  }

  if (activeDate) {
    loadTimesForDate(activeDate);
  } else {
    renderMonthCalendar();
  }

  loginToggleBtn?.focus();
}

async function processLogin() {
  if (!loginUsernameInput || !loginPasswordInput) {
    return;
  }
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value;

  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) {
    isAuthenticated = false;
    if (loginErrorBox) {
      loginErrorBox.textContent = 'Feil brukernavn eller passord.';
    }
    loginPasswordInput.value = '';
    loginPasswordInput.focus();
    return;
  }

  isAuthenticated = true;
  showInlineBookings = false;
  if (loginErrorBox) {
    loginErrorBox.textContent = '';
  }
  closeLoginOverlay({ restoreFocus: false });
  if (publicPage) {
    publicPage.hidden = true;
  }
  if (adminPanel) {
    adminPanel.hidden = false;
  }

  try {
    await initBooking();
    await initAdminView();
  } catch (error) {
    isAuthenticated = false;
    if (loginErrorBox) {
      loginErrorBox.textContent = 'Klarte ikke å laste kalenderen. Prøv igjen.';
    }
    openLoginOverlay(loginToggleBtn);
    if (publicPage) {
      publicPage.hidden = false;
    }
    if (adminPanel) {
      adminPanel.hidden = true;
    }
    console.error('Feil under innlasting av kalenderen:', error);
    loginPasswordInput.value = '';
    loginPasswordInput.focus();
    return;
  }

  loginForm?.reset();
}

if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    processLogin();
  });
}

if (myBookingsForm) {
  myBookingsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    await loadMyBookings(false);
  });
}

if (myBookingsToggleBtn) {
  myBookingsToggleBtn.addEventListener('click', (event) => {
    openMyBookingsOverlay(event.currentTarget);
  });
}

if (myBookingsCloseBtn) {
  myBookingsCloseBtn.addEventListener('click', () => {
    closeMyBookingsOverlay();
  });
}

if (loginToggleBtn) {
  loginToggleBtn.addEventListener('click', async (event) => {
    if (isAuthenticated) {
      if (publicPage) {
        publicPage.hidden = true;
      }
      if (adminPanel) {
        adminPanel.hidden = false;
        adminPanel.scrollTop = 0;
      }
      try {
        await initAdminView();
      } catch (error) {
        console.error('Kunne ikke åpne adminpanelet:', error);
      }
      return;
    }
    if (loginForm) {
      loginForm.reset();
    }
    if (loginErrorBox) {
      loginErrorBox.textContent = '';
    }
    openLoginOverlay(event.currentTarget);
  });
}

if (loginCancelBtn) {
  loginCancelBtn.addEventListener('click', () => {
    if (loginForm) {
      loginForm.reset();
    }
    if (loginErrorBox) {
      loginErrorBox.textContent = '';
    }
    closeLoginOverlay();
  });
}

if (adminCloseBtn) {
  adminCloseBtn.addEventListener('click', () => {
    closeAdminView();
  });
}

if (adminLogoutBtn) {
  adminLogoutBtn.addEventListener('click', () => {
    closeAdminView({ logout: true });
  });
}

if (adminPrevMonthBtn) {
  adminPrevMonthBtn.addEventListener('click', async () => {
    if (adminSeasonMonthIndex <= 0) {
      return;
    }
    selectAdminSeasonMonth(adminSeasonMonthIndex - 1);
    await loadAdminMonth(adminYear, adminMonth);
  });
}

if (adminNextMonthBtn) {
  adminNextMonthBtn.addEventListener('click', async () => {
    if (adminSeasonMonthIndex >= seasonMonths.length - 1) {
      return;
    }
    selectAdminSeasonMonth(adminSeasonMonthIndex + 1);
    await loadAdminMonth(adminYear, adminMonth);
  });
}

if (adminTimesList) {
  resetAdminTimesList();
}

initBooking().catch((error) => {
  console.error('Feil ved oppstart av booking-siden:', error);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (loginOverlay && !loginOverlay.hidden) {
      loginCancelBtn?.click();
    } else if (isMyBookingsOpen()) {
      closeMyBookingsOverlay();
    } else if (isAdminViewActive()) {
      closeAdminView();
    }
  }
});

// Set current year in footer
const yearSpan = document.getElementById('year');
if (yearSpan) {
  yearSpan.textContent = new Date().getFullYear();
}
