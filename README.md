# PA4 - User Stories and Project Backlog

PA4 builds on PA3's accounts, projects, and teams by adding user stories and project backlogs.

Create, edit, prioritize, and assign stories, then track them with statuses, progress bars, workload counts, and filters. Before removing a team member, reassign, unassign, or delete their assigned stories, including those marked Done. All changes are saved in MongoDB.

With Node.js installed, follow these steps from the project folder:

1. Run npm install and npm run setup.
2. Copy server/.env.example to server/.env. Set MONGO_URI to your MongoDB connection string, and make sure the database is available.
3. Run npm run seed to prepare 18 demo users, two projects, and five stories covering all priorities and statuses, with assigned and unassigned stories. Existing work is kept.
4. Run npm run dev and open [localhost:5173](http://localhost:5173).
