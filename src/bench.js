const { getCommit } = require('./commit')
const core = require('@actions/core')

const { SimpleMetricResult } = require('./types')
const { CompleteBenchmark } = require('./types')
const { BenchmarkInfo } = require('./types')

module.exports.createCurrBench = function (config) {
  core.debug('--- start createCurrBench ---')
  let currBenchResJson;
  if (config.subsetOfBenchRes) {
    currBenchResJson = config.subsetOfBenchRes;
  } else {
    currBenchResJson = config.currBenchResJson
  }
  const benchInfoJson = currBenchResJson.benchInfo
  const benchInfo = new BenchmarkInfo(
    benchInfoJson.executionTime,
    benchInfoJson.parametrization,
    benchInfoJson.otherInfo
  )
  // const metricResults = currBenchResJson.results.map(
  //   item => new SimpleMetricResult(item.name, item.value, item.unit)
  // )
  const metricResults = currBenchResJson.results.map(item => {
    const numericValue = Number(item.value);
    if (isNaN(numericValue)) {
      console.error(`Value for ${item.name} is not a number.`);
      return null;
    }
    return new SimpleMetricResult(item.name, numericValue, item.unit);
  }).filter(result => result !== null);



  const commit = getCommit()
  const completeBenchmark = new CompleteBenchmark(
    config.benchmarkGroupName,
    benchInfo,
    metricResults,
    commit
  )
  core.debug('--- end createCurrBench ---')
  return completeBenchmark;
}
