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
  const lines = [`# ${currentBenchmark.benchmarkGroupName}`, '', '']

  const currentBenchmarkGroupName = currentBenchmark.benchmarkGroupName
  const previousBenchmarkGroupName = previousBenchmark.benchmarkGroupName

  if (currentBenchmarkGroupName !== previousBenchmarkGroupName) {
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
  lines.push('', '', '', '', '', '','')
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

module.exports.alertUsersIfBenchFailed = function (benchmarkPassed, completeConfig, lines) {
  if (!benchmarkPassed) {
    let usersToBeAlerted = completeConfig.alertUsersIfBenchFailed;
    if (usersToBeAlerted.length > 0) {
      lines.push('', `CC: ${usersToBeAlerted.join(' ')}`);
    }
  }
}

module.exports.createBodyForComparisonWithTrendDetDeltas = function(evaluationResult, completeConfig) {
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;
  const weekAgoBench = evaluationResult.referenceBenchmarks.weekAgo;
  const lastStableReleaseBench = evaluationResult.referenceBenchmarks.lastStableRelease;
  const lines = [`# ${currentBenchmark.benchmarkGroupName}`, '', '']

  lines.push('', '', '', '', '', '','')
  lines.push('## Results')
  lines.push('', '', '', '', '', '','')

  lines.push(`The chosen evaluation method is trend detection with deltas.`)
  lines.push(`Each metric shall be "threshold" % better than the previous benchmark, the benchmark from a week ago,
  and the benchmark from the last stable commit to main branch.`)

  const benchDataText = module.exports.createBenchDataText(
      currentBenchmark
  )
  lines.push(benchDataText)

  lines.push(
      `| Metric name | Current: ${currentBenchmark.commitInfo.id} | Previous: ${previousBenchmark.commitInfo.id} | Week ago: ${weekAgoBench.commitInfo.id} | Last stable: ${lastStableReleaseBench.commitInfo.id} | Thr | Res |`
  )
  lines.push('|-|-|-|-|-|-|-|')

  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig

  for (let i = 0; i < evaluationResults.length; i++) {
    const resultExplanation = evaluationParameters.resultExplanations[i];
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const metricValues = evaluationParameters.metricToDifferentBenchValues.get(metricName);

    if (!metricValues) {
      continue;
    }

    let currBenchValue = metricValues?.current ?? 'N/A';
    let prevBenchValue = metricValues?.previous ?? 'N/A';
    let weekAgoBenchValue = metricValues?.week_ago ?? 'N/A';
    let lastStableReleaseBenchValue = metricValues?.last_stable_release ?? 'N/A';

    const x = evaluationConfiguration.trendThresholds[i];
    let line;
    let comparisonResult;

    const metricNameAndUnit = metricName + " [" + metricUnit + "]";

    let betterOrWorse = resultStatus === 'passed' ? '🟢' : '🔴';
    if (resultStatus === 'failed' || resultStatus === 'passed') {
      line = `| \`${metricNameAndUnit}\` | \`${currBenchValue}\` | \`${prevBenchValue}\` | \`${weekAgoBenchValue}\` | \`${lastStableReleaseBenchValue}\` | ${x} % | ${betterOrWorse} |`;
    } else {
      line = `| \`${metricNameAndUnit}\` | \`${currBenchValue}\` | \`${prevBenchValue}\` | \`${weekAgoBenchValue}\` | \`${lastStableReleaseBenchValue}\` | N/A | 🔘 |`;
    }

    lines.push(line);
  }
  const benchmarkPassed = module.exports.addInfoAboutBenchRes(lines, completeConfig, evaluationResults);
  module.exports.alertUsersIfBenchFailed(benchmarkPassed, completeConfig, lines);


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
  if (currentBenchmark.benchmarkGroupName === previousBenchmark.benchmarkGroupName) {
    benchDataLines = [
      `|   Current Benchmark   |   Previous Benchmark   |`,
      '|-----------------------|------------------------|'
    ]
  } else {
    benchDataLines = [
      `|   Current ${currentBenchmark.benchmarkGroupName}   |   Last ${previousBenchmark.benchmarkGroupName}   |`,
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

  core.debug("Bench data lines: " + JSON.stringify(benchDataLines))
  return benchDataLines.join('\n')
}


module.exports.createBodyForComparisonWithThreshold = function (
    evaluationResult, completeConfig
) {
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  console.log("Current benchmark from creaBodyWithThr: " + JSON.stringify(currentBenchmark))
  const bName = "Benchmark";
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
module.exports.createWorkflowSummaryForCompWithPrev = function (evaluationResult, completeConfig) {

  const currentBenchmark = evaluationResult.referenceBenchmarks.current;
  const previousBenchmark = evaluationResult.referenceBenchmarks.previous;

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentBenchmark.commitInfo.id.substring(0, 7)}"`,
      header: true,
    },
    {
      data: `Previous: "${previousBenchmark.commitInfo.id.substring(0, 7)}"`,
      header: true,
    },

  ];
  const hasShouldBe = evaluationResult.evalParameters.shouldBe.length > 0;
  const hasThan = evaluationResult.evalParameters.than.length > 0;

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

  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults);
}

