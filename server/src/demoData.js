import bcrypt from "bcryptjs";
import User from "./models/User.js";
import Project from "./models/Project.js";
import ProjectMembership from "./models/ProjectMembership.js";
import UserStory from "./models/UserStory.js";

export const DEMO_PASSWORD = "PA4-demo-2026!";

// Add missing demo records only. Never clear collections or overwrite existing work.
export async function seedDemoData() {
  const password = await bcrypt.hash(DEMO_PASSWORD, 10);
  const people = [
    { username: "pa4_alex", f_name: "Alex", l_name: "Rivera" },
    { username: "pa4_blair", f_name: "Blair", l_name: "Chen" },
    { username: "pa4_casey", f_name: "Casey", l_name: "Morgan" }
  ];
  const users = [];
  for (const person of people) {
    users.push(await User.findOneAndUpdate({ username: person.username }, {
      $setOnInsert: { ...person, password }
    }, { new: true, upsert: true, runValidators: true }));
  }
  const projects = [];
  for (const [name, description, lead] of [
    ["PA4 Campus Events", "Help students discover campus events.", users[0]],
    ["PA4 Study Groups", "Help students organize study sessions.", users[2]]
  ]) {
    projects.push(await Project.findOneAndUpdate({ name, project_lead_id: lead._id }, {
      $setOnInsert: { name, description, status: "Active", project_lead_id: lead._id }
    }, { new: true, upsert: true, runValidators: true }));
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
    [0, "View campus event details", "As a student, I want to view details of a campus event, so that I can decide whether to attend.", "High", "To Do", users[0]._id],
    [0, "Filter upcoming events", "As a student, I want to filter events by date, so that I can find events that fit my schedule.", "Medium", "In Progress", users[1]._id],
    [0, "Save a favorite event", "As a student, I want to save an event, so that I can find it again later.", "Low", "Done", users[1]._id],
    [1, "Create a study group", "As a student, I want to create a study group, so that I can prepare for exams with classmates.", "High", "To Do", users[2]._id],
    [1, "Find available groups", "As a student, I want to find study groups by course, so that I can join classmates studying the same material.", "Medium", "Done", null]
  ];
  for (const [projectIndex, title, description, priority, status, assigned_user_id] of examples) {
    const project_id = projects[projectIndex]._id;
    await UserStory.updateOne({ project_id, title }, {
      $setOnInsert: { project_id, title, description, priority, status, assigned_user_id }
    }, { upsert: true, runValidators: true });
  }
  return { users, projects };
}
