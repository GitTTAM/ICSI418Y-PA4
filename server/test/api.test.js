import assert from "node:assert/strict";
import { before, after, beforeEach, test } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import UserStory from "../src/models/UserStory.js";
import ProjectMembership from "../src/models/ProjectMembership.js";
import User from "../src/models/User.js";
import { seedDemoData, DEMO_PASSWORD } from "../src/demoData.js";

let database, server, baseUrl, users, projects;
const missingId = "000000000000000000000001";
const storyFields = {
  title: "Find 18 cowboys for the showers",
  description: "As a ranch coordinator, I want to find 18 cowboys for the showers, so that the shower roster is complete.",
  priority: "High",
  assigned_user_id: null
};

async function api(method, path, body, status = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  return data;
}

const backlogPath = (index = 0) => `/projects/${projects[index]._id}/stories`;
const memberPath = (projectIndex, userIndex) => `/projects/${projects[projectIndex]._id}/memberships/${users[userIndex]._id}`;
const createStory = async (fields = {}, index = 0) => (await api("POST", backlogPath(index), { ...storyFields, ...fields }, 201)).story;

before(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  users = [];
  for (const username of ["test_alex", "test_blair", "test_casey"]) {
    const { user } = await api("POST", "/signup", { f_name: username, l_name: "Test", username, password: "test-password" }, 201);
    assert.equal(user.password, undefined);
    users.push(user);
  }
  projects = [];
  for (const [index, leadIndex] of [[0, 0], [1, 2]]) {
    const { project } = await api("POST", "/projects", {
      name: `Project ${index}`, description: "Test project", status: "Active", project_lead_id: users[leadIndex]._id
    }, 201);
    projects.push(project);
  }
  await api("POST", `/projects/${projects[0]._id}/memberships`, { user_id: users[1]._id }, 201);
});

beforeEach(async () => { await UserStory.deleteMany({}); });

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

test("PA3 signup, login, lead membership, and duplicate protections still work", async () => {
  await api("POST", "/signup", { ...users[0], password: "another-password" }, 409);
  const login = await api("POST", "/login", { username: "TEST_ALEX", password: "test-password" });
  assert.equal(login.user._id, users[0]._id);
  assert.equal(login.user.password, undefined);
  await api("POST", "/login", { username: "test_alex", password: "wrong" }, 401);
  const { memberships } = await api("GET", `/projects/${projects[0]._id}/memberships`);
  assert(memberships.some((membership) => membership.user_id._id === users[0]._id));
  await api("POST", `/projects/${projects[0]._id}/memberships`, { user_id: users[1]._id }, 409);
  await api("DELETE", memberPath(0, 0), undefined, 400);
});

test("creation trims text, forces To Do, and stores ObjectId relationships in UserStories", async () => {
  const story = await createStory({
    title: "  Find 18 cowboys for the showers  ", assigned_user_id: users[1]._id,
    status: "Done", project_id: projects[1]._id, _id: missingId
  });
  assert.equal(story.title, "Find 18 cowboys for the showers");
  assert.equal(story.status, "To Do");
  assert.equal(story.project_id, projects[0]._id);
  assert.notEqual(story._id, missingId);
  assert.equal(story.assigned_user.username, users[1].username);
  assert.equal(story.assigned_user.password, undefined);
  const stored = await UserStory.findById(story._id);
  assert(stored.project_id instanceof mongoose.Types.ObjectId);
  assert(stored.assigned_user_id instanceof mongoose.Types.ObjectId);
  assert.equal(UserStory.collection.name, "UserStories");
  assert.equal((await createStory({ assigned_user_id: null })).assigned_user_id, null);
});

test("backlogs contain only their project's stories and include Done stories", async () => {
  const first = await createStory();
  await api("PUT", `${backlogPath()}/${first._id}`, { ...storyFields, status: "Done" });
  await createStory({ title: "Other project story" }, 1);
  const { stories } = await api("GET", backlogPath());
  assert.equal(stories.length, 1);
  assert.equal(stories[0]._id, first._id);
  assert.equal(stories[0].status, "Done");
});

test("rejects invalid required text, priorities, statuses, body shapes, and assignee identifiers", async () => {
  for (const fields of [
    { title: "   " }, { description: "\t" }, { title: 42 }, { description: {} },
    { priority: "Urgent" }, { priority: null }, { status: "Active" }, { status: null },
    { status: 42 }, { status: "" }, { assigned_user_id: "" },
    { assigned_user_id: "null" }, { assigned_user_id: 123 }, { assigned_user_id: {} }
  ]) await api("POST", backlogPath(), { ...storyFields, ...fields }, 400);
  await api("POST", backlogPath(), [], 400);
  await api("POST", backlogPath(), undefined, 400);
  assert.equal(await UserStory.countDocuments(), 0);
});

