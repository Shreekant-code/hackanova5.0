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

    const { age, occupation, category, annual_income, gender, location, phone } = req.body;
    const parsedAge = Number(age);
    const parsedIncome =
      annual_income === null || annual_income === undefined || annual_income === ""
        ? null
        : Number(annual_income);
    const safeLocation =
      location && typeof location === "object"
        ? {
            city: String(location.city || "").trim(),
            state: String(location.state || "").trim(),
            country: String(location.country || "").trim(),
            lat: location.lat === undefined || location.lat === null || location.lat === "" ? null : Number(location.lat),
            lng: location.lng === undefined || location.lng === null || location.lng === "" ? null : Number(location.lng),
          }
        : { city: "", state: "", country: "" };
    const safeOccupation = String(occupation || "").trim();
    const safeCategory = String(category || "").trim();
    const safeGender = String(gender || "").trim();
    const safePhone = String(phone || "").trim();

    // Required validations
    if (!Number.isFinite(parsedAge) || parsedAge <= 0 || !safeOccupation || !safeCategory || !safePhone || !safeLocation.state) {
      return res.status(400).json({
        success: false,
        message: "age, occupation, category, phone, and location.state are required",
      });
    }
    if (parsedIncome !== null && (!Number.isFinite(parsedIncome) || parsedIncome < 0)) {
      return res.status(400).json({
        success: false,
        message: "annual_income must be a valid non-negative number",
      });
    }

    const existingProfile = await Profile.findOne({ user: req.user.id });

    if (existingProfile) {
      existingProfile.age = parsedAge;
      existingProfile.occupation = safeOccupation;
      existingProfile.category = safeCategory;
      existingProfile.annual_income = parsedIncome;
      existingProfile.gender = safeGender;
      existingProfile.location = safeLocation;
      existingProfile.phone = safePhone;

      await existingProfile.save();

      return res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        profile: existingProfile,
        profile_created: false,
        profile_updated: true,
      });
    }

    const profile = await Profile.create({
      user: req.user.id,
      age: parsedAge,
      occupation: safeOccupation,
      category: safeCategory,
      annual_income: parsedIncome,
      gender: safeGender,
      location: safeLocation,
      phone: safePhone,
    });

    return res.status(201).json({
      success: true,
      message: "Profile created successfully",
      profile,
      profile_created: true,
      profile_updated: false,
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: err.message,
    });

  }
};
