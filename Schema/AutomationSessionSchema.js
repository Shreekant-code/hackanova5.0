import mongoose from "mongoose";

const automationSessionSchema = new mongoose.Schema(
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
      index: true,
    },
    official_application_link: {
      type: String,
      required: true,
      trim: true,
    },
    confirm_token: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["planned", "confirmed", "executed", "failed", "cancelled"],
      default: "planned",
      index: true,
    },
    preview_plan: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    crawl_snapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    runtime_summary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    warnings: {
      type: [String],
      default: [],
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    updated_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: "automation_sessions",
    timestamps: true,
  }
);

const AutomationSession =
  mongoose.models.AutomationSession || mongoose.model("AutomationSession", automationSessionSchema);

export default AutomationSession;
