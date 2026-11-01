
import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

// ==========================================
// Express Application
// ==========================================

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ==========================================
// Environment Variables
// ==========================================

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing from environment variables");
}

if (!process.env.CLIENT_URL) {
  throw new Error("CLIENT_URL is missing from environment variables");
}

// ==========================================
// Better Auth JWT Verification
// ==========================================

const JWKS = createRemoteJWKSet(
  new URL(
    `${process.env.CLIENT_URL.replace(/\/+$/, "")}/api/auth/jwks`
  )
);

const varyfiApi = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized!",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({
      success: false,
      message: "Unauthorized!",
    });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);

    if (!payload.email) {
      return res.status(401).send({
        success: false,
        message: "User email not found in authentication token",
      });
    }

    // Store verified user information
    req.user = payload;

    next();
  } catch (error) {
    console.error("JWT Verification Error:", error);

    return res.status(401).send({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

// ==========================================
// MongoDB Connection
// ==========================================

const client = new MongoClient(process.env.MONGODB_URI);

await client.connect();

console.log("You successfully connected to MongoDB!");

const db = client.db("studoUser");

const studioCollection = db.collection("studios");
const bookingCollection = db.collection("bookings");

// ==========================================
// Helper: Validate MongoDB ObjectId
// ==========================================

const isValidObjectId = (id) => ObjectId.isValid(id);

// ==========================================
// Add Studio API (Protected)
// ==========================================

app.post("/studios", varyfiApi, async (req, res) => {
  try {
    const data = req.body;

    const studioData = {
      ...data,

      // Always use authenticated user identity
      host: {
        ...(data.host || {}),
        name: req.user.name || "",
        email: req.user.email,
      },

      createdAt: new Date(),
    };

    const result = await studioCollection.insertOne(studioData);

    res.status(201).send({
      success: true,
      message: "Studio created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Create Studio Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create studio",
    });
  }
});

// ==========================================
// Create Booking API (Protected)
// ==========================================

app.post("/bookings", varyfiApi, async (req, res) => {
  try {
    const data = req.body;

    if (!isValidObjectId(data.studioId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const studio = await studioCollection.findOne({
      _id: new ObjectId(data.studioId),
    });

    if (!studio) {
      return res.status(404).send({
        success: false,
        message: "Studio not found",
      });
    }

    const start = data.startTime?.split(":").map(Number);
    const end = data.endTime?.split(":").map(Number);

    if (
      !start ||
      !end ||
      start.length !== 2 ||
      end.length !== 2 ||
      start.some(Number.isNaN) ||
      end.some(Number.isNaN)
    ) {
      return res.status(400).send({
        success: false,
        message: "Invalid booking time",
      });
    }

    const startMinutes = start[0] * 60 + start[1];
    const endMinutes = end[0] * 60 + end[1];

    if (
      start[0] < 0 ||
      start[0] > 23 ||
      end[0] < 0 ||
      end[0] > 23 ||
      start[1] < 0 ||
      start[1] > 59 ||
      end[1] < 0 ||
      end[1] > 59 ||
      endMinutes <= startMinutes
    ) {
      return res.status(400).send({
        success: false,
        message: "End time must be after start time",
      });
    }

    const shootHours = (endMinutes - startMinutes) / 60;
    const crewCount = Number(data.crewCount);

    if (
      !Number.isInteger(crewCount) ||
      crewCount < 1 ||
      crewCount > Number(studio.maxCapacity)
    ) {
      return res.status(400).send({
        success: false,
        message: "Invalid crew count",
      });
    }

    if (shootHours < Number(studio.minBookingHours || 1)) {
      return res.status(400).send({
        success: false,
        message: `Minimum booking duration is ${studio.minBookingHours} hours`,
      });
    }

    const hourlyRate = Number(studio.hourlyRate) || 0;
    const securityDeposit = Number(studio.securityDeposit) || 0;

    const shootingCost = shootHours * hourlyRate;
    const totalCost = shootingCost + securityDeposit;

    const bookingData = {
      studioId: data.studioId,
      studioTitle: studio.title,

      // Always use authenticated user identity
      user: {
        name: req.user.name || "",
        email: req.user.email,
      },

      shootDate: data.shootDate,
      startTime: data.startTime,
      endTime: data.endTime,
      shootHours,
      crewCount,
      gearNotes: data.gearNotes || "",

      // Prices are taken from the studio record
      hourlyRate,
      shootingCost,
      securityDeposit,
      totalCost,

      status: "Pending",
      createdAt: new Date(),
    };

    const result = await bookingCollection.insertOne(bookingData);

    res.status(201).send({
      success: true,
      message: "Booking created successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Create Booking Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to create booking",
    });
  }
});

// ==========================================
// Get My Bookings API (Protected)
// ==========================================

app.get("/bookings", varyfiApi, async (req, res) => {
  try {
    const result = await bookingCollection
      .find({
        "user.email": req.user.email,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Get My Bookings Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to load bookings",
    });
  }
});

// ==========================================
// Get All Studios API (Public)
// ==========================================

app.get("/studios", async (req, res) => {
  try {
    const result = await studioCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error("Get Studios Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to load studios",
    });
  }
});

// ==========================================
// Get Featured Studios API (Public)
// ==========================================

app.get("/studios/featured", async (req, res) => {
  try {
    const result = await studioCollection
      .find({ status: "active" })
      .sort({ rating: -1 })
      .limit(6)
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Get Featured Studios Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to load featured studios",
    });
  }
});

// ==========================================
// Get Single Studio Details API (Public)
// ==========================================

app.get("/studios/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const result = await studioCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        success: false,
        message: "Studio not found",
      });
    }

    res.send(result);
  } catch (error) {
    console.error("Get Studio Details Error:", error);

    res.status(500).send({
      success: false,
      message: "Something went wrong",
    });
  }
});

