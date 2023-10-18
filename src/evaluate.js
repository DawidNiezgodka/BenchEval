const core = require('@actions/core')
module.exports.evaluateThresholds = function (
  currentBenchmark,
  thresholdArray,
  comparisonModes,
  comparisonMargins
) {
  const metricsInfo = currentBenchmark.simpleMetricResults
  if (
    thresholdArray.length !== metricsInfo.length ||
    comparisonModes.length !== metricsInfo.length ||
    comparisonMargins.length !== metricsInfo.length
  ) {
    throw new Error(
      'The lengths of the arrays should match the number of objects in jsonData.'
    )
  }

  const result = []

  for (let i = 0; i < metricsInfo.length; i++) {
    const metricInfo = metricsInfo[i]
    const threshold = thresholdArray[i]
    const mode = comparisonModes[i]
    const margin = comparisonMargins[i]

    const value = metricInfo.value

    if (mode === 'smaller') {
      result.push(value < threshold ? 'passed' : 'failed')
    } else if (mode === 'bigger') {
      result.push(value > threshold ? 'passed' : 'failed')
    } else if (mode === 'range') {
      if (margin === -1) {
        throw new Error(
          "Invalid percentage margin for 'range' comparison mode."
        )
      }
      const lowerLimit = threshold * (1 - margin / 100)
      const upperLimit = threshold * (1 + margin / 100)
      result.push(
        value >= lowerLimit && value <= upperLimit ? 'passed' : 'failed'
      )
    } else {
      throw new Error('Invalid comparison mode.')
    }
  }
  core.debug(
    'Finished evaluating currentBenchmark against thresholds with the following result: ' +
      result
  )
  return result
}

module.exports.compareWithPrev = function (
  currentBenchmark,
  previousBenchmark,
  thresholdArray,
  comparisonModes,
  comparisonMargins
) {
  const currentBenchName = currentBenchmark.benchName
  const previousBenchName = previousBenchmark.benchName

  core.debug(`Metrics for ${currentBenchmark.benchmarkName}:`)
  currentBenchmark.simpleMetricResults.forEach(metric => {
    core.debug(`  ${metric.name}: ${metric.value}`)
  })

  core.debug(`Metrics for ${previousBenchmark.benchmarkName}:`)
  previousBenchmark.simpleMetricResults.forEach(metric => {
    core.debug(`  ${metric.name}: ${metric.value}`)
  })

  const results = []

  for (const [
    i,
    currentMetric
  ] of currentBenchmark.simpleMetricResults.entries()) {
    const prev = previousBenchmark.simpleMetricResults.find(
      j => j.name === currentMetric.name
    )
    core.debug(prev)
    let comparisonMode = comparisonModes[i]
    let comparisonMargin = comparisonMargins[i]
    let currentBetter

    if (prev) {
      if (comparisonMode === 'bigger') {
        if (comparisonMargin === '-1') {
          result.push(currentMetric.value > prev.value ? 'passed' : 'failed')
        } else {
          const lowerLimit = prev.value * (1 + comparisonMargin / 100)
          result.push(currentMetric.value >= lowerLimit ? 'passed' : 'failed')
        }
      } else if (comparisonMode === 'smaller') {
        if (comparisonMargin === '-1') {
          results.push(currentMetric.value < prev.value ? 'passed' : 'failed')
        } else {
          const upperLimit = prev.value * (1 - comparisonMargin / 100)
          results.push(currentMetric.value <= upperLimit ? 'passed' : 'failed')
        }
      } else if (comparisonMode === 'range') {
        const lowerLimit = prev.value * (1 - comparisonMargin / 100)
        const upperLimit = prev.value * (1 + comparisonMargin / 100)
        currentBetter =
          currentMetric.value >= lowerLimit && currentMetric.value <= upperLimit
        results.push(currentBetter ? 'passed' : 'failed')
      } else {
        throw new Error(`Unknown threshold comparison mode: ${comparisonMode}`)
      }

      return results
    }
  }
}

module.exports.allFailed = function (resultArray) {
  return resultArray.every(element => element === 'failed')
}

module.exports.anyFailed = function (resultArray) {
  return resultArray.some(element => element === 'failed')
}

module.exports.addResultToBenchmarkObject = function (
  currentBenchmark,
  resultArray,
  failingCondition
) {
  if (failingCondition === 'any') {
    currentBenchmark.benchSuccessful = module.exports.anyFailed(resultArray)
  } else if (failingCondition === 'all') {
    currentBenchmark.benchSuccessful = module.exports.allFailed(resultArray)
  } else {
    currentBenchmark.benchSuccessful = true
  }
}
