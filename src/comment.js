const core = require('@actions/core')

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
      commentBody = module.exports.createBodyForComparisonWithPrev(evaluationResult, completeConfig);
      break;
    case 'threshold_range':
      commentBody = module.exports.createBodyForComparisonWithThresholdRange(evaluationResult, completeConfig);
      break;
    case 'jump_detection':
      commentBody = module.exports.createBodyForComparisonWithJumpDeltas(evaluationResult, completeConfig);
      break;
    case 'trend_detection_moving_ave':
      commentBody = module.exports.createBodyForComparisonWithTrendDetMovAverage(evaluationResult, completeConfig);
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
  const lines = []
  lines.push('## Benchmark results')
  lines.push('')
  lines.push(`<b>Benchmark group:</b> ${currentBenchmark.benchmarkGroupName}`)
  lines.push('')
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;
  lines.push(`The chosen evaluation method is ${evaluationMethod}.`)
  if (evaluationMethod === 'previous_successful') {
    lines.push(`The approach compares the current benchmark with the last successful benchmark of the given group.`)
  } else {
    lines.push(`The approach compares the current benchmark with the previous benchmark of the given group.`)
  }

  const currentBenchmarkGroupName = currentBenchmark.benchmarkGroupName
  const previousBenchmarkGroupName = previousBenchmark.benchmarkGroupName

  if (currentBenchmarkGroupName !== previousBenchmarkGroupName) {
    lines.push(
        "<b>Note</b>: Benchmarks from different groups are being compared."
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
      `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Previous: ${previousBenchmark.commitInfo.id} | Condition for current | Result |`
  )
  lines.push('|-|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig

  for (let i = 0; i < evaluationResults.length; i++) {
    const comparisonMargin = evaluationConfiguration.comparisonMargins[i];
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = parseFloat(evaluationParameters.is[i]).toFixed(2);
    const comparisonMode = evaluationParameters.shouldBe[i];
    const previousBenchRes = parseFloat(evaluationParameters.than[i]).toFixed(2);
    const prevBenchValAndUnit = previousBenchRes + ' ' + metricUnit;
    let line
    let valueAndUnit = actualValue + ' ' + metricUnit

    let comparisonResult;

    if (comparisonMargin >= 0 && comparisonMargin <= 100 && (comparisonMode === 'smaller' || comparisonMode === 'bigger')) {
      comparisonResult = `At least ${comparisonMargin} % ${comparisonMode} than prev`;
    } else if (comparisonMargin === -1 && (comparisonMode === 'smaller' || comparisonMode === 'bigger')) {
      comparisonResult = `Strictly ${comparisonMode} than prev`;
    } else if (comparisonMode === 'tolerance') {
      comparisonResult = 'fall within ±' + comparisonMargin + '% of prev';
    }

    if (resultStatus === 'failed' || resultStatus === 'passed') {
      let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴'
      line = `| \`${metricName}\` | \`${valueAndUnit}\` | \`${prevBenchValAndUnit}\` | ${comparisonResult} | ${betterOrWorse} |`
    } else {
      line = `| \`${metricName}\` | \'${valueAndUnit}\' | N/A | N/A | 🔘 |`
    }

    lines.push(line)
  }
  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);

  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);


  return lines.join('\n')
}

module.exports.addInfoAboutBenchRes = function(lines, completeConfig, evaluationResults) {
  lines.push(' ', ' ')
  const {failingCondition} = completeConfig;
  const benchmarkPassed =
      failingCondition === 'any' ? !evaluationResults.includes('failed') :
          failingCondition === 'all' ? !evaluationResults.includes('passed') :
              failingCondition === 'none' ? true : null;

  const resultMessage =
      failingCondition === 'any' ? (benchmarkPassed ? "All metrics passed the tests." : "At least one metric didn't pass the tests.") :
          failingCondition === 'all' ? (benchmarkPassed ? "At least one metric passed the tests" : "All metrics failed") :
              "The benchmark passes regardless of results.";

  lines.push(`## Benchmark ${benchmarkPassed ? 'passed' : 'failed'}`);
  lines.push(`The chosen failing condition was ${failingCondition}.`);
  lines.push(`${resultMessage}`);

  return benchmarkPassed;
}