// ==========================================
// Cancel Booking API (Protected)
// ==========================================

app.patch("/bookings/:id/cancel", varyfiApi, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid booking ID",
      });
    }

    const result = await bookingCollection.updateOne(
      {
        _id: new ObjectId(id),
        "user.email": req.user.email,
        status: { $in: ["Pending", "Confirmed"] },
      },
      {
        $set: {
          status: "Cancelled",
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Booking not found or cannot be cancelled",
      });
    }

    res.send({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel Booking Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to cancel booking",
    });
  }
});

// ==========================================
// Get My Studio Listings API (Protected)
// ==========================================

app.get("/my-studios", varyfiApi, async (req, res) => {
  try {
    const result = await studioCollection
      .find({
        "host.email": req.user.email,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("My Studios Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to load your studios",
    });
  }
});

// ==========================================
// Update Studio API (Protected)
// ==========================================

app.patch("/studios/:id", varyfiApi, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const { email, host, _id, ...data } = req.body;

    const result = await studioCollection.updateOne(
      {
        _id: new ObjectId(id),
        "host.email": req.user.email,
      },
      {
        $set: {
          ...data,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Studio not found or you do not have permission",
      });
    }

    res.send({
      success: true,
      message: "Studio updated successfully",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Update Studio Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to update studio",
    });
  }
});

// ==========================================
// Delete Studio API (Protected)
// ==========================================

app.delete("/studios/:id", varyfiApi, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid studio ID",
      });
    }

    const result = await studioCollection.deleteOne({
      _id: new ObjectId(id),
      "host.email": req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        success: false,
        message: "Studio not found or you do not have permission",
      });
    }

    res.send({
      success: true,
      message: "Studio deleted successfully",
    });
  } catch (error) {
    console.error("Delete Studio Error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to delete studio",
    });
  }
});

// ==========================================
// Test API
// ==========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "StudioSpace Backend is running!",
  });
});

// ==========================================
// Start Server
// ==========================================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
