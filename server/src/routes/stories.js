import { Router } from "express";
import Project from "../models/Project.js";
import ProjectMembership from "../models/ProjectMembership.js";
import User from "../models/User.js";
import UserStory, { STORY_PRIORITIES, STORY_STATUSES } from "../models/UserStory.js";

const router = Router();
const basePath = "/projects/:projectId/stories";
const isIdentifier = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value);

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

router.param("projectId", asyncRoute(async (request, response, next) => {
  if (!isIdentifier(request.params.projectId)) {
    return response.status(400).json({ message: "Invalid project identifier." });
  }
  if (!await Project.exists({ _id: request.params.projectId })) {
    return response.status(404).json({ message: "That project does not exist." });
  }
  next();
}));

router.param("storyId", (request, response, next) => {
  if (!isIdentifier(request.params.storyId)) {
    return response.status(400).json({ message: "Invalid story identifier." });
  }
  next();
});

function validateFields(body, editing) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Send a story object.";
  }
  if ([body.title, body.description].some((value) => typeof value !== "string" || !value.trim())) {
    return "Title and description must be nonblank text.";
  }
  if (!STORY_PRIORITIES.includes(body.priority)) {
    return "Choose High, Medium, or Low priority.";
  }
  if (editing && !STORY_STATUSES.includes(body.status)) {
    return "Choose To Do, In Progress, or Done status.";
  }
  if (editing && body.assigned_user_id === undefined) {
    return "Choose a project member or Unassigned.";
  }
  if (body.assigned_user_id != null && !isIdentifier(body.assigned_user_id)) {
    return "Invalid assigned member identifier. Use null for Unassigned.";
  }
  return null;
}

async function validateAssignment(projectId, userId) {
  if (userId == null) return null;
  if (!await User.exists({ _id: userId })) {
    return { status: 404, message: "That assigned user does not exist." };
  }
  if (!await ProjectMembership.exists({ project_id: projectId, user_id: userId })) {
    return { status: 400, message: "The assigned user must be a current member of this project." };
  }
  return null;
}

function editableFields(body) {
  return {
    title: body.title.trim(),
    description: body.description.trim(),
    priority: body.priority,
    assigned_user_id: body.assigned_user_id ?? null
  };
}

function storyQuery(request) {
  return { _id: request.params.storyId, project_id: request.params.projectId };
}

function populateAssignee(query) {
  return query.populate("assigned_user_id", "f_name l_name username");
}

function formatStory(story) {
  const saved = story.toObject();
  const assignee = saved.assigned_user_id;
  return {
    ...saved,
    assigned_user_id: assignee?._id ?? null,
    assigned_user: assignee ?? null
  };
}

router.get(basePath, asyncRoute(async (request, response) => {
  const stories = await populateAssignee(UserStory.find({ project_id: request.params.projectId })
    .sort({ createdAt: 1, _id: 1 }));
  response.json({ stories: stories.map(formatStory) });
}));

router.post(basePath, asyncRoute(async (request, response) => {
  const error = validateFields(request.body, false);
  if (error) return response.status(400).json({ message: error });
  const assignmentError = await validateAssignment(request.params.projectId, request.body.assigned_user_id);
  if (assignmentError) return response.status(assignmentError.status).json({ message: assignmentError.message });

  const story = await UserStory.create({
    ...editableFields(request.body),
    project_id: request.params.projectId,
    status: "To Do"
  });
  await story.populate("assigned_user_id", "f_name l_name username");
  response.status(201).json({ message: "Story created. Status starts at To Do.", story: formatStory(story) });
}));

router.put(`${basePath}/:storyId`, asyncRoute(async (request, response) => {
  const query = storyQuery(request);
  if (!await UserStory.exists(query)) {
    return response.status(404).json({ message: "That story does not exist in this project." });
  }
  const error = validateFields(request.body, true);
  if (error) return response.status(400).json({ message: error });
  const assignmentError = await validateAssignment(request.params.projectId, request.body.assigned_user_id);
  if (assignmentError) return response.status(assignmentError.status).json({ message: assignmentError.message });

  const story = await populateAssignee(UserStory.findOneAndUpdate(query, {
    $set: { ...editableFields(request.body), status: request.body.status }
  }, { new: true, runValidators: true }));
  if (!story) return response.status(404).json({ message: "That story does not exist in this project." });
  response.json({ message: "Story saved.", story: formatStory(story) });
}));

router.delete(`${basePath}/:storyId`, asyncRoute(async (request, response) => {
  const result = await UserStory.deleteOne(storyQuery(request));
  if (!result.deletedCount) {
    return response.status(404).json({ message: "That story does not exist in this project." });
  }
  response.json({ message: "Story deleted." });
}));

export default router;
