import { fetchJSON, renderProjects } from "../global.js";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

const projects = await fetchJSON("../lib/projects.json");
const projectsTitle = document.querySelector(".projects-title");
const projectsContainer = document.querySelector(".projects");
const searchInput = document.querySelector(".searchBar");
let query = "";
let selectedYear = null;

projectsTitle.textContent = `${projects.length} Projects`;
let colors = d3.scaleOrdinal(d3.schemeTableau10);

function projectMatchesQuery(project) {
  let values = Object.values(project).join("\n").toLowerCase();
  return values.includes(query.toLowerCase());
}

function getFilteredProjects() {
  let filteredProjects = projects.filter(projectMatchesQuery);

  if (selectedYear) {
    filteredProjects = filteredProjects.filter(
      (project) => project.year === selectedYear,
    );
  }

  return filteredProjects;
}

function render() {
  let searchedProjects = projects.filter(projectMatchesQuery);

  if (
    selectedYear &&
    !searchedProjects.some((project) => project.year === selectedYear)
  ) {
    selectedYear = null;
  }

  renderProjects(getFilteredProjects(), projectsContainer, "h2");
  renderPieChart(searchedProjects);
}

function renderPieChart(projectsGiven) {
  let newSvg = d3.select("#projects-pie-plot");
  let legend = d3.select(".legend");

  newSvg.selectAll("path").remove();
  legend.selectAll("li").remove();

  let arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  let newRolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => d.year,
  );
  let newData = newRolledData.map(([year, count]) => {
    return { value: count, label: year };
  });
  let newSliceGenerator = d3.pie().value((d) => d.value);
  let newArcData = newSliceGenerator(newData);
  let newArcs = newArcData.map((d) => arcGenerator(d));

  function updateSelection() {
    newSvg
      .selectAll("path")
      .attr("class", (_, idx) =>
        newData[idx]?.label === selectedYear ? "selected" : "",
      );

    legend
      .selectAll("li")
      .attr("class", (_, idx) =>
        newData[idx]?.label === selectedYear
          ? "legend-item selected"
          : "legend-item",
      );
  }

  function setSelectedYear(year) {
    selectedYear = selectedYear === year ? null : year;
    render();
  }

  newArcs.forEach((arc, idx) => {
    newSvg
      .append("path")
      .attr("d", arc)
      .attr("fill", colors(idx))
      .on("click", () => {
        setSelectedYear(newData[idx].label);
      });
  });

  newData.forEach((d, idx) => {
    legend
      .append("li")
      .attr("style", `--color: ${colors(idx)}`)
      .attr("class", "legend-item")
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on("click", () => {
        setSelectedYear(d.label);
      });
  });

  updateSelection();
}

render();

searchInput.addEventListener("input", (event) => {
  query = event.target.value;
  render();
});
