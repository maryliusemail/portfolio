import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import scrollama from "https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm";

const width = 1000;
const height = 600;
const margin = { top: 10, right: 10, bottom: 30, left: 40 };
const usableArea = {
  top: margin.top,
  right: width - margin.right,
  bottom: height - margin.bottom,
  left: margin.left,
  width: width - margin.left - margin.right,
  height: height - margin.top - margin.bottom,
};

let xScale;
let yScale;
let currentCommits = [];
let commitProgress = 100;
let commitMaxTime;
let filteredCommits = [];
const colors = d3.scaleOrdinal(d3.schemeTableau10);

async function loadData() {
  const data = await d3.csv("loc.csv", (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    date: new Date(row.date + "T00:00" + row.timezone),
    datetime: new Date(row.datetime),
  }));

  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;

      const ret = {
        id: commit,
        url: `https://github.com/maryliusemail/portfolio/commit/${commit}`,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };

      Object.defineProperty(ret, "lines", {
        value: lines,
        configurable: true,
        writable: true,
        enumerable: false,
      });

      return ret;
    })
    .sort((a, b) => d3.ascending(a.datetime, b.datetime));
}

function renderCommitInfo(data, commits) {
  const dl = d3
    .select("#stats")
    .selectAll("dl")
    .data([null])
    .join("dl")
    .attr("class", "stats");
  const files = d3.groups(data, (d) => d.file);
  const longestLine = d3.greatest(data, (d) => d.length);
  const stats = [
    ["Commits", commits.length],
    ["Files", files.length],
    ['Total <abbr title="Lines of code">LOC</abbr>', data.length],
    ["Max depth", d3.max(data, (d) => d.depth) ?? 0],
    ["Longest line", longestLine?.length ?? 0],
    ["Max lines", d3.max(commits, (d) => d.totalLines) ?? 0],
  ];

  dl.selectAll("dt")
    .data(stats)
    .join("dt")
    .html((d) => d[0]);

  dl.selectAll("dd")
    .data(stats)
    .join("dd")
    .text((d) => d[1]);
}

function renderTooltipContent(commit) {
  const link = document.getElementById("commit-link");
  const date = document.getElementById("commit-date");
  const time = document.getElementById("tooltip-commit-time");
  const author = document.getElementById("commit-author");
  const lines = document.getElementById("commit-lines");

  if (Object.keys(commit).length === 0) {
    return;
  }

  link.href = commit.url;
  link.textContent = commit.id;
  date.textContent = commit.datetime?.toLocaleString("en", {
    dateStyle: "full",
  });
  time.textContent = commit.datetime?.toLocaleString("en", {
    timeStyle: "short",
  });
  author.textContent = commit.author;
  lines.textContent = commit.totalLines;
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById("commit-tooltip");
  tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById("commit-tooltip");
  tooltip.style.left = `${event.clientX}px`;
  tooltip.style.top = `${event.clientY}px`;
}

function createBrushSelector(svg) {
  function isCommitSelected(selection, commit) {
    if (!selection) {
      return false;
    }

    const [[x0, y0], [x1, y1]] = selection;
    const x = xScale(commit.datetime);
    const y = yScale(commit.hourFrac);

    return x0 <= x && x <= x1 && y0 <= y && y <= y1;
  }

  function renderSelectionCount(selection) {
    const selectedCommits = selection
      ? currentCommits.filter((d) => isCommitSelected(selection, d))
      : [];
    const countElement = document.querySelector("#selection-count");

    countElement.textContent = `${
      selectedCommits.length || "No"
    } commits selected`;

    return selectedCommits;
  }

  function renderLanguageBreakdown(selection) {
    const selectedCommits = selection
      ? currentCommits.filter((d) => isCommitSelected(selection, d))
      : [];
    const container = d3.select("#language-breakdown");

    container.selectAll("*").remove();

    if (selectedCommits.length === 0) {
      return;
    }

    const lines = selectedCommits.flatMap((d) => d.lines);
    const breakdown = d3.rollup(
      lines,
      (v) => v.length,
      (d) => d.type
    );

    for (const [language, count] of breakdown) {
      const proportion = count / lines.length;
      const formatted = d3.format(".1~%")(proportion);

      container.append("dt").text(language);
      container.append("dd").text(`${count} lines (${formatted})`);
    }
  }

  function brushed(event) {
    const selection = event.selection;

    d3.selectAll("#chart circle").classed("selected", (d) =>
      isCommitSelected(selection, d)
    );
    renderSelectionCount(selection);
    renderLanguageBreakdown(selection);
  }

  svg.call(d3.brush().on("start brush end", brushed));
  svg.selectAll(".dots, .overlay ~ *").raise();
}

