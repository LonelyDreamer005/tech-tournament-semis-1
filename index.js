// index.js
const express = require("express");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());

/**
 * In-memory storage
 */
let users = [];      // { id, name, email, password, role }
let events = [];     // { id, name, date, totalTickets, organizerId, bookings: [] }
let bookings = [];   // { id, userId, eventId, ticketCode, validated: false }

let nextUserId = 1;
let nextEventId = 1;
let nextBookingId = 1;

const JWT_SECRET = "very_secret_for_test_only"; // for test purpose only

/* -------------------------
   Helpers
   ------------------------- */
function generateTicketCode() {
  return "TCK-" + Math.floor(100000 + Math.random() * 900000);
}

function findUserByEmail(email) {
  return users.find((u) => u.email === email);
}

/* -------------------------
   Auth middleware
   ------------------------- */
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });
  const token = auth.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, role, name, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* -------------------------
   Routes
   ------------------------- */

/**
 * 1. POST /auth/register
 * Request: { name, email, password, role }
 */
app.post("/auth/register", (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: "name, email, password, role required" });
  if (findUserByEmail(email)) return res.status(400).json({ error: "Email already registered" });

  const user = { id: nextUserId++, name, email, password, role };
  users.push(user);
  res.json({ message: "User registered successfully", userId: user.id });
});

/**
 * 2. POST /auth/login
 * Request: { email, password }
 * Response: { token }
 */
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email & password required" });

  const user = findUserByEmail(email);
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: "8h" });
  res.json({ token });
});

/**
 * 3. POST /events
 * Create event (organizer only)
 * Request body: { name, date, totalTickets }
 */
app.post("/events", authenticate, (req, res) => {
  const { name, date, totalTickets } = req.body;
  if (req.user.role !== "organizer") return res.status(403).json({ error: "Only organizers can create events" });
  if (!name || !date || typeof totalTickets !== "number") return res.status(400).json({ error: "name, date, totalTickets required (totalTickets number)" });

  const event = {
    id: nextEventId++,
    name,
    date,
    totalTickets,
    organizerId: req.user.id,
    bookings: [] // stores booking ids
  };
  events.push(event);
  res.json({ message: "Event created successfully", eventId: event.id });
});

/**
 * 4. GET /events
 * List events with remaining tickets
 */
app.get("/events", (req, res) => {
  const result = events.map((e) => {
    const bookedCount = e.bookings.length;
    return {
      id: e.id,
      name: e.name,
      date: e.date,
      ticketsAvailable: Math.max(0, e.totalTickets - bookedCount)
    };
  });
  res.json(result);
});

/**
 * 5. POST /events/:id/book
 * Book a ticket (authenticated users)
 */
app.post("/events/:id/book", authenticate, (req, res) => {
  const eventId = parseInt(req.params.id);
  const event = events.find((ev) => ev.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  const bookedCount = event.bookings.length;
  if (bookedCount >= event.totalTickets) return res.status(400).json({ error: "Sold out" });

  // Create booking
  const ticketCode = generateTicketCode();
  const booking = {
    id: nextBookingId++,
    userId: req.user.id,
    eventId: event.id,
    ticketCode,
    validated: false
  };
  bookings.push(booking);
  event.bookings.push(booking.id);

  res.json({ message: "Ticket booked successfully", ticketCode });
});

/**
 * 6. GET /my-bookings
 * All tickets booked by logged-in user
 */
app.get("/my-bookings", authenticate, (req, res) => {
  const my = bookings
    .filter((b) => b.userId === req.user.id)
    .map((b) => {
      const ev = events.find((e) => e.id === b.eventId) || {};
      return {
        event: ev.name || "Unknown",
        ticketCode: b.ticketCode,
        validated: b.validated,
        bookingId: b.id,
        eventId: b.eventId
      };
    });
  res.json(my);
});

/**
 * 7. POST /tickets/validate
 * Body: { ticketCode }
 * Only organizer of the event can validate tickets for their event
 */
app.post("/tickets/validate", authenticate, (req, res) => {
  const { ticketCode } = req.body;
  if (!ticketCode) return res.status(400).json({ error: "ticketCode required" });

  const booking = bookings.find((b) => b.ticketCode === ticketCode);
  if (!booking) return res.status(400).json({ error: "Invalid or already validated ticket" });

  if (booking.validated) return res.status(400).json({ error: "Invalid or already validated ticket" });

  const event = events.find((e) => e.id === booking.eventId);
  if (!event) return res.status(400).json({ error: "Event for ticket not found" });

  // Only organizer of the event can validate
  if (event.organizerId !== req.user.id) return res.status(403).json({ error: "Organizer can only validate tickets for their own events" });

  booking.validated = true;
  res.json({ message: "Ticket validated successfully", event: event.name, userId: booking.userId });
});

/**
 * 8. GET /events/:id/attendees
 * Lists validated tickets for your event (organizer only)
 */
app.get("/events/:id/attendees", authenticate, (req, res) => {
  const eventId = parseInt(req.params.id);
  const event = events.find((e) => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  if (event.organizerId !== req.user.id) return res.status(403).json({ error: "Only organizer of this event can view attendees" });

  const attendees = bookings
    .filter((b) => b.eventId === eventId && b.validated)
    .map((b) => ({ userId: b.userId, ticketCode: b.ticketCode }));

  res.json({ event: event.name, attendees });
});

/* -------------------------
   Export app (and optional run)
   ------------------------- */
module.exports = app;

/* If run directly, start server on 3000 */
if (require.main === module) {
  const PORT = 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
