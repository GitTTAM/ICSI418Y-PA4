import { test, expect } from "@playwright/test";

async function openProjects(page) {
  await page.getByRole("tab", { name: "Projects & Memberships", exact: true }).click();
}

async function openBacklog(page) {
  await page.getByRole("tab", { name: "Project Backlog", exact: true }).click();
}

async function expectWorkload(page, username, text) {
  await openProjects(page);
  await expect(page.locator(".member-item").filter({ hasText: username }).getByText(text, { exact: true })).toBeVisible();
  await openBacklog(page);
}

async function login(page, expectStories = true, visitBacklog = true) {
  await page.goto("/");
  await page.getByRole("tab", { name: "Log In", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("pa4_foghorn_leghorn");
  await page.getByLabel("Password", { exact: true }).fill("PA4-demo-2026!");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Signed In" })).toBeVisible();
  await page.getByLabel("Selected Project").selectOption({ label: "Ram Ranch Showers" });
  if (visitBacklog) await openBacklog(page);
  if (expectStories && visitBacklog) await expect(page.getByRole("article", { name: "Find 18 cowboys for the showers", exact: true })).toBeVisible();
}

test("create, cancel edit, save, reopen, confirm delete, and refresh preserve the correct data", async ({ page }) => {
  await login(page);
  const progress = page.getByRole("progressbar", { name: "Project completion" });
  await expect(page.getByText("1 of 3 stories Done", { exact: true })).toBeVisible();
  await expect(progress).toHaveAttribute("value", "1");
  await expect(progress).toHaveAttribute("max", "3");
  await expectWorkload(page, "pa4_bugs_bunny", "2 assigned stories");
  const form = page.getByRole("form", { name: "Create Story", exact: true });
  const assignees = await form.getByLabel("Assign to").locator("option").allTextContents();
  expect(assignees.join(" ")).toContain("pa4_foghorn_leghorn");
  expect(assignees.join(" ")).toContain("pa4_bugs_bunny");
  expect(assignees.join(" ")).not.toContain("pa4_daffy_duck");
  await form.getByLabel("Story Title").fill("Browser test story");
  await form.getByLabel("Story Description").fill("As a ranch coordinator, I want a browser test, so that I can verify persistence.");
  await form.getByLabel("Story Priority").selectOption("Low");
  await form.getByLabel("Assign to").selectOption({ label: "Bugs Bunny (pa4_bugs_bunny)" });
  await form.getByRole("button", { name: "Create Story", exact: true }).click();
  const card = page.getByRole("article", { name: "Browser test story", exact: true });
  await expect(card).toContainText("To Do");
  await expect(card).toContainText("pa4_bugs_bunny");
  await expect(page.getByText("1 of 4 stories Done", { exact: true })).toBeVisible();
  await expectWorkload(page, "pa4_bugs_bunny", "3 assigned stories");
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  let edit = page.getByRole("form", { name: "Edit Story", exact: true });
  await edit.getByLabel("Story Title").fill("Unsaved title");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(page.getByRole("article", { name: "Unsaved title", exact: true })).toHaveCount(0);
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  edit = page.getByRole("form", { name: "Edit Story", exact: true });
  await edit.getByLabel("Story Status").selectOption("Done");
  await edit.getByLabel("Assign to").selectOption("");
  await edit.getByRole("button", { name: "Save Changes" }).click();
  await expect(card).toContainText("Done");
  await expect(card).toContainText("Unassigned");
  await expect(page.getByText("2 of 4 stories Done", { exact: true })).toBeVisible();
  await expect(progress).toHaveAttribute("value", "2");
  await expectWorkload(page, "pa4_bugs_bunny", "2 assigned stories");
  await page.reload();
  await login(page);
  await expect(card).toContainText("Done");
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Story Status").selectOption("To Do");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(card).toContainText("To Do");
  await expect(page.getByText("1 of 4 stories Done", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("1 of 3 stories Done", { exact: true })).toBeVisible();
  await expect(progress).toHaveAttribute("max", "3");
  await page.reload();
  await login(page);
  await expect(card).toHaveCount(0);
});

test("project changes clear editing and an old delayed response cannot replace the new backlog", async ({ page }) => {
  await login(page);
  await page.getByRole("article", { name: "Find 18 cowboys for the showers", exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Story Title").fill("Discard on switch");
  await page.getByRole("searchbox", { name: "Search stories" }).fill("cowboys");
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let requested;
  const reached = new Promise((resolve) => { requested = resolve; });
  await page.route("**/api/projects/*/stories", async (route) => {
    const response = await route.fetch();
    if (route.request().method() === "GET" && (await response.json()).stories.some((story) => story.title === "Inspect shower water pressure")) {
      requested();
      await gate;
    }
    await route.fulfill({ response }).catch(() => {});
  });
  await page.getByLabel("Backlog Project").selectOption({ label: "Ram Ranch Maintenance" });
  await reached;
  await expect(page.getByRole("form", { name: "Edit Story", exact: true })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search stories" })).toHaveValue("");
  await page.getByLabel("Backlog Project").selectOption({ label: "Ram Ranch Showers" });
  await expect(page.getByRole("article", { name: "Find 18 cowboys for the showers", exact: true })).toBeVisible();
  release();
  await expect(page.getByRole("article", { name: "Inspect shower water pressure", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Story Title")).toHaveValue("");
  await page.unrouteAll({ behavior: "wait" });
  await expect(page.getByRole("article", { name: "Find 18 cowboys for the showers", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Inspect shower water pressure", exact: true })).toHaveCount(0);
  await page.getByLabel("Backlog Project").selectOption({ label: "Ram Ranch Maintenance" });
  await expect(page.getByRole("article", { name: "Inspect shower water pressure", exact: true })).toBeVisible();
  const options = page.getByRole("combobox", { name: "Assign to", exact: true }).locator("option");
  await expect(options).toHaveText(["Unassigned", "Daffy Duck (pa4_daffy_duck)", "Foghorn Leghorn (pa4_foghorn_leghorn)"]);
  await expect(page.getByText("1 of 2 stories Done", { exact: true })).toBeVisible();
  await expectWorkload(page, "pa4_foghorn_leghorn", "0 assigned stories");
});

test("title, priority, status, and assignee filters combine without changing project totals", async ({ page }) => {
  await login(page);
  const search = page.getByRole("searchbox", { name: "Search stories" });
  const priority = page.getByRole("combobox", { name: "Priority", exact: true });
  const status = page.getByRole("combobox", { name: "Status", exact: true });
  const assignee = page.getByRole("combobox", { name: "Assigned to", exact: true });
  const cards = page.getByRole("article");
  const summary = page.getByRole("region", { name: "Project progress", exact: true });
  await expect(cards).toHaveCount(3);
  await expect(priority).toHaveValue("");
  await expect(status).toHaveValue("");
  await expect(assignee).toHaveValue("");
  await expect(summary.getByRole("term")).toHaveText(["To Do", "In Progress", "Done"]);
  await expect(summary.getByRole("definition")).toHaveText(["1", "1", "1"]);
  await search.fill("  18 COWBOYS  ");
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("aria-label", "Find 18 cowboys for the showers");
  await search.fill("");
  await priority.selectOption("Low");
  await status.selectOption("Done");
  await assignee.selectOption({ label: "Bugs Bunny (pa4_bugs_bunny)" });
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("aria-label", "Stock clean towels");
  await expect(page.getByText("Showing 1 of 3 stories", { exact: true })).toBeVisible();
  await expect(summary).toContainText("1 of 3 stories Done");
  await expectWorkload(page, "pa4_bugs_bunny", "2 assigned stories");
  await assignee.selectOption("unassigned");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("Nothing matches just yet. Try another search or clear the filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(priority).toHaveValue("");
  await expect(status).toHaveValue("");
  await expect(assignee).toHaveValue("");
  await status.selectOption("In Progress");
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("aria-label", "Recruit a shower cleanup crew");
  await status.selectOption("");
  await assignee.selectOption({ label: "Bugs Bunny (pa4_bugs_bunny)" });
  await expect(cards).toHaveCount(2);
  await page.getByLabel("Backlog Project").selectOption({ label: "Ram Ranch Maintenance" });
  await expect(assignee).toHaveValue("");
  await expect(cards).toHaveCount(2);
  await assignee.selectOption("unassigned");
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute("aria-label", "Track shower supply levels");
  await expect(assignee.locator("option")).toHaveText(["Anyone", "Unassigned", "Daffy Duck (pa4_daffy_duck)", "Foghorn Leghorn (pa4_foghorn_leghorn)"]);
});

test("validation and blocked removal show useful errors", async ({ page }) => {
  await login(page);
  await page.getByLabel("Story Title").fill("   ");
  await page.getByLabel("Story Description").fill("As a ranch coordinator, I want feedback, so that I can fix my request.");
  await page.getByRole("button", { name: "Create Story", exact: true }).click();
  await expect(page.getByText("Give your story a title and a few details, then try again.")).toBeVisible();
  await openProjects(page);
  const member = page.locator(".member-item").filter({ hasText: "pa4_bugs_bunny" });
  await member.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText(/They still have stories here\./)).toBeVisible();
  await expect(member).toBeVisible();
  await expect(member.getByText("2 assigned stories", { exact: true })).toBeVisible();
  await expect(member.getByText("To remove this person, give their stories to someone else, leave them unassigned, or delete them.")).toBeVisible();
  await page.getByLabel("Add someone").selectOption({ label: "Daffy Duck (pa4_daffy_duck)" });
  await page.getByRole("button", { name: "Add to Team", exact: true }).click();
  await openBacklog(page);
  const assigneeOptions = page.getByRole("combobox", { name: "Assign to", exact: true }).locator("option");
  await expect(assigneeOptions).toHaveText(["Unassigned", "Foghorn Leghorn (pa4_foghorn_leghorn)", "Bugs Bunny (pa4_bugs_bunny)", "Daffy Duck (pa4_daffy_duck)"]);
  await openProjects(page);
  await page.locator(".member-item").filter({ hasText: "pa4_daffy_duck" }).getByRole("button", { name: "Remove", exact: true }).click();
  await openBacklog(page);
  await expect(assigneeOptions).toHaveText(["Unassigned", "Foghorn Leghorn (pa4_foghorn_leghorn)", "Bugs Bunny (pa4_bugs_bunny)"]);
});

test("no project, empty backlog, and load errors have visible states", async ({ page }) => {
  await page.route("**/api/projects", (route) => route.fulfill({ json: { projects: [] } }));
  await page.goto("/");
  await page.getByRole("tab", { name: "Log In", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill("pa4_foghorn_leghorn");
  await page.getByLabel("Password", { exact: true }).fill("PA4-demo-2026!");
  await page.getByRole("button", { name: "Log In", exact: true }).click();
  await openBacklog(page);
  await expect(page.getByText("Pick a project above, or start one in Projects & Memberships.")).toBeVisible();
  await page.unrouteAll();
  await page.route("**/api/projects/*/stories", (route) => route.fulfill({ json: { stories: [] } }));
  await login(page, false);
  await expect(page.getByText("No stories yet. Add one to get things going.")).toBeVisible();
  await expect(page.getByText("0 of 0 stories Done", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Project completion" })).toHaveAttribute("value", "0");
  await page.unrouteAll();
  await page.route("**/api/projects/*/stories", (route) => route.fulfill({ status: 500, json: { message: "Backlog temporarily unavailable." } }));
  await page.getByRole("button", { name: "Refresh Backlog" }).click();
  await expect(page.getByText("Backlog temporarily unavailable.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Story", exact: true })).toBeDisabled();
  await expect(page.getByRole("searchbox", { name: "Search stories" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Project progress", exact: true })).toHaveCount(0);
  await expectWorkload(page, "pa4_bugs_bunny", "Couldn't load story counts. Try refreshing the backlog.");
});

test("workspace tabs keep account compact, projects wide, and project selection shared", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page, false, false);
  const projectsTab = page.getByRole("tab", { name: "Projects & Memberships", exact: true });
  const backlogTab = page.getByRole("tab", { name: "Project Backlog", exact: true });
  const projects = page.getByRole("region", { name: "Create Project", exact: true });
  const members = page.getByRole("region", { name: "Memberships", exact: true });
  const backlog = page.getByRole("region", { name: "Project Backlog", exact: true });
  const account = page.getByRole("region", { name: "Signed In", exact: true });
  await expect(projectsTab).toHaveAttribute("aria-selected", "true");
  await expect(projects).toBeVisible();
  await expect(members).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Project Lead", exact: true }).locator("option")).toHaveCount(19);
  await expect(backlog).toBeHidden();
  await expect(account.getByText("ICSI 418Y PA4", { exact: true })).toBeVisible();
  const accountBox = await account.boundingBox();
  const projectsBox = await projects.boundingBox();
  const membersBox = await members.boundingBox();
  expect(accountBox.height).toBeLessThan(160);
  expect(accountBox.width).toBeLessThan(440);
  expect(accountBox.y).toBeLessThan(projectsBox.y);
  expect(accountBox.x).toBeLessThanOrEqual(projectsBox.x + 1);
  expect(projectsBox.width).toBeGreaterThan(membersBox.width * 1.5);
  expect(membersBox.x).toBeGreaterThan(projectsBox.x + projectsBox.width);
  await expect(page.locator(".member-item").filter({ hasText: "pa4_bugs_bunny" }).getByText("2 assigned stories", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("projects-desktop.png"), fullPage: true });
  await openBacklog(page);
  await expect(projects).toBeHidden();
  await expect(members).toBeHidden();
  await expect(backlog).toBeVisible();
  await expect(page.getByRole("article", { name: "Find 18 cowboys for the showers", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("backlog-desktop.png"), fullPage: true });
  await page.getByRole("article", { name: "Find 18 cowboys for the showers", exact: true }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Story Title").fill("Draft stays between tabs");
  await page.getByRole("searchbox", { name: "Search stories" }).fill("cowboys");
  await openProjects(page);
  await openBacklog(page);
  await expect(page.getByLabel("Story Title")).toHaveValue("Draft stays between tabs");
  await expect(page.getByRole("searchbox", { name: "Search stories" })).toHaveValue("cowboys");
  await page.getByLabel("Backlog Project").selectOption({ label: "Ram Ranch Maintenance" });
  await expect(page.getByRole("form", { name: "Edit Story", exact: true })).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search stories" })).toHaveValue("");
  const selectedId = await page.getByLabel("Backlog Project").inputValue();
  await backlogTab.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(projectsTab).toHaveAttribute("aria-selected", "true");
  await expect(projects).toBeVisible();
  await expect(page.getByLabel("Selected Project")).toHaveValue(selectedId);
  await page.keyboard.press("End");
  await expect(backlogTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(projectsTab).toHaveAttribute("aria-selected", "true");
});

test("mobile backlog fits viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await openProjects(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Log Out" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
