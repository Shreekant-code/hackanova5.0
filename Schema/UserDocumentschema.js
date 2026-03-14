import mongoose from "mongoose";

const userDocumentSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    scheme_name: {
      type: String,
      default: "",
      trim: true,
    },
    document_name: {
      type: String,
      required: true,
      trim: true,
    },
    cloudinary_url: {
      type: String,
      required: true,
      trim: true,
    },
    file_type: {
      type: String,
      default: "",
      trim: true,
    },
    dedupe_key: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    extracted_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    autofill_fields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    dynamic_schema: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    is_required_for_scheme: {
      type: Boolean,
      default: false,
    },
    required_document_match: {
      type: String,
      default: "",
      trim: true,
    },
    uploaded_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "user_documents",
    timestamps: true,
  }
);

const UserDocument =
  mongoose.models.UserDocument || mongoose.model("UserDocument", userDocumentSchema);

export default UserDocument;
