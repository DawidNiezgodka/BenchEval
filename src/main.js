const core = require('@actions/core')

const { validateInputAndFetchConfig } = require('./config')

const { evaluateThresholds, allFailed, anyFailed } = require('./evaluate')

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

    let resultArray
    if (config.reference === 'threshold') {
      const thresholds = config.thresholds
      const comparisonModes = config.comparisonModes
      const comparisonMargins = config.comparisonMargins
      resultArray = evaluateThresholds(
        currentBenchmark,
        thresholds,
        comparisonModes,
        comparisonMargins
      )
    } else {
      const prev = await getLatestBenchmark(
        config.benchName,
        config.folderWithBenchData,
        config.fileWithBenchData
      )
      resultArray = null
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
          config.comparisonMargins
        )
      } else {
        const prev = await getLatestBenchmark(
          config.benchName,
          config.folderWithBenchData,
          config.fileWithBenchData
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
            config.comparisonMargins
          )
        }
      }
    }

    if (config.addJobSummary) {
      // add job summary
    }

    if (config.failIfAnyWorse) {
      if (anyFailed(resultArray)) {
        core.setFailed('Some benchmarks are worse than the reference')
      }
    }

    if (config.failIfAllWorse) {
      if (allFailed(resultArray)) {
        core.setFailed('All benchmarks are worse than the reference')
      }
    }

    if (config.saveCurrBenchRes) {
      core.debug('Saving current benchmark results to file')
      await addCompleteBenchmarkToFile(
        currentBenchmark,
        config.fileWithBenchData
      )
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

module.exports = {
  run
}
