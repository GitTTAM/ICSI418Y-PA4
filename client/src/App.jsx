import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "./api.js";
import ProjectBacklog from "./ProjectBacklog.jsx";
import "./App.css";

const STATUS_OPTIONS = ["Planning", "Active", "Completed"];
const WORKSPACE_TABS = [
  { id: "projects", label: "Projects & Memberships" },
  { id: "backlog", label: "Project Backlog" }
];

const emptySignup = {
  f_name: "",
  l_name: "",
  username: "",
  password: ""
};

const emptyLogin = {
  username: "",
  password: ""
};

const emptyProject = {
  name: "",
  description: "",
  status: "Planning",
  project_lead_id: ""
};

function hasEmptyField(values) {
  return Object.values(values).some((value) => value.trim() === "");
}

function formatUser(user) {
  if (!user) {
    return "Unknown user";
  }

  const firstName = user.f_name?.trim() || "";
  const lastName = user.l_name?.trim() || "";
  const username = user.username?.trim() || "";
  const visibleParts = [];

  [firstName, lastName].forEach((part) => {
    if (part && !visibleParts.some((visiblePart) => visiblePart.toLowerCase() === part.toLowerCase())) {
      visibleParts.push(part);
    }
  });

  const displayName = visibleParts.join(" ");

  if (!username) {
    return displayName || "Unknown user";
  }

  if (!displayName || displayName.toLowerCase() === username.toLowerCase()) {
    return username;
  }

  return `${displayName} (${username})`;
}

