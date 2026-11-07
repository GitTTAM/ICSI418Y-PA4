import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "./api.js";

const priorities = ["High", "Medium", "Low"];
const statuses = ["To Do", "In Progress", "Done"];
const emptyStory = { title: "", description: "", priority: "Medium", assigned_user_id: "" };
const emptyFilters = { search: "", priority: "", status: "", assignee: "" };

function Message({ message }) {
  return message ? <p className={`form-message ${message.type}`} role="status">{message.text}</p> : null;
}

export default function ProjectBacklog({ project, projects, onProjectChange, membershipRevision, formatUser, onWorkloadChange }) {
  const [stories, setStories] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(emptyStory);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const alive = useRef(false);
  const projectId = project?._id;

  const { statusCounts, assignmentCounts } = useMemo(() => {
    const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0]));
    const assignmentCounts = {};
    for (const story of stories) {
      statusCounts[story.status] += 1;
      if (story.assigned_user_id) {
        assignmentCounts[story.assigned_user_id] = (assignmentCounts[story.assigned_user_id] || 0) + 1;
      }
    }
    return { statusCounts, assignmentCounts };
  }, [stories]);

  useEffect(() => {
    onWorkloadChange({
      projectId,
      counts: assignmentCounts,
      status: loading ? "loading" : loadError ? "error" : "ready"
    });
  }, [projectId, assignmentCounts, loading, loadError, onWorkloadChange]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!projectId) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiRequest(`/projects/${projectId}/stories`, { signal: controller.signal }),
      apiRequest(`/projects/${projectId}/memberships`, { signal: controller.signal })
    ]).then(([backlog, team]) => {
      if (controller.signal.aborted) return;
      setStories(backlog.stories);
      const currentMembers = team.memberships.map((membership) => membership.user_id).filter(Boolean);
      setMembers(currentMembers);
      setFilters((current) => current.assignee && current.assignee !== "unassigned"
        && !currentMembers.some((member) => member._id === current.assignee)
        ? { ...current, assignee: "" } : current);
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError({ type: "error", text: error.message });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [projectId, membershipRevision, revision]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyStory);
  }

  function editStory(story) {
    setEditingId(story._id);
    setMessage(null);
    setForm({
      title: story.title,
      description: story.description,
      priority: story.priority,
      status: story.status,
      assigned_user_id: story.assigned_user_id || ""
    });
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  async function saveStory(event) {
    event.preventDefault();
    setMessage(null);
    if (!form.title.trim() || !form.description.trim()) {
      setMessage({ type: "error", text: "Give your story a title and a few details, then try again." });
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest(`/projects/${projectId}/stories${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PUT" : "POST",
        body: { ...form, assigned_user_id: form.assigned_user_id || null }
      });
      if (!alive.current) return;
      resetForm();
      setMessage({ type: "success", text: data.message });
      setRevision((current) => current + 1);
    } catch (error) {
      if (alive.current) setMessage({ type: "error", text: error.message });
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function deleteStory(story) {
    if (!window.confirm(`Delete "${story.title}"? You can't undo this.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await apiRequest(`/projects/${projectId}/stories/${story._id}`, { method: "DELETE" });
      if (!alive.current) return;
      if (editingId === story._id) resetForm();
      setMessage({ type: "success", text: data.message });
      setRevision((current) => current + 1);
    } catch (error) {
      if (alive.current) setMessage({ type: "error", text: error.message });
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const disabled = busy || loading || Boolean(loadError);
  const search = filters.search.trim().toLowerCase();
  const visibleStories = stories.filter((story) =>
    story.title.toLowerCase().includes(search)
    && (!filters.priority || story.priority === filters.priority)
    && (!filters.status || story.status === filters.status)
    && (!filters.assignee || (filters.assignee === "unassigned"
      ? !story.assigned_user_id : story.assigned_user_id === filters.assignee))
  );
  const completionPercent = stories.length ? Math.round(statusCounts.Done / stories.length * 100) : 0;

  return (
    <section className="panel backlog-panel" aria-labelledby="backlog-title">
      <div className="panel-heading section-heading">
        <div>
          <h2 id="backlog-title">Project Backlog</h2>
          <p>{project ? project.name : "Pick a project and see what's on the list."}</p>
        </div>
        {project ? <button className="ghost-button compact-button" type="button" disabled={busy || loading}
          onClick={() => setRevision((current) => current + 1)}>Refresh Backlog</button> : null}
      </div>
      <label className="backlog-project-picker">
        <span>Backlog Project</span>
        <select value={projectId || ""} onChange={(event) => onProjectChange(event.target.value)}>
          <option value="">Choose a project</option>
          {projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}
        </select>
      </label>
      {!project ? <p className="empty-text">Pick a project above, or start one in Projects &amp; Memberships.</p> : (
        <>
          <Message message={loadError} />
          <Message message={message} />
          {!loading && !loadError ? (
            <section className="progress-summary" aria-label="Project progress">
              <div className="progress-heading">
                <strong>{statusCounts.Done} of {stories.length} {stories.length === 1 ? "story" : "stories"} Done</strong>
                <span>{completionPercent}%</span>
              </div>
              <progress aria-label="Project completion" value={statusCounts.Done} max={Math.max(stories.length, 1)}
                aria-valuetext={`${statusCounts.Done} of ${stories.length} stories Done`} />
              <dl className="status-counts">
                {statuses.map((status) => <div key={status}><dt>{status}</dt><dd>{statusCounts[status]}</dd></div>)}
              </dl>
            </section>
          ) : null}
          <div className="backlog-layout">
            <form className="story-form" aria-label={editingId ? "Edit Story" : "Create Story"} onSubmit={saveStory}>
              <h3>{editingId ? "Edit Story" : "Create Story"}</h3>
              <fieldset disabled={disabled}>
                <label><span>Story Title</span>
                  <input name="title" value={form.title} onChange={updateField} required />
                </label>
                <label><span>Story Description</span>
                  <textarea name="description" rows="4" value={form.description} onChange={updateField} required />
                </label>
                <div className="form-row">
                  <label><span>Story Priority</span>
                    <select name="priority" value={form.priority} onChange={updateField} required>
                      {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                  </label>
                  <label><span>Assign to</span>
                    <select name="assigned_user_id" value={form.assigned_user_id} onChange={updateField}>
                      <option value="">Unassigned</option>
                      {members.map((member) => <option key={member._id} value={member._id}>{formatUser(member)}</option>)}
                    </select>
                  </label>
                </div>
                {editingId ? <label><span>Story Status</span>
                  <select name="status" value={form.status} onChange={updateField}>
                    {statuses.map((status) => <option key={status}>{status}</option>)}
                  </select>
                </label> : <p className="empty-text story-hint">We'll start this story in To Do. You can change that later.</p>}
                <div className="story-actions">
                  <button className="primary-button" type="submit">{busy ? "Saving..." : editingId ? "Save Changes" : "Create Story"}</button>
                  {editingId ? <button className="ghost-button" type="button" onClick={resetForm}>Cancel</button> : null}
                </div>
              </fieldset>
            </form>
            <div className="backlog-stories">
              <fieldset className="backlog-filters" disabled={disabled}>
                <legend>Find stories</legend>
                <label><span>Search stories</span>
                  <input type="search" name="search" value={filters.search} onChange={updateFilter} placeholder="Search by title" />
                </label>
                <div className="story-filter-row">
                  <label><span>Priority</span>
                    <select name="priority" value={filters.priority} onChange={updateFilter}>
                      <option value="">All priorities</option>
                      {priorities.map((priority) => <option key={priority}>{priority}</option>)}
                    </select>
                  </label>
                  <label><span>Status</span>
                    <select name="status" value={filters.status} onChange={updateFilter}>
                      <option value="">All statuses</option>
                      {statuses.map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                  <label><span>Assigned to</span>
                    <select name="assignee" value={filters.assignee} onChange={updateFilter}>
                      <option value="">Anyone</option>
                      <option value="unassigned">Unassigned</option>
                      {members.map((member) => <option key={member._id} value={member._id}>{formatUser(member)}</option>)}
                    </select>
                  </label>
                </div>
                {!loading && !loadError ? <div className="filter-summary">
                  <p className="empty-text" role="status">Showing {visibleStories.length} of {stories.length} stories</p>
                  <button className="ghost-button compact-button" type="button"
                    disabled={!Object.values(filters).some(Boolean)} onClick={() => setFilters(emptyFilters)}>Clear filters</button>
                </div> : null}
              </fieldset>
              <div className="story-list" aria-label="Saved stories" aria-busy={loading}>
                {loading ? <p className="empty-text" role="status">Getting your stories and team...</p> : null}
                {!loading && !loadError && stories.length === 0 ? <p className="empty-text">No stories yet. Add one to get things going.</p> : null}
                {!loading && !loadError && stories.length > 0 && visibleStories.length === 0
                  ? <p className="empty-text">Nothing matches just yet. Try another search or clear the filters.</p> : null}
                {!loading && !loadError ? visibleStories.map((story) => (
                  <article className={story._id === editingId ? "story-card is-editing" : "story-card"} key={story._id}
                    aria-label={story.title}>
                    <div className="story-heading"><h3>{story.title}</h3>
                      <span className={`story-priority priority-${story.priority.toLowerCase()}`}>{story.priority}</span>
                    </div>
                    <p className="story-description">{story.description}</p>
                    <dl className="story-meta">
                      <div><dt>Status</dt><dd>{story.status}</dd></div>
                      <div><dt>Assigned to</dt><dd>{story.assigned_user ? formatUser(story.assigned_user) : "Unassigned"}</dd></div>
                    </dl>
                    <div className="story-actions">
                      <button className="ghost-button compact-button" type="button" disabled={disabled} onClick={() => editStory(story)}>Edit</button>
                      <button className="danger-button compact-button" type="button" disabled={disabled} onClick={() => deleteStory(story)}>Delete</button>
                    </div>
                  </article>
                )) : null}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
