const github = require('@actions/github')
const { Commit } = require('./types')
const core = require('@actions/core')

module.exports.getCommit = function () {
  core.debug(github.context.payload.author)
  if (github.context.payload.head_commit) {
    const { head_commit } = github.context.payload
    return new Commit(
      head_commit.author,
      head_commit.committer,
      head_commit.id,
      head_commit.message,
      head_commit.timestamp,
      head_commit.url
    )
  }

  const pr = github.context.payload.pull_request
  if (pr) {
    const id = pr.head.sha
    const username = pr.head.user.login
    const user = {
      name: username,
      username
    }

    return new Commit(
      user,
      user,
      id,
      pr.title,
      pr.head.repo.updated_at,
      `${pr.html_url}/commits/${id}`
    )
  }
}

const { Octokit } = require('@octokit/action')
const { context } = require('@actions/github')

module.exports.getLastCommitSha = async (branchName, benchmarkData, benchmarkName)=> {
  console.log("Bench data from getlastcomitsha", benchmarkData);
  // get length of benchmark data

  const octokit = new Octokit()
  const response = await octokit.rest.repos.listCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    sha: branchName,
    per_page: 10
  })
  // list sha of the last 10 commits to branchName
  core.debug('Commits: ' + JSON.stringify(response.data.map(commit => commit.sha)));

  return module.exports.findLatestSuccessfulBenchmark(benchmarkData, benchmarkName,
      response.data.map(commit => commit.sha));
}

module.exports.findLatestSuccessfulBenchmark = function(benchmarkData,benchmarkName, commitIds) {
  const benchmarks = benchmarkData.entries[benchmarkName];

  core.debug('Benchmark data length: ' + (benchmarks ? benchmarks.length : 'undefined'));
  core.debug('Benchmark name: ' + benchmarkName);
  core.debug('Commit ids: ' + JSON.stringify(commitIds));

  if (!benchmarks || !Array.isArray(commitIds)) {
    return null;
  }

  const filteredBenchmarks = benchmarks.filter(benchmark =>
      benchmark.benchSuccessful && commitIds.includes(benchmark.commit.id)
  );

  core.debug('Filtered benchmarks: ' + JSON.stringify(filteredBenchmarks));
  filteredBenchmarks.sort((a, b) => b.date - a.date);

  return filteredBenchmarks.length > 0 ? filteredBenchmarks[0].commit.id : null;
}
