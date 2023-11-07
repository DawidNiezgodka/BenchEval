const core = require('@actions/core')

const { validateInputAndFetchConfig } = require('./config')

const {
  allFailed,
  anyFailed,
  evaluateCurrentBenchmark
} = require('./evaluate')

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
    const currentBenchmark = createCurrBench(completeConfig);
    core.debug('Current benchmark: ' + JSON.stringify(currentBenchmark))
    core.debug("------------------------------------------------")
    const completeBenchData = getCompleteBenchData(
        completeConfig.folderWithBenchData,
        completeConfig.fileWithBenchData
    );
    //core.debug('Complete benchmark data: ' + JSON.stringify(completeBenchData))
    //core.debug("------------------------------------------------")

    const evaluationResult = evaluateCurrentBenchmark(
        currentBenchmark,
        completeBenchData,
        evaluationConfig
    );

    console.log('Evaluation result: ' + evaluationResult);




    if (completeConfig.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file')
      await addCompleteBenchmarkToFile(
        currentBenchmark,
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
