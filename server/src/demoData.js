import bcrypt from "bcryptjs";
import User from "./models/User.js";
import Project from "./models/Project.js";
import ProjectMembership from "./models/ProjectMembership.js";
import UserStory from "./models/UserStory.js";

export const DEMO_PASSWORD = "PA4-demo-2026!";

const characters = [
  ["foghorn_leghorn", "Foghorn", "Leghorn"],
  ["bugs_bunny", "Bugs", "Bunny"],
  ["daffy_duck", "Daffy", "Duck"],
  ["porky_pig", "Porky", "Pig"],
  ["elmer_fudd", "Elmer", "Fudd"],
  ["yosemite_sam", "Yosemite", "Sam"],
  ["sylvester_cat", "Sylvester", "Cat"],
  ["tweety_bird", "Tweety", "Bird"],
  ["marvin_martian", "Marvin", "the Martian"],
  ["tasmanian_devil", "Tasmanian", "Devil"],
  ["speedy_gonzales", "Speedy", "Gonzales"],
  ["wile_e_coyote", "Wile E.", "Coyote"],
  ["road_runner", "Road", "Runner"],
  ["pepe_le_pew", "Pepe", "Le Pew"],
  ["penelope_pussycat", "Penelope", "Pussycat"],
  ["lola_bunny", "Lola", "Bunny"],
  ["henery_hawk", "Henery", "Hawk"],
  ["michigan_j_frog", "Michigan J.", "Frog"]
];

// Keep existing accounts and custom work; migrate only the original seeded examples.
export async function seedDemoData() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = [];
  for (const [username, f_name, l_name] of characters) {
    users.push(await User.findOneAndUpdate({ username: `pa4_${username}` }, {
      $setOnInsert: { username: `pa4_${username}`, f_name, l_name, password }
    }, { new: true, upsert: true, runValidators: true }));
  }

  const legacyUsers = await User.find({ username: { $in: ["pa4_alex", "pa4_blair", "pa4_casey"] } });
  const legacyIds = new Map(legacyUsers.map((user) => [user.username, user._id]));
  const projects = [];
  for (const [name, description, lead, oldName, oldLeadUsername] of [
    ["Ram Ranch Showers", "Coordinate cowboy recruitment, shower crews, and daily supplies.", users[0], "PA4 Campus Events", "pa4_alex"],
    ["Ram Ranch Maintenance", "Keep the ranch showers, water pressure, and supplies in working order.", users[2], "PA4 Study Groups", "pa4_casey"]
  ]) {
    let project = await Project.findOne({ name, project_lead_id: lead._id });
    if (!project && legacyIds.has(oldLeadUsername)) {
      project = await Project.findOneAndUpdate({ name: oldName, project_lead_id: legacyIds.get(oldLeadUsername) }, {
        $set: { name, description, project_lead_id: lead._id }
      }, { new: true, runValidators: true });
    }
    if (!project) {
      project = await Project.findOneAndUpdate({ name, project_lead_id: lead._id }, {
        $setOnInsert: { name, description, status: "Active", project_lead_id: lead._id }
      }, { new: true, upsert: true, runValidators: true });
    }
    projects.push(project);
  }

  for (const [project, user] of [
    [projects[0], users[0]], [projects[0], users[1]],
    [projects[1], users[2]], [projects[1], users[0]]
  ]) {
    await ProjectMembership.updateOne({ project_id: project._id, user_id: user._id }, {
      $setOnInsert: { project_id: project._id, user_id: user._id }
    }, { upsert: true });
  }

  const examples = [
    [0, "Find 18 cowboys for the showers", "As a ranch coordinator, I want to find 18 cowboys for the showers, so that the shower roster is complete.", "High", "To Do", users[0]._id,
      "View campus event details", "As a student, I want to view details of a campus event, so that I can decide whether to attend.", "pa4_alex"],
    [0, "Recruit a shower cleanup crew", "As a ranch coordinator, I want to recruit a cleanup crew for the showers, so that the facilities stay clean and ready for the next group.", "Medium", "In Progress", users[1]._id,
      "Filter upcoming events", "As a student, I want to filter events by date, so that I can find events that fit my schedule.", "pa4_blair"],
    [0, "Stock clean towels", "As a cowboy, I want clean towels stocked by the showers, so that I can dry off after washing.", "Low", "Done", users[1]._id,
      "Save a favorite event", "As a student, I want to save an event, so that I can find it again later.", "pa4_blair"],
    [1, "Inspect shower water pressure", "As a maintenance lead, I want to inspect the shower water pressure, so that every shower works reliably.", "High", "To Do", users[2]._id,
      "Create a study group", "As a student, I want to create a study group, so that I can prepare for exams with classmates.", "pa4_casey"],
    [1, "Track shower supply levels", "As a ranch caretaker, I want to track shower supply levels, so that soap and cleaning supplies are replenished on time.", "Medium", "Done", null,
      "Find available groups", "As a student, I want to find study groups by course, so that I can join classmates studying the same material.", null]
  ];

  for (const [projectIndex, title, description, priority, status, assigned_user_id, oldTitle, oldDescription, oldAssignee] of examples) {
    const project_id = projects[projectIndex]._id;
    if (await UserStory.exists({ project_id, title })) continue;
    const oldStory = await UserStory.findOne({ project_id, title: oldTitle, description: oldDescription });
    if (oldStory) {
      oldStory.title = title;
      oldStory.description = description;
      // Preserve status, priority, and any assignment the user changed themselves.
      if (String(oldStory.assigned_user_id) === String(oldAssignee ? legacyIds.get(oldAssignee) : null)) {
        oldStory.assigned_user_id = assigned_user_id;
      }
      await oldStory.save();
    } else {
      await UserStory.updateOne({ project_id, title }, {
        $setOnInsert: { project_id, title, description, priority, status, assigned_user_id }
      }, { upsert: true, runValidators: true });
    }
  }
  return { users, projects };
}
