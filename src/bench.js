const { getCommit } = require('./commit')
const core = require('@actions/core')

const { SimpleMetricResult } = require('./types')
const { CompleteBenchmark } = require('./types')
const { BenchmarkInfo } = require('./types')

module.exports.createCurrBench = function (config) {
  const currBenchResJson = config.currBenchResJson
  const benchInfoJson = currBenchResJson.benchInfo
  core.debug('Complete JSON: ' + JSON.stringify(currBenchResJson))
  const benchInfo = new BenchmarkInfo(
    benchInfoJson.executionTime,
    benchInfoJson.parametrization,
    benchInfoJson.otherInfo
  )
  core.debug('BenchInfo: ' + JSON.stringify(benchInfo))
  const metricResults = currBenchResJson.results.map(
    item => new SimpleMetricResult(item.name, item.value, item.unit)
  )

  core.debug('MetricResults: ' + JSON.stringify(metricResults))
  const commit = getCommit()
  core.debug('Commit info: ' + JSON.stringify(commit))
  return new CompleteBenchmark(
    config.benchName,
    benchInfo,
    metricResults,
    commit
  )
}

module.exports.checkIfNthPreviousBenchExists = function (n, benchName) {
  return 'yo'
}

module.exports.createPrevBench = function (config) {
  return 'createPrevBench'
}