module.exports.addExtraExplanation = function(lines, metricExplanationMap) {
  lines.push('')
  lines.push(`Extra explanation for each metric.`);
  lines.push(`| Metric name | Explanation |`);
  lines.push('|-|-|');
  for (const [metricName, explanation] of metricExplanationMap.entries()) {
    lines.push(`| \`${metricName}\` | ${explanation} |`);
  }
}

module.exports.alertUsersIfBenchFailed = function (benchmarkPassed, completeConfig, lines) {
  if (!benchmarkPassed) {
    let usersToBeAlerted = completeConfig.alertUsersIfBenchFailed;
    if (usersToBeAlerted.length > 0) {
      lines.push('', `CC: ${usersToBeAlerted.join(' ')}`);
    }
  }
}

module.exports.createBodyForComparisonWithTrendDetDeltas = function(evaluationResult, completeConfig) {
  core.debug('------ start createBodyForComparisonWithTrendDetDeltas ------')
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;
  const weekAgoBench = evaluationResult.referenceBenchmarks.weekAgo;
  const lastStableReleaseBench = evaluationResult.referenceBenchmarks.lastStableRelease;

  const lines = []
  lines.push('## Benchmark results')
  lines.push('')
  lines.push(`<b>Benchmark group:</b> ${currentBenchmark.benchmarkGroupName}`)
  lines.push('')
  lines.push(`The chosen evaluation method is trend detection with deltas.`)
  lines.push(`For each metric, there is the following condition: 
        The current value should not change more than X% (Max. ch in the table below) from the value measured for the previous benchmark, the benchmark closest to a week ago, <b>and</b> the benchmark from the last stable commit to the main branch (pointed to by the input <i>trend_det_successful_release_branch</i>).`)

  const benchDataText = module.exports.createBenchDataText(
      currentBenchmark
  )
  lines.push(benchDataText)

  lines.push(
      `| Metric | Curr: ${currentBenchmark.commitInfo.id} | Prev: ${previousBenchmark.commitInfo.id} | Week: ${weekAgoBench.commitInfo.id} | Stable: ${lastStableReleaseBench.commitInfo.id} | Max. ch | Res | `
  )
  lines.push('|-|-|-|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  core.info("Evaluation results: " + JSON.stringify(evaluationResults))
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig
  core.info("Evaluation cfg: " + JSON.stringify(evaluationConfiguration))
  let metricExplanationMap = new Map();
  for (let i = 0; i < evaluationResults.length; i++) {
    const resultExplanation = evaluationParameters.resultExplanations[i];
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const metricValues = evaluationParameters.metricToDifferentBenchValues.get(metricName);
    metricExplanationMap.set(metricName, resultExplanation);
    if (!metricValues) {
      continue;
    }

    let currBenchValue = metricValues?.current ?? 'N/A';
    let prevBenchValue = metricValues?.previous ?? 'N/A';
    let weekAgoBenchValue = metricValues?.week_ago ?? 'N/A';
    let lastStableReleaseBenchValue = metricValues?.last_stable_release ?? 'N/A';

    let x;
    if (evaluationResults.length === 1) {
      x = evaluationConfiguration.trendThresholds;
    } else {
      x = evaluationConfiguration.trendThresholds[i];
    }
    let line;
    const metricNameAndUnit = metricName + " [" + metricUnit + "]";

    let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴';
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      line = `| \`${metricNameAndUnit}\` | \`${currBenchValue}\` | \`${prevBenchValue}\` | \`${weekAgoBenchValue}\` | \`${lastStableReleaseBenchValue}\` | ${x} % | ${betterOrWorse} |`;
    } else {
      line = `| \`${metricNameAndUnit}\` | \`${currBenchValue}\` | \`${prevBenchValue}\` | \`${weekAgoBenchValue}\` | \`${lastStableReleaseBenchValue}\` | N/A | 🔘 |`;
    }

    lines.push(line);
  }

  module.exports.addExtraExplanation(lines, metricExplanationMap)

  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);
  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);


  return lines.join('\n')
}

