const core = require('@actions/core')

const { validateInputAndFetchConfig } = require('./config')

const {
  evaluateThresholds,
  allFailed,
  anyFailed,
  addResultToBenchmarkObject,
  compareWithPrev
} = require('./evaluate')

const { createCurrBench } = require('./bench')

const { createComment } = require('./comment')

const {
  addCompleteBenchmarkToFile,
  getLatestBenchmark
} = require('./bench_data')

async function run() {
  try {
    const config = validateInputAndFetchConfig()
    const currentBenchmark = createCurrBench(config)
    const thresholds = config.thresholds
    const comparisonModes = config.comparisonModes
    const comparisonMargins = config.comparisonMargins
    let resultArray
    if (config.reference === 'threshold') {
      resultArray = evaluateThresholds(
        currentBenchmark,
        thresholds,
        comparisonModes,
        comparisonMargins
      )
      addResultToBenchmarkObject(
        currentBenchmark,
        resultArray,
        config.failingCondition
      )
    } else if (config.reference === 'previous') {
      const prev = await getLatestBenchmark(
        config.benchToCompare,
        config.folderWithBenchData,
        config.fileWithBenchData,
        1
      )
      resultArray = compareWithPrev(
        currentBenchmark,
        prev,
        comparisonModes,
        comparisonMargins
      )
      addResultToBenchmarkObject(
        currentBenchmark,
        resultArray,
        config.failingCondition
      )
    }

    if (config.addComment) {
      core.debug("G'nna add comment to a commit")
      if (config.reference === 'threshold') {
        createComment(
          currentBenchmark,
          config.githubToken,
          config.reference,
          null,
          config.thresholds,
          config.comparisonModes,
          config.comparisonMargins,
          config.failingCondition
        )
      } else {
        const prev = await getLatestBenchmark(
          config.benchToCompare,
          config.folderWithBenchData,
          config.fileWithBenchData,
          1
        )
        if (!prev) {
          core.debug('No previous benchmark found. Skipping comment creation.')
          return
        } else {
          createComment(
            currentBenchmark,
            config.githubToken,
            config.reference,
            prev,
            config.thresholds,
            config.comparisonModes,
            config.comparisonMargins,
            config.failingCondition
          )
        }
      }
    }

    if (config.addJobSummary) {
      // add job summary
    }

    if (config.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file')
      await addCompleteBenchmarkToFile(
        currentBenchmark,
        config.fileWithBenchData
      )
    }
    core.setOutput('should_fail', 'false')
    if (config.failingCondition === 'any') {
      console.log("Fail condition is 'any")
      resultArray.forEach(element => console.log(element))
      let anyF = anyFailed(resultArray)
      console.log('anyF: ' + anyF)
      if (anyFailed(resultArray)) {
        core.setOutput('should_fail', 'true')
      }
    }
    if (config.failingCondition === 'all') {
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
