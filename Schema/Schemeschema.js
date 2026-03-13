import mongoose from "mongoose";

const schemeSchema = new mongoose.Schema(
  {
    scheme_name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: { type: String, default: "" },
    category: { type: String, default: "" },
    target_group: { type: [String], default: [] },
    age_min: { type: Number, default: null },
    age_max: { type: Number, default: null },
    occupation: { type: String, default: "" },
    gender: { type: String, default: "All" },
    state: { type: String, default: "All" },
    benefits: { type: [String], default: [] },
    documents_required: { type: [String], default: [] },
    ministry: { type: String, default: "" },
    scheme_page_link: { type: String, default: "" },
    original_apply_link: { type: String, default: "" },
    apply_link: { type: String, default: "" },
  },
  {
    collection: "schemes",
    timestamps: true,
  }
);

const Scheme = mongoose.models.Scheme || mongoose.model("Scheme", schemeSchema);

export default Scheme;
