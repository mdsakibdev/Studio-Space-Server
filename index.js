import "dotenv/config";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

// Create Express application
const app = express();

const PORT = process.env.PORT || 5000;

// Enable CORS for frontend
app.use(cors());
app.use(express.json());


const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db('studoUser');
const studioCollection = db.collection('studios');
const bookingCollection = db.collection('bookings');

// Add Studio API
app.post("/studios", async (req, res) => {
    const data = req.body;
    const result = await studioCollection.insertOne(data);
    console.log(result);
    res.send(result);
});

// Create Booking API
app.post("/bookings", async (req, res) => {
    const data = req.body;

    const studio = await studioCollection.findOne({
        _id: new ObjectId(data.studioId),
    });

    if (!studio) {
        return res.status(404).send({ message: "Studio not found" });
    }

    const bookingData = {
        ...data,
        studioTitle: studio.title,
        status: "Pending",
        createdAt: new Date(),
    };

    const result = await bookingCollection.insertOne(bookingData);

    console.log(result);
    res.send(result);
});


// Get My Bookings API
app.get("/bookings", async (req, res) => {
  const email = req.query.email;

  const result = await bookingCollection
    .find({ "user.email": email })
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
});


// Get All Studios API
app.get("/studios", async (req, res) => {
    const result = await studioCollection.find().toArray();

    res.send(result);
});

// Get Featured Studios API
app.get("/studios/featured", async (req, res) => {
    const result = await studioCollection
        .find({ status: "active" })
        .sort({ rating: -1 })
        .limit(6)
        .toArray();

    res.send(result);
});



// Get Single Studio Details API
app.get('/studios/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await studioCollection.findOne({
            _id: new ObjectId(id)
        });

        res.send(result);

    } catch (error) {
        res.status(500).send({
            success: false,
            message: "Something went wrong"
        });
    }
});

// Cancel Booking API
app.patch("/bookings/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    // Check valid booking ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        success: false,
        message: "Invalid booking ID",
      });
    }

    
    // Cancel only Pending or Confirmed bookings
    const result = await bookingCollection.updateOne(
      {
        _id: new ObjectId(id),
        "user.email": email,
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



// Test API
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "StudioSpace Backend is running!",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