module.exports.createBodyForComparisonWithTrendDetMovAverage = function(evaluationResult, completeConfig) {

  core.debug('------ start createBodyForComparisonWithTrendDetMovAverage ------')
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;

  const lines = []
  lines.push('## Benchmark results')
  lines.push('')
  lines.push(`<b>Benchmark group:</b> ${currentBenchmark.benchmarkGroupName}`)
  lines.push('')
  lines.push(`The chosen evaluation method is trend_detection_moving_ave.`)
  lines.push(`For each metric, the procedure checks if the current value does not exceed the average
   of a particular number of last measurements more than a given threshold
        `)

  const benchDataText = module.exports.createBenchDataText(
      currentBenchmark
  )
  lines.push(benchDataText)

  lines.push('', '', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '', '')

  lines.push(
      `| Metric | Curr: ${currentBenchmark.commitInfo.id} | Max.Jump | Was | No builds | Res | `
  )
  lines.push('|-|-|-|-|-|-|')


  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters

  const movingAveWindowSize = completeConfig.evaluationConfig.movingAveWindowSize;
  core.debug("Moving ave window size: " + movingAveWindowSize)
  for (let i = 0; i < evaluationResults.length; i++) {

    core.info(`Printing eval parameters", ${JSON.stringify(evaluationParameters)}`)
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];

    const currValue = currentBenchmark.simpleMetricResults[i].value;
    const currPlusUnit = currValue + ' ' + metricUnit;
    const shouldBe = evaluationParameters.shouldBe[i];
    const ratio = evaluationParameters.is[i];

    let line

// Max.Jump | Was | No builds | Res
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴'
      line = `| \`${metricName}\` | \`${currPlusUnit}\` |  ${shouldBe} | ${ratio} | ${movingAveWindowSize} | ${betterOrWorse} |`
    } else {
      line = `| \`${metricName}\` | \'${currPlusUnit}\' | N/A | N/A | N/A | 🔘 |`
    }

    lines.push(line)
  }

  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);
  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);
  return lines.join('\n')

}

module.exports.createBodyForComparisonWithJumpDeltas = function(evaluationResult, completeConfig) {
  core.debug('------ start createBodyForComparisonWithJumpDeltas ------')
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;

  const lines = []
  lines.push('## Benchmark results')
  lines.push('')
  lines.push(`<b>Benchmark group:</b> ${currentBenchmark.benchmarkGroupName}`)
  lines.push('')
  lines.push(`The chosen evaluation method is jump_detection.`)
  lines.push(`For each metric, there is the following condition: 
        The current value should not change more than X% (Max. ch in the table below) from the value measured for the previous benchmark.`)

  const currentBenchmarkGroupName = currentBenchmark.benchmarkGroupName
  const previousBenchmarkGroupName = previousBenchmark.benchmarkGroupName

  if (currentBenchmarkGroupName !== previousBenchmarkGroupName) {
    lines.push(
        "<b>Note</b>: Benchmarks from different groups are being compared."
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
      `| Metric | Curr: ${currentBenchmark.commitInfo.id} | Prev: ${previousBenchmark.commitInfo.id} | Max. Jump | Was | Res | `
  )
  lines.push('|-|-|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig
  for (let i = 0; i < evaluationResults.length; i++) {

    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];

    const currValue = currentBenchmark.simpleMetricResults[i].value;
    const prevValue = previousBenchmark.simpleMetricResults[i].value;

    const currPlusUnit = currValue + ' ' + metricUnit;
    const prevPlusUnit = prevValue + ' ' + metricUnit;

    const shouldBe = evaluationParameters.shouldBe[i];
    const ratio = evaluationParameters.is[i];


    let line


    if (resultStatus === 'failed' || resultStatus === 'passed') {
      let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴'
      line = `| \`${metricName}\` | \`${currPlusUnit}\` | \`${prevPlusUnit}\` | ${shouldBe} | ${ratio} | ${betterOrWorse} |`
    } else {
      line = `| \`${metricName}\` | \'${currPlusUnit}\' | N/A | N/A | N/A | 🔘 |`
    }

    lines.push(line)
  }

  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);
  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);
  return lines.join('\n')
}



