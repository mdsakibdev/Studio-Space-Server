import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Express Application
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Environment Variables check
if (!process.env.MONGODB_URI || !process.env.CLIENT_URL) {
  throw new Error("Missing environment variables");
}

// Better Auth JWT Verification
const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL.replace(/\/+$/, "")}/api/auth/jwks`));

const varyfiApi = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ success: false, message: "Unauthorized!" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    if (!payload.email) {
      return res.status(401).send({ success: false, message: "User email not found" });
    }
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).send({ success: false, message: "Invalid or expired token" });
  }
};

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
console.log("Connected to MongoDB!");

const db = client.db("studoUser");
const studioCollection = db.collection("studios");
const bookingCollection = db.collection("bookings");

// Add Studio API (Protected)
app.post("/studios", varyfiApi, async (req, res) => {
  try {
    const data = req.body;
    const studioData = {
      ...data,
      host: { ...(data.host || {}), name: req.user.name || "", email: req.user.email },
      createdAt: new Date(),
    };
    const result = await studioCollection.insertOne(studioData);
    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to create studio" });
  }
});

// Create Booking API (Protected)
app.post("/bookings", varyfiApi, async (req, res) => {
  try {
    const studio = await studioCollection.findOne({ _id: new ObjectId(req.body.studioId) });
    
    if (!studio) return res.status(404).send({ success: false, message: "Studio not found" });

    const hours = Number(req.body.shootHours) || 1;

    const result = await bookingCollection.insertOne({
      ...req.body,
      studioTitle: studio.title,
      user: { name: req.user.name || "", email: req.user.email },
      shootHours: hours,
      totalCost: (hours * (studio.hourlyRate || 0)) + (studio.securityDeposit || 0),
      status: "Pending",
      createdAt: new Date(),
    });

    res.status(201).send({ success: true, insertedId: result.insertedId });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to create booking" });
  }
});


// Get My Bookings API (Protected)
app.get("/bookings", varyfiApi, async (req, res) => {
  try {
    const result = await bookingCollection.find({ "user.email": req.user.email }).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to load bookings" });
  }
});

// Get All Studios API (Public)
app.get("/studios", async (req, res) => {
  try {
    const result = await studioCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to load studios" });
  }
});

// Get Featured Studios API (Public)
app.get("/studios/featured", async (req, res) => {
  try {
    const result = await studioCollection.find({ status: "active" }).sort({ rating: -1 }).limit(6).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to load featured studios" });
  }
});

// Get Single Studio Details API (Public)
app.get("/studios/:id", async (req, res) => {
  try {
    const result = await studioCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!result) return res.status(404).send({ success: false, message: "Studio not found" });
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Something went wrong" });
  }
});

// Cancel Booking API (Protected)
app.patch("/bookings/:id/cancel", varyfiApi, async (req, res) => {
  try {
    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(req.params.id), "user.email": req.user.email },
      { $set: { status: "Cancelled", updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).send({ success: false, message: "Booking not found" });
    res.send({ success: true, message: "Booking cancelled" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to cancel booking" });
  }
});

// Get My Studio Listings API (Protected)
app.get("/my-studios", varyfiApi, async (req, res) => {
  try {
    const result = await studioCollection.find({ "host.email": req.user.email }).sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to load your studios" });
  }
});

// Update Studio API (Protected)
app.patch("/studios/:id", varyfiApi, async (req, res) => {
  try {
    const { email, host, _id, ...data } = req.body;
    const result = await studioCollection.updateOne(
      { _id: new ObjectId(req.params.id), "host.email": req.user.email },
      { $set: { ...data, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).send({ success: false, message: "Studio not found" });
    res.send({ success: true, message: "Studio updated successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to update studio" });
  }
});

// Delete Studio API (Protected)
app.delete("/studios/:id", varyfiApi, async (req, res) => {
  try {
    const result = await studioCollection.deleteOne({ _id: new ObjectId(req.params.id), "host.email": req.user.email });
    if (result.deletedCount === 0) return res.status(404).send({ success: false, message: "Studio not found" });
    res.send({ success: true, message: "Studio deleted successfully" });
  } catch (error) {
    res.status(500).send({ success: false, message: "Failed to delete studio" });
  }
});

// Test API
app.get("/", (req, res) => {
  res.json({ success: true, message: "StudioSpace Backend is running!" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;