import { Router } from "express";
import mongoose from "mongoose";
import Project, { PROJECT_STATUSES } from "../models/Project.js";
import ProjectMembership from "../models/ProjectMembership.js";
import User from "../models/User.js";
import UserStory from "../models/UserStory.js";

const router = Router();

function isBlank(value) {
  return typeof value !== "string" || value.trim() === "";
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function idsMatch(left, right) {
  return String(left) === String(right);
}

function getLeadId(project) {
  return project.project_lead_id?._id || project.project_lead_id;
}

function formatUser(user) {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,
    f_name: user.f_name,
    l_name: user.l_name,
    username: user.username
  };
}

function formatProject(project, membershipSummary = null) {
  const lead = project.project_lead_id;
  const leadIsPopulated = lead && typeof lead === "object" && "username" in lead;

  return {
    _id: project._id,
    name: project.name,
    description: project.description,
    status: project.status,
    project_lead_id: leadIsPopulated ? lead._id : lead,
    project_lead: leadIsPopulated ? formatUser(lead) : null,
    member_count: membershipSummary?.member_count || 0,
    member_ids: membershipSummary?.member_ids || []
  };
}

function formatMembership(membership) {
  return {
    _id: membership._id,
    project_id: membership.project_id,
    user_id: formatUser(membership.user_id)
  };
}

async function findProject(projectId) {
  if (!isValidObjectId(projectId)) {
    return null;
  }

  return Project.findById(projectId).populate("project_lead_id", "f_name l_name username");
}

async function ensureLeadMembership(project) {
  await ProjectMembership.findOneAndUpdate(
    {
      project_id: project._id,
      user_id: getLeadId(project)
    },
    {
      $setOnInsert: {
        project_id: project._id,
        user_id: getLeadId(project)
      }
    },
    {
      new: true,
      upsert: true
    }
  );
}

async function getProjectMemberships(projectId) {
  const memberships = await ProjectMembership.find({ project_id: projectId })
    .sort({ createdAt: 1 })
    .populate("user_id", "f_name l_name username");

  return memberships.map(formatMembership);
}

router.get("/projects", async (request, response) => {
  try {
    const projects = await Project.find({})
      .sort({ createdAt: -1 })
      .populate("project_lead_id", "f_name l_name username");
    const memberships = await ProjectMembership.find({}).select("project_id user_id");
    const membershipSummaries = new Map();

    memberships.forEach((membership) => {
      const projectId = String(membership.project_id);
      const currentSummary = membershipSummaries.get(projectId) || {
        member_count: 0,
        member_ids: []
      };

      currentSummary.member_count += 1;
      currentSummary.member_ids.push(String(membership.user_id));
      membershipSummaries.set(projectId, currentSummary);
    });

    return response.json({
      projects: projects.map((project) => formatProject(project, membershipSummaries.get(String(project._id))))
    });
  } catch (error) {
    console.error("Project list error:", error);
    return response.status(500).json({
      message: "Could not load projects right now."
    });
  }
});

router.post("/projects", async (request, response) => {
  const { name, description, status, project_lead_id } = request.body;

  if ([name, description, status, project_lead_id].some(isBlank)) {
    return response.status(400).json({
      message: "Fill out the project fields first."
    });
  }

  if (!PROJECT_STATUSES.includes(status)) {
    return response.status(400).json({
      message: "Pick one of the project statuses."
    });
  }

  if (!isValidObjectId(project_lead_id)) {
    return response.status(404).json({
      message: "That project lead is not in users."
    });
  }

  try {
    const lead = await User.findById(project_lead_id);

    if (!lead) {
      return response.status(404).json({
        message: "That project lead is not in users."
      });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description.trim(),
      status,
      project_lead_id: lead._id
    });

    await ProjectMembership.create({
      project_id: project._id,
      user_id: lead._id
    });

    const savedProject = await findProject(project._id);

    return response.status(201).json({
      message: "Project saved. The lead is on the team.",
      project: formatProject(savedProject)
    });
  } catch (error) {
    console.error("Project creation error:", error);
    return response.status(500).json({
      message: "Could not save the project right now."
    });
  }
});

router.get("/projects/:projectId/memberships", async (request, response) => {
  try {
    const project = await findProject(request.params.projectId);

    if (!project) {
      return response.status(404).json({
        message: "That project is not there anymore."
      });
    }

    await ensureLeadMembership(project);

    return response.json({
      project: formatProject(project),
      memberships: await getProjectMemberships(project._id)
    });
  } catch (error) {
    console.error("Membership list error:", error);
    return response.status(500).json({
      message: "Could not load the team list right now."
    });
  }
});

router.post("/projects/:projectId/memberships", async (request, response) => {
  const { user_id } = request.body;

  if (isBlank(user_id)) {
    return response.status(400).json({
      message: "Pick a user first."
    });
  }

  if (!isValidObjectId(user_id)) {
    return response.status(404).json({
      message: "That user is not there anymore."
    });
  }

  try {
    const project = await findProject(request.params.projectId);

    if (!project) {
      return response.status(404).json({
        message: "That project is not there anymore."
      });
    }

    const user = await User.findById(user_id);

    if (!user) {
      return response.status(404).json({
        message: "That user is not there anymore."
      });
    }

    const existingMembership = await ProjectMembership.findOne({
      project_id: project._id,
      user_id: user._id
    });

    if (existingMembership) {
      return response.status(409).json({
        message: "That person is already on this project."
      });
    }

    await ProjectMembership.create({
      project_id: project._id,
      user_id: user._id
    });

    return response.status(201).json({
      message: "Added to the project.",
      memberships: await getProjectMemberships(project._id)
    });
  } catch (error) {
    if (error.code === 11000) {
      return response.status(409).json({
        message: "That person is already on this project."
      });
    }

    console.error("Membership creation error:", error);
    return response.status(500).json({
      message: "Could not add that person right now."
    });
  }
});

router.delete("/projects/:projectId/memberships/:userId", async (request, response) => {
  const { projectId, userId } = request.params;

  if (!isValidObjectId(userId)) {
    return response.status(404).json({
      message: "That user is not there anymore."
    });
  }

  try {
    const project = await findProject(projectId);

    if (!project) {
      return response.status(404).json({
        message: "That project is not there anymore."
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return response.status(404).json({
        message: "That user is not there anymore."
      });
    }

    if (idsMatch(getLeadId(project), user._id)) {
      return response.status(400).json({
        message: "The lead has to stay on the project."
      });
    }

    const assignedStory = await UserStory.exists({
      project_id: project._id,
      assigned_user_id: user._id
    });

    if (assignedStory) {
      return response.status(409).json({
        message: "Reassign, unassign, or delete this member's stories before removing them from the project. Done stories count too."
      });
    }

    const removedMembership = await ProjectMembership.findOneAndDelete({
      project_id: project._id,
      user_id: user._id
    });

    if (!removedMembership) {
      return response.status(404).json({
        message: "That person is not on this project."
      });
    }

    return response.json({
      message: "Removed from the project.",
      memberships: await getProjectMemberships(project._id)
    });
  } catch (error) {
    console.error("Membership removal error:", error);
    return response.status(500).json({
      message: "Could not remove that person right now."
    });
  }
});

export default router;
