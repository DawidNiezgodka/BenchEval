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

const { createComment } = require('./comment')

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

    let latestBenchSha = null;
    if (core.getInput('trend_det_successful_release_branch') !== 'null') {
      const branchName = core.getInput('trend_det_successful_release_branch');
      latestBenchSha = await getLastCommitSha(branchName);
      core.debug('Latest bench sha: ' + latestBenchSha);
      completeConfig.latestBenchSha = latestBenchSha;
    }

    const evaluationResult = evaluateCurrentBenchmark(
        completeBenchmarkObject,
        completeBenchData,
        completeConfig
    );

    core.debug('Evaluation result: ' + JSON.stringify(evaluationResult))

    if (completeConfig.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file')
      await addCompleteBenchmarkToFile(completeBenchmarkObject, completeConfig.fileWithBenchData,
          evaluationResult.results, evaluationResult.evalParameters,
          completeConfig.evaluationConfig
      )
    }

    // adding comment
    if (completeConfig.addComment) {
      createComment(completeConfig, evaluationResult)
    }


    // adding summary

    // failing
    core.setOutput('should_fail', 'false')
    const resultArray = evaluationResult.result
    if (completeConfig.failingCondition === 'any') {
      let anyF = anyFailed(resultArray)
      if (anyFailed(resultArray)) {
        core.setOutput('should_fail', 'true')
      }
    }
    if (completeConfig.failingCondition === 'all') {
      if (allFailed(resultArray)) {
        core.setOutput('should_fail', 'true')
      }
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
