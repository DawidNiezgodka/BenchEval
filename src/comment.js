const core = require('@actions/core')
const github = require('@actions/github')

module.exports.createComment = function (
  currentBenchmark,
  githubToken,
  reference,
  previousBenchmark, // for reference === 'previous'
  thresholdArray,
  comparisonModes, // for reference === 'threshold'
  comparisonMargins // for both
) {
  // if github token is not provided, it won't be possible to create a comment
  if (githubToken === null || githubToken === undefined) {
    throw new Error(
      'Github token is not provided, so no comment will be created'
    )
  }

  let commentBody
  if (reference === 'previous') {
    commentBody = module.exports.createCommentBodyForComparisonWithPrevBench(
      currentBenchmark,
      previousBenchmark,
      comparisonModes,
      comparisonMargins
    )
  } else {
    core.debug('Creating comment body for comparison with threshold')
    commentBody = module.exports.createCommentBodyForComparisonWithThreshold(
      currentBenchmark,
      thresholdArray,
      comparisonModes,
      comparisonMargins
    )
  }

  module.exports.leaveComment(
    currentBenchmark.commitInfo.id,
    commentBody,
    githubToken
  )
}

module.exports.createCommentBodyForComparisonWithPrevBench = function (
  currentBenchmark,
  previousBenchmark,
  comparisonModes,
  comparisonMargins
) {
  const lines = [`# ${currentBenchmark.benchmarkName}`, '', '']

  lines.push('## Benchmark information')

  // Call the function to generate bench_data text
  const benchDataText =
    module.exports.createBenchDataTextForCompWithPrev(currentBenchmark)

  // Append bench_data text to the lines array
  lines.push(benchDataText)
  lines.push('', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '')

  core.debug(`Current benchmark commit info: ${currentBenchmark.commitInfo.id}`)
  core.debug(
    `Current benchmark commit info: ${previousBenchmark.commitInfo.id}`
  )

  lines.push(
    `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Previous: ${previousBenchmark.commitInfo.id} | Result |`
  )
  lines.push('|-|-|-|-|')

  core.debug(`Metrics for ${currentBenchmark.benchmarkName}:`)
  currentBenchmark.simpleMetricResults.forEach(metric => {
    core.debug(`  ${metric.name}: ${metric.value}`)
  })

  core.debug(`Metrics for ${previousBenchmark.benchmarkName}:`)
  previousBenchmark.simpleMetricResults.forEach(metric => {
    core.debug(`  ${metric.name}: ${metric.value}`)
  })

  for (const [
    i,
    currentMetric
  ] of currentBenchmark.simpleMetricResults.entries()) {
    const prev = previousBenchmark.simpleMetricResults.find(
      j => j.name === currentMetric.name
    )
    core.debug(prev)
    let line
    let comparisonMode = comparisonModes[i]
    let comparisonMargin = comparisonMargins[i]
    let currentBetter

    if (prev) {
      if (comparisonMode === 'bigger') {
        currentBetter = currentMetric.value >= prev.value
      } else if (comparisonMode === 'smaller') {
        currentBetter = currentMetric.value < prev.value
      } else if (comparisonMode === 'range') {
        const lowerLimit = prev.value * (1 - comparisonMargin / 100)
        const upperLimit = prev.value * (1 + comparisonMargin / 100)
        currentBetter =
          currentMetric.value >= lowerLimit && currentMetric.value <= upperLimit
      } else {
        throw new Error(`Unknown threshold comparison mode: ${comparisonMode}`)
      }
      core.debug(
        'Creating a line for metric ' +
          currentMetric.name +
          ' with value ' +
          currentMetric.value
      )
      let betterOrWorse = currentBetter ? '🟢' : '🔴'
      line = `| \`${currentMetric.name}\` | ${module.exports.fetchValueAndUnit(
        currentMetric
      )} | ${module.exports.fetchValueAndUnit(prev)} | ${betterOrWorse} |`
    } else {
      // If the previous benchmark does not contain the current metric, mark it.
      line = `| \`${currentMetric.name}\` | ${module.exports.fetchValueAndUnit(
        currentMetric
      )} | - | 🔘 |`
    }

    lines.push(line)
  }
  lines.push('', '', '', '')

  return lines.join('\n')
}

module.exports.createBenchDataText = function (currentBenchmark) {
  const benchInfo = currentBenchmark.benchmarkInfo
  core.debug(
    'From createBenchDataText: Current benchmark info: ' +
      JSON.stringify(benchInfo)
  )
  const benchDataLines = [
    `**Execution time**: ${benchInfo.executionTime}`,
    `**Parametrization**:`
  ]

  for (const field in benchInfo.parametrization) {
    if (Object.hasOwnProperty.call(benchInfo.parametrization, field)) {
      const value = benchInfo.parametrization[field]
      const line = `  - **${field}**: ${value}`
      benchDataLines.push(line)
    }
  }

  benchDataLines.push('', '', '', '')
  benchDataLines.push(`**Other Info**: ${benchInfo.otherInfo}`)

  return benchDataLines.join('\n')
}