test("validates malformed identifiers and missing projects, stories, and users", async () => {
  await api("GET", "/projects/invalid/stories", undefined, 400);
  await api("GET", `/projects/${missingId}/stories`, undefined, 404);
  await api("PUT", `${backlogPath()}/invalid`, storyFields, 400);
  await api("DELETE", `${backlogPath()}/invalid`, undefined, 400);
  await api("PUT", `${backlogPath()}/${missingId}`, { ...storyFields, status: "To Do" }, 404);
  await api("DELETE", `${backlogPath()}/${missingId}`, undefined, 404);
  await api("POST", backlogPath(), { ...storyFields, assigned_user_id: missingId }, 404);
});

test("only current members of the same project can be assigned on create or edit", async () => {
  await api("POST", backlogPath(), { ...storyFields, assigned_user_id: users[2]._id }, 400);
  await api("POST", backlogPath(1), { ...storyFields, assigned_user_id: users[1]._id }, 400);
  const story = await createStory({ assigned_user_id: users[0]._id });
  await api("PUT", `${backlogPath()}/${story._id}`, { ...storyFields, status: "Done", assigned_user_id: users[2]._id }, 400);
  await api("PUT", `${backlogPath()}/${story._id}`, { ...storyFields, status: "Done", assigned_user_id: missingId }, 404);
  const unchanged = await UserStory.findById(story._id);
  assert.equal(String(unchanged.assigned_user_id), users[0]._id);
  assert.equal(unchanged.status, "To Do");
});

test("updates all editable fields, supports every status transition and unchanged saves", async () => {
  const story = await createStory({ assigned_user_id: users[1]._id });
  const path = `${backlogPath()}/${story._id}`;
  for (const status of ["In Progress", "Done", "To Do", "Done", "In Progress"]) {
    const fields = { ...storyFields, title: "Updated title", priority: "Low", status, assigned_user_id: null };
    const saved = await api("PUT", path, { ...fields, project_id: projects[1]._id, _id: missingId });
    assert.equal(saved.story.status, status);
    assert.equal(saved.story.project_id, projects[0]._id);
    assert.equal(saved.story._id, story._id);
    assert.equal(saved.story.assigned_user_id, null);
    assert.equal(saved.story.title, "Updated title");
    await api("PUT", path, fields);
  }
  for (const fields of [{ status: "Active" }, { status: undefined }, { priority: "urgent" }, { title: " " }, { assigned_user_id: undefined }]) {
    await api("PUT", path, { ...storyFields, status: "To Do", ...fields }, 400);
  }
});

test("a story cannot be edited or deleted through a different project's route", async () => {
  const story = await createStory();
  await api("PUT", `${backlogPath(1)}/${story._id}`, { ...storyFields, status: "Done" }, 404);
  await api("DELETE", `${backlogPath(1)}/${story._id}`, undefined, 404);
  assert.equal((await UserStory.findById(story._id)).status, "To Do");
});

test("assigned stories block member removal in all statuses until unassigned or deleted", async () => {
  const story = await createStory({ assigned_user_id: users[1]._id });
  for (const status of ["To Do", "In Progress", "Done"]) {
    await api("PUT", `${backlogPath()}/${story._id}`, { ...storyFields, status, assigned_user_id: users[1]._id });
    const result = await api("DELETE", memberPath(0, 1), undefined, 409);
    assert.match(result.message, /They still have stories here\./);
    assert(await ProjectMembership.exists({ project_id: projects[0]._id, user_id: users[1]._id }));
  }
  await api("PUT", `${backlogPath()}/${story._id}`, { ...storyFields, status: "Done" });
  await api("DELETE", memberPath(0, 1));
  await api("POST", `/projects/${projects[0]._id}/memberships`, { user_id: users[1]._id }, 201);
  const assigned = await createStory({ assigned_user_id: users[1]._id });
  await api("DELETE", `${backlogPath()}/${assigned._id}`);
  await api("DELETE", memberPath(0, 1));
  await api("POST", `/projects/${projects[0]._id}/memberships`, { user_id: users[1]._id }, 201);
});

test("assignments in another project do not block removal here", async () => {
  await api("POST", `/projects/${projects[1]._id}/memberships`, { user_id: users[1]._id }, 201);
  await createStory({ assigned_user_id: users[1]._id });
  await api("DELETE", memberPath(1, 1));
  assert(await ProjectMembership.exists({ project_id: projects[0]._id, user_id: users[1]._id }));
});

test("saved changes and deletions survive a new database connection", async () => {
  const story = await createStory();
  await api("PUT", `${backlogPath()}/${story._id}`, { ...storyFields, title: "Persistent title", status: "Done" });
  await mongoose.disconnect();
  await mongoose.connect(database.getUri());
  assert.equal((await api("GET", backlogPath())).stories[0].title, "Persistent title");
  await api("DELETE", `${backlogPath()}/${story._id}`);
  await mongoose.disconnect();
  await mongoose.connect(database.getUri());
  assert.deepEqual((await api("GET", backlogPath())).stories, []);
});