module.exports.createBenchDataText = function (currentBenchmark) {
  core.info('------ start createBenchDataText ------')
  const benchInfo = currentBenchmark.benchmarkInfo
  const benchDataLines = [
      ' ', ' ',
    `**Execution time**: ${benchInfo.executionTime}`,
    ' ', ' ',
    `**Parametrization**:`
  ]

  for (const field in benchInfo.parametrization) {
    if (Object.hasOwnProperty.call(benchInfo.parametrization, field)) {
      const value = benchInfo.parametrization[field]
      const line = `  - **${field}**: ${value}`
      benchDataLines.push(line)
    }
  }

  benchDataLines.push(' ', ' ')
  benchDataLines.push(`**Other Info**: ${benchInfo.otherInfo}`)
  benchDataLines.push(' ', ' ')

  core.info('------ end createBenchDataText ------')
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

  let benchDataLines = []
  if (currentBenchmark.benchmarkGroupName === previousBenchmark.benchmarkGroupName) {
    benchDataLines = [
      `|   Current Benchmark   |   Previous Benchmark   |`,
      '|-----------------------|------------------------|'
    ]
  } else {
    benchDataLines = [
      `|   Current (group: ${currentBenchmark.benchmarkGroupName})   |   Previous (group: ${previousBenchmark.benchmarkGroupName})   |`,
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
    const currentParamValue = currentBenchInfo.parametrization[field] !== undefined
        ? currentBenchInfo.parametrization[field]
        : 'N/A';
    const previousParamValue = previousBenchInfo && previousBenchInfo.parametrization[field] !== undefined
        ? previousBenchInfo.parametrization[field]
        : 'N/A';

    const line = `|   - **${field}**: ${currentParamValue}  |   - **${field}**: ${previousParamValue}   |`;
    benchDataLines.push(line);
  }

  benchDataLines.push('|                       |                        |')
  benchDataLines.push(
      `| **Other Info**: ${currentBenchInfo.otherInfo}  | **Other Info**: ${
          previousBenchInfo ? previousBenchInfo.otherInfo : 'N/A'
      } |`
  )

  return benchDataLines.join('\n')
}


module.exports.createBodyForComparisonWithThreshold = function (
    evaluationResult, completeConfig
) {
  core.info('------ start createBodyForComparisonWithThreshold ------')
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const bName = completeConfig.evaluationConfig.benchmarkGroupName;
  const lines = [`# ${bName}`, '', '']
  const benchDataText = module.exports.createBenchDataText(currentBenchmark);

  lines.push(benchDataText)
  lines.push('', '', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '', '')

  lines.push(
      `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Condition for current | Threshold | Result |`
  )
  lines.push('|-|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig

  for (let i = 0; i < evaluationResults.length; i++) {
    const comparisonMargin = evaluationConfiguration.comparisonMargins[i];
    const comparisonMode = evaluationParameters.shouldBe[i];
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = evaluationParameters.is[i];
    const thanValue = evaluationParameters.than[i];
    let line
    let valueAndUnit = actualValue + ' ' + metricUnit

    let comparisonResult;

    if (comparisonMargin >= 0 && comparisonMargin <= 100 && (comparisonMode === 'smaller' || comparisonMode === 'bigger')) {
      comparisonResult = `At least ${comparisonMargin} % ${comparisonMode} than prev`;
    } else if (comparisonMargin === -1 && (comparisonMode === 'smaller' || comparisonMode === 'bigger')) {
      comparisonResult = `Strictly ${comparisonMode} than prev`;
    } else if (comparisonMode === 'tolerance') {
      comparisonResult = 'fall within ±' + comparisonMargin + '% of prev';
    }

    if (resultStatus === 'failed' || resultStatus === 'passed') {
      let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴'
      line = `| \`${metricName}\` | \`${valueAndUnit}\` | \`${comparisonMode}\` | ${thanValue} | ${betterOrWorse} |`
    } else {
      line = `| \`${metricName}\` | \'${valueAndUnit}\' | N/A | N/A | 🔘 |`
    }

    lines.push(line)
  }
  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);

  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);


  return lines.join('\n')
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

module.exports.alertUsersIfBenchFailed = function (benchmarkPassed, completeConfig, lines) {
  if (!benchmarkPassed) {
    let usersToBeAlerted = completeConfig.alertUsersIfBenchFailed;
    if (usersToBeAlerted.length > 0) {
      lines.push('', `CC: ${usersToBeAlerted.join(' ')}`);
    }
  }
}

module.exports.createBodyForComparisonWithThresholdRange = function (
    evaluationResult, completeConfig
) {
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const lines = [`# ${currentBenchmark.benchmarkGroupName}`, '', '']

  const benchDataText = module.exports.createBenchDataText(currentBenchmark);

  lines.push(benchDataText)
  lines.push('', '', '', '')
  lines.push('## Results')
  lines.push('', '', '', '')

  lines.push(
      `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Current should be within | Result |`
  )
  lines.push('|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters

  for (let i = 0; i < evaluationResults.length; i++) {
    const shouldBeBetween = evaluationParameters.shouldBe[i]; // shouldBeBetween
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = evaluationParameters.is[i];
    let line
    let valueAndUnit = actualValue + ' ' + metricUnit

    if (resultStatus === 'failed' || resultStatus === 'passed') {
      let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴'
      line = `| \`${metricName}\` | \`${valueAndUnit}\` | \`${shouldBeBetween}\` | ${betterOrWorse} |`
    } else {
      line = `| \`${metricName}\` | \'${valueAndUnit}\' | N/A | 🔘 |`
    }

    lines.push(line)
  }

  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);
  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);
  return lines.join('\n')
}