module.exports.createWorkflowSummaryThreshold = function (evaluationResult, completeConfig) {

  const currentBenchmark = evaluationResult.referenceBenchmarks.current;

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentBenchmark.commitInfo.id.substring(0, 7)}"`,
      header: true,
    },
    {
      data: "Threshold",
      header: true,
    },

  ];
  const hasShouldBe = evaluationResult.evalParameters.shouldBe.length > 0;

  if (hasShouldBe) {
    headers.push({ data: 'Current should be', header: true });
  }

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
      },
      {
        data: than,
      },

    ])

    if (hasShouldBe) {
      rows[i].push({ data: evaluationResult.evalParameters.shouldBe[i] });
    }
    rows[i].push({data: graphicalRepresentationOfRes})
  }

  let summaryMessage = module.exports.createSummaryMessage(evaluationResult);
  const evaluationMethod = evaluationResult.evalParameters.evaluationMethod;

  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults);
}

module.exports.createWorkflowSummaryForThresholdRange = function (evaluationResult, completeConfig) {

      const currentBenchmark = evaluationResult.referenceBenchmarks.current;

      const headers = [
     {
        data: 'Metric',
        header: true,
     },
     {
        data: `Current: "${currentBenchmark.commitInfo.id.substring(0, 7)}"`,
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
      module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults);
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
module.exports.addSummary = function (evaluationMethod, headers, rows, summaryMessage, linkToGraph) {
  core.summary
      .addHeading(`Benchmark summary`, 2)

      .addRaw("This is a short benchmark summary.")
      .addBreak()
      .addRaw("Depending on workflow settings, you might expect an additional code comment with detailed information" +
          " or a notification about the benchmark results", true)
      .addBreak()
      .addRaw("You might also want to check the graph below" +
          " (if you added the .html template to the branch where results are stored)")
      .addBreak();
  if (linkToGraph) {
    core.summary.addLink("Graph with benchmark results", linkToGraph);
  }
  core.summary
      .addSeparator()
      .addHeading(`The chosen evaluation method: ${evaluationMethod}`, 4)
      .addRaw(module.exports.getEvaluationMethodSpecificDescriptionOfEvalMethod(evaluationMethod))
      .addBreak()
      .addBreak()
      .addTable([headers, ...rows])
      .addSeparator()
      .addBreak()
      .addRaw(summaryMessage)
      .addBreak()
      .write();
}



module.exports.getEvaluationMethodSpecificDescriptionOfEvalMethod = function (evaluationMethod) {
  switch (evaluationMethod) {
    case 'threshold':
      return "You are comparing the current benchmark in relation to a single value (smaller, bigger) or a symmetric range (tolerance) of a given value."
    case 'previous':
      return "You are comparing the current benchmark in relation to the previous benchmark. This method does not consider whether the previous benchmark was successful or not."
    case 'previous_successful':
      return "You are comparing the current benchmark in relation to the previous successful benchmark. This method considers only the previous successful benchmark."
    case 'threshold_range':
      return "You are comparing the current benchmark in relation to a range of a given values (given by lower and upper bounds)."
    case 'jump_detection':
      return ""
    case 'trend_detection_moving_ave':
      return ""
    case 'trend_detection_deltas':
      return "You are trying to identify software performance degradation by comparing current performance against three benchmarks:" +
          " the immediate previous run, a run closest to one week ago, and the last stable release." +
          " Each comparison checks for changes exceeding a specified percentage, enabling the detection of both sudden and gradual performance declines"
    default:
      return "Unsupported evaluation method."

  }}

module.exports.createWorkflowSummaryForTrendDetDeltas = function (evaluationResult, completeConfig) {
  const currentBenchmark = evaluationResult.referenceBenchmarks.current;

  const headers = [
    {
      data: 'Metric',
      header: true,
    },
    {
      data: `Current: "${currentBenchmark.commitInfo.id.substring(0, 7)}"`,
      header: true,
    },
    {
      data: "Prev",
      header: true,
    },
    {
      data: '~Week ago',
      header: true,
    },
    {
      data: 'Last stable',
      header: true,
    },
    {
      data: 'Each should be',
      header: true,
    }

  ];

  const rows = [];
  const evaluationResults = evaluationResult.results.result
  const evaluationParameters = evaluationResult.evalParameters
  const evaluationConfiguration = completeConfig.evaluationConfig
  for (let i = 0; i < evaluationResults.length; i++) {

    const resultExplanation = evaluationParameters.resultExplanations[i];
    const resultStatus = evaluationResults[i];
    const metricName = evaluationParameters.metricNames[i];
    const metricUnit = evaluationParameters.metricUnits[i];
    const metricValues = evaluationParameters.metricToDifferentBenchValues.get(metricName);

    if (!metricValues) {
      continue;
    }

    let currBenchValue = metricValues?.current ?? 'N/A';
    let prevBenchValue = metricValues?.previous ?? 'N/A';
    let weekAgoBenchValue = metricValues?.week_ago ?? 'N/A';
    let lastStableReleaseBenchValue = metricValues?.last_stable_release ?? 'N/A';

    const x = evaluationConfiguration.trendThresholds[i];
    let line;
    let comparisonResult;

    const metricNameAndUnit = metricName + " [" + metricUnit + "]";

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
  module.exports.addSummary(evaluationMethod, headers, rows, summaryMessage, completeConfig.linkToTemplatedGhPageWithResults);
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
