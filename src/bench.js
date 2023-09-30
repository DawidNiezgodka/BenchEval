const { getCommit } = require('./commit')

const { SimpleMetricResult } = require('./types')
const { CompleteBenchmark } = require('./types')
const { BenchmarkInfo } = require('./types')

module.exports.createCurrBench = function (config) {
  const currBenchResJson = config.currBenchResJson
  const benchInfoJson = currBenchResJson.benchInfo
  console.log('Complete JSON: ' + JSON.stringify(currBenchResJson))
  const benchInfo = new BenchmarkInfo(
    benchInfoJson.executionTime,
    benchInfoJson.parametrization,
    benchInfoJson.otherInfo
  )
  console.log('BenchInfo: ' + JSON.stringify(benchInfo))
  const metricResults = currBenchResJson.results.map(
    item => new SimpleMetricResult(item.name, item.value, item.unit)
  )

  console.log('MetricResults: ' + JSON.stringify(metricResults))
  const commit = getCommit()
  return new CompleteBenchmark(
    config.benchName,
    benchInfo,
    metricResults,
    commit
  )
}