function renderScatterPlot(data, commits) {
  currentCommits = commits;

  const svg = d3
    .select("#chart")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("overflow", "visible");

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => String(d % 24).padStart(2, "0") + ":00");
  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3.scaleSqrt().domain([minLines, maxLines]).range([2, 30]);
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const gridlines = svg
    .append("g")
    .attr("class", "gridlines")
    .attr("transform", `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickFormat("").tickSize(-usableArea.width)
  );

  svg
    .append("g")
    .attr("class", "x-axis")
    .attr("transform", `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg
    .append("g")
    .attr("class", "y-axis")
    .attr("transform", `translate(${usableArea.left}, 0)`)
    .call(yAxis);

  const dots = svg.append("g").attr("class", "dots");

  dots
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7)
    .attr("tabindex", 0)
    .on("mouseenter focus", (event, commit) => {
      d3.select(event.currentTarget).style("fill-opacity", 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on("mousemove", (event) => {
      updateTooltipPosition(event);
    })
    .on("mouseleave blur", (event) => {
      d3.select(event.currentTarget).style("fill-opacity", 0.7);
      updateTooltipVisibility(false);
    });

  createBrushSelector(svg);
}

function updateScatterPlot(data, commits) {
  currentCommits = commits;

  const svg = d3.select("#chart").select("svg");
  xScale.domain(d3.extent(commits, (d) => d.datetime)).nice();

  const [minLines, maxLines] = d3.extent(commits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([minLines ?? 0, maxLines ?? 1])
    .range([2, 30]);
  const xAxis = d3.axisBottom(xScale);
  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  svg.select("g.x-axis").selectAll("*").remove();
  svg.select("g.x-axis").call(xAxis);

  const dots = svg.select("g.dots");
  dots
    .selectAll("circle")
    .data(sortedCommits, (d) => d.id)
    .join("circle")
    .attr("cx", (d) => xScale(d.datetime))
    .attr("cy", (d) => yScale(d.hourFrac))
    .attr("r", (d) => rScale(d.totalLines))
    .attr("fill", "steelblue")
    .style("fill-opacity", 0.7)
    .attr("tabindex", 0)
    .on("mouseenter focus", (event, commit) => {
      d3.select(event.currentTarget).style("fill-opacity", 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on("mousemove", (event) => {
      updateTooltipPosition(event);
    })
    .on("mouseleave blur", (event) => {
      d3.select(event.currentTarget).style("fill-opacity", 0.7);
      updateTooltipVisibility(false);
    });

  d3.select("#selection-count").text("No commits selected");
  d3.select("#language-breakdown").selectAll("*").remove();
}

function updateFileDisplay(commits) {
  const lines = commits.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, lines]) => ({ name, lines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select("#files")
    .selectAll("div")
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append("div").call((div) => {
        const dt = div.append("dt");
        dt.append("code");
        dt.append("small");
        div.append("dd");
      })
    );

  filesContainer.select("dt > code").text((d) => d.name);
  filesContainer.select("dt > small").text((d) => `${d.lines.length} lines`);

  filesContainer
    .select("dd")
    .selectAll("div")
    .data((d) => d.lines)
    .join("div")
    .attr("class", "loc")
    .attr("style", (d) => `--color: ${colors(d.type)}`);
}

function updateTimeDisplay() {
  const time = document.getElementById("commit-time");
  time.dateTime = commitMaxTime.toISOString();
  time.textContent = commitMaxTime.toLocaleString("en", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function updateVisualizations() {
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  const filteredLines = filteredCommits.flatMap((d) => d.lines);

  updateTimeDisplay();
  renderCommitInfo(filteredLines, filteredCommits);
  updateScatterPlot(filteredLines, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  const slider = document.getElementById("commit-progress");
  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);
  updateVisualizations();
}

const data = await loadData();
const commits = processCommits(data);
const timeScale = d3
  .scaleTime()
  .domain(d3.extent(commits, (d) => d.datetime))
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);
filteredCommits = commits;
document
  .getElementById("commit-progress")
  .addEventListener("input", onTimeSliderChange);

renderCommitInfo(data, filteredCommits);
renderScatterPlot(data, commits);
updateTimeDisplay();
updateFileDisplay(filteredCommits);

d3.select("#scatter-story")
  .selectAll(".step")
  .data(commits)
  .join("div")
  .attr("class", "step")
  .html(
    (d, i) => `
      <p>On ${d.datetime.toLocaleString("en", {
        dateStyle: "full",
        timeStyle: "short",
      })}, I made <a href="${d.url}" target="_blank">${
      i > 0 ? "another commit" : "my first commit"
    }</a>.</p>
      <p>I edited ${d.totalLines} lines across ${
      d3.rollups(
        d.lines,
        (D) => D.length,
        (line) => line.file
      ).length
    } files.</p>
    `
  );

function onStepEnter(response) {
  commitMaxTime = response.element.__data__.datetime;
  commitProgress = timeScale(commitMaxTime);
  document.getElementById("commit-progress").value = commitProgress;
  updateVisualizations();
}

const scroller = scrollama();
scroller
  .setup({
    container: "#scrolly-1",
    step: "#scrolly-1 .step",
  })
  .onStepEnter(onStepEnter);

window.addEventListener("resize", scroller.resize);
