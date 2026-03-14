import mongoose from "mongoose";

const formCrawlCacheSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    host: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    crawl_hash: {
      type: String,
      default: "",
      trim: true,
    },
    crawled_data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    crawled_at: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    collection: "form_crawl_cache",
    timestamps: true,
  }
);

const FormCrawlCache =
  mongoose.models.FormCrawlCache || mongoose.model("FormCrawlCache", formCrawlCacheSchema);

export default FormCrawlCache;
