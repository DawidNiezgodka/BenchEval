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

    console.log('Evaluation result: ' + evaluationResult);




    if (completeConfig.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file')
      await addCompleteBenchmarkToFile(
        completeBenchmarkObject,
        completeConfig.fileWithBenchData
      )
    }
    core.setOutput('should_fail', 'false')
    if (completeConfig.failingCondition === 'any') {
      console.log("Fail condition is 'any")
      resultArray.forEach(element => console.log(element))
      let anyF = anyFailed(resultArray)
      console.log('anyF: ' + anyF)
      if (anyFailed(resultArray)) {
        core.setOutput('should_fail', 'true')
      }
    }
    if (completeConfig.failingCondition === 'all') {
      if (allFailed(resultArray)) {
        console.log("Fail condition is 'any")
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
