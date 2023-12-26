const github = require('@actions/github')
const { Commit } = require('./types')
const core = require('@actions/core')

module.exports.getCommit = function () {
  if (github.context.payload.head_commit) {
    const { head_commit } = github.context.payload
    return new Commit(
      head_commit.author,
      head_commit.committer,
      head_commit.id,
      head_commit.message,
      head_commit.timestamp,
      head_commit.url,
        github.context.eventName
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
      `${pr.html_url}/commits/${id}`,
        github.context.eventName
    )
  }
}

const { Octokit } = require('@octokit/action')
const { context } = require('@actions/github')

module.exports.getLastCommitSha = async (branchName, benchmarkData, benchmarkGroupName)=> {
  core.debug("---- start getLastCommitSha ----");

  const octokit = new Octokit()
  const response = await octokit.rest.repos.listCommits({
    owner: context.repo.owner,
    repo: context.repo.repo,
    sha: branchName,
    per_page: 100
  })

  return module.exports.findLatestSuccessfulBenchmark(benchmarkData, benchmarkGroupName,
      response.data.map(commit => commit.sha));
}

module.exports.findLatestSuccessfulBenchmark = function(benchmarkData,benchmarkGroupName, commitIds) {
  const benchmarks = benchmarkData.entries[benchmarkGroupName];

  if (!benchmarks || !Array.isArray(commitIds)) {
    return null;
  }

  const filteredBenchmarks = benchmarks.filter(benchmark =>
      benchmark.benchSuccessful && commitIds.includes(benchmark.commit.id)
  );

  filteredBenchmarks.sort((a, b) => b.date - a.date);

  return filteredBenchmarks.length > 0 ? filteredBenchmarks[0].commit.id : null;
}

module.exports.getCommitReplacementWhenTriggeredByScheduledEvent = function(runId) {
  const now = new Date();
  return new Commit(
      "scheduled event",
      "scheduled event",
      runId,
      null,
      now,
      null
  )
}
