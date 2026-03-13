import mongoose from "mongoose";

const profileSchema = new mongoose.Schema({

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  age: {
    type: Number,
    required: true
  },

  occupation: {
    type: String,
    required: true
  },

  location: {
    city: String,
    state: String,
    country: String,
    lat: Number,
    lng: Number
  },

  phone: {
    type: String,
    required: true
  }

},{timestamps:true});

const Profile = mongoose.model("Profile", profileSchema);

export default Profile;