module.exports.createBenchDataTextForCompWithPrev = function (
  currentBenchmark,
  previousBenchmark
) {
  const currentBenchInfo = currentBenchmark.benchmarkInfo
  const previousBenchInfo = previousBenchmark
    ? previousBenchmark.benchmarkInfo
    : null

  let benchDataLines = [
    '|   Current Benchmark   |   Previous Benchmark   |',
    '|-----------------------|------------------------|'
  ]

  benchDataLines.push(
    `| **Execution time**: ${
      currentBenchInfo.executionTime
    } | **Execution time**: ${
      previousBenchInfo ? previousBenchInfo.executionTime : 'N/A'
    } |`
  )
  benchDataLines.push('| **Parametrization**:  | **Parametrization**:   |')

  const currentFields = Object.keys(currentBenchInfo.parametrization)
  const previousFields = previousBenchInfo
    ? Object.keys(previousBenchInfo.parametrization)
    : []
  const allFields = new Set([...currentFields, ...previousFields])

  for (const field of allFields) {
    const currentParamValue = currentBenchInfo.parametrization[field] || 'N/A'
    const previousParamValue = previousBenchInfo
      ? previousBenchInfo.parametrization[field]
      : 'N/A'

    const line = `|   - **${field}**: ${currentParamValue}  |   - **${field}**: ${previousParamValue}   |`
    benchDataLines.push(line)
  }

  benchDataLines.push('|                       |                        |')
  benchDataLines.push(
    `| **Other Info**: ${currentBenchInfo.otherInfo}  | **Other Info**: ${
      previousBenchInfo ? previousBenchInfo.otherInfo : 'N/A'
    } |`
  )

  return benchDataLines.join('\n')
}

module.exports.createCommentBodyForComparisonWithThreshold = function (
  currentBenchmark,
  thresholdArray,
  comparisonModes,
  comparisonMargins
) {
  const lines = [`# ${currentBenchmark.benchmarkName}`, '', '']

  lines.push('## Benchmark information')

  core.debug('Current benchmark: ' + JSON.stringify(currentBenchmark))
  const benchDataText = module.exports.createBenchDataText(currentBenchmark)
  core.debug('Bench data text: ' + benchDataText)
  core.debug('Commit ID:' + currentBenchmark.commitInfo.id)

  lines.push(benchDataText)
  lines.push('', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '')
  lines.push(
    `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Threshold | Result |`
  )
  lines.push('|-|-|-|-|')

  for (const [
    i,
    currentMetric
  ] of currentBenchmark.simpleMetricResults.entries()) {
    const currentThreshold = thresholdArray[i]
    core.debug('Current threshold: ' + currentThreshold)
    let comparisonMode = comparisonModes[i]
    core.debug('Current comparison mode: ' + comparisonMode)
    let comparisonMargin = comparisonMargins[i]
    core.debug('Current comparison margin: ' + comparisonMargin)

    let line
    let meetsThreshold

    if (comparisonMode === 'bigger') {
      meetsThreshold = currentMetric.value >= currentThreshold
    } else if (comparisonMode === 'smaller') {
      meetsThreshold = currentMetric.value < currentThreshold
    } else if (comparisonMode === 'range') {
      const lowerLimit = currentThreshold * (1 - comparisonMargin / 100)
      const upperLimit = currentThreshold * (1 + comparisonMargin / 100)
      meetsThreshold =
        currentMetric.value >= lowerLimit && currentMetric.value <= upperLimit
    } else {
      throw new Error(`Unknown threshold comparison mode: ${comparisonMode}`)
    }
    core.debug(
      'Creating a line for metric ' +
        currentMetric.name +
        ' with value ' +
        currentMetric.value
    )
    let betterOrWorse = meetsThreshold ? '🟢' : '🔴'
    line = `| \`${currentMetric.name}\` | ${module.exports.fetchValueAndUnit(
      currentMetric
    )} | ${currentThreshold} | ${betterOrWorse} |`

    lines.push(line)
  }
  lines.push('', '', '', '')

  return lines.join('\n')
}

module.exports.fetchValueAndUnit = function (simpleMetricResult) {
  return `\`${simpleMetricResult.value}\` ${simpleMetricResult.unit}`
}

module.exports.leaveComment = async (commitId, body, token) => {
  const github = require('@actions/github')
  const octokit = github.getOctokit(token)
  try {
    await octokit.request(
      'POST /repos/{owner}/{repo}/commits/{commit_sha}/comments',
      {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        commit_sha: commitId,
        body: body
      }
    )
  } catch (error) {
    console.error('An error occurred:', error)
    if (error.status) console.error('Status:', error.status)
    if (error.message) console.error('Message:', error.message)
    if (error.request) console.error('Request:', error.request)
    if (error.response && error.response.data)
      console.error('Response Data:', error.response.data)
  }
}
