const { getCommit } = require('./commit')

const { SimpleMetricResult } = require('./types')
const { CompleteBenchmark } = require('./types')
const { BenchmarkInfo } = require('./types')

module.exports.createCurrBench = function (config) {
  const currBenchResJson = config.currBenchResJson
  const benchInfoJson = currBenchResJson.benchInfo
  console.log('currBenchResJson: ' + JSON.stringify(benchInfoJson))
  const benchInfo = new BenchmarkInfo(
    benchInfoJson.executionTime,
    benchInfoJson.parametrization,
    benchInfoJson.otherInfo
  )
  const metricResults = currBenchResJson.results.map(
    item => new SimpleMetricResult(item.name, item.value, item.unit)
  )
  const commit = getCommit()
  return new CompleteBenchmark(
    config.benchName,
    benchInfo,
    metricResults,
    commit
  )
}