///////////////////////
/////////////////////// Summary
///////////////////////
module.exports.createWorkflowSummaryForCompWithPrev = function (evaluationResult, completeConfig, successful) {

  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;

  // if the completeConfig.eventName is schedule, then we must take complete runId,
  // otherwise we can take the short version of the commitInfo.id
  const currentCommitId = completeConfig.eventName === 'schedule' ? currentBenchmark.commitInfo.id : currentBenchmark.commitInfo.id.substring(0, 7);
  const previousCommitId = previousBenchmark.commitInfo.eventName === 'schedule' ? previousBenchmark.commitInfo.id : previousBenchmark.commitInfo.id.substring(0, 7);

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentCommitId}"`,
      header: true,
    },
    {
      data: `Previous: "${previousCommitId}"`,
      header: true,
    },

  ];
  const hasShouldBe = evaluationResult.evalParameters.shouldBe.length > 0;
  if (hasShouldBe) {
    headers.push({ data: 'Curr should be', header: true });
  }

  headers.push(  {
    data: 'Result',
    header: true,
  })
  const rows = [];
  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig
  for (let i = 0; i < evaluationResults.length; i++) {

    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = parseFloat(evaluationParameters.is[i]).toFixed(2);
    const previousBenchRes = parseFloat(evaluationParameters.than[i]).toFixed(2);
    const prevBenchValAndUnit = previousBenchRes + ' ' + metricUnit;
    let valueAndUnit = actualValue + ' ' + metricUnit;
    const comparisonMargin = evaluationConfiguration.comparisonMargins[i];
    const comparisonMode = evaluationParameters.shouldBe[i];
    let comparisonResult;

    if (comparisonMargin >= 0 && comparisonMargin <= 100 && (comparisonMode === 'smaller' || comparisonMode === 'bigger')) {
      comparisonResult = `At least ${comparisonMargin} % ${comparisonMode} than prev`;
    } else if (comparisonMargin === -1 && (comparisonMode === 'smaller' || comparisonMode === 'bigger')) {
      comparisonResult = `Strictly ${comparisonMode} than prev`;
    } else if (comparisonMode === 'tolerance') {
      comparisonResult = 'fall within ±' + comparisonMargin + '% of prev';
    }

    let graphicalRepresentationOfRes;
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      graphicalRepresentationOfRes = resultStatus === 'passed' ? '🟢' : '🔴'
    } else {
      graphicalRepresentationOfRes= '🔘';
    }

    rows.push([
      {
        data: metricName,
      },
      {
        data: valueAndUnit,
      },
      {
        data: prevBenchValAndUnit,
      },

    ])

    if (hasShouldBe) {
      rows[i].push({ data: comparisonResult });
    }

    rows[i].push({data: graphicalRepresentationOfRes})
  }

  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;

  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults,
      completeConfig.eventName);
}

module.exports.createWorkflowSummaryThreshold = function (evaluationResult, completeConfig) {

  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const currentCommitId = completeConfig.eventName === 'schedule' ? currentBenchmark.commitInfo.id : currentBenchmark.commitInfo.id.substring(0, 7);

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentCommitId}"`,
      header: true,
    }

  ];
  const hasShouldBe = evaluationResult.evalParameters.shouldBe.length > 0;

  if (hasShouldBe) {
    headers.push({ data: 'Should be', header: true });
  }

  headers.push(
      {
        data: "Threshold",
        header: true,
      }
  )

  headers.push(  {
    data: 'Result',
    header: true,
  })
  const rows = [];
  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  for (let i = 0; i < evaluationResults.length; i++) {

    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = evaluationParameters.is[i];
    const than = evaluationParameters.than[i] + ' ' + metricUnit;
    let valueAndUnit = actualValue + ' ' + metricUnit

    let graphicalRepresentationOfRes;
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      graphicalRepresentationOfRes = resultStatus === 'passed' ? '🟢' : '🔴'
    } else {
      graphicalRepresentationOfRes= '🔘';
    }

    rows.push([
      {
        data: metricName,
      },
      {
        data: valueAndUnit,
      }

    ])

    if (hasShouldBe) {
      rows[i].push({ data: evaluationResult.evalParameters.shouldBe[i] });
    }
    rows[i].push({ data: than });
    rows[i].push({data: graphicalRepresentationOfRes})
  }

  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;

  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults,
      completeConfig.eventName);
}