test("ranch migration keeps project/story IDs, custom work, passwords, and edited story fields", async () => {
  const oldUsers = [];
  for (const username of ["pa4_alex", "pa4_blair", "pa4_casey"]) {
    oldUsers.push((await api("POST", "/signup", { f_name: username, l_name: "Original", username, password: "original-password" }, 201)).user);
  }
  const oldProjects = [];
  for (const [name, index] of [["PA4 Campus Events", 0], ["PA4 Study Groups", 2]]) {
    oldProjects.push((await api("POST", "/projects", { name, description: "Original seeded project", status: "Active", project_lead_id: oldUsers[index]._id }, 201)).project);
  }
  const path = `/projects/${oldProjects[0]._id}/stories`;
  await api("POST", `/projects/${oldProjects[0]._id}/memberships`, { user_id: oldUsers[1]._id }, 201);
  await api("POST", `/projects/${oldProjects[0]._id}/memberships`, { user_id: oldUsers[2]._id }, 201);
  const oldFields = {
    title: "View campus event details",
    description: "As a student, I want to view details of a campus event, so that I can decide whether to attend.",
    priority: "High", assigned_user_id: oldUsers[0]._id
  };
  const oldStory = (await api("POST", path, oldFields, 201)).story;
  await api("PUT", `${path}/${oldStory._id}`, { ...oldFields, priority: "Low", status: "Done" });
  const custom = (await api("POST", path, { ...storyFields, title: "Filter upcoming events", description: "My own edited description", assigned_user_id: oldUsers[1]._id }, 201)).story;
  const reassigned = (await api("POST", path, {
    ...storyFields, title: "Save a favorite event",
    description: "As a student, I want to save an event, so that I can find it again later.",
    assigned_user_id: oldUsers[2]._id
  }, 201)).story;
  const demo = await seedDemoData();
  assert.equal(String(demo.projects[0]._id), oldProjects[0]._id);
  assert.equal(String(demo.projects[1]._id), oldProjects[1]._id);
  assert.equal(demo.projects[0].name, "Ram Ranch Showers");
  const migrated = await UserStory.findById(oldStory._id);
  assert.equal(migrated.title, "Find 18 cowboys for the showers");
  assert.equal(migrated.status, "Done");
  assert.equal(migrated.priority, "Low");
  assert.equal(String(migrated.assigned_user_id), String(demo.users[0]._id));
  assert.equal((await UserStory.findById(custom._id)).description, "My own edited description");
  assert.equal(String((await UserStory.findById(reassigned._id)).assigned_user_id), oldUsers[2]._id);
  assert(await ProjectMembership.exists({ project_id: oldProjects[0]._id, user_id: demo.users[0]._id }));
  assert(await ProjectMembership.exists({ project_id: oldProjects[0]._id, user_id: oldUsers[2]._id }));
  await api("POST", "/login", { username: "pa4_alex", password: "original-password" });
  const storyCount = await UserStory.countDocuments();
  await seedDemoData();
  assert.equal(await UserStory.countDocuments(), storyCount);
  assert.equal((await UserStory.findById(oldStory._id)).priority, "Low");
});

test("demo data supplies 18 character users, two ranch projects, and five stories without duplicating on rerun", async () => {
  const demo = await seedDemoData();
  const userCount = await User.countDocuments();
  await seedDemoData();
  const stories = await UserStory.find({ project_id: { $in: demo.projects.map((project) => project._id) } });
  assert.equal(demo.users.length, 18);
  assert.equal(new Set(demo.users.map((user) => `${user.f_name} ${user.l_name}`)).size, 18);
  assert.equal(new Set(demo.users.map((user) => user.username)).size, 18);
  assert.equal(await User.countDocuments(), userCount);
  assert.equal(demo.users[0].f_name, "Foghorn");
  await api("POST", "/login", { username: "pa4_foghorn_leghorn", password: DEMO_PASSWORD });
  assert.equal(demo.projects.length, 2);
  assert.equal(stories.length, 5);
  for (const project of demo.projects) {
    assert(stories.some((story) => String(story.project_id) === String(project._id)));
  }
  const bugs = demo.users[1];
  assert.notEqual(String(bugs._id), String(demo.projects[0].project_lead_id));
  assert(await ProjectMembership.exists({ project_id: demo.projects[0]._id, user_id: bugs._id }));
  assert.equal(await ProjectMembership.exists({ project_id: demo.projects[1]._id, user_id: bugs._id }), null);
  assert(stories.some((story) => story.title === "Find 18 cowboys for the showers"));
  assert(stories.some((story) => story.title === "Recruit a shower cleanup crew"));
  assert.equal(new Set(stories.map((story) => story.priority)).size, 3);
  assert.equal(new Set(stories.map((story) => story.status)).size, 3);
  assert(stories.some((story) => story.assigned_user_id === null));
  assert(stories.some((story) => story.assigned_user_id !== null));
});
