import express from "express";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

const SECRET = "tech_tournament_secret"; // 🔐 Secret for JWT

// In-memory data
let users = [];
let events = [];
let bookings = [];

// 🔹 Helper: Auth middleware
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

// 🧍‍♂️ Register
app.post("/auth/register", (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: "Missing fields" });

  if (!["organizer", "user"].includes(role))
    return res.status(400).json({ error: "Role must be 'organizer' or 'user'" });

  if (users.some(u => u.username === username))
    return res.status(400).json({ error: "User already exists" });

  const id = users.length + 1;
  users.push({ id, username, password, role });
  res.json({ message: "Registered successfully" });
});

// 🔐 Login
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, SECRET);
  res.json({ token });
});

// 🎤 Create Event (Organizer only)
app.post("/events", auth, (req, res) => {
  if (req.user.role !== "organizer")
    return res.status(403).json({ error: "Only organizers can create events" });

  const { title, date, capacity } = req.body;
  if (!title || !date || !capacity)
    return res.status(400).json({ error: "Missing fields" });

  const id = events.length + 1;
  events.push({ id, title, date, capacity, organizerId: req.user.id });
  res.json({ message: "Event created successfully" });
});

// 📋 List Events
app.get("/events", (req, res) => res.json(events));

// 🎟️ Book Event (Users only)
app.post("/events/:id/book", auth, (req, res) => {
  if (req.user.role !== "user")
    return res.status(403).json({ error: "Only users can book events" });

  const eventId = parseInt(req.params.id);
  const event = events.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  if (event.organizerId === req.user.id)
    return res.status(400).json({ error: "Organizers cannot book their own event" });

  if (bookings.some(b => b.userId === req.user.id && b.eventId === eventId))
    return res.status(400).json({ error: "User already booked this event" });

  const count = bookings.filter(b => b.eventId === eventId).length;
  if (count >= event.capacity)
    return res.status(400).json({ error: "Event is full" });

  const bookingId = bookings.length + 1;
  const code = "TICKET-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  bookings.push({ bookingId, userId: req.user.id, eventId, code, validated: false });
  res.json({ message: "Booking successful", ticketCode: code });
});

// 🧾 View User’s Bookings
app.get("/mybookings", auth, (req, res) => {
  const userBookings = bookings.filter(b => b.userId === req.user.id);
  const details = userBookings.map(b => ({
    ...b,
    event: events.find(e => e.id === b.eventId)?.title,
  }));
  res.json(details);
});

// ✅ Validate Ticket (Organizers only)
app.post("/tickets/validate", auth, (req, res) => {
  if (req.user.role !== "organizer")
    return res.status(403).json({ error: "Only organizers can validate tickets" });

  const { code } = req.body;
  const booking = bookings.find(b => b.code === code);

  if (!booking) return res.status(400).json({ error: "Invalid ticket code" });
  if (booking.validated) return res.status(400).json({ error: "Ticket already validated" });

  booking.validated = true;
  res.json({ message: "Ticket validated successfully" });
});

// 👥 View Attendees (Organizer’s events only)
app.get("/events/:id/attendees", auth, (req, res) => {
  const eventId = parseInt(req.params.id);
  const event = events.find(e => e.id === eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });
  if (event.organizerId !== req.user.id)
    return res.status(403).json({ error: "Only the organizer can view attendees" });

  const attendeeList = bookings
    .filter(b => b.eventId === eventId)
    .map(b => {
      const user = users.find(u => u.id === b.userId);
      return { username: user.username, validated: b.validated };
    });

  res.json(attendeeList);
});

// 🚀 Start server
app.listen(3000, () => console.log("✅ Server running on http://localhost:3000"));

module.exports = app;