module.exports.createWorkflowSummaryForThresholdRange = function (evaluationResult, completeConfig) {

  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const currentCommitId = completeConfig.eventName === 'schedule' ? currentBenchmark.commitInfo.id : currentBenchmark.commitInfo.id.substring(0, 7);
  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentCommitId}"`,
      header: true,
    },
    {
      data: "Current should be within",
      header: true,
    },
    {
      data: 'Result',
      header: true,
    }

  ];

  const rows = [];
  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  for (let i = 0; i < evaluationResults.length; i++) {

    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const actualValue = evaluationParameters.is[i];
    const shouldBeBetween = evaluationParameters.shouldBe[i];
    let valueAndUnit = actualValue + ' ' + metricUnit

    let graphicalRepresentationOfRes;
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      graphicalRepresentationOfRes = resultStatus === 'passed' ? '🟢' : '🔴'
    } else {
      graphicalRepresentationOfRes= '🔘';
    }

    rows.push([
      {
        data: metricName,
      },
      {
        data: valueAndUnit,
      },
      {
        data: shouldBeBetween,
      },
      {
        data: graphicalRepresentationOfRes,
      }

    ])
  }
  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;
  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults,
      completeConfig.eventName);
}

module.exports.summaryForMethodNotSupported = function (evaluationResult, linkToGraph) {
  core.summary
      .addHeading("Benchark summary",2)
      .addRaw("Depending on workflow settings, you might expect code comments or notifications about" +
          "the benchmark result.");
  if (linkToGraph) {
    core.summary.addLink("Graph with benchmark results", linkToGraph);
  }
  core.summary.addHeading(` ### Evaluation Method: ${evaluationMethod}`, 3)
      .addRaw("This evaluation method is not supported yet.")
      .addBreak()
      .write();
}




//////////
/// Helpers
//////////
module.exports.addSummary = function (evaluationMethod, headers, rows, summaryMessage, linkToGraph, eventName,
                                      isMovingAve = false, movingAveWindowSize = null) {

  const methodSpecificDescription = module.exports.getEvaluationMethodSpecificDescriptionOfEvalMethod(evaluationMethod);
  const methodDescriptionFullText = `<b>Method description:</b> ${methodSpecificDescription}`;

  core.summary
      .addHeading(`Benchmark summary`, 2)
      .addRaw(summaryMessage)
      .addSeparator();
  if (eventName === 'schedule') {
    const scheduledEventExtraInfo = "The benchmark was run on a scheduled event. Instead of a commit id, the full run id is displayed.";
    core.summary.addRaw(scheduledEventExtraInfo)
    .addSeparator();
  }
  if (isMovingAve) {
    const movingAveExtraInfo = `The chosen moving average window size is ${movingAveWindowSize}.`;
    core.summary.addRaw(movingAveExtraInfo)
        .addSeparator();
  }
  core.summary
      .addHeading(`The chosen evaluation method: ${evaluationMethod}`, 4)
      .addRaw(methodDescriptionFullText)
      .addBreak()
      .addBreak()
      .addTable([headers, ...rows])
      .addSeparator()
      .addBreak()
      .addRaw("A code comment with detailed information or a notification about the benchmark results may have been generated, depending on workflow settings.", true)
      .addBreak()
      .addRaw("Consider checking the graph below if the .html template has been added to the branch where results are stored")
      .addBreak();

  if (linkToGraph) {
    core.summary.addLink("Graph with benchmark results", linkToGraph);
  }
  core.summary
      .write();
}

