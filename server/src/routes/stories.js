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
    return response.status(400).json({ message: "That project ID doesn't look right. Choose the project again." });
  }
  if (!await Project.exists({ _id: request.params.projectId })) {
    return response.status(404).json({ message: "We couldn't find that project. Try refreshing your projects." });
  }
  next();
}));

router.param("storyId", (request, response, next) => {
  if (!isIdentifier(request.params.storyId)) {
    return response.status(400).json({ message: "That story ID doesn't look right. Refresh the backlog and try again." });
  }
  next();
});

function validateFields(body, editing) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "We couldn't read the story details. Try again.";
  }
  if ([body.title, body.description].some((value) => typeof value !== "string" || !value.trim())) {
    return "Give your story a title and a few details, then try again.";
  }
  if (!STORY_PRIORITIES.includes(body.priority)) {
    return "Pick a priority: High, Medium, or Low.";
  }
  if (editing && !STORY_STATUSES.includes(body.status)) {
    return "Pick a status: To Do, In Progress, or Done.";
  }
  if (editing && body.assigned_user_id === undefined) {
    return "Pick someone from the team, or leave the story unassigned.";
  }
  if (body.assigned_user_id != null && !isIdentifier(body.assigned_user_id)) {
    return "Pick someone from the team, or leave the story unassigned.";
  }
  return null;
}

async function validateAssignment(projectId, userId) {
  if (userId == null) return null;
  if (!await User.exists({ _id: userId })) {
    return { status: 404, message: "We couldn't find that person. Try refreshing the backlog." };
  }
  if (!await ProjectMembership.exists({ project_id: projectId, user_id: userId })) {
    return { status: 400, message: "Add this person to the team before assigning them a story." };
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
  response.status(201).json({ message: "Story added! It's in To Do for now.", story: formatStory(story) });
}));

router.put(`${basePath}/:storyId`, asyncRoute(async (request, response) => {
  const query = storyQuery(request);
  if (!await UserStory.exists(query)) {
    return response.status(404).json({ message: "We couldn't find that story here. Try refreshing the backlog." });
  }
  const error = validateFields(request.body, true);
  if (error) return response.status(400).json({ message: error });
  const assignmentError = await validateAssignment(request.params.projectId, request.body.assigned_user_id);
  if (assignmentError) return response.status(assignmentError.status).json({ message: assignmentError.message });

  const story = await populateAssignee(UserStory.findOneAndUpdate(query, {
    $set: { ...editableFields(request.body), status: request.body.status }
  }, { new: true, runValidators: true }));
  if (!story) return response.status(404).json({ message: "We couldn't find that story here. Try refreshing the backlog." });
  response.json({ message: "Your changes are saved.", story: formatStory(story) });
}));

router.delete(`${basePath}/:storyId`, asyncRoute(async (request, response) => {
  const result = await UserStory.deleteOne(storyQuery(request));
  if (!result.deletedCount) {
    return response.status(404).json({ message: "We couldn't find that story here. Try refreshing the backlog." });
  }
  response.json({ message: "Story removed from the backlog." });
}));

export default router;
