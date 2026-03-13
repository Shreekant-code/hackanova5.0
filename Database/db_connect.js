import mongoose from "mongoose";

const connect_DB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const appDbName = process.env.APP_DB_NAME || "Hacknova5";
    await mongoose.connect(mongoUri, { dbName: appDbName });

    console.log("MongoDB Connected");
  } catch (error) {
    console.log("Database connection error:", error);
    process.exit(1);
  }
};

export default connect_DB;
