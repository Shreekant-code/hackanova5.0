import mongoose from "mongoose";

const automationLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    session_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AutomationSession",
      default: null,
      index: true,
    },
    scheme_name: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    step: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["info", "success", "warning", "error"],
      default: "info",
      index: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    collection: "automation_logs",
    timestamps: true,
  }
);

const AutomationLog =
  mongoose.models.AutomationLog || mongoose.model("AutomationLog", automationLogSchema);

export default AutomationLog;