module.exports.createWorkflowSummaryForJumpDetection = function (evaluationResult, completeConfig) {
    const currentBenchmark = evaluationResult.referenceBenchmarks.current;
    const previousBenchmark = evaluationResult.referenceBenchmarks.previous;

    const currentCommitId = completeConfig.eventName === 'schedule' ? currentBenchmark.commitInfo.id : currentBenchmark.commitInfo.id.substring(0, 7);
    const previousCommitId = previousBenchmark.commitInfo.eventName === 'schedule' ? previousBenchmark.commitInfo.id : previousBenchmark.commitInfo.id.substring(0, 7);

    const headers = [
        {
        data: 'Metric',
        header: true,
        },
        {
        data: `Current: "${currentCommitId}"`,
        header: true,
        },
        {
        data: `Previous: "${previousCommitId}"`,
        header: true,
        },

      {
        data: 'Jump',
        header: true,
      },
      {
        data: 'Max. change [%]',
        header: true,
      },
        {
        data: 'Result',
        header: true,
        }

    ];

    const rows = [];
    const evaluationResults = evaluationResult.results.result
    const evaluationParameters = evaluationResult.evalParameters
    const evaluationConfiguration = completeConfig.evaluationConfig
    for (let i = 0; i < evaluationResults.length; i++) {
      const resultStatus = evaluationResults[i];
      const metricName = evaluationParameters.metricNames[i];
      const metricUnit = evaluationParameters.metricUnits[i];

      const currValue = currentBenchmark.simpleMetricResults[i].value;
      const prevValue = previousBenchmark.simpleMetricResults[i].value;

      const currPlusUnit = currValue + ' ' + metricUnit;
      const prevPlusUnit = prevValue + ' ' + metricUnit;

      const shouldBe = evaluationParameters.shouldBe[i];
      const ratio = evaluationParameters.is[i];


        let graphicalRepresentationOfRes;
        if (resultStatus === 'failed' || resultStatus === 'passed') {
        graphicalRepresentationOfRes = resultStatus === 'passed' ? '🟢' : '🔴'
        } else {
        graphicalRepresentationOfRes= '🔘';
        }

        rows.push([
        {
            data: metricName,
        },
        {
            data: currPlusUnit,
        },
        {
            data: prevPlusUnit,
        },
        {
            data: ratio,
        },
          {
            data: shouldBe,
          },
        {
            data: graphicalRepresentationOfRes
        },

        ])
    }
  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;
  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults,
      completeConfig.eventName);
}

module.exports.createWorkflowSummaryForTrendDetAve = function (evaluationResult, completeConfig) {
  core.info("Creating summary for trend detection moving average")
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const currentCommitId = completeConfig.eventName === 'schedule' ? currentBenchmark.commitInfo.id : currentBenchmark.commitInfo.id.substring(0, 7);

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentCommitId}"`,
      header: true,
    },


    {
      data: 'Jump',
      header: true,
    },
    {
      data: 'Max. change [%]',
      header: true,
    },
    {
      data: 'Result',
      header: true,
    }

  ];

  const rows = [];
  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig
  for (let i = 0; i < evaluationResults.length; i++) {
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];

    const currValue = currentBenchmark.simpleMetricResults[i].value;
    const currPlusUnit = currValue + ' ' + metricUnit;
    const shouldBe = evaluationParameters.shouldBe[i];
    const ratio = evaluationParameters.is[i];

    let graphicalRepresentationOfRes;
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      graphicalRepresentationOfRes = resultStatus === 'passed' ? '🟢' : '🔴'
    } else {
      graphicalRepresentationOfRes= '🔘';
    }

    rows.push([
      {
        data: metricName,
      },
      {
        data: currPlusUnit,
      },
      {
        data: ratio,
      },
      {
        data: shouldBe,
      },
      {
        data: graphicalRepresentationOfRes
      }

    ])
  }
  const movingAveWindowSize = completeConfig.evaluationConfig.movingAveWindowSize;
  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;
  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults,
      completeConfig.eventName, true, movingAveWindowSize);
}



