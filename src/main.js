const core = require('@actions/core')

const { validateInputAndFetchConfig } = require('./config')

const {
  allFailed,
  anyFailed,
  evaluateCurrentBenchmark
} = require('./evaluate')

const {
  getLastCommitSha
} = require('./commit')

const { createCurrBench} = require('./bench')

const { createComment, createWorkflowSummaryForCompWithPrev, createWorkflowSummaryThreshold,
  summaryForMethodNotSupported, createWorkflowSummaryForThresholdRange,
  createWorkflowSummaryForTrendDetDeltas} = require('./comment')

const {
  addCompleteBenchmarkToFile,
  getCompleteBenchData
} = require('./bench_data')

async function run() {
  try {

    const completeConfig = validateInputAndFetchConfig()
    core.debug('Complete config: ' + JSON.stringify(completeConfig))
    core.debug("------------------------------------------------")
    const evaluationConfig = completeConfig.evaluationConfig;
    core.debug('Evaluation config: ' + JSON.stringify(evaluationConfig))
    core.debug("------------------------------------------------")
    // The variable below is an object, not 1:1 json from the file!
    const completeBenchmarkObject = createCurrBench(completeConfig);
    core.debug('Current benchmark: ' + JSON.stringify(completeBenchmarkObject))
    core.debug("------------------------------------------------")
    const completeBenchData = getCompleteBenchData(
        completeConfig.folderWithBenchData,
        completeConfig.fileWithBenchData
    );

    let latestBenchSha = null;
    if (completeConfig.evaluationConfig.evaluationMethod === 'trend_detection_deltas') {
      const branchName = core.getInput('trend_det_successful_release_branch');
      latestBenchSha = await getLastCommitSha(branchName, completeBenchData,
          completeConfig.benchmarkGroupName);
      core.debug(`Latest bench sha: ${latestBenchSha}`);
      completeConfig.latestBenchSha = latestBenchSha;
    }

    const evaluationResult = evaluateCurrentBenchmark(
        completeBenchmarkObject,
        completeBenchData,
        completeConfig
    );

    core.debug('Evaluation result: ' + JSON.stringify(evaluationResult))

    let shouldFail = false;
    const resultArray = evaluationResult.results.result
    if (completeConfig.failingCondition === 'any') {
      shouldFail = anyFailed(resultArray)
    }
    if (completeConfig.failingCondition === 'all') {
      shouldFail = allFailed(resultArray)
    }
    if (completeConfig.failingCondition === 'none') {
        shouldFail = false
    }

    completeBenchmarkObject.benchSuccessful = !shouldFail;
    if (completeConfig.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file')
      await addCompleteBenchmarkToFile(completeBenchmarkObject,
          completeConfig.folderWithBenchData, completeConfig.fileWithBenchData,
          evaluationResult.results, evaluationResult.evalParameters,
          completeConfig.evaluationConfig
      )
    }

    const addCommentOption = completeConfig.addComment;

    if (addCommentOption === 'on' || (addCommentOption === 'if_failed' && shouldFail)) {
      createComment(completeConfig, evaluationResult)
    }

    const addJobSummary = completeConfig.addJobSummary;
    if (addJobSummary === 'on' || (addJobSummary === 'if_failed' && shouldFail)) {

      if (evaluationConfig.evaluationMethod === 'previous') {
        createWorkflowSummaryForCompWithPrev(evaluationResult, completeConfig);
      } else if (evaluationConfig.evaluationMethod === 'threshold') {
        createWorkflowSummaryThreshold(evaluationResult, completeConfig);
      } else if (evaluationConfig.evaluationMethod === 'threshold_range') {
        createWorkflowSummaryForThresholdRange(evaluationResult, completeConfig)
      } else if (evaluationConfig.evaluationMethod === 'trend_detection_deltas') {
        createWorkflowSummaryForTrendDetDeltas(evaluationResult, completeConfig);
      }

      else {
        summaryForMethodNotSupported(evaluationConfig.evaluationMethod, completeConfig.linkToTemplatedGhPageWithResults);
      }

    }

    core.setOutput('should_fail', shouldFail)
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
