import Profile from "../Schema/Profileschema.js";

export const createProfile = async (req, res) => {
  try {

    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "User not logged in",
      });
    }

    const { age, occupation, location, phone } = req.body;

    // Optional: check required fields
    if (!age || !occupation || !location || !phone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Prevent duplicate profile
    const existingProfile = await Profile.findOne({ user: req.user.id });

    if (existingProfile) {
      return res.status(400).json({
        success: false,
        message: "Profile already exists",
      });
    }

    const profile = await Profile.create({
      user: req.user.id,
      age,
      occupation,
      location,
      phone,
    });

    res.status(201).json({
      success: true,
      message: "Profile created successfully",
      profile,
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message,
    });

  }
};