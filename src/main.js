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
    console.log('Complete config: ' + JSON.stringify(completeConfig))
    console.log("------------------------------------------------")
    const evaluationConfig = completeConfig.evaluationConfig;
    console.log('Evaluation config: ' + JSON.stringify(evaluationConfig))
    console.log("------------------------------------------------")
    const currentBenchmark = createCurrBench(completeConfig);
    const completeBenchData = getCompleteBenchData(
        completeConfig.folderWithBenchData,
        completeConfig.fileWithBenchData
    );

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
