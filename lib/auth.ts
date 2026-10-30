
import { betterAuth, } from "better-auth";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "@better-auth/mongo-adapter";

// Get MongoDB connection string from .env
const mongoURI = process.env.MONGODB_URI;

if (!mongoURI) {
  throw new Error("MONGODB_URI is missing in .env file");
}

// Create MongoDB client
const client = new MongoClient(mongoURI);

// Select database
const db = client.db("studiospace");

// Configure Better Auth
export const auth = betterAuth({
  // MongoDB database connection
  database: mongodbAdapter(db, {
    client,
  }),

  // Backend URL
  baseURL: process.env.BETTER_AUTH_URL,

  // Secret key
  secret: process.env.BETTER_AUTH_SECRET,

  // Allow requests from frontend
  trustedOrigins: [
    process.env.CLIENT_URL as string
  ],

  // Email and Password Authentication
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
});
