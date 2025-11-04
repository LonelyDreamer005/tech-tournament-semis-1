// index.js
const express = require("express");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const SECRET = "tech_tournament_secret";

// In-memory storage
let users = []; // { id, name, email, password, role }
let events = []; // { id, name, date, totalTickets, organizerId, bookings: [] }
let bookings = []; // { id, userId, eventId, ticketCode, validated: false }

let nextUserId = 1;
let nextEventId = 1;
let nextBookingId = 1;

/* -------------------------
   Middleware
-------------------------- */
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(403).json({ error: "Invalid token" });
  }
}

/* -------------------------
   Routes
-------------------------- */

// 1️⃣ Register
app.post("/auth/register", (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role)
    return res.status(400).json({ error: "All fields required" });

  if (users.some(u => u.email === email))
    return res.status(400).json({ error: "User already exists" });

  const user = { id: nextUserId++, name, email, password, role };
  users.push(user);
  res.json({ message: "User registered successfully", userId: user.id });
});

// 2️⃣ Login
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { id: user.id, name: user.name, role: user.role },
    SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token });
});

// 3️⃣ Create Event (organizer only)
app.post("/events", auth, (req, res) => {
  if (req.user.role !== "organizer")
    return res.status(403).json({ error: "Only organizers can create events" });

  const { name, date, totalTickets } = req.body;
  if (!name || !date || !totalTickets)
    return res.status(400).json({ error: "All fields required" });

  const event = {
    id: nextEventId++,
    name,
    date,
    totalTickets,
    organizerId: req.user.id,
    bookings: [],
  };
  events.push(event);
  res.json({ message: "Event created successfully", eventId: event.id });
});

// 4️⃣ List Events with remaining tickets
app.get("/events", (req, res) => {
  const list = events.map(e => ({
    id: e.id,
    name: e.name,
    date: e.date,
    ticketsAvailable: e.totalTickets - e.bookings.length,
  }));
  res.json(list);
});

// 5️⃣ Book Event (any logged-in user)
app.post("/events/:id/book", auth, (req, res) => {
  const eventId = parseInt(req.params.id);
  const event = events.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  if (event.bookings.length >= event.totalTickets)
    return res.status(400).json({ error: "Event sold out" });

  const ticketCode = "TCK-" + Math.floor(100000 + Math.random() * 900000);
  const booking = {
    id: nextBookingId++,
    userId: req.user.id,
    eventId,
    ticketCode,
    validated: false,
  };
  bookings.push(booking);
  event.bookings.push(booking.id);

  res.json({ message: "Ticket booked successfully", ticketCode });
});

// 6️⃣ My Bookings
app.get("/my-bookings", auth, (req, res) => {
  const userBookings = bookings
    .filter(b => b.userId === req.user.id)
    .map(b => {
      const ev = events.find(e => e.id === b.eventId);
      return {
        event: ev?.name || "Unknown",
        ticketCode: b.ticketCode,
        validated: b.validated,
      };
    });
  res.json(userBookings);
});

// 7️⃣ Validate Ticket (organizer only, own event)
app.post("/tickets/validate", auth, (req, res) => {
  if (req.user.role !== "organizer")
    return res.status(403).json({ error: "Only organizers can validate tickets" });

  const { ticketCode } = req.body;
  const booking = bookings.find(b => b.ticketCode === ticketCode);
  if (!booking || booking.validated)
    return res.status(400).json({ error: "Invalid or already validated ticket" });

  const event = events.find(e => e.id === booking.eventId);
  if (event.organizerId !== req.user.id)
    return res.status(403).json({ error: "You can validate only your event tickets" });

  booking.validated = true;
  res.json({ message: "Ticket validated successfully", event: event.name, userId: booking.userId });
});

// 8️⃣ Event Attendees (organizer only)
app.get("/events/:id/attendees", auth, (req, res) => {
  const eventId = parseInt(req.params.id);
  const event = events.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.organizerId !== req.user.id)
    return res.status(403).json({ error: "Only organizer can view attendees" });

  const attendees = bookings
    .filter(b => b.eventId === eventId && b.validated)
    .map(b => ({ userId: b.userId, ticketCode: b.ticketCode }));

  res.json({ event: event.name, attendees });
});

/* -------------------------
   Run or Export
-------------------------- */
if (require.main === module) {
  const PORT = 3000;
  app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
}

module.exports = app;
