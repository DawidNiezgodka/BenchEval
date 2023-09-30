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
) {}

module.exports.allFailed = function (resultArray) {
  return resultArray.every(element => element === 'failed')
}

module.exports.anyFailed = function (resultArray) {
  return resultArray.some(element => element === 'failed')
}
