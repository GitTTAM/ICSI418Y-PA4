import mongoose from "mongoose";

export const STORY_PRIORITIES = ["High", "Medium", "Low"];
export const STORY_STATUSES = ["To Do", "In Progress", "Done"];

const userStorySchema = new mongoose.Schema(
  {
    project_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      immutable: true
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    priority: { type: String, enum: STORY_PRIORITIES, required: true },
    status: { type: String, enum: STORY_STATUSES, required: true, default: "To Do" },
    assigned_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true, collection: "UserStories" }
);

userStorySchema.index({ project_id: 1, assigned_user_id: 1 });

export default mongoose.model("UserStory", userStorySchema);
