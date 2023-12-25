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

    const contextStr = core.getInput('github_context');
    if (contextStr) {
      const context = JSON.parse(contextStr);
      core.info("Context: " + context)
      core.info(`run id: ${context['run_id']}`)
      core.info(`run id: ${context.run_id}`)
      core.info(`run id: ${context['runId']}`)
      core.info(`run id: ${context.runId}`)
      // exit with error
      core.setFailed('Github context is not supported anymore.' +
          ' Please update your action to the latest version.')
    }



    const completeConfig = validateInputAndFetchConfig()
    core.info("Validated and prepared the configuration.");
    core.debug('Complete config: ' + JSON.stringify(completeConfig))
    core.debug("------------------------------------------------")
    const evaluationConfig = completeConfig.evaluationConfig;
    core.debug('Evaluation config: ' + JSON.stringify(evaluationConfig))
    core.debug("------------------------------------------------")
    // The variable below is an object, not 1:1 json from the file!
    const completeBenchmarkObject = createCurrBench(completeConfig);
    core.debug(`Commit info: ${completeBenchmarkObject.commitInfo}`)
    core.info("Created current benchmark object from the current benchmark results.");
    core.debug('Current benchmark: ' + JSON.stringify(completeBenchmarkObject))
    core.debug("------------------------------------------------")
    const completeBenchData = getCompleteBenchData(
        completeConfig.folderWithBenchData,
        completeConfig.fileWithBenchData
    );

    core.info("Fetched the complete benchmark data.");

    let latestBenchSha = null;
    if (completeConfig.evaluationConfig.evaluationMethod === 'trend_detection_deltas') {
      const branchName = core.getInput('trend_det_successful_release_branch');
      latestBenchSha = await getLastCommitSha(branchName, completeBenchData,
          completeConfig.benchmarkGroupName);
      core.info(`Latest bench sha: ${latestBenchSha}`);
      completeConfig.latestBenchSha = latestBenchSha;
    }

    const evaluationResult = evaluateCurrentBenchmark(
        completeBenchmarkObject,
        completeBenchData,
        completeConfig
    );

    core.info('Evaluation result: ' + JSON.stringify(evaluationResult))

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
    core.info(`Should the benchmark fail according to the chosen config?: ${shouldFail}`)

    completeBenchmarkObject.benchSuccessful = !shouldFail;
    if (completeConfig.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file.')
      await addCompleteBenchmarkToFile(completeBenchmarkObject,
          completeConfig.folderWithBenchData, completeConfig.fileWithBenchData,
          evaluationResult.results, evaluationResult.evalParameters,
          completeConfig.evaluationConfig
      )
      core.info('Saved current benchmark results to file.')
    }

    const addCommentOption = completeConfig.addComment;

    if (addCommentOption === 'on' || (addCommentOption === 'if_failed' && shouldFail)) {
      createComment(completeConfig, evaluationResult)
      core.info('Created comment.')
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
