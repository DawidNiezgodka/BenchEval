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
