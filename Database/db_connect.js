import mongoose from "mongoose";

const connect_DB = async () => {
  try {
    await mongoose.connect("mongodb://localhost:27017/Hacknova5");

    console.log("MongoDB Connected");
  } catch (error) {
    console.log("Database connection error:", error);
    process.exit(1);
  }
};

export default connect_DB;