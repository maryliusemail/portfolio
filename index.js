import { fetchJSON, fetchGitHubData, renderProjects } from "./global.js";

const projects = await fetchJSON("./lib/projects.json");
const latestProjects = projects.slice(0, 3);
const projectsContainer = document.querySelector(".projects");
const profileStats = document.querySelector("#profile-stats");
const githubData = await fetchGitHubData("maryliusemail");

renderProjects(latestProjects, projectsContainer, "h2");

if (githubData && profileStats) {
  profileStats.innerHTML = `
    <dl>
      <dt>Followers</dt>
      <dd>${githubData.followers}</dd>
      <dt>Following</dt>
      <dd>${githubData.following}</dd>
      <dt>Public Repos</dt>
      <dd>${githubData.public_repos}</dd>
      <dt>Public Gists</dt>
      <dd>${githubData.public_gists}</dd>
    </dl>
  `;
}
