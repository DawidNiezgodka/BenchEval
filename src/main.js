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

const { createComment, createWorkflowSummary, createWorkflowSummaryThreshold,
  summaryForMethodNotSupported} = require('./comment')

const {
  addCompleteBenchmarkToFile,
  getLatestBenchmark,
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

    //core.debug('Complete bench data: ' + JSON.stringify(completeBenchData))

    let latestBenchSha = null;
    if (core.getInput('trend_det_successful_release_branch') !== 'null') {
      const branchName = core.getInput('trend_det_successful_release_branch');
      latestBenchSha = await getLastCommitSha(branchName, completeBenchData,
          completeConfig.benchName);
      // get sha of the last successful commit to branchName
      console.log('Latest bench sha: ' + latestBenchSha);
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
      if (anyFailed(resultArray)) {

      }
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
      await addCompleteBenchmarkToFile(completeBenchmarkObject, completeConfig.fileWithBenchData,
          evaluationResult.results, evaluationResult.evalParameters,
          completeConfig.evaluationConfig
      )
    }

    const addCommentOption = completeConfig.addComment;

    if (addCommentOption === 'on' || (addCommentOption === 'if_failed' && shouldFail)) {
      createComment(completeConfig, evaluationResult)
    }

    console.log("After comment")

    const addJobSummary = completeConfig.addJobSummary;
    if (addJobSummary === 'on' || (addJobSummary === 'if_failed' && shouldFail)) {

      // For now only previous is supported
      if (evaluationConfig.evaluationMethod === 'previous') {
        createWorkflowSummary(evaluationResult);
      } else if (evaluationConfig.evaluationMethod === 'threshold') {
        createWorkflowSummaryThreshold(evaluationResult);
      } else {
        summaryForMethodNotSupported(evaluationConfig.evaluationMethod);
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
