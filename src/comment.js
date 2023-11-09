const core = require('@actions/core')
const github = require('@actions/github')

module.exports.createComment = function (
    completeConfig,
    evaluationResult
) {
  if (completeConfig.githubToken === null || completeConfig.githubToken === undefined) {
    throw new Error(
      'Github token is not provided, so no comment will be created'
    )
  }

  let commentBody
  switch (completeConfig.evaluationConfig.evaluationMethod) {
    case 'threshold':
      commentBody = module.exports.createBodyForComparisonWithThreshold(evaluationResult, completeConfig);
      break;
    case 'previous':
      commentBody = module.exports.createBodyForComparisonWithPrev(evaluationResult, completeConfig);
      break;
    case 'previous_successful':
      commentBody = module.exports.createBodyForComparisonWithPrevSucc(evaluationResult, completeConfig);
      break;
    case 'threshold_range':
      commentBody = module.exports.createBodyForComparisonWithThresholdRange(evaluationResult, completeConfig);
      break;
    case 'jump_detection':
      commentBody = module.exports.createBodyForComparisonWithJumpDet(evaluationResult, completeConfig);
      break;
    case 'trend_detection_moving_ave':
      commentBody = module.exports.createBodyForComparisonWithTrendDetMovAve(evaluationResult, completeConfig);
      break;
    case 'trend_detection_deltas':
      commentBody = module.exports.createBodyForComparisonWithTrendDetDeltas(evaluationResult, completeConfig);
      break;
    default:
      throw new Error(`Unsupported evaluation method: ${completeConfig.evaluationConfig.evaluationMethod}`);
  }

  module.exports.leaveComment(
    evaluationResult.referenceBenchmarks.current.commitInfo.id,
    commentBody,
    completeConfig.githubToken
  )
}

module.exports.createBodyForComparisonWithPrev = function (
    evaluationResult, completeConfig
) {
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;
  const lines = [`# ${currentBenchmark.benchmarkName}`, '', '']

  const currentBenchName = currentBenchmark.benchmarkName
  const previousBenchName = previousBenchmark.benchmarkName

  if (currentBenchName !== previousBenchName) {
    lines.push(
      "Please note that you're comparing benchmarks with different names!"
    )
  }
  const benchDataText = module.exports.createBenchDataTextForCompWithPrev(
    currentBenchmark,
    previousBenchmark
  )

  lines.push(benchDataText)
  lines.push('', '', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '', '')

  lines.push(
    `| Metric name | Current: ${currentBenchmark.commitInfo.id} | should be: | than (previous): ${previousBenchmark.commitInfo.id} | Result |`
  )
  lines.push('|-|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  core.debug('Evaluation results: ' + evaluationResults)
  const evaluationParameters = evaluationResult.evalParameters
  core.debug('Evaluation parameters: ' + evaluationParameters)
  for (let i = 0; i < evaluationResults.length; i++) {
    core.debug("Entering the for loop")
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = evaluationParameters.is[i];
    const comparisonMode = evaluationParameters.shouldBe[i];
    const previousBenchRes = evaluationParameters.than[i];
    let line
    let valueAndUnit = actualValue + ' ' + metricUnit
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴'
      line = `| \`${metricName}\` | \`${valueAndUnit}\` | ${comparisonMode} | \`${previousBenchRes}\` | ${betterOrWorse} |`
    } else {
      // If the previous benchmark does not contain the current metric, mark it.
      line = `| \`${metricName}\` | \'${valueAndUnit}\' | - | N/A | 🔘 |`
    }

    lines.push(line)
  }
  lines.push('', '', '', '', '')
  const { failingCondition } = completeConfig;
  const benchmarkPassed =
      failingCondition === 'any' ? !evaluationResults.includes('failed') :
          failingCondition === 'all' ? !evaluationResults.includes('passed') :
              failingCondition === 'none' ? true : null;

  const conditionMessage =
      failingCondition === 'any' ? (benchmarkPassed ? "all metrics satisfied" : "at least one metric didn't satisfy") :
          failingCondition === 'all' ? (benchmarkPassed ? "all metrics passed" : "all metrics failed") :
              "the benchmark passes regardless of results.";

  lines.push(`## Benchmark ${benchmarkPassed ? 'passed' : 'failed'}`);
  lines.push(`The chosen failing condition is '${failingCondition}', and ${conditionMessage} the condition.`);

  if (!benchmarkPassed) {
    let usersToBeAlerted = ['@DawidNiezgodka']
    if (usersToBeAlerted.length > 0) {
      lines.push('', `CC: ${usersToBeAlerted.join(' ')}`);
    }
  }


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

  benchDataLines.push('', '', '', '', '')
  benchDataLines.push(`**Other Info**: ${benchInfo.otherInfo}`)

  return benchDataLines.join('\n')
}

module.exports.createBenchDataTextForCompWithPrev = function (
  currentBenchmark,
  previousBenchmark
) {
  core.debug("Current benchmark: " + JSON.stringify(currentBenchmark))
  core.debug("Previous benchmark: " + JSON.stringify(previousBenchmark))
  const currentBenchInfo = currentBenchmark.benchmarkInfo
  const previousBenchInfo = previousBenchmark
    ? previousBenchmark.benchmarkInfo
    : null

  let benchDataLines = []
  if (currentBenchmark.benchmarkName === previousBenchmark.benchmarkName) {
    benchDataLines = [
      `|   Current Benchmark   |   Previous Benchmark   |`,
      '|-----------------------|------------------------|'
    ]
  } else {
    benchDataLines = [
      `|   Current ${currentBenchmark.benchmarkName}   |   Last ${previousBenchmark.benchmarkName}   |`,
      '|-----------------------|------------------------|'
    ]
  }

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

  core.debug("Bench data lines: " + JSON.stringify(benchDataLines))
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
  lines.push('', '', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '', '')
  lines.push(
    `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Threshold | Condition | Result |`
  )
  lines.push('|-|-|-|-|-|')

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
      // If comparisonMargin is -1, we look for a strictly bigger value
      if (comparisonMargin === '-1') {
        meetsThreshold = currentMetric.value > currentThreshold
      }
      // otherwise, we look for a value that is at least comparisonMargin% bigger
      else {
        const lowerLimit = currentThreshold * (1 + comparisonMargin / 100)
        meetsThreshold = currentMetric.value >= lowerLimit
      }
    } else if (comparisonMode === 'smaller') {
      // If comparisonMargin is "-1", we look for a strictly smaller value
      if (comparisonMargin === '-1') {
        meetsThreshold = currentMetric.value < currentThreshold
      }
      // otherwise, we look for a value that is at least comparisonMargin% smaller
      else {
        const upperLimit = currentThreshold * (1 - comparisonMargin / 100)
        meetsThreshold = currentMetric.value <= upperLimit
      }
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
    )} | ${currentThreshold} | ${comparisonMode} | ${betterOrWorse} |`

    lines.push(line)
  }
  lines.push('', '', '', '', '')

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
