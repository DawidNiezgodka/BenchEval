const { getCommit, getCommitReplacementWhenTriggeredByScheduledEvent } = require('./commit')
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

  const metricResults = currBenchResJson.results.map(item => {
    const numericValue = Number(item.value);
    if (isNaN(numericValue)) {
      console.error(`Value for ${item.name} is not a number.`);
      return null;
    }
    return new SimpleMetricResult(item.name, numericValue, item.unit);
  }).filter(result => result !== null);

  let commit = getCommit()
  core.debug(`commit: ${JSON.stringify(commit)}`);
  // if commit is null or undefined, then we will add
  // information that the workflow was run by scheduled event
  // and not by a commit
  if (commit === null || commit === undefined) {
    commit = getCommitReplacementWhenTriggeredByScheduledEvent(config.runId)
  }
  const completeBenchmark = new CompleteBenchmark(
    config.benchmarkGroupName,
    benchInfo,
    metricResults,
    commit
  )
  core.debug('--- end createCurrBench ---')
  return completeBenchmark;
}