module.exports.getEvaluationMethodSpecificDescriptionOfEvalMethod = function (evaluationMethod) {
  switch (evaluationMethod) {
    case 'threshold':
      return "The method compares the current benchmark in relation to a single value (smaller, bigger) or a symmetric range (tolerance) of a given value."
    case 'previous':
      return "The method compares the current benchmark in relation to the previous benchmark. This method does not consider whether the previous benchmark was successful or not."
    case 'previous_successful':
      return "The method compares the current benchmark in relation to the previous successful benchmark. This method considers only the previous successful benchmark."
    case 'threshold_range':
      return "The method compares the current benchmark in relation to a range of a given values (given by lower and upper bounds)."
    case 'jump_detection':
      return "The strategy checks if the difference between the current and previous value does not exceed a given threshold"
    case 'trend_detection_moving_ave':
      return "The procedure checks if the current value does not exceed the average of a particular number of last measurements more than a given threshold"
    case 'trend_detection_deltas':
      return "The method tries to identify software performance degradation by comparing current performance against three benchmarks:" +
          " the immediate previous run, a run closest to one week ago, and the last stable release." +
          " Each comparison checks for changes exceeding a specified percentage (enables the detection of both sudden and gradual performance declines)"
    default:
      return "Unsupported evaluation method."

  }}
module.exports.createWorkflowSummaryForTrendDetDeltas = function (evaluationResult, completeConfig) {
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;
  const weekAgoBench = evaluationResult.referenceBenchmarks.weekAgo;
  const lastStableReleaseBench = evaluationResult.referenceBenchmarks.lastStableRelease;

  const currentCommitId = completeConfig.eventName === 'schedule' ? currentBenchmark.commitInfo.id : currentBenchmark.commitInfo.id.substring(0, 7);
  const previousCommitId = previousBenchmark.commitInfo.eventName === 'schedule' ? previousBenchmark.commitInfo.id : previousBenchmark.commitInfo.id.substring(0, 7);
  const weekAgoCommitId = weekAgoBench.commitInfo.eventName === 'schedule' ? weekAgoBench.commitInfo.id : weekAgoBench.commitInfo.id.substring(0, 7);
  const lastStableReleaseCommitId = lastStableReleaseBench.commitInfo.eventName === 'schedule' ? lastStableReleaseBench.commitInfo.id : lastStableReleaseBench.commitInfo.id.substring(0, 7);

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Curr: "${currentCommitId}"`,
      header: true,
    },
    {
      data: `Prev: "${previousCommitId}"`,
      header: true,
    },
    {
      data: `~Week: "${weekAgoCommitId}"`,
      header: true,
    },
    {
      data: `Stable: "${lastStableReleaseCommitId}"`,
      header: true,
    },
    {
      data: 'Max. change [%]',
      header: true,
    },
    {
      data: 'Result',
      header: true,
    }

  ];

  const rows = [];
  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig
  for (let i = 0; i < evaluationResults.length; i++) {
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricValues = evaluationParameters.metricToDifferentBenchValues.get(metricName);
    if (!metricValues) {
      continue;
    }

    let currBenchValue = metricValues?.current ?? 'N/A';
    let prevBenchValue = metricValues?.previous ?? 'N/A';
    let weekAgoBenchValue = metricValues?.week_ago ?? 'N/A';
    let lastStableReleaseBenchValue = metricValues?.last_stable_release ?? 'N/A';

    let x;
    if (evaluationResults.length === 1) {
      x = evaluationConfiguration.trendThresholds;
    } else {
      x = evaluationConfiguration.trendThresholds[i];
    }

    let graphicalRepresentationOfRes;
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      graphicalRepresentationOfRes = resultStatus === 'passed' ? '🟢' : '🔴'
    } else {
      graphicalRepresentationOfRes= '🔘';
    }

    rows.push([
      {
        data: metricName,
      },
      {
        data: currBenchValue,
      },
      {
        data: prevBenchValue,
      },
      {
        data: weekAgoBenchValue,
      },
      {
        data: lastStableReleaseBenchValue,
      },
      {
        data: x,
      },
      {
        data: graphicalRepresentationOfRes
      },

    ])
  }
  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;
  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults,
      completeConfig.eventName);
}

module.exports.createSummaryMessage = function(evaluationResult) {
  const results = evaluationResult.results.result;

  if (results.every(result => result === 'passed')) {
    return "All metrics have passed. Benchmark is successful.";
  } else if (results.every(result => result === 'failed')) {
    return "All metrics failed. Unless you deliberately choose not to fail the build, it will fail.";
  } else if (results.includes('failed')) {
    return "At least one metric failed. The rejection of the build depends on the chosen strategy (all, any, none).";
  } else {
    return "Benchmark result is inconclusive.";
  }
}