function App() {
  const [activeForm, setActiveForm] = useState("signup");
  const [workspaceTab, setWorkspaceTab] = useState("projects");
  const [signupForm, setSignupForm] = useState(emptySignup);
  const [loginForm, setLoginForm] = useState(emptyLogin);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [signupMessage, setSignupMessage] = useState(null);
  const [loginMessage, setLoginMessage] = useState(null);
  const [projectMessage, setProjectMessage] = useState(null);
  const [membershipMessage, setMembershipMessage] = useState(null);
  const [dataMessage, setDataMessage] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [memberUserId, setMemberUserId] = useState("");
  const [projectView, setProjectView] = useState("all");
  const [isSignupLoading, setIsSignupLoading] = useState(false);
  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [isMemberLoading, setIsMemberLoading] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [membershipRevision, setMembershipRevision] = useState(0);
  const [projectWorkload, setProjectWorkload] = useState(null);
  const activeProjectId = useRef(selectedProjectId);
  activeProjectId.current = selectedProjectId;

  const visibleProjects = useMemo(() => {
    if (projectView !== "mine" || !loggedInUser) {
      return projects;
    }

    return projects.filter((project) => {
      const isLead = project.project_lead_id === loggedInUser._id;
      const isMember = (project.member_ids || []).includes(loggedInUser._id);

      return isLead || isMember;
    });
  }, [loggedInUser, projectView, projects]);

  const selectedProject = useMemo(
    () => visibleProjects.find((project) => project._id === selectedProjectId) || null,
    [selectedProjectId, visibleProjects]
  );

  const selectedMemberIds = useMemo(
    () => new Set(memberships.map((membership) => membership.user_id?._id).filter(Boolean)),
    [memberships]
  );

  useEffect(() => {
    const controller = new AbortController();
    setMemberships([]);
    setMemberUserId("");
    setMembershipMessage(null);
    if (loggedInUser && selectedProjectId) {
      loadMemberships(selectedProjectId, controller.signal);
    }
    return () => controller.abort();
  }, [loggedInUser, selectedProjectId]);

  useEffect(() => {
    if (!loggedInUser) {
      return;
    }

    if (visibleProjects.length === 0) {
      setSelectedProjectId("");
      return;
    }

    if (!selectedProjectId || !visibleProjects.some((project) => project._id === selectedProjectId)) {
      setSelectedProjectId(visibleProjects[0]._id);
    }
  }, [loggedInUser, selectedProjectId, visibleProjects]);

  function clearProjectWorkspace() {
    setWorkspaceTab("projects");
    setProjectForm(emptyProject);
    setProjectMessage(null);
    setMembershipMessage(null);
    setDataMessage(null);
    setUsers([]);
    setProjects([]);
    setMemberships([]);
    setSelectedProjectId("");
    setProjectWorkload(null);
    setMemberUserId("");
    setProjectView("all");
    setIsDataLoading(false);
  }

  async function loadWorkspaceData(preferredProjectId) {
    setIsDataLoading(true);
    setDataMessage(null);

    try {
      const [usersData, projectsData] = await Promise.all([
        apiRequest("/users"),
        apiRequest("/projects")
      ]);

      const loadedProjects = projectsData.projects || [];
      setUsers(usersData.users || []);
      setProjects(loadedProjects);

      setSelectedProjectId((currentProjectId) => {
        if (preferredProjectId) {
          return preferredProjectId;
        }

        if (loadedProjects.some((project) => project._id === currentProjectId)) {
          return currentProjectId;
        }

        return loadedProjects[0]?._id || "";
      });
    } catch (error) {
      setDataMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setIsDataLoading(false);
    }
  }

  async function loadMemberships(projectId, signal) {
    setMembershipMessage(null);

    try {
      const data = await apiRequest(`/projects/${projectId}/memberships`, { signal });
      if (signal?.aborted || activeProjectId.current !== projectId) return;
      setMemberships(data.memberships || []);
    } catch (error) {
      if (signal?.aborted || activeProjectId.current !== projectId) return;
      setMemberships([]);
      setMembershipMessage({
        type: "error",
        text: error.message
      });
    }
  }

  function updateSignupField(event) {
    const { name, value } = event.target;
    setSignupForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  function updateLoginField(event) {
    const { name, value } = event.target;
    setLoginForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  function updateProjectField(event) {
    const { name, value } = event.target;
    setProjectForm((currentForm) => ({
      ...currentForm,
      [name]: value
    }));
  }

  async function submitSignup(event) {
    event.preventDefault();
    setSignupMessage(null);

    if (hasEmptyField(signupForm)) {
      setSignupMessage({
        type: "error",
        text: "Add your name, username, and password to get started."
      });
      return;
    }

    setIsSignupLoading(true);

    try {
      const data = await apiRequest("/signup", {
        method: "POST",
        body: signupForm
      });
      setSignupMessage({
        type: "success",
        text: data.message
      });
      setSignupForm(emptySignup);

      if (loggedInUser) {
        await loadWorkspaceData();
      }
    } catch (error) {
      setSignupMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setIsSignupLoading(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginMessage(null);

    if (hasEmptyField(loginForm)) {
      setLoginMessage({
        type: "error",
        text: "Enter your username and password to log in."
      });
      return;
    }

    setIsLoginLoading(true);

    try {
      const data = await apiRequest("/login", {
        method: "POST",
        body: loginForm
      });
      setLoginMessage({
        type: "success",
        text: data.message
      });
      setLoggedInUser(data.user);
      setWorkspaceTab("projects");
      setLoginForm(emptyLogin);
      await loadWorkspaceData();
    } catch (error) {
      setLoginMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setIsLoginLoading(false);
    }
  }

  function logout() {
    setLoggedInUser(null);
    setLoginMessage({
      type: "success",
      text: "You're logged out. See you next time."
    });
    setActiveForm("login");
    clearProjectWorkspace();
  }

  function navigateWorkspaceTabs(event) {
    const index = WORKSPACE_TABS.findIndex((tab) => tab.id === workspaceTab);
    const nextIndex = {
      ArrowRight: (index + 1) % WORKSPACE_TABS.length,
      ArrowLeft: (index + WORKSPACE_TABS.length - 1) % WORKSPACE_TABS.length,
      Home: 0,
      End: WORKSPACE_TABS.length - 1
    }[event.key];
    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextTab = WORKSPACE_TABS[nextIndex].id;
    setWorkspaceTab(nextTab);
    document.getElementById(`workspace-${nextTab}-tab`).focus();
  }

  async function submitProject(event) {
    event.preventDefault();
    setProjectMessage(null);

    if (!loggedInUser) {
      setProjectMessage({
        type: "error",
        text: "Log in to create a project."
      });
      return;
    }

    if (hasEmptyField(projectForm)) {
      setProjectMessage({
        type: "error",
        text: "Add the missing project details, then try again."
      });
      return;
    }

    setIsProjectLoading(true);

    try {
      const data = await apiRequest("/projects", {
        method: "POST",
        body: projectForm
      });
      setProjectMessage({
        type: "success",
        text: data.message
      });
      setProjectForm(emptyProject);
      await loadWorkspaceData(data.project._id);
    } catch (error) {
      setProjectMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setIsProjectLoading(false);
    }
  }

  async function addMember(event) {
    event.preventDefault();
    setMembershipMessage(null);

    if (!loggedInUser) {
      setMembershipMessage({
        type: "error",
        text: "Log in to update the team."
      });
      return;
    }

    if (!selectedProjectId) {
      setMembershipMessage({
        type: "error",
        text: "Choose a project to add someone."
      });
      return;
    }

    if (!memberUserId) {
      setMembershipMessage({
        type: "error",
        text: "Choose someone to add to the team."
      });
      return;
    }

    setIsMemberLoading(true);

    try {
      const data = await apiRequest(`/projects/${selectedProjectId}/memberships`, {
        method: "POST",
        body: {
          user_id: memberUserId
        }
      });
      if (activeProjectId.current !== selectedProjectId) return;
      setMembershipMessage({
        type: "success",
        text: data.message
      });
      setMemberUserId("");
      setMemberships(data.memberships || []);
      setMembershipRevision((current) => current + 1);
      await loadWorkspaceData();
    } catch (error) {
      if (activeProjectId.current !== selectedProjectId) return;
      setMembershipMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setIsMemberLoading(false);
    }
  }

  async function removeMember(userId) {
    setMembershipMessage(null);
    setIsMemberLoading(true);

    try {
      const data = await apiRequest(`/projects/${selectedProjectId}/memberships/${userId}`, {
        method: "DELETE"
      });
      if (activeProjectId.current !== selectedProjectId) return;
      setMembershipMessage({
        type: "success",
        text: data.message
      });
      setMemberships(data.memberships || []);
      setMembershipRevision((current) => current + 1);
      await loadWorkspaceData();
    } catch (error) {
      if (activeProjectId.current !== selectedProjectId) return;
      setMembershipMessage({
        type: "error",
        text: error.message
      });
    } finally {
      setIsMemberLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className={loggedInUser ? "app-header is-signed-in" : "app-header"}>
        {loggedInUser ? (
          <section className="panel account-summary" aria-labelledby="account-title">
            <p className="course-label">ICSI 418Y PA4</p>
            <div className="account-row">
              <div className="account-details">
                <h2 id="account-title">Signed In</h2>
                <p>Signed in as {formatUser(loggedInUser)}</p>
              </div>
              <button className="ghost-button compact-button" type="button" onClick={logout}>Log Out</button>
            </div>
          </section>
        ) : null}
        <div className="workspace-heading">
          {!loggedInUser ? <p className="course-label">ICSI 418Y PA4</p> : null}
          <h1>Projects and Backlogs</h1>
        </div>
      </header>

      <div className={loggedInUser ? "workspace" : "workspace-grid is-auth-only"}>
        {!loggedInUser ? (
        <section className="panel auth-panel" aria-labelledby="auth-title">
          <div className="panel-heading">
            <h2 id="auth-title">Welcome</h2>
            <p>Create an account or log in to get started.</p>
          </div>

          <div className="tabs" role="tablist" aria-label="Authentication forms">
            <button
              className={activeForm === "signup" ? "tab is-active" : "tab"}
              type="button"
              role="tab"
              aria-selected={activeForm === "signup"}
              onClick={() => setActiveForm("signup")}
            >
              Sign Up
            </button>
            <button
              className={activeForm === "login" ? "tab is-active" : "tab"}
              type="button"
              role="tab"
              aria-selected={activeForm === "login"}
              onClick={() => setActiveForm("login")}
            >
              Log In
            </button>
          </div>

          {activeForm === "signup" ? (
            <form className="auth-form" onSubmit={submitSignup}>
              <label>
                <span>First Name</span>
                <input
                  name="f_name"
                  type="text"
                  value={signupForm.f_name}
                  onChange={updateSignupField}
                  autoComplete="given-name"
                />
              </label>

              <label>
                <span>Last Name</span>
                <input
                  name="l_name"
                  type="text"
                  value={signupForm.l_name}
                  onChange={updateSignupField}
                  autoComplete="family-name"
                />
              </label>

              <label>
                <span>Username</span>
                <input
                  name="username"
                  type="text"
                  value={signupForm.username}
                  onChange={updateSignupField}
                  autoComplete="username"
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  value={signupForm.password}
                  onChange={updateSignupField}
                  autoComplete="new-password"
                />
              </label>

              <button className="primary-button" type="submit" disabled={isSignupLoading}>
                {isSignupLoading ? "Creating..." : "Create Account"}
              </button>

              {signupMessage ? (
                <p className={`form-message ${signupMessage.type}`} aria-live="polite">
                  {signupMessage.text}
                </p>
              ) : null}
            </form>
          ) : (
            <form className="auth-form" onSubmit={submitLogin}>
              <label>
                <span>Username</span>
                <input
                  name="username"
                  type="text"
                  value={loginForm.username}
                  onChange={updateLoginField}
                  autoComplete="username"
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  name="password"
                  type="password"
                  value={loginForm.password}
                  onChange={updateLoginField}
                  autoComplete="current-password"
                />
              </label>

              <button className="primary-button" type="submit" disabled={isLoginLoading}>
                {isLoginLoading ? "Logging in..." : "Log In"}
              </button>

              {loginMessage ? (
                <p className={`form-message ${loginMessage.type}`} aria-live="polite">
                  {loginMessage.text}
                </p>
              ) : null}
            </form>
          )}
        </section>
        ) : null}

        {loggedInUser ? (
          <>
        <div className="workspace-tabs" role="tablist" aria-label="Workspace" onKeyDown={navigateWorkspaceTabs}>
          {WORKSPACE_TABS.map((tab) => (
            <button key={tab.id} id={`workspace-${tab.id}-tab`} className={workspaceTab === tab.id ? "tab is-active" : "tab"}
              type="button" role="tab" aria-selected={workspaceTab === tab.id} aria-controls={`${tab.id}-tab-panel`}
              tabIndex={workspaceTab === tab.id ? 0 : -1} onClick={() => setWorkspaceTab(tab.id)}>{tab.label}</button>
          ))}
        </div>
        <div className="workspace-tab-panel" id="projects-tab-panel" role="tabpanel"
          aria-labelledby="workspace-projects-tab" hidden={workspaceTab !== "projects"}>
        <div className="project-membership-grid">
        <section className="panel project-panel" aria-labelledby="project-title">
          <div className="panel-heading">
            <h2 id="project-title">Create Project</h2>
            <p>Give it a name, add a few details, and pick who's leading.</p>
          </div>

          {dataMessage ? (
            <p className={`form-message ${dataMessage.type}`} aria-live="polite">
              {dataMessage.text}
            </p>
          ) : null}

          <form className="project-form" onSubmit={submitProject}>
            <label>
              <span>Name</span>
              <input name="name" type="text" value={projectForm.name} onChange={updateProjectField} />
            </label>

            <label>
              <span>Description</span>
              <textarea
                name="description"
                value={projectForm.description}
                onChange={updateProjectField}
                rows="4"
              />
            </label>

            <div className="form-row">
              <label>
                <span>Status</span>
                <select name="status" value={projectForm.status} onChange={updateProjectField}>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Project Lead</span>
                <select
                  name="project_lead_id"
                  value={projectForm.project_lead_id}
                  onChange={updateProjectField}
                >
                  <option value="">Choose someone</option>
                  {users.map((user) => (
                    <option key={user._id} value={user._id}>
                      {formatUser(user)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button className="primary-button" type="submit" disabled={isProjectLoading || users.length === 0}>
              {isProjectLoading ? "Saving..." : "Create Project"}
            </button>

            {projectMessage ? (
              <p className={`form-message ${projectMessage.type}`} aria-live="polite">
                {projectMessage.text}
              </p>
            ) : null}
          </form>

          <div className="list-section">
            <div className="section-heading">
              <h3>Projects</h3>
              <div className="section-actions">
                <div className="view-switch" role="group" aria-label="Project list view">
                  <button
                    className={projectView === "all" ? "switch-button is-active" : "switch-button"}
                    type="button"
                    onClick={() => setProjectView("all")}
                  >
                    All
                  </button>
                  <button
                    className={projectView === "mine" ? "switch-button is-active" : "switch-button"}
                    type="button"
                    onClick={() => setProjectView("mine")}
                  >
                    Mine
                  </button>
                </div>
                <button className="ghost-button compact-button" type="button" onClick={() => loadWorkspaceData()}>
                  Refresh
                </button>
              </div>
            </div>

            {isDataLoading ? <p className="empty-text">Loading projects...</p> : null}

            {!isDataLoading && visibleProjects.length === 0 ? (
              <p className="empty-text">
                {projectView === "mine" ? "You're not on any projects yet." : "No projects yet. Start one above."}
              </p>
            ) : null}

            <div className="project-list">
              {visibleProjects.map((project) => (
                <button
                  key={project._id}
                  className={project._id === selectedProjectId ? "project-item is-selected" : "project-item"}
                  type="button"
                  onClick={() => setSelectedProjectId(project._id)}
                >
                  <span className="project-name">{project.name}</span>
                  <span className={`status-badge status-${project.status.toLowerCase()}`}>
                    {project.status}
                  </span>
                  <span className="project-description">{project.description}</span>
                  <span className="project-meta">
                    Lead: {formatUser(project.project_lead)} · {project.member_count || 0}{" "}
                    {(project.member_count || 0) === 1 ? "member" : "members"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="panel membership-panel" aria-labelledby="membership-title">
          <div className="panel-heading">
            <h2 id="membership-title">Memberships</h2>
            <p>Who's on the team? Add people or make a few changes here.</p>
          </div>

          <label>
            <span>Selected Project</span>
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              <option value="">Choose a project</option>
              {visibleProjects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          {selectedProject ? (
            <div className="selected-project-summary">
              <strong>{selectedProject.name}</strong>
              <span>
                Lead: {formatUser(selectedProject.project_lead)} · {selectedProject.member_count || 0}{" "}
                {(selectedProject.member_count || 0) === 1 ? "member" : "members"}
              </span>
            </div>
          ) : null}

          <form className="member-form" onSubmit={addMember}>
            <label>
              <span>Add someone</span>
              <select value={memberUserId} onChange={(event) => setMemberUserId(event.target.value)}>
                <option value="">Choose someone</option>
                {users.map((user) => {
                  const isAlreadyMember = selectedMemberIds.has(user._id);

                  return (
                    <option key={user._id} value={user._id} disabled={isAlreadyMember}>
                      {formatUser(user)}
                      {isAlreadyMember ? " - already on team" : ""}
                    </option>
                  );
                })}
              </select>
            </label>

            <button
              className="primary-button"
              type="submit"
              disabled={isMemberLoading || !selectedProjectId || users.length === 0}
            >
              {isMemberLoading ? "Updating..." : "Add to Team"}
            </button>
          </form>

          {membershipMessage ? (
            <p className={`form-message ${membershipMessage.type}`} aria-live="polite">
              {membershipMessage.text}
            </p>
          ) : null}

          {selectedProject ? <p className="empty-text workload-note">Done stories count toward each person's total too.</p> : null}
          <div className="member-list">
            {selectedProjectId && memberships.length === 0 ? (
              <p className="empty-text">No members here yet.</p>
            ) : null}

            {memberships.map((membership) => {
              const user = membership.user_id;
              const isLead = selectedProject && user && user._id === selectedProject.project_lead_id;
              const workload = projectWorkload?.projectId === selectedProjectId ? projectWorkload : null;
              const assignedCount = workload?.status === "ready" ? workload.counts[user?._id] || 0 : null;

              return (
                <div className="member-item" key={membership._id}>
                  <div>
                    <strong>{formatUser(user)}</strong>
                    <span>{isLead ? "Project Lead" : "Member"}</span>
                    <span className="member-workload">{assignedCount === null
                      ? workload?.status === "error" ? "Couldn't load story counts. Try refreshing the backlog." : "Checking story counts..."
                      : `${assignedCount} assigned ${assignedCount === 1 ? "story" : "stories"}`}</span>
                    {!isLead && assignedCount > 0 ? <small className="member-removal-hint">
                      To remove this person, give their stories to someone else, leave them unassigned, or delete them.
                    </small> : null}
                  </div>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={!user || isLead || isMemberLoading}
                    onClick={() => {
                      if (user) {
                        removeMember(user._id);
                      }
                    }}
                  >
                    {isLead ? "Team Lead" : "Remove"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        </div>
        </div>
        <div className="workspace-tab-panel" id="backlog-tab-panel" role="tabpanel"
          aria-labelledby="workspace-backlog-tab" hidden={workspaceTab !== "backlog"}>
        <ProjectBacklog key={selectedProjectId || "no-project"} project={selectedProject}
          projects={visibleProjects} onProjectChange={setSelectedProjectId}
          membershipRevision={membershipRevision} formatUser={formatUser} onWorkloadChange={setProjectWorkload} />
        </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

export default App;
